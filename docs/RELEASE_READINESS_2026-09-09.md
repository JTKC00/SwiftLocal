# 正式版準備檢查 — 2026-09-09

本次檢查涵蓋整個專案的主要應用程式來源、桌面／HTTP 邊界、轉換引擎、PDF 工作區、依賴、測試與 Windows 封裝流程，並非只檢查當日 diff。以下記錄本次已修正問題及實際驗證範圍；不代表所有第三方原始碼或所有使用者環境均已審計。

以下為 PR #4 合併前以 `0.4.0-alpha.4` 執行的檢查紀錄。合併後依專案擁有者決定準備 Windows `0.4.0` 正式發佈，新版本驗證與限制另見 [v0.4.0 發佈紀錄](RELEASE_v0.4.0.md)；本文的 alpha 產物紀錄不代表正式版產物已驗證。乾淨 Windows 使用者環境驗收仍未完成。

## 已修正

| 問題 | 修正及驗證 |
| --- | --- |
| PDF 儲存／重建期間切換分頁可將 A 文件內容寫入 B session | 捕捉操作所屬 session；操作期間鎖定編輯與分頁，依序開檔，銷毀等待操作完成。延遲 Promise 測試涵蓋儲存、重建、切換、關閉、外部開檔。 |
| 圖片 OCR 使用可預測的 `_sparse.txt`，可覆寫再刪除既有檔案 | 兩次辨識均使用專屬暫存目錄，最後以 `wx` 排他建立結果；測試碰撞、取消、失敗及真正 Tesseract 辨識。 |
| Office 轉換失敗清理可能刪除既有小檔案 | 移除不屬於作業暫存目錄的清理；測試既有 DOCX／XLSX 保留。 |
| PDF 密碼正規化／引號轉義後漏入診斷 | 在組合診斷命令前隱去密碼，涵蓋原值、去除頭尾空白及轉義形式；檢查持久化與匯出紀錄，保留實際執行參數。 |
| CSV 匯出保留公式前綴 | JSON 欄名／值與檔案報表共用安全儲存格編碼；公式樣式內容以文字匯出，包括控制字元或空白前綴。 |
| 異常 URL 可終止瀏覽器模式伺服器；Host 未限定 | 異常 URL／NUL 回應 400，Host 限定 localhost／127.0.0.1，token 請求驗證 Origin；Python 同樣限定 Host。測試錯誤請求後的正常請求與既有認證／CORS。 |
| WebP 簽名可匯入但 PDF 嵌入不支援 | 匯入時明確限制 PNG／JPEG 並顯示原因，避免無提示遺失簽名。 |
| Windows Deno 解壓未產生執行檔卻未立即失敗 | 使用正確編碼及字面路徑的 .NET ZIP 解壓，錯誤立即失敗；測試含空白、單引號、中括號路徑與損壞 ZIP。 |
| 內附 Tesseract 無法產生可搜尋 PDF | 修正複製器漏掉 configs／tessconfigs 目錄；打包前與產物驗證要求 configs/pdf 啟用 PDF，並包含 pdf.ttf。真正搜尋式 PDF 轉換已通過。 |
| 打包重試可重用中斷留下的壓縮暫存 | 建置前只清除預期的 `.nsis.7z` 中間檔，保留既有 EXE；測試路徑限制及檔案保留。亦明確設定正常壓縮等級 5，避免新版打包器的 normal 仍使用 level 9。 |
| 發布煙霧測試缺引擎仍通過 | 預設要求 QPDF、Tesseract、LibreOffice、FFmpeg；`smoke:release` 另外要求均來自 `tools/`。檢查非空輸出、PDF 頁數／旋轉及預期 OCR 文字。開發略過必須明確使用 `--allow-missing-tools`。 |
| 打包來源未明確排除執行資料 | 排除 backend/temp、工具設定、jobs-state 與 Python 快取；實際 ASAR 驗證遇到這些路徑即失敗。 |
| Windows ASAR 重複 canvas 檢查可因路徑分隔符漏判 | 改用標準化後的實際 archive 清單，測試兩種平台分隔符。 |
| 執行環境及驗證工具相容性 | Electron 41.3.0 → 43.6.0、electron-builder 26.8.1 → 26.15.3，CI Node.js 20 → 24。產物驗證使用打包器配套且經校驗的 7-Zip toolset，避免舊解壓器不支援 ARM64 filter；回歸測試實際建立此格式的壓縮檔。 |
| Python 測試可改寫日常工作紀錄 | 模組級暫存隔離與自動還原，取消測試亦清理自己的輸出目錄。 |

既有 JPG／PNG 合成 PDF 功能亦納入測試及封裝，支援排序、原圖尺寸、A4 和頁邊距。

## 已完成的驗證

