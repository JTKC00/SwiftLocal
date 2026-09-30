# Phase 2D 家中電腦接續紀錄 — 已轉為本機驗收

2026-09-30，James 指示「直接轉為本機做」。已在本機建立獨立 Phase 2D 週期，從提交 `e702838fde0c366f6ae453274f4c90851abf41a3` 接續 [Draft PR #13](https://github.com/JTKC00/SwiftLocal/pull/13)。產品版本仍為 **0.4.1**。

**NSIS 本機驗收 PASS；Store 兩版本測試包已備妥，待管理員啟用公用測試憑證信任。Phase 2D 仍未完成。** [公司交接](../2026-09-30-store-phase2d/HOME-PC-HANDOFF.md)及 [Step 4A PARTIAL](../2026-09-30-store-phase2d/step4a.md)保留原結論。新週期的結果見 [local-cycle.json](local-cycle.json)。

## 本機安裝包

原始未簽署 baseline 直接從 [公司凍結 build 的 Actions run](https://github.com/JTKC00/SwiftLocal/actions/runs/35758117387) 下載。大小 **1,115,695,293 bytes**，SHA-256 **38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404**，與公司凍結 candidate 完全一致；程式內容沒有重建。

在新的隔離目錄用官方 Microsoft.Windows.SDK.BuildTools **10.0.26100.1742** 重新封裝更新 fixture。僅將 manifest Identity Version 改為 **1.0.1.0**，19,693 個其餘 payload entries 逐檔 SHA-256 相同。Name、Publisher、Application Id、x64、PFN 及內附 Partner Center 首次提交版本 **1.0.0.0** 都維持原值。

本機 unsigned update 為 **1,115,795,156 bytes**，SHA-256 **510387594f07159928b8c8e56b552b5751420c26abe0cb9eb79a2d16f6c4b4fe**。它與公司 update 的 SHA-256 不同，明確記為新本機封裝週期，不能充當公司原始檔的恢復證據。SDK MakeAppx／SignTool 的 Microsoft 簽章均有效，工具及下載包雜湊已記錄。

兩個簽署副本使用同一把本機新建的五天測試金鑰，實測 CNG export policy 為 **None**。金鑰不曾匯出；公司金鑰也未轉移。憑證到期為 **2026-10-05 20:59:32 +08:00**。兩包各有 **19,694 個原始非生成 entries**（包括各自 manifest）與 unsigned 原件完全相同。簽署 hash／大小另載於 JSON；尚未建立機器信任，不能把這項 payload PASS 當成已安裝 Store 驗收。

## 實際 NSIS 0.4.1 驗收

從 [正式 v0.4.1 Release](https://github.com/JTKC00/SwiftLocal/releases/tag/v0.4.1) 取回 Full Installer，大小 **684,101,265 bytes**、SHA-256 **3e930e523f3746e92bc9a05277a208491186c1563dabffd1e07d3c973bc30a40** 與發布記錄一致。實際以每位使用者的 silent 模式安裝，exit code **0**。這是代理執行的原生安裝，擁有者 GUI 觀察另列 UNVERIFIED。

安裝前先將兩個既有 NSIS profile 的 **106 個檔案**備份到全域 backups 目錄，逐檔 hash 核驗。實跑既有 installed-app harness 的 10 項檢查全數 PASS，包括：正常啟動、選用已安裝 Full 的工具、五種真實轉換、登錄 PDF shell verb 開啟工作區、正常結束。已讀取並檢視實際首頁與合成 PDF 的畫面。

| 實際輸出／工具驗證 | 結果 |
| --- | --- |
| PDF 壓縮及 DOCX → PDF | 各一頁，保留合成 Invoice 12345 文字 |
| chi_tra+eng OCR 圖片 | 含 Latin 及繁體中文 fixture 文字 |
| 可搜尋 PDF | 實際文字層含 SWIFTLOCAL |
| WAV → MP3 | FFmpeg 完整解碼 PASS |
| FFmpeg、QPDF、Tesseract、LibreOffice、yt-dlp、Deno | 已安裝包內六個執行檔的版本探測 PASS |

驗收後已關閉 SwiftLocal；Store package 仍不存在。閉合基線保存 **19,730 個 NSIS 安裝檔**和五份正常 Downloads 輸出，沒有 hash 讀取錯誤。PDF UserChoice 及其 hash 與安裝前完全相同，ProgID 仍為 **Acrobat.Document.DC**。

舊 Roaming/SwiftLocal profile 的24個 durable files保持 byte-identical。實際使用的 Roaming/快轉通 SwiftLocal profile 因本次正常使用由24個增至27個 durable files；這是 NSIS 自身驗收後的新基線，沒有把正常寫入當作 Store 影響或恢復整個 profile。Store-only 後續比較應使用此新基線。

## Helper 與回歸

Step 4A preflight 改為依本週期已驗證 fixture 和 signing receipt 綁定 hash／憑證，並仍嚴格要求原始凍結 baseline 及兩個不同版本。首次啟動前快照 helper 可明確指定獨立 Evidence／OutputRoot，避免寫入公司舊週期。

五個新增拒絕／接受測試及五個既有 Store identity/runtime/packaging 測試，共 **10 PASS、0 FAIL、0 skip**；PowerShell AST 解析及 diff whitespace 檢查 PASS。使用先前按鎖檔安裝的隔離依賴環境。最初誤用 root 的舊依賴導致 toolsets/7zip module 缺失，轉用已備妥的隔離環境後通過。私人六工具 probe 最初遺漏 yt-dlp／Deno 的 bin 子目錄，依程式實際 resolver 修正後全數通過。

先前完整原始碼回歸的 **408 PASS、7 條件 skip**及驗證 archive 工具選擇修正，保留在 [verification.json](verification.json)。該 JSON 的 machine preservation 指初次準備前後，並非宣稱目前沒有 NSIS 安裝或 profile 正常寫入。

## 管理員步驟與尚未完成

Trust helper 實際在目前權限下停止，原因為 **Machine certificate trust requires an administrator**。機器 TrustedPeople 尚無本週期憑證。[Microsoft 的包簽署文件](https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing)要求此公用憑證的機器信任，才可安裝自簽測試包。

本機已備妥 `store-evidence/home-2026-09-30/enable-test-trust.cmd`。以系統管理員執行後，它只啟用本週期收據綁定的公用憑證信任並核驗兩包簽章，顯示 **SwiftLocal local test trust is ready** 即成功；此步驟不安裝 Store package。

後續仍需本機 Store baseline 安裝、真實偏好／任務／輸出 seeding、更新前 preflight 與程序觀察、更新後首次啟動前快照及離線比較，接著才啟動 retention／native／deep-path smoke。Store 移除、NSIS 共存與反向移除、殘留資料和輸出保留，以及本機測試 trust/key/copy 清理仍 UNVERIFIED。公司的原始 key/trust/copy 清理另行保留 pending。GUI 擁有者確認不由本次原生自動驗收替代。

## 初次雲端準備與私人證據

初次 Drive backup 的208個清單項目中，198個路徑／大小吻合、10個缺失、零觀察到的大小差異；這不是198個檔案的完整 SHA 驗證。14個已取回小檔的 hash 與公司清單相同。[missing-backup-files.json](missing-backup-files.json)保留該次雲端缺檔，原始公司 backup 仍不完整；James 改為本機接續後，已從 GitHub 取回 baseline／正式 NSIS，並另建 update／signed copies，無需等待公司缺檔才進行本機準備。

所有私人 inventory、備份位置、簽署收據、測試包、金鑰收據、原始 log 和畫面位於 ignored 的 `store-evidence/home-2026-09-30/`；新週期在其中的 `local-cycle/`。沒有將個人路徑、SID、雲端下載 token、憑證檔或 signed packages 提交 Git。PR保持Draft；Store提交、PR合併及公開Release變更都未執行。
