"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { isWindowsX64Pe } = require("./windows-pe");
const { sha256File } = require("./ensure-media-download-tools");

const lockedLanguageFiles = new Set(Object.keys(require("./tessdata-lock").loadTessdataLock().files)
  .map(language => `tessdata/${language}.traineddata`));
const defaultLock = path.join(__dirname, "..", "tools", "native-tools.lock.json");
function loadNativeLock(file = defaultLock) {
  const lock = JSON.parse(fs.readFileSync(file, "utf8"));
  if (lock.schemaVersion !== 1 || lock.target !== "win32-x64") throw new Error("Unsupported native tool lock");
  return lock;
}
function isLanguagePack(key, relative) {
  return key === "tesseract" && lockedLanguageFiles.has(relative);
}
function payloadManifest(root, key) {
  const entries = [];
  function walk(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in native payloads: ${relative}`);
      if (entry.isDirectory()) walk(file, relative + "/");
      else if (entry.isFile() && !isLanguagePack(key, relative) && !(key === "tesseract" && relative === "tessdata/swiftlocal-tessdata.json")) {
        entries.push({ path: relative, bytes: fs.statSync(file).size, sha256: sha256File(file) });
      } else if (!entry.isFile()) throw new Error(`Unsupported native payload entry: ${relative}`);
    }
  }
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error(`Symbolic payload root: ${root}`);
  walk(root);
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return entries;
}
function payloadDigest(root, key) {
  return crypto.createHash("sha256").update(JSON.stringify(payloadManifest(root, key))).digest("hex");
}
function verifyNativeTool(key, toolsRoot, lock = loadNativeLock(), options = {}) {
  const spec = lock.tools[key];
  if (!spec) throw new Error(`Missing payload lock for ${key}`);
  const root = path.join(toolsRoot, key);
  const expected = spec.payloadSha256;
  if (!/^[a-f0-9]{64}$/.test(expected || "")) throw new Error(`Missing payload digest for ${key}`);
  if (payloadDigest(root, key) !== expected) throw new Error(`${key} ${spec.version}: payload checksum mismatch (missing, changed or extra files)`);
  for (const relative of spec.executables) {
    if (!isWindowsX64Pe(path.join(root, relative), 10_000)) throw new Error(`${key}: invalid Windows x64 executable: ${relative}`);
  }
  if (process.platform === "win32" && options.runVersion !== false) {
    const result = spawnSync(path.join(root, spec.executables[0]), spec.versionArgs || ["--version"], { encoding: "utf8", timeout: 30_000, windowsHide: true });
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    const escaped = (spec.runtimeVersion || spec.version).replace(/\./g, "\\.");
    if (result.status !== 0 || !new RegExp(`(?:^|[^0-9])${escaped}${key === "libreoffice" ? "(?:\\.[0-9]+)?" : ""}(?:[^0-9.]|$)`).test(output)) throw new Error(`${key}: expected version ${spec.version}; ${result.error || output}`);
  }
  return { version: spec.version, root };
}
module.exports = { loadNativeLock, payloadManifest, payloadDigest, verifyNativeTool, isLanguagePack };
