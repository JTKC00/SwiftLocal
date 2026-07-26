# Changelog

## Unreleased

## 0.3.3 - 2026-07-26

可靠任務系統與工程硬化：錯誤可分類、可重試、可診斷；佇列與暫存可自動清理；工作流程可從失敗步驟繼續。

### 可靠任務系統

- **統一錯誤代碼**：失敗任務帶 `errorCode` / `errorHint` / `retriable`（桌面 `job-errors.js`、FastAPI `job_errors.py`）。
- **重新執行／複製任務**：任務中心可對失敗或已取消任務重試；可複製為新任務（保留輸入路徑，密碼類任務需重輸）。
- **執行前檢查（preflight）**：建立／重試前檢查輸入檔、必要工具與磁碟空間；`enqueue` 為 async 並在失敗時回傳明確錯誤碼。
- **診斷報告**：匯出不含密碼的 JSON（版本、平台、工具、任務摘要）。
- **工作流程從失敗步驟繼續**：保留已完成步驟；優先重試失敗 job，否則以上一步輸出（`stepOutputs`）重新排隊；加密步驟可填回密碼後續跑。
- **自動清理舊任務／暫存**：依 `SWIFTLOCAL_JOB_RETENTION_HOURS`（預設 72h）與 80 筆上限修剪已結束任務；FastAPI 清 `temp/jobs` 孤兒目錄；桌面清 `.swiftlocal-*` 暫存；任務中心「清除已結束」與背景維護共用 `POST /jobs/cleanup`。
- **任務輸入／輸出佔用空間**：任務卡片顯示輸入／輸出總量、檔案數、壓縮節省（或增大）比例；單檔輸入亦標示大小。
- jobs-state **schema version 2**（相容讀取 v1／legacy bare array）。

### 工程

- 固定 `backend/requirements.txt` 主要依賴版本（fastapi、uvicorn、pypdf、pdf2docx、Pillow、zhconv、pypdfium2、python-multipart），避免 CI／本機被上游無 pin 安裝漂移。
- CI 改為執行完整 `npm run typecheck`，並新增 `npm run check:ci`（版本、CHANGELOG、artifact 命名、requirements pin、workflow 自我檢查）；不再只做部分 `node --check`。
- 文件化 `jobs-state.json` schema（`docs/jobs-state-schema.md`），抽出 `JOBS_STATE_SCHEMA_VERSION` 常數，並補桌面／FastAPI 讀寫與 legacy 相容測試。
- 桌面單元測試對齊 async `enqueue`／preflight；Python 空間節省百分比與桌面 `Math.round` 行為一致。

### 文件

- 對齊架構說明與 0.3.1 實際安全行為：CORS **不允許** `null` origin（移除文檔中與程式碼矛盾的「允許 null／file 協議」描述）。
- 補充 session token、`SWIFTLOCAL_FRONTEND_ORIGINS`、目錄結構中的 `security.py`／診斷相關路徑說明。
- 文件標明 Python 依賴鎖定策略與升級驗證步驟。

## 0.3.1 - 2026-07-24

### 安全與資料完整性

- 任務狀態與 API 不再保存或回傳 PDF 密碼；重啟後需重新輸入密碼。
- 所有輸出檔案採用自動編號避讓，既有檔案不再被無提示覆蓋。
- Electron 啟用 sandbox、CSP、導航封鎖、外部 URL 協定限制及 IPC sender 驗證。
- FastAPI 使用每次啟動產生的 session token，並移除 `null` CORS origin。
- 加入檔案大小、任務總量、排隊數量、可用磁碟及 OCR 像素限制。

### 測試與維護

- FastAPI 版本由 `package.json` 的單一版本來源提供。
- CI 擴充至 Windows、macOS 與 Ubuntu。
- 新增安全、密碼清理、輸出避讓及資源限制回歸測試。

## 0.3.0 — 2026-07-23

