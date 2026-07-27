/**
 * AcroForm fill support (PDF workspace phase 2).
 * Uses pdf-lib to inspect / write fields; shell overlays HTML widgets for editing.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfCore = root.SwiftLocalPdfCore || {};
    root.SwiftLocalPdfCore.forms = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function isSupported() {
    return true;
  }

  async function loadPdfLib() {
    if (typeof window !== "undefined" && window.PDFLib) {
      return window.PDFLib;
    }
    try {
      return require("pdf-lib");
    } catch {
      throw new Error("找不到 pdf-lib，無法處理 PDF 表格");
    }
  }

  function pageNumberForRef(pages, ref) {
    if (!ref || !pages || !pages.length) return 1;
    for (let i = 0; i < pages.length; i += 1) {
      const pageRef = pages[i].ref;
      if (!pageRef) continue;
      if (pageRef === ref) return i + 1;
      if (
        pageRef.objectNumber != null &&
        ref.objectNumber != null &&
        pageRef.objectNumber === ref.objectNumber
      ) {
        return i + 1;
      }
      if (String(pageRef.tag || "") && String(pageRef.tag) === String(ref.tag || "")) {
        return i + 1;
      }
    }
    return 1;
  }

  function fieldTypeName(field) {
    const name = field && field.constructor && field.constructor.name
      ? field.constructor.name
      : "";
    if (name === "PDFTextField") return "text";
    if (name === "PDFCheckBox") return "checkbox";
    if (name === "PDFRadioGroup") return "radio";
    if (name === "PDFDropdown") return "dropdown";
    if (name === "PDFOptionList") return "optionList";
    if (name === "PDFButton") return "button";
    return "unknown";
  }

  function readFieldValue(field, type) {
    try {
      if (type === "text") {
        return field.getText() || "";
      }
      if (type === "checkbox") {
        return Boolean(field.isChecked && field.isChecked());
      }
      if (type === "radio" || type === "dropdown") {
        const selected = field.getSelected && field.getSelected();
        if (Array.isArray(selected)) return selected[0] || "";
        return selected || "";
      }
      if (type === "optionList") {
        const selected = field.getSelected && field.getSelected();
        return Array.isArray(selected) ? selected.slice() : (selected ? [selected] : []);
      }
    } catch {
      // ignore read errors
    }
    return type === "checkbox" ? false : type === "optionList" ? [] : "";
  }

  function readFieldOptions(field, type) {
    try {
      if (type === "radio" || type === "dropdown" || type === "optionList") {
        const opts = field.getOptions && field.getOptions();
        return Array.isArray(opts) ? opts.map(String) : [];
      }
    } catch {
      // ignore
    }
    return [];
  }

  /**
   * Inspect AcroForm fields in PDF bytes.
   * @returns {Promise<{ hasForm: boolean, fieldCount: number, fields: object[] }>}
   */
  async function inspectForm(bytes) {
    if (!bytes || !bytes.length) {
      return { hasForm: false, fieldCount: 0, fields: [] };
    }
    const PDFLib = await loadPdfLib();
    const { PDFDocument } = PDFLib;
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(bytes, {
        ignoreEncryption: true,
        updateMetadata: false
      });
    } catch (error) {
      const detail = error && error.message ? error.message : String(error || "");
      if (/encrypt|password/i.test(detail)) {
        const err = new Error("加密 PDF 無法讀取表格，請先解密。");
        err.code = "encrypted_pdf";
        throw err;
      }
      throw new Error(`無法讀取 PDF 表格：${detail}`);
    }

    let form;
    try {
      form = pdfDoc.getForm();
    } catch {
      return { hasForm: false, fieldCount: 0, fields: [] };
    }

    const pages = pdfDoc.getPages();
    const rawFields = form.getFields();
    if (!rawFields.length) {
      return { hasForm: false, fieldCount: 0, fields: [] };
    }

    const fields = [];
    for (const field of rawFields) {
      let name = "";
      try {
        name = field.getName();
      } catch {
        continue;
      }
      const type = fieldTypeName(field);
      if (type === "button" || type === "unknown") continue;

      let readOnly = false;
      let multiline = false;
      let maxLength = null;
      try {
        readOnly = Boolean(field.isReadOnly && field.isReadOnly());
      } catch {
        // ignore
      }
      if (type === "text") {
        try {
          multiline = Boolean(field.isMultiline && field.isMultiline());
        } catch {
          // ignore
        }
        try {
          const max = field.getMaxLength && field.getMaxLength();
          maxLength = max != null && max > 0 ? max : null;
        } catch {
          // ignore
        }
      }

      const value = readFieldValue(field, type);
      const options = readFieldOptions(field, type);
      let widgets = [];
      try {
        widgets = field.acroField && field.acroField.getWidgets
          ? field.acroField.getWidgets()
          : [];
      } catch {
        widgets = [];
      }

      if (!widgets.length) {
        fields.push({
          name,
          type,
          value,
          options,
          readOnly,
          multiline,
          maxLength,
          page: 1,
          rect: null,
          widgetIndex: 0
        });
        continue;
      }

      widgets.forEach((widget, widgetIndex) => {
        let rect = null;
        try {
          rect = widget.getRectangle();
        } catch {
          rect = null;
        }
        let page = 1;
        try {
          page = pageNumberForRef(pages, widget.P ? widget.P() : null);
        } catch {
          page = 1;
        }
        // Radio: each widget is one option; value still shared.
        let optionValue = "";
        if (type === "radio") {
          try {
            const onValue = widget.getOnValue && widget.getOnValue();
            optionValue = onValue != null ? String(onValue) : (options[widgetIndex] || "");
          } catch {
            optionValue = options[widgetIndex] || "";
          }
        }
        fields.push({
          name,
          type,
          value,
          options,
          optionValue,
          readOnly,
          multiline,
          maxLength,
          page,
          rect: rect
            ? {
              x: Number(rect.x) || 0,
              y: Number(rect.y) || 0,
              width: Number(rect.width) || 0,
              height: Number(rect.height) || 0
            }
            : null,
          widgetIndex
        });
      });
    }

    return {
      hasForm: fields.length > 0,
      fieldCount: new Set(fields.map((f) => f.name)).size,
      fields
    };
  }

  function toUint8(data) {
    if (!data) return null;
    if (data instanceof Uint8Array) return data;
    if (data.type === "Buffer" && Array.isArray(data.data)) return new Uint8Array(data.data);
    if (Array.isArray(data)) return new Uint8Array(data);
    if (data.byteLength != null) return new Uint8Array(data);
    return null;
  }

  /**
   * Some government / InDesign PDFs are permission-encrypted or have broken
   * object streams that pdf-lib cannot load. Desktop can repair via QPDF.
   * @returns {Promise<Uint8Array|null>}
   */
  async function sanitizeBytesIfNeeded(bytes) {
    // First try pdf-lib directly.
    try {
      const PDFLib = await loadPdfLib();
      await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      return null; // already fine
    } catch {
      // continue to repair
    }
    const bridge = typeof window !== "undefined" ? window.swiftLocalBackend : null;
    if (!bridge || typeof bridge.sanitizePdf !== "function") {
      const err = new Error(
        "此 PDF 結構／權限加密令表格引擎無法讀取。請用桌面版（需 QPDF）開啟，或先以 QPDF 解密後再試。"
      );
      err.code = "needs_sanitize";
      throw err;
    }
    const result = await bridge.sanitizePdf(bytes);
    const cleaned = toUint8(result && result.data);
    if (!cleaned || !cleaned.length) {
      const err = new Error("無法修復此 PDF 以供填表");
      err.code = "sanitize_failed";
      throw err;
    }
    // Verify cleaned loads
    try {
      const PDFLib = await loadPdfLib();
      await PDFLib.PDFDocument.load(cleaned, { ignoreEncryption: true, updateMetadata: false });
    } catch (error) {
      const err = new Error(`修復後仍無法讀取表格：${error && error.message ? error.message : error}`);
      err.code = "sanitize_failed";
      throw err;
    }
    return cleaned;
  }

  /**
   * Attach form metadata + value map onto a session.
   * May replace session.bytes with a QPDF-sanitized copy (desktop) when needed.
   * @returns {Promise<{ hasForm: boolean, fieldCount: number, fields: object[], sanitized?: boolean }>}
   */
  async function attachFormToSession(session, options) {
    if (!session || !session.bytes) {
      return { hasForm: false, fieldCount: 0, fields: [] };
    }
    const opts = options || {};
    let bytes = session.bytes;
    let sanitized = false;

    let info;
    try {
      info = await inspectForm(bytes);
    } catch (error) {
      if (opts.allowSanitize === false) throw error;
      const cleaned = await sanitizeBytesIfNeeded(bytes);
      if (!cleaned) throw error;
      bytes = cleaned;
      sanitized = true;
      // Keep viewer/session bytes in sync for save path.
      if (opts.replaceSessionBytes && typeof opts.replaceSessionBytes === "function") {
        await opts.replaceSessionBytes(cleaned);
      } else {
        session.bytes = cleaned.slice();
      }
      info = await inspectForm(bytes);
    }

    session.formFields = info.fields;
    session.formValues = Object.create(null);
    // One value per field name (not per widget).
    const seen = new Set();
    for (const field of info.fields) {
      if (seen.has(field.name)) continue;
      seen.add(field.name);
      session.formValues[field.name] = field.value;
    }
    session.formDirty = false;
    info.sanitized = sanitized;
    return info;
  }

  function listFields(session) {
    return (session && session.formFields) ? session.formFields.slice() : [];
  }

  function listFieldsOnPage(session, pageNumber) {
    const page = Math.max(1, Math.round(Number(pageNumber) || 1));
    return listFields(session).filter((field) => field.page === page);
  }

  function getFormValue(session, name) {
    if (!session || !session.formValues) return undefined;
    return session.formValues[name];
  }

  function setFormValue(session, name, value) {
    if (!session) return;
    if (!session.formValues) session.formValues = Object.create(null);
    session.formValues[name] = value;
    session.formDirty = true;
    session.dirty = true;
  }

  function isFormDirty(session) {
    return Boolean(session && session.formDirty);
  }

  function hasForm(session) {
    return Boolean(session && session.formFields && session.formFields.length);
  }

  /**
   * Apply session.formValues onto an already-loaded pdf-lib PDFDocument.
   */
  function applyValuesToPdfDoc(pdfDoc, formValues) {
    if (!pdfDoc || !formValues) return { applied: 0, skipped: 0 };
    let form;
    try {
      form = pdfDoc.getForm();
    } catch {
      return { applied: 0, skipped: 0 };
    }
    let applied = 0;
    let skipped = 0;
    const names = Object.keys(formValues);
    for (const name of names) {
      let field;
      try {
        field = form.getField(name);
      } catch {
        skipped += 1;
        continue;
      }
      const type = fieldTypeName(field);
      const value = formValues[name];
      try {
        if (type === "text") {
          field.setText(value == null ? "" : String(value));
          applied += 1;
        } else if (type === "checkbox") {
          if (value) field.check();
          else field.uncheck();
          applied += 1;
        } else if (type === "radio") {
          if (value) field.select(String(value));
          applied += 1;
        } else if (type === "dropdown") {
          if (value) field.select(String(value));
          else if (field.clear) field.clear();
          applied += 1;
        } else if (type === "optionList") {
          const list = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);
          if (list.length && field.select) field.select(list);
          applied += 1;
        } else {
          skipped += 1;
        }
      } catch {
        skipped += 1;
      }
    }

    // Best-effort appearances (Latin fonts). CJK may fail — values still stored.
    try {
      form.updateFieldAppearances();
    } catch {
      try {
        const fields = form.getFields();
        for (const field of fields) {
          try {
            if (typeof field.updateAppearances === "function") {
              field.updateAppearances();
            }
          } catch {
            // ignore per-field
          }
        }
      } catch {
        // ignore
      }
    }
    return { applied, skipped };
  }

  /**
   * Map PDF rectangle → CSS box inside a page stage given viewport size and rotation.
   * Uses PDF.js-compatible conversion (origin bottom-left → top-left).
   */
  function rectToCssBox(rect, pageWidth, pageHeight, cssWidth, cssHeight, rotation) {
    if (!rect) return null;
    const rot = ((Number(rotation) || 0) % 360 + 360) % 360;
    const pw = Math.max(1, pageWidth);
    const ph = Math.max(1, pageHeight);
    // Corners in PDF user space
    const corners = [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x + rect.width, rect.y + rect.height],
      [rect.x, rect.y + rect.height]
    ];
    const rotatePoint = (x, y) => {
      if (rot === 90) return [y, pw - x];
      if (rot === 180) return [pw - x, ph - y];
      if (rot === 270) return [ph - y, x];
      return [x, y];
    };
    // After rotation, unrotated page size for scale may swap
    let baseW = pw;
    let baseH = ph;
    if (rot === 90 || rot === 270) {
      baseW = ph;
      baseH = pw;
    }
    const scaleX = cssWidth / baseW;
    const scaleY = cssHeight / baseH;
    const mapped = corners.map(([x, y]) => {
      const [rx, ry] = rotatePoint(x, y);
      // PDF y-up → CSS y-down
      return [rx * scaleX, (baseH - ry) * scaleY];
    });
    const xs = mapped.map((p) => p[0]);
    const ys = mapped.map((p) => p[1]);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    return {
      left,
      top,
      width: Math.max(4, right - left),
      height: Math.max(4, bottom - top)
    };
  }

  /**
   * When PDF.js page + viewport available, prefer convertToViewportPoint.
   */
  async function rectToViewportBox(session, pageNumber, rect, cssWidth, cssHeight) {
    if (!rect) return null;
    const rotation = session && session.pageRotations
      ? (session.pageRotations[pageNumber] || session.pageRotations[String(pageNumber)] || 0)
      : 0;
    if (session && session._pdf && typeof session._pdf.getPage === "function") {
      try {
        const page = await session._pdf.getPage(pageNumber);
        const unscaled = page.getViewport({ scale: 1, rotation });
        const displayScale = cssWidth / Math.max(1, unscaled.width);
        const viewport = page.getViewport({ scale: displayScale, rotation });
        const p1 = viewport.convertToViewportPoint(rect.x, rect.y);
        const p2 = viewport.convertToViewportPoint(rect.x + rect.width, rect.y + rect.height);
        const left = Math.min(p1[0], p2[0]);
        const top = Math.min(p1[1], p2[1]);
        const width = Math.abs(p2[0] - p1[0]);
        const height = Math.abs(p2[1] - p1[1]);
        if (typeof page.cleanup === "function") page.cleanup();
        return {
          left,
          top,
          width: Math.max(4, width),
          height: Math.max(4, height)
        };
      } catch {
        // fall through
      }
    }
    // Fallback without PDF.js page
    return rectToCssBox(rect, 612, 792, cssWidth, cssHeight, rotation);
  }

  return {
    phase: 2,
    isSupported,
    inspectForm,
    sanitizeBytesIfNeeded,
    attachFormToSession,
    listFields,
    listFieldsOnPage,
    getFormValue,
    setFormValue,
    isFormDirty,
    hasForm,
    applyValuesToPdfDoc,
    applyFieldValues: async function applyFieldValues(session, values) {
      if (!session) throw new Error("沒有工作階段");
      if (values && typeof values === "object") {
        Object.keys(values).forEach((name) => setFormValue(session, name, values[name]));
      }
      return session.formValues;
    },
    rectToCssBox,
    rectToViewportBox
  };
});
