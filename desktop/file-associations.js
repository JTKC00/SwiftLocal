"use strict";

const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { shell } = require("electron");

/**
 * PDF file association helpers (Windows / macOS open-with + argv / open-file).
 *
 * Installer registration is driven by electron-builder `fileAssociations`.
 * Setting the *system default* still requires the user (Windows Settings).
 */

const PDF_PROG_ID = "SwiftLocal.PDF";
const PDF_DESCRIPTION = "PDF 文件 — 快轉通 SwiftLocal";

function isPdfPath(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  try {
    const cleaned = normalizeArgPath(filePath);
    return path.extname(cleaned).toLowerCase() === ".pdf";
  } catch {
    return false;
  }
}

function normalizeArgPath(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  // Strip surrounding quotes (common when shell-invoked).
  if (
    (s.startsWith("\"") && s.endsWith("\"")) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (/^file:/i.test(s)) {
    try {
      s = fileURLToPath(s);
    } catch {
      // keep original
    }
  }
  return s;
}

/**
 * Extract open-with file paths from process argv (Electron may prepend exe / .).
 * @param {string[]} argv
 * @param {{ cwd?: string }} [options]
 * @returns {string[]}
 */
function getOpenFilesFromArgv(argv, options = {}) {
  const args = Array.isArray(argv) ? argv : [];
  const cwd = options.cwd || process.cwd();
  const results = [];
  const seen = new Set();

  for (const raw of args) {
    if (!raw || typeof raw !== "string") continue;
    const value = normalizeArgPath(raw);
    if (!value) continue;
    // Skip electron / node flags and the app entry.
    if (value === "." || value.startsWith("-")) continue;
    // Skip electron binary and project entry scripts unless they somehow end in .pdf.
    if (/electron(\.exe)?$/i.test(value) && !isPdfPath(value)) continue;
    if (/\.(js|cjs|mjs|ts|json)$/i.test(value) && !isPdfPath(value)) continue;
    // Skip package.json main path patterns without .pdf
    if (!isPdfPath(value)) continue;

    let resolved;
    try {
      resolved = path.isAbsolute(value) ? path.normalize(value) : path.resolve(cwd, value);
    } catch {
      continue;
    }
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(resolved);
  }
  return results;
}

/**
 * @returns {{
 *   supported: boolean,
 *   platform: string,
 *   packaged: boolean,
 *   progId: string,
 *   message: string,
 *   canOpenSettings: boolean
 * }}
 */
function getAssociationStatus(appLike) {
  const platform = process.platform;
  const packaged = Boolean(appLike && appLike.isPackaged);
  const supported = platform === "win32" || platform === "darwin";

  if (platform === "win32") {
    return {
      supported: true,
      platform,
      packaged,
      progId: PDF_PROG_ID,
      canOpenSettings: true,
      message: packaged
        ? "安裝版已註冊「開啟方式」項目。若要設為預設 PDF 程式，請在 Windows 設定中選擇「快轉通 SwiftLocal」。"
        : "開發模式不會寫入系統關聯。請使用安裝版（installer），或在檔案上「開啟方式 → 選擇其他應用程式」。"
    };
  }

  if (platform === "darwin") {
    return {
      supported: true,
      platform,
      packaged,
      progId: PDF_PROG_ID,
      canOpenSettings: true,
      message: packaged
        ? "可在 Finder 對 PDF「取得資訊 → 開啟方式」選取 快轉通 SwiftLocal，並按「全部更改」。"
        : "開發模式請用：open -a Electron --args path/to/file.pdf 或打包後的 .app。"
    };
  }

  return {
    supported: false,
    platform,
    packaged,
    progId: PDF_PROG_ID,
    canOpenSettings: false,
    message: "此平台尚未提供系統 PDF 檔案關聯。"
  };
}

/**
 * Open OS UI so the user can set SwiftLocal as a PDF viewer / default.
 * Does not force default without consent (Windows Store policy).
 * @returns {Promise<{ ok: boolean, message: string, method?: string }>}
 */
async function openPdfAssociationSettings() {
  if (process.platform === "win32") {
    // Windows 10/11 Settings → Default apps (user picks PDF / SwiftLocal).
    try {
      await shell.openExternal("ms-settings:defaultapps");
      return {
        ok: true,
        method: "ms-settings:defaultapps",
        message: "已開啟 Windows「預設應用程式」。請搜尋 PDF 或「快轉通 SwiftLocal」並指定開啟方式。"
      };
    } catch (error) {
      return {
        ok: false,
        message: `無法開啟設定：${error && error.message ? error.message : error}`
      };
    }
  }

  if (process.platform === "darwin") {
    try {
      // Opens System Settings; user still assigns in Finder Get Info for reliability.
      await shell.openExternal("x-apple.systempreferences:com.apple.preference.defaultapp");
      return {
        ok: true,
        method: "system-settings",
        message: "請在 Finder 對 PDF 檔「取得資訊 → 開啟方式」選擇 快轉通 SwiftLocal。"
      };
    } catch {
      return {
        ok: true,
        method: "manual",
        message: "請在 Finder 對 PDF 檔「取得資訊 → 開啟方式」選擇 快轉通 SwiftLocal，並可按「全部更改」。"
      };
    }
  }

  return {
    ok: false,
    message: "此平台請手動在檔案管理員設定開啟方式。"
  };
}

/**
 * Kept for API compatibility — real registration is via electron-builder installer.
 * @returns {{ ok: boolean, message: string }}
 */
function registerPdfAssociation(appLike) {
  const status = getAssociationStatus(appLike);
  if (!status.supported) {
    return { ok: false, message: status.message };
  }
  if (!status.packaged) {
    return {
      ok: false,
      message: "開發模式無法寫入系統檔案關聯。請安裝「installer」版本後，在系統設定中指定 PDF 開啟程式。"
    };
  }
  return {
    ok: true,
    message: status.message
  };
}

module.exports = {
  PDF_PROG_ID,
  PDF_DESCRIPTION,
  isPdfPath,
  normalizeArgPath,
  getOpenFilesFromArgv,
  getAssociationStatus,
  openPdfAssociationSettings,
  registerPdfAssociation
};
