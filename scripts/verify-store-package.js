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
  for (const value of ['Name="SwiftLocal.StoreSpike.TEST"', 'Publisher="CN=SwiftLocal Store Spike TEST"', 'Version="1.0.0.0"',
    'ProcessorArchitecture="x64"', 'Executable="app\\SwiftLocal.exe"', 'Id="SwiftLocal"', 'EntryPoint="Windows.FullTrustApplication"',
    'Category="windows.fileTypeAssociation"', '<uap:FileType>.pdf</uap:FileType>', 'Name="runFullTrust"']) assert.ok(xml.includes(value), `Missing manifest value: ${value}`);
  assert.ok(!/windows.startupTask|UserChoice|SwiftLocal\.PDF|runAsAdmin|allowElevation/.test(xml), "Unexpected installer/elevation declaration");
}
async function main() {
  const output = path.join(root, "dist-store-test");
  const evidence = path.join(root, "store-evidence"); fs.mkdirSync(evidence, { recursive: true });
  const version = require("../package.json").version;
  const artifact = path.join(output, `SwiftLocal-${version}-store-TEST-x64.appx`);
  const packaged = verifyPackagedApplication(output, version, { full: true });
  const archiveEntries = asar.listPackage(packaged.archivePath);
  assert.ok(!archiveEntries.some(p => /^[/\\]backend[/\\]/.test(p)), "Unused Python backend entered Store payload");
  assert.equal(JSON.parse(asar.extractFile(packaged.archivePath, "package.json")).main, "build/store/main.js");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-appx-verify-"));
  try {
    const sevenZip = await require("app-builder-lib/out/toolsets/7zip").getPath7za();
    execFileSync(sevenZip, ["x", "-y", `-o${temporary}`, artifact], { windowsHide: true, stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
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
    const report = { status: "PASS", commit: process.env.GITHUB_SHA || "local", version, builder: require("electron-builder/package.json").version,
      artifact: path.basename(artifact), bytes: fs.statSync(artifact).size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex"), files: Object.keys(all).length,
      payloadComparison: "all extracted app files byte-identical to verified Full win-unpacked", identity: "TEST ONLY", wack: "NOT RUN" };
    fs.writeFileSync(path.join(evidence, "package.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(evidence, "AppxManifest.xml"), xml);
    fs.copyFileSync(path.join(root, "build/store/assets-receipt.json"), path.join(evidence, "assets-receipt.json"));
    console.log(JSON.stringify(report, null, 2));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { validatePackagePath, verifyManifest };
