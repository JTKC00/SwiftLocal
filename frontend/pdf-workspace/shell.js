/**
 * PDF Workspace shell — PDF.js reading UI (thumbnails, zoom, search, print, unlock-on-close).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfWorkspace = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function getShared() {
    if (typeof window !== "undefined" && window.SwiftLocalShared) {
      return window.SwiftLocalShared;
    }
    try {
      return require("../shared/index.js");
    } catch {
      return null;
    }
  }

  function getCore() {
    if (typeof window !== "undefined" && window.SwiftLocalPdfCore) {
      return window.SwiftLocalPdfCore;
    }
    try {
      return require("../pdf-core/index.js");
    } catch {
      return null;
    }
  }

  function basename(filePath) {
    const text = String(filePath || "");
    const parts = text.split(/[/\\]/);
    return parts[parts.length - 1] || text;
  }

  /**
   * @param {HTMLElement} host
   * @param {object} [options]
   */
  function mountPdfWorkspace(host, options) {
    if (!host) {
      throw new Error("PDF workspace host element is required");
    }
    const opts = options || {};
    const shared = getShared() || {};
    const core = getCore() || {};
    const viewer = core.viewer || null;
    const compatibility = core.compatibility || null;
    const forms = core.forms || null;
    const annotations = core.annotations || null;
    const pagesApi = core.pages || null;

    /** @type {{ id: string, title: string, session: object, dirty?: boolean }[]} */
    let tabs = [];
    let activeTabId = null;
    /** Active document — always mirrors the active tab's session. */
    let session = null;
    let destroyed = false;
    let renderToken = 0;
    let thumbToken = 0;
    let busy = false;
    let formEditEnabled = true;
    /** @type {null|{ mode: 'signature'|'date', signatureId?: string, dataUrl?: string, width?: number, height?: number }} */
    let placeMode = null;
    let selectedStampId = null;
    let activeSignatureId = null;
    let selectedThumbPages = new Set();
    let dragThumbPage = null;
    let openInNewTabNext = false;

    host.classList.add("pdf-ws-root");
    host.innerHTML = buildMarkup();
    bindChrome();
    updateChrome();
    refreshRecent();
    refreshSignatureList();
    renderTabs();

    function $(sel) {
      return host.querySelector(sel);
    }

    function newTabId() {
      return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    }

    function commitSessionToTab() {
      const tab = tabs.find((t) => t.id === activeTabId);
      if (!tab) return;
      tab.session = session;
      if (session) {
        tab.title = session.name || tab.title || "document.pdf";
        tab.dirty = Boolean(core.save && core.save.isDirty(session));
      }
      renderTabs();
    }

    function activateTab(tabId, options) {
      const opts = options || {};
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      activeTabId = tab.id;
      session = tab.session;
      selectedStampId = null;
      selectedThumbPages = new Set();
      placeMode = null;
      renderTabs();
      updateChrome();
      updateFormSidebar();
      if (opts.skipRender) return;
      if (hasDocument()) {
        void Promise.all([renderMainPage(), rebuildThumbnails()]);
      } else {
        const thumbs = $("[data-pdf-ws-thumbs]");
        if (thumbs) {
          thumbs.classList.add("empty");
          thumbs.innerHTML = "<p class=\"pdf-ws-placeholder\">開啟 PDF 後顯示縮圖；可拖放排序</p>";
        }
        const stampLayer = $("[data-pdf-ws-stamp-layer]");
        if (stampLayer) stampLayer.innerHTML = "";
        const formLayer = $("[data-pdf-ws-form-layer]");
        if (formLayer) formLayer.innerHTML = "";
      }
    }

    function createTabWithSession(nextSession, options) {
      const opts = options || {};
      const tab = {
        id: newTabId(),
        title: (nextSession && nextSession.name) || "document.pdf",
        session: nextSession,
        dirty: Boolean(core.save && nextSession && core.save.isDirty(nextSession))
      };
      if (opts.replaceActive && activeTabId) {
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx >= 0) tabs[idx] = tab;
        else tabs.push(tab);
      } else {
        tabs.push(tab);
      }
      activateTab(tab.id, { skipRender: true });
      return tab;
    }

    function closeActiveTab() {
      if (!activeTabId) return;
      const idx = tabs.findIndex((t) => t.id === activeTabId);
      if (idx < 0) return;
      tabs.splice(idx, 1);
      if (!tabs.length) {
        activeTabId = null;
        session = viewer && viewer.createEmptySession ? viewer.createEmptySession() : null;
        renderTabs();
        updateChrome();
        updateFormSidebar();
        const thumbs = $("[data-pdf-ws-thumbs]");
        if (thumbs) {
          thumbs.classList.add("empty");
          thumbs.innerHTML = "<p class=\"pdf-ws-placeholder\">開啟 PDF 後顯示縮圖；可拖放排序</p>";
        }
        return;
      }
      const next = tabs[Math.max(0, idx - 1)];
      activateTab(next.id);
    }

    function renderTabs() {
      const bar = $("[data-pdf-ws-tabs]");
      if (!bar) return;
      if (!tabs.length) {
        bar.innerHTML = "<div class=\"pdf-ws-tabs-empty\">尚未開啟文件</div>";
        return;
      }
      bar.innerHTML = tabs.map((tab) => {
        const active = tab.id === activeTabId ? " is-active" : "";
        const dirty = tab.dirty ? " is-dirty" : "";
        const mark = tab.dirty ? "• " : "";
        return `<div class="pdf-ws-tab${active}${dirty}" role="tab" data-tab-id="${tab.id}" aria-selected="${tab.id === activeTabId}">` +
          `<button type="button" class="pdf-ws-tab-label" data-tab-activate="${tab.id}" title="${escapeHtml(tab.title)}">${mark}${escapeHtml(tab.title)}</button>` +
          `<button type="button" class="pdf-ws-tab-close" data-tab-close="${tab.id}" title="關閉" aria-label="關閉 ${escapeHtml(tab.title)}">×</button>` +
          `</div>`;
      }).join("");
      bar.querySelectorAll("[data-tab-activate]").forEach((btn) => {
        btn.addEventListener("click", () => {
          commitSessionToTab();
          activateTab(btn.getAttribute("data-tab-activate"));
        });
      });
      bar.querySelectorAll("[data-tab-close]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          const id = btn.getAttribute("data-tab-close");
          void closeTabById(id);
        });
      });
    }

    async function closeTabById(tabId) {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.id === activeTabId) {
        await closeDocument({ onlyTab: true });
        return;
      }
      // Closing inactive tab
      if (core.save && core.save.isDirty(tab.session)) {
        const ok = typeof window !== "undefined" && window.confirm
          ? window.confirm(`「${tab.title}」有未儲存變更，確定關閉？`)
          : true;
        if (!ok) return;
      }
      if (viewer && tab.session && viewer.closeSession) {
        await viewer.closeSession(tab.session);
      }
      tabs = tabs.filter((t) => t.id !== tabId);
      renderTabs();
    }

    function buildMarkup() {
      return `
        <div class="pdf-ws-tabs" data-pdf-ws-tabs role="tablist" aria-label="開啟的文件"></div>
        <div class="pdf-ws-layout" data-pdf-ws-layout>
          <aside class="pdf-ws-thumbs" aria-label="頁面縮圖">
            <div class="pdf-ws-thumbs-head">
              <strong>頁面</strong>
              <span data-pdf-ws-page-meta>尚未開啟</span>
            </div>
            <div class="pdf-ws-page-tools" data-pdf-ws-page-tools>
              <button type="button" class="pdf-ws-btn subtle" data-pdf-ws-page-delete disabled title="刪除選取頁">刪頁</button>
              <button type="button" class="pdf-ws-btn subtle" data-pdf-ws-page-dup disabled title="複製目前頁">複製</button>
              <button type="button" class="pdf-ws-btn subtle" data-pdf-ws-page-blank disabled title="在目前頁後插入空白頁">空白</button>
              <button type="button" class="pdf-ws-btn subtle" data-pdf-ws-page-insert disabled title="插入其他 PDF">插入</button>
              <input class="visually-hidden" type="file" accept="application/pdf,.pdf" data-pdf-ws-page-insert-file multiple tabindex="-1">
              <button type="button" class="pdf-ws-btn subtle" data-pdf-ws-page-extract disabled title="匯出選取頁">匯出</button>
            </div>
            <div class="pdf-ws-page-notice" data-pdf-ws-page-notice role="note">
              <strong>頁面整理注意</strong>
              <p>刪頁、排序、複製、插入空白／其他 PDF 會重建文件。含 <em>AcroForm 表格</em> 時，填表控件可能失效或消失。</p>
              <p><strong>建議：</strong>先完成填表並儲存，再整理頁面。單頁表格影響通常較小。「匯出」只另存選取頁，不改目前文件。</p>
            </div>
            <div class="pdf-ws-thumbs-list empty" data-pdf-ws-thumbs>
              <p class="pdf-ws-placeholder">開啟 PDF 後顯示縮圖；可拖放排序</p>
            </div>
          </aside>
          <section class="pdf-ws-stage" aria-label="PDF 內容">
            <div class="pdf-ws-toolbar" role="toolbar" aria-label="閱讀工具">
              <button type="button" class="pdf-ws-btn" data-pdf-ws-open>開啟 PDF</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-open-tab title="在新分頁開啟">＋分頁</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-close disabled>關閉</button>
              <span class="pdf-ws-sep" aria-hidden="true"></span>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-prev disabled title="上一頁">上一頁</button>
              <label class="pdf-ws-page-jump">
                <span class="visually-hidden">頁碼</span>
                <input type="number" min="1" value="1" data-pdf-ws-page-input disabled>
                <span data-pdf-ws-page-total>/ 0</span>
              </label>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-next disabled title="下一頁">下一頁</button>
              <span class="pdf-ws-sep" aria-hidden="true"></span>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-zoom-out disabled title="縮小">−</button>
              <span class="pdf-ws-zoom-label" data-pdf-ws-zoom-label>100%</span>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-zoom-in disabled title="放大">＋</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-fit-page disabled>適合頁面</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-fit-width disabled>適合寬度</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-rotate disabled title="順時針旋轉目前頁面（可儲存）">旋轉頁面</button>
              <span class="pdf-ws-sep" aria-hidden="true"></span>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-stamp-sign disabled title="放置簽名圖（點擊頁面）">簽名</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-stamp-date disabled title="放置日期章（點擊頁面）">日期章</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-stamp-cancel disabled title="取消放置">取消放置</button>
              <span class="pdf-ws-sep" aria-hidden="true"></span>
              <label class="pdf-ws-search">
                <span class="visually-hidden">搜尋</span>
                <input type="search" placeholder="搜尋文字…" data-pdf-ws-search-input disabled>
              </label>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-search-go disabled>搜尋</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-search-prev disabled title="上一個">▲</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-search-next disabled title="下一個">▼</button>
              <span class="pdf-ws-search-meta" data-pdf-ws-search-meta></span>
              <span class="pdf-ws-spacer"></span>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-copy disabled title="複製選取文字（或 Ctrl+C）">複製</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-print disabled>列印</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-save disabled title="儲存（Ctrl+S）">儲存</button>
              <button type="button" class="pdf-ws-btn" data-pdf-ws-save-as disabled title="另存新檔">另存</button>
            </div>
            <div class="pdf-ws-canvas-wrap" data-pdf-ws-drop>
              <div class="pdf-ws-empty" data-pdf-ws-empty>
                <strong>PDF 工作區</strong>
                <p>本機 PDF 閱讀（PDF.js）。開啟後檔案以記憶體保存，關閉即釋放，不佔用原始檔。</p>
                <p class="pdf-ws-hint">拖放 PDF 到此處。可填表、簽名圖、日期章後儲存。</p>
              </div>
              <div class="pdf-ws-canvas hidden" data-pdf-ws-canvas aria-live="polite">
                <div class="pdf-ws-page-stage" data-pdf-ws-page-stage>
                  <canvas data-pdf-ws-page-canvas></canvas>
                  <div class="textLayer" data-pdf-ws-text-layer aria-hidden="true"></div>
                  <div class="pdf-ws-form-layer" data-pdf-ws-form-layer aria-label="PDF 表格欄位"></div>
                  <div class="pdf-ws-stamp-layer" data-pdf-ws-stamp-layer aria-label="簽名與日期章"></div>
                </div>
              </div>
            </div>
            <p class="pdf-ws-status" data-pdf-ws-status role="status">準備就緒 · 檔案只在本機處理</p>
          </section>
          <aside class="pdf-ws-side" aria-label="最近文件與提示">
            <div class="pdf-ws-side-block">
              <strong>最近開啟</strong>
              <ul class="pdf-ws-recent" data-pdf-ws-recent></ul>
              <button type="button" class="pdf-ws-btn subtle" data-pdf-ws-clear-recent>清除清單</button>
            </div>
            <div class="pdf-ws-side-block">
              <strong>相容性</strong>
              <p class="pdf-ws-compat" data-pdf-ws-compat>開啟文件後會檢查加密與 XFA 提示。</p>
            </div>
            <div class="pdf-ws-side-block">
              <strong>表格欄位</strong>
              <p class="pdf-ws-compat" data-pdf-ws-form-meta>開啟含 AcroForm 的 PDF 後可在此填寫。</p>
              <ul class="pdf-ws-form-list" data-pdf-ws-form-list>
                <li class="pdf-ws-recent-empty">尚未偵測表格</li>
              </ul>
            </div>
            <div class="pdf-ws-side-block">
              <strong>簽名與印章</strong>
              <p class="pdf-ws-compat">簽名只存在本機瀏覽器／裝置，不會上傳。</p>
              <div class="pdf-ws-sig-actions">
                <button type="button" class="pdf-ws-btn subtle" data-pdf-ws-sig-add>+ 新增簽名圖</button>
                <input class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" data-pdf-ws-sig-file tabindex="-1">
              </div>
              <ul class="pdf-ws-sig-list" data-pdf-ws-sig-list>
                <li class="pdf-ws-recent-empty">尚未儲存簽名</li>
              </ul>
              <label class="pdf-ws-date-style">
                <span>日期格式</span>
                <select data-pdf-ws-date-style>
                  <option value="iso">2026-03-25</option>
                  <option value="slash">25/03/2026</option>
                  <option value="dot">2026.03.25</option>
                </select>
              </label>
              <p class="pdf-ws-compat" data-pdf-ws-stamp-hint>選「簽名」或「日期章」後，點頁面放置；可拖曳調整，Delete 刪除。</p>
            </div>
            <div class="pdf-ws-side-block">
              <strong>搜尋結果</strong>
              <ul class="pdf-ws-search-hits" data-pdf-ws-search-hits>
                <li class="pdf-ws-recent-empty">尚未搜尋</li>
              </ul>
            </div>
          </aside>
        </div>
        <div class="pdf-ws-modal hidden" data-pdf-ws-password-modal role="dialog" aria-modal="true" aria-labelledby="pdf-ws-password-title">
          <div class="pdf-ws-modal-card">
            <h3 id="pdf-ws-password-title">需要密碼</h3>
            <p class="pdf-ws-modal-lead" data-pdf-ws-password-message>此 PDF 已加密，請輸入密碼。</p>
            <label class="pdf-ws-modal-field">
              <span class="visually-hidden">密碼</span>
              <input type="password" data-pdf-ws-password-input autocomplete="current-password" placeholder="PDF 密碼">
            </label>
            <div class="pdf-ws-modal-actions">
              <button type="button" class="pdf-ws-btn" data-pdf-ws-password-cancel>取消</button>
              <button type="button" class="pdf-ws-btn pdf-ws-btn-primary" data-pdf-ws-password-ok>開啟</button>
            </div>
          </div>
        </div>
      `;
    }

    function setStatus(message) {
      const el = $("[data-pdf-ws-status]");
      if (el) el.textContent = message || "";
    }

    function setCompat(text) {
      const el = $("[data-pdf-ws-compat]");
      if (el) el.textContent = text || "";
    }

    function hasDocument() {
      return Boolean(session && session._pdf && session.pageCount > 0);
    }

    function setChromeEnabled(open) {
      host.querySelectorAll(
        "[data-pdf-ws-close],[data-pdf-ws-prev],[data-pdf-ws-next],[data-pdf-ws-page-input]," +
        "[data-pdf-ws-zoom-in],[data-pdf-ws-zoom-out],[data-pdf-ws-fit-page],[data-pdf-ws-fit-width]," +
        "[data-pdf-ws-rotate],[data-pdf-ws-print],[data-pdf-ws-copy],[data-pdf-ws-search-input],[data-pdf-ws-search-go]," +
        "[data-pdf-ws-search-prev],[data-pdf-ws-search-next],[data-pdf-ws-save],[data-pdf-ws-save-as]," +
        "[data-pdf-ws-stamp-sign],[data-pdf-ws-stamp-date]," +
        "[data-pdf-ws-page-delete],[data-pdf-ws-page-dup],[data-pdf-ws-page-blank],[data-pdf-ws-page-insert],[data-pdf-ws-page-extract]"
      ).forEach((el) => {
        el.disabled = !open || busy;
      });
      const cancelPlace = $("[data-pdf-ws-stamp-cancel]");
      if (cancelPlace) cancelPlace.disabled = !placeMode || busy;
      const stage = $("[data-pdf-ws-page-stage]");
      if (stage) stage.classList.toggle("is-placing", Boolean(placeMode));
      const saveBtn = $("[data-pdf-ws-save]");
      if (saveBtn && open) {
        const dirty = core.save && typeof core.save.isDirty === "function"
          ? core.save.isDirty(session)
          : Boolean(session && session.dirty);
        saveBtn.classList.toggle("is-dirty", dirty);
        saveBtn.title = dirty ? "儲存變更（Ctrl+S）" : "儲存（目前無未存變更）";
      }
      commitSessionToTab();
    }

    function containerSize() {
      const wrap = $("[data-pdf-ws-drop]");
      if (!wrap) return { width: 800, height: 600 };
      return {
        width: wrap.clientWidth || 800,
        height: wrap.clientHeight || 600
      };
    }

    function updateChrome() {
      const open = hasDocument();
      const empty = $("[data-pdf-ws-empty]");
      const canvasHost = $("[data-pdf-ws-canvas]");
      if (empty) empty.classList.toggle("hidden", open);
      if (canvasHost) canvasHost.classList.toggle("hidden", !open);

      const meta = $("[data-pdf-ws-page-meta]");
      if (meta) {
        meta.textContent = open
          ? `${session.name || "document.pdf"} · ${session.pageCount} 頁`
          : "尚未開啟";
      }
      const total = $("[data-pdf-ws-page-total]");
      if (total) total.textContent = `/ ${open ? session.pageCount : 0}`;
      const pageInput = $("[data-pdf-ws-page-input]");
      if (pageInput) pageInput.value = String(open ? session.currentPage : 1);
      const zoomLabel = $("[data-pdf-ws-zoom-label]");
      if (zoomLabel) {
        zoomLabel.textContent = open ? `${Math.round((session.zoom || 1) * 100)}%` : "100%";
      }

      const searchMeta = $("[data-pdf-ws-search-meta]");
      if (searchMeta) {
        if (open && session.search && session.search.matches && session.search.matches.length) {
          searchMeta.textContent = `${session.search.index + 1}/${session.search.matches.length}`;
        } else if (open && session.search && session.search.query) {
          searchMeta.textContent = "0";
        } else {
          searchMeta.textContent = "";
        }
      }

      setChromeEnabled(open);
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    async function renderMainPage() {
      if (!hasDocument() || !viewer) return;
      const token = ++renderToken;
      const canvas = $("[data-pdf-ws-page-canvas]");
      const textLayer = $("[data-pdf-ws-text-layer]");
      const stage = $("[data-pdf-ws-page-stage]");
      if (!canvas) return;
      try {
        const result = await viewer.renderPageToCanvas(session, session.currentPage, canvas, {
          scale: session.zoom,
          textLayerDiv: textLayer || null,
          highlightSearch: true
        });
        if (token !== renderToken) return;
        if (stage && result) {
          stage.style.width = `${Math.floor(result.width)}px`;
          stage.style.height = `${Math.floor(result.height)}px`;
        }
        highlightActiveThumb();
        await renderFormLayer(token, result);
        await renderStampLayer(token, result);
      } catch (error) {
        if (token !== renderToken) return;
        const msg = shared.formatUserError
          ? shared.formatUserError(error, "渲染失敗")
          : String(error && error.message ? error.message : error);
        setStatus(msg);
      }
    }

    function refreshSignatureList() {
      const list = $("[data-pdf-ws-sig-list]");
      if (!list || !annotations) return;
      const items = annotations.listSavedSignatures ? annotations.listSavedSignatures() : [];
      if (!items.length) {
        list.innerHTML = "<li class=\"pdf-ws-recent-empty\">尚未儲存簽名</li>";
        return;
      }
      if (!activeSignatureId) activeSignatureId = items[0].id;
      list.innerHTML = items.map((item) => {
        const active = item.id === activeSignatureId ? " is-active" : "";
        return `<li class="pdf-ws-sig-item${active}">` +
          `<button type="button" class="pdf-ws-sig-pick" data-sig-id="${escapeHtml(item.id)}">` +
          `<img src="${item.dataUrl}" alt="">` +
          `<span>${escapeHtml(item.name)}</span></button>` +
          `<button type="button" class="pdf-ws-btn subtle pdf-ws-sig-del" data-sig-del="${escapeHtml(item.id)}" title="移除此簽名">×</button>` +
          `</li>`;
      }).join("");
      list.querySelectorAll("[data-sig-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeSignatureId = btn.getAttribute("data-sig-id");
          refreshSignatureList();
          setStatus("已選取簽名；按工具列「簽名」後點頁面放置");
        });
      });
      list.querySelectorAll("[data-sig-del]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          const id = btn.getAttribute("data-sig-del");
          if (annotations.removeSignature) annotations.removeSignature(id);
          if (activeSignatureId === id) activeSignatureId = null;
          refreshSignatureList();
          setStatus("已移除本機簽名");
        });
      });
    }

    function clearPlaceMode() {
      placeMode = null;
      const hint = $("[data-pdf-ws-stamp-hint]");
      if (hint) {
        hint.textContent = "選「簽名」或「日期章」後，點頁面放置；可拖曳調整，Delete 刪除。";
      }
      setChromeEnabled(hasDocument());
    }

    async function startPlaceSignature() {
      if (!hasDocument() || !annotations) return;
      const items = annotations.listSavedSignatures();
      let sig = items.find((item) => item.id === activeSignatureId) || items[0];
      if (!sig) {
        setStatus("請先在右側「+ 新增簽名圖」加入簽名");
        const file = $("[data-pdf-ws-sig-file]");
        if (file) file.click();
        return;
      }
      placeMode = {
        mode: "signature",
        signatureId: sig.id,
        dataUrl: sig.dataUrl,
        width: sig.width || 120,
        height: sig.height || 48
      };
      const hint = $("[data-pdf-ws-stamp-hint]");
      if (hint) hint.textContent = "放置模式：在頁面上點一下放上簽名（Esc 取消）";
      setChromeEnabled(true);
      setStatus("請在頁面上點擊放置簽名");
    }

    function startPlaceDate() {
      if (!hasDocument() || !annotations) return;
      const styleEl = $("[data-pdf-ws-date-style]");
      const style = styleEl ? styleEl.value : "iso";
      placeMode = { mode: "date", style };
      const hint = $("[data-pdf-ws-stamp-hint]");
      if (hint) hint.textContent = "放置模式：在頁面上點一下放上日期章（Esc 取消）";
      setChromeEnabled(true);
      setStatus("請在頁面上點擊放置日期章");
    }

    async function placeStampAtCss(cssX, cssY, pageSize) {
      if (!placeMode || !hasDocument() || !annotations) return;
      const pageNumber = session.currentPage || 1;
      const pdfPt = await annotations.cssPointToPdf(
        session,
        pageNumber,
        cssX,
        cssY,
        pageSize.width,
        pageSize.height
      );
      if (placeMode.mode === "signature") {
        const w = placeMode.width || 120;
        const h = placeMode.height || 48;
        // Anchor: click is center-ish bottom of stamp in CSS; convert so box sits above click.
        annotations.addSignatureStamp(session, {
          page: pageNumber,
          x: pdfPt.x - w / 2,
          y: pdfPt.y,
          width: w,
          height: h,
          dataUrl: placeMode.dataUrl
        });
        setStatus("已放置簽名（未儲存）");
      } else if (placeMode.mode === "date") {
        const text = annotations.formatDateStamp(new Date(), placeMode.style || "iso");
        const fontSize = 12;
        const w = Math.max(72, text.length * fontSize * 0.62);
        annotations.addDateStamp(session, {
          page: pageNumber,
          x: pdfPt.x,
          y: pdfPt.y,
          width: w,
          height: fontSize * 1.6,
          text,
          fontSize,
          style: placeMode.style
        });
        setStatus(`已放置日期章「${text}」（未儲存）`);
      }
      clearPlaceMode();
      updateChrome();
      const stage = $("[data-pdf-ws-page-stage]");
      const size = stage
        ? { width: stage.clientWidth, height: stage.clientHeight }
        : pageSize;
      await renderStampLayer(renderToken, size);
    }

    async function renderStampLayer(token, pageSize) {
      const layer = $("[data-pdf-ws-stamp-layer]");
      if (!layer) return;
      layer.innerHTML = "";
      if (!annotations || !pageSize || !hasDocument()) return;
      const pageNumber = session.currentPage || 1;
      const stamps = annotations.listAnnotationsOnPage(session, pageNumber);
      if (!stamps.length) return;
      const cssWidth = Math.floor(pageSize.width);
      const cssHeight = Math.floor(pageSize.height);
      layer.style.width = `${cssWidth}px`;
      layer.style.height = `${cssHeight}px`;

      for (const ann of stamps) {
        if (token !== renderToken) return;
        const rect = { x: ann.x, y: ann.y, width: ann.width, height: ann.height };
        const box = await annotations.pdfRectToCss(session, pageNumber, rect, cssWidth, cssHeight);
        if (!box) continue;
        const el = document.createElement("div");
        el.className = `pdf-ws-stamp${selectedStampId === ann.id ? " is-selected" : ""}`;
        el.setAttribute("data-stamp-id", ann.id);
        el.style.left = `${box.left}px`;
        el.style.top = `${box.top}px`;
        el.style.width = `${box.width}px`;
        el.style.height = `${box.height}px`;
        if (ann.type === "signature") {
          el.innerHTML = `<img src="${ann.imageDataUrl}" alt="簽名" draggable="false">`;
        } else {
          el.innerHTML = `<span class="pdf-ws-stamp-date">${escapeHtml(ann.text || "")}</span>`;
        }
        el.addEventListener("pointerdown", (event) => {
          if (placeMode) return;
          event.preventDefault();
          event.stopPropagation();
          selectedStampId = ann.id;
          layer.querySelectorAll(".pdf-ws-stamp").forEach((node) => {
            node.classList.toggle("is-selected", node.getAttribute("data-stamp-id") === ann.id);
          });
          const startX = event.clientX;
          const startY = event.clientY;
          const origLeft = box.left;
          const origTop = box.top;
          const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            el.style.left = `${origLeft + dx}px`;
            el.style.top = `${origTop + dy}px`;
          };
          const onUp = async (ev) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
            const newCssX = origLeft + dx;
            const newCssY = origTop + dy + box.height; // bottom-left of box in CSS
            const pdfPt = await annotations.cssPointToPdf(
              session,
              pageNumber,
              newCssX,
              newCssY,
              cssWidth,
              cssHeight
            );
            // convertToPdfPoint of bottom-left; stamp y is bottom in PDF space
            annotations.updateAnnotation(session, ann.id, {
              x: pdfPt.x,
              y: pdfPt.y
            });
            updateChrome();
            setStatus("已移動印章（未儲存）");
            await renderStampLayer(renderToken, pageSize);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        });
        layer.appendChild(el);
      }
    }

    function updateFormSidebar() {
      const meta = $("[data-pdf-ws-form-meta]");
      const list = $("[data-pdf-ws-form-list]");
      if (!list) return;
      if (!forms || !forms.hasForm || !forms.hasForm(session)) {
        if (meta) meta.textContent = "此文件沒有可填的 AcroForm 欄位（或為 XFA／掃描件）。";
        list.innerHTML = "<li class=\"pdf-ws-recent-empty\">無表格欄位</li>";
        return;
      }
      const fields = forms.listFields(session);
      const names = [];
      const seen = new Set();
      fields.forEach((field) => {
        if (seen.has(field.name)) return;
        seen.add(field.name);
        names.push(field);
      });
      if (meta) {
        meta.textContent = `共 ${names.length} 個欄位 · 在頁面上直接填寫後按儲存`;
      }
      list.innerHTML = names.slice(0, 40).map((field) => {
        const val = forms.getFormValue(session, field.name);
        const preview = val === true ? "✓" : val === false || val == null || val === ""
          ? "（空）"
          : String(val).slice(0, 24);
        return `<li><button type="button" class="pdf-ws-form-nav" data-form-page="${field.page}" data-form-name="${escapeHtml(field.name)}">` +
          `<strong>${escapeHtml(field.name)}</strong><span>p.${field.page} · ${escapeHtml(preview)}</span></button></li>`;
      }).join("");
      list.querySelectorAll("[data-form-page]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const page = Number(btn.getAttribute("data-form-page") || 1);
          void goToPage(page).then(() => {
            const name = btn.getAttribute("data-form-name") || "";
            const safe = name.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
            const input = host.querySelector(`[data-form-field="${safe}"]`);
            if (input && typeof input.focus === "function") input.focus();
          });
        });
      });
    }

    async function renderFormLayer(token, pageSize) {
      const layer = $("[data-pdf-ws-form-layer]");
      if (!layer) return;
      layer.innerHTML = "";
      if (!formEditEnabled || !forms || !forms.hasForm(session) || !pageSize) {
        return;
      }
      const pageNumber = session.currentPage || 1;
      const fields = forms.listFieldsOnPage(session, pageNumber);
      if (!fields.length) return;

      const cssWidth = Math.floor(pageSize.width);
      const cssHeight = Math.floor(pageSize.height);
      layer.style.width = `${cssWidth}px`;
      layer.style.height = `${cssHeight}px`;

      for (const field of fields) {
        if (token !== renderToken) return;
        if (!field.rect) continue;
        let box = null;
        if (typeof forms.rectToViewportBox === "function") {
          box = await forms.rectToViewportBox(session, pageNumber, field.rect, cssWidth, cssHeight);
        }
        if (!box) continue;
        const el = document.createElement(field.type === "text" && field.multiline ? "textarea" : "input");
        if (field.type === "checkbox") {
          el.type = "checkbox";
        } else if (field.type === "radio") {
          el.type = "radio";
          el.name = `form-radio-${field.name}`;
          el.value = field.optionValue || "";
        } else if (field.type === "dropdown") {
          // replace with select
        } else if (field.type !== "text" || !field.multiline) {
          el.type = "text";
        }
        el.className = `pdf-ws-form-widget pdf-ws-form-${field.type}`;
        el.setAttribute("data-form-field", field.name);
        el.style.left = `${box.left}px`;
        el.style.top = `${box.top}px`;
        el.style.width = `${box.width}px`;
        el.style.height = `${Math.max(box.height, field.type === "text" ? 18 : 14)}px`;
        if (field.readOnly) el.disabled = true;
        if (field.maxLength) el.maxLength = field.maxLength;

        if (field.type === "dropdown") {
          const select = document.createElement("select");
          select.className = el.className;
          select.setAttribute("data-form-field", field.name);
          select.style.cssText = el.style.cssText;
          if (field.readOnly) select.disabled = true;
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "—";
          select.appendChild(empty);
          (field.options || []).forEach((opt) => {
            const option = document.createElement("option");
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
          });
          const current = forms.getFormValue(session, field.name);
          select.value = current == null ? "" : String(current);
          select.addEventListener("change", () => {
            forms.setFormValue(session, field.name, select.value);
            updateChrome();
            updateFormSidebar();
            setStatus(`已更新欄位「${field.name}」（未儲存）`);
          });
          layer.appendChild(select);
          continue;
        }

        if (field.type === "checkbox") {
          el.checked = Boolean(forms.getFormValue(session, field.name));
          el.addEventListener("change", () => {
            forms.setFormValue(session, field.name, el.checked);
            updateChrome();
            updateFormSidebar();
            setStatus(`已更新欄位「${field.name}」（未儲存）`);
          });
        } else if (field.type === "radio") {
          const current = forms.getFormValue(session, field.name);
          el.checked = String(current || "") === String(field.optionValue || "");
          el.addEventListener("change", () => {
            if (el.checked) {
              forms.setFormValue(session, field.name, field.optionValue || el.value);
              updateChrome();
              updateFormSidebar();
              setStatus(`已更新欄位「${field.name}」（未儲存）`);
            }
          });
        } else {
          const current = forms.getFormValue(session, field.name);
          el.value = current == null ? "" : String(current);
          el.addEventListener("input", () => {
            forms.setFormValue(session, field.name, el.value);
            updateChrome();
          });
          el.addEventListener("change", () => {
            forms.setFormValue(session, field.name, el.value);
            updateChrome();
            updateFormSidebar();
            setStatus(`已更新欄位「${field.name}」（未儲存）`);
          });
        }
        layer.appendChild(el);
      }
    }

    async function copySelection() {
      if (!hasDocument() || !viewer) return;
      const stage = $("[data-pdf-ws-page-stage]") || $("[data-pdf-ws-canvas]");
      try {
        const result = await viewer.copySelectedText(stage);
        if (result.ok) {
          const preview = result.text.trim().slice(0, 40);
          setStatus(`已複製 ${result.text.trim().length} 字${preview ? `：「${preview}${result.text.trim().length > 40 ? "…" : ""}」` : ""}`);
        } else if (result.reason === "empty") {
          setStatus("請先在頁面上拖曳選取文字，再按複製（或 Ctrl+C）");
        } else {
          setStatus("無法寫入剪貼簿");
        }
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error, "複製失敗") : String(error));
      }
    }

    function highlightActiveThumb() {
      if (!session) return;
      host.querySelectorAll("[data-pdf-ws-thumb]").forEach((btn) => {
        const page = Number(btn.getAttribute("data-page") || 0);
        btn.classList.toggle("is-active", page === session.currentPage);
      });
      const active = host.querySelector(`[data-pdf-ws-thumb][data-page="${session.currentPage}"]`);
      if (active && typeof active.scrollIntoView === "function") {
        active.scrollIntoView({ block: "nearest" });
      }
      highlightThumbSelection();
    }

    function highlightThumbSelection() {
      host.querySelectorAll("[data-pdf-ws-thumb]").forEach((btn) => {
        const page = Number(btn.getAttribute("data-page") || 0);
        btn.classList.toggle("is-checked", selectedThumbPages.has(page));
      });
    }

    async function rebuildThumbnails() {
      const list = $("[data-pdf-ws-thumbs]");
      if (!list || !hasDocument() || !viewer) return;
      const token = ++thumbToken;
      list.classList.remove("empty");
      list.innerHTML = "";
      const total = session.pageCount;
      selectedThumbPages = new Set(
        Array.from(selectedThumbPages).filter((p) => p >= 1 && p <= total)
      );
      if (!selectedThumbPages.size && session.currentPage) {
        selectedThumbPages.add(session.currentPage);
      }
      for (let page = 1; page <= total; page += 1) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pdf-ws-thumb";
        btn.draggable = true;
        btn.setAttribute("data-pdf-ws-thumb", "1");
        btn.setAttribute("data-page", String(page));
        btn.setAttribute("aria-label", `第 ${page} 頁`);
        btn.innerHTML = `<canvas width="1" height="1"></canvas><span>${page}</span>`;
        btn.addEventListener("click", (event) => {
          if (event.ctrlKey || event.metaKey) {
            if (selectedThumbPages.has(page)) selectedThumbPages.delete(page);
            else selectedThumbPages.add(page);
            highlightThumbSelection();
            return;
          }
          if (event.shiftKey && selectedThumbPages.size) {
            const anchor = Math.min(...selectedThumbPages, session.currentPage || 1);
            const a = Math.min(anchor, page);
            const b = Math.max(anchor, page);
            selectedThumbPages = new Set();
            for (let p = a; p <= b; p += 1) selectedThumbPages.add(p);
            highlightThumbSelection();
            void goToPage(page);
            return;
          }
          selectedThumbPages = new Set([page]);
          highlightThumbSelection();
          void goToPage(page);
        });
        btn.addEventListener("dragstart", (event) => {
          dragThumbPage = page;
          btn.classList.add("is-dragging");
          try {
            event.dataTransfer.setData("text/plain", String(page));
            event.dataTransfer.effectAllowed = "move";
          } catch {
            // ignore
          }
        });
        btn.addEventListener("dragend", () => {
          btn.classList.remove("is-dragging");
          dragThumbPage = null;
          host.querySelectorAll(".pdf-ws-thumb.is-drop-target").forEach((el) => {
            el.classList.remove("is-drop-target");
          });
        });
        btn.addEventListener("dragover", (event) => {
          event.preventDefault();
          btn.classList.add("is-drop-target");
        });
        btn.addEventListener("dragleave", () => {
          btn.classList.remove("is-drop-target");
        });
        btn.addEventListener("drop", (event) => {
          event.preventDefault();
          btn.classList.remove("is-drop-target");
          const from = dragThumbPage || Number(event.dataTransfer.getData("text/plain"));
          const to = page;
          if (!from || from === to) return;
          void reorderPage(from, to);
        });
        list.appendChild(btn);
      }
      highlightActiveThumb();
      highlightThumbSelection();

      const batch = 4;
      for (let start = 1; start <= total; start += batch) {
        if (token !== thumbToken || destroyed) return;
        const tasks = [];
        for (let page = start; page < start + batch && page <= total; page += 1) {
          const btn = list.querySelector(`[data-page="${page}"]`);
          const canvas = btn && btn.querySelector("canvas");
          if (!canvas) continue;
          tasks.push(
            viewer.renderThumbnail(session, page, canvas, 120).catch(() => null)
          );
        }
        await Promise.all(tasks);
      }
    }

    async function applyRebuiltBytes(bytes, message) {
      if (!viewer || !session) return;
      await viewer.replaceSessionBytes(session, bytes, {
        name: session.name,
        sourcePath: session.sourcePath || ""
      });
      // Re-detect form geometry; keep typed values when field names still exist.
      const keptValues = session.formValues ? Object.assign({}, session.formValues) : null;
      if (forms && typeof forms.attachFormToSession === "function") {
        try {
          await forms.attachFormToSession(session, { allowSanitize: false });
          if (keptValues && session.formValues) {
            Object.keys(keptValues).forEach((name) => {
              if (Object.prototype.hasOwnProperty.call(session.formValues, name)) {
                session.formValues[name] = keptValues[name];
              }
            });
          }
        } catch {
          session.formFields = [];
        }
      }
      session.dirty = true;
      commitSessionToTab();
      updateFormSidebar();
      updateChrome();
      await Promise.all([renderMainPage(), rebuildThumbnails()]);
      if (message) setStatus(message);
    }

    function confirmPageRebuild(actionLabel) {
      const hasForm = forms && typeof forms.hasForm === "function" && forms.hasForm(session);
      const base = `${actionLabel}會重建 PDF 結構。`;
      const formWarn = hasForm
        ? "\n\n此文件含可填表格（AcroForm），整理後填表控件可能失效或消失。\n建議：先填表並儲存，再整理頁面。"
        : "\n\n若文件含可填表格，整理後控件可能受影響。建議先填表儲存。";
      if (typeof window === "undefined" || !window.confirm) return true;
      return window.confirm(`${base}${formWarn}\n\n仍要繼續？`);
    }

    async function reorderPage(fromPage, toPage) {
      if (!pagesApi || !hasDocument()) return;
      const count = session.pageCount || 0;
      const order = Array.from({ length: count }, (_v, i) => i + 1);
      const fromIdx = order.indexOf(fromPage);
      if (fromIdx < 0) return;
      order.splice(fromIdx, 1);
      const toIdx = order.indexOf(toPage);
      order.splice(toIdx < 0 ? order.length : toIdx, 0, fromPage);
      if (!confirmPageRebuild("重新排列頁面")) {
        setStatus("已取消重排");
        await rebuildThumbnails();
        return;
      }
      busy = true;
      setChromeEnabled(true);
      setStatus("正在重新排列頁面…");
      try {
        const result = await pagesApi.reorderPages(session, order);
        await applyRebuiltBytes(result.bytes, `已將第 ${fromPage} 頁移到第 ${toPage} 頁旁（未儲存）· 表格控件可能需重新檢查`);
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error, "重排失敗") : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    async function deleteSelectedPages() {
      if (!pagesApi || !hasDocument()) return;
      const pages = selectedThumbPages.size
        ? Array.from(selectedThumbPages)
        : [session.currentPage || 1];
      if (!confirmPageRebuild(`刪除 ${pages.length} 頁`)) return;
      busy = true;
      setChromeEnabled(true);
      try {
        const result = await pagesApi.deletePages(session, pages);
        selectedThumbPages = new Set();
        await applyRebuiltBytes(result.bytes, `已刪除 ${result.deleted.length} 頁（未儲存）`);
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error, "刪頁失敗") : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    async function duplicateCurrentPage() {
      if (!pagesApi || !hasDocument()) return;
      if (!confirmPageRebuild("複製頁面")) return;
      busy = true;
      setChromeEnabled(true);
      try {
        const result = await pagesApi.duplicatePage(session, session.currentPage || 1);
        await applyRebuiltBytes(result.bytes, `已複製第 ${result.insertedAt - 1} 頁（未儲存）· 表格控件可能需重新檢查`);
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error, "複製頁失敗") : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    async function insertBlankAfterCurrent() {
      if (!pagesApi || !hasDocument()) return;
      if (!confirmPageRebuild("插入空白頁")) return;
      const at = (session.currentPage || 0) + 1;
      busy = true;
      setChromeEnabled(true);
      try {
        const result = await pagesApi.insertBlankPage(session, at);
        await applyRebuiltBytes(result.bytes, `已在第 ${result.insertedAt} 頁插入空白頁（未儲存）· 表格控件可能需重新檢查`);
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error, "插入失敗") : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    async function insertPdfFiles(fileList) {
      if (!pagesApi || !hasDocument() || !fileList || !fileList.length) return;
      if (!confirmPageRebuild("插入其他 PDF")) return;
      busy = true;
      setChromeEnabled(true);
      try {
        let at = (session.currentPage || 0) + 1;
        for (const file of fileList) {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const result = await pagesApi.insertPdfBytes(session, bytes, at);
          await viewer.replaceSessionBytes(session, result.bytes, {
            name: session.name,
            sourcePath: session.sourcePath || ""
          });
          session.dirty = true;
          at = result.insertedAt + result.insertedCount;
        }
        commitSessionToTab();
        updateChrome();
        await Promise.all([renderMainPage(), rebuildThumbnails()]);
        setStatus(`已插入 ${fileList.length} 個 PDF（未儲存）· 表格控件可能需重新檢查`);
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error, "插入 PDF 失敗") : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    async function extractSelectedPages() {
      if (!pagesApi || !hasDocument()) return;
      const pages = selectedThumbPages.size
        ? Array.from(selectedThumbPages)
        : [session.currentPage || 1];
      busy = true;
      setChromeEnabled(true);
      try {
        const bytes = await pagesApi.extractPages(session, pages);
        const name = `${(session.name || "document").replace(/\.pdf$/i, "")}_p${pages.join("-")}.pdf`;
        if (core.save && core.save.downloadBytes) {
          core.save.downloadBytes(bytes, name);
          setStatus(`已匯出 ${pages.length} 頁：${name}（目前文件未改動）`);
        } else {
          setStatus("無法下載匯出檔");
        }
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error, "匯出失敗") : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    function renderSearchHits() {
      const list = $("[data-pdf-ws-search-hits]");
      if (!list) return;
      const matches = session && session.search && session.search.matches
        ? session.search.matches
        : [];
      if (!matches.length) {
        list.innerHTML = `<li class="pdf-ws-recent-empty">${
          session && session.search && session.search.query ? "沒有符合的結果" : "尚未搜尋"
        }</li>`;
        return;
      }
      list.innerHTML = matches.slice(0, 80).map((match, index) => {
        const active = session.search && session.search.index === index ? " is-active" : "";
        return `<li><button type="button" class="pdf-ws-search-hit${active}" data-hit-index="${index}">` +
          `<strong>第 ${match.page} 頁</strong><span>${escapeHtml(match.snippet)}</span></button></li>`;
      }).join("");
      list.querySelectorAll("[data-hit-index]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const index = Number(btn.getAttribute("data-hit-index"));
          if (!session.search) return;
          session.search.index = index;
          const match = session.search.matches[index];
          if (match) void goToPage(match.page);
          updateChrome();
          renderSearchHits();
        });
      });
    }

    async function goToPage(page) {
      if (!hasDocument() || !viewer) return;
      viewer.setCurrentPage(session, page);
      updateChrome();
      await renderMainPage();
    }

    async function changeZoom(nextZoom) {
      if (!hasDocument() || !viewer) return;
      viewer.setZoom(session, nextZoom);
      updateChrome();
      await renderMainPage();
    }

    async function fit(mode) {
      if (!hasDocument() || !viewer) return;
      await viewer.applyFit(session, containerSize(), mode);
      updateChrome();
      await renderMainPage();
    }

    async function rotatePage() {
      if (!hasDocument() || !viewer || typeof viewer.rotatePage !== "function") return;
      const page = session.currentPage || 1;
      const degrees = viewer.rotatePage(session, page, 90);
      if (session.fitMode === "page" || session.fitMode === "width") {
        await viewer.applyFit(session, containerSize(), session.fitMode);
      }
      updateChrome();
      await Promise.all([renderMainPage(), rebuildThumbnails()]);
      setStatus(`第 ${page} 頁已旋轉 ${degrees}°（未儲存）· 按「儲存」或「另存」寫入檔案`);
    }

    function promptPassword(message) {
      return new Promise((resolve) => {
        const modal = $("[data-pdf-ws-password-modal]");
        const input = $("[data-pdf-ws-password-input]");
        const lead = $("[data-pdf-ws-password-message]");
        const ok = $("[data-pdf-ws-password-ok]");
        const cancel = $("[data-pdf-ws-password-cancel]");
        if (!modal || !input || !ok || !cancel) {
          const fallback = typeof window !== "undefined" && window.prompt
            ? window.prompt(message || "請輸入 PDF 密碼", "")
            : null;
          resolve(fallback);
          return;
        }
        if (lead) lead.textContent = message || "此 PDF 已加密，請輸入密碼。";
        input.value = "";
        modal.classList.remove("hidden");
        setTimeout(() => input.focus(), 0);

        const cleanup = () => {
          ok.removeEventListener("click", onOk);
          cancel.removeEventListener("click", onCancel);
          input.removeEventListener("keydown", onKey);
          modal.classList.add("hidden");
        };
        const onOk = () => {
          const value = input.value;
          cleanup();
          resolve(value);
        };
        const onCancel = () => {
          cleanup();
          resolve(null);
        };
        const onKey = (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onOk();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        };
        ok.addEventListener("click", onOk);
        cancel.addEventListener("click", onCancel);
        input.addEventListener("keydown", onKey);
      });
    }

    async function applySavedResult(result) {
      if (!result || !result.ok || !result.bytes || !viewer) return;
      const pathValue = result.path || session.sourcePath || "";
      const name = pathValue
        ? pathValue.split(/[/\\]/).pop()
        : (result.name || session.name || "document.pdf");
      await viewer.replaceSessionBytes(session, result.bytes, {
        name,
        sourcePath: pathValue
      });
      // Re-load form state from saved bytes (values already baked in).
      if (forms && typeof forms.attachFormToSession === "function") {
        try {
          await forms.attachFormToSession(session);
        } catch {
          // ignore
        }
      }
      // Stamps are flattened into the PDF on save — clear session overlays.
      if (annotations && typeof annotations.clearAnnotations === "function") {
        annotations.clearAnnotations(session);
      }
      selectedStampId = null;
      placeMode = null;
      if (typeof shared.rememberRecentFile === "function") {
        shared.rememberRecentFile({ name: session.name, path: session.sourcePath || "" });
      }
      refreshRecent();
      updateFormSidebar();
      refreshSignatureList();
      updateChrome();
      await Promise.all([renderMainPage(), rebuildThumbnails()]);
    }

    async function saveDocument(forceSaveAs) {
      if (!hasDocument() || !core.save) return;
      busy = true;
      setChromeEnabled(true);
      setStatus(forceSaveAs ? "另存中…" : "儲存中…");
      try {
        const result = forceSaveAs || !session.sourcePath
          ? await core.save.saveAs(session)
          : await core.save.saveInPlace(session);
        if (!result || result.mode === "cancelled" || result.ok === false) {
          setStatus("已取消儲存");
          return;
        }
        await applySavedResult(result);
        if (result.mode === "download") {
          setStatus(`已下載「${result.name || session.name}」（瀏覽器下載）`);
        } else if (result.path) {
          setStatus(`已儲存至「${result.path}」`);
        } else {
          setStatus("已儲存");
        }
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error, "儲存失敗") : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    async function runSearch() {
      if (!hasDocument() || !viewer) return;
      const input = $("[data-pdf-ws-search-input]");
      const query = input ? input.value : "";
      setStatus("搜尋中…");
      busy = true;
      setChromeEnabled(true);
      try {
        const result = await viewer.searchDocument(session, query);
        renderSearchHits();
        updateChrome();
        if (result.matches.length) {
          const match = result.matches[0];
          await goToPage(match.page);
          setStatus(`找到 ${result.matches.length} 處 · ${match.snippet}`);
        } else if (String(query || "").trim()) {
          setStatus("沒有符合的結果");
        } else {
          setStatus("請輸入搜尋字詞");
        }
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error) : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    async function stepSearch(delta) {
      if (!hasDocument() || !viewer) return;
      const match = viewer.stepSearch(session, delta);
      if (!match) {
        setStatus("沒有搜尋結果");
        return;
      }
      updateChrome();
      renderSearchHits();
      await renderMainPage();
      setStatus(`第 ${match.page} 頁 · ${match.snippet}`);
    }

    function refreshRecent() {
      const list = $("[data-pdf-ws-recent]");
      if (!list) return;
      const items = typeof shared.loadRecentFiles === "function"
        ? shared.loadRecentFiles()
        : [];
      if (!items.length) {
        list.innerHTML = "<li class=\"pdf-ws-recent-empty\">尚無紀錄</li>";
        return;
      }
      list.innerHTML = items.map((item) => {
        const label = escapeHtml(item.name);
        const pathAttr = item.path ? ` data-path="${escapeHtml(item.path)}"` : "";
        return `<li><button type="button" class="pdf-ws-recent-item" data-name="${label}"${pathAttr}>${label}</button></li>`;
      }).join("");
      list.querySelectorAll(".pdf-ws-recent-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          const filePath = btn.getAttribute("data-path");
          if (filePath) {
            void openFromPath(filePath);
          } else {
            setStatus("此紀錄沒有本機路徑，請重新開啟檔案");
          }
        });
      });
    }

    async function afterOpen(name, openOptions) {
      const optsOpen = openOptions || {};
      // Register / refresh tab for this session
      if (optsOpen.asNewTab || !activeTabId || !tabs.length) {
        createTabWithSession(session);
      } else {
        const tab = tabs.find((t) => t.id === activeTabId);
        if (tab) {
          tab.session = session;
          tab.title = session.name || name || tab.title;
          tab.dirty = false;
        } else {
          createTabWithSession(session);
        }
        renderTabs();
      }

      const probe = compatibility && compatibility.probeDocument && session.bytes
        ? compatibility.probeDocument(session.bytes)
        : null;
      if (probe && probe.advice) setCompat(probe.advice);
      else setCompat("未偵測到加密／XFA 標記（粗檢）。");

      let formNote = "";
      if (forms && typeof forms.attachFormToSession === "function") {
        try {
          const formInfo = await forms.attachFormToSession(session, {
            allowSanitize: true,
            replaceSessionBytes: async (cleaned) => {
              // Re-open viewer from QPDF-cleaned bytes so save/export works (IR56B etc.).
              if (viewer && typeof viewer.replaceSessionBytes === "function") {
                const page = session.currentPage || 1;
                const zoom = session.zoom || 1;
                const fitMode = session.fitMode || "page";
                await viewer.replaceSessionBytes(session, cleaned, {
                  name: session.name,
                  sourcePath: session.sourcePath || ""
                });
                session.currentPage = page;
                session.zoom = zoom;
                session.fitMode = fitMode;
              } else {
                session.bytes = cleaned;
              }
            }
          });
          if (formInfo && formInfo.hasForm) {
            formNote = ` · ${formInfo.fieldCount} 個表格欄位可填寫`;
            if (formInfo.sanitized) {
              formNote += "（已自動解除檔案限制以便填表）";
            }
          }
        } catch (error) {
          formNote = "";
          const code = error && error.code;
          if (code === "encrypted_pdf" || code === "needs_sanitize" || code === "sanitize_failed" || code === "missing_tool") {
            setCompat(
              (probe && probe.advice ? `${probe.advice} ` : "") +
              (error.message || "表格讀取失敗")
            );
          }
        }
      }
      updateFormSidebar();
      refreshSignatureList();
      selectedStampId = null;
      placeMode = null;
      if (session) {
        session.annotations = [];
        session.annotationDirty = false;
      }

      if (typeof shared.rememberRecentFile === "function") {
        shared.rememberRecentFile({
          name: session.name,
          path: session.sourcePath || ""
        });
      }
      refreshRecent();
      updateChrome();
      // Default fit-page then paint.
      try {
        await viewer.applyFit(session, containerSize(), "page");
      } catch {
        // ignore fit errors
      }
      updateChrome();
      await Promise.all([renderMainPage(), rebuildThumbnails()]);
      setStatus(`已開啟「${name}」· ${session.pageCount} 頁 · 本機記憶體（不鎖檔）${formNote}`);
      if (typeof opts.onOpened === "function") opts.onOpened(session);
    }

    async function openBytesWithPasswordLoop(bytes, openOptions) {
      const asNewTab = Boolean(openOptions.asNewTab);
      let password = openOptions.password || "";
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          if (!asNewTab && session && viewer.closeSession) await viewer.closeSession(session);
          session = await viewer.openFromBytes(bytes, {
            name: openOptions.name || "document.pdf",
            sourcePath: openOptions.sourcePath || "",
            password
          });
          return true;
        } catch (error) {
          const code = error && error.code;
          if (code === "password_required" || code === "password_incorrect") {
            const message = code === "password_incorrect"
              ? "密碼不正確，請再試一次。"
              : (error.message || "此 PDF 已加密，請輸入密碼。");
            const next = await promptPassword(message);
            if (next == null) {
              setStatus("已取消開啟加密 PDF");
              if (!asNewTab) {
                session = viewer.createEmptySession ? viewer.createEmptySession() : null;
                updateChrome();
                clearThumbs();
              }
              return false;
            }
            password = next;
            continue;
          }
          throw error;
        }
      }
      setStatus("密碼嘗試次數過多");
      if (!asNewTab) {
        session = viewer.createEmptySession ? viewer.createEmptySession() : null;
        updateChrome();
        clearThumbs();
      }
      return false;
    }

    async function openFromFile(file, pathHint, openOptions) {
      if (!viewer || typeof viewer.openFromBytes !== "function") {
        setStatus("pdf-core viewer 未載入");
        return;
      }
      const asNewTab = Boolean(openInNewTabNext || (openOptions && openOptions.asNewTab));
      openInNewTabNext = false;
      if (!asNewTab && session && core.save && core.save.isDirty(session)) {
        const ok = typeof window !== "undefined" && window.confirm
          ? window.confirm("目前文件有未儲存的變更，確定要開啟其他檔案嗎？")
          : true;
        if (!ok) return;
      }
      busy = true;
      setChromeEnabled(false);
      setStatus(`正在開啟「${file.name || "document.pdf"}」…`);
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const opened = await openBytesWithPasswordLoop(bytes, {
          name: file.name || "document.pdf",
          sourcePath: pathHint || "",
          asNewTab
        });
        if (opened) await afterOpen(session.name, { asNewTab });
      } catch (error) {
        if (!asNewTab) {
          session = viewer.createEmptySession ? viewer.createEmptySession() : null;
          clearThumbs();
        }
        updateChrome();
        setStatus(shared.formatUserError ? shared.formatUserError(error, "開啟失敗") : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    async function openFromPath(filePath, openOptions) {
      if (!filePath) return;
      const bridge = typeof window !== "undefined" ? window.swiftLocalBackend : null;
      if (!bridge || typeof bridge.readLocalFile !== "function") {
        setStatus("此環境無法依路徑讀取檔案；請用檔案選擇器開啟。");
        return;
      }
      const asNewTab = Boolean(openInNewTabNext || (openOptions && openOptions.asNewTab));
      openInNewTabNext = false;
      if (!asNewTab && session && core.save && core.save.isDirty(session)) {
        const ok = typeof window !== "undefined" && window.confirm
          ? window.confirm("目前文件有未儲存的變更，確定要開啟其他檔案嗎？")
          : true;
        if (!ok) return;
      }
      busy = true;
      setChromeEnabled(false);
      setStatus(`正在讀取「${basename(filePath)}」…`);
      try {
        const payload = await bridge.readLocalFile(filePath);
        const raw = payload && payload.data;
        let bytes;
        if (raw instanceof Uint8Array) {
          bytes = raw;
        } else if (raw && raw.type === "Buffer" && Array.isArray(raw.data)) {
          bytes = new Uint8Array(raw.data);
        } else if (Array.isArray(raw)) {
          bytes = new Uint8Array(raw);
        } else if (raw && raw.byteLength != null) {
          bytes = new Uint8Array(raw);
        } else {
          throw new Error("讀取檔案內容格式不正確");
        }
        const opened = await openBytesWithPasswordLoop(bytes, {
          name: (payload && payload.name) || basename(filePath),
          sourcePath: filePath,
          asNewTab
        });
        if (opened) await afterOpen(session.name, { asNewTab });
      } catch (error) {
        if (!asNewTab) {
          session = viewer.createEmptySession ? viewer.createEmptySession() : null;
          clearThumbs();
        }
        updateChrome();
        setStatus(shared.formatUserError ? shared.formatUserError(error, "開啟失敗") : String(error));
      } finally {
        busy = false;
        setChromeEnabled(hasDocument());
      }
    }

    function clearThumbs() {
      const list = $("[data-pdf-ws-thumbs]");
      if (!list) return;
      list.classList.add("empty");
      list.innerHTML = "<p class=\"pdf-ws-placeholder\">開啟 PDF 後顯示縮圖</p>";
      const hits = $("[data-pdf-ws-search-hits]");
      if (hits) hits.innerHTML = "<li class=\"pdf-ws-recent-empty\">尚未搜尋</li>";
    }

    async function handleOpenClick() {
      try {
        if (typeof shared.choosePdfFiles === "function") {
          const result = await shared.choosePdfFiles({ multiple: false, title: "開啟 PDF" });
          if (result.files && result.files[0]) {
            await openFromFile(result.files[0], result.paths[0] || "");
            return;
          }
          if (result.paths && result.paths[0]) {
            await openFromPath(result.paths[0]);
            return;
          }
          setStatus("已取消開啟");
          return;
        }
        setStatus("無法開啟檔案選擇器");
      } catch (error) {
        setStatus(shared.formatUserError ? shared.formatUserError(error, "開啟失敗") : String(error));
      }
    }

    async function closeDocument() {
      if (session && core.save && core.save.isDirty(session)) {
        const ok = typeof window !== "undefined" && window.confirm
          ? window.confirm("有未儲存的變更，確定關閉此分頁？")
          : true;
        if (!ok) return;
      }
      renderToken += 1;
      thumbToken += 1;
      if (viewer && session && viewer.closeSession) {
        await viewer.closeSession(session);
      }
      selectedStampId = null;
      selectedThumbPages = new Set();
      clearPlaceMode();
      closeActiveTab();
      const formLayer = $("[data-pdf-ws-form-layer]");
      if (formLayer) formLayer.innerHTML = "";
      const stampLayer = $("[data-pdf-ws-stamp-layer]");
      if (stampLayer) stampLayer.innerHTML = "";
      if (!tabs.length) {
        clearThumbs();
        updateFormSidebar();
        setCompat("開啟文件後會檢查加密與 XFA 提示。");
      }
      setStatus(tabs.length ? "已關閉分頁" : "已關閉文件並清除記憶體工作階段（不鎖檔）");
      if (typeof opts.onClosed === "function") opts.onClosed();
    }

    function bindChrome() {
      const openBtn = $("[data-pdf-ws-open]");
      if (openBtn) openBtn.addEventListener("click", () => {
        openInNewTabNext = false;
        void handleOpenClick();
      });
      const openTabBtn = $("[data-pdf-ws-open-tab]");
      if (openTabBtn) openTabBtn.addEventListener("click", () => {
        openInNewTabNext = true;
        void handleOpenClick();
      });
      const closeBtn = $("[data-pdf-ws-close]");
      if (closeBtn) closeBtn.addEventListener("click", () => { void closeDocument(); });

      const pageDelete = $("[data-pdf-ws-page-delete]");
      if (pageDelete) pageDelete.addEventListener("click", () => { void deleteSelectedPages(); });
      const pageDup = $("[data-pdf-ws-page-dup]");
      if (pageDup) pageDup.addEventListener("click", () => { void duplicateCurrentPage(); });
      const pageBlank = $("[data-pdf-ws-page-blank]");
      if (pageBlank) pageBlank.addEventListener("click", () => { void insertBlankAfterCurrent(); });
      const pageInsert = $("[data-pdf-ws-page-insert]");
      const pageInsertFile = $("[data-pdf-ws-page-insert-file]");
      if (pageInsert && pageInsertFile) {
        pageInsert.addEventListener("click", () => pageInsertFile.click());
        pageInsertFile.addEventListener("change", () => {
          const files = Array.from(pageInsertFile.files || []);
          pageInsertFile.value = "";
          void insertPdfFiles(files);
        });
      }
      const pageExtract = $("[data-pdf-ws-page-extract]");
      if (pageExtract) pageExtract.addEventListener("click", () => { void extractSelectedPages(); });

      const drop = $("[data-pdf-ws-drop]");
      if (drop) {
        drop.addEventListener("dragover", (event) => {
          event.preventDefault();
          drop.classList.add("is-dragover");
        });
        drop.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
        drop.addEventListener("drop", (event) => {
          event.preventDefault();
          drop.classList.remove("is-dragover");
          const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
          if (file && /\.pdf$/i.test(file.name || "")) {
            void openFromFile(file, "");
          } else {
            setStatus("請拖放 PDF 檔案");
          }
        });
      }

      const clearRecent = $("[data-pdf-ws-clear-recent]");
      if (clearRecent) {
        clearRecent.addEventListener("click", () => {
          if (typeof shared.clearRecentFiles === "function") shared.clearRecentFiles();
          refreshRecent();
          setStatus("已清除最近開啟清單");
        });
      }

      const copyBtn = $("[data-pdf-ws-copy]");
      if (copyBtn) copyBtn.addEventListener("click", () => { void copySelection(); });

      const printBtn = $("[data-pdf-ws-print]");
      if (printBtn) {
        printBtn.addEventListener("click", () => {
          if (core.print && typeof core.print.printDocument === "function") {
            setStatus("準備列印…");
            void core.print.printDocument(session)
              .then(() => setStatus("已送出列印"))
              .catch((error) => {
                setStatus(shared.formatUserError ? shared.formatUserError(error) : String(error));
              });
          }
        });
      }

      const saveBtn = $("[data-pdf-ws-save]");
      if (saveBtn) saveBtn.addEventListener("click", () => { void saveDocument(false); });
      const saveAsBtn = $("[data-pdf-ws-save-as]");
      if (saveAsBtn) saveAsBtn.addEventListener("click", () => { void saveDocument(true); });

      const pageInput = $("[data-pdf-ws-page-input]");
      if (pageInput) {
        pageInput.addEventListener("change", () => {
          void goToPage(pageInput.value);
        });
        pageInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void goToPage(pageInput.value);
          }
        });
      }

      [["data-pdf-ws-prev", -1], ["data-pdf-ws-next", 1]].forEach(([attr, delta]) => {
        const btn = $(`[${attr}]`);
        if (!btn) return;
        btn.addEventListener("click", () => {
          if (!session) return;
          void goToPage((session.currentPage || 1) + delta);
        });
      });

      [["data-pdf-ws-zoom-in", 1.15], ["data-pdf-ws-zoom-out", 1 / 1.15]].forEach(([attr, factor]) => {
        const btn = $(`[${attr}]`);
        if (!btn) return;
        btn.addEventListener("click", () => {
          if (!session) return;
          void changeZoom((session.zoom || 1) * factor);
        });
      });

      const fitPage = $("[data-pdf-ws-fit-page]");
      if (fitPage) fitPage.addEventListener("click", () => { void fit("page"); });
      const fitWidth = $("[data-pdf-ws-fit-width]");
      if (fitWidth) fitWidth.addEventListener("click", () => { void fit("width"); });
      const rotateBtn = $("[data-pdf-ws-rotate]");
      if (rotateBtn) rotateBtn.addEventListener("click", () => { void rotatePage(); });

      const stampSign = $("[data-pdf-ws-stamp-sign]");
      if (stampSign) stampSign.addEventListener("click", () => { void startPlaceSignature(); });
      const stampDate = $("[data-pdf-ws-stamp-date]");
      if (stampDate) stampDate.addEventListener("click", () => { startPlaceDate(); });
      const stampCancel = $("[data-pdf-ws-stamp-cancel]");
      if (stampCancel) stampCancel.addEventListener("click", () => {
        clearPlaceMode();
        setStatus("已取消放置");
      });

      const sigAdd = $("[data-pdf-ws-sig-add]");
      const sigFile = $("[data-pdf-ws-sig-file]");
      if (sigAdd && sigFile) {
        sigAdd.addEventListener("click", () => sigFile.click());
        sigFile.addEventListener("change", async () => {
          const file = sigFile.files && sigFile.files[0];
          sigFile.value = "";
          if (!file || !annotations) return;
          try {
            if (file.size > 350 * 1024) {
              setStatus("簽名圖請小於約 350KB");
              return;
            }
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ""));
              reader.onerror = () => reject(new Error("讀取簽名圖失敗"));
              reader.readAsDataURL(file);
            });
            // Natural size → default display size
            const dims = await new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
              img.onerror = () => resolve({ w: 300, h: 120 });
              img.src = dataUrl;
            });
            const maxW = 140;
            const scale = Math.min(1, maxW / Math.max(1, dims.w));
            const item = annotations.saveSignature({
              name: (file.name || "簽名").replace(/\.[^.]+$/, "").slice(0, 40),
              dataUrl,
              width: Math.max(40, Math.round(dims.w * scale * 0.45)),
              height: Math.max(20, Math.round(dims.h * scale * 0.45))
            });
            activeSignatureId = item.id;
            refreshSignatureList();
            setStatus(`已儲存簽名「${item.name}」（僅本機）`);
          } catch (error) {
            setStatus(shared.formatUserError ? shared.formatUserError(error, "新增簽名失敗") : String(error));
          }
        });
      }

      const stage = $("[data-pdf-ws-page-stage]");
      if (stage) {
        stage.addEventListener("click", (event) => {
          if (!placeMode || !hasDocument()) return;
          // Ignore clicks on form widgets / stamps
          if (event.target && event.target.closest && (
            event.target.closest(".pdf-ws-form-widget") ||
            event.target.closest(".pdf-ws-stamp") ||
            event.target.closest("input,textarea,select,button")
          )) {
            return;
          }
          const rect = stage.getBoundingClientRect();
          const cssX = event.clientX - rect.left;
          const cssY = event.clientY - rect.top;
          void placeStampAtCss(cssX, cssY, { width: rect.width, height: rect.height });
        });
      }

      const searchGo = $("[data-pdf-ws-search-go]");
      if (searchGo) searchGo.addEventListener("click", () => { void runSearch(); });
      const searchInput = $("[data-pdf-ws-search-input]");
      if (searchInput) {
        searchInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void runSearch();
          }
        });
      }
      const searchPrev = $("[data-pdf-ws-search-prev]");
      if (searchPrev) searchPrev.addEventListener("click", () => { void stepSearch(-1); });
      const searchNext = $("[data-pdf-ws-search-next]");
      if (searchNext) searchNext.addEventListener("click", () => { void stepSearch(1); });

      host.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && placeMode) {
          event.preventDefault();
          clearPlaceMode();
          setStatus("已取消放置");
          return;
        }
        if (!hasDocument()) return;
        const tag = event.target && event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if ((event.key === "Delete" || event.key === "Backspace") && selectedStampId && annotations) {
          event.preventDefault();
          annotations.removeAnnotation(session, selectedStampId);
          selectedStampId = null;
          updateChrome();
          setStatus("已刪除印章（未儲存）");
          const st = $("[data-pdf-ws-page-stage]");
          if (st) {
            void renderStampLayer(renderToken, { width: st.clientWidth, height: st.clientHeight });
          }
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "PageUp") {
          event.preventDefault();
          void goToPage((session.currentPage || 1) - 1);
        } else if (event.key === "ArrowRight" || event.key === "PageDown") {
          event.preventDefault();
          void goToPage((session.currentPage || 1) + 1);
        } else if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) {
          event.preventDefault();
          void changeZoom((session.zoom || 1) * 1.15);
        } else if ((event.ctrlKey || event.metaKey) && event.key === "-") {
          event.preventDefault();
          void changeZoom((session.zoom || 1) / 1.15);
        } else if ((event.ctrlKey || event.metaKey) && event.key === "s") {
          event.preventDefault();
          void saveDocument(event.shiftKey);
        } else if ((event.ctrlKey || event.metaKey) && event.key === "f") {
          event.preventDefault();
          if (searchInput) searchInput.focus();
        } else if ((event.ctrlKey || event.metaKey) && event.key === "c") {
          // Prefer native copy of text-layer selection; if that fails, try our helper.
          const stage = $("[data-pdf-ws-page-stage]");
          const selected = viewer.getSelectedText ? viewer.getSelectedText(stage) : "";
          if (selected && selected.trim()) {
            // Let the browser handle native copy from the text layer when possible.
            // Also mirror into clipboard API for reliability in Electron.
            void viewer.copySelectedText(stage).then((result) => {
              if (result.ok) {
                setStatus(`已複製 ${result.text.trim().length} 字`);
              }
            }).catch(() => {});
          }
        }
      });

      // Soft-fit when panel resizes (debounced).
      if (typeof ResizeObserver === "function") {
        const wrap = $("[data-pdf-ws-drop]");
        if (wrap) {
          let timer = null;
          const ro = new ResizeObserver(() => {
            if (!hasDocument()) return;
            if (session.fitMode !== "page" && session.fitMode !== "width") return;
            clearTimeout(timer);
            timer = setTimeout(() => {
              void fit(session.fitMode);
            }, 120);
          });
          ro.observe(wrap);
        }
      }
    }

    return {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        void closeDocument().then(() => {
          host.innerHTML = "";
          host.classList.remove("pdf-ws-root");
        });
      },
      openFile: openFromFile,
      openPath: openFromPath,
      getSession() {
        return session;
      },
      setStatus
    };
  }

  return {
    mountPdfWorkspace,
    MODULE: "pdf-workspace",
    PHASE: "pages-tabs"
  };
});
