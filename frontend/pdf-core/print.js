/**
 * Print PDF from the in-memory PDF.js document (no re-open of source file).
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

  function renderScaleFor(pageCount) {
    const count = Math.max(1, Number(pageCount) || 1);
    if (count > 80) return 1;
    if (count > 30) return 1.25;
    return 1.5;
  }

  function createPrintFrame() {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "PDF 列印");
    iframe.setAttribute("aria-hidden", "true");
    // Keep a real layout viewport. A 0×0 PDF iframe can produce blank pages in
    // Electron/Chromium because the embedded PDF viewer never lays out content.
    iframe.style.position = "fixed";
    iframe.style.left = "-100000px";
    iframe.style.top = "0";
    iframe.style.width = "1000px";
    iframe.style.height = "1200px";
    iframe.style.border = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const printDoc = iframe.contentDocument;
    if (!printDoc) {
      iframe.remove();
      throw new Error("無法建立列印頁面");
    }

    printDoc.open();
    printDoc.write(`<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>PDF 列印</title>
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .pdf-print-page {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: 100%;
    min-height: 1px;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
    background: #fff;
  }
  .pdf-print-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  canvas {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
    background: #fff;
  }
</style>
</head>
<body></body>
</html>`);
    printDoc.close();

    return { iframe, printDoc };
  }

  async function renderPages(session, printDoc) {
    if (!session || !session._pdf || typeof session._pdf.getPage !== "function") {
      throw new Error("PDF 列印引擎尚未準備完成");
    }

    const pageCount = Math.max(0, Number(session.pageCount || session._pdf.numPages) || 0);
    if (!pageCount) throw new Error("PDF 沒有可列印頁面");

    const scale = renderScaleFor(pageCount);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await session._pdf.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale });
        const section = printDoc.createElement("section");
        section.className = "pdf-print-page";
        section.setAttribute("data-page", String(pageNumber));

        const canvas = printDoc.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error(`無法建立第 ${pageNumber} 頁列印畫布`);

        context.save();
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();

        section.appendChild(canvas);
        printDoc.body.appendChild(section);

        const renderTask = page.render({
          canvas,
          viewport,
          intent: "print",
          background: "rgb(255,255,255)"
        });
        await renderTask.promise;
      } finally {
        if (page && typeof page.cleanup === "function") page.cleanup();
      }
    }
  }

  function nextPaint(win) {
    return new Promise((resolve) => {
      const raf = win && typeof win.requestAnimationFrame === "function"
        ? win.requestAnimationFrame.bind(win)
        : (callback) => setTimeout(callback, 16);
      raf(() => raf(resolve));
    });
  }

  /**
   * Render every PDF page into a real off-screen print document before opening
   * the system print dialog. This avoids Chromium's blank embedded-PDF print.
   */
  async function printDocument(session) {
    if (!isSupported()) {
      throw new Error("列印尚未在此環境可用");
    }
    if (!session || !session.bytes || !session.bytes.length) {
      throw new Error("沒有可列印的 PDF");
    }

    const { iframe, printDoc } = createPrintFrame();
    let cleanupTimer = null;
    const cleanup = () => {
      if (cleanupTimer) clearTimeout(cleanupTimer);
      try {
        iframe.remove();
      } catch {
        // ignore
      }
    };

    try {
      await renderPages(session, printDoc);
      const printWindow = iframe.contentWindow;
      if (!printWindow) throw new Error("無法建立列印視窗");

      if (printDoc.fonts && printDoc.fonts.ready) {
        await printDoc.fonts.ready.catch(() => {});
      }
      await nextPaint(printWindow);

      printWindow.focus();
      printWindow.print();

      // Chromium may hand the rasterized pages to the print subsystem after
      // print() returns, so retain the frame briefly instead of removing it now.
      cleanupTimer = setTimeout(cleanup, 60_000);
      return {
        ok: true,
        mode: "pdfjs-canvas",
        pages: session.pageCount || session._pdf.numPages || 0
      };
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  return {
    isSupported,
    renderScaleFor,
    printDocument
  };
});