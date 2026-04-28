# SwiftLocal

SwiftLocal 是一個本機檔案轉換工具箱，提供圖片、PDF、文件、文字、資料格式、壓縮、雜湊與小工具等常用功能。它可以用瀏覽器開啟，也可以打包成 Windows 桌面 App。

重點是：檔案主要在你的電腦本機處理。桌面版會優先使用 Electron 內建的本機任務處理器，一般使用者不需要另外開命令列。

## 適合誰使用

- 想快速轉換圖片、PDF、Office、音訊或影片格式的人。
- 想要一個離線優先、不把檔案上傳到雲端的工具箱。
- 想把常見文件處理流程整合成 Windows 桌面 App 的開發者。

## 功能總覽

### 內建功能

這些功能不需要另外安裝大型外部工具。

| 類別 | 功能 |
| --- | --- |
| 圖片 | 轉 JPG / PNG / WebP、壓縮、縮放、旋轉、浮水印 |
| PDF 基礎處理 | 合併、分割、抽頁、旋轉、加浮水印、加頁碼、轉圖片、抽文字 |
| PDF 後端處理 | 合併、分割、旋轉、壓縮 |
| 資料格式 | JSON / CSV / XML 格式化與互轉 |
| 文字 | Base64、URL 編碼、HTML escape、搜尋取代、行處理、統計 |
| ZIP / Hash | 建立 ZIP、計算檔案校驗值 |
| 小工具 | 顏色格式、UUID、QR Code |

### 需要外部工具的功能

這些功能仍然在 App 內操作，但需要本機安裝對應工具。工具未安裝時，App 會顯示「未找到」或明確錯誤，不會因此崩潰。

| 功能 | 需要工具 | 常見執行檔 |
| --- | --- | --- |
| Office → PDF | LibreOffice | `soffice.exe` |
| PDF → DOCX / Office 格式 | LibreOffice | `soffice.exe` |
| 音訊 / 影片格式轉換 | FFmpeg | `ffmpeg.exe` |
| 圖片 OCR → TXT | Tesseract | `tesseract.exe` |
| PDF 加密 / 解密 | QPDF | `qpdf.exe` |

可在 App 的「後端設定」面板按「偵測工具」，或手動指定工具路徑。

## 使用方式

### Windows 桌面版

打包後會在 `dist/` 產生兩種檔案：

- `SwiftLocal-0.1.0-portable-x64.exe`：免安裝版，雙擊即可使用。
- `SwiftLocal-0.1.0-installer-x64.exe`：安裝程式，會建立開始功能表與桌面捷徑。

第一次使用建議：

1. 開啟 App。
2. 到「後端設定」按「偵測工具」。
3. 若 LibreOffice、FFmpeg、Tesseract 或 QPDF 顯示未找到，先安裝對應工具，或手動指定執行檔路徑。
4. 回到需要的功能面板執行轉換。

目前沒有程式碼簽章，所以 Windows SmartScreen 可能顯示「未知發行者」。這是未簽章 App 的正常提醒，不代表檔案損壞。

### 開發模式

安裝 Node.js 依賴：

```powershell
npm install
```

啟動桌面 App：

```powershell
npm run desktop
```

如果 PowerShell 擋下 `npm.ps1`，可改用：

```powershell
npm.cmd run desktop
```

## 瀏覽器模式與 FastAPI 後端

SwiftLocal 也可以用瀏覽器模式開發或測試。

啟動前端：

```powershell
npm run start
```

預設前端網址：

```text
http://127.0.0.1:4173
```

若瀏覽器模式需要 FastAPI 後端，先安裝 Python 依賴：

```powershell
python -m pip install -r backend\requirements.txt
```

啟動 FastAPI：

```powershell
npm run backend
```

預設後端網址：

```text
http://127.0.0.1:8787
```

如果 Windows Store 的 `python.exe` alias 排在 PATH 前面，可指定實際 Python：

```powershell
$env:SWIFTLOCAL_PYTHON="C:\Users\你\AppData\Local\Python\python.exe"
```

桌面版會優先使用 Electron bridge，不需要另外啟動 FastAPI。

## 打包 Windows App

產生免安裝版與安裝程式：

```powershell
npm run pack:win
```

分開打包：

```powershell
npm run pack:win:portable
npm run pack:win:installer
```

只產生未封裝目錄，方便快速檢查內容：

```powershell
npm run pack:win:dir
```

輸出位置：

```text
dist/
```

如果 PowerShell 擋下 `npm.ps1`，可改用：

```powershell
npm.cmd run pack:win
```

如果打包時遇到 `spawn EPERM`，通常是打包工具需要啟動額外子程序。請改用允許子程序執行的終端或提高執行權限後重試。

## 發佈前檢查清單

每次發佈前至少確認：

- `package.json` 的 `version` 已更新。
- `npm run desktop` 可正常開啟。
- 以下語法檢查通過：

```powershell
node --check frontend/app.js
node --check desktop/main.js
node --check desktop/preload.js
node --check desktop/backend.js
```

- PDF 後端任務可執行：合併、分割、旋轉、壓縮、Office 轉換、PDF 轉 Office。
- 缺少 LibreOffice、FFmpeg、Tesseract 或 QPDF 時，App 會顯示清楚錯誤。
- 手動指定外部工具路徑後，相關任務可正常執行。
- `npm run pack:win` 成功產生 portable 與 installer。
- installer 可安裝、啟動、解除安裝。
- portable EXE 可雙擊開啟。

## 專案結構

```text
frontend/   主介面、前端腳本、樣式、圖示與 vendor 資源
desktop/    Electron 桌面殼、preload、桌面本機任務處理器
backend/    瀏覽器模式可選用的 FastAPI 後端
scripts/    開發用啟動腳本
build/      Windows 打包資源，例如 icon.ico
dist/       Windows 打包輸出，不納入版本控制
```

## 外部工具路徑

App 會依序檢查：

1. 使用者在「後端設定」手動指定的路徑。
2. 環境變數。
3. Windows 常見安裝路徑。
4. 系統 PATH。

可用環境變數：

```powershell
$env:SWIFTLOCAL_LIBREOFFICE="C:\Program Files\LibreOffice\program\soffice.exe"
$env:SWIFTLOCAL_FFMPEG="C:\ffmpeg\bin\ffmpeg.exe"
$env:SWIFTLOCAL_TESSERACT="C:\Program Files\Tesseract-OCR\tesseract.exe"
$env:SWIFTLOCAL_QPDF="C:\Program Files\qpdf\bin\qpdf.exe"
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

- LibreOffice 體積很大，第一版不建議內建到 installer。
- 若日後要內建外部工具，需要重新評估安裝包大小、授權、更新方式與防毒誤判風險。
- 正式公開發佈前，建議加入 code signing certificate，降低 SmartScreen 警告。
- 若要穩定長期維護，建議將 `electron` 與 `electron-builder` 從 `latest` 改成固定版本。
