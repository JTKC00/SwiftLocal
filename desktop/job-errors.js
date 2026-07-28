"use strict";

const fs = require("node:fs");

/**
 * Shared job error taxonomy for desktop backend.
 * Keep codes aligned with backend/services/job_errors.py and docs/jobs-state-schema.md.
 */

const ERROR_CODES = Object.freeze({
  MISSING_TOOL: "missing_tool",
  MISSING_LANGUAGE_PACK: "missing_language_pack",
  ENCRYPTED_PDF: "encrypted_pdf",
  CORRUPTED_FILE: "corrupted_file",
  UNSUPPORTED_FORMAT: "unsupported_format",
  DISK_FULL: "disk_full",
  PERMISSION_DENIED: "permission_denied",
  TOOL_TIMEOUT: "tool_timeout",
  TOOL_CRASHED: "tool_crashed",
  EXTERNAL_PROCESS_CRASH: "external_process_crash",
  OFFICE_CONVERSION_FAILED: "office_conversion_failed",
  LIBREOFFICE_PROFILE_ERROR: "libreoffice_profile_error",
  MISSING_INPUT: "missing_input",
  OUTPUT_CONFLICT: "output_conflict",
  CANCELLED: "cancelled",
  UNKNOWN: "unknown"
});

const JOB_TOOL_REQUIREMENTS = Object.freeze({
  "office-to-pdf": ["libreOffice"],
  "pdf-to-office": ["libreOffice"],
  "pdf-to-searchable-pdf": ["tesseract"],
  "media-convert": ["ffmpeg"],
  "image-convert": ["ffmpeg"],
  "ocr-image": ["tesseract"],
  "ocr-pdf": ["tesseract"],
  "pdf-encrypt": ["qpdf"],
  "pdf-decrypt": ["qpdf"]
});

const PASSWORD_JOB_TYPES = new Set(["pdf-encrypt", "pdf-decrypt"]);

function classifyJobError(error, job = {}) {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  const message = rawMessage.trim() || "未知錯誤";
  const explicitCode = error && error.errorCode ? String(error.errorCode) : "";
  if (explicitCode && Object.values(ERROR_CODES).includes(explicitCode)) {
    return classifiedFromCode(explicitCode, message);
  }
  const cancelled =
    Boolean(error && (error.cancelled || error.name === "JobCancelledError")) ||
    /任務已取消/.test(message);

  if (cancelled) {
    return {
      code: ERROR_CODES.CANCELLED,
      message: "任務已取消",
      hint: "可重新執行此任務（輸入檔仍存在時）。",
      retriable: true
    };
  }

  if (/逾時|timeout|ETIMEDOUT/i.test(message)) {
    return {
      code: ERROR_CODES.TOOL_TIMEOUT,
      message,
      hint: "請縮短頁數／時長後重試，或改用較簡單的輸出格式。",
      retriable: true
    };
  }

  if (/0xC0000409|stack.?buffer|意外崩潰|crashed|access violation/i.test(message)) {
    return {
      code: ERROR_CODES.EXTERNAL_PROCESS_CRASH,
      message,
      hint: "LibreOffice 未能轉換此文件。文件可能包含不相容內容，或轉換引擎發生錯誤。",
      retriable: true
    };
  }

  if (/permission|EACCES|EPERM|沒有權限|Access is denied/i.test(message)) {
    return {
      code: ERROR_CODES.PERMISSION_DENIED,
      message,
      hint: "請檢查檔案／輸出資料夾權限與防毒軟體攔截。",
      retriable: true
    };
  }

  if (/ENOSPC|disk full|空間不足|No space left|Not enough free disk/i.test(message)) {
    return {
      code: ERROR_CODES.DISK_FULL,
      message,
      hint: "請釋放磁碟空間後重試。",
      retriable: true
    };
  }

  if (/加密|encrypted|password required|需要密碼/i.test(message)) {
    return {
      code: ERROR_CODES.ENCRYPTED_PDF,
      message,
      hint: "請先使用「PDF 解密」後再處理。",
      retriable: false
    };
  }

  if (/找不到.*執行檔|not found|ENOENT|未安裝|require.?tool|缺少.*工具/i.test(message)) {
    return {
      code: ERROR_CODES.MISSING_TOOL,
      message,
      hint: "請到「狀態」頁安裝或指定工具路徑後重試。",
      retriable: true
    };
  }

  if (/tessdata|語言包|traineddata|language data/i.test(message)) {
    return {
      code: ERROR_CODES.MISSING_LANGUAGE_PACK,
      message,
      hint: "請安裝對應 OCR 語言包（例如 chi_tra、eng）後重試。",
      retriable: true
    };
  }

  if (/不支援|unsupported|invalid format|無法識別/i.test(message)) {
    return {
      code: ERROR_CODES.UNSUPPORTED_FORMAT,
      message,
      hint: "請確認輸入副檔名與所選工具是否相符。",
      retriable: false
    };
  }

  if (/損壞|corrupt|malformed|xref|invalid pdf/i.test(message)) {
    return {
      code: ERROR_CODES.CORRUPTED_FILE,
      message,
      hint: "請確認檔案完整後再試，或改用其他來源檔。",
      retriable: false
    };
  }

  if (hasConfirmedMissingInput(job)) {
    return {
      code: ERROR_CODES.MISSING_INPUT,
      message: "原始輸入檔已不存在",
      hint: "原始輸入檔已不存在，請重新選擇檔案後建立任務。",
      retriable: false
    };
  }

  // Password jobs after restart cannot resume without secret.
  if (PASSWORD_JOB_TYPES.has(String(job.type || "")) && /重新輸入密碼/.test(message)) {
    return {
      code: ERROR_CODES.ENCRYPTED_PDF,
      message,
      hint: "請從工具面板重新提交並輸入密碼。",
      retriable: false
    };
  }

  return {
    code: ERROR_CODES.UNKNOWN,
    message,
    hint: "請查看技術詳情後重試；若持續失敗可匯出診斷報告。",
    retriable: true
  };
}

