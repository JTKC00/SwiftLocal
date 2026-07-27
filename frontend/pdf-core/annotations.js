/**
 * Signature image + date stamp annotations (PDF workspace phase 3).
 * Stamps live in session until save; signatures library is localStorage-only.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfCore = root.SwiftLocalPdfCore || {};
    root.SwiftLocalPdfCore.annotations = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SIGNATURES_KEY = "swiftlocal.signatures";
  const MAX_SIGNATURES = 8;
  const MAX_SIGNATURE_BYTES = 400 * 1024; // data URL size budget per signature
  const DEFAULT_SIG_WIDTH = 120;
  const DEFAULT_SIG_HEIGHT = 48;
  const DEFAULT_DATE_FONT = 12;

  function isSupported() {
    return true;
  }

  function uid(prefix) {
    return `${prefix || "ann"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getSharedSettings() {
    if (typeof window !== "undefined" && window.SwiftLocalShared) {
      return window.SwiftLocalShared;
    }
    try {
      return require("../shared/settings");
    } catch {
      return null;
    }
  }

  // --- Signature library (local only) ---

  function listSavedSignatures() {
    const settings = getSharedSettings();
    if (settings && typeof settings.readSetting === "function") {
      const list = settings.readSetting("signatures", null);
      if (Array.isArray(list)) return list.filter(Boolean);
    }
    try {
      if (typeof localStorage === "undefined") return [];
      const raw = localStorage.getItem(SIGNATURES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function persistSignatures(list) {
    const trimmed = (list || []).slice(0, MAX_SIGNATURES);
    const settings = getSharedSettings();
    if (settings && typeof settings.writeSetting === "function") {
      settings.writeSetting("signatures", trimmed);
      return trimmed;
    }
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SIGNATURES_KEY, JSON.stringify(trimmed));
      }
    } catch {
      // quota
    }
    return trimmed;
  }

  /**
   * @param {{ name?: string, dataUrl: string, width?: number, height?: number }} entry
   */
  function saveSignature(entry) {
    const dataUrl = entry && entry.dataUrl ? String(entry.dataUrl) : "";
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(dataUrl)) {
      throw new Error("簽名圖必須是 PNG／JPEG／WebP");
    }
    if (dataUrl.length > MAX_SIGNATURE_BYTES) {
      throw new Error("簽名圖太大（請用較小的 PNG／JPEG，建議寬度 400px 以內）");
    }
    const list = listSavedSignatures();
    const item = {
      id: uid("sig"),
      name: (entry.name || `簽名 ${list.length + 1}`).slice(0, 40),
      dataUrl,
      width: Number(entry.width) > 0 ? Number(entry.width) : DEFAULT_SIG_WIDTH,
      height: Number(entry.height) > 0 ? Number(entry.height) : DEFAULT_SIG_HEIGHT,
      createdAt: new Date().toISOString()
    };
    list.unshift(item);
    persistSignatures(list);
    return item;
  }

  function removeSignature(id) {
    const list = listSavedSignatures().filter((item) => item.id !== id);
    persistSignatures(list);
    return list;
  }

  function clearSignatures() {
    persistSignatures([]);
  }

  // --- Session annotations ---

  function ensureAnnotationState(session) {
    if (!session) return;
    if (!Array.isArray(session.annotations)) session.annotations = [];
  }

  function listAnnotations(session) {
    ensureAnnotationState(session);
    return session ? session.annotations.slice() : [];
  }

  function listAnnotationsOnPage(session, pageNumber) {
    const page = Math.max(1, Math.round(Number(pageNumber) || 1));
    return listAnnotations(session).filter((ann) => ann.page === page);
  }

  function isAnnotationDirty(session) {
    return Boolean(session && Array.isArray(session.annotations) && session.annotations.length);
  }

  function markDirty(session) {
    if (!session) return;
    session.dirty = true;
    session.annotationDirty = true;
  }

  /**
   * Add a signature stamp on a page (PDF user-space coords, origin bottom-left).
   */
  function addSignatureStamp(session, options) {
    if (!session) throw new Error("沒有工作階段");
    ensureAnnotationState(session);
    const opts = options || {};
    const dataUrl = opts.dataUrl || opts.imageDataUrl || "";
    if (!dataUrl) throw new Error("缺少簽名圖片");
    const page = Math.max(1, Math.round(Number(opts.page) || session.currentPage || 1));
    const width = Number(opts.width) > 0 ? Number(opts.width) : DEFAULT_SIG_WIDTH;
    const height = Number(opts.height) > 0 ? Number(opts.height) : DEFAULT_SIG_HEIGHT;
    const x = Number(opts.x);
    const y = Number(opts.y);
    const ann = {
      id: uid("stamp"),
      type: "signature",
      page,
      x: Number.isFinite(x) ? x : 72,
      y: Number.isFinite(y) ? y : 72,
      width,
      height,
      imageDataUrl: dataUrl,
      label: opts.label || "簽名"
    };
    session.annotations.push(ann);
    markDirty(session);
    return ann;
  }

  function formatDateStamp(date, style) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    if (style === "slash") return `${day}/${m}/${y}`;
    if (style === "dot") return `${y}.${m}.${day}`;
    // ISO default — Latin-safe for Helvetica appearance
    return `${y}-${m}-${day}`;
  }

  function addDateStamp(session, options) {
    if (!session) throw new Error("沒有工作階段");
    ensureAnnotationState(session);
    const opts = options || {};
    const page = Math.max(1, Math.round(Number(opts.page) || session.currentPage || 1));
    const text = opts.text || formatDateStamp(opts.date, opts.style || "iso");
    const fontSize = Number(opts.fontSize) > 0 ? Number(opts.fontSize) : DEFAULT_DATE_FONT;
    const width = Number(opts.width) > 0 ? Number(opts.width) : Math.max(72, text.length * fontSize * 0.6);
    const height = Number(opts.height) > 0 ? Number(opts.height) : fontSize * 1.6;
    const x = Number(opts.x);
    const y = Number(opts.y);
    const ann = {
      id: uid("date"),
      type: "date",
      page,
      x: Number.isFinite(x) ? x : 72,
      y: Number.isFinite(y) ? y : 72,
      width,
      height,
      text,
      fontSize,
      color: opts.color || { r: 0.1, g: 0.1, b: 0.15 }
    };
    session.annotations.push(ann);
    markDirty(session);
    return ann;
  }

  function updateAnnotation(session, id, patch) {
    ensureAnnotationState(session);
    const ann = session.annotations.find((item) => item.id === id);
    if (!ann) return null;
    const next = patch || {};
    ["x", "y", "width", "height", "page", "text", "fontSize", "imageDataUrl"].forEach((key) => {
      if (next[key] != null) ann[key] = next[key];
    });
    markDirty(session);
    return ann;
  }

  function removeAnnotation(session, id) {
    ensureAnnotationState(session);
    const before = session.annotations.length;
    session.annotations = session.annotations.filter((item) => item.id !== id);
    if (session.annotations.length !== before) markDirty(session);
    return session.annotations.length !== before;
  }

  function clearAnnotations(session) {
    if (!session) return;
    session.annotations = [];
    session.annotationDirty = false;
  }

  async function addAnnotation(session, annotation) {
    if (!annotation || !annotation.type) {
      throw new Error("無效的標記");
    }
    if (annotation.type === "signature") {
      return addSignatureStamp(session, annotation);
    }
    if (annotation.type === "date") {
      return addDateStamp(session, annotation);
    }
    throw new Error(`不支援的標記類型：${annotation.type}`);
  }

  // --- Coordinate helpers (PDF user space ↔ CSS overlay) ---

  async function getPageMetrics(session, pageNumber) {
    const rotation = session && session.pageRotations
      ? (session.pageRotations[pageNumber] || session.pageRotations[String(pageNumber)] || 0)
      : 0;
    if (session && session._pdf && typeof session._pdf.getPage === "function") {
      const page = await session._pdf.getPage(pageNumber);
      try {
        const unscaled = page.getViewport({ scale: 1, rotation: 0 });
        return {
          pageWidth: unscaled.width,
          pageHeight: unscaled.height,
          rotation,
          page
        };
      } finally {
        // caller may use page; don't cleanup here if we return page
      }
    }
    return { pageWidth: 612, pageHeight: 792, rotation, page: null };
  }

  /**
   * Convert CSS point (top-left origin on stage) to PDF user space (bottom-left).
   */
  async function cssPointToPdf(session, pageNumber, cssX, cssY, cssWidth, cssHeight) {
    const rotation = session && session.pageRotations
      ? (session.pageRotations[pageNumber] || session.pageRotations[String(pageNumber)] || 0)
      : 0;
    if (session && session._pdf) {
      try {
        const page = await session._pdf.getPage(pageNumber);
        const unscaled = page.getViewport({ scale: 1, rotation });
        const scale = cssWidth / Math.max(1, unscaled.width);
        const viewport = page.getViewport({ scale, rotation });
        const pdf = viewport.convertToPdfPoint(cssX, cssY);
        if (typeof page.cleanup === "function") page.cleanup();
        return { x: pdf[0], y: pdf[1] };
      } catch {
        // fall through
      }
    }
    // Fallback: no rotation
    const pageHeight = 792;
    const scaleX = 612 / Math.max(1, cssWidth);
    const scaleY = pageHeight / Math.max(1, cssHeight);
    return {
      x: cssX * scaleX,
      y: pageHeight - cssY * scaleY
    };
  }

  async function pdfRectToCss(session, pageNumber, rect, cssWidth, cssHeight) {
    if (!rect) return null;
    const forms = (typeof window !== "undefined" && window.SwiftLocalPdfCore && window.SwiftLocalPdfCore.forms)
      || (function () {
        try {
          return require("./forms");
        } catch {
          return null;
        }
      })();
    if (forms && typeof forms.rectToViewportBox === "function") {
      return forms.rectToViewportBox(session, pageNumber, rect, cssWidth, cssHeight);
    }
    return null;
  }

  function dataUrlToBytes(dataUrl) {
    const match = String(dataUrl || "").match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!match) throw new Error("無效的圖片資料");
    const b64 = match[2];
    if (typeof Buffer !== "undefined") {
      return {
        mime: match[1].toLowerCase() === "png" ? "png" : "jpg",
        bytes: new Uint8Array(Buffer.from(b64, "base64"))
      };
    }
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return {
      mime: match[1].toLowerCase() === "png" ? "png" : "jpg",
      bytes
    };
  }

  /**
   * Draw session annotations onto a pdf-lib PDFDocument (after form values preferred).
   */
  async function applyAnnotationsToPdfDoc(pdfDoc, session, PDFLib) {
    if (!pdfDoc || !session || !Array.isArray(session.annotations) || !session.annotations.length) {
      return { applied: 0 };
    }
    const { StandardFonts, rgb } = PDFLib;
    const pages = pdfDoc.getPages();
    let font = null;
    try {
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    } catch {
      font = null;
    }
    let applied = 0;
    for (const ann of session.annotations) {
      const pageIndex = Math.max(0, (ann.page || 1) - 1);
      if (pageIndex >= pages.length) continue;
      const page = pages[pageIndex];
      try {
        if (ann.type === "signature" && ann.imageDataUrl) {
          const { mime, bytes } = dataUrlToBytes(ann.imageDataUrl);
          let image;
          if (mime === "png") image = await pdfDoc.embedPng(bytes);
          else image = await pdfDoc.embedJpg(bytes);
          page.drawImage(image, {
            x: Number(ann.x) || 0,
            y: Number(ann.y) || 0,
            width: Math.max(8, Number(ann.width) || DEFAULT_SIG_WIDTH),
            height: Math.max(8, Number(ann.height) || DEFAULT_SIG_HEIGHT)
          });
          applied += 1;
        } else if (ann.type === "date" && ann.text) {
          const size = Number(ann.fontSize) > 0 ? Number(ann.fontSize) : DEFAULT_DATE_FONT;
          const color = ann.color || { r: 0.1, g: 0.1, b: 0.15 };
          const text = String(ann.text);
          // Use Latin-safe subset; replace non-latin with fallback already avoided by ISO dates.
          page.drawText(text, {
            x: Number(ann.x) || 0,
            y: Number(ann.y) || 0,
            size,
            font: font || undefined,
            color: rgb(color.r || 0, color.g || 0, color.b || 0)
          });
          applied += 1;
        }
      } catch {
        // skip bad stamp
      }
    }
    return { applied };
  }

  return {
    phase: 3,
    isSupported,
    SIGNATURES_KEY,
    MAX_SIGNATURES,
    listSavedSignatures,
    saveSignature,
    removeSignature,
    clearSignatures,
    listAnnotations,
    listAnnotationsOnPage,
    isAnnotationDirty,
    addAnnotation,
    addSignatureStamp,
    addDateStamp,
    formatDateStamp,
    updateAnnotation,
    removeAnnotation,
    clearAnnotations,
    cssPointToPdf,
    pdfRectToCss,
    applyAnnotationsToPdfDoc,
    dataUrlToBytes
  };
});