把 SwiftLocal 升級成更完整的視覺化 PDF 工作台與本機檔案處理控制台。

### 新功能

- **視覺化 PDF 工作台**：逐頁縮圖、拖放排序、旋轉、複製、刪除、加入空白頁、復原與重做
- **即時 PDF 預覽**：選取頁面後即時顯示旋轉及頁面資訊
- **全域任務中心**：集中查看、搜尋、篩選、取消、下載及清理所有進階任務
- **工作流程串連**：Office → PDF → 壓縮、PDF 壓縮 → 加密等多步驟自動接力
- **常用預設**：內置圖片、PDF、文字、影音及工作流程範本，並可保存安全的自訂選項
- **手機與瀏覽器導航**：新首頁、手機底部快捷列、滑出工具選單及平台能力標示
- **無障礙設定**：跳到主要內容、鍵盤焦點、螢幕閱讀器狀態、高對比、放大文字及減少動畫
- **私隱標示**：逐項顯示瀏覽器記憶體、本機磁碟或混合處理方式

### 改善

- 統一基礎 PDF 處理、視覺工作台與後端任務入口
- PDF 合併可清楚排列檔案及頁面次序
- 系統狀態改為健康摘要、功能能力及修復建議
- 桌面版／手機瀏覽器功能界線更清楚
- 任務及工作流程離開原工具後仍可持續追蹤
- 自訂預設不保存檔案、文字內容、密碼、檔名或本機路徑

### 修正與工程

- 修正 Windows 測試器可能選到不可執行 Python 啟動器的問題
- Python 工作核心不再於載入時強制依賴 FastAPI 類型
- 修正 `package-lock.json` 版本與套件宣告不同步
- 完整 Node、Python 單元測試與本機轉換 smoke 檢查

## 0.2.0 — 2026-07-22

本機桌面工具箱的功能與穩定度更新。

### 新功能

- **PDF OCR → TXT**：PDF 逐頁渲染後以 Tesseract 辨識（桌面 pdf.js + canvas；FastAPI 用 pypdfium2）
- **PDF → Office（LibreOffice）**：docx / xlsx / pptx / odt（與純文字 DOCX 分開）
- **影音進階參數**：影片／音訊碼率、scale、crop、開始時間、duration、GIF FPS
- **任務取消**：排隊中可取消；執行中可中止外部工具（FFmpeg／LibreOffice／Tesseract／QPDF）
- **任務持久化**：重開 app 保留佇列與結果（桌面 `userData/jobs-state.json`；FastAPI `backend/temp/jobs-state.json`）
- **桌面輸出資料夾可選**：在「狀態」面板設定，寫入設定檔
- **任務狀態中文**：排隊中／處理中／已完成／失敗／已取消
- **離線繁簡轉換**：本機字表；瀏覽器連 FastAPI 時仍可用 zhconv
- **加密 PDF 友善錯誤**：提示先解密再處理

### 修正

- 內建 Tesseract **tessdata** 路徑偵測
- FastAPI 任務佇列競態（任務卡在 `queued`）
- PDF 分割不再產生空白 PDF
- LibreOffice 輸出檔名對齊（特殊檔名）
- 桌面佇列改為 **FIFO**（先進先出）
- 重啟時 `running` 任務標記為失敗並寫回狀態檔

### 工程

- `npm test`：Node + Python 單元測試
- `npm run smoke`：發佈前語法檢查 + 單元測試 + 本機轉換 smoke
- GitHub Actions CI（`.github/workflows/ci.yml`）
- 架構說明更新：`docs/backend-architecture.md`

### 依賴

- Node：`@napi-rs/canvas`（PDF OCR 渲染）
- Python：`pypdfium2`（PDF OCR 渲染）
- 建議固定 `electron` / `electron-builder` 版本（見 `package.json`）

## 0.1.0

- 初版 Windows / macOS 打包與常用本機轉換能力
