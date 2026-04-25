# 快轉通 SwiftLocal 本地後端架構

## 目前完成

- Electron 主行程偵測本機工具：
  - LibreOffice
  - FFmpeg
  - Tesseract
- Renderer 透過安全 preload API 呼叫本地後端。
- 任務佇列支援：
  - Office → PDF
  - 音訊 / 影片轉換
  - 圖片 OCR → TXT
- 工具路徑可在桌面 UI 中手動設定並持久化。
- 可直接從 UI 開啟輸出資料夾。
- 佇列狀態：
  - queued
  - running
  - done
  - failed

## 環境變數覆寫

可用以下環境變數指定工具位置：

```powershell
$env:SWIFTLOCAL_LIBREOFFICE="C:\Program Files\LibreOffice\program\soffice.exe"
$env:SWIFTLOCAL_FFMPEG="C:\ffmpeg\bin\ffmpeg.exe"
$env:SWIFTLOCAL_TESSERACT="C:\Program Files\Tesseract-OCR\tesseract.exe"
```

桌面 UI 手動指定的路徑會存於 Electron `userData` 目錄的 `tools.json`，優先順序高於環境變數與 PATH 偵測。

## 任務流程

1. 前端選擇任務類型。
2. Electron dialog 選擇本機檔案與輸出資料夾。
3. 前端送出任務到主行程。
4. 主行程加入佇列並逐一執行。
5. 任務狀態透過 IPC 推送回前端。

## 待接功能

- PDF → DOCX：需要 Python / pdf2docx 或其他本地引擎。
- PDF OCR：可由 PDF → 圖片後接 Tesseract。
- 影音進階參數：碼率、解析度、裁切時間、GIF FPS。
- Office 批量轉換狀態細分與輸出檔存在檢查。
