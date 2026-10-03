"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const helper = path.join(root, "docs/acceptance/2026-09-30-store-phase2d/preflight-step4a.ps1");
const frozen = "38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404";
const quote = value => "'" + value.replace(/'/g, "''") + "'";

// Mock only Windows observations. The real preflight validates the receipts and
// writes its real result; no package installation or certificate change occurs.
function preflight(change = () => {}) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const evidence = fs.mkdtempSync(path.join(tempRoot, "swiftlocal-preflight-"));
  const fixture = { status: "PASS", baseline: { sha256: frozen, bytes: 1115695293 },
    update: { sha256: "b".repeat(64), bytes: 2000, identity: { Version: "1.0.1.0" } } };
  const thumb = "A".repeat(40);
  const subject = "CN=48CB75C0-3F50-44EF-87EB-8203F196B957";
  const signing = { certificateThumbprint: thumb, certificateSubject: subject,
    signToolPath: "test-signtool", signToolSha256: "c".repeat(64), packages: [
      { version: "1.0.0.0", unsignedPath: "test-baseline", unsignedBytes: 1115695293,
        unsignedSha256: frozen, signedPath: "test-signed-baseline", signedBytes: 1000, signedSha256: "d".repeat(64) },
      { version: "1.0.1.0", unsignedPath: "test-update", unsignedBytes: 2000,
        unsignedSha256: "b".repeat(64), signedPath: "test-signed-update", signedBytes: 1000, signedSha256: "e".repeat(64) }
    ] };
  change(signing, fixture);
  fs.mkdirSync(path.join(evidence, "signing"));
  fs.writeFileSync(path.join(evidence, "update-fixture.json"), JSON.stringify(fixture));
  fs.writeFileSync(path.join(evidence, "signing/signing.json"), JSON.stringify(signing));
  const driver = path.join(evidence, "driver.ps1");
  fs.writeFileSync(driver, `
$ErrorActionPreference = 'Stop'
function Get-AppxPackage { [pscustomobject]@{Name='JTKC.SwiftLocal';Version='1.0.0.0';Publisher='${subject}';Architecture='X64';PackageFamilyName='JTKC.SwiftLocal_j44a9ewx73faj';PackageFullName='test';InstallLocation='test';Status='Ok'} }
function Get-AppxPackageManifest { [xml]'<Package><Applications><Application Id="SwiftLocal" /></Applications></Package>' }
function Get-Process { }
function Get-Item {
  param($LiteralPath)
  if ($LiteralPath -like 'Cert:*') { return [pscustomobject]@{Subject='${subject}';HasPrivateKey=($LiteralPath -like 'Cert:\\CurrentUser\\My\\*');NotAfter=(Get-Date).AddDays(1)} }
  [pscustomobject]@{Length=$(if($LiteralPath -eq 'test-baseline'){1115695293}elseif($LiteralPath -eq 'test-update'){2000}else{1000})}
}
function Get-FileHash {
  param($LiteralPath,$Algorithm)
  $hashes=@{'test-baseline'='${frozen}';'test-update'='${"b".repeat(64)}';'test-signed-baseline'='${"d".repeat(64)}';'test-signed-update'='${"e".repeat(64)}';'test-signtool'='${"c".repeat(64)}'}
  [pscustomobject]@{Hash=$hashes[$LiteralPath]}
}
function Get-AuthenticodeSignature { [pscustomobject]@{Status='Valid';SignerCertificate=[pscustomobject]@{Thumbprint='${thumb}';Subject='${subject}'}} }
function test-signtool { $global:LASTEXITCODE=0; 'Mock signature verification' }
function Get-WinEvent { param($ListLog,$LogName,$MaxEvents,$ErrorAction); if($ListLog){[pscustomobject]@{IsEnabled=$true}}else{[pscustomobject]@{RecordId=7}} }
try { & ${quote(helper)} -Evidence ${quote(evidence)} } catch { Write-Output $_.Exception.Message; exit 1 }
`);
  try {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-File", driver], { encoding: "utf8", windowsHide: true, timeout: 30000 });
    assert.ifError(result.error);
    const receipt = path.join(evidence, "step4a-preflight-completed.json");
    return { status: result.status, output: result.stdout + result.stderr,
      report: fs.existsSync(receipt) ? JSON.parse(fs.readFileSync(receipt, "utf8").replace(/^\uFEFF/, "")) : null };
  } finally {
    const target = fs.realpathSync(evidence);
    assert.equal(path.dirname(target), tempRoot, "Cleanup must stay in the test temp root");
    assert.ok(path.basename(target).startsWith("swiftlocal-preflight-"));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

test("Store preflight accepts a new local certificate and verified update fixture", { skip: process.platform !== "win32" }, () => {
  const result = preflight();
  assert.equal(result.status, 0, result.output);
  assert.equal(result.report.status, "PASS");
  assert.equal(result.report.packages[1].unsignedSha256, "b".repeat(64));
  assert.equal(result.report.certificate.thumbprint, "A".repeat(40));
});

test("Store preflight rejects a substituted update receipt", { skip: process.platform !== "win32" }, () => {
  const result = preflight((signing, fixture) => { fixture.update.sha256 = "f".repeat(64); });
  assert.equal(result.status, 1);
  assert.match(result.output, /Receipt-bound unsigned update fixture differs/);
  assert.equal(result.report.status, "FAIL");
});

test("Store preflight rejects a substituted frozen baseline", { skip: process.platform !== "win32" }, () => {
  const result = preflight((signing, fixture) => { fixture.baseline.sha256 = "f".repeat(64); });
  assert.equal(result.status, 1);
  assert.match(result.output, /Verified frozen-baseline update fixture missing or changed/);
});

test("Store preflight requires both distinct package versions", { skip: process.platform !== "win32" }, () => {
  const result = preflight(signing => { signing.packages = [signing.packages[0], signing.packages[0]]; });
  assert.equal(result.status, 1);
  assert.match(result.output, /Two-version receipt missing/);
});

test("Store preflight rejects malformed certificate thumbprints", { skip: process.platform !== "win32" }, () => {
  const result = preflight(signing => { signing.certificateThumbprint = "bad"; });
  assert.equal(result.status, 1);
  assert.match(result.output, /Invalid receipt-bound certificate thumbprint/);
});
