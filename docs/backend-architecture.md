# 快轉通 SwiftLocal 本地後端架構

## 目前完成

- FastAPI HTTP 後端固定執行於 `http://127.0.0.1:8787`。
- 後端目錄已拆分為：
  - `backend/main.py`
  - `backend/routers/`
  - `backend/services/`
  - `backend/temp/`
- API 支援：
  - `GET /api/health`
  - `GET /api/tools`
  - `PUT /api/tools/{key}`
  - `DELETE /api/tools/{key}`
  - `POST /api/jobs`
  - `GET /api/jobs`
  - `GET /api/jobs/{job_id}`
  - `GET /api/jobs/{job_id}/outputs/{filename}`
  - `DELETE /api/jobs/{job_id}`
- 本地工具偵測：
  - LibreOffice
  - FFmpeg
  - Tesseract
- 任務佇列支援：
  - Office → PDF
  - 音訊 / 影片轉換
  - 圖片 OCR → TXT
- 前端「本地後端」面板已改用 FastAPI `fetch` API，上傳檔案、查詢狀態並下載輸出。
- Electron IPC 保留作桌面殼輔助，主要用於選擇本機工具執行檔路徑。

## 環境變數覆寫

可用以下環境變數指定工具位置：

```powershell
$env:SWIFTLOCAL_LIBREOFFICE="C:\Program Files\LibreOffice\program\soffice.exe"
$env:SWIFTLOCAL_FFMPEG="C:\ffmpeg\bin\ffmpeg.exe"
$env:SWIFTLOCAL_TESSERACT="C:\Program Files\Tesseract-OCR\tesseract.exe"
```

前端手動指定的路徑會寫入 `backend/tools.json`，優先順序高於環境變數與 PATH 偵測。

## 任務流程

1. 前端選擇任務類型與輸入檔案。
2. 前端以 multipart/form-data POST 到 `POST /api/jobs`。
3. FastAPI 將檔案存入 `backend/temp/jobs/{job_id}/input`。
4. 任務佇列逐一呼叫 LibreOffice、FFmpeg 或 Tesseract。
5. 輸出寫入 `backend/temp/jobs/{job_id}/output`。
6. 前端輪詢 `GET /api/jobs` 並提供下載連結。

## 待接功能

- PDF → DOCX：需要 Python / pdf2docx 或其他本地引擎。
- PDF OCR：可由 PDF → 圖片後接 Tesseract。
- 影音進階參數：碼率、解析度、裁切時間、GIF FPS。
- Office 批量轉換狀態細分與輸出檔存在檢查。
