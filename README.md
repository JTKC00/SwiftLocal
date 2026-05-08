# SwiftLocal

SwiftLocal 是一個本機優先的檔案工具箱。它把常用的圖片、PDF、文件、影音、文字、資料格式、ZIP、雜湊與小工具集中到一個介面中，讓使用者不用記命令列也能完成日常檔案處理。

它不是要取代 LibreOffice、FFmpeg、Tesseract 或 QPDF，而是把這些成熟工具整合成比較容易使用的桌面工作台。Windows 打包版可以隨 app 內建 FFmpeg、Tesseract 與 QPDF，因此一般使用者通常不需要另外安裝這三個工具。LibreOffice 因為體積較大，建議做成可選安裝或可選內建。

## 平台狀態

| 平台 | 目前狀態 | 說明 |
| --- | --- | --- |
| Windows | 已支援桌面打包 | 可產生 portable EXE 與 installer。 |
| macOS | 已支援本機打包 | 可在 macOS 上產生 unsigned `.dmg`。 |
| Linux | 未正式整理 | Electron / 瀏覽器模式理論上可跑，但尚未整理正式發佈流程。 |

## 功能總覽

### 內建功能

| 類別 | 功能 |
| --- | --- |
| 圖片 | JPG / PNG / WebP 轉換、壓縮、縮放、旋轉、浮水印 |
| PDF | 合併、分割、抽頁、旋轉、加浮水印、加頁碼、轉圖片、抽文字 |
| PDF 後端 | 合併、分割、旋轉、壓縮、PDF 文字匯出成 DOCX |
| 資料格式 | JSON / CSV / XML 格式化與互轉 |
| 文字 | Base64、URL 編碼、HTML escape、搜尋取代、行處理、統計 |
| ZIP / Hash | 建立 ZIP、計算檔案校驗值 |
| 進階分片 | 將原始檔案切成多個 part 分片；需之後完整合併才能還原 |
| 小工具 | 顏色格式、UUID、QR Code |

### 依賴本機工具的功能

| 功能 | 工具 | Windows 建議策略 | 常見執行檔 |
| --- | --- | --- | --- |
| Office → PDF | LibreOffice | 可選安裝或可選內建 | `soffice.exe` / `soffice` |
| 音訊 / 影片格式轉換 | FFmpeg | 建議內建 | `ffmpeg.exe` / `ffmpeg` |
| 圖片格式轉換（後端） | FFmpeg | 建議內建 | `ffmpeg.exe` / `ffmpeg` |
| 圖片 OCR → TXT | Tesseract | 建議內建 | `tesseract.exe` / `tesseract` |
| PDF 加密 / 解密 | QPDF | 建議內建 | `qpdf.exe` / `qpdf` |

工具找不到時，SwiftLocal 會顯示清楚狀態與錯誤，不會直接崩潰。

## 一般使用者

### Windows

目前建議對外提供單一 Windows 版本：

| 版本 | 內建工具 | 適合對象 |
| --- | --- | --- |
| Windows installer | FFmpeg、Tesseract、QPDF、LibreOffice | 一般朋友試用與日常使用 |

目前建議交付的 Windows 成品會在 `dist/` 產生：

- `SwiftLocal-0.1.0-portable-x64.exe`：免安裝版，雙擊即可使用。
- `SwiftLocal-0.1.0-installer-x64.exe`：安裝版，會建立開始功能表與桌面捷徑。
- `win-unpacked/`：未封裝資料夾，主要供開發測試，不建議作為正式發佈檔。

第一次使用建議：

1. 開啟 SwiftLocal。
2. 到「工具狀態」面板按「偵測工具」。
3. 如果 FFmpeg、Tesseract、QPDF、LibreOffice 顯示「內建」或「可用」，可直接使用相關功能。
4. 如果 LibreOffice 顯示未找到，只有 Office → PDF 會受影響；可另外安裝 LibreOffice 後再偵測一次工具。
5. 回到需要的功能面板執行轉換。

目前沒有程式碼簽章，所以 Windows SmartScreen 可能顯示「未知發行者」。這是未簽章 App 的正常提醒，不代表檔案損壞。

### macOS

目前 repo 已準備好 macOS 打包腳本，但實際產生 `.dmg` 或簽章版本，仍需要在一台 Mac 上執行。

也就是說：

- 現在可以先在 Mac 上跑開發模式與測試功能
- 今晚回到 Mac 後，再執行打包與簽章相關流程

在 macOS 本機可建立 unsigned 安裝包：

```bash
npm run pack:mac
```

也可分開產生：

