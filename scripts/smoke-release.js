"use strict";

/**
 * Release smoke checks for desktop BackendService + unit tests.
 * Usage: node scripts/smoke-release.js
 *
 * Does not build installers. Runs local conversions against tools/ and sample files.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { BackendService, writeTextDocx } = require("../desktop/backend");

const root = path.resolve(__dirname, "..");
const fixtureDir = path.join(root, "smoke-temp", "release-queue-check", "input");
const outRoot = path.join(root, "smoke-temp", "release-smoke-out");
const version = require("../package.json").version;
const skipUnitTests = process.argv.includes("--skip-tests");

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK   ${message}`);
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`missing ${label}: ${filePath}`);
    return false;
  }
  return true;
}

async function waitJob(backend, jobId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = backend.jobs.find((item) => item.id === jobId);
    if (!job) {
      throw new Error(`job disappeared: ${jobId}`);
    }
    if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`job timeout: ${jobId}`);
}

async function runJob(backend, payload, label) {
  const publicJob = await backend.enqueue(payload);
  const job = await waitJob(backend, publicJob.id);
  if (job.status !== "done") {
    fail(`${label}: status=${job.status} error=${job.error || "(none)"}`);
    return null;
  }
  if (!job.outputPaths.length) {
    fail(`${label}: no output paths`);
    return null;
  }
  for (const out of job.outputPaths) {
    if (!fs.existsSync(out)) {
      fail(`${label}: missing file ${out}`);
      return null;
    }
  }
  ok(`${label} -> ${job.outputPaths.map((p) => path.basename(p)).join(", ")}`);
  return job;
}

function runUnitTests() {
  console.log("\n=== unit tests (npm test) ===");
  const result = spawnSync("npm", ["test"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    fail("unit tests failed");
    return false;
  }
  ok("unit tests");
  return true;
}

function syntaxChecks() {
  console.log("\n=== syntax checks ===");
  const files = [
    "frontend/app.js",
    "desktop/main.js",
    "desktop/preload.js",
    "desktop/backend.js",
    "scripts/smoke-release.js"
  ];
  for (const file of files) {
    const result = spawnSync("node", ["--check", path.join(root, file)], { stdio: "pipe" });
    if (result.status !== 0) {
      fail(`syntax ${file}: ${result.stderr.toString()}`);
      return false;
    }
    ok(`syntax ${file}`);
  }
  return true;
}

const { createCanvas } = require("@napi-rs/canvas");
const { PDFDocument } = require("pdf-lib");

/** One-page PDF via pdf-lib (already a project dependency). */
async function writeMinimalPdf(filePath) {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const bytes = await doc.save();
  fs.writeFileSync(filePath, bytes);
}

function writeOcrTextPng(filePath) {
  const canvas = createCanvas(1400, 900);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  context.font = "bold 76px Arial, sans-serif";
  context.fillText("SWIFTLOCAL OCR SMOKE", 90, 220);
  context.font = 'bold 88px "Heiti TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';
  context.fillText("香港特別行政區", 90, 410);
  context.font = "68px Arial, sans-serif";
  context.fillText("HONG KONG", 90, 570);
  context.fillText("HK$1,280.00", 90, 720);
  fs.writeFileSync(filePath, canvas.toBuffer("image/png"));
}

async function writeOcrScanPdf(filePath) {
  const pngPath = path.join(path.dirname(filePath), "ocr-text.png");
  if (!fs.existsSync(pngPath)) writeOcrTextPng(pngPath);
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(fs.readFileSync(pngPath));
  const page = doc.addPage([700, 450]);
  page.drawImage(image, { x: 0, y: 0, width: 700, height: 450 });
  fs.writeFileSync(filePath, await doc.save());
}

/** Short silent WAV (PCM 8kHz mono). */
function writeMinimalWav(filePath, seconds = 0.1) {
  const sampleRate = 8000;
  const numSamples = Math.max(1, Math.floor(sampleRate * seconds));
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(filePath, buffer);
}

