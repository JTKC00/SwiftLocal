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
const { BackendService } = require("../desktop/backend");

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
  const publicJob = backend.enqueue(payload);
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

const zlib = require("node:zlib");
const { PDFDocument } = require("pdf-lib");

/** One-page PDF via pdf-lib (already a project dependency). */
async function writeMinimalPdf(filePath) {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const bytes = await doc.save();
  fs.writeFileSync(filePath, bytes);
}

/** Valid 1×1 RGB PNG built with zlib so Tesseract/libpng accept it. */
function writeMinimalPng(filePath) {
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) {
      c ^= buf[i];
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // filter byte 0 + 3 RGB samples
  const raw = Buffer.from([0, 0, 0, 0]);
  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(filePath, png);
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
  const ocrPng = path.join(fixtureDir, "ocr.png");
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
    writeMinimalPng(ocrPng);
    ok("generated fixture ocr.png");
  }
  if (needs(tone, 44)) {
    writeMinimalWav(tone);
    ok("generated fixture tone.wav");
  }
  return { aPdf, bPdf, ocrPng, tone };
}

async function conversionSmoke() {
  console.log("\n=== conversion smoke ===");
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });

  const { aPdf, bPdf, ocrPng, tone } = await ensureSmokeFixtures();
  if (![aPdf, bPdf, ocrPng, tone].every((file) => requireFile(file, "fixture"))) {
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
        options: { language: "eng" }
      },
      "ocr-image"
    );
    await runJob(
      backend,
      {
        type: "ocr-pdf",
        inputPaths: [aPdf],
        outputDir: out("ocr-pdf"),
        options: { language: "eng", maxPages: "2" }
      },
      "ocr-pdf"
    );
  } else {
    console.log("SKIP ocr (tesseract not available)");
  }

  if (tools.ffmpeg && tools.ffmpeg.available) {
    await runJob(
      backend,
      {
        type: "media-convert",
        inputPaths: [tone],
        outputDir: out("media"),
        options: { extension: "mp3", audioBitrate: "128k" }
      },
      "media-convert mp3"
    );
  } else {
    console.log("SKIP media-convert (ffmpeg not available)");
  }

  // Cancel queued job
  backend.running = true;
  const queued = backend.enqueue({
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
