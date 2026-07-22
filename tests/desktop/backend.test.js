"use strict";

/**
 * Desktop backend unit tests (no Electron window required).
 * Run: node --test tests/desktop/backend.test.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, describe, before, after } = require("node:test");
const { PDFDocument } = require("pdf-lib");

const {
  BackendService,
  snapshotOutputDir,
  resolveLibreOfficeOutput,
  pdfBytesLookEncrypted,
  isEncryptedPdfMessage,
  parsePageRanges,
  sanitizeOfficeExtension,
  officeConvertTarget,
  JobCancelledError
} = require("../../desktop/backend.js");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function writeBlankPdf(filePath, pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage([200, 200]);
  }
  fs.writeFileSync(filePath, await doc.save());
}

describe("pdfBytesLookEncrypted", () => {
  test("detects /Encrypt marker", () => {
    const sample = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n");
    assert.equal(pdfBytesLookEncrypted(sample), true);
  });

  test("plain PDF is not encrypted", () => {
    const sample = Buffer.from("%PDF-1.4 no crypto here");
    assert.equal(pdfBytesLookEncrypted(sample), false);
  });
});

describe("isEncryptedPdfMessage", () => {
  test("matches common encrypted wording", () => {
    assert.equal(isEncryptedPdfMessage("Input document is encrypted"), true);
    assert.equal(isEncryptedPdfMessage("需要密碼"), true);
    assert.equal(isEncryptedPdfMessage("PDF 已加密"), true);
    assert.equal(isEncryptedPdfMessage("parse failed"), false);
  });
});

describe("parsePageRanges", () => {
  test("empty text returns all pages", () => {
    assert.deepEqual(parsePageRanges("", 3), [[0, 1, 2]]);
  });

  test("parses ranges and clips to page count", () => {
    assert.deepEqual(parsePageRanges("1-2,5", 4), [[0, 1]]);
  });

  test("rejects inverted ranges", () => {
    assert.deepEqual(parsePageRanges("5-1", 10), []);
  });
});

describe("LibreOffice output resolution", () => {
  test("prefers expected stem name", () => {
    const dir = tempDir("sl-lo-");
    try {
      const before = snapshotOutputDir(dir);
      const expected = path.join(dir, "My Report.final.pdf");
      fs.writeFileSync(expected, "%PDF");
      const found = resolveLibreOfficeOutput(dir, "My Report.final.docx", "pdf", before);
      assert.equal(found, expected);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("finds renamed output with similar stem", () => {
    const dir = tempDir("sl-lo2-");
    try {
      const before = snapshotOutputDir(dir);
      const alt = path.join(dir, "weird_name.pdf");
      fs.writeFileSync(alt, "%PDF");
      const found = resolveLibreOfficeOutput(dir, "weird name.xlsx", "pdf", before);
      assert.equal(found, alt);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when no output appears", () => {
    const dir = tempDir("sl-lo3-");
    try {
      const before = snapshotOutputDir(dir);
      assert.throws(
        () => resolveLibreOfficeOutput(dir, "a.docx", "pdf", before),
        /找不到輸出檔/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("office convert targets", () => {
  test("maps extensions to LibreOffice filters", () => {
    assert.equal(sanitizeOfficeExtension("DOCX"), "docx");
    assert.equal(officeConvertTarget("xlsx"), "xlsx:Calc MS Excel 2007 XML");
    assert.throws(() => sanitizeOfficeExtension("pdf"), /Unsupported Office format/);
  });
});

describe("BackendService jobs", () => {
  let outDir;

  before(() => {
    outDir = tempDir("sl-jobs-");
  });

  after(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  test("cancel queued job marks cancelled", () => {
    const backend = new BackendService({ defaultOutputDir: outDir });
    const job = backend.enqueue({
      type: "pdf-merge",
      inputPaths: [],
      outputDir: outDir,
      options: {}
    });
    // Force stay queued: mark running so runNext won't complete weirdly —
    // actually empty merge fails. Cancel while queued before async run.
    const backend2 = new BackendService({ defaultOutputDir: outDir });
    backend2.running = true; // block worker
    const queued = backend2.enqueue({
      type: "pdf-merge",
      inputPaths: [path.join(outDir, "missing.pdf")],
      outputDir: outDir,
      options: {}
    });
    assert.equal(queued.status, "queued");
    const cancelled = backend2.cancelJob(queued.id);
    assert.equal(cancelled.status, "cancelled");
    assert.match(cancelled.error, /取消/);
  });

  test("delete running job is rejected", async () => {
    const backend = new BackendService({ defaultOutputDir: outDir });
    backend.running = true;
    const job = backend.enqueue({
      type: "pdf-compress",
      inputPaths: [],
      outputDir: outDir,
      options: {}
    });
    // Manually flip to running
    const internal = backend.jobs.find((item) => item.id === job.id);
    internal.status = "running";
    assert.throws(() => backend.deleteJob(job.id), /執行中/);
  });

  test("cancel running job sets flag and ends cancelled", async () => {
    const backend = new BackendService({ defaultOutputDir: outDir });
    const pdfPath = path.join(outDir, "cancel-me.pdf");
    await writeBlankPdf(pdfPath, 3);

    // Patch runJob to wait until cancelled
    backend.runJob = async (job) => {
      let waited = 0;
      while (!job.cancelRequested && waited < 50) {
        await new Promise((r) => setTimeout(r, 20));
        waited += 1;
      }
      if (job.cancelRequested) {
        throw new JobCancelledError();
      }
    };

    const job = backend.enqueue({
      type: "pdf-compress",
      inputPaths: [pdfPath],
      outputDir: outDir,
      options: {}
    });

    // Wait until running
    for (let i = 0; i < 50 && backend.jobs[0].status === "queued"; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    backend.cancelJob(job.id);

    for (let i = 0; i < 100; i += 1) {
      if (backend.jobs[0].status === "cancelled") {
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(backend.jobs[0].status, "cancelled");
  });

  test("pdf-merge produces merged.pdf", async () => {
    const backend = new BackendService({ defaultOutputDir: outDir });
    const a = path.join(outDir, "a.pdf");
    const b = path.join(outDir, "b.pdf");
    await writeBlankPdf(a, 1);
    await writeBlankPdf(b, 1);
    const jobOut = path.join(outDir, "merge-out");
    fs.mkdirSync(jobOut, { recursive: true });

    backend.enqueue({
      type: "pdf-merge",
      inputPaths: [a, b],
      outputDir: jobOut,
      options: {}
    });

    for (let i = 0; i < 100; i += 1) {
      const job = backend.jobs[0];
      if (job.status === "done" || job.status === "failed") {
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    const job = backend.jobs[0];
    assert.equal(job.status, "done", job.error || job.log.join("\n"));
    assert.ok(fs.existsSync(path.join(jobOut, "merged.pdf")));
  });

  test("encrypted-looking PDF fails compress with friendly message", async () => {
    const backend = new BackendService({ defaultOutputDir: outDir });
    const enc = path.join(outDir, "locked.pdf");
    fs.writeFileSync(enc, "%PDF-1.4\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n");
    const jobOut = path.join(outDir, "enc-out");
    fs.mkdirSync(jobOut, { recursive: true });

    backend.enqueue({
      type: "pdf-compress",
      inputPaths: [enc],
      outputDir: jobOut,
      options: {}
    });

    for (let i = 0; i < 100; i += 1) {
      if (backend.jobs[0].status === "done" || backend.jobs[0].status === "failed") {
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    const job = backend.jobs[0];
    assert.equal(job.status, "failed");
    assert.match(job.error, /加密|解密/);
  });
});
