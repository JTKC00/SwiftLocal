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
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });
      const list = Array.isArray(paths) ? paths.filter(Boolean) : [];
      // Desktop scaffold: paths only; bytes loaded later by workspace.
      return { files: [], paths: list };
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
      const cleanup = () => {
        input.remove();
      };
      input.addEventListener("change", () => {
        const files = Array.from(input.files || []);
        cleanup();
        resolve({ files, paths: [] });
      }, { once: true });
      document.body.appendChild(input);
      input.click();
      // If user cancels, change may never fire; leave input for GC on next open.
      setTimeout(() => {
        if (!input.files || !input.files.length) {
          // keep for late cancel; harmless orphan removed on next pick
        }
      }, 0);
    });
  }

  return {
    choosePdfFiles,
    pickViaInput
  };
});
