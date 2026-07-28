"""Shared job error taxonomy (aligned with desktop/job-errors.js)."""

from __future__ import annotations

ERROR_CODES = {
    "MISSING_TOOL": "missing_tool",
    "MISSING_LANGUAGE_PACK": "missing_language_pack",
    "ENCRYPTED_PDF": "encrypted_pdf",
    "CORRUPTED_FILE": "corrupted_file",
    "UNSUPPORTED_FORMAT": "unsupported_format",
    "DISK_FULL": "disk_full",
    "PERMISSION_DENIED": "permission_denied",
    "TOOL_TIMEOUT": "tool_timeout",
    "TOOL_CRASHED": "tool_crashed",
    "EXTERNAL_PROCESS_CRASH": "external_process_crash",
    "OFFICE_CONVERSION_FAILED": "office_conversion_failed",
    "LIBREOFFICE_PROFILE_ERROR": "libreoffice_profile_error",
    "MISSING_INPUT": "missing_input",
    "OUTPUT_CONFLICT": "output_conflict",
    "CANCELLED": "cancelled",
    "UNKNOWN": "unknown",
}

JOB_TOOL_REQUIREMENTS: dict[str, list[str]] = {
    "office-to-pdf": ["libreOffice"],
    "pdf-to-office": ["libreOffice"],
    "pdf-to-searchable-pdf": ["tesseract"],
    "media-convert": ["ffmpeg"],
    "image-convert": ["ffmpeg"],
    "ocr-image": ["tesseract"],
    "ocr-pdf": ["tesseract"],
    # FastAPI uses pypdf for encrypt/decrypt — no external tool required.
}

PASSWORD_JOB_TYPES = {"pdf-encrypt", "pdf-decrypt"}


def classify_job_error(error: BaseException | str, job_type: str = "") -> dict[str, object]:
    message = str(error or "").strip() or "未知錯誤"
    text = message.lower()

    if "任務已取消" in message or "cancelled" in text:
        return {
            "code": ERROR_CODES["CANCELLED"],
            "message": "任務已取消",
            "hint": "可重新執行此任務（輸入檔仍存在時）。",
            "retriable": True,
        }
    if "逾時" in message or "timeout" in text:
        return {
            "code": ERROR_CODES["TOOL_TIMEOUT"],
            "message": message,
            "hint": "請縮短頁數／時長後重試，或改用較簡單的輸出格式。",
            "retriable": True,
        }
    if "0xc0000409" in text or "崩潰" in message or "crash" in text:
        return {
            "code": ERROR_CODES["EXTERNAL_PROCESS_CRASH"],
            "message": message,
            "hint": "LibreOffice 未能轉換此文件。文件可能包含不相容內容，或轉換引擎發生錯誤。",
            "retriable": True,
        }
    if "userinstallation" in text or "bootstrap" in text or "user profile" in text:
        return {
            "code": ERROR_CODES["LIBREOFFICE_PROFILE_ERROR"],
            "message": message,
            "hint": "LibreOffice 使用者設定檔無法建立或啟動。請確認輸出資料夾可寫入後重試。",
            "retriable": True,
        }
    if "libreoffice" in text and ("退出碼" in message or "exit code" in text or "process exited" in text):
        return {
            "code": ERROR_CODES["OFFICE_CONVERSION_FAILED"],
            "message": message,
            "hint": "LibreOffice 未能轉換此文件。文件可能包含不相容內容，或轉換引擎發生錯誤。",
            "retriable": True,
        }
    if "permission" in text or "eacces" in text or "沒有權限" in message:
        return {
            "code": ERROR_CODES["PERMISSION_DENIED"],
            "message": message,
            "hint": "請檢查檔案／輸出資料夾權限。",
            "retriable": True,
        }
    if "enospc" in text or "空間不足" in message or "no space" in text:
        return {
            "code": ERROR_CODES["DISK_FULL"],
            "message": message,
            "hint": "請釋放磁碟空間後重試。",
            "retriable": True,
        }
    if "加密" in message or "encrypted" in text or "password" in text and "required" in text:
        return {
            "code": ERROR_CODES["ENCRYPTED_PDF"],
            "message": message,
            "hint": "請先使用「PDF 解密」後再處理。",
            "retriable": False,
        }
    if "找不到" in message or "not found" in text or "enoent" in text or "未安裝" in message:
        return {
            "code": ERROR_CODES["MISSING_TOOL"],
            "message": message,
            "hint": "請安裝或指定正確工具路徑後重試。",
            "retriable": True,
        }
    if "tessdata" in text or "語言包" in message or "traineddata" in text:
        return {
            "code": ERROR_CODES["MISSING_LANGUAGE_PACK"],
            "message": message,
            "hint": "請安裝對應 OCR 語言包後重試。",
            "retriable": True,
        }
    if "不支援" in message or "unsupported" in text:
        return {
            "code": ERROR_CODES["UNSUPPORTED_FORMAT"],
            "message": message,
            "hint": "請確認輸入格式與所選工具是否相符。",
            "retriable": False,
        }
    if "損壞" in message or "corrupt" in text or "malformed" in text:
        return {
            "code": ERROR_CODES["CORRUPTED_FILE"],
            "message": message,
            "hint": "請確認檔案完整後再試。",
            "retriable": False,
        }
    if job_type in PASSWORD_JOB_TYPES and "重新輸入密碼" in message:
        return {
            "code": ERROR_CODES["ENCRYPTED_PDF"],
            "message": message,
            "hint": "請從工具面板重新提交並輸入密碼。",
            "retriable": False,
        }
    return {
        "code": ERROR_CODES["UNKNOWN"],
        "message": message,
        "hint": "請查看技術詳情後重試；若持續失敗可匯出診斷報告。",
        "retriable": True,
    }


def error_code_label(code: str) -> str:
    labels = {
        ERROR_CODES["MISSING_TOOL"]: "缺少工具",
        ERROR_CODES["MISSING_LANGUAGE_PACK"]: "缺少語言包",
        ERROR_CODES["ENCRYPTED_PDF"]: "檔案加密",
        ERROR_CODES["CORRUPTED_FILE"]: "檔案損壞",
        ERROR_CODES["UNSUPPORTED_FORMAT"]: "格式不支援",
        ERROR_CODES["DISK_FULL"]: "磁碟空間不足",
        ERROR_CODES["PERMISSION_DENIED"]: "權限不足",
        ERROR_CODES["TOOL_TIMEOUT"]: "工具逾時",
        ERROR_CODES["TOOL_CRASHED"]: "工具崩潰",
        ERROR_CODES["EXTERNAL_PROCESS_CRASH"]: "外部程序崩潰",
        ERROR_CODES["OFFICE_CONVERSION_FAILED"]: "Office 轉換失敗",
        ERROR_CODES["LIBREOFFICE_PROFILE_ERROR"]: "LibreOffice 設定檔錯誤",
        ERROR_CODES["MISSING_INPUT"]: "輸入檔遺失",
        ERROR_CODES["OUTPUT_CONFLICT"]: "輸出衝突",
        ERROR_CODES["CANCELLED"]: "使用者取消",
        ERROR_CODES["UNKNOWN"]: "未知錯誤",
    }
    return labels.get(code, labels[ERROR_CODES["UNKNOWN"]])
