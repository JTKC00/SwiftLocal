"use strict";

const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");

function normalizedDocumentUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    parsed.hash = "";
    parsed.search = "";
    if (parsed.protocol === "file:") {
      let filePath = path.resolve(fileURLToPath(parsed));
      if (process.platform === "win32") filePath = filePath.toLowerCase();
      return pathToFileURL(filePath).href;
    }
    return parsed.href;
  } catch {
    return "";
  }
}

function isTrustedRendererUrl(value, trustedUrl) {
  const normalized = normalizedDocumentUrl(value);
  if (!normalized) return false;
  // Accept a single trusted URL or a list of app-owned documents (toolbox + PDF workspace).
  if (Array.isArray(trustedUrl)) {
    return trustedUrl.some((entry) => normalized === normalizedDocumentUrl(entry));
  }
  return normalized === normalizedDocumentUrl(trustedUrl);
}

/**
 * Build the allow-list of renderer documents under frontend/.
 * @param {string} frontendDir absolute path to frontend directory
 * @returns {string[]} file:// URLs
 */
function buildTrustedRendererUrls(frontendDir) {
  const { pathToFileURL } = require("node:url");
  const path = require("node:path");
  const dir = String(frontendDir || "");
  return [
    pathToFileURL(path.join(dir, "index.html")).href,
    pathToFileURL(path.join(dir, "pdf-workspace", "index.html")).href
  ];
}

function isAllowedExternalUrl(value) {
  try {
    const protocol = new URL(String(value || "")).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function assertTrustedIpcSender(event, trustedUrl) {
  const senderUrl = event && event.senderFrame
    ? event.senderFrame.url
    : event && event.sender && typeof event.sender.getURL === "function"
      ? event.sender.getURL()
      : "";
  if (!isTrustedRendererUrl(senderUrl, trustedUrl)) {
    throw new Error("IPC request rejected: untrusted renderer");
  }
}

module.exports = {
  assertTrustedIpcSender,
  isAllowedExternalUrl,
  isTrustedRendererUrl,
  normalizedDocumentUrl,
  buildTrustedRendererUrls
};
