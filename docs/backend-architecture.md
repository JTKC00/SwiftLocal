# 快轉通 SwiftLocal 本地後端架構

本文描述 **FastAPI 後端** 與 **Electron 桌面內建後端** 的現況（對齊程式碼，非早期規劃草稿）。

## 雙後端模式

| 模式 | 進入方式 | 任務執行 | 工具偵測 |
| --- | --- | --- | --- |
| **瀏覽器 + FastAPI** | `npm start` + `npm run backend` | Python `JobService`，檔案在 `backend/temp/jobs/` | `backend/services/tools_service.py` |
| **Electron 桌面** | `npm run desktop` 或安裝版 | Node `desktop/backend.js` 的 `BackendService` | 同檔內 `TOOL_DEFINITIONS` |

前端 `frontend/app.js` 透過：

- 瀏覽器：`fetch` → `http://127.0.0.1:8787/api/...`
- 桌面：`window.swiftLocalBackend`（preload IPC）模擬同一組 API 路徑

### 行為差異（重要）

| 功能 | FastAPI | 桌面 Electron |
| --- | --- | --- |
| Office → PDF | LibreOffice | LibreOffice |
| PDF → Office（版面） | LibreOffice（docx/xlsx/pptx/odt） | 同左 |
| PDF → DOCX（純文字） | `pdf2docx` | pdf.js 抽文字 → 簡易 DOCX |
| PDF 合併 / 分割 / 旋轉 / 壓縮 | pypdf | pdf-lib |
| PDF 加密 / 解密 | pypdf | QPDF |
| 影音 / 圖片轉檔 | FFmpeg | FFmpeg |
| 圖片 OCR | Tesseract（含 tessdata 解析） | Tesseract（含 tessdata 解析） |
| PDF OCR | pypdfium2 渲染頁面 → Tesseract | pdf.js + `@napi-rs/canvas` 渲染 → Tesseract |
| 繁簡轉換 | `POST /api/convert-text`（zhconv） | 本機 `vendor/zh-maps.js` 單字表 |
| 任務取消 | `POST /api/jobs/{id}/cancel` | IPC `cancelJob` |
| 輸出下載 | HTTP 檔案回應 | 本機路徑 `openPath` |

## 目錄結構

```
backend/
  main.py                 # FastAPI app、CORS、session middleware、lifespan
  security.py             # SESSION_TOKEN、ALLOWED_FRONTEND_ORIGINS
  version.py              # 與 package.json 對齊的版本字串
  requirements.txt
  routers/
    jobs.py               # 任務 CRUD / cancel / 下載
    tools.py              # 工具偵測與路徑設定
    text.py               # 繁簡轉換（zhconv）
  services/
    job_service.py        # 佇列、取消、狀態
    conversion_service.py # 實際轉換與外部行程
    tools_service.py      # LibreOffice / FFmpeg / Tesseract / QPDF 偵測
  temp/
    session-token         # 本次啟動 token（供 npm start 同源讀取；重啟後失效）
    jobs/                 # 執行期工作目錄
    jobs-state.json       # 任務持久化

desktop/
  main.js                 # Electron 視窗與 IPC（sandbox、導航封鎖、sender 驗證）
  preload.js              # contextBridge
  backend.js              # 桌面 BackendService（與 FastAPI 對等功能）
  security.js             # 外部 URL 協定白名單等

frontend/
  app.js                  # UI；後端 API 抽象層
  vendor/zh-maps.js       # 離線繁簡單字表

tests/
  desktop/backend.test.js
  desktop/security.test.js
  backend/test_core.py
```

## FastAPI 端點

