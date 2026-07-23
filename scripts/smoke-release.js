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

async function conversionSmoke() {
  console.log("\n=== conversion smoke ===");
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });

  const aPdf = path.join(fixtureDir, "a.pdf");
  const bPdf = path.join(fixtureDir, "b.pdf");
  const ocrPng = path.join(fixtureDir, "ocr.png");
  const tone = path.join(fixtureDir, "tone.wav");

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
