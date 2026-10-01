# Phase 2D 家中電腦接續紀錄

2026-09-30–2026-10-01，依 James「直接轉為本機做」接續 [Draft PR #13](https://github.com/JTKC00/SwiftLocal/pull/13)。**修正版 Full 與真正 Store 的雙向原生移除、資料保留、50 項功能測試及本輪測試材料清理均通過。PDF「開啟方式」的兩版獨立選項、擁有者 GUI 確認及另行公司清理仍未完成，Phase 2D 仍為 PARTIAL。正式 NSIS 0.4.1 的原始反向共存 FAIL 保留。**

前輪本機週期保留 23 個正常輸出，首次修正版普通週期增加至 28 個；歷史見 [local-cycle.json](local-cycle.json)及 [NSIS 原生重現／修正證據](nsis-openwith-regression.json)。本輪實際共存結束後共 **51 份正常輸出**，原有 28 份逐檔 hash 保留。PDF 預設及 UserChoice hash 均未變，仍為 Acrobat.Document.DC。

## 修正版與真正 Store 共存（2026-10-01）

James 完成本輪管理員 trust 後，原生核對精確憑證、SDK／Authenticode 簽章及凍結包 hash，再安裝同一凍結 baseline 的新簽署副本。完整證據見 [fixed-store-coexistence.json](fixed-store-coexistence.json)，私人完整 inventory、程序、失敗軌跡及 GUI observer 留在 ignored evidence。

| 實際驗收 | 結果 |
| --- | --- |
| Store 1.0.0.0 安裝、首次啟動前桌面版保留 | 19,688 個 NSIS 檔、110 個 profile 檔、28 個正常輸出 bytes 全部相同；PDF 預設及原 typed peers 未變 |
| 共存 NSIS / Store 功能 | 分別 10 PASS / 15 PASS；實際轉檔內容、語言資源 hashes、新六工具 probes 和 exact deep-AppData Office 檢查全部通過 |
| 正常移除修正版 NSIS | exit 0；沒有共享 key 臨時子鍵、保護或手寫登錄修復；110 個 NSIS profile 檔、40 個 Store durable 檔和 40 個輸出 byte-identical；Comet、真實 Store capability/class 及 Start entry 保留 |
| Store 單獨運作 | 原主題、preset、任務、輸出設定及 hashes 保留，沒有 reseeding；再 15 PASS，六份正常輸出及一份深層輸出內容通過 |
| 重裝同一 Full candidate | exit 0；19,688 檔，Store durable state、兩個 NSIS profiles、46 個輸出及 PDF 預設 byte-identical |
| 正常移除 Store | package、Start entry、自有 OS PDF class 消失；19,688 個 NSIS 檔、110 個 profile 檔、46 個輸出、NSIS／Comet 原值及 PDF 預設保留 |
| Store 資料殘留 | 在任何資料清理前觀察：logical Roaming／Local、package-managed redirected state、共享 scratch 均不存在，零 durable files；未刪除或重置來取得 PASS |
| 移除 Store 後 NSIS | 10 PASS，五份新輸出內容通過；15 筆原任務完整保留，現在 25 筆；原偏好不變；51 份正常輸出，原有 28 份 hash 全部保留 |
| 最終原生 read-back | 傳統版 0.4.1 保留；19,688 個重裝基線檔未變，正常 LibreOffice 執行新增 42 個 Python cache，合共 19,730 檔；Store 與 SwiftLocal 程序為零；凍結 baseline hash 未變 |

**PDF 選項限制仍為 PARTIAL。** 原生安裝後，Store 的真實 capability 指向 OS 生成的 AppX PDF class，但共享 .pdf/OpenWithProgids 沒有其直接 value。兩個唯讀 COM 列舉診斷失敗後停止該路線；只做一次精確已安裝 manifest 的原生 registration，操作成功但直接 value 仍缺失。全程沒有人工新增 Store value。實際透過 capability/class 的 PDF shell 開檔在共存及 Store 單獨時均 PASS。

Computer Use 觀察共存右鍵選單只有一個 SwiftLocal label；選擇程式對話框亦可見該 label，但未能區分兩個 channel，也未完整讀取其剩餘清單。移除 NSIS 後，Store 單獨時選單仍顯示 SwiftLocal，屬代理的唯讀 GUI observer。沒有選擇「一律」、改預設或透過 GUI 啟動程式；這不替代擁有者驗收，也不證明兩版各有獨立選項。

**本輪材料清理 PASS。** James 以管理員執行私人入口 cleanup-fixed-nsis-store-test.cmd，精確 machine trust 於 **20:26:34 +08:00** 移除；使用者憑證與信任也已移除，但 helper 在刪除私人副本前停止。確認原 signing user 相同、沒有清理 worker 後，代理以原使用者完成剩餘已授權清理，於 **20:29:47 +08:00** 產生 PASS receipt。獨立明確 Windows PowerShell 5.1 -File 核對三個精確憑證位置均不存在，public certificate 與單一 signed copy 不存在；完整 19,730 個 NSIS 檔、110 個 profile 檔和 51 個輸出逐檔 hash 全未變，凍結 unsigned baseline hash 相同，Store／SwiftLocal／清理 worker 均為零。詳新 receipt 的 cleanupReadback。前輪清理 PASS 保留；公司材料清理另為 PENDING。

## 私有修正版 Full Installer 重測（2026-10-01）

以已核驗正式 Full Installer 的完整 payload 作為 prepackaged input，只重建含修正巨集的 NSIS 安裝外殼。使用 electron-builder 26.15.3，釘選 legacy nsis-3.0.4.1，publish never。新私人 candidate 為 **776,869,475 bytes**、SHA-256 **b6809f2fa34087d89858ccd19336748d3c5e56f670b117749c8da4b414171e94**；0.4.1 公開 Release 未變。詳細證據見 [fixed-nsis-retest.json](fixed-nsis-retest.json)。

| 實際驗收 | 結果 |
| --- | --- |
| 新包完整程式 payload | 19,691 檔、2,972,547,146 bytes 與原正式包逐檔相同，沒有重建 app |
| 首次啟動前實際安裝內容 | 19,688 檔；19,687 個程式檔與前輪正式版閉合基線相同，只有 Uninstall SwiftLocal.exe 改變；兩者均未安裝同四個 ARM64 附屬 launcher |
| 安裝前備份與安裝後資料保留 | 兩個 profiles 共 110 檔完整備份；首次啟動前全部 bytes 相同，PDF 預設與其他 typed Open With values 未變 |
| 修正版實際啟動／五種轉換／PDF shell／結束 | 10 PASS、0 FAIL；五次轉換後語言資源雜湊也全部保持原值 |
| 實際輸出內容 | 五份內容 PASS：Invoice PDF 文字、Latin／繁體中文 OCR、searchable PDF 文字層、Office PDF 及 MP3 解碼 |
| 修正版正常解除安裝 | exit 0；共享 key 沒有子鍵、沒有臨時保護或人工復原，Comet REG_SZ 選項保留；自有 PDF value／classes 正常移除；110 個 profile 檔及 28 份正常輸出 bytes 保留 |
| 同一修正版重裝 | exit 0；110 個 profile 檔與 typed peer values 未變，實際解除安裝器 SHA 與私人 candidate 相同，準備好下一輪 Store 共存測試 |
| 真正 Store 與修正版雙向共存 | 後續原生功能／資料生命周期 PASS；PDF 兩版獨立選項仍 PARTIAL，詳上節新 receipt |

移除已知有問題的舊正式版以切換到新 candidate 時，僅在那個過渡階段加一個自有臨時子鍵保護現有 peers，隨後驗證並移除。這不是舊版 PASS；原始反向共存 FAIL 保留。新 candidate 的解除安裝實測沒有這項保護，沒有新增假 Store registration，也沒有人工恢復登錄來取得 PASS。

首次普通 Full 週期收尾時，同一私人 candidate 重裝並完成獨立 read-back：10 筆原有 job records 未變，當時共 15 筆；28 份正常輸出 hash 相同，Store package 與 SwiftLocal 程序均為零。這是實際共存之前的中間快照，新最終結果見上節。

前輪憑證及副本清理 PASS 保留。本輪新五天不可匯出金鑰與單一簽署 baseline 副本分開準備，19,694 個非生成 entries（含 manifest）與凍結 unsigned 原件一致，原到期 **2026-10-06 00:02:57 +08:00**。私人入口 enable-fixed-nsis-store-trust.cmd 只建立精確公用憑證信任並核驗簽章，不啟動或安裝程式。James 完成管理員信任後，原生安裝及測試完成、Store 正常移除；此次新金鑰、信任與副本也已清理並獨立核對 PASS。

## 凍結包與新本機週期

原始 unsigned baseline 從 [公司凍結 Actions run](https://github.com/JTKC00/SwiftLocal/actions/runs/35758117387)取回；程式內容沒有重建。大小 **1,115,695,293 bytes**、SHA-256 **38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404**，驗收結束後再次核對仍相同。

使用 Microsoft.Windows.SDK.BuildTools 10.0.26100.1742 重新封裝本機 update fixture，僅改 manifest Identity Version 為 1.0.1.0；其餘 **19,693 entries** 逐檔 SHA-256 相同。Name、Publisher、Application Id、x64、PFN 及內附首次提交版本 1.0.0.0 維持原值。unsigned update 為 **1,115,795,156 bytes**、SHA-256 **510387594f07159928b8c8e56b552b5751420c26abe0cb9eb79a2d16f6c4b4fe**。此新封裝雜湊與公司 update 不同，不能當作公司缺檔恢復證據。

兩個副本以同一把本機五天、不可匯出的 CNG 金鑰簽署；export policy 實測 None，到期 **2026-10-05 20:59:32 +08:00**。擁有者以管理員執行 trust helper 後，機器公用憑證信任與兩包簽章均 PASS。每個簽署包各有 19,694 個原始非生成 entries（含 manifest）與 unsigned 原件完全一致。公司金鑰未轉移，無私人金鑰匯出。

## 已實跑的本機結果

| 驗收範圍 | 結果與直接證據 |
| --- | --- |
| 正式 NSIS 0.4.1 初次安裝 | 已核對正式 Release SHA；原生 per-user silent install exit 0；10 項實際啟動／五種轉換／PDF shell／結束 PASS |
| Store baseline 安裝及真實狀態 | 原生安裝 1.0.0.0；透過真實 app 保存 dark 主題、媒體 preset、輸出設定與完成 PDF 任務 |
| 同身分原位更新 | 1.0.0.0 → 1.0.1.0，沒有先移除；identity、PFN、AUMID 均維持 |
| 首次啟動前控制與離線 retention | 獨立監看 593 次、250ms 間隔、最大程序數 0；26 個 durable Store 檔案 byte-identical；設定、完整 jobs、實際 renderer values 與輸出 hash PASS |
| 更新後 retention | 啟動後真實偏好、preset、任務及輸出 PASS，沒有重新 seeding |
| 更新後 Store smoke | 15 PASS；包內六個原生工具的新版本探測、六種轉換、exact deep-AppData Office → PDF、登錄 PDF shell、正常結束 |
| Store 輸出內容 | Invoice 文字、Latin／繁體中文 OCR、PDF 文字層、Word XML及 MP3 解碼全 PASS；音訊內容 observer 使用已核驗的 NSIS FFmpeg，Store 工具執行另有 packaged Electron probe |
| 移除 NSIS 後 Store 資料 | 實際 profile bytes、正常輸出、PDF 預設均保留；PDF 選項清單有下述共存 FAIL |
| 修復選項後 Store 單獨運作 | retention PASS；再次 15 項 smoke PASS，包括新六工具探測及 deep-AppData；不能覆蓋原始 FAIL |
| 重裝 NSIS 再正常移除 Store | Store package、Start entry、OS 生成 PDF class 消失；19,688 個 NSIS 安裝檔、profiles、uninstall registration、18 個正常輸出 hash、PDF 預設未變 |
| 移除後 NSIS 實際運作 | 10 PASS；五份新輸出內容與解碼 PASS；全部五個原始 NSIS job records 與原始預設偏好保留，另有五個本次新任務 |

第一次安裝前完整備份兩個既有 profiles，共 106 檔；移除 NSIS 前另備份當時的 110 檔，均逐檔 hash 核對。沒有復原整個 profile 來掩蓋正常寫入。首次 NSIS smoke 後有 19,730 個安裝檔；重新安裝但未啟動時有 19,688 個；最後正常運作後為 **19730** 個。檔案數差異依各階段保存，跨 Store 操作比對使用同一階段閉合基線。

正常 Store 移除後，application-owned logical Roaming／Local、package-managed redirected state 與共同 private scratch 均觀察為不存在、零 durable files、零 hash errors。沒有刪除或重置這些應用資料來製造驗收成功。先前為修復 NSIS 問題而人工恢復的 Store Open With value 在移除後仍在；原始殘留快照已保留，之後只刪掉此本 session 引入的單一值。Comet 的原始選項和資料保留。這項人工介入限制已載入 JSON。

## 發現並修正的 NSIS 共存問題

**正式 0.4.1 Full Installer 的反向共存 FAIL 保留。** 移除 NSIS 時，customUnInstall 的 DeleteRegKey /ifempty 刪除共享 OpenWithProgids key，連帶移除 Store 與 Comet 的 PDF 選項。兩個程式的 class keys 還在，所有設定／任務／輸出和 Adobe 預設都未變。

已釘選下載並雜湊核驗的 NSIS 3.0.4.1 編譯器回報 v3.04。用原始巨集在隨機隔離 HKCU 測試樹實跑，確實刪掉 None、String 及預設 sentinel values；符合 [NSIS legacy DeleteRegKey 文件](https://nsis.sourceforge.io/Reference/DeleteRegKey)所述僅檢查子鍵的行為。修正只刪 SwiftLocal.PDF value 與自有 classes，保留共享 key。相同原生實跑後，其他 None／String／default values 及無關預設全部保留，且自有 classes 正常移除。兩次測試的隔離登錄樹清理均 PASS。

實際機器只恢復原快照證實缺失的 Store REG_NONE 與 Comet REG_SZ 選項，核對原始資料、存活 class 身分及恢復後快照，才繼續測試。復原不改寫原始失敗結論。私人恢復 helper 曾遇到 PowerShell 空鍵名、dictionary member、原始值型別及大小寫問題；失敗均在修改前停止，依兩振規則改用已核驗 manifest 加原生 Registry API。

相關 JavaScript 回歸 **21 PASS、0 FAIL、0 skip**，並有上述實際 NSIS 編譯／執行證據。之後已另建私有 Full candidate，實際普通安裝／轉換／解除安裝及真正 Store 原生功能／資料共存 PASS；PDF 獨立選項限制仍保留。沒有改動正式 Release 或把原始包標成 PASS。可用 [原生回歸 CLI](../../../scripts/verify-windows-file-association-uninstall.js)的 --help 查看編譯器／輸出參數。

## 收尾與未完成條件

**本機管理員清理 PASS。** James 已以管理員執行私人入口 store-evidence/home-2026-09-30/cleanup-local-test.cmd。機器信任於 **23:16:23 +08:00** 移除；原 signing user 的不可匯出金鑰、憑證、兩個 signed copies 及衍生更新封裝／payload 副本於 **23:26:35 +08:00** 清理完成，cleanup receipt 為 PASS。此階段花約十分鐘處理封裝副本及大量檔案；獨立 read-back 確認清理 worker 已結束、三個精確憑證位置與所有測試副本／衍生 payload 目錄均不存在。原始 unsigned baseline SHA-256 仍吻合，23 個正常輸出逐檔 hash 保留，兩個 NSIS profiles 仍在，傳統版 0.4.1 保留，Store package 與 SwiftLocal 程序均為零。

擁有者本輪 GUI 手動驗收、physical／standard-account 確認仍 **UNVERIFIED**；原生測試及代理檢視畫面不替代這些條件。修正版 Full 的普通生命周期、實際 Store 原生功能／資料共存及本輪材料清理已通過，但 PDF 兩版獨立選項仍未完成；公司原 key／trust／copy 的另行清理尚未完成，本機清理不代表公司機器已清理。公司的 [Step 4A PARTIAL](../2026-09-30-store-phase2d/step4a.md)與 Phase 2C owner GUI PASS 均保留原結論。

## 歷史準備及私人證據

初次 Drive 清單 208 項中，198 個路徑／大小吻合、10 個缺失、14 個已取回小檔 hash 通過；見 [missing-backup-files.json](missing-backup-files.json)。原公司 backup 仍不完整；本機週期從 GitHub 取回 baseline／正式 NSIS 並獨立製作測試副本。先前完整原始碼回歸的 408 PASS／7 條件 skip 與 archive 工具選擇修正見 [verification.json](verification.json)。

私人 inventory、完整 profile 備份位置、signing receipts、包、log、畫面及失敗軌跡均保存在 ignored 的 store-evidence/home-2026-09-30/local-cycle 與 nsis-rebuild-5f1ec09。Git 只收錄去除個人路徑與 SID 的結果。產品仍 0.4.1、首個 Store package 仍 1.0.0.0，PR 仍 Draft；未合併、未提交 Store、未改公開 Release。
