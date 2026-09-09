# SwiftLocal v0.4.0 — Windows 正式版

本次提供 Windows x64 Full Installer 與 Portable，內附 PDF、OCR、Office 與影音轉換所需引擎。macOS／Linux 不在本次正式支援範圍。

## 下載與使用

- `SwiftLocal-0.4.0-full-installer-x64.exe`：一般使用建議選擇安裝版。
- `SwiftLocal-0.4.0-full-portable-x64.exe`：免安裝版；Full 版解壓啟動較慢，實際時間取決於磁碟與防毒掃描。
- `SHA256SUMS.txt`：下載後可使用 PowerShell `Get-FileHash -Algorithm SHA256 <檔案路徑>` 核對。

Windows 產物未簽章，系統可能顯示未知發行者或 SmartScreen 提示。請從本專案 Release 下載並核對校驗碼。

## 主要更新

- 新增 JPG／PNG 合成 PDF，支援排序、原圖尺寸、A4 及頁邊距。
- 修正 PDF 儲存／頁面重建期間切換文件造成的資料錯置。
- 修正 OCR 暫存檔及 Office 失敗清理可能影響既有檔案的問題。
- 修正 PDF 密碼出現在診斷紀錄、CSV 公式注入及本機 HTTP 異常請求處理。
- 修復內附 Tesseract 建立可搜尋 PDF 的設定與字型，支援繁中／英文 OCR。
- 更新 Electron 與打包依賴，加強封裝內容、必要引擎及產物雜湊驗證。

## 驗證與已知限制

- v0.4.0 原始碼測試：JavaScript 283 成功、4 項 Windows fixture 略過；Python 101 成功、1 項 Windows 程序樹測試略過，無失敗。
- 語法與 CI 版本資料檢查通過。
- 內附引擎的 PDF、繁中／英文 OCR、可搜尋 PDF、Office 與影音轉換煙霧測試通過。
- Full Installer（767,717,243 bytes）及 Portable（767,547,080 bytes）已解開，版本、PE、必要資源、完整檔案清單與 SHA-256 均通過驗證，內容與 v0.4.0 `win-unpacked` 一致。
- 最終 Portable 在本機 235.2 秒完成解壓啟動、介面、圖片及 PDF 繁中／英文 OCR 驗證，隨後正常退出並清理獨立測試資料，exit code 0。
- 產物驗證工具改為分段掃描與雜湊，另通過 19 項相關測試，包含跨區塊字串辨識。此次 Full 壓縮使用 `ELECTRON_BUILDER_COMPRESSION_LEVEL=3`，避免本機記憶體不足；解壓後的程式內容不受壓縮等級影響。
- 本機前期測試曾出現退出逾時，以及同時作業下超過 300 秒的 Portable 啟動逾時，均保留為失敗紀錄。退出追蹤另確認應用程式正常觸發 quit 並以 0 結束；最終改用原生頁面關閉指令、獨立執行及 600 秒啟動期限，以上述完整通過結果為準。這不代表所有使用者環境的啟動／退出時間相同。
- 乾淨 Windows 環境的安裝、升級、卸載及 PDF 檔案關聯驗收尚未完成；本機封裝驗證不等同該項驗收。
- PDF → XLSX／PPTX 等既有實驗性轉換仍有限制，轉換後請檢查內容與版面。

完整修復範圍及前期測試紀錄見 [發佈準備檢查](https://github.com/JTKC00/SwiftLocal/blob/v0.4.0/docs/RELEASE_READINESS_2026-09-09.md)。
