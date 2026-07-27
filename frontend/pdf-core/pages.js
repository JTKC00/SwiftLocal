/**
 * In-workspace page organization (delete / reorder / insert / duplicate).
 * Rebuilds PDF bytes with pdf-lib, then caller re-opens via viewer.replaceSessionBytes.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfCore = root.SwiftLocalPdfCore || {};
    root.SwiftLocalPdfCore.pages = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  async function loadPdfLib() {
    if (typeof window !== "undefined" && window.PDFLib) {
      return window.PDFLib;
    }
    try {
      return require("pdf-lib");
    } catch {
      throw new Error("找不到 pdf-lib，無法整理頁面");
    }
  }

  async function loadDoc(bytes) {
    const PDFLib = await loadPdfLib();
    const { PDFDocument } = PDFLib;
    try {
      const doc = await PDFDocument.load(bytes, {
        ignoreEncryption: true,
        updateMetadata: false
      });
      return { PDFLib, doc };
    } catch (error) {
      const detail = error && error.message ? error.message : String(error || "");
      if (/encrypt|password/i.test(detail)) {
        const err = new Error("此 PDF 已加密，無法整理頁面。請先解密或讓工作區自動淨化後再試。");
        err.code = "encrypted_pdf";
        throw err;
      }
      const err = new Error(`無法整理頁面：${detail}`);
      err.code = "load_failed";
      throw err;
    }
  }

  function normalizePageList(pages, pageCount) {
    const total = Math.max(0, Number(pageCount) || 0);
    const list = (Array.isArray(pages) ? pages : [pages])
      .map((n) => Math.round(Number(n)))
      .filter((n) => n >= 1 && n <= total);
    return Array.from(new Set(list)).sort((a, b) => a - b);
  }

  /**
   * Map old 1-based page number through a reorder/delete operation.
   * newOrder: array of old 1-based page numbers in new sequence.
   * Returns new page number or 0 if deleted.
   */
  function mapPageThroughOrder(oldPage, newOrder) {
    const idx = newOrder.indexOf(oldPage);
    return idx >= 0 ? idx + 1 : 0;
  }

  function remapSessionPages(session, newOrder) {
    if (!session) return;
    // form field page numbers
    if (Array.isArray(session.formFields)) {
      session.formFields = session.formFields
        .map((field) => {
          const next = mapPageThroughOrder(field.page, newOrder);
          if (!next) return null;
          return Object.assign({}, field, { page: next });
        })
        .filter(Boolean);
    }
    // annotations
    if (Array.isArray(session.annotations)) {
      session.annotations = session.annotations
        .map((ann) => {
          const next = mapPageThroughOrder(ann.page, newOrder);
          if (!next) return null;
          return Object.assign({}, ann, { page: next });
        })
        .filter(Boolean);
    }
    // page rotations
    if (session.pageRotations) {
      const nextRot = Object.create(null);
      Object.keys(session.pageRotations).forEach((key) => {
        const oldPage = Number(key);
        const next = mapPageThroughOrder(oldPage, newOrder);
        if (next) nextRot[next] = session.pageRotations[key];
      });
      session.pageRotations = nextRot;
    }
    // current page
    const mappedCurrent = mapPageThroughOrder(session.currentPage || 1, newOrder);
    session.currentPage = mappedCurrent || 1;
  }

  /**
   * Build new PDF bytes from a sequence of source page indices (0-based).
   */
  async function rebuildFromIndices(bytes, zeroBasedOrder) {
    const { PDFLib, doc } = await loadDoc(bytes);
    const { PDFDocument } = PDFLib;
    const out = await PDFDocument.create();
    if (!zeroBasedOrder.length) {
      // Always keep at least one blank page
      out.addPage([612, 792]);
    } else {
      const copied = await out.copyPages(doc, zeroBasedOrder);
      copied.forEach((page) => out.addPage(page));
    }
    // Note: AcroForm widgets may not copy perfectly with copyPages for all PDFs.
    // Values are re-applied on save via formValues when field names still exist.
    const saved = await out.save({ useObjectStreams: false, updateFieldAppearances: false });
    return saved instanceof Uint8Array ? saved : new Uint8Array(saved);
  }

  /**
   * Reorder pages. newOrder is 1-based page numbers in desired order (must be permutation).
   */
  async function reorderPages(session, newOrder) {
    if (!session || !session.bytes) throw new Error("沒有可整理的 PDF");
    const count = session.pageCount || 0;
    const order = (Array.isArray(newOrder) ? newOrder : []).map((n) => Math.round(Number(n)));
    if (order.length !== count) {
      throw new Error("頁面順序長度與頁數不符");
    }
    const set = new Set(order);
    for (let i = 1; i <= count; i += 1) {
      if (!set.has(i)) throw new Error("頁面順序必須包含每一頁且不重複");
    }
    const zero = order.map((n) => n - 1);
    const bytes = await rebuildFromIndices(session.bytes, zero);
    remapSessionPages(session, order);
    session.dirty = true;
    return { bytes, newOrder: order };
  }

  /**
   * Delete pages (1-based). Cannot delete all pages (leaves one blank if needed).
   */
  async function deletePages(session, pageNumbers) {
    if (!session || !session.bytes) throw new Error("沒有可整理的 PDF");
    const count = session.pageCount || 0;
    const toDelete = new Set(normalizePageList(pageNumbers, count));
    if (!toDelete.size) throw new Error("請選擇要刪除的頁面");
    if (toDelete.size >= count) {
      throw new Error("不能刪除全部頁面；請至少保留一頁");
    }
    const newOrder = [];
    for (let i = 1; i <= count; i += 1) {
      if (!toDelete.has(i)) newOrder.push(i);
    }
    const zero = newOrder.map((n) => n - 1);
    const bytes = await rebuildFromIndices(session.bytes, zero);
    remapSessionPages(session, newOrder);
    session.dirty = true;
    return { bytes, newOrder, deleted: Array.from(toDelete) };
  }

  /**
   * Duplicate a page after itself.
   */
  async function duplicatePage(session, pageNumber) {
    if (!session || !session.bytes) throw new Error("沒有可整理的 PDF");
    const count = session.pageCount || 0;
    const page = Math.max(1, Math.min(count, Math.round(Number(pageNumber) || 1)));
    const newOrder = [];
    for (let i = 1; i <= count; i += 1) {
      newOrder.push(i);
      if (i === page) newOrder.push(i); // duplicate reference to same source page
    }
    // remap: for annotations/forms on pages after insert, shift
    // rebuild uses source indices; remap needs mapping old->new carefully
    const zero = newOrder.map((n) => n - 1);
    const bytes = await rebuildFromIndices(session.bytes, zero);
    // Build old->new map: first occurrence keeps page, later pages shift
    const remapOrder = [];
    let seenDup = false;
    for (let i = 1; i <= count; i += 1) {
      if (i < page) remapOrder.push(i);
      else if (i === page) {
        remapOrder.push(i); // original stays at same index in new? 
        // Actually after rebuild page list: 1..page, page, page+1...
        // old page k maps to: k if k <= page, k+1 if k > page
      } else {
        remapOrder.push(i + 1);
      }
    }
    // Simpler remap for annotations:
    if (Array.isArray(session.annotations)) {
      session.annotations = session.annotations.map((ann) => {
        if (ann.page > page) return Object.assign({}, ann, { page: ann.page + 1 });
        return ann;
      });
    }
    if (Array.isArray(session.formFields)) {
      session.formFields = session.formFields.map((field) => {
        if (field.page > page) return Object.assign({}, field, { page: field.page + 1 });
        return field;
      });
    }
    if (session.pageRotations) {
      const nextRot = Object.create(null);
      Object.keys(session.pageRotations).forEach((key) => {
        const p = Number(key);
        if (p > page) nextRot[p + 1] = session.pageRotations[key];
        else nextRot[p] = session.pageRotations[key];
      });
      // copy rotation onto duplicated page
      if (session.pageRotations[page] != null) {
        nextRot[page + 1] = session.pageRotations[page];
      }
      session.pageRotations = nextRot;
    }
    session.currentPage = page + 1;
    session.dirty = true;
    return { bytes, insertedAt: page + 1 };
  }

  /**
   * Insert a blank page at 1-based position (1 = beginning, count+1 = end).
   */
  async function insertBlankPage(session, atPage) {
    if (!session || !session.bytes) throw new Error("沒有可整理的 PDF");
    const { PDFLib, doc } = await loadDoc(session.bytes);
    const { PDFDocument } = PDFLib;
    const count = doc.getPageCount();
    const at = Math.max(1, Math.min(count + 1, Math.round(Number(atPage) || count + 1)));
    const out = await PDFDocument.create();
    const indices = Array.from({ length: count }, (_v, i) => i);
    const before = indices.slice(0, at - 1);
    const after = indices.slice(at - 1);
    if (before.length) {
      const pages = await out.copyPages(doc, before);
      pages.forEach((p) => out.addPage(p));
    }
    // Match size of neighbor page if possible
    let size = [612, 792];
    try {
      const refPage = doc.getPage(Math.min(count - 1, Math.max(0, at - 2 >= 0 ? at - 2 : 0)));
      const { width, height } = refPage.getSize();
      size = [width, height];
    } catch {
      // default letter
    }
    out.addPage(size);
    if (after.length) {
      const pages = await out.copyPages(doc, after);
      pages.forEach((p) => out.addPage(p));
    }
    const saved = await out.save({ useObjectStreams: false, updateFieldAppearances: false });
    const bytes = saved instanceof Uint8Array ? saved : new Uint8Array(saved);

    // Shift pages >= at
    if (Array.isArray(session.annotations)) {
      session.annotations = session.annotations.map((ann) => {
        if (ann.page >= at) return Object.assign({}, ann, { page: ann.page + 1 });
        return ann;
      });
    }
    if (Array.isArray(session.formFields)) {
      session.formFields = session.formFields.map((field) => {
        if (field.page >= at) return Object.assign({}, field, { page: field.page + 1 });
        return field;
      });
    }
    if (session.pageRotations) {
      const nextRot = Object.create(null);
      Object.keys(session.pageRotations).forEach((key) => {
        const p = Number(key);
        nextRot[p >= at ? p + 1 : p] = session.pageRotations[key];
      });
      session.pageRotations = nextRot;
    }
    session.currentPage = at;
    session.dirty = true;
    return { bytes, insertedAt: at };
  }

  /**
   * Insert all pages from another PDF bytes at position.
   */
  async function insertPdfBytes(session, otherBytes, atPage) {
    if (!session || !session.bytes) throw new Error("沒有可整理的 PDF");
    if (!otherBytes || !otherBytes.length) throw new Error("沒有可插入的 PDF");
    const { PDFLib, doc } = await loadDoc(session.bytes);
    const other = await loadDoc(otherBytes);
    const { PDFDocument } = PDFLib;
    const count = doc.getPageCount();
    const insertCount = other.doc.getPageCount();
    if (!insertCount) throw new Error("插入的 PDF 沒有頁面");
    const at = Math.max(1, Math.min(count + 1, Math.round(Number(atPage) || count + 1)));
    const out = await PDFDocument.create();
    const before = Array.from({ length: at - 1 }, (_v, i) => i);
    const after = Array.from({ length: count - (at - 1) }, (_v, i) => at - 1 + i);
    if (before.length) {
      (await out.copyPages(doc, before)).forEach((p) => out.addPage(p));
    }
    const incoming = Array.from({ length: insertCount }, (_v, i) => i);
    (await out.copyPages(other.doc, incoming)).forEach((p) => out.addPage(p));
    if (after.length) {
      (await out.copyPages(doc, after)).forEach((p) => out.addPage(p));
    }
    const saved = await out.save({ useObjectStreams: false, updateFieldAppearances: false });
    const bytes = saved instanceof Uint8Array ? saved : new Uint8Array(saved);

    if (Array.isArray(session.annotations)) {
      session.annotations = session.annotations.map((ann) => {
        if (ann.page >= at) return Object.assign({}, ann, { page: ann.page + insertCount });
        return ann;
      });
    }
    if (Array.isArray(session.formFields)) {
      session.formFields = session.formFields.map((field) => {
        if (field.page >= at) return Object.assign({}, field, { page: field.page + insertCount });
        return field;
      });
    }
    if (session.pageRotations) {
      const nextRot = Object.create(null);
      Object.keys(session.pageRotations).forEach((key) => {
        const p = Number(key);
        nextRot[p >= at ? p + insertCount : p] = session.pageRotations[key];
      });
      session.pageRotations = nextRot;
    }
    session.currentPage = at;
    session.dirty = true;
    return { bytes, insertedAt: at, insertedCount: insertCount };
  }

  /**
   * Extract pages into a new PDF byte array (does not modify session).
   */
  async function extractPages(session, pageNumbers) {
    if (!session || !session.bytes) throw new Error("沒有可整理的 PDF");
    const count = session.pageCount || 0;
    const list = normalizePageList(pageNumbers, count);
    if (!list.length) throw new Error("請選擇要匯出的頁面");
    const zero = list.map((n) => n - 1);
    return rebuildFromIndices(session.bytes, zero);
  }

  return {
    reorderPages,
    deletePages,
    duplicatePage,
    insertBlankPage,
    insertPdfBytes,
    extractPages,
    rebuildFromIndices,
    mapPageThroughOrder
  };
});
