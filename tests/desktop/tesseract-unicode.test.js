"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runTesseractOcr, runProcess } = require("../../desktop/backend");

for (const outputFormat of ["", "pdf"]) {
  test(`Windows OCR uses relative ASCII arguments and retains Unicode resources (${outputFormat || "text"})`, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-中文 é-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const input = path.join(root, "輸入.png"), data = path.join(root, "語言"), output = path.join(root, "輸出");
    fs.mkdirSync(data); fs.writeFileSync(input, "input bytes"); fs.writeFileSync(path.join(data, "eng.traineddata"), "model bytes");
    fs.writeFileSync(path.join(data, "unused.traineddata"), "do not copy unused models");
    fs.mkdirSync(path.join(data, "configs")); fs.writeFileSync(path.join(data, "configs", "pdf"), "tessedit_create_pdf 1");
    fs.writeFileSync(path.join(data, "pdf.ttf"), "PDF font");
    const saved = Object.fromEntries(["TMP", "TEMP", "TMPDIR"].map(k => [k, process.env[k]]));
    for (const k of Object.keys(saved)) process.env[k] = root;
    let scratch;
    try {
      await runTesseractOcr(process.execPath, input, output, "eng", data, {}, {
        platform: "win32", outputFormat,
        runTool: async (_file, args, job, label, options) => {
          scratch = options.cwd;
          assert.match(scratch, /中文/);
          assert.ok(args.every(arg => /^[\x00-\x7f]*$/.test(arg)));
          assert.equal(fs.lstatSync(path.join(scratch, "tessdata")).isSymbolicLink(), false);
          assert.equal(fs.existsSync(path.join(scratch, "tessdata", "unused.traineddata")), false);
          assert.equal(fs.readFileSync(path.join(scratch, "tessdata", "configs", "pdf"), "utf8"), "tessedit_create_pdf 1");
          assert.equal(fs.readFileSync(path.join(scratch, "tessdata", "pdf.ttf"), "utf8"), "PDF font");
          const extension = outputFormat === "pdf" ? ".pdf" : ".txt";
          return runProcess(process.execPath, ["-e", `const fs=require('fs'); if(fs.readFileSync('input.png','utf8')!=='input bytes'||fs.readFileSync('tessdata/eng.traineddata','utf8')!=='model bytes')process.exit(2); fs.writeFileSync('tessdata/eng.traineddata','private mutation'); fs.writeFileSync('output${extension}','verified result');`], job, label, options);
        }
      });
    } finally {
      for (const [k, value] of Object.entries(saved)) { if (value === undefined) delete process.env[k]; else process.env[k] = value; }
    }
    assert.equal(fs.readFileSync(output + (outputFormat === "pdf" ? ".pdf" : ".txt"), "utf8"), "verified result");
    assert.equal(fs.readFileSync(path.join(data, "eng.traineddata"), "utf8"), "model bytes");
    assert.equal(fs.existsSync(scratch), false);
  });
}

test("Windows OCR failure cleans private copies without deleting language data or publishing output", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-ocr-failed-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "input.png"), data = path.join(root, "data"), output = path.join(root, "out");
  fs.mkdirSync(data); fs.writeFileSync(input, "input"); fs.writeFileSync(path.join(data, "eng.traineddata"), "original");
  let scratch;
  await assert.rejects(runTesseractOcr(process.execPath, input, output, "eng", data, {}, {
    platform: "win32", runTool: async (_file, _args, job, label, options) => {
      scratch = options.cwd;
      fs.writeFileSync(path.join(scratch, "tessdata", "eng.traineddata"), "private failure mutation");
      return runProcess(process.execPath, ["-e", "process.exit(2)"], job, label, options);
    }
  }));
  assert.equal(fs.existsSync(scratch), false);
  assert.equal(fs.existsSync(output + ".txt"), false);
  assert.equal(fs.readFileSync(path.join(data, "eng.traineddata"), "utf8"), "original");
});
