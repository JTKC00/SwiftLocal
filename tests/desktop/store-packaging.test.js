"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { configureStorePaths } = require("../../build/store/runtime");
const identity = require("../../build/store/identity");
const { validatePackagePath, verifyManifest } = require("../../scripts/verify-store-package");
const { summarizeWack } = require("../../scripts/read-store-wack");
test("reserved identity matches Partner Center and the calculated package family name", () => {
  assert.equal(identity.identityName, "JTKC.SwiftLocal");
  assert.equal(identity.publisher, "CN=48CB75C0-3F50-44EF-87EB-8203F196B957");
  assert.equal(identity.publisherDisplayName, "JTKC");
  assert.equal(identity.reservedProductName, "SwiftLocal");
  assert.equal(identity.storeId, "9P6Z4M7VLWPD");
  assert.equal(identity.packageVersion, "1.0.0.0");
  assert.equal(identity.productVersion, "0.4.1");
  assert.equal(identity.packageFamilyNameFrom(identity.identityName, identity.publisher), "JTKC.SwiftLocal_j44a9ewx73faj");
  assert.equal(identity.publisherId("CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US"), "8wekyb3d8bbwe");
  assert.equal(identity.publisherId("CN=SwiftLocal Store Spike TEST"), "t6bf8bs4kmxeg");
  assert.equal(identity.assertStorePackageVersion("1.0.0.0"), "1.0.0.0");
  assert.throws(() => identity.assertStorePackageVersion("0.4.1.0"), /cannot start with 0/);
  assert.throws(() => identity.assertStorePackageVersion("1.0.0.1"), /revision must be 0/);
  assert.equal(require("../../package.json").version, "0.4.1");
});
test("WACK requires the reserved identity and passing required tests", () => {
  const xml = `<REPORT APP_NAME="${identity.identityName}" APP_VERSION="${identity.packageVersion}" OVERALL_RESULT="PASS" PARTIAL_RUN="FALSE"><TEST NAME="manifest" OPTIONAL="FALSE"><RESULT>PASS</RESULT></TEST><TEST NAME="process imports" OPTIONAL="TRUE"><RESULT>FAIL</RESULT></TEST></REPORT>`;
  assert.equal(summarizeWack(xml).status, "PASS");
  assert.equal(summarizeWack(xml).optionalFailures, 1);
  assert.equal(summarizeWack(xml.replace('PARTIAL_RUN="FALSE"', 'PARTIAL_RUN="TRUE"')).status, "FAIL");
  assert.equal(summarizeWack(xml.replace('<RESULT>PASS</RESULT>', '<RESULT>FAIL</RESULT>')).status, "FAIL");
  assert.throws(() => summarizeWack(xml.replace(identity.identityName, "SwiftLocal.StoreSpike.TEST")));
  assert.throws(() => summarizeWack(xml.replace(identity.packageVersion, "0.4.1.0")));
});
test("Store overlay preserves NSIS config and uses only the reserved identity", () => {
  const base = require("../../electron-builder.config");
  const before = JSON.stringify(base);
  const store = require("../../electron-builder.store.config");
  const productionSource = fs.readFileSync(path.join(__dirname, "../../electron-builder.config.js"), "utf8");
  assert.equal(JSON.stringify(base), before);
  assert.equal(base.directories.output, "dist");
  assert.equal(base.nsis.include, "build/windows-file-associations.nsh");
  assert.deepEqual(base.win.target.map(t => t.target), ["portable", "nsis"]);
  assert.ok(!productionSource.includes(identity.identityName));
  assert.ok(!productionSource.includes(identity.publisher));
  assert.equal(store.win.target[0].target, "appx");
  assert.ok(store.win.extraResources[0].filter.includes("libreoffice/**/*"));
  assert.equal(store.publish, null);
  assert.equal(store.directories.output, "dist-store");
  assert.equal(store.appx.identityName, identity.identityName);
  assert.equal(store.appx.publisher, identity.publisher);
  assert.equal(store.appx.publisherDisplayName, identity.publisherDisplayName);
  assert.equal(store.appx.displayName, identity.reservedProductName);
  assert.equal(store.appx.artifactName, "SwiftLocal-${version}-store-${arch}.${ext}");
  assert.equal(store.extraMetadata.version, undefined, "Store overlay must not change the product version");
  assert.ok(!JSON.stringify(store.appx).includes("TEST"));
});
test("Store paths are writable, non-TEST, and independent of package install/CWD", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-store-test-"));
  try {
    const set = {}; let cwd = "/protected/install";
    const app = { getPath: () => root, setPath: (key, value) => { set[key] = value; } };
    const proc = { platform: "win32", windowsStore: true, resourcesPath: "/protected/install/resources", env: {}, cwd: () => cwd, chdir: value => { cwd = value; } };
    const result = configureStorePaths(app, proc);
    assert.equal(result.cwd, set.userData); assert.equal(proc.env.TEMP, set.temp);
    assert.equal(path.basename(set.userData), identity.profileDirectoryName);
    for (const value of Object.values(set)) { assert.ok(value.startsWith(root + path.sep)); assert.ok(fs.statSync(value).isDirectory()); }
    assert.ok(!JSON.stringify(set).includes("protected"));
    assert.ok(!JSON.stringify(set).includes("TEST"));
    assert.throws(() => configureStorePaths(app, { ...proc, windowsStore: false }), /installed Windows package/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("AppX verifier rejects unsafe names, TEST identity, and wrong association", () => {
  for (const name of ["app/../x", "app/NUL.txt", "app/a.", "app/x:y", "app/COM1.exe"]) assert.throws(() => validatePackagePath(name));
  validatePackagePath("app/resources/tools/tesseract/中文.traineddata");
  const config = require("../../electron-builder.store.config").appx;
  let manifest = fs.readFileSync(path.join(__dirname, "../../build/store/AppxManifest.xml"), "utf8");
  manifest = manifest.replace(/\$\{(\w+)\}/g, (_, key) => key === "arch" ? "x64" : key === "resourceLanguages" ? '<Resource Language="zh-TW" />' : config[key]);
  verifyManifest(manifest);
  assert.throws(() => verifyManifest(manifest.replace(identity.identityName, "SwiftLocal.StoreSpike.TEST")));
  assert.throws(() => verifyManifest(manifest.replace(".pdf</", ".txt</")));
  assert.throws(() => verifyManifest(manifest.replace('Version="1.0.0.0"', 'Version="0.4.1.0"')));
  assert.throws(() => verifyManifest(`${manifest}\n<!-- ${identity.packageFamilyName} ${identity.storeId} -->`));
});
