"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { BrowserWindow, shell } = require("electron");
const { isAllowedExternalUrl, isTrustedRendererUrl } = require("./security");
const { canonicalPathKey } = require("../frontend/shared/path-keys.js");

const APP_TITLE = "PDF 工作區 · 快轉通 SwiftLocal";

function buildPdfOpenRequests(filePaths) {
  const list = Array.isArray(filePaths) ? filePaths : [];
  const isBatch = list.length > 1;
  return list
    .filter(Boolean)
    .map((filePath, index) => ({
      path: String(filePath),
      identityKey: canonicalPathKey(String(filePath), { platform: process.platform }),
      asNewTab: index > 0,
      // A batch may reuse the empty workspace slot, but must append when a
      // real document is already open. The renderer resolves that distinction
      // from its live tab state instead of relying on timing in the main
      // process.
      appendToWorkspace: isBatch && index === 0
    }));
}

/**
 * Create (or focus) the dedicated PDF workspace window.
 * Scaffold: loads frontend/pdf-workspace/index.html
 *
 * @param {object} options
 * @param {string} options.frontendDir absolute path to frontend/
 * @param {string} options.preloadPath
 * @param {string} [options.icon]
 * @param {string[]} options.trustedRendererUrls
 * @param {string} [options.filePath] optional PDF path for later open
 * @param {string[]} [options.filePaths] PDF paths for initial open
 * @param {BrowserWindow|null} [options.existing] reuse if provided
 * @returns {BrowserWindow}
 */
function createPdfWorkspaceWindow(options) {
  const opts = options || {};
  const frontendDir = opts.frontendDir;
  const preloadPath = opts.preloadPath;
  const trustedRendererUrls = Array.isArray(opts.trustedRendererUrls)
    ? opts.trustedRendererUrls
    : [];
  const candidates = Array.isArray(opts.filePaths)
    ? opts.filePaths
    : (opts.filePath ? [opts.filePath] : []);
  const filePaths = [];
  const seen = new Set();
  candidates.forEach((filePath) => {
    const value = filePath ? String(filePath) : "";
    const key = canonicalPathKey(value, { platform: process.platform });
    if (!value || seen.has(key)) return;
    seen.add(key);
    filePaths.push(value);
  });

  if (opts.existing && !opts.existing.isDestroyed()) {
    // Renderer may already be listening; preload also buffers this event if a
    // navigation is still completing.
    buildPdfOpenRequests(filePaths).forEach((request) => {
      opts.existing.webContents.send("pdf-workspace:open-path", request);
    });
    if (opts.existing.isMinimized()) opts.existing.restore();
    opts.existing.focus();
    return opts.existing;
  }

  const workspaceHtml = path.join(frontendDir, "pdf-workspace", "index.html");
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    title: APP_TITLE,
    icon: opts.icon || undefined,
    backgroundColor: "#f3f0e8",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  let openPathsSent = false;
  const sendOpenPath = () => {
    if (!filePaths.length || openPathsSent || window.isDestroyed()) return;
    openPathsSent = true;
    buildPdfOpenRequests(filePaths).forEach((request) => {
      window.webContents.send("pdf-workspace:open-path", request);
    });
  };

  window.once("ready-to-show", () => {
    window.show();
  });

  // Prefer did-finish-load so the renderer has registered IPC listeners.
  window.webContents.once("did-finish-load", () => {
    sendOpenPath();
  });

  window.webContents.on("will-navigate", (event, url) => {
    const allowed = trustedRendererUrls.some((trusted) => isTrustedRendererUrl(url, trusted));
    if (!allowed) {
      event.preventDefault();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  // Query param as a backup channel (decoded in pdf-workspace/app.js).
  const loadOpts = filePaths.length
    ? { query: { file: filePaths[0] } }
    : undefined;
  window.loadFile(workspaceHtml, loadOpts);
  return window;
}

function pdfWorkspaceDocumentUrl(frontendDir) {
  return pathToFileURL(path.join(frontendDir, "pdf-workspace", "index.html")).href;
}

module.exports = {
  createPdfWorkspaceWindow,
  buildPdfOpenRequests,
  pdfWorkspaceDocumentUrl,
  APP_TITLE
};
