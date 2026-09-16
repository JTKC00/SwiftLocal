# SwiftLocal v0.4.1 — Windows 正式版

本次提供 Windows x64 Full Installer 與 Portable，內附 PDF、OCR、Office 與影音轉換所需引擎。macOS／Linux 不在本次正式支援範圍。

## 下載與使用

- `SwiftLocal-0.4.1-full-installer-x64.exe`：一般使用建議選擇安裝版。
- `SwiftLocal-0.4.1-full-portable-x64.exe`：免安裝版；Full 版解壓啟動較慢，實際時間取決於磁碟與防毒掃描。
- `SHA256SUMS.txt`：下載後可使用 PowerShell `Get-FileHash -Algorithm SHA256 <檔案路徑>` 核對。

Windows 產物未簽章，系統可能顯示未知發行者或 SmartScreen 提示。請從本專案 Release 下載並核對校驗碼。

## 主要更新

- 鎖定 Windows 內附引擎來源與 SHA-256：FFmpeg 9.0.1、QPDF 12.4.1、Tesseract 5.5.3、LibreOffice 26.2.6、yt-dlp 2026.08.19、Deno 2.9.6。
- 修正中文使用者／安裝／暫存路徑下，內附 Tesseract 找不到語言包的問題；文字 OCR 與可搜尋 PDF 改在私人暫存目錄以 ASCII 相對參數執行。
- Windows Installer 的 PDF「開啟方式」改為獨立 `SwiftLocal.PDF` 註冊，不再覆寫使用者的預設 PDF 程式。
- 完成 Windows Server 全新標準使用者的安裝、升級、卸載與 Full 引擎驗收。
- 更新 Electron 至 44.2.0、pdfjs-dist 至 6.3.289。

## 驗證與已知限制

- 發佈前本機測試：JavaScript 303 成功、4 項 Windows fixture 略過；Python 101 成功、1 項 Windows 程序樹測試略過，無失敗。語法與 CI 版本資料檢查通過。
- 內附引擎的 PDF、繁中／英文 OCR、可搜尋 PDF、Office 與影音轉換煙霧測試，已在 Native Tool Smoke 與安裝後驗收中通過。
- Full Installer（684,101,265 bytes）及 Portable（683,943,853 bytes）已解開，版本、PE、必要資源、完整檔案清單與 SHA-256 均通過驗證，內容與 v0.4.1 `win-unpacked` 一致。
- 安裝後驗收（GitHub Actions run 35054778424）在獨立 Unicode 標準使用者下通過：全新安裝、由 v0.4.0 升級、卸載、PDF 開啟方式、以及 PDF／OCR／Office／影音轉換。候選安裝包為 `0.4.1-qa.20260916`；正式產物以 repository 版本 `0.4.1` 重新封裝。
- 一般 Windows 11 人手驗收（GitHub Release v0.4.1）：GUI 安裝、SmartScreen 提示後仍可安裝、預設路徑、Explorer「開啟方式」、保留原 PDF 預設、PDF／OCR／Office／影音、正常退出與卸載為 PASS。見 [Windows 11 人手驗收 2026-09-16](https://github.com/JTKC00/SwiftLocal/blob/main/docs/WINDOWS_MANUAL_ACCEPTANCE_2026-09-16.md)。
- 乾淨 Windows 11 VM／首次使用者設定仍未驗證。不得以 Windows Server 自動化結果推定該項。
- PDF → XLSX／PPTX 等既有實驗性轉換仍有限制，轉換後請檢查內容與版面。

完整自動化驗收矩陣與失敗後修復紀錄見 [Windows 自動化驗收 2026-09-16](https://github.com/JTKC00/SwiftLocal/blob/v0.4.1/docs/WINDOWS_ACCEPTANCE_2026-09-16.md)。
