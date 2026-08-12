# Changelog

## Unreleased

## 0.4.0-alpha.2 - 2026-08-12

- 影音工作區新增「線上媒體下載」V1：以內建 yt-dlp、Deno 與既有 FFmpeg 提供公開單一網址分析、縮圖、720p／1080p／最佳畫質、MP3／最佳音訊、真實進度、程序樹取消、安全檔名、開啟結果及 Full／Portable 資源驗證。
- 修正 Windows 下載 Deno 後無法把 ZIP 解壓到 Full／Portable 打包資源的問題。
- 修正 QPDF 12.x 的小型啟動程式被 Full 打包前檢查誤判為缺少工具的問題。
- 修正 packaged UI smoke 在窄視窗錯誤要求 PDF OCR 結果維持左右並排的問題。
- 將「常用預設」改為用途清楚的「我的常用設定」流程：使用者可在工具頁直接保存目前選項，從設定卡返回原工具修改並覆蓋更新；新增三步引導、清楚的推薦／個人分類及保存範圍說明。
- 更新 packaged-app UI smoke，改為驗證五大核心導航、PDF 主入口、搜尋 live region、IPC、CSP 與首頁按鈕對比；另加入 Windows unpacked 產物與資源的正式驗證指令。
- 常用預設改依 PDF、OCR、Office、圖片、影音、自動化及其他工具分類，並相容既有自訂預設的舊分類值；搜尋支援多關鍵字及結果所屬工作區，手機主要導航亦可直接到達五大核心。
- 新增集中人工驗收清單，統一覆蓋五大工作區、任務平台能力、瀏覽器／無障礙及安裝包放行，讓階段開發先由自動測試把關。

### 產品定位與資訊架構

- 產品定位收斂為「本機優先的辦公文件與媒體處理工作台」，首頁、README 與套件描述一致突出 PDF、OCR、Office、圖片及影音五大核心。
- 側欄改以「開始／核心工作區／自動化／其他工具／系統」分層；ZIP、文字資料、Hash、分片、UUID、顏色等功能完整保留並預設收合。
- 新增用途導向 OCR 與 Office 主入口，沿用 `ocr-image`、`ocr-pdf`、`pdf-to-searchable-pdf`、`office-to-pdf`、`pdf-to-office` 等既有任務與錯誤修復流程。
- PDF 工具、閱讀工作區與頁面工作台在產品層統一由單一 PDF 入口進入，並清楚區分檢視操作與永久修改。
- 影音工作區新增電郵壓縮、MP3、音訊擷取、720p、剪取及 GIF 用途預設，原始 FFmpeg 參數移至預設收合的進階設定。
- 常用預設與工具搜尋改按五大核心及自動化分類；使用者自訂預設資料格式保持相容。
- OCR／Office 主入口新增即時本機引擎與語言包狀態、修復捷徑及可直接開始的多檔批量入口。
- PDF 工作區加入一致的四分區導覽；PDF → Office 的相容引擎與掃描 OCR fallback 改置於進階設定。

### 測試與維護

- 新增產品資訊架構回歸測試，並修正 Windows／Node 24 對桌面測試目錄的跨平台發現方式。

## 0.4.0-alpha - 2026-07-27

PDF 工作區 Alpha：閱讀、填表、簽名圖／日期章、頁面整理與多分頁；並收斂任務取消行為。

### PDF 工作區：頁面整理與多分頁

- **多分頁**：頂部標籤列；「＋分頁」開新文件；每分頁獨立未儲存狀態；關閉僅關目前分頁。
- **頁面整理**（縮圖區）：拖放排序、Ctrl／Shift 多選、刪頁、複製頁、插入空白頁、插入其他 PDF、匯出選取頁。
- 頁面操作以 pdf-lib 重建文件；**注意**：複雜 AcroForm 在重排／刪頁後控件可能遺失，建議先填表儲存再整理，或單頁表格影響較小。

### PDF 工作區：簽名圖／日期章