async function ensureSmokeFixtures() {
  fs.mkdirSync(fixtureDir, { recursive: true });
  const aPdf = path.join(fixtureDir, "a.pdf");
  const bPdf = path.join(fixtureDir, "b.pdf");
  const ocrPng = path.join(fixtureDir, "ocr-text.png");
  const ocrPdf = path.join(fixtureDir, "ocr-scan.pdf");
  const officeDocx = path.join(fixtureDir, "office-smoke.docx");
  const tone = path.join(fixtureDir, "tone.wav");

  const force = process.argv.includes("--refresh-fixtures");
  const needs = (file, minBytes = 20) =>
    force || !fs.existsSync(file) || fs.statSync(file).size < minBytes;

  // pdf-lib PDFs are typically >300 bytes; tiny/hand-rolled files are regenerated.
  if (needs(aPdf, 300)) {
    await writeMinimalPdf(aPdf);
    ok("generated fixture a.pdf");
  }
  if (needs(bPdf, 300)) {
    await writeMinimalPdf(bPdf);
    ok("generated fixture b.pdf");
  }
  if (needs(ocrPng, 50)) {
    writeOcrTextPng(ocrPng);
    ok("generated fixture ocr-text.png");
  }
  if (needs(ocrPdf, 300)) {
    await writeOcrScanPdf(ocrPdf);
    ok("generated fixture ocr-scan.pdf");
  }
  if (needs(officeDocx, 300)) {
    writeTextDocx(officeDocx, "SwiftLocal Word to PDF smoke\nInvoice No. 12345");
    ok("generated fixture office-smoke.docx");
  }
  if (needs(tone, 44)) {
    writeMinimalWav(tone);
    ok("generated fixture tone.wav");
  }
  return { aPdf, bPdf, ocrPng, ocrPdf, officeDocx, tone };
}

