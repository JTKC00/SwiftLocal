"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { afterEach, describe, test } = require("node:test");
const {
  expectedWindowsArtifactNames,
  parseArgs,
  requireArtifactNotOlderThan,
  requireReleaseFile,
  requireWindowsExecutable,
  verifyArtifactPayloadMatches,
  verifyPdfAssociationConfig,
  MAIN_EXE_CANDIDATES
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
    assert.deepEqual(parseArgs(["--artifact", "portable", "--artifact", "installer"]), {
      full: false,
      unpackedOnly: false,
      artifactKinds: ["portable", "installer"]
    });
    assert.throws(() => parseArgs(["--artifact", "zip"]), /不支援的產物種類/);
    assert.throws(() => parseArgs(["--unknown"]), /不支援的參數/);
  });

  test("pack entry points fail closed through the release verifier", () => {
    const regularPack = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "pack-win.js"), "utf8");
    const fullPack = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "build-win-full.js"), "utf8");
    assert.match(regularPack, /verify-release-artifacts\.js/);
    assert.match(fullPack, /verify-release-artifacts\.js/);
    assert.match(regularPack, /--artifact/);
    assert.match(fullPack, /--unpacked/);
    assert.match(regularPack, /code !== 0/);
    assert.match(fullPack, /code !== 0/);
    assert.match(regularPack, /verify\.status === 0 \? 0 : 1/);
    assert.match(fullPack, /verify\.status === 0 \? 0 : 1/);
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

  test("rejects a non-Windows binary even when its size is sufficient", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-pe-test-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "tool.exe");
    fs.writeFileSync(filePath, Buffer.alloc(64, 0));
    assert.throws(() => requireWindowsExecutable(filePath, 1), /Windows PE/);
    const pe = Buffer.alloc(64, 0);
    pe.write("MZ", 0, "ascii");
    fs.writeFileSync(filePath, pe);
    assert.doesNotThrow(() => requireWindowsExecutable(filePath, 1));
  });

  test("rejects stale installer or portable files paired with newer unpacked contents", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-stale-release-test-"));
    temporaryDirectories.push(directory);
    const artifact = path.join(directory, "artifact.exe");
    const packaged = path.join(directory, "app.asar");
    fs.writeFileSync(artifact, "artifact");
    fs.writeFileSync(packaged, "packaged");
    const now = Date.now() / 1000;
    fs.utimesSync(artifact, now - 30, now - 30);
    fs.utimesSync(packaged, now, now);
    assert.throws(() => requireArtifactNotOlderThan(artifact, [packaged]), /舊檔/);
    fs.utimesSync(artifact, now + 1, now + 1);
    assert.doesNotThrow(() => requireArtifactNotOlderThan(artifact, [packaged]));
  });

  test("cryptographically matches app and media tools extracted from an artifact payload", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-artifact-payload-test-"));
    temporaryDirectories.push(directory);
    const payload = path.join(directory, "payload");
    const resources = path.join(payload, "resources");
    const paths = {
      archivePath: path.join(resources, "app.asar"),
      mediaTools: {
        ytDlp: path.join(resources, "tools", "yt-dlp", "bin", "yt-dlp.exe"),
        deno: path.join(resources, "tools", "deno", "bin", "deno.exe"),
        ffmpeg: path.join(resources, "tools", "ffmpeg", "bin", "ffmpeg.exe")
      }
    };
    for (const [label, filePath] of Object.entries({ app: paths.archivePath, ...paths.mediaTools })) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `${label}-payload`);
    }
    const artifact = path.join(directory, "release.7z");
    execFileSync(require("7zip-bin").path7za, ["a", "-t7z", artifact, "."], { cwd: payload, stdio: "ignore" });
    assert.doesNotThrow(() => verifyArtifactPayloadMatches(artifact, paths));
    fs.writeFileSync(paths.mediaTools.deno, "changed-after-packaging");
    assert.throws(() => verifyArtifactPayloadMatches(artifact, paths), /不一致/);
  });

  test("builder config rejects Electron product/PDF association names", () => {
    const config = require("../../electron-builder.config.js");
    const pdf = verifyPdfAssociationConfig(config);
    assert.match(String(config.productName || ""), /SwiftLocal/);
    assert.notEqual(String(config.productName || "").toLowerCase(), "electron");
    assert.match(String(pdf.description || pdf.name || ""), /SwiftLocal|PDF/i);
    assert.equal(String(config.win && config.win.executableName || ""), "SwiftLocal");
    assert.ok(MAIN_EXE_CANDIDATES.includes("SwiftLocal.exe"));
  });

  test("verify script fails when FileDescription would be Electron", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "verify-release-artifacts.js"), "utf8");
    assert.match(source, /FileDescription/);
    assert.match(source, /仍為 Electron/);
    assert.match(source, /ProductName/);
    assert.match(source, /FriendlyAppName|fileAssociations/);
    assert.match(source, /巢狀 @napi-rs\/canvas|nested/);
  });

});
