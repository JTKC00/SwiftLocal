/**
 * PDF.js viewer core: open in memory, render pages/thumbnails, search, close without file locks.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfCore = root.SwiftLocalPdfCore || {};
    root.SwiftLocalPdfCore.viewer = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4;
  const DEFAULT_THUMB_MAX = 140;
  let pdfjsModulePromise = null;

  function createEmptySession(overrides) {
    return Object.assign({
      id: `pdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: "",
      sourcePath: "",
      bytes: null,
      pageCount: 0,
      currentPage: 1,
      zoom: 1,
      fitMode: "page",
      rotationView: 0,
      /** Permanent page rotations (degrees) keyed by 1-based page number — baked on save. */
      pageRotations: Object.create(null),
      dirty: false,
      meta: null,
      /** @type {object|null} PDF.js PDFDocumentProxy */
      _pdf: null,
      /** @type {object|null} loading task for destroy */
      _loadingTask: null,
      /** page size cache: pageNumber -> { width, height } at scale 1 */
      _pageSizes: null,
      /** search state */
      search: null,
      /** @type {object|null} active PDF.js TextLayer instance */
      _textLayer: null,
      /** True when opened with a user password (never persisted). */
      wasPasswordProtected: false
    }, overrides || {});
  }

  /**
   * Absolute base URL for vendored PDF.js assets.
   * Must NOT be relative to this script (pdf-core/viewer.js), because dynamic
   * import() resolves relative specifiers against the calling module/script URL
   * — that incorrectly becomes /pdf-core/vendor/... instead of /vendor/...
   */
  function resolvePdfJsBaseUrl() {
    if (typeof window === "undefined" || !window.location) {
      return "./vendor/pdfjs/";
    }
    const pathname = String(window.location.pathname || "").replace(/\\/g, "/");
    // Document-relative, then absolutized via the page URL (not this script).
    const relative = pathname.includes("/pdf-workspace")
      ? "../vendor/pdfjs/"
      : "vendor/pdfjs/";
    try {
      return new URL(relative, window.location.href).href;
    } catch {
      // Fallback: site-root absolute (npm start / serve.js).
      const origin = window.location.origin || "";
      return `${origin}/vendor/pdfjs/`;
    }
  }

  async function loadPdfJs() {
    if (pdfjsModulePromise) return pdfjsModulePromise;

    pdfjsModulePromise = (async () => {
      // Browser: vendored build next to frontend (works with file:// and serve.js).
      if (typeof window !== "undefined") {
        const base = resolvePdfJsBaseUrl();
        // Absolute URL so import is never resolved under /pdf-core/.
        const mainUrl = new URL("pdf.min.mjs", base).href;
        const workerUrl = new URL("pdf.worker.min.mjs", base).href;
        const module = await import(/* webpackIgnore: true */ mainUrl);
        if (module.GlobalWorkerOptions) {
          module.GlobalWorkerOptions.workerSrc = workerUrl;
        }
        return { module, base, isNode: false };
      }
      // Node tests / tooling: use package legacy build without worker.
      const module = await import("pdfjs-dist/legacy/build/pdf.mjs");
      return { module, base: "", isNode: true };
    })();

    return pdfjsModulePromise;
  }

  function documentOptions(data, base, isNode, password) {
    const opts = {
      data,
      disableWorker: Boolean(isNode),
      useWorkerFetch: false,
      isEvalSupported: false,
      verbosity: 0
    };
    if (password) {
      opts.password = String(password);
    }
    if (base) {
      opts.cMapUrl = `${base}cmaps/`;
      opts.cMapPacked = true;
      opts.standardFontDataUrl = `${base}standard_fonts/`;
      opts.wasmUrl = `${base}wasm/`;
    }
    return opts;
  }

  function makePasswordError(code, message) {
    const error = new Error(message || (code === "password_incorrect" ? "密碼不正確" : "此 PDF 需要密碼"));
    error.code = code;
    error.name = "PdfPasswordError";
    return error;
  }

  function classifyOpenError(error, hadPassword) {
    const detail = error && error.message ? error.message : String(error || "");
    const name = error && error.name ? String(error.name) : "";
    const code = error && (error.code || error.passwordResponse);
    const looksPassword =
      name === "PasswordException" ||
      code === 1 ||
      code === 2 ||
      /password|encrypt/i.test(detail);
    if (!looksPassword) return null;
    // pdf.js: PasswordResponses.NEED_PASSWORD = 1, INCORRECT_PASSWORD = 2
    if (code === 2 || hadPassword || /incorrect|Invalid password|密碼不正確/i.test(detail)) {
      return makePasswordError("password_incorrect", "密碼不正確，請再試一次。");
    }
    return makePasswordError("password_required", "此 PDF 已加密，請輸入密碼。");
  }

  function clampZoom(zoom) {
    const value = Number(zoom);
    if (!Number.isFinite(value)) return 1;
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }

  function toUint8Copy(bytes) {
    if (bytes instanceof Uint8Array) return bytes.slice();
    if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes.slice(0));
    if (typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(bytes)) {
      return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice();
    }
    return new Uint8Array(bytes);
  }

  /**
   * Load PDF bytes into a session. File handles must already be closed by the caller.
   * @param {object} [options.password] optional user/owner password for encrypted PDFs
   */
  async function openFromBytes(bytes, options) {
    const opts = options || {};
    const password = opts.password != null ? String(opts.password) : "";
    // Keep a stable memory copy for print/export. PDF.js may transfer/detach its data buffer.
    const retained = toUint8Copy(bytes);
    const forPdfJs = retained.slice();
    const { module: pdfjs, base, isNode } = await loadPdfJs();

    let loadingTask;
    let pdf;
    try {
      loadingTask = pdfjs.getDocument(documentOptions(forPdfJs, base, isNode, password));
      pdf = await loadingTask.promise;
    } catch (error) {
      const passwordError = classifyOpenError(error, Boolean(password));
      if (passwordError) throw passwordError;
      const detail = error && error.message ? error.message : String(error || "");
      throw new Error(`無法開啟 PDF：${detail}`);
    }

    const session = createEmptySession({
      name: opts.name || "document.pdf",
      sourcePath: opts.sourcePath || "",
      bytes: retained,
      pageCount: pdf.numPages || 0,
      currentPage: 1,
      zoom: 1,
      fitMode: "page",
      rotationView: 0,
      pageRotations: Object.create(null),
      dirty: false,
      wasPasswordProtected: Boolean(password),
      _pdf: pdf,
      _loadingTask: loadingTask,
      _pageSizes: Object.create(null),
      search: null,
      meta: {
        loadedAt: new Date().toISOString(),
        byteLength: retained.byteLength,
        engine: "pdf.js",
        note: "文件已載入記憶體；原始檔案控制權可釋放。"
      }
    });

    // Warm first page size for fit calculations.
    if (session.pageCount > 0) {
      await getPageSize(session, 1);
    }
    return session;
  }

  function getPageRotation(session, pageNumber) {
    if (!session) return 0;
    const map = session.pageRotations || {};
    const value = map[pageNumber] != null ? map[pageNumber] : map[String(pageNumber)];
    const n = Number(value) || 0;
    return ((n % 360) + 360) % 360;
  }

  /**
   * Permanently rotate a page (baked on save). Delta is usually +90.
   */
  function rotatePage(session, pageNumber, deltaDegrees) {
    if (!session) return 0;
    if (!session.pageRotations) session.pageRotations = Object.create(null);
    const page = Math.max(1, Math.round(Number(pageNumber) || 1));
    const delta = Number(deltaDegrees) || 0;
    const next = (getPageRotation(session, page) + delta + 360) % 360;
    session.pageRotations[page] = next;
    session.dirty = true;
    // Invalidate size cache for this page (orientation may swap).
    if (session._pageSizes) {
      delete session._pageSizes[String(page)];
    }
    return next;
  }

  async function getPageSize(session, pageNumber) {
    if (!session || !session._pdf) return { width: 1, height: 1 };
    const rotation = getPageRotation(session, pageNumber);
    const key = `${pageNumber}@${rotation}`;
    if (session._pageSizes && session._pageSizes[key]) {
      return session._pageSizes[key];
    }
    const page = await session._pdf.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale: 1, rotation });
      const size = { width: viewport.width, height: viewport.height };
      if (session._pageSizes) session._pageSizes[key] = size;
      return size;
    } finally {
      if (typeof page.cleanup === "function") page.cleanup();
    }
  }

  function cancelTextLayer(session) {
    if (!session || !session._textLayer) return;
    try {
      if (typeof session._textLayer.cancel === "function") {
        session._textLayer.cancel();
      }
    } catch {
      // ignore
    }
    session._textLayer = null;
  }

  async function closeSession(session) {
    if (!session) return;
    cancelTextLayer(session);
    const pdf = session._pdf;
    const task = session._loadingTask;
    session._pdf = null;
    session._loadingTask = null;
    session.bytes = null;
    session.pageCount = 0;
    session.currentPage = 1;
    session.dirty = false;
    session.pageRotations = Object.create(null);
    session.wasPasswordProtected = false;
    session.annotations = [];
    session.annotationDirty = false;
    session.meta = null;
    session._pageSizes = null;
    session.search = null;
    try {
      if (pdf && typeof pdf.destroy === "function") await pdf.destroy();
    } catch {
      // ignore
    }
    try {
      if (task && typeof task.destroy === "function") await task.destroy();
    } catch {
      // ignore
    }
  }

  function setCurrentPage(session, page) {
    if (!session) return 1;
    const total = Math.max(1, session.pageCount || 1);
    const next = Math.min(total, Math.max(1, Math.round(Number(page) || 1)));
    session.currentPage = next;
    return next;
  }

  function setZoom(session, zoom) {
    if (!session) return 1;
    session.zoom = clampZoom(zoom);
    session.fitMode = "custom";
    return session.zoom;
  }

  function setRotationView(session, degrees) {
    // Legacy global view rotation — prefer rotatePage for savable edits.
    if (!session) return 0;
    const value = ((Number(degrees) || 0) % 360 + 360) % 360;
    session.rotationView = value;
    session._pageSizes = Object.create(null);
    return value;
  }

  /**
   * Compute zoom for fit-page / fit-width against a container size.
   */
  async function computeFitZoom(session, containerSize, mode) {
    if (!session || !session._pdf) return 1;
    const size = await getPageSize(session, session.currentPage || 1);
    const pad = 24;
    const cw = Math.max(40, (containerSize && containerSize.width) || 800) - pad;
    const ch = Math.max(40, (containerSize && containerSize.height) || 600) - pad;
    if (mode === "width") {
      return clampZoom(cw / Math.max(1, size.width));
    }
    // page
    return clampZoom(Math.min(cw / Math.max(1, size.width), ch / Math.max(1, size.height)));
  }

  async function applyFit(session, containerSize, mode) {
    const fitMode = mode === "width" ? "width" : "page";
    const zoom = await computeFitZoom(session, containerSize, fitMode);
    if (!session) return 1;
    session.zoom = zoom;
    session.fitMode = fitMode;
    return zoom;
  }

  /**
   * Render a page into a canvas element (optionally with a selectable text layer).
   * @param {object} [options.textLayerDiv] DOM node for PDF.js TextLayer overlay
   * @param {boolean} [options.highlightSearch] mark spans that match session.search.query
   * @returns {Promise<{ width: number, height: number, hasTextLayer: boolean }>}
   */
  async function renderPageToCanvas(session, pageNumber, canvas, options) {
    if (!session || !session._pdf) throw new Error("沒有已開啟的 PDF");
    if (!canvas) throw new Error("缺少 canvas");
    const opts = options || {};
    const page = await session._pdf.getPage(pageNumber);
    try {
      const scale = clampZoom(opts.scale != null ? opts.scale : session.zoom || 1);
      const rotation = opts.rotation != null
        ? opts.rotation
        : getPageRotation(session, pageNumber);
      const viewport = page.getViewport({ scale, rotation });
      const outputScale = opts.outputScale != null
        ? opts.outputScale
        : (typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1);
      const cssWidth = Math.max(1, Math.floor(viewport.width));
      const cssHeight = Math.max(1, Math.floor(viewport.height));
      const width = Math.max(1, Math.floor(viewport.width * outputScale));
      const height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("無法建立繪圖內容");
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      if (outputScale !== 1) {
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      }
      const renderTask = page.render({
        canvasContext: context,
        viewport,
        intent: opts.intent || "display"
      });
      await renderTask.promise;

      let hasTextLayer = false;
      const textLayerDiv = opts.textLayerDiv || null;
      if (textLayerDiv && typeof document !== "undefined" && opts.skipTextLayer !== true) {
        hasTextLayer = await renderTextLayerForPage(session, page, viewport, textLayerDiv, {
          highlightSearch: opts.highlightSearch !== false,
          cssWidth,
          cssHeight,
          scale
        });
      }

      return { width: viewport.width, height: viewport.height, hasTextLayer };
    } finally {
      if (typeof page.cleanup === "function") page.cleanup();
    }
  }

  /**
   * Build PDF.js TextLayer so users can select and copy text.
   */
  async function renderTextLayerForPage(session, page, viewport, textLayerDiv, options) {
    const opts = options || {};
    cancelTextLayer(session);
    textLayerDiv.innerHTML = "";
    textLayerDiv.classList.add("textLayer");
    textLayerDiv.style.width = `${opts.cssWidth || Math.floor(viewport.width)}px`;
    textLayerDiv.style.height = `${opts.cssHeight || Math.floor(viewport.height)}px`;
    textLayerDiv.style.setProperty("--scale-factor", String(opts.scale || viewport.scale || 1));
    textLayerDiv.setAttribute("aria-hidden", "false");

    let TextLayerCtor = null;
    try {
      const loaded = await loadPdfJs();
      TextLayerCtor = loaded.module && loaded.module.TextLayer;
    } catch {
      TextLayerCtor = null;
    }
    if (!TextLayerCtor) {
      textLayerDiv.setAttribute("aria-hidden", "true");
      return false;
    }

    const textContent = await page.getTextContent();
    const textLayer = new TextLayerCtor({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport
    });
    session._textLayer = textLayer;
    await textLayer.render();

    if (opts.highlightSearch !== false) {
      highlightSearchInTextLayer(textLayerDiv, session && session.search && session.search.query);
    }
    return true;
  }

  /**
   * Lightweight highlight: mark text spans whose content includes the query.
   * (Spans may split words; this is best-effort, not a full find-controller.)
   */
  function highlightSearchInTextLayer(textLayerDiv, query) {
    if (!textLayerDiv) return 0;
    textLayerDiv.querySelectorAll("span.highlight").forEach((el) => {
      el.classList.remove("highlight", "selected");
    });
    const q = String(query || "").trim();
    if (!q) return 0;
    const needle = q.toLowerCase();
    let count = 0;
    textLayerDiv.querySelectorAll("span").forEach((span) => {
      const text = String(span.textContent || "");
      if (!text) return;
      if (text.toLowerCase().includes(needle)) {
        span.classList.add("highlight");
        count += 1;
      }
    });
    return count;
  }

  /**
   * Selected text within the page stage / document selection.
   */
  function getSelectedText(root) {
    if (typeof window === "undefined" || !window.getSelection) return "";
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return "";
    if (root && typeof root.contains === "function") {
      const range = sel.getRangeAt(0);
      const startOk = root.contains(range.startContainer);
      const endOk = root.contains(range.endContainer);
      if (!startOk && !endOk) return "";
    }
    return String(sel.toString() || "").replace(/\u00a0/g, " ");
  }

  async function copySelectedText(root) {
    const text = getSelectedText(root);
    if (!text.trim()) {
      return { ok: false, text: "", reason: "empty" };
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, text, mode: "clipboard" };
    }
    // Fallback for older environments
    if (typeof document !== "undefined") {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        return { ok: true, text, mode: "execCommand" };
      } finally {
        ta.remove();
      }
    }
    return { ok: false, text, reason: "unsupported" };
  }

  async function renderThumbnail(session, pageNumber, canvas, maxEdge) {
    const size = await getPageSize(session, pageNumber);
    const edge = maxEdge || DEFAULT_THUMB_MAX;
    const scale = Math.min(edge / Math.max(1, size.width), edge / Math.max(1, size.height), 1);
    return renderPageToCanvas(session, pageNumber, canvas, {
      scale,
      outputScale: 1,
      intent: "display",
      skipTextLayer: true
    });
  }

  /**
   * Full-text search across pages (sequential). Returns matches with snippets.
   */
  async function searchDocument(session, query, options) {
    if (!session || !session._pdf) throw new Error("沒有已開啟的 PDF");
    const q = String(query || "").trim();
    if (!q) {
      session.search = { query: "", matches: [], index: 0 };
      return session.search;
    }
    const opts = options || {};
    const maxMatches = Math.max(1, Math.min(500, Number(opts.maxMatches) || 200));
    const caseSensitive = Boolean(opts.caseSensitive);
    const needle = caseSensitive ? q : q.toLowerCase();
    const matches = [];
    const total = session.pageCount || 0;

    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      if (matches.length >= maxMatches) break;
      const page = await session._pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = (content.items || [])
          .map((item) => (item && item.str ? String(item.str) : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!text) continue;
        const hay = caseSensitive ? text : text.toLowerCase();
        let from = 0;
        while (from < hay.length && matches.length < maxMatches) {
          const at = hay.indexOf(needle, from);
          if (at < 0) break;
          const start = Math.max(0, at - 24);
          const end = Math.min(text.length, at + q.length + 24);
          const snippet = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
          matches.push({
            page: pageNumber,
            index: at,
            snippet
          });
          from = at + Math.max(1, needle.length);
        }
      } finally {
        if (typeof page.cleanup === "function") page.cleanup();
      }
    }

    session.search = { query: q, matches, index: matches.length ? 0 : -1 };
    return session.search;
  }

  function getActiveSearchMatch(session) {
    if (!session || !session.search || !session.search.matches || !session.search.matches.length) {
      return null;
    }
    const idx = session.search.index;
    if (idx < 0 || idx >= session.search.matches.length) return null;
    return session.search.matches[idx];
  }

  function stepSearch(session, delta) {
    if (!session || !session.search || !session.search.matches.length) return null;
    const len = session.search.matches.length;
    let next = (session.search.index + delta) % len;
    if (next < 0) next += len;
    session.search.index = next;
    const match = session.search.matches[next];
    setCurrentPage(session, match.page);
    return match;
  }

  /**
   * Replace session bytes after save (re-open PDF.js on the same session object).
   */
  async function replaceSessionBytes(session, bytes, options) {
    if (!session) throw new Error("沒有工作階段");
    const opts = options || {};
    const preserved = {
      name: opts.name || session.name || "document.pdf",
      sourcePath: opts.sourcePath != null ? opts.sourcePath : (session.sourcePath || ""),
      currentPage: session.currentPage || 1,
      zoom: session.zoom || 1,
      fitMode: session.fitMode || "page"
    };
    await closeSession(session);
    const next = await openFromBytes(bytes, {
      name: preserved.name,
      sourcePath: preserved.sourcePath,
      password: opts.password || ""
    });
    Object.assign(session, next);
    session.currentPage = Math.min(preserved.currentPage, session.pageCount || 1) || 1;
    session.zoom = preserved.zoom;
    session.fitMode = preserved.fitMode;
    session.dirty = false;
    session.pageRotations = Object.create(null);
    // Detach so GC does not double-destroy if next is dropped.
    next._pdf = null;
    next._loadingTask = null;
    next.bytes = null;
    return session;
  }

  return {
    MIN_ZOOM,
    MAX_ZOOM,
    createEmptySession,
    loadPdfJs,
    openFromBytes,
    closeSession,
    cancelTextLayer,
    setCurrentPage,
    setZoom,
    setRotationView,
    getPageRotation,
    rotatePage,
    replaceSessionBytes,
    computeFitZoom,
    applyFit,
    getPageSize,
    renderPageToCanvas,
    renderTextLayerForPage,
    highlightSearchInTextLayer,
    getSelectedText,
    copySelectedText,
    renderThumbnail,
    searchDocument,
    getActiveSearchMatch,
    stepSearch
  };
});
