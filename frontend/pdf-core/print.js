/**
 * Print PDF from in-memory bytes (no re-open of source file).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfCore = root.SwiftLocalPdfCore || {};
    root.SwiftLocalPdfCore.print = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function isSupported() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  /**
   * Print using a temporary blob URL so the original path stays unlocked.
   */
  async function printDocument(session) {
    if (!isSupported()) {
      throw new Error("列印尚未在此環境可用");
    }
    if (!session || !session.bytes || !session.bytes.length) {
      throw new Error("沒有可列印的 PDF");
    }

    const blob = new Blob([session.bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    // Prefer hidden iframe so we do not navigate the workspace away.
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "PDF 列印");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const cleanup = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
      try {
        iframe.remove();
      } catch {
        // ignore
      }
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (ok, extra) => {
        if (settled) return;
        settled = true;
        // Delay cleanup so the print dialog can read the blob.
        setTimeout(cleanup, 60_000);
        if (ok) resolve(Object.assign({ ok: true, mode: "blob-iframe" }, extra || {}));
        else reject(extra instanceof Error ? extra : new Error(String(extra || "列印失敗")));
      };

      iframe.onload = () => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            finish(false, new Error("無法建立列印視窗"));
            return;
          }
          // Some engines need a tick before print.
          setTimeout(() => {
            try {
              win.focus();
              win.print();
              finish(true);
            } catch (error) {
              // Fallback: open blob in a new tab/window.
              try {
                const popup = window.open(url, "_blank");
                if (popup) {
                  popup.addEventListener("load", () => {
                    try {
                      popup.focus();
                      popup.print();
                    } catch {
                      // user can print manually
                    }
                  });
                  finish(true, { mode: "blob-window" });
                } else {
                  finish(false, error);
                }
              } catch (fallbackError) {
                finish(false, fallbackError);
              }
            }
          }, 250);
        } catch (error) {
          finish(false, error);
        }
      };

      iframe.onerror = () => finish(false, new Error("無法載入 PDF 進行列印"));
      iframe.src = url;
    });
  }

  return {
    isSupported,
    printDocument
  };
});
