/**
 * File open helpers: Electron dialog when available, else <input type=file>.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalShared = root.SwiftLocalShared || {};
    Object.assign(root.SwiftLocalShared, factory());
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function electronBridge() {
    return typeof window !== "undefined" ? window.swiftLocalBackend : null;
  }

  /**
   * @returns {Promise<{ files: File[], paths: string[] }>}
   */
  async function choosePdfFiles(options) {
    const opts = options || {};
    const multiple = opts.multiple !== false;
    const bridge = electronBridge();

    if (bridge && typeof bridge.chooseFiles === "function") {
      const paths = await bridge.chooseFiles({
        title: opts.title || "開啟 PDF",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        multiple
      });
      const list = Array.isArray(paths) ? paths.filter(Boolean) : [];
      // Desktop scaffold: paths only; bytes loaded later by workspace.
      return { files: [], paths: multiple ? list : list.slice(0, 1) };
    }

    return pickViaInput({ accept: "application/pdf,.pdf", multiple });
  }

  function pickViaInput({ accept, multiple }) {
    return new Promise((resolve) => {
      if (typeof document === "undefined") {
        resolve({ files: [], paths: [] });
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept || "*/*";
      input.multiple = Boolean(multiple);
      input.style.display = "none";
      let settled = false;
      let cleaned = false;
      let pickerOpened = false;
      let focusTimer = null;
      const windowTarget = typeof window !== "undefined" && window && typeof window.addEventListener === "function"
        ? window
        : null;

      const onChange = () => {
        finish(Array.from(input.files || []));
      };
      const onCancel = () => {
        finish([]);
      };
      const onWindowFocus = () => {
        // Older browsers may not dispatch the input's native `cancel` event.
        // Check on the next task so a successful selection can deliver its
        // `change` event and populate `input.files` first.
        if (!pickerOpened || focusTimer !== null) return;
        focusTimer = setTimeout(() => {
          focusTimer = null;
          if (!settled && !(input.files && input.files.length)) finish([]);
        }, 0);
      };
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (focusTimer !== null) {
          clearTimeout(focusTimer);
          focusTimer = null;
        }
        if (typeof input.removeEventListener === "function") {
          input.removeEventListener("change", onChange);
          input.removeEventListener("cancel", onCancel);
        }
        if (windowTarget && typeof windowTarget.removeEventListener === "function") {
          windowTarget.removeEventListener("focus", onWindowFocus);
        }
        try {
          if (typeof input.remove === "function") {
            input.remove();
          } else if (input.parentNode && typeof input.parentNode.removeChild === "function") {
            input.parentNode.removeChild(input);
          }
        } catch {
          // The picker may already have detached the input during cancellation.
        }
      };
      function finish(files) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ files, paths: [] });
      }
      input.addEventListener("change", onChange);
      input.addEventListener("cancel", onCancel);
      if (windowTarget) windowTarget.addEventListener("focus", onWindowFocus);
      document.body.appendChild(input);
      input.click();
      pickerOpened = true;
    });
  }

  return {
    choosePdfFiles,
    pickViaInput
  };
});