function hasConfirmedMissingInput(job = {}) {
  const inputs = Array.isArray(job.inputPaths) ? job.inputPaths : [];
  if (!inputs.length) {
    return false;
  }
  return inputs.some((inputPath) => {
    try {
      return !fs.existsSync(inputPath);
    } catch {
      return false;
    }
  });
}

function classifiedFromCode(code, message) {
  if (code === ERROR_CODES.EXTERNAL_PROCESS_CRASH || code === ERROR_CODES.OFFICE_CONVERSION_FAILED) {
    return {
      code,
      message,
      hint: "LibreOffice 未能轉換此文件。文件可能包含不相容內容，或轉換引擎發生錯誤。",
      retriable: true
    };
  }
  if (code === ERROR_CODES.LIBREOFFICE_PROFILE_ERROR) {
    return {
      code,
      message,
      hint: "LibreOffice 使用者設定檔無法建立或啟動。請確認輸出資料夾可寫入後重試。",
      retriable: true
    };
  }
  return {
    code,
    message,
    hint: "請查看技術詳情後重試；若持續失敗可匯出診斷報告。",
    retriable: true
  };
}

function errorCodeLabel(code) {
  const map = {
    [ERROR_CODES.MISSING_TOOL]: "缺少工具",
    [ERROR_CODES.MISSING_LANGUAGE_PACK]: "缺少語言包",
    [ERROR_CODES.ENCRYPTED_PDF]: "檔案加密",
    [ERROR_CODES.CORRUPTED_FILE]: "檔案損壞",
    [ERROR_CODES.UNSUPPORTED_FORMAT]: "格式不支援",
    [ERROR_CODES.DISK_FULL]: "磁碟空間不足",
    [ERROR_CODES.PERMISSION_DENIED]: "權限不足",
    [ERROR_CODES.TOOL_TIMEOUT]: "工具逾時",
    [ERROR_CODES.TOOL_CRASHED]: "工具崩潰",
    [ERROR_CODES.EXTERNAL_PROCESS_CRASH]: "外部程序崩潰",
    [ERROR_CODES.OFFICE_CONVERSION_FAILED]: "Office 轉換失敗",
    [ERROR_CODES.LIBREOFFICE_PROFILE_ERROR]: "LibreOffice 設定檔錯誤",
    [ERROR_CODES.MISSING_INPUT]: "輸入檔遺失",
    [ERROR_CODES.OUTPUT_CONFLICT]: "輸出衝突",
    [ERROR_CODES.CANCELLED]: "使用者取消",
    [ERROR_CODES.UNKNOWN]: "未知錯誤"
  };
  return map[code] || map[ERROR_CODES.UNKNOWN];
}

module.exports = {
  ERROR_CODES,
  JOB_TOOL_REQUIREMENTS,
  PASSWORD_JOB_TYPES,
  classifyJobError,
  errorCodeLabel
};
