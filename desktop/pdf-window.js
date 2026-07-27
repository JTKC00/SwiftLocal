"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { BrowserWindow, shell } = require("electron");
const { isAllowedExternalUrl, isTrustedRendererUrl } = require("./security");

const APP_TITLE = "PDF 工作區 · 快轉通 SwiftLocal";

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

  if (opts.existing && !opts.existing.isDestroyed()) {
    if (opts.filePath) {
      // Renderer may already be listening; also stash for late subscribers via IPC event.
      opts.existing.webContents.send("pdf-workspace:open-path", opts.filePath);
    }
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

  let openPathSent = false;
  const sendOpenPath = () => {
    if (!opts.filePath || openPathSent || window.isDestroyed()) return;
    openPathSent = true;
    window.webContents.send("pdf-workspace:open-path", opts.filePath);
  };

  window.once("ready-to-show", () => {
    window.show();
  });

  // Prefer did-finish-load so the renderer has registered IPC listeners.
  window.webContents.once("did-finish-load", () => {
    sendOpenPath();
    // Retry once in case the listener subscribed a tick late.
    setTimeout(sendOpenPath, 200);
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
  const loadOpts = opts.filePath
    ? { query: { file: opts.filePath } }
    : undefined;
  window.loadFile(workspaceHtml, loadOpts);
  return window;
}

function pdfWorkspaceDocumentUrl(frontendDir) {
  return pathToFileURL(path.join(frontendDir, "pdf-workspace", "index.html")).href;
}

module.exports = {
  createPdfWorkspaceWindow,
  pdfWorkspaceDocumentUrl,
  APP_TITLE
};
