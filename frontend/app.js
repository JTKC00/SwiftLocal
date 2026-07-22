(function () {
  "use strict";

  const state = {
    activePanel: "home-panel",
    imageDownloads: [],
    pdfDownloads: [],
    pdfFiles: [],
    pdfWorkspacePages: [],
    pdfWorkspaceUndo: [],
    pdfWorkspaceRedo: [],
    pdfWorkspaceLoading: false,
    pdfWorkspaceSelectedId: null,
    dataMode: "json-format",
    textMode: "base64-encode",
    zipUrl: null,
    zipName: "",
    diffText: "",
    splitDownloads: [],
    imgBackendFiles: [],
    mediaBackendFiles: [],
    backendConnected: false,
    detectedTools: null,
    backendLastChecked: null,
    backendPollTimer: null,
    desktopOutputDir: "",
    hashRows: [],
    renameRows: [],
    theme: "light"
  };

  const titles = {
    "home-panel": "首頁",
    "image-panel": "圖片轉換",
    "pdf-panel": "PDF 處理",
    "data-panel": "資料格式",
    "text-panel": "文字編碼",
    "hash-panel": "檔案雜湊",
    "zip-panel": "ZIP 壓縮",
    "diff-panel": "文字比對",
    "split-panel": "進階分片",
    "rename-panel": "批量改名",
    "media-panel": "影音轉換",
    "tools-panel": "工具筱",
    "backend-panel": "工具狀態"
  };

  Object.assign(titles, {
    "home-panel": "首頁",
    "image-panel": "圖片轉換",
    "pdf-panel": "PDF 處理",
    "data-panel": "資料轉換",
    "text-panel": "文字處理",
    "hash-panel": "檔案驗證",
    "zip-panel": "ZIP 壓縮",
    "diff-panel": "文字比對",
    "split-panel": "進階分片",
    "rename-panel": "批量改名",
    "media-panel": "影音轉換",
    "tools-panel": "常用工具",
    "backend-panel": "工具狀態"
  });

  const toolGuides = {
    "home-panel": { nav: "首頁", hint: "選擇常用工具，並查看手機版與桌面版的功能差異。", steps: [], keywords: "home 首頁 開始 mobile 手機 desktop 桌面", platform: "web" },
    "image-panel": { nav: "圖片", hint: "轉 JPG / PNG / WebP、壓縮、縮放、加浮水印。", steps: ["選擇或拖放圖片", "保留預設或調整格式、品質、尺寸", "按「開始轉換」，在右邊下載結果"], keywords: "image 圖片 相片 jpg jpeg png webp 壓縮 縮小 浮水印 旋轉" },
    "pdf-panel": { nav: "PDF", hint: "逐頁視覺編排、轉換、OCR、壓縮及保護 PDF。", steps: ["選擇 PDF 工作台或其他處理方式", "在工作台拖放頁面，並旋轉、複製或刪除", "輸出新 PDF，或在任務區查看後端進度"], keywords: "pdf 工作台 縮圖 排序 合併 分割 抽頁 旋轉 頁碼 浮水印 壓縮 加密 解密 ocr office word docx" },
    "data-panel": { nav: "資料", hint: "JSON、CSV、XML 互轉與格式化。", steps: ["貼上資料內容", "選擇想轉成的格式", "按「執行」，再複製或下載輸出"], keywords: "json csv xml 資料 表格 格式化 壓縮" },
    "text-panel": { nav: "文字", hint: "Base64、URL、HTML 編碼，以及搜尋取代。", steps: ["貼上文字", "選擇處理方式", "按「執行」，再複製結果"], keywords: "文字 text base64 url html encode decode 搜尋 取代 繁簡" },
    "hash-panel": { nav: "驗證", hint: "產生檔案雜湊值，用來確認檔案沒有被改動。", steps: ["選擇檔案", "選擇雜湊演算法", "按「開始計算」，需要時下載 CSV"], keywords: "hash sha md5 雜湊 校驗 驗證 checksum" },
    "zip-panel": { nav: "壓縮", hint: "把多個檔案打包成一個 ZIP。", steps: ["選擇多個檔案", "確認 ZIP 檔名", "按「建立 ZIP」後下載"], keywords: "zip 壓縮 打包 archive" },
    "diff-panel": { nav: "比對", hint: "比較兩段文字有哪些新增、刪除或修改。", steps: ["貼上原文字", "貼上新文字", "按「開始比對」查看差異"], keywords: "diff compare 比對 差異 文字" },
    "split-panel": { nav: "分片", hint: "把原始檔案切成多個二進位 part 分片，需之後完整合併才能還原。", steps: ["選擇檔案", "設定每份大小", "按「產生分片檔」後下載全部 part 和 manifest"], keywords: "split 切割 分片 大檔 part binary manifest" },
    "rename-panel": { nav: "改名", hint: "先預覽批量改名規則，再下載 PowerShell 腳本。", steps: ["選擇要改名的檔案", "輸入命名格式", "產生預覽，確認後下載腳本"], keywords: "rename 改名 批量 檔名 file name", platform: "desktop" },
    "media-panel": { nav: "影音", hint: "音訊與影片轉檔，需要 FFmpeg 與本地後端。", steps: ["選擇音訊或影片", "選擇輸出格式", "按「加入轉換佇列」，等完成後下載"], keywords: "media audio video mp3 wav mp4 mov ffmpeg 影音 音訊 影片", platform: "desktop" },
    "tools-panel": { nav: "小工具", hint: "顏色格式、UUID、QR Code 等日常工具。", steps: ["選擇需要的小工具", "輸入內容或設定數量", "產生後複製或下載"], keywords: "color hex rgb hsl uuid qr qrcode 小工具 顏色" },
    "backend-panel": { nav: "狀態", hint: "查看整體健康狀態、可用功能及清楚的修復建議。", steps: ["先看整體狀態與功能可用情況", "按「重新檢查系統」取得最新結果", "缺少工具時展開進階設定並指定路徑"], keywords: "backend 後端 系統 健康 狀態 libreoffice ffmpeg tesseract qpdf ocr 設定", platform: "desktop" }
  };

  const PDF_BACKEND_JOB_TYPES = new Set(["office-to-pdf", "pdf-to-docx", "pdf-to-office", "ocr-pdf", "pdf-merge", "pdf-split", "pdf-rotate", "pdf-encrypt", "pdf-decrypt", "pdf-compress"]);
  const IMG_BACKEND_JOB_TYPES = new Set(["image-convert", "ocr-image"]);
  const MEDIA_BACKEND_JOB_TYPES = new Set(["media-convert"]);

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const CRC_TABLE = createCrcTable();
  const BACKEND_API_BASE = "http://127.0.0.1:8787/api";
  const BACKEND_ORIGIN = "http://127.0.0.1:8787";
  let pdfjsPromise = null;
  let pdfWorkspacePageId = 0;
  let pdfWorkspacePreviewToken = 0;
  const pdfWorkspacePreviewCache = new Map();
  const PDF_WORKSPACE_MAX_PAGES = 250;
  const PDF_WORKSPACE_PREVIEW_CACHE_SIZE = 12;

  function init() {
    initTheme();
    bindNavigation();
    bindResponsiveNavigation();
    updateRuntimeLabels();
    bindImageTool();
    bindPdfTool();
    bindDataTool();
    bindTextTool();
    bindHashTool();
    bindZipTool();
    bindDiffTool();
    bindSplitTool();
    bindRenameTool();
    bindBackendTool();
    bindToolsPanel();
    bindGlobalActions();
    enhanceNavigation();
    bindQuickStart();
    activatePanel(state.activePanel);
    $$(".file-zone input[type='file']").forEach(bindFileZoneLabel);
    $$(".file-zone").forEach((label) => {
      const input = label.querySelector("input[type='file']");
      if (input) bindFileZoneDragDrop(label, input);
    });
    document.addEventListener("paste", handleGlobalPaste);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.backendConnected) refreshBackendJobs();
    });
  }

  // ─── Toast notifications ─────────────────────────────────────────
  function showToast(message, type = "info", duration = 4000) {
    const container = $("#toast-container");
    if (!container) { return; }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    const dismiss = () => {
      toast.classList.add("fade-out");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };
    const timer = window.setTimeout(dismiss, duration);
    toast.addEventListener("click", () => { window.clearTimeout(timer); dismiss(); });
  }

  // ─── Dark / Light mode ────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem("swiftlocal-theme") || "light";
    applyTheme(saved);
    const btn = $("#theme-toggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem("swiftlocal-theme", next);
      });
    }
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    const btn = $("#theme-toggle");
    if (btn) btn.textContent = theme === "dark" ? "☀" : "🌙";
  }

  // ─── file-zone drag-and-drop ──────────────────────────────────────
  function bindFileZoneDragDrop(label, input) {
    label.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      label.classList.add("drag-over");
    });
    label.addEventListener("dragleave", (e) => {
      if (!label.contains(e.relatedTarget)) label.classList.remove("drag-over");
    });
    label.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      label.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files.length) {
        injectFiles(input, e.dataTransfer.files);
      }
    });
  }

  function injectFiles(input, fileList) {
    try {
      const dt = new DataTransfer();
      Array.from(fileList).forEach((f) => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch {
      // fallback: DataTransfer not supported — do nothing
    }
  }

  // ─── Clipboard paste (image panel) ────────────────────────────────
  function handleGlobalPaste(event) {
    if (state.activePanel !== "image-panel") return;
    const focused = document.activeElement;
    if (focused && (focused.tagName === "INPUT" || focused.tagName === "TEXTAREA" || focused.tagName === "SELECT")) return;
    const items = event.clipboardData && event.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const input = $("#image-files");
          injectFiles(input, [file]);
          showToast("已從剪貼簿貼上圖片", "success");
          event.preventDefault();
        }
        break;
      }
    }
  }

  function bindNavigation() {
    $$(".nav-item").forEach((button) => {
      button.addEventListener("click", () => {
        activatePanel(button.dataset.panel);
      });
    });
  }

  function activatePanel(panelId, focusSelector) {
    if (!panelId) return;
    state.activePanel = panelId;
    $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.panel === panelId));
    $$('[data-mobile-panel]').forEach((item) => item.classList.toggle("is-active", item.dataset.mobilePanel === panelId));
    $$(".panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === panelId));
    $("#panel-title").textContent = titles[panelId] || "SwiftLocal";
    const clearButton = $("#clear-all");
    if (clearButton) clearButton.hidden = panelId === "home-panel";
    updatePanelAssist(panelId);
    closeMobileNavigation();
    const target = focusSelector ? $(focusSelector) : null;
    if (target) window.setTimeout(() => target.focus({ preventScroll: true }), 120);
  }

  function bindResponsiveNavigation() {
    const toggle = $("#mobile-nav-toggle");
    const close = $("#mobile-nav-close");
    const backdrop = $("#mobile-nav-backdrop");
    const brand = $(".brand[data-panel]");
    const more = $("#mobile-more-tools");

    if (toggle) toggle.addEventListener("click", openMobileNavigation);
    if (close) close.addEventListener("click", closeMobileNavigation);
    if (backdrop) backdrop.addEventListener("click", closeMobileNavigation);
    if (more) more.addEventListener("click", openMobileNavigation);
    if (brand) brand.addEventListener("click", () => activatePanel(brand.dataset.panel));
    $$('[data-mobile-panel]').forEach((button) => {
      button.addEventListener("click", () => activatePanel(button.dataset.mobilePanel));
    });
    $$('[data-home-panel]').forEach((button) => {
      button.addEventListener("click", () => activatePanel(button.dataset.homePanel, button.dataset.homeFocus));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMobileNavigation();
    });
  }

  function openMobileNavigation() {
    document.body.classList.add("nav-open");
    const toggle = $("#mobile-nav-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  }

  function closeMobileNavigation() {
    document.body.classList.remove("nav-open");
    const toggle = $("#mobile-nav-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function updateRuntimeLabels() {
    const isDesktop = electronBridgeAvailable();
    const isTouch = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
    const runtimeLabel = $("#runtime-label");
    const runtimeTitle = $("#home-runtime-title");
    const runtimeNote = $("#home-runtime-note");
    if (runtimeLabel) runtimeLabel.textContent = isDesktop ? "桌面版" : isTouch ? "手機瀏覽器" : "瀏覽器模式";
    if (runtimeTitle) runtimeTitle.textContent = isDesktop ? "桌面完整版" : isTouch ? "手機瀏覽器版" : "瀏覽器版";
    if (runtimeNote) runtimeNote.textContent = isDesktop
      ? "已連接桌面環境；進階功能會按本機工具安裝狀態啟用。"
      : "可使用所有瀏覽器處理工具；桌面進階功能需要在電腦版開啟。";
  }

  function enhanceNavigation() {
    $$(".nav-item").forEach((button) => {
      const guide = toolGuides[button.dataset.panel];
      if (!guide) return;
      button.dataset.keywords = `${guide.nav} ${guide.hint} ${guide.keywords}`;
      const platform = guide.platform === "desktop" ? '<em class="nav-platform">桌面</em>' : "";
      button.innerHTML = `<span>${escapeHtml(guide.nav)}${platform}</span><small>${escapeHtml(guide.hint)}</small>`;
    });
  }

  function bindQuickStart() {
    const quickActions = $("#quick-actions");
    const search = $("#tool-search");
    if (!quickActions) return;
    const defaultActions = Array.from(quickActions.children).map((node) => node.cloneNode(true));
    bindQuickActionButtons();
    if (!search) return;

    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      renderSearchResults(query);
    });

    function bindQuickActionButtons() {
      $$("#quick-actions [data-panel]").forEach((button) => {
        button.addEventListener("click", () => {
          activatePanel(button.dataset.panel, button.dataset.focus);
          const panel = $(`#${button.dataset.panel}`);
          if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }

    function renderSearchResults(query) {
      const hasQuery = Boolean(query);
      const matches = Object.entries(toolGuides).filter(([panelId, guide]) => {
        if (panelId === "home-panel") return false;
        const haystack = [guide.nav, guide.hint, guide.keywords, titles[panelId]].join(" ").toLowerCase();
        return !hasQuery || haystack.includes(query);
      });

      $$(".nav-item").forEach((button) => {
        const haystack = (button.dataset.keywords || button.textContent || "").toLowerCase();
        button.hidden = hasQuery && !haystack.includes(query);
      });
      $$(".nav-group").forEach((group) => {
        group.hidden = hasQuery && !group.querySelector(".nav-item:not([hidden])");
      });

      quickActions.innerHTML = "";
      if (!hasQuery) {
        defaultActions.forEach((node) => quickActions.appendChild(node.cloneNode(true)));
        bindQuickActionButtons();
        return;
      }

      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "quick-empty";
        empty.textContent = "找不到符合的工具";
        quickActions.appendChild(empty);
        return;
      }

      matches.forEach(([panelId, guide]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.panel = panelId;
        button.innerHTML = `<strong>${escapeHtml(guide.nav)}</strong><span>${escapeHtml(guide.hint)}</span>`;
        quickActions.appendChild(button);
      });
      bindQuickActionButtons();
    }
  }

  function updatePanelAssist(panelId) {
    const assist = $("#panel-assist");
    const guide = toolGuides[panelId];
    if (!assist) return;
    if (panelId === "home-panel") {
      assist.innerHTML = "";
      return;
    }
    if (!guide) return;
    assist.innerHTML = [
      `<div><strong>${escapeHtml(titles[panelId] || guide.nav)}</strong><span>${escapeHtml(guide.hint)}</span></div>`,
      `<ol>${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
    ].join("");
  }

  function bindGlobalActions() {
    $("#clear-all").addEventListener("click", () => clearPanel(state.activePanel));
    $$("[data-clear-panel]").forEach((button) => {
      button.addEventListener("click", () => clearPanel(button.dataset.clearPanel));
    });
  }

  function clearPanel(panelId) {
    if (panelId === "image-panel") {
      revokeImageUrls();
      $("#image-form").reset();
      $("#image-keep-ratio").checked = true;
      $("#image-quality").value = "0.85";
      $("#quality-output").textContent = "85%";
      setEmpty("#image-results", "尚未產生檔案");
      $("#download-all-images").disabled = true;
      // 後端子表單
      state.imgBackendFiles = [];
      $("#img-backend-form").reset();
      const imgList = $("#img-backend-selected-files");
      imgList.classList.add("empty");
      imgList.textContent = "尚未選擇檔案";
      setEmpty("#img-backend-jobs", "尚未建立任務");
      updateImgBackendJobControls();
    }
    if (panelId === "pdf-panel") {
      revokePdfUrls();
      state.pdfFiles = [];
      $("#pdf-form").reset();
      $("#pdf-output-name").value = "swiftlocal-output.pdf";
      $("#pdf-watermark-opacity").value = "0.25";
      $("#pdf-watermark-opacity-output").textContent = "25%";
      $("#pdf-password").value = "";
      $("#pdf-password").type = "password";
      $("#pdf-password-visible").checked = false;
      $("#pdf-workspace-add-input").value = "";
      resetPdfWorkspace();
      setEmpty("#pdf-results", "尚未產生檔案");
      $("#download-all-pdfs").disabled = true;
      setEmpty("#pdf-backend-jobs", "尚未建立任務");
      updatePdfControls();
    }
    if (panelId === "data-panel") {
      $("#data-input").value = "";
      $("#data-output").value = "";
      setStatus("#data-status", "待處理");
    }
    if (panelId === "text-panel") {
      $("#text-input").value = "";
      $("#text-output").value = "";
      $("#text-count").textContent = "0 字元";
      $("#find-pattern").value = "";
      $("#replace-pattern").value = "";
      $("#find-use-regex").checked = false;
      $("#find-case-sensitive").checked = true;
    }
    if (panelId === "hash-panel") {
      $("#hash-form").reset();
      state.hashRows = [];
      setEmpty("#hash-results", "尚未計算");
      $("#download-hash-csv").disabled = true;
    }
    if (panelId === "zip-panel") {
      revokeZipUrl();
      $("#zip-form").reset();
      $("#zip-name").value = "swiftlocal-files.zip";
      setStatus("#zip-status", "待處理");
      setEmpty("#zip-results", "尚未建立壓縮檔");
      $("#download-zip").disabled = true;
    }
    if (panelId === "diff-panel") {
      $("#diff-form").reset();
      state.diffText = "";
      setStatus("#diff-status", "待處理");
      setEmpty("#diff-output", "尚未比對");
      $("#download-diff-output").disabled = true;
    }
    if (panelId === "split-panel") {
      revokeSplitUrls();
      $("#split-form").reset();
      $("#split-size").value = "10";
      $("#split-unit").value = "1048576";
      setStatus("#split-status", "待處理");
      setEmpty("#split-results", "尚未產生分片檔");
      $("#download-all-parts").disabled = true;
    }
    if (panelId === "rename-panel") {
      $("#rename-form").reset();
      $("#rename-pattern").value = "{name}_{n}.{ext}";
      $("#rename-start").value = "1";
      $("#rename-pad").value = "3";
      state.renameRows = [];
      setEmpty("#rename-results", "尚未產生預覽");
      $("#download-rename-script").disabled = true;
    }
    if (panelId === "backend-panel") {
      renderBackendJobs([]);
      setStatus("#backend-status", state.backendConnected ? "已連線" : "FastAPI 未連線");
    }
    if (panelId === "tools-panel") {
      $("#color-picker").value = "#1f7a68";
      $("#color-hex").value = "#1f7a68";
      updateColorOutputs("#1f7a68");
      $("#uuid-count").value = "5";
      $("#uuid-output").value = "";
      $("#qr-input").value = "";
      const canvas = $("#qr-canvas");
      if (canvas) { canvas.style.display = "none"; }
      $("#download-qr").disabled = true;
    }
    if (panelId === "media-panel") {
      state.mediaBackendFiles = [];
      $("#media-files").value = "";
      const c = $("#media-selected-files");
      c.classList.add("empty");
      c.textContent = "尚未選擇檔案";
      renderPanelBackendJobs("#media-backend-jobs", "#media-backend-status", [], MEDIA_BACKEND_JOB_TYPES);
      setStatus("#media-backend-status", state.backendConnected ? "已連線" : "FastAPI 未連線");
    }
    const panel = $(`#${panelId}`);
    if (panel) {
      panel.querySelectorAll(".file-zone input[type='file']").forEach((input) => {
        const hint = input.closest(".file-zone") && input.closest(".file-zone").querySelector("small[data-original-hint]");
        if (hint) hint.textContent = hint.dataset.originalHint;
      });
    }
  }

  function bindImageTool() {
    $("#image-quality").addEventListener("input", (event) => {
      const percent = Math.round(Number(event.target.value) * 100);
      $("#quality-output").textContent = `${percent}%`;
    });

    $("#image-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from($("#image-files").files || []);
      if (!files.length) {
        setEmpty("#image-results", "請先選擇圖片");
        return;
      }

      revokeImageUrls();
      const container = $("#image-results");
      container.classList.remove("empty");
      container.textContent = "";

      const format = $("#image-format").value;
      const quality = Number($("#image-quality").value);
      const maxWidth = Number($("#image-width").value) || null;
      const maxHeight = Number($("#image-height").value) || null;
      const keepRatio = $("#image-keep-ratio").checked;
      const rotation = Number($("#image-rotate").value) || 0;
      const flip = $("#image-flip").value;
      const watermarkText = $("#image-watermark").value.trim();
      const watermarkPosition = $("#image-watermark-position").value;
      const outputExt = extensionFromMime(format);

      for (const file of files) {
        try {
          const converted = await convertImage(file, {
            format,
            quality,
            maxWidth,
            maxHeight,
            keepRatio,
            rotation,
            flip,
            watermarkText,
            watermarkPosition
          });
          const url = URL.createObjectURL(converted.blob);
          const outputName = `${stripExtension(file.name)}.${outputExt}`;
          state.imageDownloads.push({ url, name: outputName });
          container.appendChild(renderImageResult(file, converted, url, outputName));
        } catch (error) {
          container.appendChild(renderErrorItem(file.name, readableError(error)));
        }
      }

      $("#download-all-images").disabled = state.imageDownloads.length === 0;
    });

    $("#download-all-images").addEventListener("click", () => {
      state.imageDownloads.forEach((item, index) => {
        window.setTimeout(() => triggerDownload(item.url, item.name), index * 180);
      });
    });
  }

  async function convertImage(file, options) {
    const bitmap = await createImageBitmap(file);
    const size = resolveImageSize(bitmap.width, bitmap.height, options.maxWidth, options.maxHeight, options.keepRatio);
    const canvas = document.createElement("canvas");
    const rotatedSideways = options.rotation === 90 || options.rotation === 270;
    canvas.width = rotatedSideways ? size.height : size.width;
    canvas.height = rotatedSideways ? size.width : size.height;
    const context = canvas.getContext("2d", { alpha: options.format !== "image/jpeg" });

    if (!context) {
      throw new Error("瀏覽器無法建立圖片畫布");
    }

    if (options.format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawTransformedImage(context, bitmap, size, canvas, options);
    if (options.watermarkText) {
      drawWatermark(context, canvas, options.watermarkText, options.watermarkPosition);
    }
    bitmap.close();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("這個輸出格式不受目前瀏覽器支援"));
        }
      }, options.format, options.quality);
    });

    return { blob, width: canvas.width, height: canvas.height };
  }

  function drawTransformedImage(context, bitmap, size, canvas, options) {
    const flipX = options.flip === "horizontal" || options.flip === "both";
    const flipY = options.flip === "vertical" || options.flip === "both";

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((options.rotation * Math.PI) / 180);
    context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    context.drawImage(bitmap, -size.width / 2, -size.height / 2, size.width, size.height);
    context.restore();
  }

  function drawWatermark(context, canvas, text, position) {
    const margin = Math.max(18, Math.round(Math.min(canvas.width, canvas.height) * 0.035));
    const fontSize = Math.max(18, Math.round(Math.min(canvas.width, canvas.height) * 0.055));
    context.save();
    context.font = `700 ${fontSize}px "Segoe UI", "Noto Sans TC", Arial, sans-serif`;
    context.textBaseline = "middle";
    const metrics = context.measureText(text);
    const boxWidth = metrics.width + margin * 1.2;
    const boxHeight = fontSize * 1.75;
    let x = canvas.width - margin - boxWidth / 2;
    let y = canvas.height - margin - boxHeight / 2;

    if (position === "sw") {
      x = margin + boxWidth / 2;
    }
    if (position === "ne") {
      y = margin + boxHeight / 2;
    }
    if (position === "nw") {
      x = margin + boxWidth / 2;
      y = margin + boxHeight / 2;
    }
    if (position === "center") {
      x = canvas.width / 2;
      y = canvas.height / 2;
    }

    context.fillStyle = "rgba(0, 0, 0, 0.42)";
    roundRect(context, x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, 8);
    context.fill();
    context.fillStyle = "rgba(255, 255, 255, 0.92)";
    context.textAlign = "center";
    context.fillText(text, x, y);
    context.restore();
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function resolveImageSize(width, height, maxWidth, maxHeight, keepRatio) {
    if (!maxWidth && !maxHeight) {
      return { width, height };
    }

    if (!keepRatio) {
      return {
        width: maxWidth || width,
        height: maxHeight || height
      };
    }

    const widthRatio = maxWidth ? maxWidth / width : Infinity;
    const heightRatio = maxHeight ? maxHeight / height : Infinity;
    const ratio = Math.min(widthRatio, heightRatio, 1);
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function renderImageResult(file, converted, url, outputName) {
    const item = document.createElement("div");
    item.className = "result-item";

    const preview = document.createElement("img");
    preview.src = url;
    preview.alt = outputName;

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.innerHTML = `<strong>${escapeHtml(outputName)}</strong><span>${formatBytes(file.size)} → ${formatBytes(converted.blob.size)} · ${converted.width}×${converted.height}</span>`;

    const link = document.createElement("a");
    link.className = "secondary-button compact";
    link.href = url;
    link.download = outputName;
    link.textContent = "下載";

    item.append(preview, meta, link);
    return item;
  }

  function renderErrorItem(name, message) {
    const item = document.createElement("div");
    item.className = "result-item";
    item.innerHTML = `<span></span><div class="result-meta"><strong>${escapeHtml(name)}</strong><span class="error">${escapeHtml(message)}</span></div>`;
    return item;
  }

  function revokeImageUrls() {
    state.imageDownloads.forEach((item) => URL.revokeObjectURL(item.url));
    state.imageDownloads = [];
  }

  function bindPdfTool() {
    $("#pdf-mode").addEventListener("change", () => {
      const mode = $("#pdf-mode").value;
      if (state.pdfFiles.length && !pdfFilesMatchMode(mode, state.pdfFiles)) {
        state.pdfFiles = [];
        $("#pdf-files").value = "";
        renderPdfOrderList("#pdf-merge-order", "pdfFiles");
        showToast("已清除不符合新工作類型的檔案，請重新選擇", "info");
      }
      updatePdfControls();
    });
    $("#pdf-files").addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      if (files.length && !pdfFilesMatchMode($("#pdf-mode").value, files)) {
        state.pdfFiles = [];
        event.target.value = "";
        setEmpty("#pdf-results", "檔案類型或數量不符合目前工作");
        showToast("請選擇符合目前工作類型的檔案", "error");
        updatePdfControls();
        return;
      }
      state.pdfFiles = files;
      if ($("#pdf-mode").value === "workspace") {
        await loadPdfWorkspaceFiles(files, false);
      } else {
        renderPdfOrderList("#pdf-merge-order", "pdfFiles");
      }
    });
    bindPdfOrderList("#pdf-merge-order", "pdfFiles");
    bindPdfWorkspace();
    $("#pdf-watermark-opacity").addEventListener("input", (event) => {
      $("#pdf-watermark-opacity-output").textContent = `${Math.round(Number(event.target.value) * 100)}%`;
    });
    $("#pdf-password-visible").addEventListener("change", (event) => {
      $("#pdf-password").type = event.target.checked ? "text" : "password";
    });

    $("#pdf-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const mode = $("#pdf-mode").value;
      const files = state.pdfFiles;
      if (mode === "workspace" && state.pdfWorkspaceLoading) {
        showToast("PDF 頁面仍在載入，請稍候", "info");
        return;
      }
      const hasInput = mode === "workspace" ? state.pdfWorkspacePages.length > 0 : files.length > 0;
      if (!hasInput) {
        setEmpty("#pdf-results", mode === "office-to-pdf" ? "請先選擇 Office 文件" : "請先選擇 PDF");
        showToast(mode === "office-to-pdf" ? "請先選擇 Office 文件" : "請先選擇 PDF", "error");
        return;
      }
      if (PDF_BACKEND_JOB_TYPES.has(mode)) {
        await enqueuePdfBackendJob();
        return;
      }
      if (!window.PDFLib) {
        setEmpty("#pdf-results", "PDF 函式庫未載入，請確認 vendor/pdf-lib.min.js 存在");
        return;
      }

      revokePdfUrls();
      const container = $("#pdf-results");
      container.classList.remove("empty");
      container.textContent = "處理中...";
      $("#download-all-pdfs").disabled = true;
      setStatus("#pdf-backend-status", "處理中…");

      try {
        const results = await runPdfTool(mode, files);
        container.textContent = "";
        results.forEach((result) => {
          const url = URL.createObjectURL(result.blob);
          state.pdfDownloads.push({ url, name: result.name });
          container.appendChild(renderFileResult(fileLabelFromName(result.name), result.name, result.blob.size, url));
        });
        $("#download-all-pdfs").disabled = state.pdfDownloads.length === 0;
        setStatus("#pdf-backend-status", "處理完成");
      } catch (error) {
        container.textContent = "";
        container.appendChild(renderErrorItem(files[0] ? files[0].name : "PDF 工作台", readableError(error)));
        setStatus("#pdf-backend-status", "處理失敗");
      }
    });

    $("#download-all-pdfs").addEventListener("click", () => {
      state.pdfDownloads.forEach((item, index) => {
        window.setTimeout(() => triggerDownload(item.url, item.name), index * 180);
      });
    });

    updatePdfControls();
  }

  function updatePdfControls() {
    const mode = $("#pdf-mode").value;
    const usesBackgroundTask = PDF_BACKEND_JOB_TYPES.has(mode);
    const showWorkspace = mode === "workspace";
    const showRange = mode === "extract" || mode === "rotate" || mode === "watermark" || mode === "text" || mode === "images" || mode === "page-numbers";
    const showRotation = mode === "rotate";
    const showWatermark = mode === "watermark";
    const showImages = mode === "images";
    const showPageNumbers = mode === "page-numbers";
    const showOfficeFormat = mode === "pdf-to-office";
    const showOcr = mode === "ocr-pdf";
    const showPassword = mode === "pdf-encrypt" || mode === "pdf-decrypt";
    $(".pdf-range-controls").style.display = showRange ? "" : "none";
    $("#pdf-rotation").closest("label").style.display = showRotation ? "" : "none";
    $(".pdf-watermark-controls").style.display = showWatermark ? "" : "none";
    $(".pdf-image-controls").style.display = showImages ? "" : "none";
    $(".pdf-pagenumber-controls").style.display = showPageNumbers ? "" : "none";
    $(".pdf-office-format-controls").style.display = showOfficeFormat ? "" : "none";
    $(".pdf-ocr-controls").style.display = showOcr ? "" : "none";
    $(".pdf-password-controls").style.display = showPassword ? "" : "none";
    $(".pdf-output-name-control").style.display = usesBackgroundTask ? "none" : "";

    const input = $("#pdf-files");
    const isOfficeInput = mode === "office-to-pdf";
    input.accept = isOfficeInput ? ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp" : "application/pdf,.pdf";
    input.multiple = showWorkspace || mode === "merge" || usesBackgroundTask;
    $("#pdf-file-zone-title").textContent = isOfficeInput ? "選擇 Office 文件" : "選擇 PDF";
    if (!state.pdfFiles.length) {
      $("#pdf-file-hint").textContent = isOfficeInput
        ? "支援 Word、Excel、PowerPoint 及 OpenDocument"
        : showWorkspace ? "選擇多個 PDF，載入後逐頁編排"
          : mode === "merge" ? "可一次選擇多個 PDF，再調整合併次序" : "可一次選擇多個 PDF";
    }

    const engineBadge = $("#pdf-engine-badge");
    engineBadge.textContent = showWorkspace ? "視覺工作台" : usesBackgroundTask ? "本機任務" : "本機即時";
    engineBadge.classList.toggle("muted", usesBackgroundTask && !backendApiAvailable());
    $("#pdf-submit-button").textContent = showWorkspace ? "輸出工作台 PDF" : usesBackgroundTask ? "開始處理" : "處理 PDF";
    if (!$("#pdf-backend-jobs").classList.contains("empty")) {
      // 保留進行中任務的狀態文字。
    } else {
      setStatus("#pdf-backend-status", usesBackgroundTask
        ? (backendApiAvailable() ? "本機服務已就緒" : "需要本機服務")
        : "可即時處理");
    }
    updatePdfModeNote(mode);
    renderPdfOrderList("#pdf-merge-order", "pdfFiles");
    renderPdfWorkspace();
  }

  function pdfFilesMatchMode(mode, files) {
    const officeExtensions = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"]);
    const extensions = files.map((file) => String(file.name || "").split(".").pop().toLowerCase());
    if (mode === "office-to-pdf") {
      return extensions.every((extension) => officeExtensions.has(extension));
    }
    if (!extensions.every((extension) => extension === "pdf")) {
      return false;
    }
    return mode === "workspace" || mode === "merge" || PDF_BACKEND_JOB_TYPES.has(mode) || files.length <= 1;
  }

  function updatePdfModeNote(mode) {
    const note = $("#pdf-mode-note");
    const notes = {
      workspace: "把多份 PDF 展開成頁面縮圖，自由編排後輸出成一份新 PDF。",
      merge: "檔案會完全在本機記憶體內依照下方次序合併。",
      split: "每一頁會輸出成獨立 PDF，毋須啟動本機服務。",
      extract: "輸入頁碼範圍，只把需要的頁面輸出成新 PDF。",
      rotate: "只旋轉指定頁面，原始檔案不會被修改。",
      watermark: "文字浮水印會套用到指定頁面。",
      "page-numbers": "頁碼會從指定數字開始，加到所選頁面。",
      text: "直接抽取 PDF 內可搜尋的文字；掃描文件請選擇 OCR。",
      images: "PDF 頁面會在本機轉成獨立圖片。",
      "pdf-compress": "程式會自動在本機背景最佳化 PDF，完成後顯示輸出檔案。",
      "pdf-to-docx": "適合文字型 PDF；會建立簡易 DOCX，但不保留原始版面。",
      "pdf-to-office": isToolAvailable("libreOffice")
        ? "使用本機文件引擎轉換並盡量保留版面；複雜或掃描文件效果可能不同。"
        : "此工作需要本機文件引擎；目前未偵測到，請到「狀態」頁設定。",
      "ocr-pdf": isToolAvailable("tesseract")
        ? "適合掃描文件；程式會逐頁辨識文字並輸出 TXT。"
        : "此工作需要本機 OCR；目前未偵測到，請到「狀態」頁檢查。",
      "office-to-pdf": isToolAvailable("libreOffice")
        ? "程式會自動使用本機文件引擎把 Office 文件轉成 PDF。"
        : "此工作需要本機文件引擎；目前未偵測到，請到「狀態」頁設定。",
      "pdf-encrypt": isToolAvailable("qpdf")
        ? "使用本機安全工具加密 PDF；請妥善保存密碼。"
        : "此工作需要本機 PDF 安全工具；目前未偵測到，請到「狀態」頁檢查。",
      "pdf-decrypt": isToolAvailable("qpdf")
        ? "輸入現有密碼以建立一份已解除加密的新 PDF。"
        : "此工作需要本機 PDF 安全工具；目前未偵測到，請到「狀態」頁檢查。"
    };
    note.textContent = notes[mode] || "程式會自動選擇合適的本機處理方式。";
  }

  function clonePdfWorkspacePages(pages = state.pdfWorkspacePages) {
    return pages.map((page) => ({ ...page }));
  }

  function resetPdfWorkspace() {
    state.pdfWorkspacePages = [];
    state.pdfWorkspaceUndo = [];
    state.pdfWorkspaceRedo = [];
    state.pdfWorkspaceLoading = false;
    state.pdfWorkspaceSelectedId = null;
    pdfWorkspacePreviewCache.clear();
    pdfWorkspacePreviewToken += 1;
    renderPdfWorkspace();
  }

  function recordPdfWorkspaceChange() {
    state.pdfWorkspaceUndo.push(clonePdfWorkspacePages());
    if (state.pdfWorkspaceUndo.length > 40) state.pdfWorkspaceUndo.shift();
    state.pdfWorkspaceRedo = [];
  }

  function mutatePdfWorkspace(mutator) {
    recordPdfWorkspaceChange();
    mutator(state.pdfWorkspacePages);
    renderPdfWorkspace();
  }

  async function loadPdfWorkspaceFiles(files, append) {
    if (!files.length) {
      if (!append) resetPdfWorkspace();
      return;
    }
    state.pdfWorkspaceLoading = true;
    if (!append) {
      state.pdfWorkspacePages = [];
      state.pdfWorkspaceUndo = [];
      state.pdfWorkspaceRedo = [];
      state.pdfWorkspaceSelectedId = null;
      pdfWorkspacePreviewCache.clear();
    }
    renderPdfWorkspace();
    setStatus("#pdf-workspace-status", "正在讀取 PDF…");

    try {
      const pdfjs = await loadPdfJs();
      const pagesToAdd = [];
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        const data = new Uint8Array(await file.arrayBuffer());
        assertPdfNotEncrypted(data, file.name);
        const sourceId = `pdf-source-${Date.now()}-${fileIndex}-${++pdfWorkspacePageId}`;
        let pdf;
        try {
          pdf = await pdfjs.getDocument(createPdfJsDocumentOptions(data)).promise;
        } catch (error) {
          throwFriendlyPdfLoadError(error, file.name);
        }
        if (state.pdfWorkspacePages.length + pagesToAdd.length + pdf.numPages > PDF_WORKSPACE_MAX_PAGES) {
          if (pdf && typeof pdf.destroy === "function") await pdf.destroy();
          throw new Error(`視覺工作台一次最多載入 ${PDF_WORKSPACE_MAX_PAGES} 頁`);
        }

        for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
          setStatus("#pdf-workspace-status", `載入 ${fileIndex + 1}/${files.length} · 第 ${pageIndex + 1}/${pdf.numPages} 頁`);
          const pdfPage = await pdf.getPage(pageIndex + 1);
          const naturalViewport = pdfPage.getViewport({ scale: 1 });
          const scale = Math.min(150 / naturalViewport.width, 190 / naturalViewport.height, 0.45);
          const viewport = pdfPage.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("瀏覽器無法建立 PDF 頁面預覽");
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          await pdfPage.render({ canvasContext: context, viewport }).promise;
          pagesToAdd.push({
            id: `pdf-page-${++pdfWorkspacePageId}`,
            sourceId,
            sourceFile: file,
            fileName: file.name,
            pageIndex,
            rotation: 0,
            width: naturalViewport.width,
            height: naturalViewport.height,
            thumbnail: canvas.toDataURL("image/jpeg", 0.8),
            blank: false
          });
          if (typeof pdfPage.cleanup === "function") pdfPage.cleanup();
        }
        if (pdf && typeof pdf.destroy === "function") await pdf.destroy();
      }

      if (append && state.pdfWorkspacePages.length) recordPdfWorkspaceChange();
      state.pdfWorkspacePages.push(...pagesToAdd);
      if (!state.pdfWorkspaceSelectedId && state.pdfWorkspacePages.length) {
        state.pdfWorkspaceSelectedId = state.pdfWorkspacePages[0].id;
      }
      state.pdfFiles = append ? [...state.pdfFiles, ...files] : Array.from(files);
      setStatus("#pdf-workspace-status", `已載入 ${state.pdfWorkspacePages.length} 頁`);
      $("#pdf-file-hint").textContent = `已載入 ${new Set(state.pdfWorkspacePages.filter((page) => !page.blank).map((page) => page.sourceId)).size} 個 PDF · ${state.pdfWorkspacePages.length} 頁`;
    } catch (error) {
      if (!append) state.pdfWorkspacePages = [];
      setStatus("#pdf-workspace-status", "載入失敗");
      setEmpty("#pdf-results", readableError(error));
      showToast(readableError(error), "error", 6000);
    } finally {
      state.pdfWorkspaceLoading = false;
      renderPdfWorkspace();
    }
  }

  function bindPdfWorkspace() {
    const addInput = $("#pdf-workspace-add-input");
    $("#pdf-workspace-add-files").addEventListener("click", () => addInput.click());
    addInput.addEventListener("change", async () => {
      const files = Array.from(addInput.files || []);
      addInput.value = "";
      if (files.length && !pdfFilesMatchMode("workspace", files)) {
        showToast("工作台只接受 PDF 檔案", "error");
        return;
      }
      await loadPdfWorkspaceFiles(files, true);
    });
    $("#pdf-workspace-add-blank").addEventListener("click", () => {
      const blankPage = {
        id: `pdf-page-${++pdfWorkspacePageId}`,
        sourceId: null,
        sourceFile: null,
        fileName: "空白頁",
        pageIndex: null,
        rotation: 0,
        width: 595.28,
        height: 841.89,
        thumbnail: "",
        blank: true
      };
      state.pdfWorkspaceSelectedId = blankPage.id;
      mutatePdfWorkspace((pages) => pages.push(blankPage));
    });
    $("#pdf-workspace-undo").addEventListener("click", () => {
      if (!state.pdfWorkspaceUndo.length) return;
      state.pdfWorkspaceRedo.push(clonePdfWorkspacePages());
      state.pdfWorkspacePages = state.pdfWorkspaceUndo.pop();
      renderPdfWorkspace();
    });
    $("#pdf-workspace-redo").addEventListener("click", () => {
      if (!state.pdfWorkspaceRedo.length) return;
      state.pdfWorkspaceUndo.push(clonePdfWorkspacePages());
      state.pdfWorkspacePages = state.pdfWorkspaceRedo.pop();
      renderPdfWorkspace();
    });
    $("#pdf-workspace-clear").addEventListener("click", () => {
      if (!state.pdfWorkspacePages.length) return;
      state.pdfWorkspaceSelectedId = null;
      mutatePdfWorkspace((pages) => pages.splice(0, pages.length));
    });

    $("#pdf-preview-prev").addEventListener("click", () => selectPdfWorkspaceOffset(-1));
    $("#pdf-preview-next").addEventListener("click", () => selectPdfWorkspaceOffset(1));
    $("#pdf-preview-rotate").addEventListener("click", () => {
      const index = state.pdfWorkspacePages.findIndex((page) => page.id === state.pdfWorkspaceSelectedId);
      if (index < 0) return;
      mutatePdfWorkspace((pages) => { pages[index].rotation = (pages[index].rotation + 90) % 360; });
    });

    const grid = $("#pdf-workspace-grid");
    let draggedIndex = -1;
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-workspace-action]");
      const card = event.target.closest(".pdf-workspace-page");
      if (!card) return;
      const index = Number(card.dataset.index);
      state.pdfWorkspaceSelectedId = state.pdfWorkspacePages[index].id;
      if (!button) {
        renderPdfWorkspace();
        return;
      }
      const action = button.dataset.workspaceAction;
      if (action === "left" || action === "right") {
        const targetIndex = index + (action === "left" ? -1 : 1);
        if (targetIndex < 0 || targetIndex >= state.pdfWorkspacePages.length) return;
        mutatePdfWorkspace((pages) => {
          const [page] = pages.splice(index, 1);
          pages.splice(targetIndex, 0, page);
        });
      } else if (action === "rotate") {
        mutatePdfWorkspace((pages) => { pages[index].rotation = (pages[index].rotation + 90) % 360; });
      } else if (action === "duplicate") {
        const duplicateId = `pdf-page-${++pdfWorkspacePageId}`;
        state.pdfWorkspaceSelectedId = duplicateId;
        mutatePdfWorkspace((pages) => pages.splice(index + 1, 0, { ...pages[index], id: duplicateId }));
      } else if (action === "delete") {
        const replacement = state.pdfWorkspacePages[index + 1] || state.pdfWorkspacePages[index - 1];
        state.pdfWorkspaceSelectedId = replacement ? replacement.id : null;
        mutatePdfWorkspace((pages) => pages.splice(index, 1));
      }
    });
    grid.addEventListener("keydown", (event) => {
      const card = event.target.closest(".pdf-workspace-page");
      if (!card || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      state.pdfWorkspaceSelectedId = state.pdfWorkspacePages[Number(card.dataset.index)].id;
      renderPdfWorkspace();
    });
    grid.addEventListener("dragstart", (event) => {
      const card = event.target.closest(".pdf-workspace-page");
      if (!card || state.pdfWorkspaceLoading) return;
      draggedIndex = Number(card.dataset.index);
      card.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(draggedIndex));
      }
    });
    grid.addEventListener("dragover", (event) => {
      const card = event.target.closest(".pdf-workspace-page");
      if (!card || draggedIndex < 0) return;
      event.preventDefault();
      grid.querySelectorAll(".is-drag-target").forEach((item) => item.classList.remove("is-drag-target"));
      card.classList.add("is-drag-target");
    });
    grid.addEventListener("drop", (event) => {
      const card = event.target.closest(".pdf-workspace-page");
      if (!card || draggedIndex < 0) return;
      event.preventDefault();
      const targetIndex = Number(card.dataset.index);
      if (targetIndex !== draggedIndex) {
        mutatePdfWorkspace((pages) => {
          const [page] = pages.splice(draggedIndex, 1);
          pages.splice(targetIndex, 0, page);
        });
      }
      draggedIndex = -1;
    });
    grid.addEventListener("dragend", () => {
      draggedIndex = -1;
      grid.querySelectorAll(".is-dragging, .is-drag-target").forEach((item) => item.classList.remove("is-dragging", "is-drag-target"));
    });
  }

  function selectPdfWorkspaceOffset(offset) {
    const currentIndex = state.pdfWorkspacePages.findIndex((page) => page.id === state.pdfWorkspaceSelectedId);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= state.pdfWorkspacePages.length) return;
    state.pdfWorkspaceSelectedId = state.pdfWorkspacePages[targetIndex].id;
    renderPdfWorkspace();
  }

  function renderPdfWorkspace() {
    const surface = $("#pdf-workspace");
    if (!surface) return;
    const isWorkspace = $("#pdf-mode").value === "workspace";
    surface.hidden = !isWorkspace;
    const pages = state.pdfWorkspacePages;
    if (pages.length && !pages.some((page) => page.id === state.pdfWorkspaceSelectedId)) {
      state.pdfWorkspaceSelectedId = pages[0].id;
    } else if (!pages.length) {
      state.pdfWorkspaceSelectedId = null;
    }
    const sourceCount = new Set(pages.filter((page) => !page.blank).map((page) => page.sourceId)).size;
    $("#pdf-workspace-count").textContent = pages.length
      ? `${sourceCount} 個 PDF · ${pages.length} 頁`
      : "尚未載入頁面";
    $("#pdf-workspace-undo").disabled = state.pdfWorkspaceLoading || !state.pdfWorkspaceUndo.length;
    $("#pdf-workspace-redo").disabled = state.pdfWorkspaceLoading || !state.pdfWorkspaceRedo.length;
    $("#pdf-workspace-clear").disabled = state.pdfWorkspaceLoading || !pages.length;
    $("#pdf-workspace-add-files").disabled = state.pdfWorkspaceLoading;
    $("#pdf-workspace-add-blank").disabled = state.pdfWorkspaceLoading;
    const grid = $("#pdf-workspace-grid");
    if (!pages.length) {
      grid.classList.add("empty");
      grid.textContent = state.pdfWorkspaceLoading ? "正在建立頁面縮圖…" : "選擇 PDF 後，所有頁面會在這裡顯示";
      renderPdfLivePreview();
      return;
    }
    grid.classList.remove("empty");
    grid.innerHTML = pages.map((page, index) => {
      const rotation = ((page.rotation % 360) + 360) % 360;
      const selected = page.id === state.pdfWorkspaceSelectedId;
      const preview = page.blank
        ? '<div class="pdf-workspace-blank-preview"><span>空白頁</span></div>'
        : `<img src="${page.thumbnail}" alt="${escapeHtml(page.fileName)} 第 ${page.pageIndex + 1} 頁預覽" class="${rotation === 90 || rotation === 270 ? "is-sideways" : ""}" style="transform:rotate(${rotation}deg)">`;
      const pageLabel = page.blank ? "A4 空白頁" : `原第 ${page.pageIndex + 1} 頁${rotation ? ` · 旋轉 ${rotation}°` : ""}`;
      return [
        `<article class="pdf-workspace-page${selected ? " is-selected" : ""}" draggable="${!state.pdfWorkspaceLoading}" data-index="${index}" tabindex="0" aria-label="預覽第 ${index + 1} 頁：${escapeHtml(page.fileName)}" aria-current="${selected ? "page" : "false"}">`,
        `<div class="pdf-workspace-preview"><span class="pdf-workspace-position">${index + 1}</span>${preview}</div>`,
        `<div class="pdf-workspace-meta"><strong title="${escapeHtml(page.fileName)}">${escapeHtml(page.fileName)}</strong><small>${pageLabel}</small></div>`,
        '<div class="pdf-workspace-page-actions">',
        `<button type="button" data-workspace-action="left" aria-label="向前移動第 ${index + 1} 頁" title="向前移動"${index === 0 ? " disabled" : ""}>←</button>`,
        `<button type="button" data-workspace-action="right" aria-label="向後移動第 ${index + 1} 頁" title="向後移動"${index === pages.length - 1 ? " disabled" : ""}>→</button>`,
        `<button type="button" data-workspace-action="rotate" aria-label="順時針旋轉第 ${index + 1} 頁" title="旋轉">↻</button>`,
        `<button type="button" data-workspace-action="duplicate" aria-label="複製第 ${index + 1} 頁" title="複製">⧉</button>`,
        `<button type="button" data-workspace-action="delete" aria-label="刪除第 ${index + 1} 頁" title="刪除" class="danger">×</button>`,
        "</div>",
        "</article>"
      ].join("");
    }).join("");
    renderPdfLivePreview();
  }

  async function renderPdfLivePreview() {
    const preview = $("#pdf-live-preview");
    const stage = $("#pdf-live-preview-stage");
    if (!preview || !stage) return;
    const pages = state.pdfWorkspacePages;
    const index = pages.findIndex((page) => page.id === state.pdfWorkspaceSelectedId);
    const page = index >= 0 ? pages[index] : null;
    const token = ++pdfWorkspacePreviewToken;
    preview.classList.toggle("empty", !page);
    $("#pdf-preview-prev").disabled = !page || index === 0 || state.pdfWorkspaceLoading;
    $("#pdf-preview-next").disabled = !page || index === pages.length - 1 || state.pdfWorkspaceLoading;
    $("#pdf-preview-rotate").disabled = !page || state.pdfWorkspaceLoading;

    if (!page) {
      $("#pdf-live-preview-page").textContent = "尚未選擇頁面";
      $("#pdf-live-preview-meta").textContent = state.pdfWorkspaceLoading ? "正在建立頁面縮圖…" : "載入 PDF 後可逐頁查看";
      stage.className = "pdf-live-preview-stage empty";
      stage.textContent = state.pdfWorkspaceLoading ? "正在載入預覽…" : "選擇頁面後在此預覽";
      return;
    }

    const rotation = ((page.rotation % 360) + 360) % 360;
    $("#pdf-live-preview-page").textContent = `第 ${index + 1} / ${pages.length} 頁`;
    $("#pdf-live-preview-meta").textContent = page.blank
      ? `A4 空白頁${rotation ? ` · 旋轉 ${rotation}°` : ""}`
      : `${page.fileName} · 原第 ${page.pageIndex + 1} 頁${rotation ? ` · 旋轉 ${rotation}°` : ""}`;

    if (page.blank) {
      stage.className = "pdf-live-preview-stage";
      stage.innerHTML = `<div class="pdf-live-preview-blank" style="transform:rotate(${rotation}deg)"><span>空白頁</span></div>`;
      return;
    }

    const cacheKey = `${page.sourceId}:${page.pageIndex}`;
    const cached = pdfWorkspacePreviewCache.get(cacheKey);
    if (cached) {
      showPdfLivePreviewImage(page, cached, rotation);
      return;
    }

    stage.className = "pdf-live-preview-stage loading";
    stage.textContent = "正在產生清晰預覽…";
    let pdf;
    let pdfPage;
    try {
      const pdfjs = await loadPdfJs();
      const data = new Uint8Array(await page.sourceFile.arrayBuffer());
      pdf = await pdfjs.getDocument(createPdfJsDocumentOptions(data)).promise;
      pdfPage = await pdf.getPage(page.pageIndex + 1);
      const naturalViewport = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(680 / naturalViewport.width, 880 / naturalViewport.height, 1.4);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("瀏覽器無法建立 PDF 即時預覽");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      const imageUrl = canvas.toDataURL("image/jpeg", 0.9);
      pdfWorkspacePreviewCache.set(cacheKey, imageUrl);
      if (pdfWorkspacePreviewCache.size > PDF_WORKSPACE_PREVIEW_CACHE_SIZE) {
        pdfWorkspacePreviewCache.delete(pdfWorkspacePreviewCache.keys().next().value);
      }
      if (token === pdfWorkspacePreviewToken && state.pdfWorkspaceSelectedId === page.id) {
        showPdfLivePreviewImage(page, imageUrl, rotation);
      }
    } catch (error) {
      if (token === pdfWorkspacePreviewToken) {
        stage.className = "pdf-live-preview-stage error";
        stage.textContent = `預覽失敗：${readableError(error)}`;
      }
    } finally {
      if (pdfPage && typeof pdfPage.cleanup === "function") pdfPage.cleanup();
      if (pdf && typeof pdf.destroy === "function") await pdf.destroy();
    }
  }

  function showPdfLivePreviewImage(page, imageUrl, rotation) {
    const stage = $("#pdf-live-preview-stage");
    stage.className = "pdf-live-preview-stage";
    stage.innerHTML = `<img src="${imageUrl}" alt="${escapeHtml(page.fileName)} 第 ${page.pageIndex + 1} 頁即時預覽" class="${rotation === 90 || rotation === 270 ? "is-sideways" : ""}" style="transform:rotate(${rotation}deg)">`;
  }

  function pdfOrderFiles(stateKey) {
    return Array.isArray(state[stateKey]) ? state[stateKey] : [];
  }

  function pdfOrderIsVisible(stateKey) {
    return stateKey === "pdfFiles" && $("#pdf-mode").value === "merge";
  }

  function renderPdfOrderList(selector, stateKey) {
    const container = $(selector);
    if (!container) return;
    const files = pdfOrderFiles(stateKey);
    container.hidden = !pdfOrderIsVisible(stateKey) || files.length === 0;
    if (container.hidden) {
      container.textContent = "";
      return;
    }

    const rows = files.map((file, index) => [
      `<li class="pdf-order-item" draggable="true" data-index="${index}">`,
      '<span class="pdf-order-handle" aria-hidden="true">⋮⋮</span>',
      `<span class="pdf-order-number">${index + 1}</span>`,
      `<span class="pdf-order-file"><strong>${escapeHtml(file.name)}</strong><small>${formatBytes(file.size)}</small></span>`,
      '<span class="pdf-order-actions">',
      `<button class="secondary-button compact" type="button" data-order-move="up" aria-label="上移 ${escapeHtml(file.name)}"${index === 0 ? " disabled" : ""}>↑</button>`,
      `<button class="secondary-button compact" type="button" data-order-move="down" aria-label="下移 ${escapeHtml(file.name)}"${index === files.length - 1 ? " disabled" : ""}>↓</button>`,
      "</span>",
      "</li>"
    ].join("")).join("");

    container.innerHTML = [
      '<div class="pdf-order-heading"><strong>合併次序</strong><span>拖放檔案，或使用箭咀調整</span></div>',
      `<ol class="pdf-order-list" aria-label="PDF 合併次序">${rows}</ol>`
    ].join("");
  }

  function movePdfOrderFile(stateKey, fromIndex, toIndex) {
    const files = pdfOrderFiles(stateKey);
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= files.length || toIndex >= files.length) return;
    const [file] = files.splice(fromIndex, 1);
    files.splice(toIndex, 0, file);
    renderPdfOrderList("#pdf-merge-order", stateKey);
  }

  function bindPdfOrderList(selector, stateKey) {
    const container = $(selector);
    if (!container) return;
    let draggedIndex = -1;

    container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-order-move]");
      const row = event.target.closest(".pdf-order-item");
      if (!button || !row) return;
      const fromIndex = Number(row.dataset.index);
      const offset = button.dataset.orderMove === "up" ? -1 : 1;
      movePdfOrderFile(stateKey, fromIndex, fromIndex + offset);
    });
    container.addEventListener("dragstart", (event) => {
      const row = event.target.closest(".pdf-order-item");
      if (!row) return;
      draggedIndex = Number(row.dataset.index);
      row.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(draggedIndex));
      }
    });
    container.addEventListener("dragover", (event) => {
      const row = event.target.closest(".pdf-order-item");
      if (!row || draggedIndex < 0) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      container.querySelectorAll(".is-drag-target").forEach((item) => item.classList.remove("is-drag-target"));
      row.classList.add("is-drag-target");
    });
    container.addEventListener("drop", (event) => {
      const row = event.target.closest(".pdf-order-item");
      if (!row || draggedIndex < 0) return;
      event.preventDefault();
      movePdfOrderFile(stateKey, draggedIndex, Number(row.dataset.index));
      draggedIndex = -1;
    });
    container.addEventListener("dragend", () => {
      draggedIndex = -1;
      container.querySelectorAll(".is-dragging, .is-drag-target").forEach((item) => item.classList.remove("is-dragging", "is-drag-target"));
    });
  }

  async function runPdfTool(mode, files) {
    if (mode === "workspace") {
      return [await exportPdfWorkspace()];
    }
    if (mode === "merge") {
      return [await mergePdfs(files)];
    }
    if (mode === "split") {
      return splitPdf(files[0]);
    }
    if (mode === "extract") {
      return [await extractPdf(files[0])];
    }
    if (mode === "rotate") {
      return [await rotatePdf(files[0])];
    }
    if (mode === "watermark") {
      return [await watermarkPdf(files[0])];
    }
    if (mode === "page-numbers") {
      return [await addPdfPageNumbers(files[0])];
    }
    if (mode === "text") {
      return [await extractPdfText(files[0])];
    }
    if (mode === "images") {
      return renderPdfImages(files[0]);
    }
    throw new Error("未知 PDF 模式");
  }

  async function exportPdfWorkspace() {
    const { PDFDocument, degrees } = window.PDFLib;
    const output = await PDFDocument.create();
    const sourceDocuments = new Map();
    for (const item of state.pdfWorkspacePages) {
      let outputPage;
      if (item.blank) {
        outputPage = output.addPage([item.width || 595.28, item.height || 841.89]);
      } else {
        let source = sourceDocuments.get(item.sourceId);
        if (!source) {
          source = await loadPdfDocument(item.sourceFile);
          sourceDocuments.set(item.sourceId, source);
        }
        const [copiedPage] = await output.copyPages(source, [item.pageIndex]);
        output.addPage(copiedPage);
        outputPage = copiedPage;
      }
      if (item.rotation) {
        const currentRotation = outputPage.getRotation().angle || 0;
        outputPage.setRotation(degrees((currentRotation + item.rotation) % 360));
      }
    }
    if (!output.getPageCount()) throw new Error("工作台沒有可輸出的頁面");
    return makePdfResult(output, normalizePdfName($("#pdf-output-name").value || "swiftlocal-workspace.pdf"));
  }

  async function mergePdfs(files) {
    const { PDFDocument } = window.PDFLib;
    const output = await PDFDocument.create();
    for (const file of files) {
      const input = await loadPdfDocument(file);
      const copiedPages = await output.copyPages(input, input.getPageIndices());
      copiedPages.forEach((page) => output.addPage(page));
    }
    return makePdfResult(output, normalizePdfName($("#pdf-output-name").value || "merged.pdf"));
  }

  async function splitPdf(file) {
    const { PDFDocument } = window.PDFLib;
    const input = await loadPdfDocument(file);
    const pageCount = input.getPageCount();
    if (pageCount > 300) {
      throw new Error("逐頁分割最多支援 300 頁，請先抽頁縮小範圍");
    }

    const base = stripExtension(file.name);
    const digits = String(pageCount).length;
    const results = [];
    for (let index = 0; index < pageCount; index += 1) {
      const output = await PDFDocument.create();
      const [page] = await output.copyPages(input, [index]);
      output.addPage(page);
      const pageName = `${base}_page_${String(index + 1).padStart(Math.max(3, digits), "0")}.pdf`;
      results.push(await makePdfResult(output, pageName));
    }
    return results;
  }

  async function extractPdf(file) {
    const { PDFDocument } = window.PDFLib;
    const input = await loadPdfDocument(file);
    const pageIndexes = parsePageRanges($("#pdf-pages").value, input.getPageCount());
    const output = await PDFDocument.create();
    const pages = await output.copyPages(input, pageIndexes);
    pages.forEach((page) => output.addPage(page));
    return makePdfResult(output, normalizePdfName($("#pdf-output-name").value || `${stripExtension(file.name)}_extract.pdf`));
  }

  async function rotatePdf(file) {
    const { PDFDocument, degrees } = window.PDFLib;
    const input = await loadPdfDocument(file);
    const pageIndexes = parsePageRanges($("#pdf-pages").value, input.getPageCount());
    const rotation = Number($("#pdf-rotation").value) || 90;
    pageIndexes.forEach((index) => {
      const page = input.getPage(index);
      const current = page.getRotation().angle || 0;
      page.setRotation(degrees((current + rotation) % 360));
    });
    return makePdfResult(input, normalizePdfName($("#pdf-output-name").value || `${stripExtension(file.name)}_rotated.pdf`));
  }

  async function watermarkPdf(file) {
    const { PDFDocument, StandardFonts, degrees, rgb } = window.PDFLib;
    const input = await loadPdfDocument(file);
    const pageIndexes = parsePageRanges($("#pdf-pages").value, input.getPageCount());
    const text = $("#pdf-watermark-text").value.trim();
    if (!text) {
      throw new Error("請輸入浮水印文字");
    }
    const opacity = Number($("#pdf-watermark-opacity").value) || 0.25;
    const font = await input.embedFont(StandardFonts.HelveticaBold);

    pageIndexes.forEach((index) => {
      const page = input.getPage(index);
      const { width, height } = page.getSize();
      const size = Math.max(24, Math.min(width, height) * 0.08);
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: height / 2,
        size,
        font,
        color: rgb(0.35, 0.35, 0.35),
        opacity,
        rotate: degrees(-30)
      });
    });

    return makePdfResult(input, normalizePdfName($("#pdf-output-name").value || `${stripExtension(file.name)}_watermark.pdf`));
  }

  async function addPdfPageNumbers(file) {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const input = await loadPdfDocument(file);
    const pageCount = input.getPageCount();
    const pageIndexes = parsePageRanges($("#pdf-pages").value, pageCount);
    const position = $("#pdf-pagenumber-position").value || "bottom-center";
    const startNum = parseInt($("#pdf-pagenumber-start").value, 10) || 1;
    const font = await input.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;

    pageIndexes.forEach((index, i) => {
      const page = input.getPage(index);
      const { width, height } = page.getSize();
      const pageNum = String(startNum + i);
      const textWidth = font.widthOfTextAtSize(pageNum, fontSize);
      const margin = 28;
      let x;
      let y;
      if (position === "bottom-center") { x = (width - textWidth) / 2; y = margin; }
      else if (position === "bottom-right") { x = width - textWidth - margin; y = margin; }
      else if (position === "bottom-left") { x = margin; y = margin; }
      else if (position === "top-center") { x = (width - textWidth) / 2; y = height - margin - fontSize; }
      else if (position === "top-right") { x = width - textWidth - margin; y = height - margin - fontSize; }
      else { x = margin; y = height - margin - fontSize; } // top-left
      page.drawText(pageNum, { x, y, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
    });

    return makePdfResult(input, normalizePdfName($("#pdf-output-name").value || `${stripExtension(file.name)}_numbered.pdf`));
  }

  async function extractPdfText(file) {
    const pdfjs = await loadPdfJs();
    const data = await file.arrayBuffer();
    assertPdfNotEncrypted(data, file.name);
    let pdf;
    try {
      pdf = await pdfjs.getDocument(createPdfJsDocumentOptions(data)).promise;
    } catch (error) {
      throwFriendlyPdfLoadError(error, file.name);
    }
    const pageIndexes = parsePageRanges($("#pdf-pages").value, pdf.numPages);
    const sections = [];

    for (const index of pageIndexes) {
      const page = await pdf.getPage(index + 1);
      const textContent = await page.getTextContent();
      const lines = textItemsToLines(textContent.items);
      sections.push([`--- Page ${index + 1} ---`, ...lines].join("\n"));
    }

    const text = sections.join("\n\n");
    const name = normalizeExtension($("#pdf-output-name").value || `${stripExtension(file.name)}.txt`, "txt");
    return {
      name,
      blob: new Blob([text], { type: "text/plain;charset=utf-8" })
    };
  }

  async function renderPdfImages(file) {
    const pdfjs = await loadPdfJs();
    const data = await file.arrayBuffer();
    assertPdfNotEncrypted(data, file.name);
    let pdf;
    try {
      pdf = await pdfjs.getDocument(createPdfJsDocumentOptions(data)).promise;
    } catch (error) {
      throwFriendlyPdfLoadError(error, file.name);
    }
    const pageIndexes = parsePageRanges($("#pdf-pages").value, pdf.numPages);
    if (pageIndexes.length > 100) {
      throw new Error("PDF 轉圖片一次最多處理 100 頁，請指定較小頁碼範圍");
    }

    const mime = $("#pdf-image-format").value;
    const scale = Number($("#pdf-image-scale").value) || 1.5;
    const ext = extensionFromMime(mime);
    const baseName = stripExtension(file.name);
    const results = [];

    for (const index of pageIndexes) {
      const page = await pdf.getPage(index + 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: mime !== "image/jpeg" });
      if (!context) {
        throw new Error("瀏覽器無法建立 PDF 渲染畫布");
      }
      if (mime === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvasToBlob(canvas, mime, 0.9);
      results.push({
        name: `${baseName}_page_${String(index + 1).padStart(3, "0")}.${ext}`,
        blob
      });
    }
    return results;
  }

  async function makePdfResult(pdfDoc, name) {
    const bytes = await pdfDoc.save();
    return {
      name: normalizePdfName(name),
      blob: new Blob([bytes], { type: "application/pdf" })
    };
  }

  async function loadPdfDocument(file) {
    const { PDFDocument } = window.PDFLib;
    const data = await file.arrayBuffer();
    assertPdfNotEncrypted(data, file.name);
    try {
      return await PDFDocument.load(data);
    } catch (error) {
      throwFriendlyPdfLoadError(error, file.name);
    }
  }

  function encryptedPdfUserMessage(name) {
    return `「${name || "此 PDF"}」已加密，請先到後端工具使用「PDF 解密」，或解除密碼後再處理`;
  }

  function isEncryptedPdfMessage(message) {
    return /encrypt|password|密[碼码]|加密/i.test(String(message || ""));
  }

  function pdfBytesLookEncrypted(data) {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    if (!bytes || !bytes.length) {
      return false;
    }
    const limit = Math.min(bytes.length, 512 * 1024);
    // Match ASCII "/Encrypt" without allocating a full string for large files.
    const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // /Encrypt
    for (let i = 0; i <= limit - needle.length; i += 1) {
      let matched = true;
      for (let j = 0; j < needle.length; j += 1) {
        if (bytes[i + j] !== needle[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return true;
      }
    }
    return false;
  }

  function assertPdfNotEncrypted(data, name) {
    if (pdfBytesLookEncrypted(data)) {
      throw new Error(encryptedPdfUserMessage(name));
    }
  }

  function throwFriendlyPdfLoadError(error, name) {
    const detail = error instanceof Error ? error.message : String(error);
    if (isEncryptedPdfMessage(detail)) {
      throw new Error(encryptedPdfUserMessage(name));
    }
    throw new Error(`無法讀取 PDF「${name || "檔案"}」：${detail}`);
  }

  function parsePageRanges(value, pageCount) {
    const text = value.trim();
    if (!text) {
      return Array.from({ length: pageCount }, (_, index) => index);
    }

    const indexes = new Set();
    text.split(",").forEach((part) => {
      const token = part.trim();
      if (!token) {
        return;
      }
      const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (start > end) {
          throw new Error(`頁碼範圍不正確：${token}`);
        }
        for (let page = start; page <= end; page += 1) {
          addPageIndex(indexes, page, pageCount);
        }
        return;
      }
      addPageIndex(indexes, Number(token), pageCount);
    });

    if (!indexes.size) {
      throw new Error("請輸入有效頁碼");
    }
    return Array.from(indexes).sort((a, b) => a - b);
  }

  function addPageIndex(indexes, pageNumber, pageCount) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw new Error(`頁碼超出範圍：${pageNumber}`);
    }
    indexes.add(pageNumber - 1);
  }

  function normalizePdfName(name) {
    const clean = sanitizeZipName(name || "swiftlocal-output.pdf");
    return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`;
  }

  function normalizeExtension(name, extension) {
    const clean = sanitizeZipName(name || `swiftlocal-output.${extension}`);
    return clean.toLowerCase().endsWith(`.${extension}`) ? clean : `${clean}.${extension}`;
  }

  async function loadPdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import("./vendor/pdfjs/pdf.min.mjs").then((module) => {
        module.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";
        return module;
      });
    }
    return pdfjsPromise;
  }

  function createPdfJsDocumentOptions(data) {
    return {
      data,
      cMapUrl: "./vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "./vendor/pdfjs/standard_fonts/",
      wasmUrl: "./vendor/pdfjs/wasm/"
    };
  }

  function fileLabelFromName(name) {
    const ext = (name.split(".").pop() || "FILE").slice(0, 4).toUpperCase();
    return ext || "FILE";
  }

  function textItemsToLines(items) {
    const lines = [];
    let currentY = null;
    let currentLine = [];
    items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (currentY !== null && Math.abs(y - currentY) > 2) {
        lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
        currentLine = [];
      }
      currentY = y;
      if (item.str && item.str.trim()) {
        currentLine.push(item.str);
      }
    });
    if (currentLine.length) {
      lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
    }
    return lines.filter(Boolean);
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("無法輸出圖片"));
        }
      }, mime, quality);
    });
  }

  function renderFileResult(label, name, size, url) {
    const item = document.createElement("div");
    item.className = "result-item file-result";
    item.innerHTML = [
      `<span class="file-icon">${escapeHtml(label)}</span>`,
      `<div class="result-meta"><strong>${escapeHtml(name)}</strong><span>${formatBytes(size)}</span></div>`
    ].join("");

    const link = document.createElement("a");
    link.className = "secondary-button compact";
    link.href = url;
    link.download = name;
    link.textContent = "下載";
    item.appendChild(link);
    return item;
  }

  function revokePdfUrls() {
    state.pdfDownloads.forEach((item) => URL.revokeObjectURL(item.url));
    state.pdfDownloads = [];
  }

  function bindDataTool() {
    $$("[data-data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.dataMode = button.dataset.dataMode;
        $$("[data-data-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
      });
    });

    $("#data-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = $("#data-input").value;
      try {
        const output = runDataTool(input);
        $("#data-output").value = output;
        setStatus("#data-status", "完成");
      } catch (error) {
        $("#data-output").value = "";
        setStatus("#data-status", "錯誤");
        showToast(readableError(error), "error");
      }
    });

    $("#copy-data-output").addEventListener("click", () => copyText($("#data-output").value));
    $("#download-data-output").addEventListener("click", () => {
      const ext = dataOutputExtension();
      downloadText($("#data-output").value, `data-output.${ext}`);
    });
  }

  function dataOutputExtension() {
    if (state.dataMode === "json-csv") {
      return "csv";
    }
    if (state.dataMode === "json-xml") {
      return "xml";
    }
    if (state.dataMode === "xml-json" || state.dataMode === "json-format" || state.dataMode === "json-minify" || state.dataMode === "csv-json") {
      return "json";
    }
    return "txt";
  }

  function runDataTool(input) {
    if (state.dataMode === "json-format") {
      return JSON.stringify(JSON.parse(input), null, Number($("#json-indent").value));
    }
    if (state.dataMode === "json-minify") {
      return JSON.stringify(JSON.parse(input));
    }
    if (state.dataMode === "csv-json") {
      return JSON.stringify(csvToJson(input), null, Number($("#json-indent").value));
    }
    if (state.dataMode === "json-csv") {
      return jsonToCsv(JSON.parse(input));
    }
    if (state.dataMode === "xml-json") {
      return JSON.stringify(xmlToJson(input), null, Number($("#json-indent").value));
    }
    if (state.dataMode === "json-xml") {
      return jsonToXml(JSON.parse(input));
    }
    throw new Error("未知資料模式");
  }

  function csvToJson(text) {
    const delimiter = resolveDelimiter(text);
    const rows = parseCsv(text, delimiter).filter((row) => row.some((cell) => cell.trim() !== ""));
    if (!rows.length) {
      return [];
    }
    const headers = rows[0].map((header, index) => header.trim() || `column_${index + 1}`);
    return rows.slice(1).map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index] ?? "";
      });
      return item;
    });
  }

  function jsonToCsv(value) {
    const rows = Array.isArray(value) ? value : [value];
    const objects = rows.map((row) => {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        return row;
      }
      return { value: row };
    });
    const headers = Array.from(new Set(objects.flatMap((row) => Object.keys(row))));
    const csvRows = [headers.map(escapeCsvCell).join(",")];
    objects.forEach((row) => {
      csvRows.push(headers.map((header) => escapeCsvCell(normalizeCsvValue(row[header]))).join(","));
    });
    return csvRows.join("\r\n");
  }

  function parseCsv(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"' && quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") {
          index += 1;
        }
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell);
    rows.push(row);
    return rows;
  }

  function resolveDelimiter(text) {
    const selected = $("#csv-delimiter").value;
    if (selected !== "auto") {
      return selected;
    }
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const candidates = [",", ";", "\t"];
    return candidates
      .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
      .sort((a, b) => b.count - a.count)[0].delimiter;
  }

  function xmlToJson(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      throw new Error("XML 格式無法解析");
    }
    const root = doc.documentElement;
    return { [root.nodeName]: xmlElementToObject(root) };
  }

  function xmlElementToObject(element) {
    const attributes = Array.from(element.attributes || []);
    const childElements = Array.from(element.children || []);
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
      .map((node) => node.nodeValue.trim())
      .filter(Boolean)
      .join(" ");

    if (!attributes.length && !childElements.length) {
      return text;
    }

    const result = {};
    if (attributes.length) {
      result["@attributes"] = Object.fromEntries(attributes.map((attr) => [attr.name, attr.value]));
    }
    childElements.forEach((child) => {
      const value = xmlElementToObject(child);
      if (Object.prototype.hasOwnProperty.call(result, child.nodeName)) {
        if (!Array.isArray(result[child.nodeName])) {
          result[child.nodeName] = [result[child.nodeName]];
        }
        result[child.nodeName].push(value);
      } else {
        result[child.nodeName] = value;
      }
    });
    if (text) {
      result["#text"] = text;
    }
    return result;
  }

  function jsonToXml(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return buildXmlElement("root", value, 0);
    }
    const keys = Object.keys(value);
    if (keys.length === 1) {
      return buildXmlElement(sanitizeXmlName(keys[0]), value[keys[0]], 0);
    }
    return buildXmlElement("root", value, 0);
  }

  function buildXmlElement(name, value, level) {
    const indent = "  ".repeat(level);
    const safeName = sanitizeXmlName(name);

    if (Array.isArray(value)) {
      return value.map((item) => buildXmlElement(safeName, item, level)).join("\n");
    }
    if (value === null || value === undefined) {
      return `${indent}<${safeName}/>`;
    }
    if (typeof value !== "object") {
      return `${indent}<${safeName}>${escapeXml(value)}</${safeName}>`;
    }

    const attributes = value["@attributes"] && typeof value["@attributes"] === "object" ? value["@attributes"] : {};
    const attributeText = Object.entries(attributes)
      .map(([key, attrValue]) => ` ${sanitizeXmlName(key)}="${escapeXml(attrValue)}"`)
      .join("");
    const childKeys = Object.keys(value).filter((key) => key !== "@attributes" && key !== "#text");
    const text = value["#text"];

    if (!childKeys.length && (text === undefined || text === null || text === "")) {
      return `${indent}<${safeName}${attributeText}/>`;
    }
    if (!childKeys.length) {
      return `${indent}<${safeName}${attributeText}>${escapeXml(text)}</${safeName}>`;
    }

    const children = childKeys.map((key) => buildXmlElement(key, value[key], level + 1)).join("\n");
    const textLine = text === undefined || text === null || text === "" ? "" : `\n${"  ".repeat(level + 1)}${escapeXml(text)}`;
    return `${indent}<${safeName}${attributeText}>${textLine}\n${children}\n${indent}</${safeName}>`;
  }

  function bindTextTool() {
    $$("[data-text-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.textMode = button.dataset.textMode;
        $$("[data-text-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
        updateTextControls();
      });
    });

    $("#text-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = $("#text-input").value;
      try {
        let output;
        if (state.textMode === "trad-to-simp" || state.textMode === "simp-to-trad") {
          const locale = state.textMode === "trad-to-simp" ? "zh-hans" : "zh-hant";
          output = await convertChineseText(input, locale);
        } else if (state.textMode === "find-replace") {
          output = runFindReplace(input);
        } else {
          output = runTextTool(input);
        }
        $("#text-output").value = output;
        $("#text-count").textContent = `${Array.from(output).length} 字元`;
      } catch (error) {
        $("#text-output").value = "";
        $("#text-count").textContent = "錯誤";
        showToast(readableError(error), "error");
      }
    });

    $("#copy-text-output").addEventListener("click", () => copyText($("#text-output").value));
    updateTextControls();
  }

  function updateTextControls() {
    const isFindReplace = state.textMode === "find-replace";
    const isTradSimp = state.textMode === "trad-to-simp" || state.textMode === "simp-to-trad";
    $(".find-replace-controls").style.display = isFindReplace ? "" : "none";
    $(".trad-simp-note").style.display = isTradSimp ? "" : "none";
  }

  async function convertChineseText(text, locale) {
    // Desktop: local maps via Electron bridge. Browser: prefer FastAPI zhconv, else local maps.
    if (!electronBridgeAvailable() && !backendApiAvailable()) {
      await checkBackendHealth();
    }
    if (electronBridgeAvailable() || backendApiAvailable()) {
      try {
        const result = await backendFetch("/convert-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, locale })
        });
        if (result && typeof result.result === "string") {
          return result.result;
        }
      } catch {
        // fall through to local maps
      }
    }
    return convertChineseLocal(text, locale);
  }

  function convertChineseLocal(text, locale) {
    const api = window.SwiftLocalZhConvert;
    if (!api || typeof api.convertChinese !== "function") {
      throw new Error("本機繁簡字表未載入，請重新整理頁面");
    }
    return api.convertChinese(text, locale);
  }

  function runFindReplace(input) {
    const findText = $("#find-pattern").value;
    const replaceText = $("#replace-pattern").value;
    const useRegex = $("#find-use-regex").checked;
    const caseSensitive = $("#find-case-sensitive").checked;
    if (!findText) { return input; }
    if (useRegex) {
      const flags = "g" + (caseSensitive ? "" : "i");
      return input.replace(new RegExp(findText, flags), replaceText);
    }
    if (caseSensitive) {
      return input.split(findText).join(replaceText);
    }
    return input.replace(new RegExp(escapeRegExp(findText), "gi"), replaceText);
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function runTextTool(input) {
    if (state.textMode === "base64-encode") {
      const bytes = new TextEncoder().encode(input);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    }
    if (state.textMode === "base64-decode") {
      const binary = atob(input.trim());
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    if (state.textMode === "url-encode") {
      return encodeURIComponent(input);
    }
    if (state.textMode === "url-decode") {
      return decodeURIComponent(input);
    }
    if (state.textMode === "html-encode") {
      return escapeHtml(input);
    }
    if (state.textMode === "html-decode") {
      const element = document.createElement("textarea");
      element.innerHTML = input;
      return element.value;
    }
    if (state.textMode === "trim-lines") {
      return splitLines(input).map((line) => line.trim()).join("\n");
    }
    if (state.textMode === "remove-empty-lines") {
      return splitLines(input).filter((line) => line.trim() !== "").join("\n");
    }
    if (state.textMode === "dedupe-lines") {
      return Array.from(new Set(splitLines(input))).join("\n");
    }
    if (state.textMode === "sort-lines") {
      return splitLines(input).sort((a, b) => a.localeCompare(b, "zh-Hant")).join("\n");
    }
    if (state.textMode === "text-stats") {
      return buildTextStats(input);
    }
    throw new Error("未知文字模式");
  }

  function splitLines(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  }

  function buildTextStats(text) {
    const lines = text === "" ? 0 : splitLines(text).length;
    const nonEmptyLines = splitLines(text).filter((line) => line.trim() !== "").length;
    const characters = Array.from(text).length;
    const charactersNoSpaces = Array.from(text.replace(/\s/g, "")).length;
    const words = (text.match(/[\p{L}\p{N}_'-]+/gu) || []).length;
    const bytes = new TextEncoder().encode(text).length;
    return [
      `字元數: ${characters}`,
      `不含空白字元: ${charactersNoSpaces}`,
      `單字 / 詞組數: ${words}`,
      `行數: ${lines}`,
      `非空行數: ${nonEmptyLines}`,
      `UTF-8 位元組: ${bytes}`
    ].join("\n");
  }

  function bindHashTool() {
    $("#hash-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from($("#hash-files").files || []);
      const algorithm = $("#hash-algorithm").value;
      if (!files.length) {
        setEmpty("#hash-results", "請先選擇檔案");
        return;
      }

      state.hashRows = [];
      setEmpty("#hash-results", "計算中...");

      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest(algorithm, buffer);
        state.hashRows.push({
          name: file.name,
          size: file.size,
          algorithm,
          hash: bufferToHex(digest)
        });
      }

      renderHashTable();
      $("#download-hash-csv").disabled = false;
    });

    $("#download-hash-csv").addEventListener("click", () => {
      const rows = [["file", "size", "algorithm", "hash"], ...state.hashRows.map((row) => [row.name, row.size, row.algorithm, row.hash])];
      downloadText(arrayToCsv(rows), "file-hashes.csv");
    });
  }

  function renderHashTable() {
    const html = [
      "<table>",
      "<thead><tr><th>檔案</th><th>大小</th><th>演算法</th><th>雜湊值</th></tr></thead>",
      "<tbody>",
      ...state.hashRows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${formatBytes(row.size)}</td><td>${row.algorithm}</td><td class="code-cell">${row.hash}</td></tr>`),
      "</tbody></table>"
    ].join("");
    const container = $("#hash-results");
    container.classList.remove("empty");
    container.innerHTML = html;
  }

  function bindZipTool() {
    $("#zip-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from($("#zip-files").files || []);
      if (!files.length) {
        setEmpty("#zip-results", "請先選擇檔案");
        return;
      }

      revokeZipUrl();
      setStatus("#zip-status", "處理中");
      setEmpty("#zip-results", "建立中...");
      $("#download-zip").disabled = true;

      try {
        const zipName = normalizeZipName($("#zip-name").value);
        const result = await createZip(files);
        state.zipUrl = URL.createObjectURL(result.blob);
        state.zipName = zipName;
        renderZipResult(result, zipName);
        setStatus("#zip-status", "完成");
        $("#download-zip").disabled = false;
      } catch (error) {
        setStatus("#zip-status", "錯誤");
        setEmpty("#zip-results", readableError(error));
      }
    });

    $("#download-zip").addEventListener("click", () => {
      if (state.zipUrl) {
        triggerDownload(state.zipUrl, state.zipName);
      }
    });
  }

  const SUPPORTS_DEFLATE = typeof CompressionStream !== "undefined";

  async function deflateRaw(data) {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    const reader = cs.readable.getReader();
    const buffers = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffers.push(value);
    }
    return concatUint8Arrays(buffers);
  }

  function concatUint8Arrays(arrays) {
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const a of arrays) { result.set(a, pos); pos += a.length; }
    return result;
  }

  async function createZip(files) {
    const chunks = [];
    const centralDirectory = [];
    const usedNames = new Set();
    let offset = 0;

    for (const file of files) {
      const name = uniqueZipName(sanitizeZipName(file.name), usedNames);
      const nameBytes = new TextEncoder().encode(name);
      const data = new Uint8Array(await file.arrayBuffer());
      const crc = crc32(data);
      const dos = dateToDos(file.lastModified ? new Date(file.lastModified) : new Date());

      let compressed = data;
      let method = 0;
      if (SUPPORTS_DEFLATE) {
        try {
          const deflated = await deflateRaw(data);
          if (deflated.length < data.length) {
            compressed = deflated;
            method = 8;
          }
        } catch { /* fallback to store */ }
      }

      const localHeader = createZipLocalHeader(nameBytes, compressed.length, data.length, crc, dos, method);
      const centralHeader = createZipCentralHeader(nameBytes, compressed.length, data.length, crc, dos, method, offset);

      chunks.push(localHeader, compressed);
      centralDirectory.push(centralHeader);
      offset += localHeader.length + compressed.length;
    }

    const centralOffset = offset;
    const centralSize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
    const endRecord = createZipEndRecord(files.length, centralSize, centralOffset);
    const blob = new Blob([...chunks, ...centralDirectory, endRecord], { type: "application/zip" });
    return { blob, count: files.length };
  }

  function createZipLocalHeader(nameBytes, compressedSize, originalSize, crc, dos, method) {
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x04034b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 0x0800);
    writeUint16(view, 8, method);
    writeUint16(view, 10, dos.time);
    writeUint16(view, 12, dos.date);
    writeUint32(view, 14, crc);
    writeUint32(view, 18, compressedSize);
    writeUint32(view, 22, originalSize);
    writeUint16(view, 26, nameBytes.length);
    writeUint16(view, 28, 0);
    header.set(nameBytes, 30);
    return header;
  }

  function createZipCentralHeader(nameBytes, compressedSize, originalSize, crc, dos, method, offset) {
    const header = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x02014b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 20);
    writeUint16(view, 8, 0x0800);
    writeUint16(view, 10, method);
    writeUint16(view, 12, dos.time);
    writeUint16(view, 14, dos.date);
    writeUint32(view, 16, crc);
    writeUint32(view, 20, compressedSize);
    writeUint32(view, 24, originalSize);
    writeUint16(view, 28, nameBytes.length);
    writeUint16(view, 30, 0);
    writeUint16(view, 32, 0);
    writeUint16(view, 34, 0);
    writeUint16(view, 36, 0);
    writeUint32(view, 38, 0);
    writeUint32(view, 42, offset);
    header.set(nameBytes, 46);
    return header;
  }

  function createZipEndRecord(count, centralSize, centralOffset) {
    const record = new Uint8Array(22);
    const view = new DataView(record.buffer);
    writeUint32(view, 0, 0x06054b50);
    writeUint16(view, 4, 0);
    writeUint16(view, 6, 0);
    writeUint16(view, 8, count);
    writeUint16(view, 10, count);
    writeUint32(view, 12, centralSize);
    writeUint32(view, 16, centralOffset);
    writeUint16(view, 20, 0);
    return record;
  }

  function renderZipResult(result, zipName) {
    const container = $("#zip-results");
    container.classList.remove("empty");
    container.innerHTML = "";

    const item = document.createElement("div");
    item.className = "result-item file-result";
    item.innerHTML = [
      '<span class="file-icon">ZIP</span>',
      `<div class="result-meta"><strong>${escapeHtml(zipName)}</strong><span>${result.count} 個檔案 · ${formatBytes(result.blob.size)}</span></div>`
    ].join("");

    const link = document.createElement("a");
    link.className = "secondary-button compact";
    link.href = state.zipUrl;
    link.download = zipName;
    link.textContent = "下載";
    item.appendChild(link);
    container.appendChild(item);
  }

  function revokeZipUrl() {
    if (state.zipUrl) {
      URL.revokeObjectURL(state.zipUrl);
    }
    state.zipUrl = null;
    state.zipName = "";
  }

  function bindDiffTool() {
    $("#diff-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const left = $("#diff-left").value;
      const right = $("#diff-right").value;
      const ignoreSpace = $("#diff-ignore-space").checked;

      try {
        const diff = createLineDiff(left, right, ignoreSpace);
        state.diffText = diffToText(diff.rows);
        renderDiff(diff);
        setStatus("#diff-status", `${diff.added} 新增 / ${diff.removed} 刪除`);
        $("#download-diff-output").disabled = false;
      } catch (error) {
        state.diffText = "";
        setStatus("#diff-status", "錯誤");
        setEmpty("#diff-output", readableError(error));
        $("#download-diff-output").disabled = true;
      }
    });

    $("#download-diff-output").addEventListener("click", () => {
      if (state.diffText) {
        downloadText(state.diffText, "text-diff.txt");
      }
    });
  }

  function createLineDiff(leftText, rightText, ignoreSpace) {
    const left = splitLines(leftText);
    const right = splitLines(rightText);
    if (left.length * right.length > 2500000) {
      throw new Error("文字行數太多，請先縮小範圍後再比對");
    }

    const normalize = (line) => (ignoreSpace ? line.trim() : line);
    const leftCompare = left.map(normalize);
    const rightCompare = right.map(normalize);
    const matrix = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));

    for (let row = left.length - 1; row >= 0; row -= 1) {
      for (let col = right.length - 1; col >= 0; col -= 1) {
        matrix[row][col] = leftCompare[row] === rightCompare[col]
          ? matrix[row + 1][col + 1] + 1
          : Math.max(matrix[row + 1][col], matrix[row][col + 1]);
      }
    }

    const rows = [];
    let row = 0;
    let col = 0;
    while (row < left.length && col < right.length) {
      if (leftCompare[row] === rightCompare[col]) {
        rows.push({ type: "same", text: left[row] });
        row += 1;
        col += 1;
      } else if (matrix[row + 1][col] >= matrix[row][col + 1]) {
        rows.push({ type: "remove", text: left[row] });
        row += 1;
      } else {
        rows.push({ type: "add", text: right[col] });
        col += 1;
      }
    }
    while (row < left.length) {
      rows.push({ type: "remove", text: left[row] });
      row += 1;
    }
    while (col < right.length) {
      rows.push({ type: "add", text: right[col] });
      col += 1;
    }

    return {
      rows,
      added: rows.filter((item) => item.type === "add").length,
      removed: rows.filter((item) => item.type === "remove").length
    };
  }

  function renderDiff(diff) {
    const container = $("#diff-output");
    container.classList.remove("empty");
    container.innerHTML = "";
    const fragment = document.createDocumentFragment();

    diff.rows.forEach((row, index) => {
      const line = document.createElement("div");
      line.className = `diff-line diff-${row.type}`;
      const sign = row.type === "add" ? "+" : row.type === "remove" ? "-" : " ";
      line.innerHTML = `<span class="diff-number">${index + 1}</span><span class="diff-sign">${sign}</span><code></code>`;
      line.querySelector("code").textContent = row.text;
      fragment.appendChild(line);
    });

    container.appendChild(fragment);
  }

  function diffToText(rows) {
    return rows.map((row) => {
      const sign = row.type === "add" ? "+" : row.type === "remove" ? "-" : " ";
      return `${sign} ${row.text}`;
    }).join("\n");
  }

  function bindSplitTool() {
    $("#split-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const file = $("#split-file").files && $("#split-file").files[0];
      const sizeValue = Number($("#split-size").value);
      const unit = Number($("#split-unit").value);

      if (!file) {
        setEmpty("#split-results", "請先選擇檔案");
        return;
      }
      if (!Number.isFinite(sizeValue) || sizeValue <= 0) {
        setEmpty("#split-results", "請輸入有效的分片大小");
        return;
      }

      revokeSplitUrls();
      const partSize = Math.floor(sizeValue * unit);
      const totalParts = Math.ceil(file.size / partSize);
      if (totalParts > 500) {
        setEmpty("#split-results", "分片數超過 500，請調大每份大小");
        return;
      }

      const baseName = sanitizeZipName(file.name);
      const digits = String(totalParts).length;
      for (let index = 0; index < totalParts; index += 1) {
        const start = index * partSize;
        const end = Math.min(file.size, start + partSize);
        const blob = file.slice(start, end);
        const name = `${baseName}.part${String(index + 1).padStart(Math.max(3, digits), "0")}`;
        state.splitDownloads.push({
          url: URL.createObjectURL(blob),
          name,
          size: blob.size
        });
      }

      const manifest = buildSplitManifest(file, partSize, state.splitDownloads);
      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json;charset=utf-8" });
      state.splitDownloads.push({
        url: URL.createObjectURL(manifestBlob),
        name: `${baseName}.manifest.json`,
        size: manifestBlob.size
      });

      renderSplitResults(file, partSize);
      setStatus("#split-status", `${totalParts} 份`);
      $("#download-all-parts").disabled = false;
    });

    $("#download-all-parts").addEventListener("click", () => {
      state.splitDownloads.forEach((item, index) => {
        window.setTimeout(() => triggerDownload(item.url, item.name), index * 180);
      });
    });
  }

  function buildSplitManifest(file, partSize, downloads) {
    const partFiles = downloads.filter((item) => item.name.includes(".part"));
    return {
      tool: "SwiftLocal",
      type: "binary-file-split",
      originalName: file.name,
      originalSize: file.size,
      partSize,
      partCount: partFiles.length,
      createdAt: new Date().toISOString(),
      parts: partFiles.map((item, index) => ({
        index: index + 1,
        name: item.name,
        size: item.size
      }))
    };
  }

  function renderSplitResults(file, partSize) {
    const container = $("#split-results");
    container.classList.remove("empty");
    container.innerHTML = "";

    const summary = document.createElement("div");
    summary.className = "result-summary";
    summary.textContent = `${file.name} · ${formatBytes(file.size)} · 每份 ${formatBytes(partSize)}`;
    container.appendChild(summary);

    const warning = document.createElement("div");
    warning.className = "result-summary";
    warning.textContent = "這些是原始位元組分片，不能直接打開成 Word、Excel、PDF；必須保留全部 .part 檔和 manifest，之後完整合併才能還原原檔。";
    container.appendChild(warning);

    state.splitDownloads.forEach((item) => {
      const row = document.createElement("div");
      row.className = "result-item file-result";
      row.innerHTML = [
        '<span class="file-icon">PART</span>',
        `<div class="result-meta"><strong>${escapeHtml(item.name)}</strong><span>${formatBytes(item.size)}</span></div>`
      ].join("");
      const link = document.createElement("a");
      link.className = "secondary-button compact";
      link.href = item.url;
      link.download = item.name;
      link.textContent = "下載";
      row.appendChild(link);
      container.appendChild(row);
    });
  }

  function revokeSplitUrls() {
    state.splitDownloads.forEach((item) => URL.revokeObjectURL(item.url));
    state.splitDownloads = [];
  }

  function bindFileZoneLabel(input) {
    const label = input.closest(".file-zone");
    if (!label) return;
    const hint = label.querySelector("small");
    if (!hint) return;
    hint.dataset.originalHint = hint.textContent;
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (!files.length) {
        hint.textContent = hint.dataset.originalHint;
      } else if (files.length === 1) {
        hint.textContent = `${files[0].name}  ·  ${formatBytes(files[0].size)}`;
      } else {
        hint.textContent = `已選取 ${files.length} 個檔案`;
      }
    });
  }

  function bindFileDropZone(zoneId, inputId, listId, stateKey) {
    const zone = $(`#${zoneId}`);
    const input = $(`#${inputId}`);
    const list = $(`#${listId}`);

    function applyFiles(files) {
      state[stateKey] = Array.from(files);
      if (!state[stateKey].length) {
        list.classList.add("empty");
        list.textContent = "尚未選擇檔案";
      } else {
        list.classList.remove("empty");
        list.innerHTML = state[stateKey].map((f) => `<span>${escapeHtml(f.name)} · ${formatBytes(f.size)}</span>`).join("");
      }
    }

    input.addEventListener("change", () => applyFiles(input.files || []));

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
    });
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove("drag-over");
      if (e.dataTransfer.files.length) applyFiles(e.dataTransfer.files);
    });
  }

  function bindBackendTool() {
    $("#detect-backend-tools").addEventListener("click", detectBackendTools);
    $("#refresh-backend-jobs").addEventListener("click", refreshBackendJobs);

    const pickOut = $("#pick-desktop-output-dir");
    const openOut = $("#open-desktop-output-dir");
    if (pickOut) pickOut.addEventListener("click", pickDesktopOutputDir);
    if (openOut) openOut.addEventListener("click", openDesktopOutputDir);

    // 影音面板
    bindFileDropZone("media-drop", "media-files", "media-selected-files", "mediaBackendFiles");
    $("#media-backend-form").addEventListener("submit", enqueueMediaBackendJob);
    const mediaExt = $("#media-output-extension");
    if (mediaExt) {
      mediaExt.addEventListener("change", updateMediaAdvancedControls);
      updateMediaAdvancedControls();
    }

    // 圖片面板
    $("#img-backend-job-type").addEventListener("change", updateImgBackendJobControls);
    bindFileDropZone("img-backend-drop", "img-backend-files", "img-backend-selected-files", "imgBackendFiles");
    $("#img-backend-form").addEventListener("submit", enqueueImgBackendJob);

    $$("[data-tool-pick]").forEach((button) => {
      button.addEventListener("click", () => pickBackendToolPath(button.dataset.toolPick));
    });
    $$("[data-tool-clear]").forEach((button) => {
      button.addEventListener("click", () => clearBackendToolPath(button.dataset.toolClear));
    });
    ["libreOffice", "ffmpeg", "tesseract", "qpdf"].forEach((key) => {
      const input = $(`#tool-path-${key}`);
      input.addEventListener("change", () => setBackendToolPath(key, input.value));
    });

    updateDesktopOutputDirVisibility();
    checkBackendHealth();
    updateImgBackendJobControls();
  }

  function updateDesktopOutputDirVisibility() {
    const block = $("#desktop-output-dir-block");
    if (!block) return;
    block.style.display = electronBridgeAvailable() ? "" : "none";
  }

  function renderDesktopOutputDir() {
    const input = $("#desktop-output-dir");
    if (input) {
      input.value = state.desktopOutputDir || "";
    }
  }

  async function loadDesktopOutputDir() {
    updateDesktopOutputDirVisibility();
    if (!electronBridgeAvailable() || typeof window.swiftLocalBackend.getConfig !== "function") {
      return;
    }
    try {
      const config = await window.swiftLocalBackend.getConfig();
      state.desktopOutputDir = (config && config.defaultOutputDir) || "";
      renderDesktopOutputDir();
    } catch {
      state.desktopOutputDir = "";
      renderDesktopOutputDir();
    }
  }

  async function pickDesktopOutputDir() {
    if (!electronBridgeAvailable()) return;
    try {
      const dir = await window.swiftLocalBackend.chooseDirectory();
      if (!dir) return;
      const config = await window.swiftLocalBackend.setDefaultOutputDir(dir);
      state.desktopOutputDir = (config && config.defaultOutputDir) || dir;
      renderDesktopOutputDir();
      showToast("輸出資料夾已更新", "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  async function openDesktopOutputDir() {
    if (!electronBridgeAvailable()) return;
    const target = state.desktopOutputDir;
    if (!target) {
      showToast("尚未設定輸出資料夾", "error");
      return;
    }
    try {
      await window.swiftLocalBackend.openPath(target);
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  function backendApiAvailable() {
    return state.backendConnected;
  }

  function electronBridgeAvailable() {
    return Boolean(window.swiftLocalBackend && window.swiftLocalBackend.isAvailable);
  }

  async function checkBackendHealth() {
    renderSystemStatusDashboard("checking");
    if (electronBridgeAvailable()) {
      state.backendConnected = true;
      $("#backend-mode").textContent = "桌面版";
      setStatus("#backend-status", "桌面版已就緒");
      setStatus("#pdf-backend-status", "桌面版已就緒");
      setStatus("#img-backend-status", "桌面版已就緒");
      setStatus("#media-backend-status", "桌面版已就緒");
      await loadDesktopOutputDir();
      await detectBackendTools();
      await refreshBackendJobs();
      return;
    }
    setStatus("#backend-status", "連線中");
    setStatus("#pdf-backend-status", "連線中");
    setStatus("#img-backend-status", "連線中");
    setStatus("#media-backend-status", "連線中");
    try {
      await backendFetch("/health");
      state.backendConnected = true;
      $("#backend-mode").textContent = "FastAPI 已連線";
      setStatus("#backend-status", "已連線");
      setStatus("#pdf-backend-status", "已連線");
      setStatus("#img-backend-status", "已連線");
      setStatus("#media-backend-status", "已連線");
      await detectBackendTools();
      await refreshBackendJobs();
    } catch (error) {
      state.backendConnected = false;
      state.backendLastChecked = new Date();
      $("#backend-mode").textContent = "FastAPI 未連線";
      setStatus("#backend-status", "FastAPI 未連線");
      setStatus("#pdf-backend-status", "FastAPI 未連線");
      setStatus("#img-backend-status", "FastAPI 未連線");
      setStatus("#media-backend-status", "FastAPI 未連線");
      renderBackendTools(null);
      renderBackendJobs([]);
      renderPanelBackendJobs("#pdf-backend-jobs", "#pdf-backend-status", [], PDF_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#img-backend-jobs", "#img-backend-status", [], IMG_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#media-backend-jobs", "#media-backend-status", [], MEDIA_BACKEND_JOB_TYPES);
      renderSystemStatusDashboard("offline");
    }
  }

  async function detectBackendTools() {
    if (!backendApiAvailable()) {
      await checkBackendHealth();
      return;
    }
    setStatus("#backend-status", "偵測中");
    renderSystemStatusDashboard("checking");
    try {
      const tools = await backendFetch("/tools");
      state.detectedTools = tools;
      state.backendLastChecked = new Date();
      renderBackendTools(tools);
      setStatus("#backend-status", "已偵測");
    } catch (error) {
      state.backendConnected = false;
      state.detectedTools = null;
      state.backendLastChecked = new Date();
      setStatus("#backend-status", "偵測失敗");
      renderBackendTools(null);
      renderSystemStatusDashboard("offline");
      showToast(readableError(error), "error");
    }
  }

  async function setBackendToolPath(key, toolPath) {
    if (!backendApiAvailable()) {
      showToast("請先啟動 FastAPI 後端", "error");
      return;
    }
    try {
      const tools = await backendFetch(`/tools/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: toolPath })
      });
      renderBackendTools(tools);
      setStatus("#backend-status", "路徑已更新");
    } catch (error) {
      setStatus("#backend-status", "路徑更新失敗");
      showToast(readableError(error), "error");
    }
  }

  function renderBackendTools(tools) {
    state.detectedTools = tools || null;
    const container = $("#backend-tools");
    const items = [
      ["libreOffice", "LibreOffice", "Office 轉 PDF、PDF 轉 Office"],
      ["ffmpeg", "FFmpeg", "影音及進階圖片轉換"],
      ["tesseract", "Tesseract", "圖片及掃描 PDF 文字辨識"],
      ["qpdf", "QPDF", "PDF 加密、解密及安全處理"]
    ];

    container.innerHTML = "";
    items.forEach(([key, label, purpose]) => {
      const tool = tools && tools[key];
      const available = Boolean(tool && tool.available);
      const optional = key === "libreOffice" && !available && backendApiAvailable();
      const row = document.createElement("div");
      row.className = `tool-status ${available ? "available" : optional ? "optional" : "missing"}`;
      row.innerHTML = [
        `<div class="tool-status-heading"><span class="tool-status-indicator" aria-hidden="true">${available ? "✓" : optional ? "!" : "×"}</span><div><strong>${label}</strong><small>${purpose}</small></div></div>`,
        `<span>${toolStatusText(key, tool)}</span>`,
        toolGuidanceText(key, tool) ? `<small>${toolGuidanceText(key, tool)}</small>` : "",
        tool && tool.path ? `<small>${escapeHtml(tool.path)}</small>` : ""
      ].join("");
      container.appendChild(row);
      const input = $(`#tool-path-${key}`);
      if (input) {
        input.value = tool && tool.path ? tool.path : "";
      }
    });
    renderSystemStatusDashboard();
    updatePdfControls();
  }

  function renderSystemStatusDashboard(mode = "ready") {
    const health = $("#system-health");
    if (!health) return;
    const tools = state.detectedTools || {};
    const keys = ["libreOffice", "ffmpeg", "tesseract", "qpdf"];
    const availableCount = keys.filter((key) => tools[key] && tools[key].available).length;
    const connected = state.backendConnected;
    const checking = mode === "checking";
    let healthClass = "offline";
    let icon = "!";
    let title = "基礎功能可用，進階處理未連線";
    let detail = "PDF 工作台、圖片、文字與資料工具仍可使用；啟動本機服務後可解鎖進階轉換。";

    if (checking) {
      healthClass = "checking";
      icon = "…";
      title = "正在檢查系統…";
      detail = "確認本機處理服務與進階工具是否可用。";
    } else if (connected && availableCount === keys.length) {
      healthClass = "ready";
      icon = "✓";
      title = "所有功能均可使用";
      detail = "基礎處理、背景任務及所有進階轉換工具已準備就緒。";
    } else if (connected) {
      healthClass = "degraded";
      icon = "!";
      title = "系統可用，部分進階功能受限";
      detail = `${availableCount}/${keys.length} 個外部工具可用；查看下方功能與工具詳情了解影響。`;
    }

    health.className = `system-health ${healthClass}`;
    health.querySelector(".system-health-icon").textContent = icon;
    $("#system-health-title").textContent = title;
    $("#system-health-detail").textContent = detail;
    $("#system-health-time").textContent = checking
      ? "檢查進行中"
      : state.backendLastChecked
        ? `最後檢查：${state.backendLastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
        : "尚未完成檢查";

    updateSystemSummaryCard("#system-backend-card", connected ? "good" : checking ? "checking" : "bad");
    $("#system-backend-status").textContent = checking ? "檢查中" : connected ? "已連線" : "未連線";
    $("#system-backend-note").textContent = connected
      ? electronBridgeAvailable() ? "桌面版內置服務正常" : "FastAPI 本機服務正常"
      : checking ? "正在連接本機服務" : "基礎工具不受影響";
    updateSystemSummaryCard("#system-tools-card", checking ? "checking" : availableCount === keys.length ? "good" : availableCount ? "warn" : "bad");
    $("#system-tools-status").textContent = checking ? "檢查中" : `${availableCount}/${keys.length} 可用`;
    $("#system-tools-note").textContent = checking ? "正在讀取工具版本" : availableCount === keys.length ? "所有進階功能已解鎖" : "缺少工具的功能會標示於下方";

    renderCapabilityStatus("#capability-office", checking, connected && Boolean(tools.libreOffice && tools.libreOffice.available), "LibreOffice 已就緒", "需要安裝或指定 LibreOffice");
    renderCapabilityStatus("#capability-media", checking, connected && Boolean(tools.ffmpeg && tools.ffmpeg.available), "FFmpeg 已就緒", "需要 FFmpeg");
    renderCapabilityStatus("#capability-ocr", checking, connected && Boolean(tools.tesseract && tools.tesseract.available), "Tesseract 已就緒", "需要 Tesseract");
    renderCapabilityStatus("#capability-security", checking, connected && Boolean(tools.qpdf && tools.qpdf.available), "QPDF 已就緒", "需要 QPDF");
  }

  function updateSystemSummaryCard(selector, status) {
    const card = $(selector);
    if (card) card.className = `system-summary-item ${status}`;
  }

  function renderCapabilityStatus(selector, checking, available, readyText, missingText) {
    const row = $(selector);
    if (!row) return;
    const status = checking ? "pending" : available ? "available" : "missing";
    row.className = `system-capability ${status}`;
    row.querySelector(":scope > span").textContent = checking ? "○" : available ? "✓" : "×";
    row.querySelector("small").textContent = checking ? "等待檢查" : available ? readyText : missingText;
  }

  function toolStatusText(key, tool) {
    if (tool && tool.available) {
      const source = toolSourceLabel(tool.source);
      const version = escapeHtml(tool.version || tool.path || "available");
      return source ? `${source} · ${version}` : version;
    }
    if (!backendApiAvailable()) {
      return "後端未啟動";
    }
    if (key === "libreOffice") {
      return "此功能需要 LibreOffice";
    }
    return "未找到內建工具，請確認打包內容";
  }

  function toolGuidanceText(key, tool) {
    if (key !== "libreOffice") {
      return "";
    }
    if (tool && tool.available) {
      return "Office → PDF 依賴 LibreOffice。若轉換失敗或版面異常，請確認 LibreOffice 可用，必要時更新。";
    }
    if (!backendApiAvailable()) {
      return "";
    }
    return "請安裝或更新 LibreOffice，然後重新偵測工具。";
  }

  function toolSourceLabel(source) {
    if (source === "bundled") return "內建";
    if (source === "manual") return "手動指定";
    if (source === "env") return "環境變數";
    if (source === "system") return "系統安裝";
    if (source === "path") return "PATH";
    return "";
  }

  function updateImgBackendJobControls() {
    const type = $("#img-backend-job-type").value;
    $(".img-backend-image-format-row").style.display = type === "image-convert" ? "" : "none";
    $(".img-backend-language-row").style.display = type === "ocr-image" ? "" : "none";
    const filesInput = $("#img-backend-files");
    if (filesInput) {
      filesInput.accept = type === "ocr-image"
        ? ".png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp"
        : ".jpg,.jpeg,.png,.webp,.tiff,.tif,.bmp,.gif";
    }
  }

  async function pickBackendToolPath(key) {
    const toolName = backendToolLabel(key);
    if (!electronBridgeAvailable()) {
      $(`#tool-path-${key}`).focus();
      return;
    }
    const toolPath = await window.swiftLocalBackend.chooseExecutable({
      title: `選擇 ${toolName} 執行檔`,
      filters: [{ name: toolName, extensions: ["exe", "*"] }]
    });
    if (!toolPath) {
      return;
    }
    $(`#tool-path-${key}`).value = toolPath;
    await setBackendToolPath(key, toolPath);
  }

  async function clearBackendToolPath(key) {
    if (!backendApiAvailable()) {
      $(`#tool-path-${key}`).value = "";
      showToast("請先啟動 FastAPI 後端", "error");
      return;
    }
    try {
      const tools = await backendFetch(`/tools/${encodeURIComponent(key)}`, { method: "DELETE" });
      $(`#tool-path-${key}`).value = "";
      renderBackendTools(tools);
      setStatus("#backend-status", "路徑已清除");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  async function enqueuePdfBackendJob() {
    if (!backendApiAvailable()) await checkBackendHealth();
    if (!backendApiAvailable()) { showToast("請先啟動 FastAPI 後端", "error"); return; }
    if (!state.pdfFiles.length) { showToast("請先選擇輸入檔案", "error"); return; }
    const type = $("#pdf-mode").value;
    if ((type === "office-to-pdf" || type === "pdf-to-office") && !isToolAvailable("libreOffice")) {
      setStatus("#pdf-backend-status", "缺少 LibreOffice");
      showToast("此功能需要 LibreOffice。請安裝或更新 LibreOffice，然後重新偵測工具。", "error");
      return;
    }
    if (type === "ocr-pdf" && !isToolAvailable("tesseract")) {
      setStatus("#pdf-backend-status", "缺少 Tesseract");
      showToast("PDF OCR 需要 Tesseract。請確認內建工具或重新偵測。", "error");
      return;
    }
    if ((type === "pdf-encrypt" || type === "pdf-decrypt") && !isToolAvailable("qpdf")) {
      setStatus("#pdf-backend-status", "缺少 QPDF");
      showToast("PDF 加密與解密需要 QPDF。請到「狀態」頁檢查本機工具。", "error");
      return;
    }
    if (type === "pdf-encrypt" && !$("#pdf-password").value.trim()) {
      setStatus("#pdf-backend-status", "請設定密碼");
      showToast("PDF 加密需要設定密碼", "error");
      $("#pdf-password").focus();
      return;
    }
    const payload = new FormData();
    payload.append("type", type);
    state.pdfFiles.forEach((file) => payload.append("files", file, file.name));
    if (type === "pdf-to-office") payload.append("extension", $("#pdf-office-format").value || "docx");
    if (type === "ocr-pdf") {
      payload.append("language", ($("#pdf-ocr-language").value || "eng").trim() || "eng");
      payload.append("maxPages", String($("#pdf-ocr-max-pages").value || "50"));
    }
    if (type === "pdf-encrypt" || type === "pdf-decrypt") payload.append("password", $("#pdf-password").value);
    try {
      setStatus("#pdf-backend-status", "正在建立任務");
      await backendFetch("/jobs", { method: "POST", body: payload });
      await refreshBackendJobs();
      setStatus("#pdf-backend-status", "已加入佇列");
      showToast("已開始處理，進度會顯示在右側", "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  async function enqueueImgBackendJob(event) {
    event.preventDefault();
    if (!backendApiAvailable()) await checkBackendHealth();
    if (!backendApiAvailable()) { showToast("請先啟動 FastAPI 後端", "error"); return; }
    if (!state.imgBackendFiles.length) { showToast("請先選擇輸入檔案", "error"); return; }
    const type = $("#img-backend-job-type").value;
    const payload = new FormData();
    payload.append("type", type);
    state.imgBackendFiles.forEach((file) => payload.append("files", file, file.name));
    if (type === "image-convert") payload.append("extension", $("#img-backend-image-format").value);
    if (type === "ocr-image") payload.append("language", $("#img-backend-ocr-language").value.trim() || "eng");
    try {
      await backendFetch("/jobs", { method: "POST", body: payload });
      await refreshBackendJobs();
      setStatus("#img-backend-status", "已加入佇列");
      showToast("已加入後端佇列", "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  function updateMediaAdvancedControls() {
    const ext = ($("#media-output-extension") && $("#media-output-extension").value) || "";
    const gifRow = $(".media-gif-fps-row");
    if (gifRow) {
      gifRow.style.display = ext === "gif" ? "" : "none";
    }
  }

  async function enqueueMediaBackendJob(event) {
    event.preventDefault();
    if (!backendApiAvailable()) await checkBackendHealth();
    if (!backendApiAvailable()) { showToast("請先啟動 FastAPI 後端", "error"); return; }
    if (!state.mediaBackendFiles.length) { showToast("請先選擇音訊 / 影片檔案", "error"); return; }
    if (!isToolAvailable("ffmpeg")) {
      setStatus("#media-backend-status", "缺少 FFmpeg");
      showToast("影音轉換需要 FFmpeg。請確認內建工具或重新偵測。", "error");
      return;
    }
    const payload = new FormData();
    payload.append("type", "media-convert");
    state.mediaBackendFiles.forEach((file) => payload.append("files", file, file.name));
    payload.append("extension", $("#media-output-extension").value);
    payload.append("videoBitrate", ($("#media-video-bitrate").value || "").trim());
    payload.append("audioBitrate", ($("#media-audio-bitrate").value || "").trim());
    payload.append("scale", ($("#media-scale").value || "").trim());
    payload.append("crop", ($("#media-crop").value || "").trim());
    payload.append("start", ($("#media-start").value || "").trim());
    payload.append("duration", ($("#media-duration").value || "").trim());
    payload.append("gifFps", ($("#media-gif-fps").value || "").trim());
    try {
      await backendFetch("/jobs", { method: "POST", body: payload });
      await refreshBackendJobs();
      setStatus("#media-backend-status", "已加入佇列");
      showToast("已加入後端佇列", "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  async function refreshBackendJobs() {
    if (!backendApiAvailable()) {
      await checkBackendHealth();
      return;
    }
    try {
      const jobs = await backendFetch("/jobs");
      renderBackendJobs(jobs);
      renderPanelBackendJobs("#pdf-backend-jobs", "#pdf-backend-status", jobs, PDF_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#img-backend-jobs", "#img-backend-status", jobs, IMG_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#media-backend-jobs", "#media-backend-status", jobs, MEDIA_BACKEND_JOB_TYPES);
      scheduleBackendPolling(jobs);
    } catch (error) {
      state.backendConnected = false;
      setStatus("#backend-status", "FastAPI 未連線");
      renderBackendJobs([]);
      renderPanelBackendJobs("#pdf-backend-jobs", "#pdf-backend-status", [], PDF_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#img-backend-jobs", "#img-backend-status", [], IMG_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#media-backend-jobs", "#media-backend-status", [], MEDIA_BACKEND_JOB_TYPES);
    }
  }

  function renderPanelBackendJobs(containerSel, statusSel, allJobs, typeSet) {
    const jobs = allJobs.filter((j) => typeSet.has(j.type));
    const container = $(containerSel);
    if (!container) return;
    if (!jobs.length) {
      container.classList.add("empty");
      container.textContent = "尚未建立任務";
      return;
    }
    container.classList.remove("empty");
    container.innerHTML = "";
    jobs.forEach((job) => container.appendChild(buildJobElement(job)));
    const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");
    if (hasActive) {
      setStatus(statusSel, "處理中…");
    } else {
      const latest = jobs[0];
      setStatus(statusSel, latest.status === "done" ? "最近任務已完成" : jobStatusLabel(latest.status));
    }
  }

  function renderBackendJobs(jobs) {
    const container = $("#backend-jobs");
    if (!jobs.length) {
      container.classList.add("empty");
      container.textContent = "尚未建立任務";
      return;
    }
    container.classList.remove("empty");
    container.innerHTML = "";
    jobs.forEach((job) => container.appendChild(buildJobElement(job)));
  }

  function buildJobElement(job) {
    const div = document.createElement("div");
    div.className = `backend-job ${escapeHtml(job.status)}`;

    const header = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = jobTypeLabel(job.type);
    const statusSpan = document.createElement("span");
    statusSpan.textContent = jobStatusLabel(job.status);
    statusSpan.title = job.status;

    const headerRight = document.createElement("div");
    headerRight.style.display = "flex";
    headerRight.style.gap = "8px";
    headerRight.style.alignItems = "center";
    headerRight.appendChild(statusSpan);

    if (job.status === "queued" || job.status === "running") {
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "secondary-button compact danger-button";
      cancelBtn.type = "button";
      cancelBtn.textContent = "取消";
      cancelBtn.addEventListener("click", () => cancelBackendJob(job.id));
      headerRight.appendChild(cancelBtn);
    } else if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
      const delBtn = document.createElement("button");
      delBtn.className = "secondary-button compact danger-button";
      delBtn.type = "button";
      delBtn.textContent = "刪除";
      delBtn.addEventListener("click", () => deleteBackendJob(job.id));
      headerRight.appendChild(delBtn);
    }

    header.appendChild(title);
    header.appendChild(headerRight);
    div.appendChild(header);

    const small = document.createElement("small");
    small.innerHTML = job.inputPaths.map((item) => escapeHtml(item)).join("<br>");
    div.appendChild(small);

    if (job.outputDir) {
      const outDir = document.createElement("small");
      outDir.className = "job-output-dir";
      outDir.textContent = `輸出：${job.outputDir}`;
      if (electronBridgeAvailable()) {
        outDir.style.cursor = "pointer";
        outDir.title = "點擊開啟輸出資料夾";
        outDir.addEventListener("click", () => window.swiftLocalBackend.openPath(job.outputDir));
      }
      div.appendChild(outDir);
    }

    const outputsDiv = document.createElement("div");
    outputsDiv.className = "backend-output-paths";
    if (job.outputPaths && job.outputPaths.length) {
      job.outputPaths.forEach((item) => {
        const a = renderBackendOutputAction(item);
        if (a.tagName === "A") a.href = `${BACKEND_ORIGIN}${item.url}`;
        a.download = item.name;
        a.textContent = `${item.name} · ${formatBytes(item.size || 0)}`;
        outputsDiv.appendChild(a);
      });
    } else {
      const placeholder = document.createElement("span");
      placeholder.textContent = "尚未產生輸出";
      outputsDiv.appendChild(placeholder);
    }
    div.appendChild(outputsDiv);

    const log = job.error || (job.log && job.log.length ? job.log[job.log.length - 1] : "");
    if (log) {
      const pre = document.createElement("pre");
      pre.textContent = log;
      div.appendChild(pre);
    }

    return div;
  }

  function renderBackendOutputAction(item) {
    const name = item && item.name ? item.name : String(item || "");
    const size = item && item.size ? ` · ${formatBytes(item.size)}` : "";
    if (electronBridgeAvailable() && item && item.path) {
      const button = document.createElement("button");
      button.className = "secondary-button compact";
      button.type = "button";
      button.textContent = `${name}${size}`;
      button.addEventListener("click", () => window.swiftLocalBackend.openPath(item.path));
      return button;
    }
    return document.createElement("a");
  }

  async function cancelBackendJob(jobId) {
    try {
      await backendFetch(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
      await refreshBackendJobs();
      showToast("已送出取消。外部工具會盡快中止；部分本機步驟可能需稍候目前工作結束。", "info", 5000);
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  async function deleteBackendJob(jobId) {
    try {
      await backendFetch(`/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
      await refreshBackendJobs();
      showToast("任務已刪除", "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  function scheduleBackendPolling(jobs) {
    if (state.backendPollTimer) {
      window.clearTimeout(state.backendPollTimer);
      state.backendPollTimer = null;
    }
    const hasActiveJobs = jobs.some((job) => job.status === "queued" || job.status === "running");
    if (hasActiveJobs && !document.hidden) {
      state.backendPollTimer = window.setTimeout(refreshBackendJobs, 2000);
    }
  }

  async function backendFetch(path, options = {}) {
    if (electronBridgeAvailable()) {
      return electronBackendRequest(path, options);
    }
    const response = await fetch(`${BACKEND_API_BASE}${path}`, options);
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        message = payload.detail || message;
      } catch {
        message = await response.text() || message;
      }
      throw new Error(message);
    }
    return response.json();
  }

  async function electronBackendRequest(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    if (path === "/health" && method === "GET") {
      return { status: "ok", mode: "electron" };
    }
    if (path === "/tools" && method === "GET") {
      return window.swiftLocalBackend.detectTools();
    }
    const toolMatch = path.match(/^\/tools\/([^/]+)$/);
    if (toolMatch && method === "PUT") {
      const body = JSON.parse(options.body || "{}");
      return window.swiftLocalBackend.setToolPath(decodeURIComponent(toolMatch[1]), body.path || "");
    }
    if (toolMatch && method === "DELETE") {
      return window.swiftLocalBackend.setToolPath(decodeURIComponent(toolMatch[1]), "");
    }
    if (path === "/jobs" && method === "GET") {
      return window.swiftLocalBackend.getJobs();
    }
    if (path === "/jobs" && method === "POST") {
      const payload = await buildElectronJobPayload(options.body);
      return window.swiftLocalBackend.enqueueJob(payload);
    }
    const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
    if (jobMatch && method === "DELETE") {
      const deleted = await window.swiftLocalBackend.deleteJob(decodeURIComponent(jobMatch[1]));
      if (!deleted) throw new Error("Job not found");
      return { ok: true };
    }
    const cancelMatch = path.match(/^\/jobs\/([^/]+)\/cancel$/);
    if (cancelMatch && method === "POST") {
      const cancelled = await window.swiftLocalBackend.cancelJob(decodeURIComponent(cancelMatch[1]));
      if (!cancelled) throw new Error("Job not found");
      return cancelled;
    }
    if (path === "/convert-text" && method === "POST") {
      const body = typeof options.body === "string" ? JSON.parse(options.body || "{}") : options.body || {};
      return { result: convertChineseLocal(body.text || "", body.locale || "zh-hans") };
    }
    throw new Error("此功能在桌面版暫未支援，請使用瀏覽器後端模式。");
  }

  async function buildElectronJobPayload(formData) {
    if (!(formData instanceof FormData)) {
      throw new Error("Desktop jobs require FormData input");
    }
    const files = formData.getAll("files");
    const inputPaths = [];
    for (const file of files) {
      const filePath = await electronFilePath(file);
      if (filePath) inputPaths.push(filePath);
    }
    if (!inputPaths.length) {
      throw new Error("桌面版需要使用本機檔案，請重新選擇檔案後再試。");
    }
    return {
      type: String(formData.get("type") || ""),
      inputPaths,
      outputDir: state.desktopOutputDir || undefined,
      options: {
        extension: String(formData.get("extension") || ""),
        language: String(formData.get("language") || ""),
        pages: String(formData.get("pages") || ""),
        angle: String(formData.get("angle") || ""),
        password: String(formData.get("password") || ""),
        maxPages: String(formData.get("maxPages") || ""),
        videoBitrate: String(formData.get("videoBitrate") || ""),
        audioBitrate: String(formData.get("audioBitrate") || ""),
        scale: String(formData.get("scale") || ""),
        crop: String(formData.get("crop") || ""),
        start: String(formData.get("start") || ""),
        duration: String(formData.get("duration") || ""),
        gifFps: String(formData.get("gifFps") || "")
      }
    };
  }

  async function electronFilePath(file) {
    if (!file) return "";
    if (typeof window.swiftLocalBackend.getFilePath === "function") {
      return window.swiftLocalBackend.getFilePath(file);
    }
    return file.path || "";
  }

  function jobStatusLabel(status) {
    if (status === "queued") return "排隊中";
    if (status === "running") return "處理中";
    if (status === "done") return "已完成";
    if (status === "failed") return "失敗";
    if (status === "cancelled") return "已取消";
    return status || "未知";
  }

  function jobTypeLabel(type) {
    if (type === "office-to-pdf") {
      return "Office → PDF";
    }
    if (type === "pdf-to-docx") {
      return "PDF → DOCX（純文字）";
    }
    if (type === "pdf-to-office") {
      return "PDF → Office（LibreOffice）";
    }
    if (type === "ocr-pdf") {
      return "PDF OCR → TXT";
    }
    if (type === "pdf-merge") {
      return "PDF 合併";
    }
    if (type === "pdf-split") {
      return "PDF 分割";
    }
    if (type === "pdf-rotate") {
      return "PDF 旋轉";
    }
    if (type === "pdf-encrypt") {
      return "PDF 加密";
    }
    if (type === "pdf-decrypt") {
      return "PDF 解密";
    }
    if (type === "pdf-compress") {
      return "PDF 壓縮";
    }
    if (type === "image-convert") {
      return "圖片格式轉換";
    }
    if (type === "media-convert") {
      return "音訊 / 影片轉換";
    }
    if (type === "ocr-image") {
      return "圖片 OCR → TXT";
    }
    return type;
  }

  function backendToolLabel(key) {
    if (key === "libreOffice") {
      return "LibreOffice";
    }
    if (key === "ffmpeg") {
      return "FFmpeg";
    }
    if (key === "tesseract") {
      return "Tesseract";
    }
    if (key === "qpdf") {
      return "QPDF";
    }
    return key;
  }

  function isToolAvailable(key) {
    return Boolean(state.detectedTools && state.detectedTools[key] && state.detectedTools[key].available);
  }

  function officeToPdfGuidance() {
    if (isToolAvailable("libreOffice")) {
      return "Office → PDF 依賴 LibreOffice。若轉換失敗或版面異常，請確認 LibreOffice 可用，必要時更新。";
    }
    return "此功能需要 LibreOffice。請安裝或更新 LibreOffice，然後重新偵測工具。";
  }

  function bindRenameTool() {
    $("#rename-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const files = Array.from($("#rename-files").files || []);
      if (!files.length) {
        setEmpty("#rename-results", "請先選擇檔案");
        return;
      }

      const pattern = $("#rename-pattern").value.trim() || "{name}_{n}.{ext}";
      const start = Number($("#rename-start").value) || 0;
      const pad = Number($("#rename-pad").value) || 1;
      const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");

      state.renameRows = files.map((file, index) => {
        const parts = splitName(file.name);
        const n = String(start + index).padStart(pad, "0");
        const target = pattern
          .replaceAll("{name}", parts.base)
          .replaceAll("{ext}", parts.ext)
          .replaceAll("{n}", n)
          .replaceAll("{date}", date);
        return { original: file.name, target };
      });

      renderRenameTable();
      $("#download-rename-script").disabled = false;
    });

    $("#download-rename-script").addEventListener("click", () => {
      const script = buildRenameScript(state.renameRows);
      downloadText(script, "rename-files.ps1");
    });
  }

  function renderRenameTable() {
    const html = [
      "<table>",
      "<thead><tr><th>原檔名</th><th>新檔名</th></tr></thead>",
      "<tbody>",
      ...state.renameRows.map((row) => `<tr><td>${escapeHtml(row.original)}</td><td>${escapeHtml(row.target)}</td></tr>`),
      "</tbody></table>"
    ].join("");
    const container = $("#rename-results");
    container.classList.remove("empty");
    container.innerHTML = html;
  }

  function buildRenameScript(rows) {
    const lines = [
      "# Save this script in the folder that contains the target files, then run it with PowerShell.",
      "$ErrorActionPreference = 'Stop'",
      ""
    ];
    rows.forEach((row) => {
      lines.push(`Rename-Item -LiteralPath ${psQuote(row.original)} -NewName ${psQuote(row.target)}`);
    });
    lines.push("");
    return lines.join("\r\n");
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function dateToDos(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createCrcTable() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  }

  function normalizeZipName(name) {
    const trimmed = name.trim() || "swiftlocal-files.zip";
    return trimmed.toLowerCase().endsWith(".zip") ? trimmed : `${trimmed}.zip`;
  }

  function sanitizeZipName(name) {
    return name
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/^\.+$/, "_")
      .trim() || "file";
  }

  function uniqueZipName(name, usedNames) {
    const parts = splitName(name);
    let candidate = name;
    let index = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = parts.ext ? `${parts.base}_${index}.${parts.ext}` : `${parts.base}_${index}`;
      index += 1;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  function setEmpty(selector, message) {
    const element = $(selector);
    element.classList.add("empty");
    element.textContent = message;
  }

  function setStatus(selector, message) {
    $(selector).textContent = message;
  }

  async function copyText(value) {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function triggerDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function extensionFromMime(mime) {
    if (mime === "image/png") {
      return "png";
    }
    if (mime === "image/webp") {
      return "webp";
    }
    return "jpg";
  }

  function stripExtension(filename) {
    return filename.replace(/\.[^.]+$/, "");
  }

  function splitName(filename) {
    const match = filename.match(/^(.*?)(?:\.([^.]+))?$/);
    return {
      base: match && match[1] ? match[1] : filename,
      ext: match && match[2] ? match[2] : ""
    };
  }

  function normalizeCsvValue(value) {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function escapeCsvCell(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  }

  function arrayToCsv(rows) {
    return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  }

  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function formatBytes(bytes) {
    if (bytes === 0) {
      return "0 B";
    }
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function sanitizeXmlName(name) {
    const cleaned = String(name || "item").trim().replace(/[^A-Za-z0-9_.:-]/g, "_");
    return /^[A-Za-z_:]/.test(cleaned) ? cleaned : `item_${cleaned || "value"}`;
  }

  function psQuote(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
  }

  function readableError(error) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  // ─── Tools Panel (Color + UUID + QR Code) ────────────────────────
  function bindToolsPanel() {
    // ── Color converter ──────────────────────────────────────────────
    updateColorOutputs("#1f7a68");

    $("#color-picker").addEventListener("input", (e) => {
      const hex = e.target.value;
      $("#color-hex").value = hex;
      updateColorOutputs(hex);
    });

    $("#color-hex").addEventListener("input", (e) => {
      const raw = e.target.value.trim();
      const hex = raw.startsWith("#") ? raw : `#${raw}`;
      if (/^#[0-9a-fA-F]{6}$/.test(hex) || /^#[0-9a-fA-F]{3}$/.test(hex)) {
        try { $("#color-picker").value = hex; } catch { /* ignore */ }
        updateColorOutputs(hex);
      }
    });

    $$("[data-copy-color]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.copyColor;
        const map = { hex: "#color-out-hex", rgb: "#color-out-rgb", hsl: "#color-out-hsl" };
        const input = $(map[key]);
        if (input && input.value) {
          copyText(input.value);
          showToast(`已複製 ${input.value}`, "success", 2000);
        }
      });
    });

    // ── UUID generator ───────────────────────────────────────────────
    $("#uuid-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const count = Math.min(100, Math.max(1, parseInt($("#uuid-count").value, 10) || 1));
      const uuids = Array.from({ length: count }, () => crypto.randomUUID());
      $("#uuid-output").value = uuids.join("\n");
    });

    $("#copy-uuid-output").addEventListener("click", () => {
      const text = $("#uuid-output").value;
      if (text) {
        copyText(text);
        showToast("已複製 UUID", "success", 2000);
      }
    });

    // ── QR Code generator ────────────────────────────────────────────
    $("#qr-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = $("#qr-input").value.trim();
      if (!text) { showToast("請輸入內容", "error"); return; }
      if (typeof qrcode === "undefined") { showToast("QR Code 函式庫未載入", "error"); return; }
      try {
        const cellSize = parseInt($("#qr-size").value, 10) || 6;
        const ecl = $("#qr-ecl").value || "M";
        const qr = qrcode(0, ecl);
        qr.addData(text, "Byte");
        qr.make();
        const moduleCount = qr.getModuleCount();
        const margin = cellSize * 2;
        const canvasSize = moduleCount * cellSize + margin * 2;
        const canvas = $("#qr-canvas");
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasSize, canvasSize);
        ctx.fillStyle = "#000000";
        for (let row = 0; row < moduleCount; row += 1) {
          for (let col = 0; col < moduleCount; col += 1) {
            if (qr.isDark(row, col)) {
              ctx.fillRect(margin + col * cellSize, margin + row * cellSize, cellSize, cellSize);
            }
          }
        }
        canvas.style.display = "block";
        $("#download-qr").disabled = false;
      } catch (err) {
        showToast(`QR Code 產生失敗：${err}`, "error");
      }
    });

    $("#download-qr").addEventListener("click", () => {
      const canvas = $("#qr-canvas");
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        triggerDownload(url, "qrcode.png");
        window.setTimeout(() => URL.revokeObjectURL(url), 500);
      }, "image/png");
    });
  }

  // ── Color helper functions ───────────────────────────────────────
  function updateColorOutputs(hex) {
    const rgb = hexToRgb(expandHex(hex));
    if (!rgb) return;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const hexFull = expandHex(hex).toUpperCase();
    $("#color-out-hex").value = hexFull;
    $("#color-out-rgb").value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    $("#color-out-hsl").value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    $("#color-preview").style.background = hexFull;
  }

  function expandHex(hex) {
    const h = hex.replace("#", "");
    if (h.length === 3) {
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    return `#${h}`;
  }

  function hexToRgb(hex) {
    const result = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
        case gn: h = ((bn - rn) / d + 2) / 6; break;
        default: h = ((rn - gn) / d + 4) / 6;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  }

  window.addEventListener("DOMContentLoaded", init);
})();
