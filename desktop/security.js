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
  return Boolean(normalizedDocumentUrl(value)) && normalizedDocumentUrl(value) === normalizedDocumentUrl(trustedUrl);
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
  normalizedDocumentUrl
};