基底：`http://127.0.0.1:8787`（實際埠以 `scripts/start-backend` 為準，預設文件與前端使用 8787）。

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/api/health` | 健康檢查 |
| GET | `/api/tools` | 偵測工具 |
| PUT | `/api/tools/{key}` | 設定工具絕對路徑 |
| DELETE | `/api/tools/{key}` | 清除手動路徑 |
| POST | `/api/jobs` | 建立任務（multipart） |
| GET | `/api/jobs` | 任務列表 |
| GET | `/api/jobs/{job_id}` | 單一任務 |
| GET | `/api/jobs/{job_id}/outputs/{filename}` | 下載輸出 |
| POST | `/api/jobs/{job_id}/cancel` | 取消 queued / running |
| POST | `/api/jobs/{job_id}/retry` | 重新執行已結束任務（0.3.3） |
| POST | `/api/jobs/{job_id}/copy` | 複製為新任務（0.3.3） |
| GET | `/api/jobs/{job_id}/diagnostic` | 匯出診斷 JSON（無密碼）（0.3.3） |
| POST | `/api/jobs/cleanup` | 自動清理舊任務／孤兒暫存（`forceFinished=true` 清除全部已結束）（0.3.3） |
| DELETE | `/api/jobs/{job_id}` | 刪除（不可刪 running，回 409） |
| POST | `/api/convert-text` | 繁簡轉換（zhconv） |

### 建立任務表單欄位

- `type`（必填）
- `files`（一個以上）
- 依類型選填：`extension`、`language`、`pages`、`angle`、`password`

### 支援的 `type`

```
office-to-pdf
pdf-to-office
pdf-to-docx
pdf-merge
pdf-split
pdf-rotate
pdf-encrypt
pdf-decrypt
pdf-compress
media-convert
image-convert
ocr-image
ocr-pdf
```

### 0.3.1 安全契約

- FastAPI 除 `OPTIONS` 預檢外，所有 `/api` 請求（含 `/api/health`）都需要標頭 `X-SwiftLocal-Token`。
- Token 每次進程啟動重新產生（可用環境變數 `SWIFTLOCAL_SESSION_TOKEN` 覆寫）；寫入 `backend/temp/session-token` 供 `npm start` 同源讀取。
- **CORS 不允許 `null` origin**（含 `file://` 開啟頁面時瀏覽器送出的 Origin）。預設僅：
  - `http://127.0.0.1:4173`
  - `http://localhost:4173`
- 可用 `SWIFTLOCAL_FRONTEND_ORIGINS`（逗號分隔）擴充允許清單；即使列出 `null` 也會被 `backend/security.py` 過濾掉。
- Electron renderer 只可停留在 `frontend/index.html`；IPC handler 會驗證 `senderFrame.url`。
- 任務 API、狀態檔及 UI 都使用已清理的 options，不保存或回傳 `password`／`passphrase`。
- 需要密碼的 queued 任務不會在重啟後自動執行。
- 所有輸出統一使用自動編號避讓（`檔名 (2).ext`…）；LibreOffice 先寫入臨時目錄，再安全移到最終路徑。
- 預設資源上限為單檔 1 GB、單任務 2 GB、50 個 queued 任務、2 倍磁碟需求與 OCR 單頁 50 MP。

`ocr-pdf` 選填：`language`（預設 `eng`）、`maxPages`（預設 50、上限 100）。

### 任務狀態

`queued` → `running` → `done` | `failed` | `cancelled`

- **取消 queued**：立刻 `cancelled`
- **取消 running**：設 flag；外部行程（LibreOffice / FFmpeg / Tesseract / QPDF）會被 kill
- 純 Python／本機記憶體步驟（pypdf 等）在**當前步驟結束後**才會停；UI 會提示「部分步驟需稍候」

## 工具偵測

支援 key：`libreOffice`、`ffmpeg`、`tesseract`、`qpdf`

優先順序：

1. 手動路徑（`backend/tools.json` 或 Electron userData 設定）
2. 環境變數
3. 內建 `tools/`（開發目錄或打包 `resources/tools`）
4. Windows 常見安裝路徑
5. PATH

### 環境變數

```powershell
# 外部工具路徑
$env:SWIFTLOCAL_LIBREOFFICE="C:\Program Files\LibreOffice\program\soffice.com"
$env:SWIFTLOCAL_FFMPEG="C:\ffmpeg\bin\ffmpeg.exe"
$env:SWIFTLOCAL_TESSERACT="C:\Program Files\Tesseract-OCR\tesseract.exe"
$env:SWIFTLOCAL_QPDF="C:\Program Files\qpdf\bin\qpdf.exe"
$env:SWIFTLOCAL_TOOLS_CONFIG="C:\path\to\tools.json"   # 可選，覆寫設定檔位置

# FastAPI 安全（見 backend/security.py、main.py）
$env:SWIFTLOCAL_SESSION_TOKEN="..."   # 可選；未設則每次啟動隨機產生
$env:SWIFTLOCAL_FRONTEND_ORIGINS="http://127.0.0.1:4173,http://localhost:4173"
# 注意：清單中的 "null" 會被忽略，無法透過環境變數重新開啟 null origin

# 資源上限（可選，見 README「0.3.1 安全與資源限制」）
# SWIFTLOCAL_MAX_FILE_BYTES / SWIFTLOCAL_MAX_JOB_BYTES / SWIFTLOCAL_MAX_QUEUED_JOBS
# SWIFTLOCAL_DISK_MULTIPLIER / SWIFTLOCAL_OCR_MAX_PIXELS
# SWIFTLOCAL_JOB_RETENTION_HOURS=72   # 已結束任務自動清理時數
```

