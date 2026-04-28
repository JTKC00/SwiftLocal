# 快轉通 SwiftLocal

SwiftLocal 是本地全能格式轉換工具箱。它可以用瀏覽器開啟，也可以打包成真正的 Windows 桌面程式。檔案處理以本機為主；桌面版會優先使用 Electron 內建的本機任務處理器，不需要普通用戶另外開命令列。

## 功能

### 不需要外部工具

| 功能 | 說明 |
|------|------|
| 圖片工具 | 圖片轉 JPG / PNG / WebP、壓縮、調整尺寸、旋轉、浮水印 |
| PDF 基礎工具 | 合併、分割、抽頁、旋轉、轉圖片、加頁碼、加浮水印 |
| 文字工具 | 編碼 / 解碼、搜尋取代、繁簡轉換等 |
| 資料工具 | JSON / CSV / XML 格式化與互轉 |
| ZIP / Hash | 打包 ZIP、計算檔案校驗值 |
| 其他工具 | 顏色格式、UUID、QR Code |

### 需要外部工具

這些功能在桌面版會整合在 App 內操作，但不會把大型外部工具內建到安裝包：

| 功能 | 需要工具 |
|------|----------|
| Office → PDF | LibreOffice |
| 音訊 / 影片格式轉換 | FFmpeg |
| 圖片 OCR → TXT | Tesseract |

如果工具未安裝，相關功能會顯示未偵測到。使用者可以安裝工具，或在「後端設定」面板手動指定 `soffice.exe`、`ffmpeg.exe`、`tesseract.exe` 的位置。

## 專案結構

- `frontend/`：主介面、前端腳本、樣式、圖示與 vendor 資源。
- `desktop/`：Electron 桌面殼、preload、桌面本機任務處理器。
- `backend/`：瀏覽器模式可選用的 FastAPI 後端。
- `scripts/`：開發用啟動腳本。
- `build/`：Windows 打包資源，例如 `icon.ico`。
- `dist/`：Windows 打包輸出，執行打包後才會出現。

## 開發環境

安裝 Node.js 依賴：

```powershell
npm install
```

如果你要使用瀏覽器模式的 FastAPI 後端，另需 Python 3.10+：

```powershell
python -m pip install -r backend\requirements.txt
```

如果 Windows Store 的 `python.exe` alias 排在 PATH 前面，可指定實際 Python：

```powershell
$env:SWIFTLOCAL_PYTHON="C:\Users\你\AppData\Local\Python\python.exe"
```

## 啟動方式

啟動桌面 App：

```powershell
npm run desktop
```

啟動瀏覽器版前端：

```powershell
npm run start
```

瀏覽器版若需要 FastAPI 後端：

```powershell
npm run backend
```

預設網址：

```text
前端：http://127.0.0.1:4173
FastAPI：http://127.0.0.1:8787
```

## Windows App 打包

第一版目標是同時輸出兩種 Windows 程式：

- **免安裝版 Portable EXE**：下載後雙擊即可使用，適合快速測試或分享。
- **安裝程式 Installer**：會建立開始功能表 / 桌面捷徑，比較像正式軟件。

產生兩者：

```powershell
npm run pack:win
```

只產生免安裝 EXE：

```powershell
npm run pack:win:portable
```

只產生安裝程式：

```powershell
npm run pack:win:installer
```

只產生未封裝目錄，用來快速檢查內容：

```powershell
npm run pack:win:dir
```

輸出位置：

```text
dist/
```

如果打包機空間較小，`npm run pack:win` 可能因為同時保留 installer、portable、`win-unpacked` 和 NSIS 中間檔而失敗。這時可以清空 `dist/`，再分別執行 `npm run pack:win:installer` 和 `npm run pack:win:portable`。

目前沒有做程式碼簽章，所以 Windows SmartScreen 可能顯示「未知發行者」。這不是程式壞掉，而是 Windows 對未簽章 App 的正常提醒。正式公開發佈前，應申請 code signing certificate 並加入簽章流程。

## 發佈前檢查清單

每次發佈前，請至少檢查：

- `package.json` 的 `version` 是否已升版。
- `frontend/assets/swiftlocal-logo.png` 和 `build/icon.ico` 是否是最新 logo。
- `npm run desktop` 可正常開啟。
- `node --check frontend/app.js`、`node --check desktop/main.js`、`node --check desktop/backend.js` 通過。
- `npm run pack:win:portable` 產生的 EXE 可雙擊開啟。
- `npm run pack:win:installer` 產生的安裝程式可安裝、啟動、解除安裝。
- 沒有安裝 LibreOffice / FFmpeg / Tesseract 時，App 不會崩潰，並清楚顯示未偵測到。
- 手動指定外部工具路徑後，相關任務可執行。

## 日後維護

### 升版本

每次準備發佈新版，先改 `package.json`：

```json
"version": "0.1.1"
```

版本號建議：

- 小修 bug：`0.1.0` → `0.1.1`
- 新增小功能：`0.1.0` → `0.2.0`
- 大改版或不相容：`1.0.0` → `2.0.0`

改完版本後重新打包：

```powershell
npm run pack:win
```

### 更新 Electron / electron-builder

目前使用 `latest`，日後若要穩定維護，建議改成固定版本，例如：

```json
"electron": "x.y.z",
"electron-builder": "x.y.z"
```

更新後要重新測：

- 桌面 App 是否能啟動。
- preload bridge 是否可用。
- 打包後 portable / installer 是否能開。
- Windows 防毒或 SmartScreen 是否有新警告。

### 更新 logo 或 icon

流程：

1. 更新 `frontend/assets/swiftlocal-logo.png`。
2. 用 PNG 重新產生 `build/icon.ico`。
3. 執行 `npm run pack:win`。
4. 檢查 EXE、installer、工作列、開始功能表圖示是否更新。

### 外部工具維護

SwiftLocal 第一版不內建 LibreOffice、FFmpeg、Tesseract。日後若功能失效，先檢查：

- 使用者是否已安裝相關工具。
- 工具路徑是否仍然存在。
- App 的「後端設定」面板是否偵測到工具。
- 工具本身是否能在命令列執行，例如 `ffmpeg -version`。

LibreOffice 體積很大，不建議第一版打包進 installer。若日後要內建，需重新評估安裝包大小、授權、更新方式和防毒誤判風險。

### 舊版本升級測試

正式發佈前，建議保留上一版 installer，測試：

- 舊版可正常解除安裝。
- 新版可安裝到同一台電腦。
- 開始功能表與桌面捷徑沒有重複或失效。
- 使用者先前設定的工具路徑仍可正常讀取。

## FastAPI 後端 API

瀏覽器模式可使用 FastAPI 後端。桌面版會優先使用 Electron 本機 bridge。

主要 API：

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
