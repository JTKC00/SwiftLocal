"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { configureStorePaths } = require("../../build/store/runtime");
const { validatePackagePath, verifyManifest } = require("../../scripts/verify-store-package");
const { summarizeWack } = require("../../scripts/read-store-wack");
test("WACK requires a complete matching report and passing required tests", () => {
  const xml = '<REPORT APP_NAME="SwiftLocal.StoreSpike.TEST" APP_VERSION="1.0.0.0" OVERALL_RESULT="PASS" PARTIAL_RUN="FALSE"><TEST NAME="manifest" OPTIONAL="FALSE"><RESULT>PASS</RESULT></TEST><TEST NAME="process imports" OPTIONAL="TRUE"><RESULT>FAIL</RESULT></TEST></REPORT>';
  assert.equal(summarizeWack(xml).status, "PASS");
  assert.equal(summarizeWack(xml).optionalFailures, 1);
  assert.equal(summarizeWack(xml.replace('PARTIAL_RUN="FALSE"', 'PARTIAL_RUN="TRUE"')).status, "FAIL");
  assert.equal(summarizeWack(xml.replace('<RESULT>PASS</RESULT>', '<RESULT>FAIL</RESULT>')).status, "FAIL");
  assert.throws(() => summarizeWack(xml.replace('SwiftLocal.StoreSpike.TEST', 'Another.Package')));
});
test("Store overlay preserves NSIS config and always includes Full tools", () => {
  const base = require("../../electron-builder.config");
  const before = JSON.stringify(base);
  const store = require("../../electron-builder.store.config");
  assert.equal(JSON.stringify(base), before);
  assert.equal(base.directories.output, "dist");
  assert.equal(base.nsis.include, "build/windows-file-associations.nsh");
  assert.deepEqual(base.win.target.map(t => t.target), ["portable", "nsis"]);
  assert.equal(store.win.target[0].target, "appx");
  assert.ok(store.win.extraResources[0].filter.includes("libreoffice/**/*"));
  assert.equal(store.publish, null);
  assert.equal(store.appx.publisher, "CN=SwiftLocal Store Spike TEST");
  assert.equal(store.extraMetadata.version, undefined, "Store overlay must not change the product version");
});
test("Store paths are writable and independent of package install/CWD", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-store-test-"));
  try {
    const set = {}; let cwd = "/protected/install";
    const app = { getPath: () => root, setPath: (key, value) => { set[key] = value; } };
    const proc = { platform: "win32", windowsStore: true, resourcesPath: "/protected/install/resources", env: {}, cwd: () => cwd, chdir: value => { cwd = value; } };
    const result = configureStorePaths(app, proc);
    assert.equal(result.cwd, set.userData); assert.equal(proc.env.TEMP, set.temp);
    for (const value of Object.values(set)) { assert.ok(value.startsWith(root + path.sep)); assert.ok(fs.statSync(value).isDirectory()); }
    assert.ok(!JSON.stringify(set).includes("protected"));
    assert.throws(() => configureStorePaths(app, { ...proc, windowsStore: false }), /installed Windows package/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("AppX verifier rejects unsafe names and wrong identity / association", () => {
  for (const name of ["app/../x", "app/NUL.txt", "app/a.", "app/x:y", "app/COM1.exe"]) assert.throws(() => validatePackagePath(name));
  validatePackagePath("app/resources/tools/tesseract/中文.traineddata");
  const config = require("../../electron-builder.store.config").appx;
  let manifest = fs.readFileSync(path.join(__dirname, "../../build/store/AppxManifest.xml"), "utf8");
  manifest = manifest.replace(/\$\{(\w+)\}/g, (_, key) => key === "arch" ? "x64" : key === "resourceLanguages" ? '<Resource Language="zh-TW" />' : config[key]);
  verifyManifest(manifest);
  assert.throws(() => verifyManifest(manifest.replace("SwiftLocal.StoreSpike.TEST", "Other.Identity")));
  assert.throws(() => verifyManifest(manifest.replace(".pdf</", ".txt</")));
});
