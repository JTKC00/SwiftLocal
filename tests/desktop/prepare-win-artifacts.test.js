"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { clearNsisArchive } = require("../../scripts/prepare-win-artifacts");

test("build preparation removes only the expected interrupted staging archive", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-build-preparation-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const archive = path.join(directory, "swiftlocal-1.0.0-x64.nsis.7z");
  const installer = path.join(directory, "release.exe");
  fs.writeFileSync(archive, "interrupted compression");
  fs.writeFileSync(installer, "previous release");
  clearNsisArchive(directory, { name: "swiftlocal", version: "1.0.0" });
  assert.equal(fs.existsSync(archive), false);
  assert.equal(fs.readFileSync(installer, "utf8"), "previous release");
  assert.doesNotThrow(() => clearNsisArchive(directory, { name: "swiftlocal", version: "1.0.0" }));
  assert.throws(() => clearNsisArchive(directory, { name: "../outside", version: "1.0.0" }), /Invalid/);
});