- Windows 11 x64、Node.js 24.15.0、Electron 43.6.0。
- JavaScript：286 項，282 成功、4 項既有 Windows `.cmd` fixture 略過，0 失敗。測試前先完成 Electron 43 的首次下載，避免平行解壓衝突；原生測試最多同時執行 4 個檔案，避免大量 worker 爭用資源；缺少 close event 的逾時測試使用確定的串流輸入，不再依賴子程序須在 250ms 內完成 Node 啟動。
- 最後另新增並通過 1 項偵錯連線中斷測試，確保 UI 測試中斷時回報失敗；封裝相關的 17 項測試亦重新通過。偵錯請求加入 60 秒上限，關閉指令改為立即執行。
- Python：獨立 Python 3.12.14 venv，安裝 `backend/requirements.txt` 的鎖定版本；102 項，101 成功、1 項既有 Windows 程序樹測試略過，0 失敗。
- `npm run typecheck`、`npm run check:ci`、`git diff --check` 通過。
- npm 安全檢查由 12 個 high 告警降至 0；此結果只代表 npm 已知告警，不涵蓋內附原生引擎的完整安全保證。
- `check:pack:full` 通過：內附 Tesseract／繁中、英文、OSD 語言資料，FFmpeg、QPDF、LibreOffice、yt-dlp、Deno。
- 嚴格內附引擎煙霧測試通過：PDF 合併、分割、旋轉、壓縮、加解密；圖片工作區轉換；繁中／英文 OCR 圖片與 PDF、建立可搜尋 PDF；DOCX → PDF、PDF → DOCX 文字及 Office 模式；WAV → MP4 → MP3；取消佇列作業。既有 PDF → XLSX／PPTX 等實驗性轉換不因此取得正式品質保證。
- Windows Full 解壓版已實際建置並通過產物檢查：版本、PE、PDF 關聯、必要引擎／語言資料、ASAR 無執行資料、無重複 canvas。
- 封裝 UI 通過（20.2 秒完成驗證）：IPC、五大工作區、PDF 工作區、圖片預覽／裁切／旋轉、區域圖片與當頁 PDF 繁中／英文 OCR、響應式版面及正常退出；獨立測試設定檔已清理。
- 真正讀取產生的搜尋式 PDF 文字層，及兩個 DOCX 的 document.xml，均找到預期樣本文字；直接使用最終封裝內的 Tesseract 與其 tessdata，亦成功產生可抽取文字的 PDF。
- 產物驗證器測試已納入上述完整 JavaScript 結果，包含跨平台 ASAR 路徑、缺少 PDF 設定／字型及中斷建置暫存檢查。
- Windows Full Portable（657 MiB）與 Installer（658 MiB）已實際建置，使用相容的 7-Zip 工具逐一解開並完成全部檔案清單／SHA 比對，與 win-unpacked 內容一致。版本、PE、PDF 關聯及所有必要資源檢查均通過。
- 最終 Portable 啟動／退出測試通過：165.3 秒完成解壓啟動、介面與繁中／英文 OCR 驗證，隨後正常退出並清理獨立 session，程序 exit code 0。Full Portable 在本機解壓啟動約需兩分半。
- 首次 Portable UI 驗證成功，但延遲關閉指令後未在 120 秒內退出，該次記為失敗；改為立即關閉後，在正常桌面環境重新驗證上述完整流程通過。中間一次受限環境重跑未完成，不列為成功證據。最終成功紀錄為 `smoke-temp/release-audit-portable-ui-final.log`。

本機產物位於 `dist-full/SwiftLocal-0.4.0-alpha.4-full-portable-x64.exe`、`dist-full/SwiftLocal-0.4.0-alpha.4-full-installer-x64.exe`，SHA-256 清單為 `dist-full/SHA256SUMS.txt`。這些是本次驗證用的未簽章 alpha 版本產物；正式版本號修改後須重新建置。

本次本機完整輸出位於忽略版控的 `smoke-temp/release-audit-*.log`；重新驗證時須使用新產物，不應沿用舊的成功紀錄。

## 正式發布前的驗收

1. 在乾淨 Windows 使用者／VM 實際安裝 Installer，驗證首次啟動、非 ASCII 路徑、升級、卸載及 PDF「開啟方式」。本機來源測試、解壓與 payload 比對無法代替安裝驗收。
2. 在沒有額外安裝引擎的 Windows 環境測試 Full 版；一般版若同時發布，另驗證缺少 LibreOffice 時的提示與手動設定流程。
3. Windows 目前維持未簽章設定。若發布未簽章版本，發布說明需清楚告知來源／校驗碼與系統提示；若要簽章，先調整現有 `signExts` 排除規則並使用實際憑證驗證。未簽章本身不等同功能不穩定。
4. 依本次決定，現階段只發布 Windows，發布頁明確標示平台範圍；macOS 不在本輪工作或驗收範圍內。
5. 檢查最終內附工具的版本、來源與隨附授權檔；yt-dlp、Deno、tessdata 有鎖檔，其他工具目前仍來自本機安裝，不是可完整重現的下載鏈。
6. 驗收完成後同步 package.json／lockfile／CHANGELOG 的正式版本號，重新建置並驗證最終產物，再建立正式 GitHub Release。

## 安全檢查範圍

獨立來源檢查確認四項安全問題：OCR 暫存檔所有權、密碼診斷外洩、CSV 公式注入、異常 URL 造成服務中止（3 medium、1 low）。以上已在本次工作樹修復並加入回歸測試；安全掃描報告保留的是修復前的原始 snapshot，不能把該報告的 open 狀態理解為目前補丁未修復。

DNS rebinding 的完整瀏覽器攻擊路徑未實際重現，故只記錄缺少 Host 驗證及已加強的控制，不宣稱可遠端操作完整後端。原生解析器的資源上限、FFmpeg／LibreOffice 內嵌外部參照及第三方程式碼仍屬後續研究，沒有在本次證實可利用漏洞。修正不會自動移除舊版本已寫入的敏感歷史紀錄。

掃描工具回報用量：總 token 25,721,187，其中 input 25,642,879（cached input 24,782,592）、output 78,308；來源為 codex_rollout、5 個 task、coverage complete。這是工具回報的對話用量，包含快取與前後文，並非費用估算，也不是本次每個修復的獨立成本。
