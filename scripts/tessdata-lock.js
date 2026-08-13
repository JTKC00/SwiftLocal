"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const defaultLockPath = path.resolve(__dirname, "..", "tools", "tessdata.lock.json");

function loadTessdataLock(lockPath = defaultLockPath) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  if (
    lock.schemaVersion !== 1 ||
    !/^[0-9a-f]{40}$/i.test(String(lock.revision || "")) ||
    !lock.repository ||
    !lock.files ||
    typeof lock.files !== "object"
  ) {
    throw new Error(`Invalid tessdata lock file: ${lockPath}`);
  }
  for (const [language, entry] of Object.entries(lock.files)) {
    if (!/^[a-z0-9_]+$/i.test(language) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) {
      throw new Error(`Invalid tessdata lock entry: ${language}`);
    }
    if (!/^[0-9a-f]{64}$/i.test(String(entry.sha256 || ""))) {
      throw new Error(`Invalid tessdata SHA-256 lock entry: ${language}`);
    }
  }
  return lock;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifyLockedTessdata(filePath, language, lock = loadTessdataLock()) {
  const expected = lock.files[language];
  if (!expected) return { ok: false, reason: `language is not present in tessdata.lock.json: ${language}` };
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { ok: false, reason: "file is missing" };
  }
  if (!stat.isFile()) return { ok: false, reason: "path is not a file" };
  if (stat.size !== expected.bytes) {
    return { ok: false, reason: `size ${stat.size} does not match locked size ${expected.bytes}` };
  }
  const actualHash = sha256File(filePath);
  if (actualHash !== expected.sha256) {
    return { ok: false, reason: `SHA-256 ${actualHash} does not match the lock` };
  }
  return { ok: true, bytes: stat.size, sha256: actualHash };
}

function requireLockedTessdata(filePath, language, lock = loadTessdataLock()) {
  const result = verifyLockedTessdata(filePath, language, lock);
  if (!result.ok) {
    throw new Error(`${language}.traineddata failed lock verification: ${result.reason}`);
  }
  return result;
}

function lockedTessdataUrl(language, lock = loadTessdataLock(), baseUrl = "") {
  if (!lock.files[language]) throw new Error(`Language is not locked: ${language}`);
  const base = baseUrl || `https://raw.githubusercontent.com/${lock.repository}/${lock.revision}`;
  return `${base.replace(/\/$/, "")}/${language}.traineddata`;
}

module.exports = {
  defaultLockPath,
  loadTessdataLock,
  lockedTessdataUrl,
  requireLockedTessdata,
  sha256File,
  verifyLockedTessdata
};
