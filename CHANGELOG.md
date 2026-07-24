# Changelog

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
