"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("swiftLocalBackend", {
  isAvailable: true,
  detectTools: () => ipcRenderer.invoke("backend:detect-tools"),
  getConfig: () => ipcRenderer.invoke("backend:get-config"),
  setToolPath: (key, toolPath) => ipcRenderer.invoke("backend:set-tool-path", key, toolPath),
  chooseExecutable: (options) => ipcRenderer.invoke("backend:choose-executable", options),
  chooseFiles: (options) => ipcRenderer.invoke("backend:choose-files", options),
  chooseDirectory: () => ipcRenderer.invoke("backend:choose-directory"),
  openPath: (targetPath) => ipcRenderer.invoke("backend:open-path", targetPath),
  enqueueJob: (payload) => ipcRenderer.invoke("backend:enqueue-job", payload),
  getJobs: () => ipcRenderer.invoke("backend:get-jobs"),
  onJobsUpdated: (callback) => {
    const handler = (_event, jobs) => callback(jobs);
    ipcRenderer.on("backend:jobs-updated", handler);
    return () => ipcRenderer.removeListener("backend:jobs-updated", handler);
  }
});
