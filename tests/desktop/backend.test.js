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
  formatProcessError,
  isWindowsStackBufferOverrun,
  removeIncompleteOfficeOutput,
  cleanupLoProfile,
  pdfBytesLookEncrypted,
  isEncryptedPdfMessage,
  parsePageRanges,
  sanitizeOfficeExtension,
  officeConvertTarget,
  buildFfmpegMediaArgs,
  sanitizeMediaBitrate,
  sanitizeGifFps,
  loadJobsState,
  saveJobsState,
  normalizePersistedJob,
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

describe("process error formatter", () => {
  test("maps 3221226505 and signed -1073740791 to 0xC0000409 message", () => {
    assert.equal(isWindowsStackBufferOverrun(3221226505), true);
    assert.equal(isWindowsStackBufferOverrun(-1073740791), true);
    const msg = formatProcessError({ returncode: 3221226505, stderr: "ucrtbase.dll" });
    assert.match(msg, /0xC0000409/);
    assert.match(msg, /意外崩潰/);
    assert.match(msg, /【技術詳情】/);
    assert.doesNotMatch(msg, /^Process exited with code/);
    const signed = formatProcessError({ returncode: -1073740791 });
    assert.match(signed, /0xC0000409/);
  });

  test("timeout and missing output messages", () => {
    assert.match(formatProcessError({ timeout: true, timeoutSeconds: 180 }), /逾時/);
    assert.match(formatProcessError({ outputMissing: true, expectedOutput: "a.docx" }), /未產生輸出檔/);
  });

  test("removes incomplete outputs and cleans profiles", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-lo-"));
    try {
      const tiny = path.join(dir, "a.docx");
      fs.writeFileSync(tiny, "");
      assert.equal(removeIncompleteOfficeOutput(tiny), true);
      assert.equal(fs.existsSync(tiny), false);
      const profile = path.join(dir, "p_lo_profile");
      fs.mkdirSync(path.join(profile, "user"), { recursive: true });
      fs.writeFileSync(path.join(profile, "user", "x"), "y");
      cleanupLoProfile(profile);
      assert.equal(fs.existsSync(profile), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ffmpeg media args", () => {
  test("builds video args with scale bitrate and trim", () => {
    const args = buildFfmpegMediaArgs("in.mp4", "out.mp4", {
      extension: "mp4",
      scale: "1280:720",
      videoBitrate: "2M",
      audioBitrate: "128k",
      start: "1.5",
      duration: "10"
    });
    assert.deepEqual(args.slice(0, 6), ["-y", "-ss", "1.5", "-i", "in.mp4", "-t"]);
    assert.ok(args.includes("10"));
    assert.ok(args.includes("-vf"));
    assert.ok(args.includes("scale=1280:720"));
    assert.ok(args.includes("-b:v"));
    assert.ok(args.includes("2m"));
    assert.ok(args.includes("-b:a"));
    assert.equal(args[args.length - 1], "out.mp4");
  });

  test("audio-only strips video", () => {
    const args = buildFfmpegMediaArgs("in.mp4", "out.mp3", {
      extension: "mp3",
      audioBitrate: "192k"
    });
    assert.ok(args.includes("-vn"));
    assert.ok(args.includes("libmp3lame"));
    assert.ok(!args.includes("-vf"));
  });

  test("gif uses fps filter", () => {
    const args = buildFfmpegMediaArgs("in.mp4", "out.gif", {
      extension: "gif",
      gifFps: "12",
      scale: "-2:480"
    });
    assert.ok(args.includes("-vf"));
    const vf = args[args.indexOf("-vf") + 1];
    assert.match(vf, /fps=12/);
    assert.match(vf, /scale=-2:480/);
  });

  test("rejects bad bitrate and fps", () => {
    assert.throws(() => sanitizeMediaBitrate("fast", "videoBitrate"), /Invalid/);
    assert.throws(() => sanitizeGifFps("99"), /1 and 30/);
  });
});

describe("job queue order", () => {
  test("processes oldest queued job first (FIFO)", async () => {
    const dir = tempDir("sl-fifo-");
    try {
      const backend = new BackendService({
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs-state.json"),
        defaultOutputDir: dir
      });
      backend.running = true; // block auto-run while enqueueing
      const order = [];
      backend.runJob = async (job) => {
        order.push(job.id);
      };
      const a = backend.enqueue({ type: "pdf-compress", inputPaths: [path.join(dir, "x")], outputDir: dir, options: {} });
      const b = backend.enqueue({ type: "pdf-compress", inputPaths: [path.join(dir, "y")], outputDir: dir, options: {} });
      // Restore inputs so jobs stay valid if normalized later
      backend.jobs.forEach((job) => {
        job.inputPaths = [path.join(dir, "dummy")];
      });
      fs.writeFileSync(path.join(dir, "dummy"), "x");
      backend.running = false;
      await backend.runNext();
      // wait for both
      for (let i = 0; i < 50 && order.length < 2; i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.deepEqual(order, [a.id, b.id]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("job persistence", () => {
  test("running jobs become failed on reload; queued resume", () => {
    const dir = tempDir("sl-persist-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const pdfPath = path.join(dir, "a.pdf");
      fs.writeFileSync(pdfPath, "%PDF-1.4");
      saveJobsState(statePath, [
        {
          id: "run1",
          type: "pdf-compress",
          inputPaths: [pdfPath],
          outputDir: dir,
          options: {},
          status: "running",
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          finishedAt: null,
          outputPaths: [],
          log: [],
          error: ""
        },
        {
          id: "q1",
          type: "pdf-compress",
          inputPaths: [pdfPath],
          outputDir: dir,
          options: {},
          status: "queued",
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
          outputPaths: [],
          log: [],
          error: ""
        }
      ]);
      const restored = loadJobsState(statePath);
      const running = restored.find((j) => j.id === "run1");
      const queued = restored.find((j) => j.id === "q1");
      assert.equal(running.status, "failed");
      assert.match(running.error, /重啟|中斷/);
      assert.equal(queued.status, "queued");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("BackendService reloads state from disk", () => {
    const dir = tempDir("sl-persist2-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const configPath = path.join(dir, "tools.json");
      const pdfPath = path.join(dir, "b.pdf");
      fs.writeFileSync(pdfPath, "%PDF-1.4");
      saveJobsState(statePath, [
        {
          id: "done1",
          type: "pdf-merge",
          inputPaths: [pdfPath],
          outputDir: dir,
          options: {},
          status: "done",
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: new Date().toISOString(),
          outputPaths: [pdfPath],
          log: ["ok"],
          error: ""
        }
      ]);
      const backend = new BackendService({
        configPath,
        jobsStatePath: statePath,
        defaultOutputDir: dir
      });
      assert.equal(backend.jobs.length, 1);
      assert.equal(backend.jobs[0].status, "done");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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
