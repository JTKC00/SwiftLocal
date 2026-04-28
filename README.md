# 快轉通 SwiftLocal

SwiftLocal 是本地全能格式轉換工具箱。前端可用瀏覽器或 Electron 桌面殼開啟；需要外部程式的轉換功能由本機 FastAPI 後端處理，檔案只會送到 `127.0.0.1`。

## 功能

### 前端（無須後端）

| 功能 | 說明 |
|------|------|
| PDF 工具 | 合併、分割、旋轉、圖片轉 PDF、提取頁面（pdf-lib + PDF.js） |
| 圖片壓縮 | 瀏覽器端 JPEG/WebP 壓縮，可調品質 |
| 文字工具 | 字數統計、繁簡轉換、大小寫轉換 |
| 資料轉換 | JSON ↔ YAML ↔ CSV、Base64、URL 編碼 |
| ZIP 打包 | 批次打包下載，支援 Deflate 壓縮（DEFLATE-raw） |
| 改名工具 | 批次重新命名，含序號、替換、前後綴 |
| 工具箱 | 顏色格式轉換（HEX/RGB/HSL）、UUID 批次產生、QR Code 產生與下載 |

### 後端（需要 FastAPI + 外部工具）

| 功能 | 需要工具 |
|------|----------|
| Office → PDF | LibreOffice |
| PDF → Word / Excel | LibreOffice |
| PDF 分割 / 旋轉 / 加密解密 | LibreOffice |
| 圖片格式轉換 | FFmpeg |
| 圖片 OCR → TXT | Tesseract |
| 音訊 / 影片格式轉換 | FFmpeg |

### UX

- **Toast 通知**：操作結果以浮動提示取代瀏覽器 `alert()`
- **暗色模式**：側欄切換按鈕，設定儲存於 `localStorage`
- **拖放支援**：所有上傳區均支援拖放檔案
- **剪貼簿貼上**：在圖片面板可直接 Ctrl+V 貼上截圖
- **後端任務刪除**：已完成或失敗的任務可直接刪除

## 專案結構

- `frontend/`：瀏覽器介面、前端腳本、樣式與本地 vendor 資源。
- `backend/`：FastAPI 後端、routers、services、Python 依賴與暫存目錄。
- `desktop/`：Electron 桌面殼、preload 與桌面輔助 IPC。
- `scripts/`：Windows 啟動腳本與前端靜態伺服器。
- `docs/`：規劃、架構與操作文件。
- `tools/`：本機下載或解壓的外部工具，已被 Git 忽略。

## 需求

- Node.js，用於前端靜態伺服器與 Electron。
- Python 3.10 或以上，用於 FastAPI 後端。
- 視功能安裝外部工具：
  - LibreOffice：Office → PDF。
  - FFmpeg：音訊 / 影片轉換。
  - Tesseract：圖片 OCR → TXT。

LibreOffice 官方 Windows MSI 通常需要管理員權限。若無法安裝到 `C:\Program Files\LibreOffice`，Office → PDF 會保持不可用，直到在「本地後端」面板手動指定可正常執行的 `soffice.exe` / `soffice.com`。

## 安裝

```powershell
npm install
python -m pip install -r backend\requirements.txt
```

如果 `python` 不在 PATH，請先安裝 Python 3.10+，並勾選 Add Python to PATH。

如果 Windows Store 的 `python.exe` alias 排在 PATH 前面，可指定實際 Python：

```powershell
$env:SWIFTLOCAL_PYTHON="C:\Users\sgeus\AppData\Local\Python\pythoncore-3.14-64\python.exe"
```

## 啟動

啟動前端：

```powershell
npm run start
```

啟動 FastAPI 後端：

```powershell
scripts\start-backend.cmd
```

或：

```powershell
npm run backend
```

後端固定監聽：

```text
http://127.0.0.1:8787
```

前端固定監聽：

```text
http://127.0.0.1:4173
```

也可用 `npm run dev:all` 同時開啟後端視窗與前端伺服器。

## FastAPI 後端

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

暫存檔案位於 `backend/temp/jobs/{job_id}`。任務佇列只存在記憶體中，重啟後任務狀態不保留。

## 工具路徑

FastAPI 會依序使用：

1. 前端「本地後端」面板手動設定的路徑。
2. 環境變數：
   - `SWIFTLOCAL_LIBREOFFICE`
   - `SWIFTLOCAL_FFMPEG`
   - `SWIFTLOCAL_TESSERACT`
3. Windows 常見安裝路徑。
4. 系統 PATH。

手動設定會寫入 `backend/tools.json`，此檔案不會提交到 Git。


- `frontend/`：瀏覽器介面、前端腳本、樣式與本地 vendor 資源。
- `backend/`：FastAPI 後端、routers、services、Python 依賴與暫存目錄。
- `desktop/`：Electron 桌面殼、preload 與桌面輔助 IPC。
- `scripts/`：Windows 啟動腳本與前端靜態伺服器。
- `docs/`：規劃、架構與操作文件。
- `tools/`：本機下載或解壓的外部工具，已被 Git 忽略。

## 需求

- Node.js，用於前端靜態伺服器與 Electron。
- Python 3.10 或以上，用於 FastAPI 後端。
- 視功能安裝外部工具：
  - LibreOffice：Office → PDF。
  - FFmpeg：音訊 / 影片轉換。
  - Tesseract：圖片 OCR → TXT。

LibreOffice 官方 Windows MSI 通常需要管理員權限。若無法安裝到 `C:\Program Files\LibreOffice`，Office → PDF 會保持不可用，直到在「本地後端」面板手動指定可正常執行的 `soffice.exe` / `soffice.com`。

## 安裝

```powershell
npm install
python -m pip install -r backend\requirements.txt
```

如果 `python` 不在 PATH，請先安裝 Python 3.10+，並勾選 Add Python to PATH。

如果 Windows Store 的 `python.exe` alias 排在 PATH 前面，可指定實際 Python：

```powershell
$env:SWIFTLOCAL_PYTHON="C:\Users\sgeus\AppData\Local\Python\pythoncore-3.14-64\python.exe"
```

## 啟動

啟動前端：

```powershell
npm run start
```

啟動 FastAPI 後端：

```powershell
scripts\start-backend.cmd
```

或：

```powershell
npm run backend
```

後端固定監聽：

```text
http://127.0.0.1:8787
```

前端固定監聽：

```text
http://127.0.0.1:4173
```

也可用 `npm run dev:all` 同時開啟後端視窗與前端伺服器。

## FastAPI 後端

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

暫存檔案位於 `backend/temp/jobs/{job_id}`。任務佇列只存在記憶體中，重啟後任務狀態不保留。

## 工具路徑

FastAPI 會依序使用：

1. 前端「本地後端」面板手動設定的路徑。
2. 環境變數：
   - `SWIFTLOCAL_LIBREOFFICE`
   - `SWIFTLOCAL_FFMPEG`
   - `SWIFTLOCAL_TESSERACT`
3. Windows 常見安裝路徑。
4. 系統 PATH。

手動設定會寫入 `backend/tools.json`，此檔案不會提交到 Git。