Windows 上 LibreOffice 會優先改用 `soffice.com`（若存在），避免 GUI 子行程問題。

### Tesseract tessdata

內建布局為 `tools/tesseract/tessdata`。轉換時會自動加 `--tessdata-dir`（Python 與桌面皆會解析多個候選路徑）。

### LibreOffice 輸出檔名

轉換前後對輸出目錄做 snapshot；優先 `{stem}.{ext}`，否則找新建／更新且副檔名相符的檔案，避免特殊字元檔名導致誤判「沒有輸出」。

## 任務流程（FastAPI）

1. 前端選擇類型與檔案，`POST /api/jobs`。
2. 檔案寫入 `backend/temp/jobs/{job_id}/input`。
3. `JobService` 單 worker 佇列執行；結束後若仍有 `queued` 會再排程（避免競態卡住）。
4. 輸出在 `.../output`；列表回傳下載 URL。
5. 前端輪詢 `GET /api/jobs`（有 active 任務時約 2 秒一次）。
6. 可 `POST .../cancel` 或完成後 `DELETE`。

## 任務流程（Electron）

1. 前端同樣走 FormData；`buildElectronJobPayload` 用 `webUtils.getPathForFile` 取本機路徑（不整檔上傳）。
2. `BackendService.enqueue` → `runNext` 單 worker。
3. 預設輸出：`Downloads/SwiftLocal`（`app.getPath("downloads")`）。
4. 工作完成後以本機路徑開啟／顯示；`onJobsUpdated` 推送列表。

## 安全與錯誤處理

- 上傳檔名經 `sanitize_filename`；輸出檔名比對使用 basename。
- 加密 PDF：pdf-lib / pypdf 路徑會先偵測並提示「請先 PDF 解密」。
- 刪除 running：HTTP **409**；應先取消。
- **CORS（與 0.3.1 契約一致）**：僅允許本機靜態前端 origin（預設 `http://127.0.0.1:4173`、`http://localhost:4173`）。**不允許 `null`**，因此不支援以 `file://` 直接開啟前端再呼叫 FastAPI；請使用 `npm start`（同源開發伺服器 + session token）或 Electron 桌面版。
- 缺少或錯誤的 `X-SwiftLocal-Token`：HTTP **401**。
- 輸出路徑衝突：自動編號避讓，不覆蓋既有檔案。
- 密碼欄位：寫入狀態檔與 API 回應前會清除，重啟後需重新輸入。

## 測試

```bash
npm test          # Node + Python
npm run test:js   # tests/desktop/backend.test.js
npm run test:py   # tests/backend/test_core.py
```

涵蓋：tessdata、LibreOffice 輸出解析、PDF split 空 range、加密訊息、任務取消、佇列 drain、桌面 merge / cancel 等。

CI：GitHub Actions 工作流程 `.github/workflows/ci.yml` 在 `main` / `master` 的 push 與 PR 上、三平台（Ubuntu／Windows／macOS）執行：

1. `npm ci` + `pip install -r backend/requirements.txt`（Python 3.12）
2. `npm run typecheck`（主要前端／桌面／腳本語法）
3. `npm run check:ci`（版本、CHANGELOG、electron-builder 產物命名、requirements pin）
4. `npm test`（Node + Python 單元測試）

本機可用 `npm run typecheck` 與 `npm run check:ci` 重現上述檢查。完整 `check:pack` 仍需本機 `tools/`，不在 CI 強制執行。

## 依賴（Python）

見 `backend/requirements.txt`（**已固定版本**，供 CI 與本機可重現安裝）：

| 套件 | 用途 |
| --- | --- |
| `fastapi` / `uvicorn[standard]` | HTTP API 與 ASGI 伺服器 |
| `python-multipart` | 任務上傳 multipart |
| `pypdf` | PDF 合併／分割／旋轉／壓縮／加解密 |
| `pdf2docx` | PDF → DOCX（純文字／相容路徑） |
| `Pillow` | 影像輔助 |
| `zhconv` | 繁簡轉換 API |
| `pypdfium2` | PDF OCR 頁面渲染 |

升級依賴時請改 pin 後執行 `pip install -r backend/requirements.txt` 與 `npm run test:py`（或 `npm test`），確認通過再合併。

### 影音進階參數（`media-convert`）

選填表單欄位（空值 = FFmpeg 預設）：

