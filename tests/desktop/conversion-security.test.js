"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { PDFDocument } = require("pdf-lib");
const { BackendService, JobCancelledError, runImageTextOcr, runProcess } = require("../../desktop/backend.js");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-conversion-security-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function backendIn(directory) {
  return new BackendService({
    configPath: path.join(directory, "tools.json"),
    jobsStatePath: path.join(directory, "jobs-state.json"),
    defaultOutputDir: directory
  });
}

function jobFor(type, directory, inputPath, options) {
  return {
    id: "security-regression",
    type,
    inputPaths: [inputPath],
    outputDir: directory,
    options,
    status: "queued",
    createdAt: new Date().toISOString(),
    outputPaths: [],
    log: [],
    error: "",
    cancelRequested: false
  };
}

test("image OCR preserves an existing sparse-name file and publishes the better result", async (t) => {
  const directory = fixture(t);
  const input = path.join(directory, "report.png");
  const outputBase = path.join(directory, "report_ocr");
  const existing = `${outputBase}_sparse.txt`;
  fs.writeFileSync(existing, "unrelated user document");
  const intermediateFiles = [];
  const runTesseract = async (_file, args) => {
    const output = `${args[args.indexOf(input) + 1]}.txt`;
    intermediateFiles.push(output);
    const text = args[args.indexOf("--psm") + 1] === "6" ? "hello" : "這是完整而清晰的文字辨識結果";
    fs.writeFileSync(output, text);
    return { output: "OCR completed" };
  };
  await runImageTextOcr("tesseract", input, outputBase, "eng", "", {}, runTesseract);
  assert.equal(fs.readFileSync(existing, "utf8"), "unrelated user document");
  assert.equal(fs.readFileSync(`${outputBase}.txt`, "utf8"), "這是完整而清晰的文字辨識結果");
  assert.equal(intermediateFiles.length, 2);
  for (const file of intermediateFiles) assert.equal(fs.existsSync(path.dirname(file)), false);
});

test("image OCR keeps the primary result when the optional sparse pass fails", async (t) => {
  const directory = fixture(t);
  const input = path.join(directory, "scan.png");
  const outputBase = path.join(directory, "scan_ocr");
  let scratch;
  const runTesseract = async (_file, args) => {
    const output = `${args[args.indexOf(input) + 1]}.txt`;
    scratch = path.dirname(output);
    if (args[args.indexOf("--psm") + 1] === "11") throw new Error("optional sparse failure");
    fs.writeFileSync(output, "primary text");
    return { output: "primary completed" };
  };
  await runImageTextOcr("tesseract", input, outputBase, "eng", "", {}, runTesseract);
  assert.equal(fs.readFileSync(`${outputBase}.txt`, "utf8"), "primary text");
  assert.equal(fs.existsSync(scratch), false);
});

test("image OCR does not overwrite a final output created while OCR runs", async (t) => {
  const directory = fixture(t);
  const input = path.join(directory, "scan.png");
  const outputBase = path.join(directory, "scan_ocr");
  let scratch;
  const runTesseract = async (_file, args) => {
    const output = `${args[args.indexOf(input) + 1]}.txt`;
    scratch = path.dirname(output);
    fs.writeFileSync(output, "OCR text");
    if (args[args.indexOf("--psm") + 1] === "11") fs.writeFileSync(`${outputBase}.txt`, "new user document");
    return { output: "" };
  };
  await assert.rejects(runImageTextOcr("tesseract", input, outputBase, "eng", "", {}, runTesseract), { code: "EEXIST" });
  assert.equal(fs.readFileSync(`${outputBase}.txt`, "utf8"), "new user document");
  assert.equal(fs.existsSync(scratch), false);
});

test("cancelled sparse OCR cleans scratch files and does not publish a result", async (t) => {
  const directory = fixture(t);
  const input = path.join(directory, "scan.png");
  const outputBase = path.join(directory, "scan_ocr");
  let scratch;
  const runTesseract = async (_file, args) => {
    const output = `${args[args.indexOf(input) + 1]}.txt`;
    scratch = path.dirname(output);
    if (args[args.indexOf("--psm") + 1] === "11") throw new JobCancelledError();
    fs.writeFileSync(output, "primary text");
    return { output: "" };
  };
  await assert.rejects(runImageTextOcr("tesseract", input, outputBase, "eng", "", {}, runTesseract), JobCancelledError);
  assert.equal(fs.existsSync(`${outputBase}.txt`), false);
  assert.equal(fs.existsSync(scratch), false);
});

