"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { afterEach, describe, test } = require("node:test");
const {
  ensureExecutableTool,
  buildPayloadManifest,
  expectedWindowsArtifactNames,
  parseArgs,
  requireArtifactNotOlderThan,
  requireReleaseFile,
  requireSafeInstallerHints,
  requireWindowsArtifact,
  requireWindowsExecutable,
  verifyArtifactPayloadMatches,
  verifyPdfAssociationConfig,
  verifyRequiredToolPayload,
  MAIN_EXE_CANDIDATES
} = require("../../scripts/verify-release-artifacts");
const { sha256File, verifyLockedTessdata } = require("../../scripts/tessdata-lock");
const {
  PORTABLE_STARTUP_TIMEOUT_MS,
  UNPACKED_STARTUP_TIMEOUT_MS,
  isPortableExecutable,
  parseArgs: parsePackagedUiArgs,
  resolveStartupTimeoutMs
} = require("../../scripts/smoke-packaged-ui");

const temporaryDirectories = [];
const packagedUiVerifier = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "verify-packaged-ui.js"), "utf8");
const packagedUiRunner = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "smoke-packaged-ui.js"), "utf8");

function writeSyntheticPe(filePath, options = {}) {
  const size = options.size || 1024;
  const peOffset = options.peOffset == null ? 0x40 : options.peOffset;
  const bytes = Buffer.alloc(size, 0);
  bytes.write("MZ", 0, "ascii");
  bytes.writeUInt32LE(peOffset, 0x3c);
  if (peOffset + 6 <= bytes.length) {
    bytes.write("PE\0\0", peOffset, "binary");
    const machine = options.machine == null ? 0x8664 : options.machine;
    bytes.writeUInt16LE(machine, peOffset + 4);
    bytes.writeUInt16LE(1, peOffset + 6);
    const optionalHeaderBytes = machine === 0x8664 ? 240 : 224;
    bytes.writeUInt16LE(optionalHeaderBytes, peOffset + 20);
    bytes.writeUInt16LE(0x0002, peOffset + 22);
    bytes.writeUInt16LE(machine === 0x8664 ? 0x020b : 0x010b, peOffset + 24);
    const sectionOffset = peOffset + 24 + optionalHeaderBytes;
    bytes.write(".text\0\0\0", sectionOffset, "binary");
    bytes.writeUInt32LE(0x200, sectionOffset + 8);
    bytes.writeUInt32LE(0x200, sectionOffset + 16);
    bytes.writeUInt32LE(0x200, sectionOffset + 20);
    bytes.fill(0x90, 0x200, Math.min(bytes.length, 0x400));
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

function createRequiredResources(directory, options = {}) {
  const resourcesDir = path.join(directory, "resources");
  const toolsDir = path.join(resourcesDir, "tools");
  const executablePaths = {
    ytDlp: writeSyntheticPe(path.join(toolsDir, "yt-dlp", "bin", "yt-dlp.exe"), { size: 1_000_000 }),
    deno: writeSyntheticPe(path.join(toolsDir, "deno", "bin", "deno.exe"), { size: 1_000_000 }),
    ffmpeg: writeSyntheticPe(path.join(toolsDir, "ffmpeg", "bin", "ffmpeg.exe"), { size: 100_000 }),
    tesseract: writeSyntheticPe(path.join(toolsDir, "tesseract", "tesseract.exe"), { size: 50_000 }),
    qpdf: writeSyntheticPe(path.join(toolsDir, "qpdf", "bin", "qpdf.exe"), { size: 19_968 })
  };
  fs.writeFileSync(path.join(toolsDir, "tesseract", "libtesseract.dll"), "tesseract-support");
  fs.writeFileSync(path.join(toolsDir, "qpdf", "bin", "qpdf.dll"), "qpdf-support");
  if (options.full) {
    executablePaths.libreOffice = writeSyntheticPe(
      path.join(toolsDir, "libreoffice", "program", "soffice.exe"),
      { size: 50_000 }
    );
    fs.writeFileSync(path.join(toolsDir, "libreoffice", "program", "soffice.bin"), "support");
    fs.writeFileSync(path.join(toolsDir, "libreoffice", "program", "fundamental.ini"), "[Bootstrap]");
  }
  const tessdataLock = { schemaVersion: 1, repository: "test/fixture", revision: "0".repeat(40), files: {} };
  for (const language of ["eng", "chi_tra", "osd"]) {
    const traineddata = path.join(toolsDir, "tesseract", "tessdata", `${language}.traineddata`);
    fs.mkdirSync(path.dirname(traineddata), { recursive: true });
    fs.writeFileSync(traineddata, Buffer.alloc(50_000, language.length));
    tessdataLock.files[language] = {
      bytes: fs.statSync(traineddata).size,
      sha256: sha256File(traineddata)
    };
  }
  return { resourcesDir, executablePaths, tessdataLock };
}

function loadWindowsBuilderConfig(full) {
  const configPath = require.resolve("../../electron-builder.config.js");
  const previousEdition = process.env.SWIFTLOCAL_FULL_BUILD;
  try {
    process.env.SWIFTLOCAL_FULL_BUILD = full ? "1" : "0";
    delete require.cache[configPath];
    return require(configPath);
  } finally {
    if (previousEdition === undefined) delete process.env.SWIFTLOCAL_FULL_BUILD;
    else process.env.SWIFTLOCAL_FULL_BUILD = previousEdition;
    delete require.cache[configPath];
  }
}

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
    assert.match(packagedUiRunner, /closeWindowOnFinish:\s*true/);
    assert.match(packagedUiRunner, /TEMP:\s*sessionRoot/);
  });

  test("packaged UI smoke gives Portable a five-minute startup gate", () => {
    const standard = path.join("dist", "SwiftLocal-0.4.0-alpha.3-portable-x64.exe");
    const full = path.join("dist-full", "SwiftLocal-0.4.0-alpha.3-full-portable-arm64.exe");
    const unpacked = path.join("dist-full", "win-unpacked", "SwiftLocal.exe");
    assert.equal(isPortableExecutable(standard), true);
    assert.equal(isPortableExecutable(full), true);
    assert.equal(isPortableExecutable(unpacked), false);
    assert.equal(resolveStartupTimeoutMs(standard, null, {}), PORTABLE_STARTUP_TIMEOUT_MS);
    assert.equal(resolveStartupTimeoutMs(unpacked, null, {}), UNPACKED_STARTUP_TIMEOUT_MS);
    assert.equal(resolveStartupTimeoutMs(unpacked, 12345, {}), 12345);
    assert.throws(() => resolveStartupTimeoutMs(standard, "0", {}), /正整數/);
  });

  test("packaged UI smoke resolves executable and fixture paths before launch", () => {
    const parsed = parsePackagedUiArgs([
      "dist-full/SwiftLocal-0.4.0-alpha.3-full-portable-x64.exe",
      "smoke-temp/input.pdf",
      "smoke-temp/output",
      "smoke-temp/input.png",
      "--startup-timeout-ms=300000"
    ]);
    assert.equal(path.isAbsolute(parsed.packagedExe), true);
    assert.equal(path.isAbsolute(parsed.ocrFixturePath), true);
    assert.equal(path.isAbsolute(parsed.ocrOutputDir), true);
    assert.equal(path.isAbsolute(parsed.imageFixturePath), true);
    assert.equal(parsed.startupTimeoutMs, 300000);
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

  test("pack entry points provision tessdata before their sole fail-closed readiness gate", () => {
    const regularPack = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "pack-win.js"), "utf8");
    const fullPack = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "build-win-full.js"), "utf8");
    for (const source of [regularPack, fullPack]) {
      const provisionIndex = source.indexOf("ensure-tessdata.js");
      const readinessIndex = source.indexOf("check-pack-ready.js");
      assert.ok(provisionIndex >= 0 && provisionIndex < readinessIndex);
      assert.equal(source.match(/check-pack-ready\.js/g).length, 1);
      assert.match(source.slice(provisionIndex, readinessIndex), /status !== 0[\s\S]*process\.exit/);
      assert.match(source, /verify-release-artifacts\.js/);
      assert.match(source, /code !== 0/);
      assert.match(source, /verify\.status === 0 \? 0 : 1/);
    }
    assert.doesNotMatch(regularPack, /best-effort|packaging continues|console\.warn/);
    assert.match(regularPack, /--artifact/);
    assert.match(fullPack, /--unpacked/);
    assert.match(regularPack, /SWIFTLOCAL_FULL_BUILD:\s*"0"/);
    assert.match(fullPack, /SWIFTLOCAL_FULL_BUILD:\s*"1"/);
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

  test("rejects MZ junk and non-x64 PE files, but accepts a structurally valid synthetic x64 PE", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-pe-test-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "tool.exe");
    fs.writeFileSync(filePath, Buffer.alloc(64, 0));
    assert.throws(() => requireWindowsExecutable(filePath, 1), /Windows PE/);

    const mzJunk = Buffer.alloc(128, 0);
    mzJunk.write("MZ", 0, "ascii");
    fs.writeFileSync(filePath, mzJunk);
    assert.throws(() => requireWindowsExecutable(filePath, 1), /e_lfanew/);

    writeSyntheticPe(filePath);
    const wrongSignature = fs.readFileSync(filePath);
    wrongSignature.write("NOPE", 0x40, "ascii");
    fs.writeFileSync(filePath, wrongSignature);
    assert.throws(() => requireWindowsExecutable(filePath, 1), /PE\\0\\0 signature/);

    writeSyntheticPe(filePath, { machine: 0x014c });
    assert.throws(() => requireWindowsExecutable(filePath, 1), /x64 Windows PE|expected 0x8664/);

    writeSyntheticPe(filePath);
    assert.doesNotThrow(() => requireWindowsExecutable(filePath, 1));

    writeSyntheticPe(filePath);
    const noRawSection = fs.readFileSync(filePath);
    noRawSection.writeUInt32LE(0, 0x40 + 24 + 240 + 16);
    fs.writeFileSync(filePath, noRawSection);
    assert.throws(() => requireWindowsExecutable(filePath, 1), /no section with raw data/);

    writeSyntheticPe(filePath, { machine: 0x014c });
    assert.doesNotThrow(() => requireWindowsArtifact(filePath, 1));

    const readiness = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "check-pack-ready.js"), "utf8");
    assert.match(readiness, /isWindowsX64Pe\(filePath, minimumBytes\)/);
    assert.match(readiness, /validWindowsExecutable\(qpdf, 10_000\)/);
    assert.doesNotMatch(readiness, /header\.toString\("ascii"\) === "MZ"/);
  });

  test("requires the complete standard payload and LibreOffice for full builds", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-required-payload-test-"));
    temporaryDirectories.push(directory);
    const fixture = createRequiredResources(directory);
    const standard = verifyRequiredToolPayload(fixture.resourcesDir, { tessdataLock: fixture.tessdataLock });
    assert.deepEqual(Object.keys(standard.payloadFiles).sort(), [
      "chi_tra",
      "deno",
      "eng",
      "ffmpeg",
      "osd",
      "qpdf",
      "tesseract",
      "ytDlp"
    ]);

    writeSyntheticPe(fixture.executablePaths.qpdf, { size: 9_999 });
    assert.throws(
      () => verifyRequiredToolPayload(fixture.resourcesDir, { tessdataLock: fixture.tessdataLock }),
      /大小異常/
    );
    writeSyntheticPe(fixture.executablePaths.qpdf, { size: 19_968 });

    writeSyntheticPe(fixture.executablePaths.qpdf, { size: 19_968, machine: 0x014c });
    assert.throws(
      () => verifyRequiredToolPayload(fixture.resourcesDir, { tessdataLock: fixture.tessdataLock }),
      /x64 Windows PE|expected 0x8664/
    );
    fs.writeFileSync(fixture.executablePaths.qpdf, Buffer.alloc(19_968));
    assert.throws(
      () => verifyRequiredToolPayload(fixture.resourcesDir, { tessdataLock: fixture.tessdataLock }),
      /Windows PE/
    );
    writeSyntheticPe(fixture.executablePaths.qpdf, { size: 19_968 });

    const qpdfDll = path.join(fixture.resourcesDir, "tools", "qpdf", "bin", "qpdf.dll");
    fs.unlinkSync(qpdfDll);
    assert.throws(
      () => verifyRequiredToolPayload(fixture.resourcesDir, { tessdataLock: fixture.tessdataLock }),
      /QPDF 缺少必要 DLL/
    );
    fs.writeFileSync(qpdfDll, "qpdf-support");

    assert.throws(
      () => verifyRequiredToolPayload(fixture.resourcesDir, { full: true, tessdataLock: fixture.tessdataLock }),
      /LibreOffice/
    );

    writeSyntheticPe(
      path.join(fixture.resourcesDir, "tools", "libreoffice", "program", "soffice.exe"),
      { size: 50_000 }
    );
    fs.writeFileSync(
      path.join(fixture.resourcesDir, "tools", "libreoffice", "program", "soffice.bin"),
      "support"
    );
    fs.writeFileSync(
      path.join(fixture.resourcesDir, "tools", "libreoffice", "program", "fundamental.ini"),
      "[Bootstrap]"
    );
    assert.throws(
      () => verifyRequiredToolPayload(fixture.resourcesDir, { tessdataLock: fixture.tessdataLock }),
      /Standard 封裝不應包含 LibreOffice/
    );
    const full = verifyRequiredToolPayload(fixture.resourcesDir, {
      full: true,
      tessdataLock: fixture.tessdataLock
    });
    assert.ok(full.payloadFiles.libreOffice);
    fs.rmSync(path.join(fixture.resourcesDir, "tools", "libreoffice"), { recursive: true, force: true });

    fs.unlinkSync(fixture.executablePaths.qpdf);
    assert.throws(
      () => verifyRequiredToolPayload(fixture.resourcesDir, { tessdataLock: fixture.tessdataLock }),
      /QPDF/
    );

    writeSyntheticPe(fixture.executablePaths.qpdf, { size: 19_968 });
    const osdPath = path.join(fixture.resourcesDir, "tools", "tesseract", "tessdata", "osd.traineddata");
    fs.unlinkSync(osdPath);
    assert.throws(
      () => verifyRequiredToolPayload(fixture.resourcesDir, { tessdataLock: fixture.tessdataLock }),
      /osd\.traineddata/
    );
    fs.writeFileSync(osdPath, Buffer.alloc(50_000, "osd".length));

    const engPath = path.join(fixture.resourcesDir, "tools", "tesseract", "tessdata", "eng.traineddata");
    fs.writeFileSync(engPath, Buffer.alloc(50_000, 9));
    assert.equal(verifyLockedTessdata(engPath, "eng", fixture.tessdataLock).ok, false);
    assert.throws(
      () => verifyRequiredToolPayload(fixture.resourcesDir, { tessdataLock: fixture.tessdataLock }),
      /鎖定校驗|lock verification/
    );
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

  test("cryptographically matches every required unpacked file against the artifact payload", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-artifact-payload-test-"));
    temporaryDirectories.push(directory);
    const payload = path.join(directory, "payload");
    const fixture = createRequiredResources(payload, { full: true });
    const required = verifyRequiredToolPayload(fixture.resourcesDir, {
      full: true,
      tessdataLock: fixture.tessdataLock
    });
    const archivePath = path.join(fixture.resourcesDir, "app.asar");
    fs.writeFileSync(archivePath, "app-payload");
    const mainExecutable = writeSyntheticPe(path.join(payload, "SwiftLocal.exe"), { size: 1_000_000 });
    const payloadFiles = {
        appAsar: { filePath: archivePath, relativePath: path.join("resources", "app.asar") },
        ...required.payloadFiles
    };
    const payloadManifest = buildPayloadManifest(payload);
    const packaged = { payloadFiles, payloadManifest };
    const artifact = path.join(directory, "release.7z");
    const sevenZip = ensureExecutableTool(require("7zip-bin").path7za);
    execFileSync(sevenZip, ["a", "-t7z", artifact, "."], { cwd: payload, stdio: "ignore" });
    assert.deepEqual(
      Object.keys(verifyArtifactPayloadMatches(artifact, packaged)).sort(),
      Object.keys(packaged.payloadManifest).sort()
    );
    const originalDeno = fs.readFileSync(required.requiredTools.deno);
    fs.writeFileSync(required.requiredTools.deno, "changed-after-packaging");
    assert.throws(() => verifyArtifactPayloadMatches(artifact, packaged), /已改變|不一致/);

    fs.writeFileSync(required.requiredTools.deno, originalDeno);
    const misplacedDir = path.join(payload, "wrong", "subdir");
    fs.mkdirSync(misplacedDir, { recursive: true });
    fs.renameSync(mainExecutable, path.join(misplacedDir, "SwiftLocal.exe"));
    const misplacedArtifact = path.join(directory, "misplaced.7z");
    execFileSync(sevenZip, ["a", "-t7z", misplacedArtifact, "."], {
      cwd: payload,
      stdio: "ignore"
    });
    assert.throws(() => verifyArtifactPayloadMatches(misplacedArtifact, packaged), /應用程式根目錄/);

    fs.renameSync(path.join(misplacedDir, "SwiftLocal.exe"), mainExecutable);
    fs.writeFileSync(path.join(payload, "unexpected-stale.dll"), "stale");
    const extraArtifact = path.join(directory, "extra.7z");
    execFileSync(sevenZip, ["a", "-t7z", extraArtifact, "."], {
      cwd: payload,
      stdio: "ignore"
    });
    assert.throws(() => verifyArtifactPayloadMatches(extraArtifact, packaged), /多餘|unexpected-stale/);
  });

  test("fails every unsafe NSIS product-name hint", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-installer-hints-test-"));
    temporaryDirectories.push(directory);
    const installer = path.join(directory, "installer.exe");

    fs.writeFileSync(installer, "FriendlyAppName Electron SwiftLocal", "utf16le");
    assert.throws(() => requireSafeInstallerHints(installer), /installer_strings_electron_without_product/);

    fs.writeFileSync(installer, "FriendlyAppName Unknown Product", "utf16le");
    assert.throws(() => requireSafeInstallerHints(installer), /installer_missing_swiftlocal_string/);

    fs.writeFileSync(installer, "FriendlyAppName 快轉通 SwiftLocal", "utf16le");
    assert.doesNotThrow(() => requireSafeInstallerHints(installer));

    fs.writeFileSync(installer, "FriendlyAppName Electron\0unrelated 快轉通 SwiftLocal", "utf16le");
    assert.throws(() => requireSafeInstallerHints(installer), /installer_strings_electron_without_product/);
  });

  test("does not accept an arbitrary root helper as the main executable", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-main-exe-test-"));
    temporaryDirectories.push(directory);
    writeSyntheticPe(path.join(directory, "helper.exe"), { size: 1_000_000 });
    const { findMainWindowsExecutable } = require("../../scripts/verify-release-artifacts");
    assert.throws(() => findMainWindowsExecutable(directory), /缺少主程式 EXE/);
  });

  test("builder config rejects Electron product/PDF association names", () => {
    const config = loadWindowsBuilderConfig(false);
    const pdf = verifyPdfAssociationConfig(config);
    assert.match(String(config.productName || ""), /SwiftLocal/);
    assert.notEqual(String(config.productName || "").toLowerCase(), "electron");
    assert.match(String(pdf.description || pdf.name || ""), /SwiftLocal|PDF/i);
    assert.equal(String(config.win && config.win.executableName || ""), "SwiftLocal");
    assert.ok(MAIN_EXE_CANDIDATES.includes("SwiftLocal.exe"));
  });

  test("builder config excludes LibreOffice from Standard and retains it for Full", () => {
    const standardFilters = loadWindowsBuilderConfig(false).win.extraResources[0].filter;
    assert.ok(standardFilters.includes("!libreoffice/**/*"));

    const fullFilters = loadWindowsBuilderConfig(true).win.extraResources[0].filter;
    assert.ok(!fullFilters.includes("!libreoffice/**/*"));
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
