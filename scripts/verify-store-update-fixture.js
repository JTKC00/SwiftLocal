"use strict";
// Preparatory checks of the exact extracted fixture, not installed-package acceptance.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const asar = require("@electron/asar");
const { verifyManifest, validatePackagePath } = require("./verify-store-package");
const { verifyRequiredToolPayload, verifyNoRuntimeData, verifyNoNestedCanvas } = require("./verify-release-artifacts");
const { verifyNativeTool } = require("./native-tool-lock");
const root = path.resolve(__dirname, "..");
const evidence = path.join(root, "store-evidence/phase2d");
const publicEvidence = path.join(root, "docs/acceptance/2026-09-30-store-phase2d");
const payload = path.join(evidence, "update-fixture-payload");
const report = { status: "UNVERIFIED", scope: "extracted unsigned update-fixture preflight; installed update and GUI remain UNVERIFIED", tools: {} };
try {
  // Git may normalize the public XML snapshot's line endings on Windows.
  // Exact binary manifest/payload comparisons remain in the fixture builder.
  const before = fs.readFileSync(path.join(publicEvidence, "baseline-AppxManifest.xml"), "utf8").replace(/\r\n/g, "\n");
  const after = fs.readFileSync(path.join(payload, "AppxManifest.xml"), "utf8").replace(/\r\n/g, "\n");
  verifyManifest(before);
  const normalized = after.replace(/(<Identity\b[^>]*\bVersion=")1\.0\.1\.0(")/, "$11.0.0.0$2");
  assert.equal(normalized, before, "Only the Identity Version may change");
  verifyManifest(normalized);
  const entries = JSON.parse(fs.readFileSync(path.join(evidence, "update-fixture-payload-hashes.json"), "utf8"));
  const seen = new Set();
  for (const entry of entries) {
    const name = decodeURIComponent(entry.path);
    validatePackagePath(name);
    assert.ok(!seen.has(name.toLowerCase()), `Package case collision: ${name}`); seen.add(name.toLowerCase());
  }
  const resources = path.join(payload, "app/resources");
  const archive = path.join(resources, "app.asar");
  const names = asar.listPackage(archive);
  verifyNoRuntimeData(names); verifyNoNestedCanvas(names);
  assert.ok(!names.some(n => /^[/\\]backend[/\\]/.test(n)), "Python backend leaked into Store payload");
  const pkg = JSON.parse(asar.extractFile(archive, "package.json"));
  assert.equal(pkg.version, "0.4.1"); assert.equal(pkg.main, "build/store/main.js");
  const embedded = JSON.parse(asar.extractFile(archive, path.join("build", "store", "partner-center-identity.json")));
  assert.equal(embedded.packageVersion, "1.0.0.0");
  const tools = verifyRequiredToolPayload(resources, { full: true });
  for (const key of ["ffmpeg", "qpdf", "tesseract", "libreoffice"]) verifyNativeTool(key, tools.toolsDir, undefined, { runVersion: false });
  const native = tools.requiredTools;
  for (const [key, exe, args] of [
    ["ffmpeg", native.ffmpeg, ["-version"]], ["qpdf", native.qpdf, ["--version"]],
    ["tesseract", native.tesseract, ["--version"]], ["libreoffice", native.libreOffice, ["--version"]],
    ["yt-dlp", native.ytDlp, ["--version"]], ["deno", native.deno, ["--version"]]
  ]) {
    const result = spawnSync(exe, args, { encoding: "utf8", windowsHide: true, timeout: 60000, cwd: evidence });
    assert.equal(result.status, 0, `${key}: ${result.error || result.stderr}`);
    const output = (result.stdout + result.stderr).trim(); assert.ok(output, `${key} returned no version evidence`);
    report.tools[key] = { status: "PASS", path: path.relative(payload, exe).replace(/\\/g, "/"), output: output.slice(0, 1200) };
  }
  report.status = "PASS";
  report.manifest = "original strict Store verifier passes, fixture differs only in Identity Version";
  report.productVersion = "0.4.1"; report.packageVersion = "1.0.1.0";
  report.payloadAndNativeLocks = "PASS"; report.tessdataAndSearchablePdfSupport = "PASS";
  report.installedPackageNativeProbes = "UNVERIFIED";
} catch (error) { report.status = "FAIL"; report.error = error.stack; process.exitCode = 1; }
fs.writeFileSync(path.join(publicEvidence, "package-preflight.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
