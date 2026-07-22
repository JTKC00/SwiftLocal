# Changelog

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
