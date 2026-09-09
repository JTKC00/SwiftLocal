(function (root) {
  "use strict";

  const PDF_ACTIONS = Object.freeze({
    workspace: "輸出工作台 PDF", merge: "合併 PDF", split: "分割 PDF",
    extract: "抽出頁面", rotate: "儲存旋轉後 PDF", watermark: "加入浮水印",
    "page-numbers": "加入頁碼", text: "匯出文字", images: "匯出圖片",
    "pdf-to-docx": "轉成 Word", "pdf-to-office": "轉成 Office",
    "images-to-pdf": "圖片轉 PDF", "office-to-pdf": "轉成 PDF", "ocr-pdf": "辨識並匯出文字",
    "pdf-to-searchable-pdf": "建立可搜尋 PDF", "pdf-compress": "壓縮 PDF",
    "pdf-encrypt": "加密 PDF", "pdf-decrypt": "解密 PDF"
  });

  function fileName(path) {
    return String(path || "").split(/[\\/]/).pop() || "未命名檔案";
  }

  function taskEmptyState({ connected, hasJobs, filtered }) {
    if (!connected) return { title: "本機處理服務未連接", detail: "連接服務後可查看最新任務；PDF 閱讀與圖片編輯仍可使用。", action: "前往狀態與修復", target: "backend-panel" };
    if (hasJobs || filtered) return { title: "沒有符合條件的任務", detail: "試試其他關鍵字，或顯示全部任務。", action: "清除篩選", target: "reset" };
    return { title: "準備好開始第一個任務", detail: "選擇工具並加入檔案，背景處理的進度與結果會集中在這裡。", action: "選擇工具", target: "home-panel" };
  }

  function progressValue(progress) {
    const current = Number(progress?.current);
    const total = Number(progress?.total);
    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0 || current < 0) return null;
    return Math.min(100, Math.round(current / total * 100));
  }

  function acceptedFiles(files, accept) {
    const types = String(accept || "").toLowerCase().split(",").map((v) => v.trim()).filter(Boolean);
    return Array.from(files).filter((file) => !types.length || types.some((type) => {
      if (type.startsWith(".")) return file.name.toLowerCase().endsWith(type);
      if (type.endsWith("/*")) return (file.type || "").toLowerCase().startsWith(type.slice(0, -1));
      return (file.type || "").toLowerCase() === type;
    }));
  }

  const api = Object.freeze({ PDF_ACTIONS, fileName, taskEmptyState, progressValue, acceptedFiles });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SwiftLocalWorkbench = api;
})(typeof window !== "undefined" ? window : globalThis);
