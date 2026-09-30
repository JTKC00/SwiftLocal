# Phase 2D 家中電腦接續紀錄 — 準備完成，安裝驗收尚未開始

2026-09-30 接續 `store/msix-readiness`，來源提交 `3dac8e7a3e22fccfda0dcc18f06ea56e31201f06`，Draft PR [#13](https://github.com/JTKC00/SwiftLocal/pull/13)。本紀錄是家中電腦的新週期；[公司交接](../2026-09-30-store-phase2d/HOME-PC-HANDOFF.md)與 [Step 4A PARTIAL](../2026-09-30-store-phase2d/step4a.md)維持原結論。

**Phase 2D 仍未完成。** 雲端備份缺少必要的原始安裝包，目前不能開始家中的安裝、更新與移除驗收。

## 已完成的準備

- 已切換到公司最後推送的分支並核對 GitHub PR head；PR 仍為 Draft、未合併。
- 已用現有唯讀 inventory helper 保存本機基線：Windows 11 Home 25H2、26200.9550、x64；未找到 SwiftLocal Store package 或 NSIS 卸載註冊，亦沒有 SwiftLocal 執行程序。
- PDF 預設 ProgID 為 `Acrobat.Document.DC`。既有 NSIS 個人設定保留；Store profile/package state 不存在。實機／VM及標準使用者身分仍欠擁有者確認，不能用程序非管理員狀態代替。
- 準備前後快照比對通過：48個既有NSIS durable profile檔案的路徑、大小及SHA-256完全一致，無hash讀取錯誤；PDF UserChoice／Open With／classes、安裝及Start註冊亦相同。
- 已讀取公司原始 `handoff-manifest.json`，遍歷所有可存取的雲端子資料夾；208 個清單項目中，198 個路徑和大小吻合，10 個缺失，沒有已觀察到的大小差異。這只是雲端 metadata 比對，不等於198個檔案的完整SHA-256驗證。
- 已取回12個原始合成測試檔、公用測試憑證及簽署收據，共14個檔案；每個檔案的大小和SHA-256均與公司清單一致。檔案另存私人備份目錄，沒有匯入憑證或複製公司個人設定。

## 缺檔與接續條件

完整相對路徑、大小與公司記錄的 SHA-256 見 [missing-backup-files.json](missing-backup-files.json)。其中四個必要安裝包為：

| 原始檔案 | 大小（bytes） |
| --- | ---: |
| `SwiftLocal-0.4.1-full-installer-x64.exe` | 684101265 |
| `SwiftLocal-0.4.1-store-1.0.0.0.developer-signed-test.appx` | 1115166892 |
| `SwiftLocal-0.4.1-store-1.0.1.0.developer-signed-test.appx` | 1115266759 |
| `SwiftLocal-0.4.1-store-update-fixture-1.0.1.0-x64.appx` | 1115795156 |

其餘缺失為 `update-fixture-payload-hashes.json` 和五個 SDK 檔：`appxpackaging.dll`、`midlc.exe`、`midlrt.exe`、`mt.exe`、`opcservices.dll`。Chrome 的簽署資料夾清單亦沒有顯示上述兩個已簽署 APPX；本機 Downloads 的 SwiftLocal 目錄沒有找到可用的 APPX／EXE 備份。

連接器下載上限為單檔268435456 bytes；原版未簽署 APPX 存在雲端，但其1115695293 bytes超過上限。已接通登入中的Chrome，可以在原始檔補齊後走網頁下載；本次沒有重建、重新簽署或用其他候選包取代缺檔。

需要補齊原始檔後，先核對雜湊、identity及保留簽章，再建立家中的獨立NSIS／Store基線。更新後須先完成關閉狀態、首次啟動前的快照及離線比較，之後才啟動驗證。公司缺少首次啟動前快照的歷史不會被覆寫。

## 回歸驗證與修正

家中現有 `node_modules` 版本落後於鎖檔，最初的原生測試出現缺少打包依賴及PDF.js版本不符。另一次沙箱執行在程序樹逾時案例失敗後停滯，已停止，原始log保留。

使用本次新建的隔離原始碼副本、按鎖檔安裝依賴後，只剩既有ARM64 archive測試失敗：發行驗證 helper 對直接 `.7z` 也選用了本機完整7-Zip，而本機版本不支援該filter。已修正工具選擇：Windows `.exe` 安裝檔保留完整7-Zip處理NSIS；直接archive及巢狀payload改用packager提供的校驗工具組。沒有變更產品runtime或凍結candidate。

修正後完整測試通過：JavaScript 313個測試，309 PASS、4既有條件skip；Python 102個測試，99 PASS、3既有條件skip。JS skip是Windows `.cmd` test shim不由 `shell:false` 執行；Python skip是Windows程序樹案例及隔離副本未內附Tesseract的兩項檢查。它們不構成已安裝Full引擎驗收。

`npm run typecheck`、`npm run check:ci`、修正helper的 `node --check` 及 `git diff --check` 通過。隔離副本與工作分支的修正helper SHA-256一致：`baa3117a82427e7c6d57d6181ca657d21752f8ba0bf95da9d9d0dc2e82b89c80`。詳見 [verification.json](verification.json)。

## 私人證據位置與尚未完成項目

原始inventory、雲端清單、Chrome截圖、下載引用、逐檔hash收據、歷次測試log及隔離依賴均位於ignored的 `store-evidence/home-2026-09-30/`，不得推送Git。公司backup另存在其中的 `work-pc-backup/`；沒有恢復到家中的AppData。

家中GUI安裝／啟動、原始兩版本更新、native及轉換smoke、deep-path、NSIS共存／反向移除、Store移除及憑證清理全部UNVERIFIED。公司電腦的原始key／trust及副本清理仍須另外處理。本次未匯入trust、未安裝或移除應用程式、未修改PDF預設，亦未合併PR、提交Microsoft Store、變更0.4.1產品版本或公開Release。
