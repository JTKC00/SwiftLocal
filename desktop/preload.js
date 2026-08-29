"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Buffer workspace events that fire before the page subscribes.
const pendingOpenPaths = [];
let openPathSubscriberCount = 0;
const pendingCloseChecks = [];
let closeCheckSubscriberCount = 0;

function normalizeOpenRequest(payload) {
  if (payload && typeof payload === "object") {
    return {
      path: payload.path || payload.filePath || "",
      identityKey: payload.identityKey || "",
      asNewTab: Boolean(payload.asNewTab),
      appendToWorkspace: Boolean(payload.appendToWorkspace)
    };
  }
  return { path: payload || "", identityKey: "", asNewTab: false, appendToWorkspace: false };
}

function bufferOpenPath(payload) {
  const request = normalizeOpenRequest(payload);
  const value = request.path ? String(request.path) : "";
  const key = request.identityKey || value;
  if (!key || pendingOpenPaths.some((pending) => {
    const existing = normalizeOpenRequest(pending);
    return (existing.identityKey || existing.path) === key;
  })) return;
  pendingOpenPaths.push({
    path: value,
    identityKey: key,
    asNewTab: request.asNewTab,
    appendToWorkspace: request.appendToWorkspace
  });
}

ipcRenderer.on("pdf-workspace:open-path", (_event, payload) => {
  if (!openPathSubscriberCount) bufferOpenPath(payload);
});

ipcRenderer.on("pdf-workspace:close-check", (_event, requestId) => {
  if (!closeCheckSubscriberCount && requestId) pendingCloseChecks.push(String(requestId));
});

contextBridge.exposeInMainWorld("swiftLocalBackend", {
  isAvailable: true,
  detectTools: () => ipcRenderer.invoke("backend:detect-tools"),
  getConfig: () => ipcRenderer.invoke("backend:get-config"),
  setDefaultOutputDir: (outputDir) => ipcRenderer.invoke("backend:set-default-output-dir", outputDir),
  setToolPath: (key, toolPath) => ipcRenderer.invoke("backend:set-tool-path", key, toolPath),
  chooseExecutable: (options) => ipcRenderer.invoke("backend:choose-executable", options),
  chooseFiles: (options) => ipcRenderer.invoke("backend:choose-files", options),
  chooseDirectory: () => ipcRenderer.invoke("backend:choose-directory"),
  openPath: (targetPath) => ipcRenderer.invoke("backend:open-path", targetPath),
  getMediaDownloadStatus: () => ipcRenderer.invoke("media-download:status"),
  analyzeMediaUrl: (payload) => ipcRenderer.invoke("media-download:analyze", payload || {}),
  startMediaDownload: (payload) => ipcRenderer.invoke("media-download:start", payload || {}),
  cancelMediaDownload: () => ipcRenderer.invoke("media-download:cancel"),
  openMediaDownloadResult: (kind) => ipcRenderer.invoke("media-download:open-result", kind || "file"),
  onMediaDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on("media-download:progress", handler);
    return () => ipcRenderer.removeListener("media-download:progress", handler);
  },
  enqueueJob: (payload) => ipcRenderer.invoke("backend:enqueue-job", payload),
  deleteJob: (jobId) => ipcRenderer.invoke("backend:delete-job", jobId),
  cancelJob: (jobId) => ipcRenderer.invoke("backend:cancel-job", jobId),
  retryJob: (jobId) => ipcRenderer.invoke("backend:retry-job", jobId),
  copyJob: (jobId) => ipcRenderer.invoke("backend:copy-job", jobId),
  jobDiagnostic: (jobId) => ipcRenderer.invoke("backend:job-diagnostic", jobId),
  cleanupJobs: (options) => ipcRenderer.invoke("backend:cleanup-jobs", options || {}),
  getJobs: () => ipcRenderer.invoke("backend:get-jobs"),
  readJobTextOutputs: (jobId) => ipcRenderer.invoke("backend:read-job-text-outputs", jobId),
  getFilePath: (file) => webUtils.getPathForFile(file),
  onJobsUpdated: (callback) => {
    const handler = (_event, jobs) => callback(jobs);
    ipcRenderer.on("backend:jobs-updated", handler);
    return () => ipcRenderer.removeListener("backend:jobs-updated", handler);
  },
  openPdfWorkspace: (filePath) => ipcRenderer.invoke("pdf-workspace:open", filePath || ""),
  openPdfFiles: (filePaths) => ipcRenderer.invoke("pdf-workspace:open-files", filePaths || []),
  getPdfAssociationStatus: () => ipcRenderer.invoke("pdf-workspace:association-status"),
  openPdfAssociationSettings: () => ipcRenderer.invoke("pdf-workspace:open-association-settings"),
  openToolbox: () => ipcRenderer.invoke("app:open-toolbox"),
  readLocalFile: (filePath) => ipcRenderer.invoke("pdf-workspace:read-file", filePath),
  chooseSavePath: (options) => ipcRenderer.invoke("pdf-workspace:choose-save-path", options || {}),
  writeLocalFile: (filePath, data) => ipcRenderer.invoke("pdf-workspace:write-file", filePath, data),
  sanitizePdf: (data) => ipcRenderer.invoke("pdf-workspace:sanitize-pdf", data),
  onPdfWorkspaceOpenPath: (callback) => {
    const handler = (_event, payload) => callback(normalizeOpenRequest(payload));
    openPathSubscriberCount += 1;
    ipcRenderer.on("pdf-workspace:open-path", handler);
    // Deliver any paths that arrived before the listener was attached.
    const pending = pendingOpenPaths.splice(0, pendingOpenPaths.length);
    pending.forEach((payload) => {
      try {
        callback(normalizeOpenRequest(payload));
      } catch {
        // ignore
      }
    });
    return () => {
      openPathSubscriberCount = Math.max(0, openPathSubscriberCount - 1);
      ipcRenderer.removeListener("pdf-workspace:open-path", handler);
    };
  },
  onPdfWorkspaceCloseCheck: (callback) => {
    const handler = (_event, requestId) => callback(String(requestId || ""));
    closeCheckSubscriberCount += 1;
    ipcRenderer.on("pdf-workspace:close-check", handler);
    const pending = pendingCloseChecks.splice(0, pendingCloseChecks.length);
    pending.forEach((requestId) => {
      try {
        callback(requestId);
      } catch {
        // ignore
      }
    });
    return () => {
      closeCheckSubscriberCount = Math.max(0, closeCheckSubscriberCount - 1);
      ipcRenderer.removeListener("pdf-workspace:close-check", handler);
    };
  },
  respondPdfWorkspaceCloseCheck: (requestId, state) => {
    ipcRenderer.send("pdf-workspace:close-check-response", {
      requestId: String(requestId || ""),
      state: state && typeof state === "object" ? state : { dirty: true, unavailable: true }
    });
  },
  getPendingPdfOpenPath: () => normalizeOpenRequest(pendingOpenPaths[0]).path || "",
  getPendingPdfOpenPaths: () => pendingOpenPaths.map((payload) => normalizeOpenRequest(payload).path)
});
