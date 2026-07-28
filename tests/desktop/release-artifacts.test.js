"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, describe, test } = require("node:test");
const {
  expectedWindowsArtifactNames,
  parseArgs,
  requireReleaseFile
} = require("../../scripts/verify-release-artifacts");

const temporaryDirectories = [];
const packagedUiVerifier = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "verify-packaged-ui.js"), "utf8");
const packagedUiRunner = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "smoke-packaged-ui.js"), "utf8");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("release artifact verification", () => {
  test("packaged UI smoke follows the current product hubs", () => {
    assert.ok(packagedUiVerifier.includes('[data-home-panel="pdf-hub-panel"]'));
    assert.match(packagedUiVerifier, /pdf-hub-panel/);
    assert.match(packagedUiVerifier, /ocr-panel/);
    assert.match(packagedUiVerifier, /office-panel/);
    assert.doesNotMatch(packagedUiVerifier, /開啟 PDF 工作台/);
    assert.ok(!packagedUiVerifier.includes('[data-home-panel="pdf-panel"]'));
    assert.match(packagedUiRunner, /--user-data-dir=/);
    assert.match(packagedUiRunner, /taskkill\.exe/);
    assert.match(packagedUiRunner, /swiftlocal-packaged-ui-smoke-/);
  });

  test("derives exact portable and installer names from the package version", () => {
    assert.deepEqual(expectedWindowsArtifactNames("0.3.1"), [
      "SwiftLocal-0.3.1-portable-x64.exe",
      "SwiftLocal-0.3.1-installer-x64.exe"
    ]);
    assert.deepEqual(expectedWindowsArtifactNames("0.3.1", "arm64", true), [
      "SwiftLocal-0.3.1-full-portable-arm64.exe",
      "SwiftLocal-0.3.1-full-installer-arm64.exe"
    ]);
  });

  test("parses full-build and output-directory arguments", () => {
    assert.deepEqual(parseArgs(["--full", "--dir", "release", "--arch", "arm64"]), {
      full: true,
      unpackedOnly: false,
      outputDir: "release",
      arch: "arm64"
    });
    assert.deepEqual(parseArgs(["--unpacked"]), { full: false, unpackedOnly: true });
    assert.throws(() => parseArgs(["--unknown"]), /不支援的參數/);
  });

  test("rejects missing and suspiciously small release files", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-release-test-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "artifact.exe");
    assert.throws(() => requireReleaseFile(filePath), /缺少發行產物/);
    fs.writeFileSync(filePath, "not an executable");
    assert.throws(() => requireReleaseFile(filePath), /大小異常/);
    assert.doesNotThrow(() => requireReleaseFile(filePath, 1));
  });

});
