# SwiftLocal

SwiftLocal 是一個本機優先的檔案工具箱。它把常用的圖片、PDF、文件、影音、文字、資料格式、ZIP、雜湊與小工具集中到一個介面中，讓使用者不用記命令列也能完成日常檔案處理。

SwiftLocal 不是要取代 LibreOffice、FFmpeg、Tesseract 或 QPDF。它的角色是把這些成熟的本地工具整合成容易理解的工作台，同時提供一批不需要外部工具的內建功能。

## 平台狀態

| 平台 | 目前狀態 | 說明 |
| --- | --- | --- |
| Windows | 已支援桌面打包 | 可產生 portable EXE 與 installer。 |
| macOS | 可用開發模式執行 | 目前未提供 `.dmg` / `.pkg` 打包腳本。可用 `npm run desktop` 或瀏覽器模式。 |
| Linux | 未正式整理 | Electron / 瀏覽器模式理論上可跑，但 README 目前不作正式支援承諾。 |

## 功能總覽

### 不需要外部工具

| 類別 | 功能 |
| --- | --- |
| 圖片 | JPG / PNG / WebP 轉換、壓縮、縮放、旋轉、浮水印 |
| PDF 基礎處理 | 合併、分割、抽頁、旋轉、加浮水印、加頁碼、轉圖片、抽文字 |
| PDF 後端處理 | 合併、分割、旋轉、壓縮 |
| 資料格式 | JSON / CSV / XML 格式化與互轉 |
| 文字 | Base64、URL 編碼、HTML escape、搜尋取代、行處理、統計 |
| ZIP / Hash | 建立 ZIP、計算檔案校驗值 |
| 小工具 | 顏色格式、UUID、QR Code |

### 需要外部工具

這些功能仍在 SwiftLocal 內操作，但需要本機安裝對應工具。工具未安裝時，App 會顯示「未找到」或明確錯誤，不會因此崩潰。

| 功能 | 需要工具 | Windows 常見執行檔 | macOS 常見執行檔 |
| --- | --- | --- | --- |
| Office → PDF | LibreOffice | `soffice.exe` | `soffice` |
| PDF → DOCX / Office 格式 | LibreOffice | `soffice.exe` | `soffice` |
| 音訊 / 影片格式轉換 | FFmpeg | `ffmpeg.exe` | `ffmpeg` |
| 圖片 OCR → TXT | Tesseract | `tesseract.exe` | `tesseract` |
| PDF 加密 / 解密 | QPDF | `qpdf.exe` | `qpdf` |

## 一般使用者：Windows

打包後會在 `dist/` 產生：

- `SwiftLocal-0.1.0-portable-x64.exe`：免安裝版，雙擊即可使用。
- `SwiftLocal-0.1.0-installer-x64.exe`：安裝版，會建立開始功能表與桌面捷徑。
- `win-unpacked/`：未封裝資料夾，主要給開發測試，不建議作為正式發佈檔。

第一次使用建議：

1. 開啟 SwiftLocal。
2. 到「後端設定」按「偵測工具」。
3. 若 LibreOffice、FFmpeg、Tesseract 或 QPDF 顯示未找到，先安裝對應工具，或手動指定執行檔路徑。
4. 回到需要的功能面板執行轉換。

目前沒有程式碼簽章，所以 Windows SmartScreen 可能顯示「未知發行者」。這是未簽章 App 的正常提醒，不代表檔案損壞。

## 一般使用者：macOS

目前未提供正式 macOS 安裝包。Mac 用戶可以用開發模式執行：

```bash
npm install
npm run desktop
```

若只想用瀏覽器介面：

```bash
npm run start
```

然後開啟：

```text
http://127.0.0.1:4173
```

如果 macOS 版桌面 App 偵測不到外部工具，請到「後端設定」手動指定執行檔路徑。Homebrew 安裝的工具常見位置如下：

```text
/opt/homebrew/bin/ffmpeg
/opt/homebrew/bin/tesseract
/opt/homebrew/bin/qpdf
/Applications/LibreOffice.app/Contents/MacOS/soffice
```