for (const password of ["  surrounding-space-secret  ", 'embedded"quote secret', '  both"quote secret  ']) {
  test(`failed PDF encryption redacts normalized/quoted passwords (${JSON.stringify(password)})`, async (t) => {
    const directory = fixture(t);
    const input = path.join(directory, "input.pdf");
    fs.writeFileSync(input, "%PDF-1.7\n");
    const backend = backendIn(directory);
    // Node rejects qpdf arguments on every platform, exercising the real failure path.
    backend.tools = { qpdf: { available: true, path: process.execPath } };
    const job = jobFor("pdf-encrypt", directory, input, { password });
    backend.jobs.push(job);
    await backend.runNext();
    assert.equal(job.status, "failed");
    const persisted = JSON.parse(fs.readFileSync(path.join(directory, "jobs-state.json"), "utf8"));
    const diagnostic = backend.buildDiagnosticReport(job.id);
    const records = [persisted.jobs[0], diagnostic.job, backend.getJobs()[0]];
    const variants = [password, password.trim(), password.trim().replace(/"/g, '\\"')];
    for (const record of records) {
      assert.equal(record.options.password, undefined);
      const messages = [record.error, ...record.log].join("\n");
      assert.match(messages, /\[REDACTED\]/);
      for (const variant of variants) assert.equal(messages.includes(variant), false);
    }
  });
}

test("process redaction leaves actual executable arguments unchanged", async () => {
  const password = 'exact" quote secret';
  const result = await runProcess(process.execPath, ["-e", "process.stdout.write(process.argv[1])", "--", password], { options: { password } }, "test tool");
  assert.equal(result.output, password);
});

test("escaped tool stderr is redacted before job history and diagnostics are saved", async (t) => {
  const directory = fixture(t);
  const password = '  quoted" password  ';
  const effective = password.trim();
  const backend = backendIn(directory);
  backend.tools = {};
  const job = jobFor("pdf-encrypt", directory, "unused.pdf", { password });
  backend.runJob = (running) => runProcess(process.execPath, [
    "-e", "process.stderr.write(JSON.stringify(process.argv[1])); process.exit(2)", "--", effective
  ], running, "test tool");
  backend.jobs.push(job);
  await backend.runNext();
  assert.equal(job.status, "failed");
  const saved = JSON.parse(fs.readFileSync(path.join(directory, "jobs-state.json"), "utf8")).jobs[0];
  for (const record of [saved, backend.buildDiagnosticReport(job.id).job]) {
    const messages = [record.error, ...record.log].join("\n");
    assert.match(messages, /stderr=.*\[REDACTED\]/);
    assert.equal(messages.includes(effective), false);
    assert.equal(messages.includes(JSON.stringify(effective).slice(1, -1)), false);
  }
});

test("PDF to Office failure preserves an unrelated tiny output", async (t) => {
  const directory = fixture(t);
  const input = path.join(directory, "report.pdf");
  fs.writeFileSync(input, "%PDF-1.7\n");
  const existing = path.join(directory, "report.xlsx");
  fs.writeFileSync(existing, "keep this user file");
  const backend = backendIn(directory);
  backend.tools = { libreOffice: { available: true, path: process.execPath } };
  const job = jobFor("pdf-to-office", directory, input, { extension: "xlsx" });
  await assert.rejects(backend.runPdfToOffice(job));
  assert.equal(fs.readFileSync(existing, "utf8"), "keep this user file");
  assert.equal(fs.readdirSync(directory).some((name) => name.startsWith(".swiftlocal-office-")), false);
});

test("PDF to DOCX fallback preserves a tiny existing file and writes a separate result", async (t) => {
  const directory = fixture(t);
  const input = path.join(directory, "report.pdf");
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  fs.writeFileSync(input, await pdf.save());
  const existing = path.join(directory, "report.docx");
  fs.writeFileSync(existing, "keep this user file");
  const backend = backendIn(directory);
  backend.tools = { libreOffice: { available: true, path: process.execPath } };
  const job = jobFor("pdf-to-office", directory, input, { extension: "docx", scanOcr: "off", ocrOutput: "docx" });
  await backend.runPdfToOffice(job);
  assert.equal(fs.readFileSync(existing, "utf8"), "keep this user file");
  assert.deepEqual(job.outputPaths.map((file) => path.basename(file)), ["report (2).docx"]);
  assert.ok(fs.statSync(job.outputPaths[0]).size > 64);
});