```bash
npm run pack:mac:dmg
npm run pack:mac:dir
```

若你已在這台 Mac 登入 Apple Developer 憑證，並準備做正式發佈版，可改用：

```bash
npm run pack:mac:signed
```

只測已簽章 app 目錄：

```bash
npm run pack:mac:dir:signed
```

打包輸出位置：

```text
dist/
```

如果你今晚回到 Mac 前，只想先確認專案能跑，開發模式仍可直接執行：

```bash
npm install
npm run desktop
```

若只想用瀏覽器介面：

```bash
npm run start
```

預設網址：

```text
http://127.0.0.1:4173
```

如果桌面版偵測不到外部工具，可在「工具狀態」面板的進階區手動指定路徑。Homebrew 常見位置如下：

```text
/opt/homebrew/bin/ffmpeg
/opt/homebrew/bin/tesseract
/opt/homebrew/bin/qpdf
/Applications/LibreOffice.app/Contents/MacOS/soffice
```

Intel Mac 也可能在：

```text
/usr/local/bin/ffmpeg
/usr/local/bin/tesseract
/usr/local/bin/qpdf
```

## Windows 打包前的工具佈局

如果要讓朋友安裝後直接可用，打包前請先把 portable 工具放進專案根目錄的 `tools/`。`electron-builder` 會把整個資料夾複製到 app 的 `resources/tools/`，桌面版啟動後會自動偵測。

建議結構：

```text
tools/
  ffmpeg/
    bin/
      ffmpeg.exe
  tesseract/
    tesseract.exe
    tessdata/
      eng.traineddata
      chi_tra.traineddata
      chi_sim.traineddata
  qpdf/
    bin/
      qpdf.exe
```

如果你直接把官方 release zip 解開在 `tools/qpdf/`、`tools/ffmpeg/`、`tools/tesseract/` 之類的資料夾下，即使中間多一層版本號資料夾，或另外放在 `tools/` 底下的子資料夾，SwiftLocal 也會嘗試自動搜尋常見執行檔位置。

LibreOffice 可選內建：

```text
tools/
  libreoffice/
    program/
      soffice.exe
```

macOS 若要把 LibreOffice 一起放入 `tools/`，建議結構如下：

```text
tools/
  LibreOffice.app/
    Contents/
      MacOS/
        soffice
```

`tools/` 目錄的擺放方式也整理在 [tools/README.md](C:/~/SwiftLocal/tools/README.md)。

## 外部工具安裝

### Windows

#### LibreOffice

用途：Office → PDF

