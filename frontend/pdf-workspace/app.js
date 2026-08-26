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

    const launchUtils = window.SwiftLocalPdfWorkspaceLaunch || null;
    const launchPathGate = launchUtils && typeof launchUtils.createPathRequestGate === "function"
      ? launchUtils.createPathRequestGate()
      : null;
    const normalizeOpenRequest = (payload) => {
      if (payload && typeof payload === "object") {
        return {
          path: payload.path || payload.filePath || "",
          asNewTab: Boolean(payload.asNewTab)
        };
      }
      return { path: payload || "", asNewTab: false };
    };

    const openLaunchPath = (payload) => {
      const request = normalizeOpenRequest(payload);
      if (!request.path || !api.openPath) return;
      if (launchPathGate) {
        void launchPathGate.request(request.path, (path) => api.openPath(path, {
          asNewTab: request.asNewTab
        }));
        return;
      }
      void api.openPath(request.path, { asNewTab: request.asNewTab });
    };

    // Desktop IPC: main process may send a path after open-with / menu open.
    if (window.swiftLocalBackend && typeof window.swiftLocalBackend.onPdfWorkspaceOpenPath === "function") {
      window.swiftLocalBackend.onPdfWorkspaceOpenPath((filePath) => {
        openLaunchPath(filePath);
      });
    }

    // Main-process close guard: report every tab, including inactive tabs,
    // without putting document contents or paths on the IPC boundary.
    if (window.swiftLocalBackend &&
        typeof window.swiftLocalBackend.onPdfWorkspaceCloseCheck === "function" &&
        typeof window.swiftLocalBackend.respondPdfWorkspaceCloseCheck === "function") {
      window.swiftLocalBackend.onPdfWorkspaceCloseCheck((requestId) => {
        let state;
        try {
          state = typeof api.getDirtyState === "function"
            ? api.getDirtyState()
            : { dirty: true, unavailable: true };
        } catch {
          state = { dirty: true, unavailable: true };
        }
        window.swiftLocalBackend.respondPdfWorkspaceCloseCheck(requestId, state);
      });
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