- 工具列「簽名」「日期章」：點頁面放置；可拖曳調整位置，Delete 刪除。
- 右側「常用簽名」：新增 PNG／JPEG／WebP（僅本機 localStorage），可選取與移除。
- 日期格式可選 ISO／斜線／點號（拉丁數字，儲存相容性較佳）。
- 儲存時以 pdf-lib 嵌入圖片與日期文字；存檔後工作階段標記會清除（已寫入 PDF）。
- 明確標示為簽名**圖片**／日期章，非法律數碼簽署。

### PDF 工作區：AcroForm 填表

- 開啟含 AcroForm 的 PDF 時自動偵測欄位，在頁面上疊加可編輯控件（文字／多行、核取、單選、下拉）。
- 右側欄位清單可跳到對應頁並聚焦欄位。
- 填寫後標記未儲存；**儲存／另存** 以 pdf-lib 寫回欄位值（與頁面旋轉一併套用）。
- 中文可輸入；外觀串流盡力更新（缺 CJK 字型時部分閱讀器可能需重新產生外觀）。
- XFA／無 AcroForm／掃描件不會顯示填表層。

### PDF 工作區：旋轉可儲存、加密密碼開啟

- **旋轉頁面**：工具列改為永久旋轉目前頁（可寫入）；狀態列提示未儲存。
- **儲存／另存**：以 pdf-lib 套用旋轉後輸出；桌面暫存檔再取代原檔；瀏覽器下載；Ctrl+S／Shift+Ctrl+S。
- **加密 PDF**：需要密碼時彈出輸入框；錯誤密碼可重試；密碼只留在記憶體、不寫入狀態檔。
- 加密檔若無法直接寫回，儲存時會提示先用工具箱「PDF 解密」。

### PDF 檔案關聯（開啟方式）

- **安裝版**透過 electron-builder 註冊 `.pdf` → 出現在 Windows／macOS「開啟方式」。
- **雙擊／開啟方式**：若 argv 帶 PDF，直接開 PDF 工作區（不先顯示工具箱首頁）。
- **單一實例**：再次用 PDF 開啟會轉到既有行程並載入檔案。
- 選單「設為 PDF 開啟程式…」開啟系統預設應用程式設定（不強制搶預設，由使用者選擇）。
- 工作區視窗與工具箱 PDF 面板提供相同入口；macOS 支援 `open-file`。

### PDF 工作區閱讀核心（PDF.js）

- **開啟／關閉不鎖檔**：讀入記憶體後釋放 OS 檔案控制權；`closeSession` 銷毀 PDF.js 文件並清空 bytes。
- **閱讀**：縮圖、翻頁（含快捷鍵）、縮放、適合頁面／寬度、檢視旋轉。
- **文字層選取／複製**：PDF.js `TextLayer` 覆蓋；拖曳選取、工具列「複製」、Ctrl+C；搜尋命中 span 會淡色標示。
- **搜尋**：全文搜尋與結果列表／上一個下一個。
- **列印**：以記憶體 blob iframe 列印，不重開原始路徑。
- 桌面 `readLocalFile` IPC：完整讀檔後關閉 handle；主畫面與獨立視窗共用 `pdf-core` / shell。
- 模組骨架：`frontend/pdf-workspace/`、`frontend/pdf-core/`、`frontend/shared/`（與「頁面工作台」批次編輯分離）。
- PDF.js 動態載入改為依**頁面 URL** 解析（避免誤請求 `/pdf-core/vendor/...`）。

### 任務系統收斂

- **細粒度取消**：本機純處理（PDF 合併／分割／旋轉／壓縮／加解密、圖片轉檔、文字抽取、逐頁 OCR 渲染等）在檔案與頁面批次之間檢查取消，不再等到整段操作結束。
- **取消中狀態**：公開任務新增 `cancelRequested`；任務中心顯示「取消中…」並停用重複取消。
- 取消日誌依是否已中止外部程序區分提示；Toast／文件與行為對齊。

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