| 欄位 | 說明 | 範例 |
| --- | --- | --- |
| `videoBitrate` | 影片碼率 | `2M`, `1500k` |
| `audioBitrate` | 音訊碼率 | `128k` |
| `scale` | 解析度 | `1280:720`, `-2:720` |
| `crop` | 畫面裁切 `w:h:x:y` | `640:360:0:0` |
| `start` | 開始時間 | `5` 或 `00:00:05` |
| `duration` | 長度 | `10` 或 `00:00:10` |
| `gifFps` | GIF 幀率 1–30 | `10` |

音訊輸出（mp3/wav/…）會加 `-vn`；GIF 使用 `fps` + 可選 scale。

### 任務持久化

| 模式 | 狀態檔 | 行為 |
| --- | --- | --- |
| Electron | `userData/jobs-state.json`（與 `tools.json` 同目錄） | 啟動時載入；`queued` 會繼續跑；輸出目錄可在「狀態」面板設定（寫入 `tools.json` 的 `defaultOutputDir`） |
| FastAPI | `backend/temp/jobs-state.json` | 啟動 `restore_state()`；保留 job 目錄與輸出 |

- **結構契約（schema version 2）**：見 [jobs-state-schema.md](./jobs-state-schema.md)。寫入根物件含 `version`、`savedAt`、`jobs`；job 可含 `errorCode` / `errorHint` / `retriable`；常數 `JOBS_STATE_SCHEMA_VERSION`。
- 重啟時仍為 **`running`** 的任務會改為 **`failed`**（訊息：重啟／中斷），避免半成品當成功。
- `queued` 且類型為加／解密、或輸入檔已不存在：分別改為失敗（需重輸密碼）或丟棄。
- 密碼不進入狀態檔、API 或 log。
- 最多保留約 **80** 筆任務摘要；刪除任務會同步更新狀態檔並清理工作目錄（FastAPI）。
- **自動清理（0.3.3）**：
  - 已結束任務（done／failed／cancelled）超過 `SWIFTLOCAL_JOB_RETENTION_HOURS`（預設 **72** 小時）會從列表移除
  - 超出 80 筆時優先丟掉最舊的已結束任務（不碰 queued／running）
  - FastAPI 同步刪除 `backend/temp/jobs/{id}`；啟動時清理孤兒目錄
  - 桌面版另清除輸出目錄下超過 24 小時的 `.swiftlocal-*` 暫存資料夾（**不刪使用者輸出檔**）
  - 任務結束、啟動還原、任務中心輪詢時會觸發；「清除已結束」走 `forceFinished`
- 讀取相容 legacy 純陣列與缺 `version` 的物件；未來升版必須寫遷移（見 schema 文件）。

## 取消行為（0.3.4+）

- **排隊中**：立刻 `cancelled`，可重試。
- **執行中外部工具**（FFmpeg／LibreOffice／Tesseract／QPDF）：送出 cancel 後 kill 子行程，任務盡快結束。
- **執行中本機純處理**（pypdf 合併／分割／旋轉／壓縮／加解密、Pillow 轉圖、pdf-lib 桌面路徑、逐頁 OCR 渲染等）：在**檔案之間**與**頁面批次**檢查 `cancelRequested`，不必等整份多頁 PDF 跑完。
- 公開任務含 `cancelRequested: true`（僅 `running` 且已請求取消時），前端顯示「取消中…」。
- 仍可能在**單一頁面的壓縮／單次 pdf2docx.convert** 內部稍候片刻；不會卡死整段多檔佇列。

## 相關檔案速查

| 主題 | 檔案 |
| --- | --- |
| HTTP 入口 | `backend/main.py` |
| CORS／session token | `backend/security.py`、`backend/main.py` |
| 佇列 / 取消 / 狀態持久化 | `backend/services/job_service.py` |
| jobs-state 契約 | [jobs-state-schema.md](./jobs-state-schema.md) |
| 轉換實作 | `backend/services/conversion_service.py` |
| 桌面後端 | `desktop/backend.js` |
| 錯誤代碼 | `desktop/job-errors.js`、`backend/services/job_errors.py` |
| 任務空間統計 | 公開 job 的 `space` / `inputFiles`（`computeJobSpaceUsage`） |
| 桌面安全（URL／IPC） | `desktop/security.js`、`desktop/main.js` |
| 前端橋接 | `frontend/app.js`（`backendFetch` / `electronBackendRequest`） |
| 前端靜態伺服器（token 同源） | `scripts/serve.js` |
| 產品總覽 | `README.md` |