async function conversionSmoke() {
  console.log("\n=== conversion smoke ===");
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });

  const { aPdf, bPdf, ocrPng, ocrPdf, officeDocx, tone } = await ensureSmokeFixtures();
  if (![aPdf, bPdf, ocrPng, ocrPdf, officeDocx, tone].every((file) => requireFile(file, "fixture"))) {
    return;
  }

  const toolsConfig = path.join(outRoot, "tools.json");
  const jobsState = path.join(outRoot, "jobs-state.json");
  const backend = new BackendService({
    configPath: toolsConfig,
    jobsStatePath: jobsState,
    defaultOutputDir: path.join(outRoot, "jobs")
  });
  const tools = await backend.detectTools();
  console.log(
    "tools:",
    Object.entries(tools)
      .map(([key, tool]) => `${key}=${tool.available ? tool.source || "yes" : "no"}`)
      .join(", ")
  );

  const out = (name) => path.join(outRoot, name);
  fs.mkdirSync(out("merge"), { recursive: true });
  fs.mkdirSync(out("split"), { recursive: true });
  fs.mkdirSync(out("rotate"), { recursive: true });
  fs.mkdirSync(out("compress"), { recursive: true });
  fs.mkdirSync(out("encrypt"), { recursive: true });
  fs.mkdirSync(out("decrypt"), { recursive: true });
  fs.mkdirSync(out("ocr"), { recursive: true });
  fs.mkdirSync(out("media"), { recursive: true });
  fs.mkdirSync(out("ocr-pdf"), { recursive: true });
  fs.mkdirSync(out("office"), { recursive: true });

  await runJob(
    backend,
    { type: "pdf-merge", inputPaths: [aPdf, bPdf], outputDir: out("merge"), options: {} },
    "pdf-merge"
  );
  await runJob(
    backend,
    { type: "pdf-split", inputPaths: [aPdf], outputDir: out("split"), options: { pages: "1" } },
    "pdf-split"
  );
  await runJob(
    backend,
    { type: "pdf-rotate", inputPaths: [aPdf], outputDir: out("rotate"), options: { angle: "90" } },
    "pdf-rotate"
  );
  await runJob(
    backend,
    { type: "pdf-compress", inputPaths: [aPdf], outputDir: out("compress"), options: {} },
    "pdf-compress"
  );

  await runJob(
    backend,
    {
      type: "image-convert",
      inputPaths: [ocrPng],
      outputDir: out("image-convert"),
      options: {
        extension: "webp",
        imageOps: JSON.stringify([{
          rotation: 0,
          flip: "horizontal",
          crop: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
          ocrRegion: null
        }]),
        quality: "0.8",
        maxWidth: "700",
        maxHeight: "700",
        keepRatio: "true",
        watermarkText: "SwiftLocal",
        watermarkPosition: "se"
      }
    },
    "image-convert visual workspace ops"
  );

  if (tools.qpdf && tools.qpdf.available) {
    const encDir = out("encrypt");
    const encJob = await runJob(
      backend,
      {
        type: "pdf-encrypt",
        inputPaths: [aPdf],
        outputDir: encDir,
        options: { password: "smoke-test-pass" }
      },
      "pdf-encrypt"
    );
    if (encJob && encJob.outputPaths[0]) {
      await runJob(
        backend,
        {
          type: "pdf-decrypt",
          inputPaths: [encJob.outputPaths[0]],
          outputDir: out("decrypt"),
          options: { password: "smoke-test-pass" }
        },
        "pdf-decrypt"
      );
    }
  } else {
    console.log("SKIP pdf-encrypt/decrypt (qpdf not available)");
  }

  if (tools.tesseract && tools.tesseract.available) {
    await runJob(
      backend,
      {
        type: "ocr-image",
        inputPaths: [ocrPng],
        outputDir: out("ocr"),
        options: {
          language: "chi_tra+eng",
          imageOps: JSON.stringify([{
            rotation: 0,
            flip: "none",
            crop: null,
            ocrRegion: { x: 0, y: 0.05, width: 1, height: 0.82 }
          }])
        }
      },
      "ocr-image selected region chi_tra+eng"
    );
    await runJob(
      backend,
      {
        type: "ocr-pdf",
        inputPaths: [ocrPdf],
        outputDir: out("ocr-pdf"),
        options: { language: "chi_tra+eng", maxPages: "2" }
      },
      "ocr-pdf"
    );
  } else {
    console.log("SKIP ocr (tesseract not available)");
  }

  if (tools.libreOffice && tools.libreOffice.available) {
    await runJob(
      backend,
      {
        type: "office-to-pdf",
        inputPaths: [officeDocx],
        outputDir: out("office"),
        options: {}
      },
      "office-to-pdf (DOCX)"
    );
  } else {
    console.log("SKIP office-to-pdf (LibreOffice not available)");
  }

  if (tools.ffmpeg && tools.ffmpeg.available) {
    const mp4Job = await runJob(
      backend,
      {
        type: "media-convert",
        inputPaths: [tone],
        outputDir: out("media"),
        options: { extension: "mp4", audioBitrate: "128k" }
      },
      "media-convert MP4 fixture"
    );
    if (mp4Job && mp4Job.outputPaths[0]) {
      await runJob(
        backend,
        {
          type: "media-convert",
          inputPaths: [mp4Job.outputPaths[0]],
          outputDir: out("media"),
          options: { extension: "mp3", audioBitrate: "128k" }
        },
        "media-convert MP4 to MP3"
      );
    }
  } else {
    console.log("SKIP media-convert (ffmpeg not available)");
  }

  // Cancel queued job
  backend.running = true;
  const queued = await backend.enqueue({
    type: "pdf-compress",
    inputPaths: [aPdf],
    outputDir: out("compress"),
    options: {}
  });
  backend.running = false;
  const cancelled = backend.cancelJob(queued.id);
  if (!cancelled || cancelled.status !== "cancelled") {
    fail("cancel queued job");
  } else {
    ok("cancel queued job");
  }
}

async function main() {
  console.log(`SwiftLocal release smoke v${version}`);
  console.log(`root: ${root}`);

  syntaxChecks();
  if (skipUnitTests) {
    console.log("\n=== unit tests skipped (already run separately) ===");
  } else {
    const testsOk = runUnitTests();
    if (!testsOk) {
      process.exit(1);
    }
  }
  await conversionSmoke();

  if (process.exitCode && process.exitCode !== 0) {
    console.error("\nRelease smoke FAILED");
    process.exit(process.exitCode);
  }
  console.log("\nRelease smoke PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
