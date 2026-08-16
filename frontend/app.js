(function () {
  "use strict";

  const state = {
    activePanel: "home-panel",
    imageDownloads: [],
    imageWorkspaceItems: [],
    imageWorkspaceSelectedId: null,
    imageWorkspaceSelectionMode: false,
    imageWorkspaceExporting: false,
    imageWorkspaceExportCancelRequested: false,
    imageWorkspaceOcrJobId: null,
    imageWorkspaceOcrLoadedJobId: null,
    imageWorkspaceOcrStatus: "idle",
    imageWorkspaceOcrScope: "",
    imageWorkspaceOcrText: "",
    imageWorkspaceOcrError: "",
    pdfDownloads: [],
    pdfFiles: [],
    pdfWorkspacePages: [],
    pdfWorkspaceUndo: [],
    pdfWorkspaceRedo: [],
    pdfWorkspaceLoading: false,
    pdfWorkspaceSelectedId: null,
    pdfWorkspaceOcrJobId: null,
    pdfWorkspaceOcrLoadedJobId: null,
    pdfWorkspaceOcrStatus: "idle",
    pdfWorkspaceOcrScope: "",
    pdfWorkspaceOcrFileName: "",
    pdfWorkspaceOcrText: "",
    pdfWorkspaceOcrError: "",
    dataMode: "json-format",
    textMode: "base64-encode",
    zipUrl: null,
    zipName: "",
    diffText: "",
    splitDownloads: [],
    mediaBackendFiles: [],
    backendConnected: false,
    backendSessionToken: "",
    detectedTools: null,
    backendLastChecked: null,
    backendPollTimer: null,
    backendJobs: [],
    taskFilter: "all",
    workflowFiles: [],
    workflowSteps: [],
    workflowRuns: [],
    workflowAdvancing: new Set(),
    userPresets: [],
    presetFilter: "all",
    pendingPreset: null,
    editingPresetId: null,
    desktopOutputDir: "",
    hashRows: [],
    renameRows: [],
    theme: "light"
  };

  const titles = {
    "home-panel": "首頁",
    "tasks-panel": "全域任務中心",
    "workflow-panel": "工作流程串連",
    "presets-panel": "我的常用設定",
    "pdf-hub-panel": "PDF",
    "ocr-panel": "OCR",
    "office-panel": "Office",
    "image-panel": "圖片轉換",
    "pdf-panel": "PDF 處理",
    "pdf-reader-panel": "PDF 工作區",
    "data-panel": "CSV／JSON／XML 轉換",
    "text-panel": "文字整理與繁簡轉換",
    "hash-panel": "檔案雜湊驗證",
    "zip-panel": "ZIP 壓縮與解壓",
    "diff-panel": "文字差異比對",
    "split-panel": "大型檔案分割與合併",
    "rename-panel": "批量改名",
    "media-panel": "影音轉換",
    "media-download-panel": "線上媒體下載",
    "tools-panel": "QR Code 與編碼工具",
    "backend-panel": "工具狀態"
  };

  Object.assign(titles, {
    "home-panel": "首頁",
    "tasks-panel": "全域任務中心",
    "workflow-panel": "工作流程串連",
    "presets-panel": "我的常用設定",
    "pdf-hub-panel": "PDF",
    "ocr-panel": "OCR",
    "office-panel": "Office",
    "image-panel": "圖片轉換",
    "pdf-panel": "PDF 處理",
    "pdf-reader-panel": "PDF 工作區",
    "data-panel": "CSV／JSON／XML 轉換",
    "text-panel": "文字整理與繁簡轉換",
    "hash-panel": "檔案雜湊驗證",
    "zip-panel": "ZIP 壓縮與解壓",
    "diff-panel": "文字差異比對",
    "split-panel": "大型檔案分割與合併",
    "rename-panel": "批量改名",
    "media-panel": "影音轉換",
    "media-download-panel": "線上媒體下載",
    "tools-panel": "QR Code 與編碼工具",
    "backend-panel": "工具狀態"
  });

  const toolGuides = {
    "home-panel": { nav: "首頁", hint: "從 PDF、OCR、Office、圖片及影音五大核心開始。", steps: [], keywords: "home 首頁 開始 本機 辦公 媒體", platform: "web" },
    "tasks-panel": { nav: "任務中心", hint: "集中追蹤所有進階處理、下載結果及處理失敗任務。", steps: [], keywords: "task job queue 任務 工作 佇列 進度 下載 失敗", platform: "local" },
    "workflow-panel": { nav: "工作流程", hint: "把多個處理步驟串連；失敗可從未完成步驟繼續。", steps: ["選擇範本及來源檔案", "調整步驟和選項", "啟動後在右側追蹤；失敗可繼續"], keywords: "workflow pipeline automation 流程 串連 自動 接力 重試 繼續", platform: "local" },
    "presets-panel": { nav: "我的常用設定", hint: "在工具調好選項後保存，下次一按使用；也可返回原工具修改。", steps: ["開啟工具並調整選項", "按頁頂的「保存這組設定」", "下次在這裡使用或修改"], keywords: "preset favorite 常用 預設 設定 快捷 個人化 保存", platform: "web" },
    "pdf-hub-panel": { nav: "PDF", hint: "閱讀填表、頁面整理、轉換與 OCR、保護與壓縮。", steps: ["選擇閱讀、整理、轉換或保護", "進入既有 PDF 工作區完成操作", "永久修改前另存或確認輸出"], keywords: "pdf 閱讀 填表 簽名 日期章 列印 工作台 合併 分割 旋轉 ocr word 圖片 壓縮 加密 解密" },
    "ocr-panel": { nav: "OCR", hint: "圖片或掃描 PDF 轉文字、Word 或可搜尋 PDF。", steps: ["選擇來源和輸出用途", "加入圖片或 PDF", "在任務中心追蹤、取消或重試"], keywords: "ocr tesseract 掃描 辨識 圖片 文字 searchable 可搜尋 word 批量 繁中 英文", platform: "local" },
    "office-panel": { nav: "Office", hint: "Office 轉 PDF、PDF 轉 Office 與文件歸檔流程。", steps: ["選擇轉換用途", "加入 Office 或 PDF", "確認相容性提示並在任務中心追蹤"], keywords: "office word excel powerpoint doc docx xls xlsx ppt pptx libreoffice 歸檔 批量", platform: "local" },
    "image-panel": { nav: "圖片", hint: "在預覽中直接裁切、旋轉、辨識文字或匯出圖片。", steps: ["加入一張或多張圖片", "在預覽上旋轉、翻轉或框選區域", "匯出圖片，或直接執行目前／全部／框選 OCR"], keywords: "image 圖片 相片 jpg jpeg png webp tiff bmp gif 壓縮 縮小 浮水印 旋轉 翻轉 裁切 ocr 辨識" },
    "pdf-panel": { nav: "PDF 轉換與整理", hint: "PDF 入口內的頁面整理、轉換、OCR、壓縮及保護。", steps: ["選擇頁面工作台或其他處理方式", "在工作台拖放頁面，並旋轉、複製或刪除", "輸出新 PDF，或在任務區查看後端進度"], keywords: "pdf 工作台 縮圖 排序 合併 分割 抽頁 旋轉 頁碼 浮水印 壓縮 加密 解密 ocr office word docx" },
    "pdf-reader-panel": { nav: "PDF 工作區", hint: "本機 PDF 閱讀、AcroForm 填表、簽名圖與日期章；關閉不鎖檔。", steps: ["開啟 PDF", "填表或放置簽名／日期", "儲存或另存"], keywords: "pdf reader 工作區 閱讀 填表 簽名 日期章 acroform 本機", platform: "web" },
    "data-panel": { nav: "CSV／JSON／XML 轉換", hint: "在 CSV、JSON、XML 之間轉換與格式化。", steps: ["貼上資料內容", "選擇想轉成的格式", "按「執行」，再複製或下載輸出"], keywords: "json csv xml 資料 表格 格式化 壓縮 轉換" },
    "text-panel": { nav: "文字整理與繁簡轉換", hint: "整理文字、轉換繁簡，並處理 Base64、URL、HTML 編碼。", steps: ["貼上文字", "選擇處理方式", "按「執行」，再複製結果"], keywords: "文字 text base64 url html encode decode 搜尋 取代 繁簡 整理" },
    "hash-panel": { nav: "檔案雜湊驗證", hint: "產生檔案雜湊值，用來確認檔案沒有被改動。", steps: ["選擇檔案", "選擇雜湊演算法", "按「開始計算」，需要時下載 CSV"], keywords: "hash sha md5 雜湊 校驗 驗證 checksum 完整性" },
    "zip-panel": { nav: "ZIP 壓縮與解壓", hint: "把多個檔案打包成 ZIP，或處理 ZIP 檔案。", steps: ["選擇多個檔案", "確認 ZIP 檔名", "按「建立 ZIP」後下載"], keywords: "zip 壓縮 解壓 打包 archive" },
    "diff-panel": { nav: "文字差異比對", hint: "比較兩段文字有哪些新增、刪除或修改。", steps: ["貼上原文字", "貼上新文字", "按「開始比對」查看差異"], keywords: "diff compare 比對 差異 文字" },
    "split-panel": { nav: "大型檔案分割與合併", hint: "把大型檔案切成分片，之後可依 manifest 合併還原。", steps: ["選擇檔案", "設定每份大小", "按「產生分片檔」後下載全部 part 和 manifest"], keywords: "split merge 切割 合併 分片 大檔 part binary manifest" },
    "rename-panel": { nav: "批量改名", hint: "先預覽批量改名規則，再下載 PowerShell 腳本。", steps: ["選擇要改名的檔案", "輸入命名格式", "產生預覽，確認後下載腳本"], keywords: "rename 改名 批量 檔名 file name", platform: "device" },
    "media-panel": { nav: "影音", hint: "依用途壓縮影片、轉音訊、縮小、剪取或建立 GIF。", steps: ["先選常見用途", "選擇音訊或影片", "加入佇列並在任務中心追蹤"], keywords: "media audio video mp3 wav m4a mp4 mov ffmpeg 影音 音訊 影片 電郵 720p 剪取 gif", platform: "local" },
    "media-download-panel": { nav: "線上媒體下載", hint: "分析單一公開媒體網址，再下載影片或音訊到本機。", steps: ["貼上網址並分析", "選擇影片畫質或音訊格式", "選擇資料夾並下載"], keywords: "online media download yt-dlp youtube video audio mp3 720p 1080p 線上 媒體 下載 網址", platform: "network" },
    "tools-panel": { nav: "QR Code 與編碼工具", hint: "產生 QR Code、UUID，並處理顏色格式等快速值。", steps: ["選擇需要的小工具", "輸入內容或設定數量", "產生後複製或下載"], keywords: "color hex rgb hsl uuid qr qrcode 小工具 顏色 編碼" },
    "backend-panel": { nav: "狀態", hint: "查看整體健康狀態、可用功能及清楚的修復建議。", steps: ["先看整體狀態與功能可用情況", "按「重新檢查系統」取得最新結果", "缺少工具時展開進階設定並指定路徑"], keywords: "backend 後端 系統 健康 狀態 libreoffice ffmpeg tesseract qpdf ocr 設定 修復", platform: "local" }
  };

  const BUILT_IN_PRESETS = [
    { id: "builtin-image-web", name: "網頁分享圖片", description: "WebP、80% 品質、最大寬度 1600px。", category: "image", panelId: "image-panel", badge: "圖片", settings: { "#image-format": "image/webp", "#image-quality": "0.8", "#image-width": "1600", "#image-height": "", "#image-keep-ratio": true, "#image-rotate": "0", "#image-flip": "none" } },
    { id: "builtin-image-email", name: "電郵輕量附件", description: "JPEG、70% 品質、最大寬度 1280px。", category: "image", panelId: "image-panel", badge: "圖片", settings: { "#image-format": "image/jpeg", "#image-quality": "0.7", "#image-width": "1280", "#image-height": "", "#image-keep-ratio": true, "#image-rotate": "0", "#image-flip": "none" } },
    { id: "builtin-pdf-merge", name: "合併整理 PDF", description: "開啟合併模式，加入多份 PDF 後可視覺排序。", category: "pdf", panelId: "pdf-panel", badge: "PDF", settings: { "#pdf-mode": "merge" } },
    { id: "builtin-pdf-compress", name: "輕量 PDF", description: "直接切換至本機 PDF 壓縮任務。", category: "pdf", panelId: "pdf-panel", badge: "PDF", settings: { "#pdf-mode": "pdf-compress" } },
    { id: "builtin-pdf-images", name: "PDF 高清圖片", description: "每頁輸出 JPEG，使用 2× 渲染倍率。", category: "pdf", panelId: "pdf-panel", badge: "PDF", settings: { "#pdf-mode": "images", "#pdf-image-format": "image/jpeg", "#pdf-image-scale": "2" } },
    { id: "builtin-ocr-image", name: "繁中及英文圖片 OCR", description: "一次加入多張圖片，以繁中及英文辨識文字。", category: "ocr", panelId: "image-panel", badge: "OCR", settings: { "#img-backend-job-type": "ocr-image", "#img-backend-ocr-language": "chi_tra+eng" } },
    { id: "builtin-ocr-searchable", name: "掃描 PDF 可搜尋化", description: "以繁中及英文 OCR 建立可搜尋 PDF。", category: "ocr", panelId: "pdf-panel", badge: "OCR", settings: { "#pdf-mode": "pdf-to-searchable-pdf", "#pdf-ocr-max-pages": "50" } },
    { id: "builtin-office-pdf", name: "Office 轉 PDF", description: "批量把 Word、Excel 或 PowerPoint 轉成 PDF。", category: "office", panelId: "pdf-panel", badge: "Office", settings: { "#pdf-mode": "office-to-pdf" } },
    { id: "builtin-office-word", name: "PDF 轉 Word", description: "輸出 DOCX，並保留版面及相容性提示。", category: "office", panelId: "pdf-panel", badge: "Office", settings: { "#pdf-mode": "pdf-to-office", "#pdf-office-format": "docx" } },
    { id: "builtin-text-clean", name: "清理文字空行", description: "移除空白行，保留其餘文字內容。", category: "other", panelId: "text-panel", badge: "文字、資料與進階工具", actions: ["[data-text-mode='remove-empty-lines']"] },
    { id: "builtin-text-dedupe", name: "文字去除重複", description: "依出現次序保留唯一文字行。", category: "other", panelId: "text-panel", badge: "文字、資料與進階工具", actions: ["[data-text-mode='dedupe-lines']"] },
    { id: "builtin-workflow-office", name: "Office 歸檔流程", description: "Office 轉 PDF，再自動壓縮。", category: "automation", panelId: "workflow-panel", badge: "自動化", settings: { "#workflow-template": "office-archive" } },
    { id: "builtin-media-mp3", name: "標準 MP3 音訊", description: "輸出 MP3；其他進階參數保持空白。", category: "media", panelId: "media-panel", badge: "影音", settings: { "#media-output-extension": "mp3", "#media-video-bitrate": "", "#media-audio-bitrate": "", "#media-scale": "", "#media-crop": "", "#media-start": "", "#media-duration": "", "#media-gif-fps": "10" } }
  ];

  const PDF_BACKEND_JOB_TYPES = new Set(["office-to-pdf", "pdf-to-docx", "pdf-to-office", "pdf-to-searchable-pdf", "ocr-pdf", "pdf-merge", "pdf-split", "pdf-rotate", "pdf-encrypt", "pdf-decrypt", "pdf-compress"]);
  const IMG_BACKEND_JOB_TYPES = new Set(["image-convert", "ocr-image"]);
  const MEDIA_BACKEND_JOB_TYPES = new Set(["media-convert"]);
  const SEARCH_HIDDEN_PANEL_IDS = new Set(["home-panel", "pdf-panel", "pdf-reader-panel"]);

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const CRC_TABLE = createCrcTable();
  const BACKEND_API_BASE = "http://127.0.0.1:8787/api";
  const BACKEND_ORIGIN = "http://127.0.0.1:8787";
  let pdfjsPromise = null;
  let pdfWorkspacePageId = 0;
  let pdfWorkspacePreviewToken = 0;
  let imageWorkspaceItemId = 0;
  let imageWorkspaceRenderToken = 0;
  const pdfWorkspacePreviewCache = new Map();
  const PDF_WORKSPACE_MAX_PAGES = 250;
  const PDF_WORKSPACE_PREVIEW_CACHE_SIZE = 12;
  /** @type {{ destroy: Function }|null} Reader workspace shell (not the page-edit grid). */
  let pdfReaderShell = null;
  let mediaDownloader = null;

  function init() {
    initTheme();
    bindAccessibilityAndPrivacy();
    bindNavigation();
    bindResponsiveNavigation();
    bindProductRoutes();
    bindTaskCenter();
    bindWorkflowTool();
    updateRuntimeLabels();
    bindImageTool();
    bindPdfTool();
    bindPdfReaderPanel();
    bindDataTool();
    bindTextTool();
    bindHashTool();
    bindZipTool();
    bindDiffTool();
    bindSplitTool();
    bindRenameTool();
    bindBackendTool();
    bindMediaDownloader();
    bindToolsPanel();
    bindPresetCenter();
    bindGlobalActions();
    enhanceNavigation();
    bindQuickStart();
    activatePanel(state.activePanel, null, false);
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
    toast.setAttribute("role", type === "error" ? "alert" : "status");
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
    if (btn) {
      btn.textContent = theme === "dark" ? "☀" : "🌙";
      btn.setAttribute("aria-label", theme === "dark" ? "切換至亮色模式" : "切換至暗色模式");
      btn.setAttribute("aria-pressed", String(theme === "dark"));
    }
  }

  function bindAccessibilityAndPrivacy() {
    const preferences = loadAccessibilityPreferences();
    applyAccessibilityPreferences(preferences);
    $$('[data-open-privacy]').forEach((button) => button.addEventListener("click", () => openInfoDialog("#privacy-dialog")));
    $$('[data-open-accessibility]').forEach((button) => button.addEventListener("click", () => openInfoDialog("#accessibility-dialog")));
    const controls = {
      "#accessibility-large-text": "largeText",
      "#accessibility-high-contrast": "highContrast",
      "#accessibility-reduce-motion": "reduceMotion"
    };
    Object.entries(controls).forEach(([selector, key]) => {
      const input = $(selector);
      if (!input) return;
      input.checked = Boolean(preferences[key]);
      input.addEventListener("change", () => {
        const next = loadAccessibilityPreferences();
        next[key] = input.checked;
        saveAccessibilityPreferences(next);
        applyAccessibilityPreferences(next);
      });
    });
    const reset = $("#accessibility-reset");
    if (reset) reset.addEventListener("click", () => {
      const next = { largeText: false, highContrast: false, reduceMotion: false };
      saveAccessibilityPreferences(next);
      applyAccessibilityPreferences(next);
      Object.entries(controls).forEach(([selector]) => { const input = $(selector); if (input) input.checked = false; });
      showToast("無障礙顯示設定已恢復預設", "success");
    });
    enhanceToggleGroups();
  }

  function openInfoDialog(selector) {
    const dialog = $(selector);
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function loadAccessibilityPreferences() {
    try {
      return { largeText: false, highContrast: false, reduceMotion: false, ...JSON.parse(localStorage.getItem("swiftlocal-accessibility") || "{}") };
    } catch {
      return { largeText: false, highContrast: false, reduceMotion: false };
    }
  }

  function saveAccessibilityPreferences(preferences) {
    try {
      localStorage.setItem("swiftlocal-accessibility", JSON.stringify(preferences));
    } catch {
      // Preferences still apply for the current session if storage is unavailable.
    }
  }

  function applyAccessibilityPreferences(preferences) {
    document.documentElement.classList.toggle("a11y-large-text", Boolean(preferences.largeText));
    document.documentElement.classList.toggle("a11y-high-contrast", Boolean(preferences.highContrast));
    document.documentElement.classList.toggle("a11y-reduce-motion", Boolean(preferences.reduceMotion));
  }

  function enhanceToggleGroups() {
    $$(".segmented[role='group'], .task-filters[role='group']").forEach((group) => {
      const buttons = Array.from(group.querySelectorAll("button"));
      buttons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.classList.contains("is-active")));
        button.addEventListener("click", () => {
          buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        });
      });
    });
  }

  function bindPresetCenter() {
    try {
      const saved = JSON.parse(localStorage.getItem("swiftlocal-presets") || "[]");
      state.userPresets = Array.isArray(saved) ? saved.filter(isValidUserPreset).slice(0, 50) : [];
    } catch {
      state.userPresets = [];
    }
    const shortcut = $("#preset-shortcut");
    const save = $("#save-current-preset");
    const saveTool = $("#save-tool-preset");
    const search = $("#preset-search");
    const form = $("#preset-dialog-form");
    const close = $("#preset-dialog-close");
    const cancel = $("#preset-dialog-cancel");
    if (shortcut) shortcut.addEventListener("click", () => activatePanel("presets-panel", null, true));
    if (save) save.addEventListener("click", () => {
      activatePanel("home-panel", null, true);
      showToast("先開啟一個工具並調整選項，再按頁頂的「保存這組設定」", "info");
    });
    if (saveTool) saveTool.addEventListener("click", openSavePresetDialog);
    if (search) search.addEventListener("input", renderPresetLibrary);
    if (form) form.addEventListener("submit", savePresetFromDialog);
    if (close) close.addEventListener("click", closePresetDialog);
    if (cancel) cancel.addEventListener("click", closePresetDialog);
    $$('[data-preset-filter]').forEach((button) => button.addEventListener("click", () => {
      state.presetFilter = button.dataset.presetFilter || "all";
      $$('[data-preset-filter]').forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderPresetLibrary();
    }));
    renderPresetLibrary();
  }

  function presetPanelMeta(panelId) {
    const map = {
      "image-panel": { title: "圖片轉換", category: "image", badge: "圖片" },
      "pdf-panel": { title: "PDF 處理", category: currentPdfPresetCategory(), badge: "PDF" },
      "data-panel": { title: "CSV／JSON／XML 轉換", category: "other", badge: "文字、資料與進階工具" },
      "text-panel": { title: "文字整理與繁簡轉換", category: "other", badge: "文字、資料與進階工具" },
      "hash-panel": { title: "檔案雜湊驗證", category: "other", badge: "辦公輔助工具" },
      "zip-panel": { title: "ZIP 壓縮與解壓", category: "other", badge: "辦公輔助工具" },
      "diff-panel": { title: "文字差異比對", category: "other", badge: "辦公輔助工具" },
      "split-panel": { title: "大型檔案分割與合併", category: "other", badge: "文字、資料與進階工具" },
      "rename-panel": { title: "批量改名", category: "other", badge: "辦公輔助工具" },
      "tools-panel": { title: "QR Code 與編碼工具", category: "other", badge: "快速小工具" },
      "workflow-panel": { title: "工作流程", category: "automation", badge: "自動化" },
      "media-panel": { title: "影音轉換", category: "media", badge: "影音" }
    };
    return map[panelId] || null;
  }

  function currentPdfPresetCategory() {
    const mode = $("#pdf-mode");
    if (mode && ["ocr-pdf", "pdf-to-searchable-pdf"].includes(mode.value)) return "ocr";
    if (mode && ["office-to-pdf", "pdf-to-docx", "pdf-to-office"].includes(mode.value)) return "office";
    return "pdf";
  }

  function presetDisplayCategory(preset) {
    if (["pdf", "ocr", "office", "image", "media", "automation", "other"].includes(preset.category)) return preset.category;
    const fallback = {
      "workflow-panel": "automation",
      "media-panel": "media",
      "image-panel": "image",
      "pdf-panel": "pdf"
    }[preset.panelId];
    return fallback || "other";
  }

  function collectSafePresetSettings(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return { settings: {}, actions: [] };
    const settings = {};
    panel.querySelectorAll("select[id], input[id]").forEach((control) => {
      if (control.disabled || control.readOnly || /password|path|file/i.test(control.id)) return;
      const type = String(control.type || "").toLowerCase();
      const safe = control.tagName === "SELECT" || ["number", "range", "checkbox", "radio"].includes(type);
      if (!safe) return;
      settings[`#${control.id}`] = type === "checkbox" || type === "radio" ? control.checked : control.value;
    });
    const actions = [];
    if (panelId === "data-panel") {
      const active = panel.querySelector("[data-data-mode].is-active");
      if (active) actions.push(`[data-data-mode='${active.dataset.dataMode}']`);
    }
    if (panelId === "text-panel") {
      const active = panel.querySelector("[data-text-mode].is-active");
      if (active) actions.push(`[data-text-mode='${active.dataset.textMode}']`);
    }
    return { settings, actions };
  }

  function openSavePresetDialog() {
    const panelId = state.activePanel;
    const meta = presetPanelMeta(panelId);
    if (!meta) {
      showToast("請先開啟一個支援的工具並調整設定", "info");
      return;
    }
    const captured = collectSafePresetSettings(panelId);
    const count = Object.keys(captured.settings).length + captured.actions.length;
    if (!count) {
      showToast("目前工具沒有可安全保存的選項", "info");
      return;
    }
    const editingPreset = state.userPresets.find((item) => item.id === state.editingPresetId && item.panelId === panelId);
    state.pendingPreset = { mode: editingPreset ? "update" : "create", presetId: editingPreset?.id, panelId, meta, ...captured };
    const title = $("#preset-dialog-title");
    const name = $("#preset-name");
    const submit = $("#preset-dialog-submit");
    if (title) title.textContent = editingPreset ? "更新我的常用設定" : "保存這組設定";
    if (name) name.value = editingPreset?.name || `${meta.title}常用設定`;
    if (submit) submit.textContent = editingPreset ? "更新設定" : "保存";
    setTextIfPresent("#preset-source-tool", meta.title);
    setTextIfPresent("#preset-field-count", `${count} 項安全選項`);
    openInfoDialog("#preset-dialog");
    if (name) name.select();
  }

  function openRenamePresetDialog(preset) {
    state.pendingPreset = { mode: "rename", presetId: preset.id };
    const title = $("#preset-dialog-title");
    const name = $("#preset-name");
    if (title) title.textContent = "重新命名常用設定";
    const submit = $("#preset-dialog-submit");
    if (submit) submit.textContent = "儲存名稱";
    if (name) name.value = preset.name;
    setTextIfPresent("#preset-source-tool", titles[preset.panelId] || preset.badge || "工具");
    setTextIfPresent("#preset-field-count", `${Object.keys(preset.settings || {}).length + (preset.actions || []).length} 項安全選項`);
    openInfoDialog("#preset-dialog");
    if (name) name.select();
  }

  function closePresetDialog() {
    const dialog = $("#preset-dialog");
    if (dialog && dialog.open) dialog.close();
    state.pendingPreset = null;
  }

  function savePresetFromDialog(event) {
    event.preventDefault();
    const pending = state.pendingPreset;
    const nameInput = $("#preset-name");
    const name = nameInput ? nameInput.value.trim() : "";
    if (!pending || !name) return;
    if (pending.mode === "rename") {
      const preset = state.userPresets.find((item) => item.id === pending.presetId);
      if (preset) preset.name = name;
      showToast("常用設定已重新命名", "success");
    } else if (pending.mode === "update") {
      const preset = state.userPresets.find((item) => item.id === pending.presetId);
      if (preset) Object.assign(preset, {
        name,
        description: `從「${pending.meta.title}」保存的自訂選項。`,
        category: pending.meta.category,
        badge: pending.meta.badge,
        panelId: pending.panelId,
        settings: pending.settings,
        actions: pending.actions,
        updatedAt: new Date().toISOString()
      });
      state.editingPresetId = null;
      updatePresetAction(state.activePanel);
      showToast(`已更新「${name}」`, "success");
    } else {
      state.userPresets.unshift({
        id: `preset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name,
        description: `從「${pending.meta.title}」保存的自訂選項。`,
        category: pending.meta.category,
        badge: pending.meta.badge,
        panelId: pending.panelId,
        settings: pending.settings,
        actions: pending.actions,
        custom: true,
        createdAt: new Date().toISOString()
      });
      state.userPresets = state.userPresets.slice(0, 50);
      showToast(`已保存「${name}」；下次可在「我的常用設定」使用`, "success");
    }
    persistUserPresets();
    closePresetDialog();
    renderPresetLibrary();
  }

  function persistUserPresets() {
    try {
      localStorage.setItem("swiftlocal-presets", JSON.stringify(state.userPresets));
    } catch {
      showToast("無法保存預設；目前瀏覽器可能禁止本機儲存", "error");
    }
  }

  function isValidUserPreset(preset) {
    if (!preset || typeof preset.id !== "string" || typeof preset.name !== "string" || typeof preset.panelId !== "string" || !preset.settings || typeof preset.settings !== "object") return false;
    const safeSettings = Object.keys(preset.settings).every((selector) => /^#[A-Za-z][\w:-]*$/.test(selector));
    const safeActions = !preset.actions || (Array.isArray(preset.actions) && preset.actions.every((selector) => /^\[data-(data|text)-mode='[\w-]+'\]$/.test(selector)));
    return safeSettings && safeActions && Boolean(presetPanelMeta(preset.panelId));
  }

  function renderPresetLibrary() {
    const container = $("#preset-list");
    if (!container) return;
    const search = $("#preset-search");
    const query = search ? search.value.trim().toLowerCase() : "";
    const all = [...state.userPresets, ...BUILT_IN_PRESETS];
    const visible = all.filter((preset) => {
      const filterMatches = state.presetFilter === "all"
        || (state.presetFilter === "custom" ? Boolean(preset.custom) : presetDisplayCategory(preset) === state.presetFilter);
      const haystack = [preset.name, preset.description, preset.badge, presetDisplayCategory(preset)].join(" ").toLowerCase();
      return filterMatches && (!query || haystack.includes(query));
    });
    setTextIfPresent("#preset-total-count", all.length);
    setTextIfPresent("#preset-custom-count", state.userPresets.length);
    container.innerHTML = "";
    container.classList.toggle("empty", visible.length === 0);
    if (!visible.length) {
      container.innerHTML = state.presetFilter === "custom"
        ? '<div class="task-empty-state"><strong>你還未保存常用設定</strong><span>開啟工具、調整選項，再按頁頂的「保存這組設定」。</span></div>'
        : '<div class="task-empty-state"><strong>找不到常用設定</strong><span>請更改分類或搜尋字詞。</span></div>';
      return;
    }
    visible.forEach((preset) => container.appendChild(buildPresetCard(preset)));
  }

  function buildPresetCard(preset) {
    const card = document.createElement("article");
    card.className = `preset-card${preset.custom ? " custom" : ""}`;
    card.innerHTML = `<div class="preset-card-heading"><span class="preset-card-icon" aria-hidden="true">${preset.custom ? "★" : "◆"}</span><div><span class="preset-card-badge">${escapeHtml(preset.badge || "設定")}</span><h3>${escapeHtml(preset.name)}</h3></div></div><p>${escapeHtml(preset.description || "")}</p><div class="preset-card-meta"><span>${preset.custom ? "我保存的 · 只在這部裝置" : "SwiftLocal 推薦設定"}</span></div>`;
    const actions = document.createElement("div");
    actions.className = "preset-card-actions";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "primary-button compact";
    apply.textContent = preset.custom ? "使用這組設定" : "使用推薦設定";
    apply.addEventListener("click", () => applyPreset(preset));
    actions.appendChild(apply);
    if (preset.custom) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary-button compact";
      edit.textContent = "修改設定";
      edit.addEventListener("click", () => editPresetSettings(preset));
      const rename = document.createElement("button");
      rename.type = "button";
      rename.className = "secondary-button compact";
      rename.textContent = "改名";
      rename.addEventListener("click", () => openRenamePresetDialog(preset));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost-button compact danger-button";
      remove.textContent = "刪除";
      remove.addEventListener("click", () => {
        if (remove.dataset.confirm !== "true") {
          remove.dataset.confirm = "true";
          remove.textContent = "再次按下確認";
          window.setTimeout(() => {
            if (remove.isConnected) {
              remove.dataset.confirm = "false";
              remove.textContent = "刪除";
            }
          }, 4000);
          return;
        }
        state.userPresets = state.userPresets.filter((item) => item.id !== preset.id);
        persistUserPresets();
        renderPresetLibrary();
        if (state.editingPresetId === preset.id) state.editingPresetId = null;
        showToast("常用設定已刪除", "success");
      });
      actions.append(edit, rename, remove);
    }
    card.appendChild(actions);
    return card;
  }

  function applyPreset(preset) {
    activatePanel(preset.panelId, null, true);
    (preset.actions || []).forEach((selector) => {
      const button = $(selector);
      if (button) button.click();
    });
    Object.entries(preset.settings || {}).forEach(([selector, value]) => {
      const control = $(selector);
      if (!control || control.type === "file" || /password|path/i.test(control.id || "")) return;
      if (control.type === "checkbox" || control.type === "radio") control.checked = Boolean(value);
      else control.value = String(value);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
    showToast(`已套用「${preset.name}」`, "success");
  }

  function editPresetSettings(preset) {
    state.editingPresetId = preset.id;
    applyPreset(preset);
    updatePresetAction(preset.panelId);
    showToast(`正在修改「${preset.name}」；調整後按頁頂的「更新這組設定」`, "info");
  }

  function updatePresetAction(panelId) {
    const button = $("#save-tool-preset");
    if (!button) return;
    const supported = Boolean(presetPanelMeta(panelId));
    button.hidden = !supported;
    if (!supported) return;
    const editing = state.userPresets.find((item) => item.id === state.editingPresetId && item.panelId === panelId);
    button.textContent = editing ? "更新這組設定" : "保存這組設定";
    button.setAttribute("aria-label", editing ? `更新「${editing.name}」` : `保存${titles[panelId] || "目前工具"}的這組設定`);
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
        activatePanel(button.dataset.panel, null, true);
      });
    });
  }

  function bindPdfReaderPanel() {
    const openWindowBtn = $("#pdf-reader-open-window");
    if (openWindowBtn) {
      const canOpenWindow = electronBridgeAvailable()
        && window.swiftLocalBackend
        && typeof window.swiftLocalBackend.openPdfWorkspace === "function";
      openWindowBtn.hidden = !canOpenWindow;
      openWindowBtn.addEventListener("click", async () => {
        try {
          await window.swiftLocalBackend.openPdfWorkspace("");
          showToast("已開啟獨立 PDF 工作區視窗", "success");
        } catch (error) {
          showToast(readableError(error), "error");
        }
      });
    }
    const setDefaultBtn = $("#pdf-reader-set-default");
    if (setDefaultBtn) {
      const canSetDefault = electronBridgeAvailable()
        && window.swiftLocalBackend
        && typeof window.swiftLocalBackend.openPdfAssociationSettings === "function";
      setDefaultBtn.hidden = !canSetDefault;
      setDefaultBtn.addEventListener("click", async () => {
        try {
          const result = await window.swiftLocalBackend.openPdfAssociationSettings();
          showToast((result && result.message) || "已開啟系統設定", result && result.ok === false ? "error" : "info", 7000);
        } catch (error) {
          showToast(readableError(error), "error");
        }
      });
    }
  }

  function ensurePdfReaderShell() {
    if (pdfReaderShell) return pdfReaderShell;
    const host = $("#pdf-reader-host");
    if (!host) return null;
    if (!window.SwiftLocalPdfWorkspace || typeof window.SwiftLocalPdfWorkspace.mountPdfWorkspace !== "function") {
      host.innerHTML = "<p class=\"panel-lead\">PDF 工作區模組尚未載入。</p>";
      return null;
    }
    pdfReaderShell = window.SwiftLocalPdfWorkspace.mountPdfWorkspace(host, {
      embedded: true
    });
    return pdfReaderShell;
  }

  function activatePanel(panelId, focusSelector, moveFocus = true) {
    if (!panelId) return;
    const editingPreset = state.userPresets.find((item) => item.id === state.editingPresetId);
    if (editingPreset && panelId !== editingPreset.panelId && panelId !== "presets-panel") state.editingPresetId = null;
    const navPanelId = ["pdf-panel", "pdf-reader-panel"].includes(panelId)
      ? "pdf-hub-panel"
      : panelId === "media-download-panel" ? "media-panel" : panelId;
    state.activePanel = panelId;
    $$(".nav-item").forEach((item) => {
      const active = item.dataset.panel === navPanelId;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    const activeNavItem = $(`.nav-item[data-panel='${navPanelId}']`);
    const parentDetails = activeNavItem ? activeNavItem.closest("details") : null;
    if (parentDetails) parentDetails.open = true;
    $$('[data-mobile-panel]').forEach((item) => {
      const mobilePanelId = ["pdf-panel", "pdf-reader-panel", "pdf-hub-panel"].includes(panelId)
        ? "pdf-hub-panel"
        : panelId === "media-download-panel" ? "media-panel" : panelId;
      const active = item.dataset.mobilePanel === mobilePanelId;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    $$(".panel").forEach((panel) => {
      const active = panel.id === panelId;
      panel.classList.toggle("is-active", active);
      panel.setAttribute("aria-hidden", String(!active));
    });
    $("#panel-title").textContent = titles[panelId] || "SwiftLocal";
    const clearButton = $("#clear-all");
    if (clearButton) clearButton.hidden = ["home-panel", "tasks-panel", "workflow-panel", "presets-panel", "pdf-reader-panel", "pdf-hub-panel", "ocr-panel", "office-panel"].includes(panelId);
    updatePresetAction(panelId);
    updatePanelAssist(panelId);
    closeMobileNavigation();
    if (panelId === "tasks-panel" && state.backendConnected) refreshBackendJobs();
    if (panelId === "pdf-reader-panel") ensurePdfReaderShell();
    const target = focusSelector ? $(focusSelector) : null;
    if (target) target.focus({ preventScroll: true });
    else if (moveFocus) {
      const heading = $("#panel-title");
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  function bindProductRoutes() {
    $$('[data-product-panel]').forEach((button) => {
      button.addEventListener("click", () => {
        const pdfMode = button.dataset.pdfMode;
        const imageJob = button.dataset.imageJob;
        const officeFormat = button.dataset.officeFormat;
        const scanOcr = button.dataset.scanOcr;
        const workflowTemplate = button.dataset.workflowTemplate;
        if (pdfMode && $("#pdf-mode")) {
          $("#pdf-mode").value = pdfMode;
          $("#pdf-mode").dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (imageJob && $("#img-backend-job-type")) {
          $("#img-backend-job-type").value = imageJob;
          $("#img-backend-job-type").dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (officeFormat && $("#pdf-office-format")) {
          $("#pdf-office-format").value = officeFormat;
          $("#pdf-office-format").dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (scanOcr && $("#pdf-office-scan-ocr")) $("#pdf-office-scan-ocr").value = scanOcr;
        if (scanOcr && $("#pdf-office-advanced")) $("#pdf-office-advanced").open = true;
        if (workflowTemplate && $("#workflow-template")) {
          $("#workflow-template").value = workflowTemplate;
          $("#workflow-template").dispatchEvent(new Event("change", { bubbles: true }));
        }
        activatePanel(button.dataset.productPanel, button.dataset.productFocus || null, true);
      });
    });

    $$('[data-media-purpose]').forEach((button) => {
      button.addEventListener("click", () => {
        const settings = {
          email: { extension: "mp4", videoBitrate: "1M", audioBitrate: "128k", scale: "-2:720" },
          mp3: { extension: "mp3", audioBitrate: "128k" },
          audio: { extension: "m4a", audioBitrate: "128k" },
          "720p": { extension: "mp4", scale: "-2:720" },
          trim: { extension: "mp4" },
          gif: { extension: "gif", scale: "-2:480" }
        }[button.dataset.mediaPurpose];
        if (!settings) return;
        const fields = {
          "#media-output-extension": settings.extension || "mp4",
          "#media-video-bitrate": settings.videoBitrate || "",
          "#media-audio-bitrate": settings.audioBitrate || "",
          "#media-scale": settings.scale || "",
          "#media-crop": ""
        };
        Object.entries(fields).forEach(([selector, value]) => { if ($(selector)) $(selector).value = value; });
        $("#media-output-extension").dispatchEvent(new Event("change", { bubbles: true }));
        $$('[data-media-purpose]').forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        if (button.dataset.mediaPurpose === "trim") {
          const details = $(".media-advanced");
          if (details) details.open = true;
          if ($("#media-start")) $("#media-start").focus();
        } else if ($("#media-files")) $("#media-files").focus();
      });
    });
  }

  function bindResponsiveNavigation() {
    const toggle = $("#mobile-nav-toggle");
    const close = $("#mobile-nav-close");
    const backdrop = $("#mobile-nav-backdrop");
    const brand = $(".brand[data-panel]");
    const more = $("#mobile-more-tools");
    const taskShortcut = $("#task-center-shortcut");

    if (toggle) toggle.addEventListener("click", openMobileNavigation);
    if (close) close.addEventListener("click", () => closeMobileNavigation(true));
    if (backdrop) backdrop.addEventListener("click", () => closeMobileNavigation(true));
    if (more) more.addEventListener("click", openMobileNavigation);
    if (taskShortcut) taskShortcut.addEventListener("click", () => activatePanel("tasks-panel", null, true));
    if (brand) brand.addEventListener("click", () => activatePanel(brand.dataset.panel, null, true));
    $$('[data-mobile-panel]').forEach((button) => {
      button.addEventListener("click", () => activatePanel(button.dataset.mobilePanel, null, true));
    });
    $$('[data-home-panel]').forEach((button) => {
      button.addEventListener("click", () => activatePanel(button.dataset.homePanel, button.dataset.homeFocus));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.body.classList.contains("nav-open")) closeMobileNavigation(true);
    });
    window.addEventListener("resize", syncMobileNavigationAccessibility);
    syncMobileNavigationAccessibility();
  }

  function bindTaskCenter() {
    const refresh = $("#refresh-task-center");
    const search = $("#task-search");
    const clear = $("#clear-task-history");
    if (refresh) refresh.addEventListener("click", refreshBackendJobs);
    if (search) search.addEventListener("input", renderGlobalTaskCenter);
    $$('[data-task-filter]').forEach((button) => {
      button.addEventListener("click", () => {
        state.taskFilter = button.dataset.taskFilter || "all";
        $$('[data-task-filter]').forEach((item) => item.classList.toggle("is-active", item === button));
        renderGlobalTaskCenter();
      });
    });
    if (clear) clear.addEventListener("click", clearFinishedTaskHistory);
  }

  function bindWorkflowTool() {
    const template = $("#workflow-template");
    const files = $("#workflow-files");
    const form = $("#workflow-form");
    const add = $("#workflow-add-step");
    const reset = $("#workflow-reset");
    try {
      const saved = JSON.parse(localStorage.getItem("swiftlocal-workflows") || "[]");
      state.workflowRuns = Array.isArray(saved) ? saved.slice(0, 20) : [];
    } catch {
      state.workflowRuns = [];
    }
    if (template) template.addEventListener("change", () => applyWorkflowTemplate(template.value));
    if (files) files.addEventListener("change", () => {
      state.workflowFiles = Array.from(files.files || []);
      updateWorkflowReadiness();
    });
    if (add) add.addEventListener("click", () => {
      state.workflowSteps.push({ type: "pdf-compress" });
      if (template) template.value = "custom";
      renderWorkflowSteps();
    });
    if (reset) reset.addEventListener("click", resetWorkflowBuilder);
    if (form) form.addEventListener("submit", startWorkflowRun);
    applyWorkflowTemplate(template ? template.value : "office-archive");
    renderWorkflowRuns();
    updateWorkflowDesktopState();
  }

  function applyWorkflowTemplate(templateId) {
    const templates = {
      "office-archive": ["office-to-pdf", "pdf-compress"],
      "secure-pdf": ["pdf-compress", "pdf-encrypt"],
      "review-pdf": ["pdf-rotate", "pdf-compress"],
      custom: state.workflowSteps.length ? state.workflowSteps.map((step) => step.type) : ["pdf-compress"]
    };
    state.workflowSteps = (templates[templateId] || templates.custom).map((type) => ({ type }));
    const help = $("#workflow-file-help");
    if (help) help.textContent = templateId === "office-archive"
      ? "Office 文件會先轉成 PDF，再自動壓縮"
      : "請選擇 PDF；每一步完成後會自動接續";
    renderWorkflowSteps();
  }

  function renderWorkflowSteps() {
    const list = $("#workflow-steps");
    if (!list) return;
    list.innerHTML = "";
    state.workflowSteps.forEach((step, index) => {
      const item = document.createElement("li");
      item.className = "workflow-step";
      item.innerHTML = `<span class="workflow-step-number">${index + 1}</span><label><span class="visually-hidden">步驟 ${index + 1}</span><select data-workflow-step-index="${index}">${workflowStepOptions(step.type)}</select></label><div class="workflow-step-actions"><button type="button" data-workflow-up="${index}" aria-label="向上移">↑</button><button type="button" data-workflow-down="${index}" aria-label="向下移">↓</button><button type="button" data-workflow-remove="${index}" aria-label="移除">×</button></div>`;
      list.appendChild(item);
    });
    $$('[data-workflow-step-index]').forEach((select) => {
      select.addEventListener("change", () => {
        state.workflowSteps[Number(select.dataset.workflowStepIndex)].type = select.value;
        const template = $("#workflow-template");
        if (template) template.value = "custom";
        updateWorkflowOptions();
      });
    });
    $$('[data-workflow-up]').forEach((button) => button.addEventListener("click", () => moveWorkflowStep(Number(button.dataset.workflowUp), -1)));
    $$('[data-workflow-down]').forEach((button) => button.addEventListener("click", () => moveWorkflowStep(Number(button.dataset.workflowDown), 1)));
    $$('[data-workflow-remove]').forEach((button) => button.addEventListener("click", () => {
      state.workflowSteps.splice(Number(button.dataset.workflowRemove), 1);
      const template = $("#workflow-template");
      if (template) template.value = "custom";
      renderWorkflowSteps();
    }));
    updateWorkflowOptions();
    updateWorkflowReadiness();
  }

  function workflowStepOptions(selected) {
    const options = [
      ["office-to-pdf", "Office → PDF"],
      ["pdf-rotate", "旋轉 PDF"],
      ["pdf-compress", "壓縮 PDF"],
      ["pdf-encrypt", "加密 PDF"],
      ["pdf-decrypt", "解密 PDF"]
    ];
    return options.map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`).join("");
  }

  function moveWorkflowStep(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= state.workflowSteps.length) return;
    [state.workflowSteps[index], state.workflowSteps[target]] = [state.workflowSteps[target], state.workflowSteps[index]];
    const template = $("#workflow-template");
    if (template) template.value = "custom";
    renderWorkflowSteps();
  }

  function updateWorkflowOptions() {
    const types = new Set(state.workflowSteps.map((step) => step.type));
    $$('[data-workflow-option]').forEach((label) => {
      const key = label.dataset.workflowOption;
      label.hidden = key === "angle" ? !types.has("pdf-rotate") : !(types.has("pdf-encrypt") || types.has("pdf-decrypt"));
    });
  }

  function updateWorkflowReadiness() {
    const ready = electronBridgeAvailable() && state.workflowFiles.length > 0 && state.workflowSteps.length > 0;
    setStatus("#workflow-readiness", ready ? "可以啟動" : electronBridgeAvailable() ? "等待檔案" : "需要桌面版");
  }

  function updateWorkflowDesktopState() {
    const submit = $("#workflow-form button[type='submit']");
    if (submit) submit.disabled = !electronBridgeAvailable();
    updateWorkflowReadiness();
  }

  function resetWorkflowBuilder() {
    const form = $("#workflow-form");
    if (form) form.reset();
    state.workflowFiles = [];
    applyWorkflowTemplate("office-archive");
  }

  async function startWorkflowRun(event) {
    event.preventDefault();
    if (!electronBridgeAvailable()) {
      showToast("工作流程串連需要桌面版", "error");
      return;
    }
    if (!state.workflowFiles.length || !state.workflowSteps.length) {
      showToast("請選擇來源檔案並保留至少一個步驟", "error");
      return;
    }
    const types = state.workflowSteps.map((step) => step.type);
    if (types.slice(1).includes("office-to-pdf")) {
      showToast("Office 轉 PDF 只能放在第一步", "error");
      return;
    }
    if (types[0] !== "office-to-pdf" && state.workflowFiles.some((file) => !file.name.toLowerCase().endsWith(".pdf"))) {
      showToast("這個流程的第一步需要 PDF 檔案", "error");
      return;
    }
    const password = $("#workflow-password") ? $("#workflow-password").value : "";
    if ((types.includes("pdf-encrypt") || types.includes("pdf-decrypt")) && !password) {
      showToast("加密或解密步驟需要 PDF 密碼", "error");
      return;
    }
    const inputPaths = [];
    for (const file of state.workflowFiles) {
      const filePath = await electronFilePath(file);
      if (filePath) inputPaths.push(filePath);
    }
    if (!inputPaths.length) {
      showToast("無法讀取來源檔案路徑，請重新選擇檔案", "error");
      return;
    }
    const template = $("#workflow-template");
    const run = {
      id: `workflow-${Date.now()}`,
      name: template && template.selectedOptions[0] ? template.selectedOptions[0].textContent : "自訂流程",
      status: "running",
      createdAt: new Date().toISOString(),
      currentStep: 0,
      inputPaths,
      outputPaths: [],
      stepOutputs: {},
      options: { angle: $("#workflow-angle") ? $("#workflow-angle").value : "90", password },
      steps: types.map((type) => ({ type, status: "pending", jobId: null }))
    };
    state.workflowRuns.unshift(run);
    state.workflowRuns = state.workflowRuns.slice(0, 20);
    persistWorkflowRuns();
    renderWorkflowRuns();
    try {
      await enqueueWorkflowStep(run, 0, inputPaths);
      showToast("工作流程已啟動", "success");
      await refreshBackendJobs();
    } catch (error) {
      run.status = "failed";
      run.error = readableError(error);
      persistWorkflowRuns();
      renderWorkflowRuns();
      showToast(run.error, "error");
    }
  }

  function openMobileNavigation() {
    document.body.classList.add("nav-open");
    const toggle = $("#mobile-nav-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    const sidebar = $(".sidebar");
    if (sidebar) sidebar.setAttribute("aria-hidden", "false");
    const close = $("#mobile-nav-close");
    if (close && window.matchMedia("(max-width: 940px)").matches) close.focus();
  }

  function closeMobileNavigation(restoreFocus = false) {
    document.body.classList.remove("nav-open");
    const toggle = $("#mobile-nav-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    syncMobileNavigationAccessibility();
    if (restoreFocus && toggle && window.matchMedia("(max-width: 940px)").matches) toggle.focus();
  }

  function syncMobileNavigationAccessibility() {
    const sidebar = $(".sidebar");
    if (!sidebar) return;
    const hidden = window.matchMedia("(max-width: 940px)").matches && !document.body.classList.contains("nav-open");
    sidebar.setAttribute("aria-hidden", String(hidden));
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
      const platform = guide.platform === "local"
        ? '<em class="nav-platform">本機引擎</em>'
        : guide.platform === "device" ? '<em class="nav-platform">裝置</em>' : "";
      const taskCount = button.dataset.panel === "tasks-panel" ? '<b id="sidebar-task-count">0</b>' : "";
      button.title = guide.hint;
      button.setAttribute("aria-label", `${guide.nav}：${guide.hint}`);
      button.innerHTML = `<span>${escapeHtml(guide.nav)}${platform}</span>${taskCount}<small>${escapeHtml(guide.hint)}</small>`;
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
          if (panel) {
            const reduceMotion = document.documentElement.classList.contains("a11y-reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
          }
        });
      });
    }

    function renderSearchResults(query) {
      const terms = query.split(/\s+/).filter(Boolean);
      const hasQuery = terms.length > 0;
      const matches = Object.entries(toolGuides).filter(([panelId, guide]) => {
        if (SEARCH_HIDDEN_PANEL_IDS.has(panelId)) return false;
        const haystack = [guide.nav, guide.hint, guide.keywords, titles[panelId], toolAreaLabel(panelId)].join(" ").toLowerCase();
        return !hasQuery || terms.every((term) => haystack.includes(term));
      });

      $$(".nav-item").forEach((button) => {
        const haystack = (button.dataset.keywords || button.textContent || "").toLowerCase();
        button.hidden = hasQuery && !terms.every((term) => haystack.includes(term));
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
        button.innerHTML = `<strong>${escapeHtml(guide.nav)}</strong><span>${escapeHtml(guide.hint)}</span><em>${escapeHtml(toolAreaLabel(panelId))}</em>`;
        quickActions.appendChild(button);
      });
      bindQuickActionButtons();
    }
  }

  function updatePanelAssist(panelId) {
    const assist = $("#panel-assist");
    const guide = toolGuides[panelId];
    if (!assist) return;
    if (panelId === "home-panel" || panelId === "tasks-panel" || panelId === "presets-panel") {
      assist.innerHTML = "";
      return;
    }
    if (!guide) return;
    const privacy = panelPrivacyInfo(panelId);
    assist.innerHTML = [
      `<div><strong>${escapeHtml(titles[panelId] || guide.nav)}</strong><span>${escapeHtml(guide.hint)}</span><button class="assist-privacy ${privacy.kind}" type="button" data-open-privacy-inline><b>${escapeHtml(privacy.label)}</b><small>${escapeHtml(privacy.note)}</small></button></div>`,
      `<ol>${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
    ].join("");
    const privacyButton = assist.querySelector("[data-open-privacy-inline]");
    if (privacyButton) privacyButton.addEventListener("click", () => openInfoDialog("#privacy-dialog"));
  }

  function panelPrivacyInfo(panelId) {
    if (panelId === "media-download-panel") {
      return { kind: "network", label: "連接媒體來源", note: "網址由本機工具直接分析及下載；不作遙測" };
    }
    if (["workflow-panel", "media-panel", "backend-panel", "ocr-panel", "office-panel"].includes(panelId)) {
      return { kind: "disk", label: "本機磁碟", note: "由這部電腦的本機服務讀寫" };
    }
    if (panelId === "pdf-panel" || panelId === "pdf-hub-panel" || panelId === "image-panel") {
      return { kind: "mixed", label: "按處理方式", note: "即時工具用記憶體；進階任務寫入本機" };
    }
    return { kind: "memory", label: "瀏覽器記憶體", note: "不會上載；下載時才寫入檔案" };
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
      state.imageWorkspaceItems = [];
      state.imageWorkspaceSelectedId = null;
      state.imageWorkspaceSelectionMode = false;
      state.imageWorkspaceExportCancelRequested = true;
      state.imageWorkspaceExporting = false;
      clearImageWorkspaceOcrResult();
      $("#image-files").value = "";
      $("#image-format").value = "image/jpeg";
      $("#image-keep-ratio").checked = true;
      $("#image-quality").value = "0.85";
      $("#quality-output").textContent = "85%";
      $("#image-width").value = "";
      $("#image-height").value = "";
      $("#image-watermark").value = "";
      $("#image-watermark-position").value = "se";
      setEmpty("#image-results", "尚未產生檔案");
      $("#image-export-progress").textContent = "尚未匯出圖片。";
      $("#image-export-cancel").hidden = true;
      $("#download-all-images").disabled = true;
      setEmpty("#img-backend-jobs", "尚未建立任務");
      renderImageWorkspace();
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
    if (panelId === "media-download-panel" && mediaDownloader) {
      mediaDownloader.reset();
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
      renderImageWorkspacePreview();
    });
    $("#image-files").addEventListener("change", (event) => addImageWorkspaceFiles(event.target.files || []));
    ["#image-format", "#image-width", "#image-height", "#image-keep-ratio", "#image-watermark", "#image-watermark-position"]
      .forEach((selector) => $(selector).addEventListener("input", renderImageWorkspacePreview));
    $("#image-rotate-left").addEventListener("click", () => rotateSelectedImageWorkspaceItem(-90));
    $("#image-rotate-right").addEventListener("click", () => rotateSelectedImageWorkspaceItem(90));
    $("#image-rotate").addEventListener("change", () => setSelectedImageWorkspaceRotation(Number($("#image-rotate").value) || 0));
    $("#image-flip").addEventListener("change", () => setSelectedImageWorkspaceFlip($("#image-flip").value));
    $("#image-select-region").addEventListener("click", toggleImageWorkspaceSelectionMode);
    $("#image-apply-crop").addEventListener("click", applyImageWorkspaceCrop);
    $("#image-clear-selection").addEventListener("click", clearImageWorkspaceSelection);
    $("#image-reset-edits").addEventListener("click", resetSelectedImageWorkspaceItem);
    $("#image-export-current").addEventListener("click", () => exportImageWorkspace("current"));
    $("#download-all-images").addEventListener("click", () => exportImageWorkspace("all"));
    $("#image-export-cancel").addEventListener("click", () => {
      state.imageWorkspaceExportCancelRequested = true;
      $("#image-export-progress").textContent = "正在取消；目前圖片完成後會停止。";
    });
    $("#image-ocr-current").addEventListener("click", () => startImageWorkspaceOcr("current"));
    $("#image-ocr-all").addEventListener("click", () => startImageWorkspaceOcr("all"));
    $("#image-ocr-region").addEventListener("click", () => startImageWorkspaceOcr("region"));
    $("#image-ocr-cancel").addEventListener("click", async () => {
      if (state.imageWorkspaceOcrJobId) await cancelBackendJob(state.imageWorkspaceOcrJobId);
    });
    $("#image-ocr-copy").addEventListener("click", async () => {
      await copyText(state.imageWorkspaceOcrText);
      showToast("已複製辨識文字", "success");
    });
    $("#image-ocr-export").addEventListener("click", () => {
      if (state.imageWorkspaceOcrText) downloadText(state.imageWorkspaceOcrText, "swiftlocal-image-ocr.txt");
    });
    $("#image-ocr-clear").addEventListener("click", () => {
      clearImageWorkspaceOcrResult();
      renderImageWorkspaceOcrPanel();
    });
    bindImageWorkspacePointerSelection();
    bindImageWorkspaceDropZone();
    renderImageWorkspace();
  }

  async function convertImage(file, options) {
    const bitmap = await createImageBitmap(file);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (bitmap.width * bitmap.height > 50_000_000) {
      bitmap.close();
      throw new Error(`圖片超過 50 MP 安全上限（${bitmap.width}×${bitmap.height}）`);
    }
    const rotatedSideways = options.rotation === 90 || options.rotation === 270;
    const transformed = document.createElement("canvas");
    transformed.width = rotatedSideways ? bitmap.height : bitmap.width;
    transformed.height = rotatedSideways ? bitmap.width : bitmap.height;
    const transformedContext = transformed.getContext("2d");
    if (!transformedContext) {
      bitmap.close();
      throw new Error("瀏覽器無法建立圖片畫布");
    }
    drawTransformedImage(transformedContext, bitmap, transformed, options);
    bitmap.close();

    let working = cropBrowserImageCanvas(transformed, options.crop, "裁切區域");
    if (options.includeRegion) working = cropBrowserImageCanvas(working, options.selection, "OCR 框選區域");
    const size = resolveImageSize(working.width, working.height, options.maxWidth, options.maxHeight, options.keepRatio);
    if (size.width * size.height > 50_000_000) throw new Error("輸出圖片超過 50 MP 安全上限");
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: options.format !== "image/jpeg" });
    if (!context) throw new Error("瀏覽器無法建立圖片畫布");

    if (options.format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(working, 0, 0, canvas.width, canvas.height);
    if (options.watermarkText) {
      drawWatermark(context, canvas, options.watermarkText, options.watermarkPosition);
    }

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("這個輸出格式不受目前瀏覽器支援"));
        }
      }, options.format, options.quality);
    });

    return { blob, width: canvas.width, height: canvas.height, canvas, sourceWidth, sourceHeight };
  }

  function drawTransformedImage(context, bitmap, canvas, options) {
    const flipX = options.flip === "horizontal" || options.flip === "both";
    const flipY = options.flip === "vertical" || options.flip === "both";

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    context.rotate((options.rotation * Math.PI) / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2, bitmap.width, bitmap.height);
    context.restore();
  }

  function cropBrowserImageCanvas(source, rectangle, label) {
    if (!rectangle) return source;
    const left = Math.max(0, Math.floor(rectangle.x * source.width));
    const top = Math.max(0, Math.floor(rectangle.y * source.height));
    const right = Math.min(source.width, Math.ceil((rectangle.x + rectangle.width) * source.width));
    const bottom = Math.min(source.height, Math.ceil((rectangle.y + rectangle.height) * source.height));
    const width = right - left;
    const height = bottom - top;
    if (width < 8 || height < 8) throw new Error(`${label}至少需要 8×8 pixels`);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(source, left, top, width, height, 0, 0, width, height);
    return canvas;
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
    state.imageWorkspaceItems.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }

  function revokeImageDownloadUrls() {
    state.imageDownloads.forEach((item) => URL.revokeObjectURL(item.url));
    state.imageDownloads = [];
  }

  function currentImageWorkspaceItem() {
    return state.imageWorkspaceItems.find((item) => item.id === state.imageWorkspaceSelectedId) || null;
  }

  function addImageWorkspaceFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => {
      return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name);
    });
    if (!files.length) {
      showToast("請選擇支援的圖片檔案", "error");
      return;
    }
    const available = Math.max(0, 100 - state.imageWorkspaceItems.length);
    if (!available) {
      showToast("圖片工作區一次最多 100 張圖片", "error");
      return;
    }
    for (const file of files.slice(0, available)) {
      imageWorkspaceItemId += 1;
      const item = {
        id: `image-${imageWorkspaceItemId}`,
        file,
        previewUrl: URL.createObjectURL(file),
        rotation: 0,
        flip: "none",
        crop: null,
        selection: null,
        sourceWidth: 0,
        sourceHeight: 0
      };
      state.imageWorkspaceItems.push(item);
      if (!state.imageWorkspaceSelectedId) state.imageWorkspaceSelectedId = item.id;
    }
    if (files.length > available) showToast(`只加入前 ${available} 張圖片`, "info");
    clearImageWorkspaceOcrResult();
    $("#image-files").value = "";
    renderImageWorkspace();
  }

  function renderImageWorkspace() {
    const items = state.imageWorkspaceItems;
    const selected = currentImageWorkspaceItem();
    $("#image-workspace-count").textContent = `${items.length} 張圖片`;
    $("#image-workspace-file").textContent = selected ? selected.file.name : "尚未選擇圖片";
    const disabled = !selected;
    ["#image-rotate-left", "#image-rotate-right", "#image-flip", "#image-select-region", "#image-reset-edits"]
      .forEach((selector) => { $(selector).disabled = disabled; });
    $("#image-export-current").disabled = disabled || state.imageWorkspaceExporting;
    $("#download-all-images").disabled = !items.length || state.imageWorkspaceExporting;
    $("#image-apply-crop").disabled = !selected || !selected.selection;
    $("#image-clear-selection").disabled = !selected || !selected.selection;
    if (selected) {
      $("#image-rotate").value = String(selected.rotation);
      $("#image-flip").value = selected.flip;
    } else {
      $("#image-rotate").value = "0";
      $("#image-flip").value = "none";
    }
    renderImageWorkspaceThumbnails();
    renderImageWorkspacePreview();
    updateImageWorkspaceAvailability();
    renderImageWorkspaceOcrPanel();
  }

  function renderImageWorkspaceThumbnails() {
    const container = $("#image-workspace-thumbnails");
    const items = state.imageWorkspaceItems;
    if (!items.length) {
      container.classList.add("empty");
      container.textContent = "圖片縮圖會顯示在這裡";
      return;
    }
    container.classList.remove("empty");
    container.textContent = "";
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `image-thumbnail${item.id === state.imageWorkspaceSelectedId ? " is-selected" : ""}`;
      button.setAttribute("aria-label", `選擇第 ${index + 1} 張圖片：${item.file.name}`);
      const image = document.createElement("img");
      image.src = item.previewUrl;
      image.alt = "";
      const name = document.createElement("span");
      name.textContent = item.file.name;
      const meta = document.createElement("small");
      const edits = [item.rotation ? `${item.rotation}°` : "", item.flip !== "none" ? "已翻轉" : "", item.crop ? "已裁切" : ""]
        .filter(Boolean).join(" · ");
      meta.textContent = edits || formatBytes(item.file.size);
      button.append(image, name, meta);
      button.addEventListener("click", () => {
        state.imageWorkspaceSelectedId = item.id;
        state.imageWorkspaceSelectionMode = false;
        renderImageWorkspace();
      });
      container.appendChild(button);
    });
  }

  async function renderImageWorkspacePreview() {
    const token = ++imageWorkspaceRenderToken;
    const item = currentImageWorkspaceItem();
    const stage = $("#image-preview-stage");
    const media = $("#image-preview-media");
    const canvas = $("#image-preview-canvas");
    const empty = $("#image-preview-empty");
    if (!item) {
      stage.classList.add("empty");
      stage.classList.remove("selecting");
      media.hidden = true;
      canvas.hidden = true;
      empty.hidden = false;
      empty.innerHTML = "<strong>加入圖片開始處理</strong><span>支援多張圖片；所有處理都在這部裝置完成。</span>";
      $("#image-preview-dimensions").textContent = "—";
      $("#image-preview-crop").textContent = "尚未裁切";
      $("#image-preview-selection").textContent = "尚未框選";
      positionImageWorkspaceSelectionBox();
      return;
    }
    stage.classList.remove("empty");
    stage.classList.toggle("selecting", state.imageWorkspaceSelectionMode);
    try {
      const settings = imageWorkspaceExportSettings();
      const converted = await convertImage(item.file, {
        ...settings,
        format: "image/png",
        maxWidth: Math.min(settings.maxWidth || 1400, 1400),
        maxHeight: Math.min(settings.maxHeight || 900, 900),
        keepRatio: settings.keepRatio,
        rotation: item.rotation,
        flip: item.flip,
        crop: item.crop,
        selection: null,
        includeRegion: false
      });
      if (token !== imageWorkspaceRenderToken) return;
      item.sourceWidth = converted.sourceWidth;
      item.sourceHeight = converted.sourceHeight;
      canvas.width = converted.width;
      canvas.height = converted.height;
      canvas.getContext("2d").drawImage(converted.canvas, 0, 0);
      media.hidden = false;
      canvas.hidden = false;
      empty.hidden = true;
      $("#image-preview-dimensions").textContent = `${converted.sourceWidth}×${converted.sourceHeight} → 預覽 ${converted.width}×${converted.height}`;
      $("#image-preview-crop").textContent = item.crop ? "已套用非破壞式裁切" : "尚未裁切";
      $("#image-preview-selection").textContent = item.selection ? "已有框選區域" : "尚未框選";
      window.requestAnimationFrame(positionImageWorkspaceSelectionBox);
    } catch (error) {
      if (token !== imageWorkspaceRenderToken) return;
      canvas.hidden = true;
      media.hidden = true;
      empty.hidden = false;
      empty.innerHTML = `<strong>無法預覽圖片</strong><span>${escapeHtml(readableError(error))}</span>`;
    }
  }

  function imageWorkspaceExportSettings() {
    return {
      format: $("#image-format").value,
      quality: Number($("#image-quality").value) || 0.85,
      maxWidth: Number($("#image-width").value) || null,
      maxHeight: Number($("#image-height").value) || null,
      keepRatio: $("#image-keep-ratio").checked,
      watermarkText: $("#image-watermark").value.trim(),
      watermarkPosition: $("#image-watermark-position").value
    };
  }

  function imageWorkspaceOperation(item, includeRegion = false) {
    return {
      rotation: item.rotation,
      flip: item.flip,
      crop: item.crop,
      ocrRegion: includeRegion ? item.selection : null
    };
  }

  function rotateSelectedImageWorkspaceItem(delta) {
    const item = currentImageWorkspaceItem();
    if (!item) return;
    setSelectedImageWorkspaceRotation((item.rotation + delta + 360) % 360);
  }

  function setSelectedImageWorkspaceRotation(rotation) {
    const item = currentImageWorkspaceItem();
    if (!item || item.rotation === rotation) return;
    const cleared = Boolean(item.crop || item.selection);
    item.rotation = rotation;
    item.crop = null;
    item.selection = null;
    if (cleared) showToast("旋轉後已清除舊裁切與框選，避免座標錯置", "info");
    renderImageWorkspace();
  }

  function setSelectedImageWorkspaceFlip(flip) {
    const item = currentImageWorkspaceItem();
    if (!item || item.flip === flip) return;
    const cleared = Boolean(item.crop || item.selection);
    item.flip = flip;
    item.crop = null;
    item.selection = null;
    if (cleared) showToast("翻轉後已清除舊裁切與框選，避免座標錯置", "info");
    renderImageWorkspace();
  }

  function toggleImageWorkspaceSelectionMode() {
    if (!currentImageWorkspaceItem()) return;
    state.imageWorkspaceSelectionMode = !state.imageWorkspaceSelectionMode;
    $("#image-select-region").classList.toggle("is-active", state.imageWorkspaceSelectionMode);
    renderImageWorkspacePreview();
  }

  function clearImageWorkspaceSelection() {
    const item = currentImageWorkspaceItem();
    if (!item) return;
    item.selection = null;
    positionImageWorkspaceSelectionBox();
    renderImageWorkspace();
  }

  function applyImageWorkspaceCrop() {
    const item = currentImageWorkspaceItem();
    if (!item || !item.selection) return;
    if (!imageWorkspaceSelectionMeetsMinimum(item)) {
      showToast("裁切區域至少需要 8×8 pixels，請重新框選較大區域", "error", 6000);
      return;
    }
    const selection = item.selection;
    if (item.crop) {
      item.crop = {
        x: item.crop.x + selection.x * item.crop.width,
        y: item.crop.y + selection.y * item.crop.height,
        width: selection.width * item.crop.width,
        height: selection.height * item.crop.height
      };
    } else {
      item.crop = { ...selection };
    }
    item.selection = null;
    state.imageWorkspaceSelectionMode = false;
    $("#image-select-region").classList.remove("is-active");
    renderImageWorkspace();
    showToast("已套用非破壞式裁切；原始圖片沒有被修改", "success");
  }

  function resetSelectedImageWorkspaceItem() {
    const item = currentImageWorkspaceItem();
    if (!item) return;
    item.rotation = 0;
    item.flip = "none";
    item.crop = null;
    item.selection = null;
    state.imageWorkspaceSelectionMode = false;
    $("#image-select-region").classList.remove("is-active");
    renderImageWorkspace();
  }

  function bindImageWorkspacePointerSelection() {
    const stage = $("#image-preview-stage");
    let dragStart = null;
    const point = (event) => {
      const canvas = $("#image-preview-canvas");
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))
      };
    };
    stage.addEventListener("pointerdown", (event) => {
      const item = currentImageWorkspaceItem();
      if (!item || !state.imageWorkspaceSelectionMode || $("#image-preview-canvas").hidden) return;
      event.preventDefault();
      dragStart = point(event);
      item.selection = { x: dragStart.x, y: dragStart.y, width: 0, height: 0 };
      stage.setPointerCapture(event.pointerId);
      positionImageWorkspaceSelectionBox();
    });
    stage.addEventListener("pointermove", (event) => {
      const item = currentImageWorkspaceItem();
      if (!dragStart || !item) return;
      const current = point(event);
      item.selection = {
        x: Math.min(dragStart.x, current.x),
        y: Math.min(dragStart.y, current.y),
        width: Math.abs(current.x - dragStart.x),
        height: Math.abs(current.y - dragStart.y)
      };
      positionImageWorkspaceSelectionBox();
    });
    const end = (event) => {
      const item = currentImageWorkspaceItem();
      if (!dragStart || !item) return;
      dragStart = null;
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      if (!item.selection || item.selection.width < 0.005 || item.selection.height < 0.005) item.selection = null;
      renderImageWorkspace();
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    window.addEventListener("resize", positionImageWorkspaceSelectionBox);
  }

  function positionImageWorkspaceSelectionBox() {
    const item = currentImageWorkspaceItem();
    const box = $("#image-selection-box");
    const rectangle = $("#image-selection-rect");
    const canvas = $("#image-preview-canvas");
    if (!item || !item.selection || canvas.hidden) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    rectangle.setAttribute("x", String(item.selection.x * 1000));
    rectangle.setAttribute("y", String(item.selection.y * 1000));
    rectangle.setAttribute("width", String(item.selection.width * 1000));
    rectangle.setAttribute("height", String(item.selection.height * 1000));
  }

  function bindImageWorkspaceDropZone() {
    const stage = $("#image-preview-stage");
    stage.addEventListener("dragover", (event) => {
      event.preventDefault();
      stage.classList.add("drag-over");
    });
    stage.addEventListener("dragleave", () => stage.classList.remove("drag-over"));
    stage.addEventListener("drop", (event) => {
      event.preventDefault();
      stage.classList.remove("drag-over");
      addImageWorkspaceFiles(event.dataTransfer.files || []);
    });
  }

  async function exportImageWorkspace(scope) {
    if (state.imageWorkspaceExporting) return;
    const selected = currentImageWorkspaceItem();
    const items = scope === "current" ? (selected ? [selected] : []) : state.imageWorkspaceItems.slice();
    if (!items.length) {
      showToast("請先加入圖片", "error");
      return;
    }
    const settings = imageWorkspaceExportSettings();
    const extension = extensionFromMime(settings.format);
    if (["tiff", "bmp", "gif"].includes(extension)) {
      await enqueueImageWorkspaceConvert(items, extension, settings);
      return;
    }
    state.imageWorkspaceExporting = true;
    state.imageWorkspaceExportCancelRequested = false;
    $("#image-export-cancel").hidden = false;
    $("#image-export-progress").textContent = `準備匯出 0 / ${items.length} 張圖片…`;
    renderImageWorkspace();
    revokeImageDownloadUrls();
    const container = $("#image-results");
    container.classList.remove("empty");
    container.textContent = "";
    const usedNames = new Map();
    let processed = 0;
    try {
      for (const item of items) {
        if (state.imageWorkspaceExportCancelRequested) break;
        $("#image-export-progress").textContent = `正在匯出第 ${processed + 1} / ${items.length} 張圖片…`;
        try {
          const converted = await convertImage(item.file, {
            ...settings,
            rotation: item.rotation,
            flip: item.flip,
            crop: item.crop,
            selection: null,
            includeRegion: false
          });
          const stem = stripExtension(item.file.name);
          const count = (usedNames.get(stem) || 0) + 1;
          usedNames.set(stem, count);
          const outputName = `${stem}${count > 1 ? ` (${count})` : ""}.${extension}`;
          const url = URL.createObjectURL(converted.blob);
          state.imageDownloads.push({ url, name: outputName });
          container.appendChild(renderImageResult(item.file, converted, url, outputName));
        } catch (error) {
          container.appendChild(renderErrorItem(item.file.name, readableError(error)));
        }
        processed += 1;
        $("#image-export-progress").textContent = `已完成 ${processed} / ${items.length} 張圖片。`;
      }
    } finally {
      const cancelled = state.imageWorkspaceExportCancelRequested;
      state.imageWorkspaceExporting = false;
      state.imageWorkspaceExportCancelRequested = false;
      $("#image-export-cancel").hidden = true;
      $("#image-export-progress").textContent = cancelled
        ? `已取消；保留 ${state.imageDownloads.length} 張成功結果。`
        : `已處理 ${processed} / ${items.length} 張圖片。`;
      renderImageWorkspace();
    }
    state.imageDownloads.forEach((download, index) => {
      window.setTimeout(() => triggerDownload(download.url, download.name), index * 180);
    });
    showToast(`已產生 ${state.imageDownloads.length} 張圖片`, state.imageDownloads.length ? "success" : "error");
  }

  async function enqueueImageWorkspaceConvert(items, extension, settings) {
    if (!backendApiAvailable()) await checkBackendHealth();
    if (!backendApiAvailable()) {
      showToast("TIFF、BMP、GIF 需要 SwiftLocal 桌面本機服務", "error");
      return;
    }
    const payload = new FormData();
    payload.append("type", "image-convert");
    items.forEach((item) => payload.append("files", item.file, item.file.name));
    payload.append("extension", extension);
    payload.append("imageOps", JSON.stringify(items.map((item) => imageWorkspaceOperation(item))));
    payload.append("quality", String(settings.quality));
    payload.append("maxWidth", settings.maxWidth ? String(settings.maxWidth) : "");
    payload.append("maxHeight", settings.maxHeight ? String(settings.maxHeight) : "");
    payload.append("keepRatio", String(settings.keepRatio));
    payload.append("watermarkText", settings.watermarkText);
    payload.append("watermarkPosition", settings.watermarkPosition);
    try {
      await backendFetch("/jobs", { method: "POST", body: payload });
      await refreshBackendJobs();
      showToast("已加入本機圖片匯出佇列", "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  function clearImageWorkspaceOcrResult() {
    state.imageWorkspaceOcrJobId = null;
    state.imageWorkspaceOcrLoadedJobId = null;
    state.imageWorkspaceOcrStatus = "idle";
    state.imageWorkspaceOcrScope = "";
    state.imageWorkspaceOcrText = "";
    state.imageWorkspaceOcrError = "";
  }

  async function startImageWorkspaceOcr(scope) {
    const selected = currentImageWorkspaceItem();
    const items = scope === "all" ? state.imageWorkspaceItems.slice() : selected ? [selected] : [];
    if (!items.length) {
      showToast("請先加入圖片", "error");
      return;
    }
    if (scope === "region" && !selected.selection) {
      showToast("請先按「框選區域」並在預覽上拖曳選取文字", "error", 6000);
      return;
    }
    if (scope === "region" && !imageWorkspaceSelectionMeetsMinimum(selected)) {
      showToast("OCR 框選區域至少需要 8×8 pixels，請重新框選較大區域", "error", 6000);
      return;
    }
    if (!backendApiAvailable()) await checkBackendHealth();
    if (!backendApiAvailable() || !isToolAvailable("tesseract")) {
      state.imageWorkspaceOcrStatus = "failed";
      state.imageWorkspaceOcrError = "這部電腦尚未準備好圖片 OCR。請到「狀態」頁重新檢查 Tesseract。";
      renderImageWorkspaceOcrPanel();
      return;
    }
    const payload = new FormData();
    payload.append("type", "ocr-image");
    items.forEach((item) => payload.append("files", item.file, item.file.name));
    payload.append("language", $("#img-backend-ocr-language").value.trim() || "chi_tra+eng");
    payload.append("imageOps", JSON.stringify(items.map((item) => imageWorkspaceOperation(item, scope === "region"))));
    state.imageWorkspaceOcrStatus = "queued";
    state.imageWorkspaceOcrScope = scope;
    state.imageWorkspaceOcrText = "";
    state.imageWorkspaceOcrError = "";
    state.imageWorkspaceOcrLoadedJobId = null;
    renderImageWorkspaceOcrPanel();
    try {
      const job = await backendFetch("/jobs", { method: "POST", body: payload });
      state.imageWorkspaceOcrJobId = job.id;
      state.imageWorkspaceOcrStatus = job.status || "queued";
      await refreshBackendJobs();
      showToast(scope === "all" ? "已開始辨識全部圖片" : scope === "region" ? "已開始辨識框選區域" : "已開始辨識目前圖片", "success");
    } catch (error) {
      state.imageWorkspaceOcrStatus = "failed";
      state.imageWorkspaceOcrError = workspaceOcrFriendlyError(readableError(error));
      renderImageWorkspaceOcrPanel();
    }
  }

  async function syncImageWorkspaceOcrJob(jobs) {
    if (!state.imageWorkspaceOcrJobId) return;
    const job = jobs.find((item) => item.id === state.imageWorkspaceOcrJobId);
    if (!job) return;
    state.imageWorkspaceOcrStatus = job.status;
    if (job.status === "failed") {
      state.imageWorkspaceOcrError = workspaceOcrFriendlyError(job.error || "");
    } else if (job.status === "cancelled") {
      state.imageWorkspaceOcrError = "辨識已取消，原始圖片沒有被修改。";
    } else if (job.status === "done" && state.imageWorkspaceOcrLoadedJobId !== job.id) {
      state.imageWorkspaceOcrLoadedJobId = job.id;
      try {
        const outputs = await readPdfWorkspaceOcrOutputs(job);
        const namesByOutput = new Map((job.itemResults || []).map((item) => [item.outputName, item.name]));
        const text = outputs.map((output) => {
          const value = String(output.text || "").trim();
          const sourceName = namesByOutput.get(output.name) || output.name;
          return outputs.length > 1 ? `=== ${sourceName} ===\n${value}` : value;
        }).filter(Boolean).join("\n\n");
        if (!text) throw new Error("OCR 結果為空");
        state.imageWorkspaceOcrText = `${text}\n`;
        const failed = (job.itemResults || []).filter((item) => item.status === "failed");
        state.imageWorkspaceOcrError = failed.length
          ? `${failed.length} 張圖片未完成：${failed.map((item) => item.name).join("、")}`
          : "";
      } catch (error) {
        state.imageWorkspaceOcrStatus = "failed";
        state.imageWorkspaceOcrError = workspaceOcrFriendlyError(readableError(error));
      }
    }
    renderImageWorkspaceOcrPanel(job);
  }

  function renderImageWorkspaceOcrPanel(job = null) {
    const active = state.imageWorkspaceOcrStatus === "queued" || state.imageWorkspaceOcrStatus === "running";
    const hasText = Boolean(state.imageWorkspaceOcrText);
    const hasError = Boolean(state.imageWorkspaceOcrError);
    const labels = { idle: "尚未辨識", queued: "排隊中", running: "辨識中", done: "已完成", failed: "未能辨識", cancelled: "已取消" };
    $("#image-ocr-panel").classList.toggle("processing", active);
    $("#image-ocr-status").textContent = labels[state.imageWorkspaceOcrStatus] || "尚未辨識";
    let progress = "選擇圖片後，可辨識目前圖片、全部圖片或框選區域。";
    if (state.imageWorkspaceOcrStatus === "queued") progress = "OCR 已加入本機佇列，等待開始。";
    if (state.imageWorkspaceOcrStatus === "running") progress = job && job.progress && job.progress.message ? job.progress.message : "正在本機辨識圖片文字。";
    if (state.imageWorkspaceOcrStatus === "done") progress = job && job.progress && job.progress.message ? job.progress.message : "辨識完成。";
    if (state.imageWorkspaceOcrStatus === "failed") progress = "辨識未完成；技術詳情已保留在任務紀錄。";
    if (state.imageWorkspaceOcrStatus === "cancelled") progress = "辨識已取消。";
    $("#image-ocr-progress").textContent = progress;
    $("#image-ocr-error").hidden = !hasError;
    $("#image-ocr-error").textContent = state.imageWorkspaceOcrError;
    $("#image-ocr-text").hidden = !hasText;
    $("#image-ocr-text").value = state.imageWorkspaceOcrText;
    $("#image-ocr-empty").hidden = hasText || hasError;
    $("#image-ocr-empty").textContent = active ? "正在本機辨識文字…" : "辨識結果會直接顯示在這裡。";
    $("#image-ocr-copy").disabled = !hasText;
    $("#image-ocr-export").disabled = !hasText;
    $("#image-ocr-clear").disabled = !hasText && !hasError && !state.imageWorkspaceOcrJobId;
    $("#image-ocr-cancel").hidden = !active;
    updateImageWorkspaceAvailability();
  }

  function updateImageWorkspaceAvailability() {
    const selected = currentImageWorkspaceItem();
    const active = state.imageWorkspaceOcrStatus === "queued" || state.imageWorkspaceOcrStatus === "running";
    const ocrReady = backendApiAvailable() && isToolAvailable("tesseract");
    const advancedFormatReady = backendApiAvailable();
    const ffmpegImageReady = advancedFormatReady && (!electronBridgeAvailable() || isToolAvailable("ffmpeg"));
    $("#image-ocr-current").disabled = !selected || active || !ocrReady;
    $("#image-ocr-all").disabled = !state.imageWorkspaceItems.length || active || !ocrReady;
    $("#image-ocr-region").disabled = !selected || !selected.selection || active || !ocrReady;
    $$('[data-requires-image-backend]').forEach((option) => { option.disabled = !advancedFormatReady; });
    $$('[data-requires-image-ffmpeg]').forEach((option) => { option.disabled = !ffmpegImageReady; });
    const extension = extensionFromMime($("#image-format").value);
    if ((!advancedFormatReady && ["tiff", "bmp", "gif"].includes(extension)) || (!ffmpegImageReady && ["tiff", "bmp"].includes(extension))) {
      $("#image-format").value = "image/jpeg";
    }
    $("#image-advanced-format-note").textContent = !advancedFormatReady
      ? "靜態模式可匯出 JPEG、PNG、WebP；TIFF、BMP、GIF 需要 SwiftLocal 本機服務。"
      : !ffmpegImageReady
        ? "JPEG、PNG、WebP、GIF 可用；TIFF、BMP 需先在「狀態」頁準備 FFmpeg。"
        : "所有圖片輸出格式已就緒；原檔永不覆寫。";
    if (state.imageWorkspaceOcrStatus === "idle") {
      if (ocrReady) {
        $("#image-ocr-progress").textContent = "選擇圖片後，可辨識目前圖片、全部圖片或框選區域。";
      } else if (!backendApiAvailable()) {
        $("#image-ocr-progress").textContent = "靜態模式可編輯及匯出 JPEG／PNG／WebP；OCR 需要 SwiftLocal 桌面本機服務。";
      } else if (!isToolAvailable("tesseract")) {
        $("#image-ocr-progress").textContent = "OCR 暫停使用：本機尚未偵測到 Tesseract，請到「狀態」頁重新檢查。";
      }
    }
  }

  function imageWorkspaceSelectionMeetsMinimum(item) {
    if (!item || !item.selection || !item.sourceWidth || !item.sourceHeight) return false;
    const sideways = item.rotation === 90 || item.rotation === 270;
    let width = sideways ? item.sourceHeight : item.sourceWidth;
    let height = sideways ? item.sourceWidth : item.sourceHeight;
    if (item.crop) {
      width *= item.crop.width;
      height *= item.crop.height;
    }
    return item.selection.width * width >= 8 && item.selection.height * height >= 8;
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
    const officeFormat = $("#pdf-office-format");
    if (officeFormat) {
      officeFormat.addEventListener("change", () => {
        updatePdfOfficeFormatNote($("#pdf-mode").value);
      });
    }
    const compatOnly = $("#pdf-office-compat-only");
    if (compatOnly) {
      compatOnly.addEventListener("change", () => {
        updatePdfOfficeFormatNote($("#pdf-mode").value);
      });
    }
    const scanOcr = $("#pdf-office-scan-ocr");
    if (scanOcr) {
      scanOcr.addEventListener("change", () => {
        updatePdfOfficeFormatNote($("#pdf-mode").value);
      });
    }
    const ocrOut = $("#pdf-office-ocr-output");
    if (ocrOut) {
      ocrOut.addEventListener("change", () => {
        updatePdfOfficeFormatNote($("#pdf-mode").value);
      });
    }
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
    const showSearchablePdf = mode === "pdf-to-searchable-pdf";
    const showOcr = mode === "ocr-pdf" || showSearchablePdf;
    const showPassword = mode === "pdf-encrypt" || mode === "pdf-decrypt";
    $(".pdf-range-controls").style.display = showRange ? "" : "none";
    $("#pdf-rotation").closest("label").style.display = showRotation ? "" : "none";
    $(".pdf-watermark-controls").style.display = showWatermark ? "" : "none";
    $(".pdf-image-controls").style.display = showImages ? "" : "none";
    $(".pdf-pagenumber-controls").style.display = showPageNumbers ? "" : "none";
    $(".pdf-office-format-controls").style.display = showOfficeFormat ? "" : "none";
    const officeAdvanced = $("#pdf-office-advanced");
    if (officeAdvanced) {
      officeAdvanced.hidden = !showOfficeFormat;
      if (!showOfficeFormat) officeAdvanced.open = false;
    }
    const scanRow = $("#pdf-office-scan-row");
    const langRow = $("#pdf-office-ocr-lang-row");
    const ocrAdv = $("#pdf-ocr-advanced");
    if (scanRow) {
      const fmt = ($("#pdf-office-format") && $("#pdf-office-format").value) || "docx";
      const showScan = showOfficeFormat && fmt === "docx";
      scanRow.hidden = !showScan;
      if (langRow) langRow.hidden = !showScan;
    }
    $(".pdf-ocr-controls").style.display = showOcr ? "" : "none";
    if (ocrAdv) ocrAdv.hidden = !showOcr;
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
    updatePdfSectionNavigation(mode);
    renderPdfOrderList("#pdf-merge-order", "pdfFiles");
    renderPdfWorkspace();
  }

  function updatePdfSectionNavigation(mode) {
    let section = "convert";
    if (mode === "workspace" || ["merge", "split", "extract", "rotate", "watermark", "page-numbers"].includes(mode)) section = "pages";
    if (["pdf-compress", "pdf-encrypt", "pdf-decrypt"].includes(mode)) section = "protect";
    $$("#pdf-panel .pdf-section-nav button").forEach((button) => {
      const buttonMode = button.dataset.pdfMode || "";
      const buttonSection = buttonMode === "workspace" ? "pages" : buttonMode === "pdf-compress" ? "protect" : buttonMode ? "convert" : "reader";
      const active = buttonSection === section;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
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
      "pdf-to-office": isToolAvailable("libreOffice") || isToolAvailable("pdf2docx")
        ? "先嘗試以 LibreOffice 保留版面；DOCX 失敗可自動相容模式，也可勾選直接相容模式。XLSX／PPTX／ODT 為實驗性。"
        : "需要 LibreOffice 或 pdf2docx 相容引擎；請到「狀態」頁檢查。",
      "pdf-to-searchable-pdf": isToolAvailable("tesseract")
        ? "把掃描／影像型 PDF 建成可搜尋 PDF（OCR 文字層），輸出 *_ocr_searchable.pdf。預設語言 chi_tra+eng。"
        : "此工作需要 Tesseract；目前未偵測到，請到「狀態」頁檢查。",
      "ocr-pdf": isToolAvailable("tesseract")
        ? "適合掃描文件；程式會逐頁辨識文字並輸出 TXT。預設語言 chi_tra+eng。"
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
    updatePdfOfficeFormatNote(mode);
  }

  function updatePdfOfficeFormatNote(mode) {
    const note = $("#pdf-office-format-note");
    if (!note) return;
    const compatLabel = $("#pdf-office-compat-label");
    const compatCheck = $("#pdf-office-compat-only");
    if (mode !== "pdf-to-office") {
      note.hidden = true;
      note.textContent = "";
      if (compatLabel) compatLabel.style.display = "none";
      return;
    }
    const format = ($("#pdf-office-format") && $("#pdf-office-format").value) || "docx";
    note.hidden = false;
    if (compatLabel) {
      compatLabel.style.display = format === "docx" ? "" : "none";
    }
    const scanRow = $("#pdf-office-scan-row");
    const langRow = $("#pdf-office-ocr-lang-row");
    if (scanRow) scanRow.hidden = format !== "docx";
    if (langRow) langRow.hidden = format !== "docx";
    if (format === "docx") {
      const direct = Boolean(compatCheck && compatCheck.checked);
      const scanMode = ($("#pdf-office-scan-ocr") && $("#pdf-office-scan-ocr").value) || "auto";
      const ocrOut = ($("#pdf-office-ocr-output") && $("#pdf-office-ocr-output").value) || "both";
      let scanHint = "掃描件：文字很少時 OCR（需 Tesseract）。";
      if (scanMode === "force") scanHint = "一律 OCR（需 Tesseract）。";
      if (scanMode === "off") scanHint = "已關閉掃描 OCR。";
      let outHint = "輸出：可搜尋 PDF + DOCX。";
      if (ocrOut === "searchable") outHint = "輸出：僅可搜尋 PDF（不轉 DOCX）。";
      if (ocrOut === "docx") outHint = "輸出：僅 DOCX（成功後移除中間 PDF）。";
      note.textContent = direct
        ? `將直接使用相容／OCR 管線（略過 LibreOffice）。${scanHint}${outHint}`
        : `先嘗試 LibreOffice；失敗後相容／OCR。${scanHint}${outHint}`;
    } else {
      if (compatCheck) compatCheck.checked = false;
      note.textContent = "實驗性轉換：PDF 並非原始 Office 文件，版面及內容結構可能不完整。正式用途請選 DOCX。";
    }
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
    clearPdfWorkspaceOcrResult();
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
      clearPdfWorkspaceOcrResult();
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
          await pdfPage.render({ canvas, viewport }).promise;
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
    $("#pdf-workspace-ocr-page").addEventListener("click", () => startPdfWorkspaceOcr("page"));
    $("#pdf-workspace-ocr-document").addEventListener("click", () => startPdfWorkspaceOcr("document"));
    $("#pdf-workspace-ocr-copy").addEventListener("click", async () => {
      await copyText(state.pdfWorkspaceOcrText);
      showToast("已複製辨識文字", "success");
    });
    $("#pdf-workspace-ocr-export").addEventListener("click", () => {
      if (!state.pdfWorkspaceOcrText) return;
      const stem = (state.pdfWorkspaceOcrFileName || "pdf").replace(/\.pdf$/i, "");
      const suffix = state.pdfWorkspaceOcrScope === "page" ? "_current-page" : "";
      downloadText(state.pdfWorkspaceOcrText, `${stem}${suffix}_ocr.txt`);
    });
    $("#pdf-workspace-ocr-clear").addEventListener("click", () => {
      clearPdfWorkspaceOcrResult();
      renderPdfWorkspaceOcrPanel();
    });
    $("#pdf-workspace-ocr-cancel").addEventListener("click", async () => {
      if (state.pdfWorkspaceOcrJobId) await cancelBackendJob(state.pdfWorkspaceOcrJobId);
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

  function clearPdfWorkspaceOcrResult() {
    state.pdfWorkspaceOcrJobId = null;
    state.pdfWorkspaceOcrLoadedJobId = null;
    state.pdfWorkspaceOcrStatus = "idle";
    state.pdfWorkspaceOcrScope = "";
    state.pdfWorkspaceOcrFileName = "";
    state.pdfWorkspaceOcrText = "";
    state.pdfWorkspaceOcrError = "";
  }

  function selectedPdfWorkspaceSource() {
    const page = state.pdfWorkspacePages.find((item) => item.id === state.pdfWorkspaceSelectedId);
    if (!page || page.blank || !page.sourceFile) return null;
    const sourcePages = state.pdfWorkspacePages.filter((item) => item.sourceId === page.sourceId && !item.blank);
    return { page, sourcePages };
  }

  async function startPdfWorkspaceOcr(scope) {
    const selection = selectedPdfWorkspaceSource();
    if (!selection) {
      showToast("請先選擇一個 PDF 頁面", "error");
      return;
    }
    if (!backendApiAvailable()) await checkBackendHealth();
    if (!backendApiAvailable()) {
      showToast("OCR 需要 SwiftLocal 桌面本機服務", "error");
      return;
    }
    if (!isToolAvailable("tesseract")) {
      state.pdfWorkspaceOcrError = "這部電腦尚未準備好 OCR。請到「狀態」頁重新檢查本機工具。";
      state.pdfWorkspaceOcrStatus = "failed";
      renderPdfWorkspaceOcrPanel();
      return;
    }
    const tesseract = state.detectedTools && state.detectedTools.tesseract;
    if (tesseract && tesseract.languages && tesseract.hasChiTra === false) {
      state.pdfWorkspaceOcrError = "缺少繁體中文辨識資料（chi_tra）。請先在 Full／Portable 資源中補齊語言包。";
      state.pdfWorkspaceOcrStatus = "failed";
      renderPdfWorkspaceOcrPanel();
      return;
    }
    const sourcePageCount = new Set(selection.sourcePages.map((item) => item.pageIndex)).size;
    if (scope === "document" && sourcePageCount > 100) {
      showToast("整份 PDF OCR 一次最多 100 頁；請先拆分文件。", "error", 6000);
      return;
    }

    const payload = new FormData();
    payload.append("type", "ocr-pdf");
    payload.append("files", selection.page.sourceFile, selection.page.sourceFile.name);
    payload.append("language", "chi_tra+eng");
    payload.append("maxPages", String(Math.max(1, sourcePageCount)));
    if (scope === "page") payload.append("pages", String(selection.page.pageIndex + 1));

    state.pdfWorkspaceOcrStatus = "queued";
    state.pdfWorkspaceOcrScope = scope;
    state.pdfWorkspaceOcrFileName = selection.page.fileName;
    state.pdfWorkspaceOcrText = "";
    state.pdfWorkspaceOcrError = "";
    state.pdfWorkspaceOcrLoadedJobId = null;
    renderPdfWorkspaceOcrPanel();
    try {
      const job = await backendFetch("/jobs", { method: "POST", body: payload });
      state.pdfWorkspaceOcrJobId = job.id;
      state.pdfWorkspaceOcrStatus = job.status || "queued";
      renderPdfWorkspaceOcrPanel();
      await refreshBackendJobs();
      showToast(scope === "page" ? "已開始辨識目前頁面" : "已開始辨識整份 PDF", "success");
    } catch (error) {
      state.pdfWorkspaceOcrStatus = "failed";
      state.pdfWorkspaceOcrError = workspaceOcrFriendlyError(readableError(error));
      renderPdfWorkspaceOcrPanel();
    }
  }

  function workspaceOcrFriendlyError(errorText) {
    const parts = splitJobErrorParts(errorText);
    const summary = parts.summary || "無法辨識此 PDF，請確認文件包含可讀取的掃描頁面。";
    return parts.suggestion ? `${summary}\n建議：${parts.suggestion}` : summary;
  }

  async function readPdfWorkspaceOcrOutputs(job) {
    if (electronBridgeAvailable() && typeof window.swiftLocalBackend.readJobTextOutputs === "function") {
      return window.swiftLocalBackend.readJobTextOutputs(job.id);
    }
    const outputs = (job.outputPaths || []).filter((item) => item.url && /\.txt$/i.test(item.name || ""));
    const token = await getBackendSessionToken();
    const results = [];
    for (const output of outputs) {
      const response = await fetch(`${BACKEND_ORIGIN}${output.url}`, {
        headers: { "X-SwiftLocal-Token": token }
      });
      if (!response.ok) throw new Error("無法讀取 OCR 文字結果");
      results.push({ name: output.name, text: await response.text() });
    }
    return results;
  }

  async function syncPdfWorkspaceOcrJob(jobs) {
    if (!state.pdfWorkspaceOcrJobId) return;
    const job = jobs.find((item) => item.id === state.pdfWorkspaceOcrJobId);
    if (!job) return;
    state.pdfWorkspaceOcrStatus = job.status;
    if (job.status === "failed") {
      state.pdfWorkspaceOcrError = workspaceOcrFriendlyError(job.error || "");
    } else if (job.status === "cancelled") {
      state.pdfWorkspaceOcrError = "辨識已取消，原始 PDF 沒有被修改。";
    } else if (job.status === "done" && state.pdfWorkspaceOcrLoadedJobId !== job.id) {
      state.pdfWorkspaceOcrLoadedJobId = job.id;
      try {
        const outputs = await readPdfWorkspaceOcrOutputs(job);
        const text = outputs.map((item) => {
          const value = String(item.text || "").trim();
          return outputs.length > 1 ? `=== ${item.name} ===\n${value}` : value;
        }).filter(Boolean).join("\n\n");
        if (!text) throw new Error("OCR 結果為空");
        state.pdfWorkspaceOcrText = `${text}\n`;
        state.pdfWorkspaceOcrError = "";
      } catch (error) {
        state.pdfWorkspaceOcrStatus = "failed";
        state.pdfWorkspaceOcrError = workspaceOcrFriendlyError(readableError(error));
      }
    }
    renderPdfWorkspaceOcrPanel(job);
  }

  function renderPdfWorkspaceOcrPanel(job = null) {
    const panel = $("#pdf-workspace-ocr-panel");
    if (!panel) return;
    const selection = selectedPdfWorkspaceSource();
    const active = state.pdfWorkspaceOcrStatus === "queued" || state.pdfWorkspaceOcrStatus === "running";
    const hasText = Boolean(state.pdfWorkspaceOcrText);
    const hasError = Boolean(state.pdfWorkspaceOcrError);
    const statusLabels = {
      idle: "尚未辨識",
      queued: "排隊中",
      running: "辨識中",
      done: "已完成",
      failed: "未能辨識",
      cancelled: "已取消"
    };
    panel.classList.toggle("processing", active);
    panel.classList.toggle("empty", !hasText && !hasError);
    $("#pdf-workspace-ocr-status").textContent = statusLabels[state.pdfWorkspaceOcrStatus] || "尚未辨識";
    $("#pdf-workspace-ocr-scope").textContent = state.pdfWorkspaceOcrScope === "page"
      ? `${state.pdfWorkspaceOcrFileName} · 目前頁面 · 繁體中文 + English`
      : state.pdfWorkspaceOcrScope === "document"
        ? `${state.pdfWorkspaceOcrFileName} · 整份 PDF · 繁體中文 + English`
        : "繁體中文 + English";

    let progressText = "選擇頁面後，可直接辨識目前頁面或整份 PDF。";
    if (state.pdfWorkspaceOcrStatus === "queued") progressText = "OCR 已加入本機佇列，等待開始。";
    if (state.pdfWorkspaceOcrStatus === "running") {
      const progress = job && job.progress;
      progressText = progress && progress.message ? progress.message : "正在辨識，PDF 工作區仍可繼續瀏覽。";
    }
    if (state.pdfWorkspaceOcrStatus === "done") progressText = "辨識完成，文字可直接選取、複製或匯出。";
    if (state.pdfWorkspaceOcrStatus === "failed") progressText = "辨識未完成；技術詳情已保留在任務紀錄。";
    if (state.pdfWorkspaceOcrStatus === "cancelled") progressText = "辨識已取消。";
    $("#pdf-workspace-ocr-progress").textContent = progressText;

    const error = $("#pdf-workspace-ocr-error");
    error.hidden = !hasError;
    error.textContent = state.pdfWorkspaceOcrError;
    const textArea = $("#pdf-workspace-ocr-text");
    textArea.hidden = !hasText;
    textArea.value = state.pdfWorkspaceOcrText;
    const empty = $("#pdf-workspace-ocr-empty");
    empty.hidden = hasText || hasError;
    empty.textContent = active ? "正在本機辨識文字…" : "OCR 完成後，文字會直接顯示在這裡。";
    $("#pdf-workspace-ocr-copy").disabled = !hasText;
    $("#pdf-workspace-ocr-export").disabled = !hasText;
    $("#pdf-workspace-ocr-clear").disabled = !hasText && !hasError && !state.pdfWorkspaceOcrJobId;
    $("#pdf-workspace-ocr-cancel").hidden = !active;
    $("#pdf-workspace-ocr-page").disabled = state.pdfWorkspaceLoading || active || !selection;
    $("#pdf-workspace-ocr-document").disabled = state.pdfWorkspaceLoading || active || !selection;
  }

  function pdfRotationClass(rotation) {
    const normalized = ((Number(rotation) % 360) + 360) % 360;
    return `pdf-rotation-${[0, 90, 180, 270].includes(normalized) ? normalized : 0}`;
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
    renderPdfWorkspaceOcrPanel();
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
        : `<img src="${page.thumbnail}" alt="${escapeHtml(page.fileName)} 第 ${page.pageIndex + 1} 頁預覽" class="${rotation === 90 || rotation === 270 ? "is-sideways " : ""}${pdfRotationClass(rotation)}">`;
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
      stage.innerHTML = `<div class="pdf-live-preview-blank ${pdfRotationClass(rotation)}"><span>空白頁</span></div>`;
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
      await pdfPage.render({ canvas, viewport }).promise;
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
    stage.innerHTML = `<img src="${imageUrl}" alt="${escapeHtml(page.fileName)} 第 ${page.pageIndex + 1} 頁即時預覽" class="${rotation === 90 || rotation === 270 ? "is-sideways " : ""}${pdfRotationClass(rotation)}">`;
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
      await page.render({ canvas, viewport }).promise;
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
      enableScripting: false,
      isEvalSupported: false,
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
    updateImageWorkspaceAvailability();
  }

  function bindMediaDownloader() {
    if (!window.SwiftLocalMediaDownloader || typeof window.SwiftLocalMediaDownloader.mount !== "function") return;
    mediaDownloader = window.SwiftLocalMediaDownloader.mount({
      api: window.swiftLocalBackend || null,
      desktopAvailable: electronBridgeAvailable(),
      showToast
    });
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
      state.backendJobs = [];
      renderGlobalTaskCenter();
      renderBackendJobs([]);
      renderPanelBackendJobs("#pdf-backend-jobs", "#pdf-backend-status", [], PDF_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#img-backend-jobs", "#img-backend-status", [], IMG_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#media-backend-jobs", "#media-backend-status", [], MEDIA_BACKEND_JOB_TYPES);
      renderSystemStatusDashboard("offline");
    }
  }

  function maybeShowReadyWelcome(tools) {
    try {
      if (sessionStorage.getItem("swiftlocal_ready_welcome") === "1") return;
    } catch {
      // ignore
    }
    if (!tools) return;
    const keys = ["ffmpeg", "tesseract", "qpdf"];
    const ready = keys.filter((k) => tools[k] && tools[k].available).length;
    const hasChi =
      tools.tesseract &&
      (tools.tesseract.hasChiTra === true ||
        (typeof tools.tesseract.languages === "string" &&
          tools.tesseract.languages.split(",").includes("chi_tra")));
    if (ready >= 2) {
      const ocrNote = hasChi ? "繁中 OCR 已就緒。" : "OCR 可用（若缺繁中包會自動改用英文）。";
      showToast(`已就緒：選好檔案即可轉換。${ocrNote}`, "success", 5000);
      try {
        sessionStorage.setItem("swiftlocal_ready_welcome", "1");
      } catch {
        // ignore
      }
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
      maybeShowReadyWelcome(tools);
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
      ["libreOffice", "LibreOffice", "Office 轉 PDF、PDF → Office（嘗試保留版面）"],
      ["pdf2docx", "PDF→DOCX 相容引擎", "LibreOffice 失敗時自動建立 DOCX（版面可能不同）"],
      ["ffmpeg", "FFmpeg", "影音及進階圖片轉換"],
      ["tesseract", "Tesseract", "圖片及掃描 PDF 文字辨識"],
      ["qpdf", "QPDF", "PDF 加密、解密及安全處理"]
    ];

    container.innerHTML = "";
    items.forEach(([key, label, purpose]) => {
      const tool = tools && tools[key];
      const available = Boolean(tool && tool.available);
      const optional = (key === "libreOffice" || key === "pdf2docx") && !available && backendApiAvailable();
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
    updateImageWorkspaceAvailability();
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
    renderCapabilityStatus("#capability-pdf2docx", checking, connected && Boolean(tools.pdf2docx && tools.pdf2docx.available), "相容引擎已就緒（pdf2docx）", "未安裝 pdf2docx（見 backend/requirements.txt）");
    renderCapabilityStatus("#capability-media", checking, connected && Boolean(tools.ffmpeg && tools.ffmpeg.available), "FFmpeg 已就緒", "需要 FFmpeg");
    {
      const tess = tools.tesseract;
      const tessOk = connected && Boolean(tess && tess.available);
      const hasChi = Boolean(tess && (tess.hasChiTra === true || (typeof tess.languages === "string" && tess.languages.split(",").includes("chi_tra"))));
      renderCapabilityStatus(
        "#capability-ocr",
        checking,
        tessOk,
        hasChi ? "Tesseract 已就緒（含繁中 chi_tra）" : tessOk ? "Tesseract 可用，但缺少 chi_tra 繁中包" : "需要 Tesseract",
        "需要 Tesseract"
      );
    }
    renderCapabilityStatus("#capability-security", checking, connected && Boolean(tools.qpdf && tools.qpdf.available), "QPDF 已就緒", "需要 QPDF");
    updateProductHubReadiness(tools, connected, checking);
  }

  function updateProductHubReadiness(tools, connected, checking) {
    if (checking) {
      setHubReadiness("#ocr-hub-readiness", "pending", "正在檢查 OCR", "確認本機服務、Tesseract 與繁中語言包。");
      setHubReadiness("#office-hub-readiness", "pending", "正在檢查 Office 引擎", "確認本機服務、LibreOffice 與 DOCX 相容引擎。");
      return;
    }
    if (!connected) {
      setHubReadiness("#ocr-hub-readiness", "offline", "OCR 需要桌面本機服務", "瀏覽器工具仍可用；啟動桌面版或本機服務後可執行批量 OCR。");
      setHubReadiness("#office-hub-readiness", "offline", "Office 轉換需要桌面本機服務", "啟動桌面版或本機服務後，程式會偵測 LibreOffice 與相容引擎。");
      return;
    }

    const tess = tools.tesseract || {};
    const tessReady = Boolean(tess.available);
    const languages = typeof tess.languages === "string" ? tess.languages.split(",") : [];
    const hasChi = tess.hasChiTra === true || languages.includes("chi_tra");
    const hasEng = tess.hasEng === true || languages.includes("eng");
    if (tessReady && hasChi && hasEng) {
      setHubReadiness("#ocr-hub-readiness", "ready", "OCR 已就緒", "Tesseract 與 chi_tra+eng 語言包均可使用。");
    } else if (tessReady) {
      setHubReadiness("#ocr-hub-readiness", "warning", "OCR 可用，但語言包不完整", hasChi ? "缺少英文語言包；任務會按可用語言 fallback。" : "缺少 chi_tra 繁中語言包；請到狀態與修復補齊。");
    } else {
      setHubReadiness("#ocr-hub-readiness", "missing", "尚未偵測到 Tesseract", "請檢查內建工具、指定路徑或重新偵測。");
    }

    const libreOfficeReady = Boolean(tools.libreOffice && tools.libreOffice.available);
    const compatReady = Boolean(tools.pdf2docx && tools.pdf2docx.available);
    if (libreOfficeReady) {
      setHubReadiness("#office-hub-readiness", "ready", "Office 轉換已就緒", compatReady ? "LibreOffice 與 DOCX 相容 fallback 均可使用。" : "LibreOffice 可使用；DOCX 相容 fallback 尚未偵測到。");
    } else if (compatReady) {
      setHubReadiness("#office-hub-readiness", "warning", "只有 PDF → Word 相容模式可用", "Office → PDF 仍需要 LibreOffice；請到狀態與修復設定。");
    } else {
      setHubReadiness("#office-hub-readiness", "missing", "尚未偵測到 Office 轉換引擎", "Office → PDF 需要 LibreOffice；PDF → Word 可另裝相容引擎。");
    }
  }

  function toolAreaLabel(panelId) {
    if (["pdf-hub-panel", "pdf-panel", "pdf-reader-panel"].includes(panelId)) return "PDF";
    if (panelId === "ocr-panel") return "OCR";
    if (panelId === "office-panel") return "Office";
    if (panelId === "image-panel") return "圖片";
    if (["media-panel", "media-download-panel"].includes(panelId)) return "影音";
    if (["tasks-panel", "workflow-panel", "presets-panel"].includes(panelId)) return "共用能力";
    if (panelId === "backend-panel") return "系統";
    return "其他工具";
  }

  function setHubReadiness(selector, status, title, detail) {
    const row = $(selector);
    if (!row) return;
    const icons = { ready: "✓", warning: "!", missing: "×", offline: "!", pending: "○" };
    row.className = `hub-readiness ${status}`;
    row.querySelector(".hub-readiness-icon").textContent = icons[status] || "○";
    row.querySelector("strong").textContent = title;
    row.querySelector("small").textContent = detail;
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
      let text = source ? `${source} · ${version}` : version;
      if (key === "tesseract") {
        const hasChi = tool.hasChiTra === true || (typeof tool.languages === "string" && tool.languages.split(",").includes("chi_tra"));
        const hasEng = tool.hasEng === true || (typeof tool.languages === "string" && tool.languages.split(",").includes("eng"));
        if (hasChi && hasEng) {
          text += " · 語言：chi_tra+eng 已就緒";
        } else if (typeof tool.languages === "string" && tool.languages) {
          text += ` · 語言：${escapeHtml(tool.languages.split(",").slice(0, 8).join(", "))}`;
          if (!hasChi) text += "（缺 chi_tra）";
        } else if (!hasChi) {
          text += " · 警告：未偵測到 chi_tra 繁中語言包";
        }
      }
      return text;
    }
    if (!backendApiAvailable()) {
      return "後端未啟動";
    }
    if (key === "libreOffice") {
      return "此功能需要 LibreOffice";
    }
    if (key === "pdf2docx") {
      return "DOCX 自動 fallback 不可用";
    }
    return "未找到內建工具，請確認打包內容";
  }

  function toolGuidanceText(key, tool) {
    if (key === "pdf2docx") {
      if (tool && tool.available) {
        return "PDF → Office 選 DOCX 時，若 LibreOffice 失敗會自動改用此相容引擎。";
      }
      if (!backendApiAvailable()) return "";
      return "請安裝 backend/requirements.txt（含 pdf2docx），Standard／Full 打包版應已內建。";
    }
    if (key !== "libreOffice") {
      return "";
    }
    if (tool && tool.available) {
      return "Office → PDF 與 PDF → Office 依賴 LibreOffice。DOCX 失敗時可自動改用相容引擎。";
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
    if (source === "python") return "Python 套件";
    return "";
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
    const officeExt = ($("#pdf-office-format") && $("#pdf-office-format").value) || "docx";
    const docxCompatOnly = Boolean($("#pdf-office-compat-only") && $("#pdf-office-compat-only").checked);
    const ocrOutOnly = ($("#pdf-office-ocr-output") && $("#pdf-office-ocr-output").value) || "both";
    const searchableOnly = officeExt === "docx" && ocrOutOnly === "searchable";
    const pdfToOfficeNeedsLibre =
      type === "pdf-to-office" && !(officeExt === "docx" && (docxCompatOnly || searchableOnly));
    if ((type === "office-to-pdf" || pdfToOfficeNeedsLibre) && !isToolAvailable("libreOffice")) {
      setStatus("#pdf-backend-status", "缺少 LibreOffice");
      showToast("此功能需要 LibreOffice。請安裝或更新 LibreOffice，然後重新偵測工具。", "error");
      return;
    }
    if (type === "pdf-to-office" && searchableOnly && !isToolAvailable("tesseract")) {
      setStatus("#pdf-backend-status", "缺少 Tesseract");
      showToast("僅可搜尋 PDF 需要 Tesseract。請到「狀態」頁檢查。", "error");
      return;
    }
    if (type === "pdf-to-office" && officeExt === "docx" && docxCompatOnly && !searchableOnly && !isToolAvailable("pdf2docx") && !isToolAvailable("tesseract")) {
      setStatus("#pdf-backend-status", "缺少相容引擎");
      showToast("DOCX 相容模式需要 pdf2docx 或 Tesseract OCR。", "error");
      return;
    }
    if ((type === "ocr-pdf" || type === "pdf-to-searchable-pdf") && !isToolAvailable("tesseract")) {
      setStatus("#pdf-backend-status", "缺少 Tesseract");
      showToast(type === "pdf-to-searchable-pdf"
        ? "可搜尋 PDF 需要 Tesseract。請到「狀態」頁檢查。"
        : "PDF OCR 需要 Tesseract。請確認內建工具或重新偵測。", "error");
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
    if (type === "pdf-to-office") {
      const ext = $("#pdf-office-format").value || "docx";
      payload.append("extension", ext);
      const compat = Boolean($("#pdf-office-compat-only") && $("#pdf-office-compat-only").checked);
      payload.append("docxEngine", compat && ext === "docx" ? "compat" : "auto");
      if (ext === "docx") {
        payload.append("scanOcr", ($("#pdf-office-scan-ocr") && $("#pdf-office-scan-ocr").value) || "auto");
        payload.append("ocrOutput", ($("#pdf-office-ocr-output") && $("#pdf-office-ocr-output").value) || "both");
        payload.append("language", ($("#pdf-office-ocr-language") && $("#pdf-office-ocr-language").value.trim()) || "chi_tra+eng");
        payload.append("maxPages", ($("#pdf-ocr-max-pages") && $("#pdf-ocr-max-pages").value) || "50");
      }
    }
    if (type === "pdf-to-searchable-pdf" || type === "ocr-pdf") {
      payload.append("language", ($("#pdf-ocr-language") && $("#pdf-ocr-language").value.trim()) || "chi_tra+eng");
      payload.append("maxPages", ($("#pdf-ocr-max-pages") && $("#pdf-ocr-max-pages").value) || "50");
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
    // Opportunistic maintenance when the UI is polling / opening task views.
    if (!state._cleanupScheduled) {
      state._cleanupScheduled = true;
      window.setTimeout(() => {
        state._cleanupScheduled = false;
        autoCleanupJobsQuietly();
      }, 1500);
    }
    if (!backendApiAvailable()) {
      await checkBackendHealth();
      return;
    }
    try {
      const jobs = await backendFetch("/jobs");
      state.backendJobs = jobs;
      await syncPdfWorkspaceOcrJob(jobs);
      await syncImageWorkspaceOcrJob(jobs);
      await processWorkflowRuns(jobs);
      renderGlobalTaskCenter();
      renderBackendJobs(jobs);
      renderPanelBackendJobs("#pdf-backend-jobs", "#pdf-backend-status", jobs, PDF_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#img-backend-jobs", "#img-backend-status", jobs, IMG_BACKEND_JOB_TYPES);
      renderPanelBackendJobs("#media-backend-jobs", "#media-backend-status", jobs, MEDIA_BACKEND_JOB_TYPES);
      scheduleBackendPolling(jobs);
    } catch (error) {
      state.backendConnected = false;
      state.backendJobs = [];
      renderGlobalTaskCenter();
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

  async function enqueueWorkflowStep(run, stepIndex, inputPaths) {
    const step = run.steps[stepIndex];
    if (!step) return;
    const job = await window.swiftLocalBackend.enqueueJob({
      type: step.type,
      inputPaths,
      outputDir: state.desktopOutputDir || undefined,
      options: {
        angle: run.options && run.options.angle ? run.options.angle : "90",
        password: run.options && run.options.password ? run.options.password : ""
      }
    });
    step.jobId = job.id;
    step.status = job.status || "queued";
    run.currentStep = stepIndex;
    run.status = "running";
    run.error = "";
    persistWorkflowRuns();
    renderWorkflowRuns();
  }

  function workflowStepNeedsPassword(type) {
    return type === "pdf-encrypt" || type === "pdf-decrypt";
  }

  function findWorkflowResumeIndex(run) {
    if (!run || !Array.isArray(run.steps)) return -1;
    const incomplete = run.steps.findIndex((step) => step.status !== "done");
    return incomplete;
  }

  function resolveWorkflowStepInputs(run, stepIndex, jobs) {
    if (stepIndex <= 0) {
      return Array.isArray(run.inputPaths) ? run.inputPaths.filter(Boolean) : [];
    }
    const stored = run.stepOutputs && run.stepOutputs[stepIndex - 1];
    if (Array.isArray(stored) && stored.length) {
      return stored.filter(Boolean);
    }
    const prev = run.steps[stepIndex - 1];
    if (prev && prev.jobId && Array.isArray(jobs)) {
      const job = jobs.find((item) => item.id === prev.jobId);
      if (job && Array.isArray(job.outputPaths)) {
        return job.outputPaths.map((item) => item && item.path).filter(Boolean);
      }
    }
    return [];
  }

  function syncWorkflowPasswordFromForm(run) {
    const field = $("#workflow-password");
    if (!field || !field.value) return;
    run.options = { ...(run.options || {}), password: field.value };
  }

  async function resumeWorkflowRun(runId) {
    if (!electronBridgeAvailable()) {
      showToast("繼續流程需要桌面版", "error");
      return;
    }
    const run = state.workflowRuns.find((item) => item.id === runId);
    if (!run) {
      showToast("找不到流程紀錄", "error");
      return;
    }
    if (run.status === "running" || run.status === "done") {
      showToast(run.status === "done" ? "流程已完成" : "流程仍在執行中", "info");
      return;
    }
    const stepIndex = findWorkflowResumeIndex(run);
    if (stepIndex < 0) {
      run.status = "done";
      run.error = "";
      persistWorkflowRuns();
      renderWorkflowRuns();
      showToast("流程步驟皆已完成", "success");
      return;
    }
    syncWorkflowPasswordFromForm(run);
    const step = run.steps[stepIndex];
    if (workflowStepNeedsPassword(step.type) && !(run.options && run.options.password)) {
      showToast("此步驟需要 PDF 密碼：請在上方流程選項填入密碼後再按「從失敗步驟繼續」", "error");
      return;
    }

    // Prefer retrying the same job (keeps task center continuity) when possible.
    if (step.jobId && (step.status === "failed" || step.status === "cancelled")) {
      try {
        await backendFetch(`/jobs/${encodeURIComponent(step.jobId)}/retry`, { method: "POST" });
        step.status = "queued";
        run.currentStep = stepIndex;
        run.status = "running";
        run.error = "";
        persistWorkflowRuns();
        renderWorkflowRuns();
        await refreshBackendJobs();
        showToast(`已從步驟 ${stepIndex + 1}「${jobTypeLabel(step.type)}」繼續`, "success");
        return;
      } catch {
        // Fall through to re-enqueue with resolved input paths.
      }
    }

    const jobs = Array.isArray(state.backendJobs) ? state.backendJobs : [];
    const inputPaths = resolveWorkflowStepInputs(run, stepIndex, jobs);
    if (!inputPaths.length) {
      showToast(
        stepIndex === 0
          ? "找不到原始輸入檔，請重新選擇檔案並啟動流程"
          : "找不到上一步輸出檔，請重新啟動流程",
        "error"
      );
      return;
    }

    for (let index = stepIndex; index < run.steps.length; index += 1) {
      if (run.steps[index].status === "done") continue;
      run.steps[index].status = "pending";
      run.steps[index].jobId = null;
    }
    run.currentStep = stepIndex;
    run.status = "running";
    run.error = "";
    try {
      await enqueueWorkflowStep(run, stepIndex, inputPaths);
      await refreshBackendJobs();
      showToast(`已從步驟 ${stepIndex + 1}「${jobTypeLabel(step.type)}」重新排隊`, "success");
    } catch (error) {
      run.status = "failed";
      run.error = readableError(error);
      persistWorkflowRuns();
      renderWorkflowRuns();
      showToast(run.error, "error");
    }
  }

  async function processWorkflowRuns(jobs) {
    if (!electronBridgeAvailable()) return;
    for (const run of state.workflowRuns.filter((item) => item.status === "running")) {
      if (state.workflowAdvancing.has(run.id)) continue;
      const step = run.steps[run.currentStep];
      if (!step || !step.jobId) continue;
      const job = jobs.find((item) => item.id === step.jobId);
      if (!job) {
        run.status = "failed";
        run.error = "找不到目前步驟的任務紀錄，流程已停止。可嘗試「從失敗步驟繼續」。";
        continue;
      }
      step.status = job.status;
      if (job.status === "failed" || job.status === "cancelled") {
        run.status = job.status;
        const hint = job.errorHint ? ` ${job.errorHint}` : "";
        run.error =
          (job.error || `步驟「${jobTypeLabel(step.type)}」未能完成`) +
          hint +
          " 可按「從失敗步驟繼續」。";
        continue;
      }
      if (job.status !== "done") continue;
      const outputs = Array.isArray(job.outputPaths) ? job.outputPaths : [];
      step.status = "done";
      const nextInputs = outputs.map((item) => item.path).filter(Boolean);
      run.stepOutputs = run.stepOutputs || {};
      run.stepOutputs[run.currentStep] = nextInputs;
      if (run.currentStep >= run.steps.length - 1) {
        run.status = "done";
        run.finishedAt = new Date().toISOString();
        run.outputPaths = outputs;
        continue;
      }
      if (!nextInputs.length) {
        run.status = "failed";
        run.error = "上一步沒有產生可供下一步使用的本機檔案。可按「從失敗步驟繼續」或重新啟動流程。";
        continue;
      }
      const nextIndex = run.currentStep + 1;
      const nextStep = run.steps[nextIndex];
      if (workflowStepNeedsPassword(nextStep.type) && !(run.options && run.options.password)) {
        run.status = "failed";
        run.error = "下一步需要 PDF 密碼。請在流程選項填入密碼後按「從失敗步驟繼續」。";
        // Keep completed steps; resume will start at nextIndex.
        nextStep.status = "pending";
        nextStep.jobId = null;
        run.currentStep = nextIndex;
        continue;
      }
      state.workflowAdvancing.add(run.id);
      try {
        await enqueueWorkflowStep(run, nextIndex, nextInputs);
      } catch (error) {
        run.status = "failed";
        run.error = `${readableError(error)} 可按「從失敗步驟繼續」。`;
      } finally {
        state.workflowAdvancing.delete(run.id);
      }
    }
    persistWorkflowRuns();
    renderWorkflowRuns();
  }

  function persistWorkflowRuns() {
    try {
      const safeRuns = state.workflowRuns.map((run) => ({
        ...run,
        options: { ...(run.options || {}), password: "" },
        // Keep stepOutputs (local paths) for resume after reload; no secrets.
        stepOutputs: run.stepOutputs || {}
      }));
      localStorage.setItem("swiftlocal-workflows", JSON.stringify(safeRuns));
    } catch {
      // Workflow history remains available for this session if storage is unavailable.
    }
  }

  function renderWorkflowRuns() {
    const container = $("#workflow-run-list");
    const count = $("#workflow-run-count");
    if (count) count.textContent = String(state.workflowRuns.length);
    if (!container) return;
    container.innerHTML = "";
    container.classList.toggle("empty", state.workflowRuns.length === 0);
    if (!state.workflowRuns.length) {
      container.innerHTML = '<div class="task-empty-state"><strong>尚未執行流程</strong><span>選擇範本和來源檔案後，啟動流程即可在這裡追蹤每一步。</span></div>';
      return;
    }
    state.workflowRuns.forEach((run) => {
      const card = document.createElement("article");
      card.className = `workflow-run ${escapeHtml(run.status)}`;
      const header = document.createElement("header");
      header.innerHTML = `<div><strong>${escapeHtml(run.name)}</strong><small>${escapeHtml(new Date(run.createdAt).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }))}</small></div><span class="status-pill">${escapeHtml(workflowStatusLabel(run.status))}</span>`;
      card.appendChild(header);
      const steps = document.createElement("ol");
      steps.className = "workflow-run-steps";
      run.steps.forEach((step, index) => {
        const item = document.createElement("li");
        item.className = step.status || "pending";
        const mark =
          step.status === "done"
            ? "✓"
            : step.status === "running" || step.status === "queued"
              ? "…"
              : step.status === "failed" || step.status === "cancelled"
                ? "!"
                : index + 1;
        item.innerHTML = `<span>${mark}</span><div><strong>${escapeHtml(jobTypeLabel(step.type))}</strong><small>${escapeHtml(jobStatusLabel(step.status === "pending" ? "queued" : step.status))}</small></div>`;
        steps.appendChild(item);
      });
      card.appendChild(steps);
      if (run.error) {
        const error = document.createElement("p");
        error.className = "workflow-run-error";
        error.textContent = run.error;
        card.appendChild(error);
      }
      if (run.outputPaths && run.outputPaths.length) {
        const outputs = document.createElement("div");
        outputs.className = "backend-output-paths";
        run.outputPaths.forEach((item) => outputs.appendChild(renderBackendOutputAction(item)));
        card.appendChild(outputs);
      }
      const actions = document.createElement("div");
      actions.className = "workflow-run-actions";
      if (run.status === "running") {
        const stop = document.createElement("button");
        stop.type = "button";
        stop.className = "secondary-button compact danger-button";
        stop.textContent = "停止流程";
        stop.addEventListener("click", () => {
          const current = run.steps[run.currentStep];
          if (current && current.jobId) cancelBackendJob(current.jobId);
        });
        actions.appendChild(stop);
      }
      if (run.status === "failed" || run.status === "cancelled") {
        const resume = document.createElement("button");
        resume.type = "button";
        resume.className = "secondary-button compact";
        resume.textContent = "從失敗步驟繼續";
        resume.title = "保留已完成步驟，從第一個未完成步驟重試";
        resume.addEventListener("click", () => resumeWorkflowRun(run.id));
        actions.appendChild(resume);
      }
      const tasks = document.createElement("button");
      tasks.type = "button";
      tasks.className = "secondary-button compact";
      tasks.textContent = "查看任務中心";
      tasks.addEventListener("click", () => activatePanel("tasks-panel"));
      actions.appendChild(tasks);
      if (run.status !== "running") {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ghost-button compact";
        remove.textContent = "移除紀錄";
        remove.addEventListener("click", () => {
          state.workflowRuns = state.workflowRuns.filter((item) => item.id !== run.id);
          persistWorkflowRuns();
          renderWorkflowRuns();
        });
        actions.appendChild(remove);
      }
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function workflowStatusLabel(status) {
    if (status === "running") return "執行中";
    if (status === "done") return "流程完成";
    if (status === "failed") return "流程失敗";
    if (status === "cancelled") return "已停止";
    return status || "等待中";
  }

  function renderGlobalTaskCenter() {
    const jobs = Array.isArray(state.backendJobs) ? state.backendJobs : [];
    const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");
    const doneJobs = jobs.filter((job) => job.status === "done");
    const attentionJobs = jobs.filter((job) => job.status === "failed" || job.status === "cancelled");
    setTextIfPresent("#task-count-all", jobs.length);
    setTextIfPresent("#task-count-active", activeJobs.length);
    setTextIfPresent("#task-count-done", doneJobs.length);
    setTextIfPresent("#task-count-attention", attentionJobs.length);
    setTextIfPresent("#global-task-count", activeJobs.length);
    setTextIfPresent("#sidebar-task-count", activeJobs.length);

    const shortcut = $("#task-center-shortcut");
    if (shortcut) shortcut.classList.toggle("has-active", activeJobs.length > 0);
    const search = $("#task-search");
    const query = search ? search.value.trim().toLowerCase() : "";
    const filtered = jobs.filter((job) => {
      const statusMatches = state.taskFilter === "all"
        || (state.taskFilter === "active" && (job.status === "queued" || job.status === "running"))
        || (state.taskFilter === "done" && job.status === "done")
        || (state.taskFilter === "attention" && (job.status === "failed" || job.status === "cancelled"));
      const haystack = [jobTypeLabel(job.type), jobStatusLabel(job.status, job), ...(job.inputPaths || [])].join(" ").toLowerCase();
      return statusMatches && (!query || haystack.includes(query));
    });

    const container = $("#global-task-list");
    const resultLabel = $("#task-result-label");
    const clear = $("#clear-task-history");
    if (resultLabel) resultLabel.textContent = jobs.length ? `顯示 ${filtered.length}／${jobs.length} 個任務` : "尚未建立任務";
    if (clear) clear.disabled = !jobs.some((job) => !["queued", "running"].includes(job.status));
    if (!container) return;
    container.innerHTML = "";
    container.classList.toggle("empty", filtered.length === 0);
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "task-empty-state";
      empty.innerHTML = jobs.length
        ? "<strong>沒有符合條件的任務</strong><span>請更改篩選條件或搜尋字詞。</span>"
        : "<strong>暫時沒有任務</strong><span>從 PDF、圖片或影音工具建立進階處理任務後，會在這裡顯示。</span>";
      container.appendChild(empty);
      return;
    }
    filtered.forEach((job) => container.appendChild(buildGlobalTaskElement(job)));
  }

  function buildGlobalTaskElement(job) {
    const card = buildJobElement(job);
    card.classList.add("global-task-card");
    const header = card.firstElementChild;
    const meta = document.createElement("div");
    meta.className = "task-card-meta";
    const created = job.createdAt ? new Date(job.createdAt) : null;
    const finished = job.finishedAt ? new Date(job.finishedAt) : null;
    const elapsedStart = job.startedAt ? new Date(job.startedAt) : created;
    const elapsedEnd = finished || new Date();
    const duration = elapsedStart && !Number.isNaN(elapsedStart.getTime()) ? formatTaskDuration(elapsedEnd - elapsedStart) : "—";
    const spaceHint = formatJobSpaceSummary(job).replace(/^空間：/, "");
    meta.innerHTML = `<span>建立 ${created && !Number.isNaN(created.getTime()) ? escapeHtml(created.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })) : "—"}</span><span>歷時 ${escapeHtml(duration)}</span><span class="task-space-hint" title="${escapeHtml(formatJobSpaceSummary(job))}">${escapeHtml(spaceHint)}</span><code>${escapeHtml(String(job.id || "").slice(-8))}</code>`;
    if (header) header.insertAdjacentElement("afterend", meta);
    if (job.status === "running" || job.status === "queued") {
      const progress = document.createElement("div");
      progress.className = `task-progress ${job.status}`;
      const progressMessage = job.progress && job.progress.message
        ? job.progress.message
        : job.status === "running" ? "正在由本機工具處理" : "等待前方任務完成";
      progress.innerHTML = `<span></span><small>${escapeHtml(progressMessage)}</small>`;
      meta.insertAdjacentElement("afterend", progress);
    }
    return card;
  }

  function setTextIfPresent(selector, value) {
    const element = $(selector);
    if (element) element.textContent = String(value);
  }

  function formatTaskDuration(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
    return `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`;
  }

  async function clearFinishedTaskHistory() {
    const finished = state.backendJobs.filter((job) => !["queued", "running"].includes(job.status));
    if (!finished.length) {
      showToast("沒有可清除的已結束任務", "info");
      return;
    }
    try {
      // Prefer bulk cleanup (also removes FastAPI workdirs / ages out history).
      try {
        const result = await backendFetch("/jobs/cleanup?forceFinished=true", { method: "POST" });
        await refreshBackendJobs();
        const removed =
          Number(result.removedByAge || 0) + Number(result.removedByCap || 0) || finished.length;
        showToast(`已清除 ${removed} 個已結束任務`, "success");
        return;
      } catch {
        // Fallback: delete one-by-one (older desktop builds without cleanup API).
      }
      for (const job of finished) {
        await backendFetch(`/jobs/${encodeURIComponent(job.id)}`, { method: "DELETE" });
      }
      await refreshBackendJobs();
      showToast(`已清除 ${finished.length} 個已結束任務`, "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  async function autoCleanupJobsQuietly() {
    try {
      await backendFetch("/jobs/cleanup", { method: "POST" });
    } catch {
      // Optional maintenance; ignore if backend is unavailable.
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
    div.className = `backend-job ${escapeHtml(job.status)}${
      job.cancelRequested && job.status === "running" ? " cancelling" : ""
    }`;

    const header = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = jobTypeLabel(job.type);
    const statusSpan = document.createElement("span");
    statusSpan.textContent = jobStatusLabel(job.status, job);
    statusSpan.title = job.cancelRequested && job.status === "running"
      ? "取消中"
      : job.status;

    const headerRight = document.createElement("div");
    headerRight.style.display = "flex";
    headerRight.style.gap = "8px";
    headerRight.style.alignItems = "center";
    headerRight.appendChild(statusSpan);

    if (job.status === "queued" || job.status === "running") {
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "secondary-button compact danger-button";
      cancelBtn.type = "button";
      if (job.cancelRequested && job.status === "running") {
        cancelBtn.textContent = "取消中…";
        cancelBtn.disabled = true;
      } else {
        cancelBtn.textContent = "取消";
        cancelBtn.addEventListener("click", () => cancelBackendJob(job.id));
      }
      headerRight.appendChild(cancelBtn);
    } else if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
      if (job.status === "failed" || job.status === "cancelled") {
        if (job.retriable !== false) {
          const retryBtn = document.createElement("button");
          retryBtn.className = "secondary-button compact";
          retryBtn.type = "button";
          retryBtn.textContent = "重新執行";
          retryBtn.addEventListener("click", () => retryBackendJob(job.id));
          headerRight.appendChild(retryBtn);
        }
        const copyBtn = document.createElement("button");
        copyBtn.className = "secondary-button compact";
        copyBtn.type = "button";
        copyBtn.textContent = "複製任務";
        copyBtn.addEventListener("click", () => copyBackendJob(job.id));
        headerRight.appendChild(copyBtn);
        const diagBtn = document.createElement("button");
        diagBtn.className = "secondary-button compact";
        diagBtn.type = "button";
        diagBtn.textContent = "診斷";
        diagBtn.addEventListener("click", () => exportJobDiagnostic(job.id));
        headerRight.appendChild(diagBtn);
      }
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
    small.className = "job-input-list";
    const inputEntries = Array.isArray(job.inputFiles) && job.inputFiles.length
      ? job.inputFiles
      : (job.inputPaths || []).map((name) => ({ name, size: null }));
    small.innerHTML = inputEntries.length
      ? inputEntries.map((item) => formatJobInputLabel(item)).join("<br>")
      : "（無輸入檔案資訊）";
    div.appendChild(small);

    const spaceLine = document.createElement("small");
    spaceLine.className = "job-space-usage";
    spaceLine.textContent = formatJobSpaceSummary(job);
    div.appendChild(spaceLine);

    if ((job.status === "queued" || job.status === "running") && job.progress) {
      const current = Math.max(0, Number(job.progress.current) || 0);
      const total = Math.max(current, Number(job.progress.total) || 0);
      const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
      const progress = document.createElement("div");
      progress.className = "job-inline-progress";
      const meter = document.createElement("progress");
      meter.max = 100;
      meter.value = percent;
      meter.setAttribute("aria-label", `任務進度 ${percent}%`);
      const message = document.createElement("small");
      message.textContent = job.progress.message || `${current} / ${total}`;
      progress.append(meter, message);
      div.appendChild(progress);
    }

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

    if (Array.isArray(job.itemResults) && job.itemResults.length) {
      const itemResults = document.createElement("div");
      itemResults.className = "job-item-results";
      job.itemResults.forEach((item) => {
        const row = document.createElement("div");
        row.className = `job-item-result ${item.status === "done" ? "done" : "failed"}`;
        const label = document.createElement("strong");
        label.textContent = item.name || `圖片 ${Number(item.index || 0) + 1}`;
        const detail = document.createElement("span");
        detail.textContent = item.status === "done"
          ? `完成${item.outputName ? ` · ${item.outputName}` : ""}`
          : `未完成${item.error ? ` · ${item.error}` : ""}`;
        row.append(label, detail);
        itemResults.appendChild(row);
      });
      div.appendChild(itemResults);
    }

    if (job.status === "failed" || job.status === "cancelled") {
      div.appendChild(buildJobFailureDetails(job));
    } else {
      const log = job.error || (job.log && job.log.length ? job.log[job.log.length - 1] : "");
      if (log) {
        const pre = document.createElement("pre");
        pre.textContent = log;
        div.appendChild(pre);
      }
    }

    return div;
  }

  function splitJobErrorParts(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      return { summary: "", suggestion: "", technical: "" };
    }
    const techMarker = "【技術詳情】";
    let main = raw;
    let technical = "";
    const techIndex = raw.indexOf(techMarker);
    if (techIndex >= 0) {
      main = raw.slice(0, techIndex).trim();
      technical = raw.slice(techIndex + techMarker.length).trim();
    }
    let summary = main;
    let suggestion = "";
    const suggestMatch = main.match(/(?:^|\n)建議[：:]\s*([\s\S]+)$/);
    if (suggestMatch) {
      suggestion = suggestMatch[1].trim();
      summary = main.slice(0, suggestMatch.index).trim();
    }
    // Soften bare process exit codes if they somehow slip through.
    if (/^Process exited with code\s+-?\d+\s*$/i.test(summary)) {
      summary = "外部轉換程序異常結束。原始檔案並未被修改。";
      if (!suggestion) {
        suggestion = "請查看技術詳情，或改試其他輸出格式／更新 LibreOffice。";
      }
      if (!technical) technical = raw;
    }
    return { summary, suggestion, technical };
  }

  function buildJobFailureDetails(job) {
    const wrap = document.createElement("div");
    wrap.className = "job-failure-details";
    if (job.errorCode || job.errorCodeLabel) {
      const code = document.createElement("p");
      code.className = "job-error-code";
      code.textContent = `錯誤類型：${job.errorCodeLabel || job.errorCode}`;
      wrap.appendChild(code);
    }
    const source = job.error || (job.log && job.log.length ? job.log[job.log.length - 1] : "") || "";
    const parts = splitJobErrorParts(source);
    const summary = document.createElement("p");
    summary.className = "job-error-summary";
    summary.textContent = parts.summary || (job.status === "cancelled" ? "任務已取消" : "轉換失敗");
    wrap.appendChild(summary);
    const hint = job.errorHint || parts.suggestion;
    if (hint) {
      const tip = document.createElement("p");
      tip.className = "job-error-suggestion";
      tip.textContent = `建議：${hint}`;
      wrap.appendChild(tip);
    } else if (job.status === "failed") {
      const tip = document.createElement("p");
      tip.className = "job-error-suggestion";
      tip.textContent = "建議：確認輸入檔完整後重試；DOCX 可依賴相容模式，XLSX／PPTX／ODT 為實驗性。";
      wrap.appendChild(tip);
    }
    const techBody = parts.technical
      || (job.log && job.log.length ? job.log.join("\n") : "")
      || (source && source !== parts.summary ? source : "");
    if (techBody && techBody.trim() && techBody.trim() !== parts.summary) {
      const details = document.createElement("details");
      details.className = "job-error-technical";
      const summaryEl = document.createElement("summary");
      summaryEl.textContent = "技術詳情";
      details.appendChild(summaryEl);
      const pre = document.createElement("pre");
      pre.textContent = techBody;
      details.appendChild(pre);
      wrap.appendChild(details);
    }
    return wrap;
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
      showToast("已送出取消。外部工具會立即中止；本機處理會在目前頁面／檔案步驟完成後停止。", "info", 5000);
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

  async function retryBackendJob(jobId) {
    try {
      await backendFetch(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
      await refreshBackendJobs();
      showToast("已重新排隊執行", "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  async function copyBackendJob(jobId) {
    try {
      await backendFetch(`/jobs/${encodeURIComponent(jobId)}/copy`, { method: "POST" });
      await refreshBackendJobs();
      showToast("已複製為新任務", "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  async function exportJobDiagnostic(jobId) {
    try {
      const report = await backendFetch(`/jobs/${encodeURIComponent(jobId)}/diagnostic`, { method: "GET" });
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `swiftlocal-diagnostic-${jobId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("已匯出診斷報告（不含密碼）", "success");
    } catch (error) {
      showToast(readableError(error), "error");
    }
  }

  function scheduleBackendPolling(jobs) {
    if (state.backendPollTimer) {
      window.clearTimeout(state.backendPollTimer);
      state.backendPollTimer = null;
    }
    const hasActiveJobs = jobs.some((job) => job.status === "queued" || job.status === "running")
      || state.workflowRuns.some((run) => run.status === "running");
    if (hasActiveJobs && !document.hidden) {
      state.backendPollTimer = window.setTimeout(refreshBackendJobs, 2000);
    }
  }

  async function backendFetch(path, options = {}) {
    if (electronBridgeAvailable()) {
      return electronBackendRequest(path, options);
    }
    const requestOptions = { ...options, headers: new Headers(options.headers || {}) };
    requestOptions.headers.set("X-SwiftLocal-Token", await getBackendSessionToken());
    let response = await fetch(`${BACKEND_API_BASE}${path}`, requestOptions);
    if (response.status === 401) {
      state.backendSessionToken = "";
      requestOptions.headers.set("X-SwiftLocal-Token", await getBackendSessionToken());
      response = await fetch(`${BACKEND_API_BASE}${path}`, requestOptions);
    }
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

  async function getBackendSessionToken() {
    if (state.backendSessionToken) return state.backendSessionToken;
    const response = await fetch("/__swiftlocal/session-token", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("無法取得本機後端 session token，請確認 SwiftLocal 後端正在執行");
    }
    const payload = await response.json();
    const token = String(payload.token || "").trim();
    if (!token) throw new Error("本機後端 session token 無效");
    state.backendSessionToken = token;
    return token;
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
    const retryMatch = path.match(/^\/jobs\/([^/]+)\/retry$/);
    if (retryMatch && method === "POST") {
      const retried = await window.swiftLocalBackend.retryJob(decodeURIComponent(retryMatch[1]));
      if (!retried) throw new Error("Job not found");
      return retried;
    }
    const copyMatch = path.match(/^\/jobs\/([^/]+)\/copy$/);
    if (copyMatch && method === "POST") {
      const copied = await window.swiftLocalBackend.copyJob(decodeURIComponent(copyMatch[1]));
      if (!copied) throw new Error("Job not found");
      return copied;
    }
    const diagMatch = path.match(/^\/jobs\/([^/]+)\/diagnostic$/);
    if (diagMatch && method === "GET") {
      return window.swiftLocalBackend.jobDiagnostic(decodeURIComponent(diagMatch[1]));
    }
    if (path.startsWith("/jobs/cleanup") && method === "POST") {
      const url = new URL(path, "http://swiftlocal.local");
      const forceFinished = url.searchParams.get("forceFinished") === "true";
      return window.swiftLocalBackend.cleanupJobs({ forceFinished });
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
        docxEngine: String(formData.get("docxEngine") || "auto"),
        scanOcr: String(formData.get("scanOcr") || "auto"),
        ocrOutput: String(formData.get("ocrOutput") || "both"),
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
        gifFps: String(formData.get("gifFps") || ""),
        imageOps: String(formData.get("imageOps") || ""),
        quality: String(formData.get("quality") || ""),
        maxWidth: String(formData.get("maxWidth") || ""),
        maxHeight: String(formData.get("maxHeight") || ""),
        keepRatio: String(formData.get("keepRatio") || ""),
        watermarkText: String(formData.get("watermarkText") || ""),
        watermarkPosition: String(formData.get("watermarkPosition") || "")
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

  function jobStatusLabel(status, job) {
    if (status === "running" && job && job.cancelRequested) return "取消中…";
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
      return "PDF → Office（嘗試保留版面）";
    }
    if (type === "pdf-to-searchable-pdf") {
      return "PDF → 可搜尋 PDF（OCR）";
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
    const formats = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/tiff": "tiff",
      "image/bmp": "bmp",
      "image/gif": "gif"
    };
    return formats[mime] || "jpg";
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
    if (bytes == null || Number.isNaN(Number(bytes))) {
      return "—";
    }
    const units = ["B", "KB", "MB", "GB"];
    const value = Math.max(0, Number(bytes));
    const index = Math.min(Math.floor(Math.log(value || 1) / Math.log(1024)), units.length - 1);
    return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function formatJobInputLabel(item) {
    if (!item || typeof item !== "object") {
      return escapeHtml(item);
    }
    const name = escapeHtml(item.name || "");
    if (item.missing) {
      return `${name} <em class="job-file-missing">（已不存在）</em>`;
    }
    if (item.size == null) {
      return name;
    }
    return `${name} · ${escapeHtml(formatBytes(item.size))}`;
  }

  function formatJobSpaceSummary(job) {
    const space = (job && job.space) || {};
    const inputBytes = Number(space.inputBytes);
    const outputBytes = Number(space.outputBytes);
    const inputCount = Number(space.inputCount != null ? space.inputCount : (job.inputPaths || []).length) || 0;
    const outputCount = Number(space.outputCount != null ? space.outputCount : (job.outputPaths || []).length) || 0;
    const inputMissing = Number(space.inputMissing) || 0;

    // Fallback: sum output path sizes when space payload is absent (older backends).
    let resolvedOutput = Number.isFinite(outputBytes) ? outputBytes : 0;
    if (!Number.isFinite(outputBytes) && Array.isArray(job.outputPaths)) {
      resolvedOutput = job.outputPaths.reduce((sum, item) => sum + (Number(item && item.size) || 0), 0);
    }
    const hasInput = Number.isFinite(inputBytes);
    const hasOutput = Number.isFinite(resolvedOutput) && (outputCount > 0 || resolvedOutput > 0);

    const parts = [];
    if (hasInput) {
      parts.push(`輸入 ${formatBytes(inputBytes)}${inputCount ? `（${inputCount} 個）` : ""}`);
    } else if (inputCount) {
      parts.push(`輸入 ${inputCount} 個檔案`);
    }
    if (inputMissing) {
      parts.push(`${inputMissing} 個輸入已不存在`);
    }
    if (hasOutput) {
      parts.push(`輸出 ${formatBytes(resolvedOutput)}${outputCount ? `（${outputCount} 個）` : ""}`);
    } else if (job.status === "done") {
      parts.push("輸出 —");
    } else {
      parts.push("輸出尚未產生");
    }

    const savedBytes = space.savedBytes;
    const savedPercent = space.savedPercent;
    if (savedBytes != null && Number.isFinite(Number(savedBytes)) && hasInput && hasOutput) {
      const saved = Number(savedBytes);
      if (saved > 0) {
        parts.push(`節省 ${formatBytes(saved)}${savedPercent != null ? `（${savedPercent}%）` : ""}`);
      } else if (saved < 0) {
        parts.push(`增大 ${formatBytes(Math.abs(saved))}${savedPercent != null ? `（${Math.abs(savedPercent)}%）` : ""}`);
      } else {
        parts.push("大小未變");
      }
    }
    return `空間：${parts.join(" · ")}`;
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
