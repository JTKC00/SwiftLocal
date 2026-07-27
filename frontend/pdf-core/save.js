/**
 * Save / Save As for PDF workspace.
 * Applies permanent page rotations via pdf-lib, then writes or downloads.
 * Policy: write temp then replace when saving in place (desktop).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfCore = root.SwiftLocalPdfCore || {};
    root.SwiftLocalPdfCore.save = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const POLICY = Object.freeze({
    preferSaveAs: true,
    writeTempThenReplace: true,
    releaseHandleAfterLoad: true
  });

  function isSupported() {
    return true;
  }

  async function loadPdfLib() {
    if (typeof window !== "undefined" && window.PDFLib) {
      return window.PDFLib;
    }
    try {
      return require("pdf-lib");
    } catch (error) {
      throw new Error("找不到 pdf-lib，無法儲存 PDF");
    }
  }

  function normalizeRotation(value) {
    const n = Number(value) || 0;
    const r = ((n % 360) + 360) % 360;
    if (r === 0 || r === 90 || r === 180 || r === 270) return r;
    // snap to nearest 90
    return Math.round(r / 90) * 90 % 360;
  }

  function hasPendingRotations(session) {
    const map = (session && session.pageRotations) || {};
    return Object.keys(map).some((key) => normalizeRotation(map[key]) !== 0);
  }

  function isDirty(session) {
    return Boolean(
      session && (
        session.dirty ||
        session.formDirty ||
        session.annotationDirty ||
        hasPendingRotations(session) ||
        (Array.isArray(session.annotations) && session.annotations.length > 0)
      )
    );
  }

  function getFormsApi() {
    if (typeof window !== "undefined" && window.SwiftLocalPdfCore && window.SwiftLocalPdfCore.forms) {
      return window.SwiftLocalPdfCore.forms;
    }
    try {
      return require("./forms");
    } catch {
      return null;
    }
  }

  function getAnnotationsApi() {
    if (typeof window !== "undefined" && window.SwiftLocalPdfCore && window.SwiftLocalPdfCore.annotations) {
      return window.SwiftLocalPdfCore.annotations;
    }
    try {
      return require("./annotations");
    } catch {
      return null;
    }
  }

  /**
   * Bake page rotations + AcroForm values into a new PDF byte array.
   * @returns {Promise<Uint8Array>}
   */
  async function exportBytes(session) {
    if (!session || !session.bytes || !session.bytes.length) {
      throw new Error("沒有可儲存的 PDF");
    }
    const PDFLib = await loadPdfLib();
    const { PDFDocument, degrees } = PDFLib;

    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(session.bytes, {
        // ignoreEncryption only helps non-standard cases; real encryption still fails.
        ignoreEncryption: true,
        updateMetadata: false
      });
    } catch (error) {
      const detail = error && error.message ? error.message : String(error || "");
      if (/encrypt|password/i.test(detail)) {
        const err = new Error("此 PDF 已加密，無法直接儲存修改。請先使用工具箱「PDF 解密」後再開啟。");
        err.code = "encrypted_pdf";
        throw err;
      }
      throw new Error(`無法準備儲存：${detail}`);
    }

    const pages = pdfDoc.getPages();
    const rotations = session.pageRotations || {};
    pages.forEach((page, index) => {
      const pageNumber = index + 1;
      const extra = normalizeRotation(
        rotations[pageNumber] != null ? rotations[pageNumber] : rotations[String(pageNumber)]
      );
      if (!extra) return;
      const current = page.getRotation().angle || 0;
      page.setRotation(degrees((current + extra) % 360));
    });

    const forms = getFormsApi();
    if (forms && typeof forms.applyValuesToPdfDoc === "function" && session.formValues) {
      forms.applyValuesToPdfDoc(pdfDoc, session.formValues);
    }

    const annotations = getAnnotationsApi();
    if (annotations && typeof annotations.applyAnnotationsToPdfDoc === "function") {
      await annotations.applyAnnotationsToPdfDoc(pdfDoc, session, PDFLib);
    }

    const saved = await pdfDoc.save({
      useObjectStreams: false,
      // Appearances already best-effort updated in applyValuesToPdfDoc.
      updateFieldAppearances: false
    });
    return saved instanceof Uint8Array ? saved : new Uint8Array(saved);
  }

  /**
   * Browser download helper.
   */
  function downloadBytes(bytes, fileName) {
    if (typeof document === "undefined") {
      throw new Error("目前環境無法下載檔案");
    }
    const name = fileName || "document.pdf";
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name.endsWith(".pdf") ? name : `${name}.pdf`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { ok: true, mode: "download", name: a.download };
  }

  function electronBridge() {
    return typeof window !== "undefined" ? window.swiftLocalBackend : null;
  }

  /**
   * Save As — desktop dialog or browser download.
   * @returns {Promise<{ ok: boolean, path?: string, mode: string, bytes: Uint8Array }>}
   */
  async function saveAs(session, suggestedName) {
    const bytes = await exportBytes(session);
    const bridge = electronBridge();
    const defaultName = suggestedName
      || (session && session.name)
      || "document.pdf";

    if (bridge && typeof bridge.chooseSavePath === "function" && typeof bridge.writeLocalFile === "function") {
      const target = await bridge.chooseSavePath({
        title: "另存 PDF",
        defaultPath: defaultName.endsWith(".pdf") ? defaultName : `${defaultName}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }]
      });
      if (!target) {
        return { ok: false, mode: "cancelled", bytes };
      }
      await bridge.writeLocalFile(target, bytes);
      return { ok: true, mode: "desktop-save-as", path: target, bytes };
    }

    const result = downloadBytes(bytes, defaultName);
    return { ok: true, mode: result.mode, path: "", bytes, name: result.name };
  }

  /**
   * Save in place when sourcePath is known (desktop). Falls back to saveAs.
   */
  async function saveInPlace(session) {
    const bridge = electronBridge();
    const sourcePath = session && session.sourcePath ? String(session.sourcePath) : "";
    if (!sourcePath || !bridge || typeof bridge.writeLocalFile !== "function") {
      return saveAs(session);
    }
    const bytes = await exportBytes(session);
    await bridge.writeLocalFile(sourcePath, bytes);
    return { ok: true, mode: "desktop-save", path: sourcePath, bytes };
  }

  return {
    POLICY,
    isSupported,
    isDirty,
    hasPendingRotations,
    exportBytes,
    downloadBytes,
    saveAs,
    saveInPlace
  };
});
