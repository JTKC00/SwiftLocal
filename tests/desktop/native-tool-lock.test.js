"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { payloadDigest, payloadManifest, verifyNativeTool, receiptName } = require("../../scripts/native-tool-lock");
const { main, preparePayload, parseArgs } = require("../../scripts/ensure-native-tools");
const { summarizeResults } = require("../../scripts/check-bundled-tool-updates");

function fixture(t, key = "qpdf") {
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), "native-lock-test-"));
  t.after(() => fs.rmSync(tools, { recursive: true, force: true }));
  const root = path.join(tools, key);
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "runtime.dll"), "locked dependency");
  const lock = { schemaVersion: 1, target: "win32-x64", tools: { [key]: { version: "1.2.3", sha256: "a".repeat(64), executables: [], payloadSha256: payloadDigest(root, key) } } };
  const verify = () => verifyNativeTool(key, tools, lock, { runVersion: false });
  return { tools, root, lock, verify };
}

test("native payload rejects changed, missing and extra support files", t => {
  const f = fixture(t);
  assert.doesNotThrow(f.verify);
  const file = path.join(f.root, "runtime.dll");
  fs.writeFileSync(file, "corrupt");
  assert.throws(f.verify, /checksum mismatch/);
  fs.unlinkSync(file);
  assert.throws(f.verify, /checksum mismatch/);
  fs.writeFileSync(file, "locked dependency");
  fs.writeFileSync(path.join(f.root, "old-runtime.dll"), "stale");
  assert.throws(f.verify, /checksum mismatch/);
});

test("native payload excludes separately locked tessdata but includes PDF configs", t => {
  const f = fixture(t, "tesseract");
  fs.mkdirSync(path.join(f.root, "tessdata", "configs"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "tessdata", "eng.traineddata"), "separate language lock");
  assert.doesNotThrow(f.verify);
  fs.writeFileSync(path.join(f.root, "tessdata", "configs", "pdf"), "changed pdf support");
  assert.throws(f.verify, /checksum mismatch/);
});

test("native payload manifest is sorted and ignores creation order", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, "z"), "z");
  fs.writeFileSync(path.join(f.root, "a"), "a");
  assert.deepEqual(payloadManifest(f.root, "qpdf").map(entry => entry.path), ["a", "runtime.dll", "z"]);
});

test("native payload refuses symlinked directories", t => {
  const f = fixture(t);
  const nested = path.join(f.tools, "outside");
  fs.mkdirSync(nested);
  fs.symlinkSync(nested, path.join(f.root, "linked"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(f.verify, /Symbolic/);
});

test("MSI receipt must match the locked source and complete current payload", t => {
  const f = fixture(t, "libreoffice");
  const spec = f.lock.tools.libreoffice;
  spec.payloadVerification = "source-receipt";
  delete spec.payloadSha256;
  const receipt = { schemaVersion: 1, version: spec.version, target: f.lock.target, sourceSha256: spec.sha256, payloadSha256: payloadDigest(f.root, "libreoffice") };
  const save = () => fs.writeFileSync(path.join(f.root, receiptName), JSON.stringify(receipt));
  save();
  assert.doesNotThrow(f.verify);
  receipt.sourceSha256 = "b".repeat(64); save();
  assert.throws(f.verify, /source receipt/);
  receipt.sourceSha256 = spec.sha256; save();
  fs.writeFileSync(path.join(f.root, "runtime.dll"), "changed DLL");
  assert.throws(f.verify, /checksum mismatch/);
});

test("MSI preparation preserves a complete program/share tree and rejects ambiguous images", t => {
  const f = fixture(t);
  const extracted = path.join(f.tools, "extracted");
  const app = path.join(extracted, "Program Files", "LibreOffice");
  fs.mkdirSync(path.join(app, "program"), { recursive: true });
  fs.mkdirSync(path.join(app, "share"));
  fs.writeFileSync(path.join(app, "program", "soffice.exe"), "exe");
  fs.writeFileSync(path.join(app, "share", "config"), "config");
  const destination = path.join(f.tools, "prepared");
  preparePayload(extracted, destination, { format: "msi" });
  assert.equal(fs.readFileSync(path.join(destination, "share", "config"), "utf8"), "config");
  fs.cpSync(app, path.join(extracted, "duplicate"), { recursive: true });
  assert.throws(() => preparePayload(extracted, path.join(f.tools, "ambiguous"), { format: "msi" }), /found 2/);
});

test("invalid source archive fails before touching existing tools", async t => {
  const f = fixture(t, "ffmpeg");
  fs.writeFileSync(path.join(f.tools, "swiftlocal-ffmpeg-9.0.1.zip"), "wrong archive");
  await assert.rejects(main(["--download", "--tools-root", f.tools, "--archives", f.tools]), /source archive checksum mismatch/);
  assert.equal(fs.readFileSync(path.join(f.root, "runtime.dll"), "utf8"), "locked dependency");
});

test("CLI rejects unknown or incomplete options", () => {
  assert.throws(() => parseArgs(["--tools-root"]), /Unsupported/);
  assert.throws(() => parseArgs(["--platform", "darwin"]), /Unsupported/);
  assert.equal(parseArgs(["--full", "--check"]).full, true);
});

test("watch remains actionable for source/tracking gaps even with no version updates", () => {
  const summary = summarizeResults([{ actionRequired: false, bundled: "1.2.3", bundledNote: "Mac remains unpinned" }]);
  assert.equal(summary.actionable, true);
  assert.equal(summary.updates.length, 0);
  assert.equal(summary.trackingNotes.length, 1);
  assert.equal(summarizeResults([{ actionRequired: false }]).actionable, false);
  assert.equal(summarizeResults([{ error: "upstream failed" }]).actionable, true);
});


test("Windows installer registers Open With without rewriting the PDF default", () => {
  const config = require("../../electron-builder.config");
  assert.deepEqual(config.win.fileAssociations, []);
  const include = fs.readFileSync(path.resolve(__dirname, "../..", config.nsis.include), "utf8");
  assert.match(include, /WriteRegNone SHELL_CONTEXT "Software\\Classes\\\.pdf\\OpenWithProgids" "SwiftLocal\.PDF"/);
  assert.doesNotMatch(include, /WriteRegStr[^\n]*"Software\\Classes\\\.pdf"/);
  assert.match(include, /DeleteRegValue[^\n]*OpenWithProgids/);
  assert.match(include, /customUnInstall/);
});
