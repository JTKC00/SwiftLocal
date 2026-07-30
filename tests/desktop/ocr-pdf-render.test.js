"use strict";

/**
 * Real PDF→PNG render + optional OCR PDF integration tests.
 * Does not mock renderPdfPagesToPng / pdfjs / @napi-rs/canvas.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, describe, test } = require("node:test");

const {
  BackendService,
  renderPdfPagesToPng,
  loadPdfJsCompatibleCanvas,
  annotatePdfOcrStageError,
  ERROR_CODES
} = require("../../desktop/backend.js");
const { classifyJobError } = require("../../desktop/job-errors.js");

const FIXTURE = path.resolve(__dirname, "..", "fixtures", "ocr-one-page.pdf");
const temporaryDirectories = [];

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(dir);
  return dir;
}

function findBundledTesseract() {
  const root = path.resolve(__dirname, "..", "..", "tools", "tesseract");
  const win = path.join(root, "tesseract.exe");
  const unix = path.join(root, "tesseract");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  return "";
}

after(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("PDF OCR render pipeline", () => {
  test("fixture one-page PDF exists", () => {
    assert.ok(fs.existsSync(FIXTURE), `missing fixture: ${FIXTURE}`);
    assert.ok(fs.statSync(FIXTURE).size > 200);
  });

  test("loadPdfJsCompatibleCanvas returns createCanvas", () => {
    const binding = loadPdfJsCompatibleCanvas();
    assert.equal(typeof binding.createCanvas, "function");
    assert.ok(binding.version);
  });

  test("annotatePdfOcrStageError sets pdf_render_failed with stage metadata", () => {
    const wrapped = annotatePdfOcrStageError(new Error("Value is none of these types `String`, `Path`"), {
      stage: "pdf_page_render",
      pageNumber: 1,
      pdfjsVersion: "5.6.205",
      canvasVersion: "1.0.2"
    });
    assert.equal(wrapped.errorCode, ERROR_CODES.PDF_RENDER_FAILED);
    assert.equal(wrapped.stage, "pdf_page_render");
    assert.equal(wrapped.pageNumber, 1);
    assert.match(wrapped.message, /pdf_page_render/);
    assert.match(wrapped.message, /pdfjs=5\.6\.205/);
    assert.match(wrapped.message, /canvas=1\.0\.2/);
    const classified = classifyJobError(wrapped, { type: "ocr-pdf" });
    assert.equal(classified.code, ERROR_CODES.PDF_RENDER_FAILED);
  });

  test("renderPdfPagesToPng produces non-empty PNG (real pdfjs + canvas)", async () => {
    const pageDir = tempDir("sl-ocr-render-");
    const job = { cancelled: false, log: [] };
    const images = await renderPdfPagesToPng(FIXTURE, pageDir, 2, job);
    assert.equal(images.length, 1);
    assert.ok(fs.existsSync(images[0]));
    const size = fs.statSync(images[0]).size;
    assert.ok(size > 100, `PNG too small: ${size}`);
    // PNG magic
    const header = fs.readFileSync(images[0]).subarray(0, 8);
    assert.deepEqual(
      Array.from(header),
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    );
  });

  test("renderPdfPagesToPng handles path-heavy PDFs without Path type mismatch", async () => {
    const candidates = [
      path.resolve(__dirname, "..", "..", "smoke-temp", "output", "desktop-office-test", "libreoffice-sample.pdf"),
      path.resolve(__dirname, "..", "..", "smoke-temp", "ir56b_ay.pdf")
    ];
    const sample = candidates.find((file) => fs.existsSync(file));
    if (!sample) {
      // Environment without smoke-temp samples — fixture-only coverage remains.
      return;
    }
    const pageDir = tempDir("sl-ocr-path-");
    const images = await renderPdfPagesToPng(sample, pageDir, 1, { cancelled: false, log: [] });
    assert.equal(images.length, 1);
    assert.ok(fs.statSync(images[0]).size > 100);
  });

  test("ocr-pdf job completes to TXT when bundled Tesseract is available", async () => {
    const tesseract = findBundledTesseract();
    if (!tesseract) {
      return;
    }
    const outputDir = tempDir("sl-ocr-pdf-job-");
    const backend = new BackendService({
      configPath: path.join(outputDir, "tools.json"),
      jobsStatePath: path.join(outputDir, "jobs-state.json"),
      defaultOutputDir: outputDir
    });
    backend.tools = {
      tesseract: { available: true, path: tesseract, version: "test", source: "test" }
    };

    const queued = await backend.enqueue({
      type: "ocr-pdf",
      inputPaths: [FIXTURE],
      outputDir,
      options: { language: "eng", maxPages: 1 }
    });

    const deadline = Date.now() + 120_000;
    let finalJob = backend.getJobs().find((item) => item.id === queued.id);
    while (finalJob && !["done", "failed", "cancelled"].includes(finalJob.status) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      finalJob = backend.getJobs().find((item) => item.id === queued.id);
    }

    assert.ok(finalJob, "job missing");
    assert.equal(finalJob.status, "done", finalJob.error || "ocr-pdf failed");
    assert.ok(Array.isArray(finalJob.outputPaths) && finalJob.outputPaths.length >= 1);
    const firstOut = finalJob.outputPaths[0];
    const textPath = typeof firstOut === "string" ? firstOut : firstOut && firstOut.path;
    assert.ok(textPath && fs.existsSync(textPath), `missing OCR output: ${textPath}`);
    const text = fs.readFileSync(textPath, "utf8");
    assert.ok(text.trim().length > 0, "OCR text empty");
    // Intermediate page dir must be cleaned after success.
    const pageDir = path.join(outputDir, `${path.parse(FIXTURE).name}_ocr_pages`);
    assert.equal(fs.existsSync(pageDir), false, "pageDir should be cleaned up");
  });
});
