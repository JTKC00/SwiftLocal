/**
 * Standalone PDF workspace window entry.
 */
(function () {
  "use strict";

  function boot() {
    const host = document.getElementById("pdf-workspace-host");
    if (!host || !window.SwiftLocalPdfWorkspace) {
      const status = document.getElementById("pdf-workspace-boot-status");
      if (status) status.textContent = "無法載入 PDF 工作區模組";
      return;
    }
    const api = window.SwiftLocalPdfWorkspace.mountPdfWorkspace(host, {
      standalone: true
    });
    window.__swiftLocalPdfWorkspaceApi = api;

    const openLaunchPath = (filePath) => {
      if (!filePath || !api.openPath) return;
      void api.openPath(filePath);
    };

    // Desktop IPC: main process may send a path after open-with / menu open.
    if (window.swiftLocalBackend && typeof window.swiftLocalBackend.onPdfWorkspaceOpenPath === "function") {
      window.swiftLocalBackend.onPdfWorkspaceOpenPath((filePath) => {
        openLaunchPath(filePath);
      });
    }

    // Path buffered before this page subscribed (preload).
    if (window.swiftLocalBackend && typeof window.swiftLocalBackend.getPendingPdfOpenPath === "function") {
      const pending = window.swiftLocalBackend.getPendingPdfOpenPath();
      if (pending) openLaunchPath(pending);
    }

    // Query param backup from loadFile({ query: { file } }).
    const params = new URLSearchParams(window.location.search || "");
    const launch = params.get("file");
    if (launch) openLaunchPath(launch);

    const back = document.getElementById("pdf-workspace-back-toolbox");
    if (back) {
      back.addEventListener("click", () => {
        // Desktop: open toolbox window via IPC; browser: navigate sibling page.
        if (window.swiftLocalBackend && typeof window.swiftLocalBackend.openToolbox === "function") {
          void window.swiftLocalBackend.openToolbox();
          return;
        }
        window.location.href = "../index.html";
      });
    }

    const setDefault = document.getElementById("pdf-workspace-set-default");
    if (setDefault) {
      const desktop = Boolean(window.swiftLocalBackend && window.swiftLocalBackend.isAvailable);
      setDefault.hidden = !desktop;
      setDefault.addEventListener("click", async () => {
        if (!window.swiftLocalBackend || typeof window.swiftLocalBackend.openPdfAssociationSettings !== "function") {
          return;
        }
        try {
          const result = await window.swiftLocalBackend.openPdfAssociationSettings();
          const status = document.getElementById("pdf-workspace-boot-status");
          if (status && result && result.message) status.textContent = result.message;
        } catch (error) {
          const status = document.getElementById("pdf-workspace-boot-status");
          if (status) status.textContent = error && error.message ? error.message : "無法開啟系統設定";
        }
      });
    }

    // Standalone chrome: association help when available.
    const bootStatus = document.getElementById("pdf-workspace-boot-status");
    if (bootStatus && window.swiftLocalBackend && typeof window.swiftLocalBackend.getPdfAssociationStatus === "function") {
      void window.swiftLocalBackend.getPdfAssociationStatus().then((status) => {
        if (status && status.message) {
          bootStatus.title = status.message;
        }
      }).catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