Intel Mac 的 Homebrew 有時會在：

```text
/usr/local/bin/ffmpeg
/usr/local/bin/tesseract
/usr/local/bin/qpdf
```

## 外部工具安裝指南

### Windows 安裝方式

#### LibreOffice

用途：Office → PDF、PDF → DOCX / Office 格式。

1. 到 [LibreOffice Windows 下載頁](https://www.libreoffice.org/download/Windows/)。
2. 下載 Windows 64-bit 安裝程式。
3. 用預設選項安裝。
4. 常見路徑：

```text
C:\Program Files\LibreOffice\program\soffice.exe
```

#### FFmpeg

用途：音訊 / 影片格式轉換。

1. 到 [FFmpeg 官方下載頁](https://www.ffmpeg.org/download.html)。
2. 在 Windows EXE Files 區域選擇 Windows build，例如 gyan.dev 或 BtbN。
3. 下載 release build，解壓縮到固定位置，例如：

```text
C:\ffmpeg\
C:\ffmpeg\bin\ffmpeg.exe
```

#### Tesseract

用途：圖片 OCR → TXT。

1. 到 [Tesseract 官方文件下載頁](https://tesseract-ocr.github.io/tessdoc/Downloads.html)。
2. Windows 使用者可依官方文件前往 UB Mannheim Windows installer。
3. 安裝時勾選需要的語言資料。
4. 常見路徑：

```text
C:\Program Files\Tesseract-OCR\tesseract.exe
```

中文 OCR 常用語言代碼：

```text
chi_tra
chi_sim
```

#### QPDF

用途：PDF 加密 / 解密。

1. 到 [QPDF GitHub Releases](https://github.com/qpdf/qpdf/releases)。
2. 下載 Windows 64-bit release zip 或 installer。
3. 安裝或解壓縮到固定位置。
4. 常見路徑：

```text
C:\Program Files\qpdf\bin\qpdf.exe
```

#### Windows winget（可選）

如果你的 Windows 已安裝 winget，可嘗試：

```powershell
winget install -e --id LibreOffice.LibreOffice
winget install -e --id Gyan.FFmpeg
winget install -e --id UB-Mannheim.TesseractOCR
winget install -e --id QPDF.QPDF
```

winget 套件 ID 可能會變動；若安裝失敗，請改用上方官方下載頁。

### macOS 安裝方式

建議使用 Homebrew：

```bash
brew install --cask libreoffice
brew install ffmpeg tesseract qpdf
```

安裝後可用以下指令確認：

```bash
/Applications/LibreOffice.app/Contents/MacOS/soffice --version
ffmpeg -version
tesseract --version
qpdf --version
```

如果要做中文 OCR，可再安裝語言資料：

```bash
brew install tesseract-lang
```

然後在 SwiftLocal 的 OCR 語言欄輸入：

```text
chi_tra
chi_sim
```

## 開發者快速開始

### 安裝依賴

```bash
npm install
```

### 啟動桌面 App

```bash
npm run desktop
```

Windows PowerShell 若擋下 `npm.ps1`，可改用：

```powershell
npm.cmd run desktop
```

### 啟動瀏覽器版前端

```bash
npm run start
```

預設網址：

```text
http://127.0.0.1:4173
```

### 啟動 FastAPI 後端

桌面版會優先使用 Electron bridge，不需要另外啟動 FastAPI。瀏覽器模式若需要後端功能，先安裝 Python 依賴：

```bash
python -m pip install -r backend/requirements.txt
```

Windows 可使用：

```powershell
python -m pip install -r backend\requirements.txt
```

啟動方式：

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8787
```

Windows 也可使用現有腳本：

```powershell
npm run backend
```

預設後端網址：

```text
http://127.0.0.1:8787
```

## 打包

### Windows

產生 portable EXE 與 installer：

```powershell
npm run pack:win
```

分開打包：

```powershell
npm run pack:win:portable
npm run pack:win:installer
```

只產生未封裝目錄：

```powershell
npm run pack:win:dir
```

輸出位置：

```text
dist/
```

### macOS

目前 `package.json` 尚未定義 macOS 打包 target，因此沒有正式 `.dmg` / `.pkg` 輸出。若要支援 macOS 發佈，需要後續新增 electron-builder 的 macOS 設定、圖示、簽章與 notarization 流程。

## 發佈前檢查清單

- `package.json` 的 `version` 已更新。
- `npm run desktop` 可正常開啟。
- 以下語法檢查通過：

```bash
node --check frontend/app.js
node --check desktop/main.js
node --check desktop/preload.js
node --check desktop/backend.js
```

- PDF 後端任務可執行：合併、分割、旋轉、壓縮、Office 轉換、PDF 轉 Office。
- 缺少 LibreOffice、FFmpeg、Tesseract 或 QPDF 時，App 會顯示清楚錯誤。
- 手動指定外部工具路徑後，相關任務可正常執行。
- Windows 打包成功產生 portable 與 installer。
- installer 可安裝、啟動、解除安裝。
- portable EXE 可雙擊開啟。

## 專案結構

```text
frontend/   主介面、前端腳本、樣式、圖示與 vendor 資源
desktop/    Electron 桌面殼、preload、桌面本機任務處理器
backend/    瀏覽器模式可選用的 FastAPI 後端
scripts/    開發用啟動腳本
build/      Windows 打包資源，例如 icon.ico
dist/       打包輸出，不納入版本控制
```

## 外部工具路徑與環境變數

App 會依序檢查：

1. 使用者在「後端設定」手動指定的路徑。
2. 環境變數。
3. 平台常見安裝路徑。
4. 系統 PATH。

Windows 範例：

```powershell
$env:SWIFTLOCAL_LIBREOFFICE="C:\Program Files\LibreOffice\program\soffice.exe"
$env:SWIFTLOCAL_FFMPEG="C:\ffmpeg\bin\ffmpeg.exe"
$env:SWIFTLOCAL_TESSERACT="C:\Program Files\Tesseract-OCR\tesseract.exe"
$env:SWIFTLOCAL_QPDF="C:\Program Files\qpdf\bin\qpdf.exe"
```

macOS / Linux 範例：

```bash
export SWIFTLOCAL_LIBREOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"
export SWIFTLOCAL_FFMPEG="/opt/homebrew/bin/ffmpeg"
export SWIFTLOCAL_TESSERACT="/opt/homebrew/bin/tesseract"
export SWIFTLOCAL_QPDF="/opt/homebrew/bin/qpdf"
```

桌面版工具設定會保存在 Electron 的 userData 目錄。瀏覽器模式 FastAPI 的工具設定會保存在 `backend/tools.json`。

## FastAPI API 摘要

瀏覽器模式可使用 FastAPI 後端。主要 API：

- `GET /api/health`
- `GET /api/tools`
- `PUT /api/tools/{key}`
- `DELETE /api/tools/{key}`
- `POST /api/jobs`
- `GET /api/jobs`
- `GET /api/jobs/{job_id}`
- `GET /api/jobs/{job_id}/outputs/{filename}`
- `DELETE /api/jobs/{job_id}`

FastAPI 暫存檔案位於 `backend/temp/jobs/{job_id}`。任務佇列只存在記憶體中，重啟後任務狀態不保留。

## 維護備註

- Windows 是目前唯一已有正式打包腳本的平台。
- LibreOffice 體積很大，第一版不建議內建到 installer。
- 若日後要內建外部工具，需要重新評估安裝包大小、授權、更新方式與防毒誤判風險。
- 正式公開發佈 Windows 前，建議加入 code signing certificate，降低 SmartScreen 警告。
- 正式公開發佈 macOS 前，需要處理 Developer ID 簽章與 notarization。
- 若要穩定長期維護，建議將 `electron` 與 `electron-builder` 從 `latest` 改成固定版本。
