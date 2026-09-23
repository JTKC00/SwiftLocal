"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");
const { verifyPackagedApplication, buildPayloadManifest } = require("./verify-release-artifacts");
const { sizes } = require("./build-store-assets");
const identity = require("../build/store/identity");
const root = path.resolve(__dirname, "..");
function validatePackagePath(name) {
  for (const component of name.replace(/\\/g, "/").split("/")) {
    assert.ok(component && !/[<>:"|?*\x00-\x1f]/.test(component) && !/[ .]$/.test(component), `Invalid package path: ${name}`);
    assert.ok(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(component), `Reserved package path: ${name}`);
    assert.ok(component !== "." && component !== "..", `Traversal path: ${name}`);
  }
}
function verifyManifest(xml) {
  assert.ok(!xml.includes("${"), "Unresolved manifest macros");
  for (const value of [`Name="${identity.identityName}"`, `Publisher="${identity.publisher}"`,
    `<PublisherDisplayName>${identity.publisherDisplayName}</PublisherDisplayName>`, `Version="${identity.packageVersion}"`,
    `DisplayName="${identity.reservedProductName}"`, `>${identity.reservedProductName}</DisplayName>`,
    `Description>SwiftLocal ${identity.productVersion}<`, `Description="SwiftLocal ${identity.productVersion}"`,
    "<uap:DisplayName>SwiftLocal PDF</uap:DisplayName>",
    'ProcessorArchitecture="x64"', 'Executable="app\\SwiftLocal.exe"', `Id="${identity.applicationId}"`,
    'EntryPoint="Windows.FullTrustApplication"', 'Category="windows.fileTypeAssociation"',
    '<uap:FileType>.pdf</uap:FileType>', 'Name="runFullTrust"']) assert.ok(xml.includes(value), `Missing manifest value: ${value}`);
  assert.ok(!xml.includes(identity.packageFamilyName), "Package family name is not a manifest field");
  assert.ok(!xml.includes(identity.storeId), "Store ID is not a manifest field");
  assert.ok(!/StoreSpike|NOT FOR SUBMISSION|SwiftLocal TEST|store-TEST|Version="0\.4\.1/.test(xml), "TEST identity or product version leaked into the manifest");
  assert.ok(!/windows.startupTask|UserChoice|SwiftLocal\.PDF|runAsAdmin|allowElevation/.test(xml), "Unexpected installer/elevation declaration");
}
async function main() {
  const output = path.join(root, identity.outputDirectory);
  const evidence = path.join(root, "store-evidence"); fs.mkdirSync(evidence, { recursive: true });
  const version = identity.productVersion;
  const artifact = path.join(output, identity.artifactName(version));
  const packaged = verifyPackagedApplication(output, version, { full: true });
  const archiveEntries = asar.listPackage(packaged.archivePath);
  assert.ok(!archiveEntries.some(p => /^[/\\]backend[/\\]/.test(p)), "Unused Python backend entered Store payload");
  assert.equal(JSON.parse(asar.extractFile(packaged.archivePath, "package.json")).main, "build/store/main.js");
  assert.equal(JSON.parse(asar.extractFile(packaged.archivePath, "package.json")).version, version);
  assert.ok(archiveEntries.some(entry => entry.replace(/\\/g, "/").endsWith("build/store/partner-center-identity.json")), "Identity verification record missing from app payload");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-appx-verify-"));
  try {
    // AppX ZIP stores OPC-escaped part names (%40 for @, etc.). Generic unzip
    // exposes storage names; MakeAppx restores the installed filesystem names.
    const { Arch } = require("builder-util");
    const { kit } = await require("app-builder-lib/out/toolsets/windows").getWindowsKitsBundle({ winCodeSign: "0.0.0", arch: Arch.x64 });
    execFileSync(path.join(kit, "makeappx.exe"), ["unpack", "/p", artifact, "/d", temporary, "/o"], { windowsHide: true, stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
    const xml = fs.readFileSync(path.join(temporary, "AppxManifest.xml"), "utf8"); verifyManifest(xml);
    const actual = buildPayloadManifest(path.join(temporary, "app"));
    const comparable = manifest => Object.fromEntries(Object.entries(manifest).map(([name, { bytes, sha256 }]) => [name, { bytes, sha256 }]));
    assert.deepEqual(comparable(actual), comparable(packaged.payloadManifest), "AppX payload differs from verified win-unpacked");
    const all = buildPayloadManifest(temporary); const seen = new Set();
    for (const name of Object.keys(all)) {
      validatePackagePath(name); const key = name.toLowerCase();
      assert.ok(!seen.has(key), `Case collision: ${name}`); seen.add(key);
    }
    for (const [name, [width, height]] of Object.entries(sizes)) {
      const png = fs.readFileSync(path.join(temporary, "assets", name));
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
      assert.deepEqual(png, fs.readFileSync(path.join(root, "build/store/appx", name)));
    }
    const report = { status: "PASS", commit: process.env.GITHUB_SHA || "local", version, packageVersion: identity.packageVersion,
      builder: require("electron-builder/package.json").version,
      artifact: path.basename(artifact), bytes: fs.statSync(artifact).size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex"), files: Object.keys(all).length,
      payloadComparison: "all extracted app files byte-identical to verified Full win-unpacked",
      identity: { name: identity.identityName, publisher: identity.publisher, publisherDisplayName: identity.publisherDisplayName,
        packageFamilyName: identity.packageFamilyName, storeId: identity.storeId,
        note: "packageFamilyName and storeId are verification records, not manifest Identity fields. packageVersion 1.0.0.0 is not product version 1.0." },
      wack: "NOT RUN" };
    fs.writeFileSync(path.join(evidence, "package.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(evidence, "AppxManifest.xml"), xml);
    fs.copyFileSync(path.join(root, "build/store/assets-receipt.json"), path.join(evidence, "assets-receipt.json"));
    console.log(JSON.stringify(report, null, 2));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { validatePackagePath, verifyManifest };
