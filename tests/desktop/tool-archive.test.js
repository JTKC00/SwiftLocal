"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { extractArchive } = require("../../scripts/ensure-media-download-tools");

test("tool archive extraction preserves spaces, apostrophes and brackets in paths", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal archive's [test]-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const archive = path.join(directory, "input.zip");
  fs.writeFileSync(archive, Buffer.from("UEsDBBQAAAAAAO9pKV0tIrUdDwAAAA8AAAASAAAAbmVzdGVkL2ZpeHR1cmUudHh0YXJjaGl2ZSBmaXh0dXJlUEsBAhQAFAAAAAAA72kpXS0itR0PAAAADwAAABIAAAAAAAAAAAAAAIABAAAAAG5lc3RlZC9maXh0dXJlLnR4dFBLBQYAAAAAAQABAEAAAAA/AAAAAAA=", "base64"));
  const output = path.join(directory, "output folder");
  extractArchive(archive, output);
  assert.equal(fs.readFileSync(path.join(output, "nested", "fixture.txt"), "utf8"), "archive fixture");
});

test("corrupt tool archives fail the provisioning step", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-bad-archive-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const archive = path.join(directory, "bad.zip");
  fs.writeFileSync(archive, "not a zip");
  assert.throws(() => extractArchive(archive, path.join(directory, "out")), /Archive extraction failed/);
});