1. 到 [LibreOffice 官方下載頁](https://www.libreoffice.org/download/)。
2. 選擇 `Windows (64-bit)`。
3. 用預設選項安裝。

常見路徑：

```text
C:\Program Files\LibreOffice\program\soffice.exe
```

#### FFmpeg

用途：音訊 / 影片格式轉換

1. 到 [FFmpeg 官方下載頁](https://ffmpeg.org/download.html)。
2. 在 `Windows EXE Files` 區域選擇 Windows build，例如 `gyan.dev` 或 `BtbN`。
3. 下載 release build，解壓縮到固定位置。

常見路徑：

```text
C:\ffmpeg\bin\ffmpeg.exe
```

#### Tesseract

用途：圖片 OCR → TXT

1. 到 [Tesseract Downloads](https://tesseract-ocr.github.io/tessdoc/Downloads.html)。
2. 依文件前往 `UB Mannheim` 的 Windows installer。
3. 安裝時勾選需要的語言資料。

常見路徑：

```text
C:\Program Files\Tesseract-OCR\tesseract.exe
```

中文 OCR 常用語言代碼：

```text
chi_tra
chi_sim
```

#### QPDF

用途：PDF 加密 / 解密

1. 到 [QPDF GitHub Releases](https://github.com/qpdf/qpdf/releases)。
2. 下載 Windows 版本的 zip 或 installer。
3. 安裝或解壓縮到固定位置。

常見路徑：

```text
C:\Program Files\qpdf\bin\qpdf.exe
```

#### winget

如果系統已安裝 `winget`，也可以試試：

```powershell
winget install -e --id LibreOffice.LibreOffice
winget install -e --id Gyan.FFmpeg
winget install -e --id UB-Mannheim.TesseractOCR
winget install -e --id QPDF.QPDF
```

如果套件 ID 變動或安裝失敗，請回到上方官方下載頁。

### macOS

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

### 啟動桌面版

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

啟動方式：

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8787
```

Windows 也可使用現有腳本；現在 `npm run backend` 也支援 macOS：

```powershell
npm run backend
```

預設後端網址：

```text
http://127.0.0.1:8787
```

## 打包

### Windows

目前建議對外只發佈 `dist/` 內的單一 Windows installer，預設打包 FFmpeg、Tesseract、QPDF、LibreOffice。

產生 portable EXE 與 installer：

```powershell
npm run pack:win
```

只產生未封裝目錄：

```powershell
npm run pack:win:dir
```

分開打包：

```powershell
npm run pack:win:portable
npm run pack:win:installer
```

輸出位置：

```text
dist/
```

如果你仍想保留額外的打包流程做內部測試，可以另外使用：

```powershell
npm run pack:win:full
npm run pack:win:full:dir
npm run pack:win:full:portable
npm run pack:win:full:installer
```

這些額外腳本會輸出到：

```text
dist-full/
```

### macOS

macOS 現在只保留 `dmg` target，但這些流程需要在實際的 Mac 機器上執行。第一次發佈時會先產生 unsigned 成品；若要給外部使用者較順利安裝，下一步仍建議補上 Apple Developer ID 簽章與 notarization。

如果你回到 Mac 後，想保留額外的 macOS bundled-tools 打包流程做內部測試，可以另外使用：

```bash
npm run pack:mac:full
npm run pack:mac:full:dir
npm run pack:mac:full:dmg
```

這些額外腳本會輸出到：

```text
dist-full/
```

若要啟用簽章，先在 macOS Keychain 安裝 `Developer ID Application` 憑證，然後用 signed 腳本：

```bash
npm run pack:mac:signed
```

若要連 notarization 一起做，另外提供以下其中一組環境變數後再執行 signed 腳本：

Apple ID 方式：

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID1234"
npm run pack:mac:signed
```

App Store Connect API key 方式：

```bash
export APPLE_API_KEY="/absolute/path/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"
npm run pack:mac:signed
```

目前 repo 內建的規則是：

- `npm run pack:mac` 會維持 unsigned，避免開發機沒有憑證時卡住。
- `npm run pack:mac:signed` 才會啟用 hardened runtime 與簽章流程。
- 若 signed 模式同時偵測到 `APPLE_*` notarization 憑證，`electron-builder` 會自動送 Apple notarize。

## 工具偵測順序

App 會依序檢查：

1. 使用者在「工具狀態」進階區手動指定的路徑
2. 環境變數
3. 打包版 `resources/tools/` 或開發模式 `tools/` 內的工具
4. 平台常見安裝路徑
5. 系統 `PATH`

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

桌面版工具設定會保存在 Electron 的 `userData` 目錄。瀏覽器模式 FastAPI 的工具設定會保存在 `backend/tools.json`。

## 專案結構

```text
frontend/   主介面、前端腳本、樣式與 vendor 資源
desktop/    Electron 桌面殼、preload、桌面本機任務處理器
backend/    瀏覽器模式可選用的 FastAPI 後端
scripts/    開發用啟動腳本
build/      打包資源，例如 Windows icon.ico
tools/      可選的內建 FFmpeg、Tesseract、QPDF 與 LibreOffice
dist/       打包輸出，不納入版本控制
```

## FastAPI API

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

## 發佈前檢查

- `package.json` 的 `version` 已更新
- `npm run desktop` 可正常開啟
- 以下語法檢查通過：

```bash
node --check frontend/app.js
node --check desktop/main.js
node --check desktop/preload.js
node --check desktop/backend.js
```

- PDF 後端任務可執行：合併、分割、旋轉、壓縮、Office → PDF、PDF → DOCX（文字）
- 缺少 LibreOffice、FFmpeg、Tesseract 或 QPDF 時，App 會顯示清楚狀態與錯誤
- 手動指定外部工具路徑後，相關任務可正常執行
- Windows 打包成功產生 portable 與 installer
- macOS 打包成功產生 `.dmg`
- 若要正式外發，macOS signed build 可成功完成 code signing；有 `APPLE_*` 憑證時可完成 notarization

## 維護備註

- Windows 與 macOS 都已整理基本打包腳本
- LibreOffice 體積很大，一般 installer 預設不建議內建
- 內建 FFmpeg、Tesseract、QPDF 前，需要確認各工具授權、更新方式與防毒誤判風險
- 正式公開發佈 Windows 前，建議加入 code signing certificate，降低 SmartScreen 警告
- 正式公開發佈 macOS 前，需要處理 Developer ID 簽章與 notarization
- 若要穩定長期維護，建議將 `electron` 與 `electron-builder` 從 `latest` 改成固定版本
