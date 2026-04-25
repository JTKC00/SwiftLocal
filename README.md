# 快轉通 SwiftLocal

SwiftLocal 是本地全能格式轉換工具箱。前端可用瀏覽器或 Electron 桌面殼開啟；需要外部程式的轉換功能由本機 FastAPI 後端處理，檔案只會送到 `127.0.0.1`。

## 需求

- Node.js，用於前端靜態伺服器與 Electron。
- Python 3.10 或以上，用於 FastAPI 後端。
- 視功能安裝外部工具：
  - LibreOffice：Office → PDF。
  - FFmpeg：音訊 / 影片轉換。
  - Tesseract：圖片 OCR → TXT。

## 安裝

```powershell
npm install
python -m pip install -r requirements.txt
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
start-backend.cmd
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
