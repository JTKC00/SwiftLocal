# SwiftLocal UI / 品牌驗收 — 2026-09-09

## 視覺基準與證據

品牌基準：`docs/design/brand-selected-concept.png`（1536×1024），使用第二款；分離來源 `docs/design/brand-symbol-source.png`（1254×1254）。概念板只定義品牌，介面依使用者接受的工作台方案實作，不作整頁像素複製。

實作：`docs/design/home-1280-light.png`（1265×791，要求 viewport 1280×800）；`home-1440-dark.png`（1404×891，要求 1440×900）；`home-640-dark.png`（616×391，要求 640×400）。截圖由內建瀏覽器輸出，圖像尺寸與 CSS viewport 有縮放差異；比較時按比例縮放，不據此宣稱 1:1 像素一致。640 CSS px 用於模擬 1280 視窗 200% 的配置寬度，未代替原生作業系統縮放測試。

全景與品牌局部比較：`docs/design/brand-comparison.png`（1600×1050），同圖包含概念板、完成首頁，以及原尺寸 16/24/32/64/256 px 圖示。比對保留 S 的流動輪廓；小尺寸未見裁切或透明邊緣光暈。

## 檢查面向

- 字體：沿用 Windows 系統 UI 字體及中文 fallback；標題、內文、標籤層級清楚。主要動作描述可換行，未見截字。
- 版面：單列側欄；六個快速入口、常用設定及最近任務取代大型宣傳區。1280×800 側欄完整顯示。640 寬使用底部導覽與垂直捲動，DOM scrollWidth 625 <= innerWidth 640。
- 色彩：綠色品牌與暖白背景、深灰底與薄荷色深色主題；Windows Electron 檢查首頁主要文字對比 14.55:1。非全面 WCAG 對比稽核。
- 資產：生成來源描摹成 SVG，PNG/ICO/ICNS 可重建；功能圖示使用本機 Feather 素材。雙語字標使用正式文字排版。
- 文案：輸入／設定／輸出摘要；服務未連接有修復入口；沒有任務與篩選無結果分開處理。技術錯誤收進可展開詳情。

## 修正與驗證歷程

- 側欄密度與重複 hero：改為單列緊湊導覽和短標題；最終 light/dark 截圖確認主要入口可見。
- 選檔清單：加入個別移除，PDF 合併沿用排序；實際載入兩份 PDF、調整順序、移除其中一份並成功輸出。
- 任務恢復：新增無結果清除篩選與離線修復入口；Windows 隔離設定檔完成真實成功／失敗任務、輸出目錄按鈕、折疊操作及重試 IPC 檢查。
- 未知 JS 錯誤摘要：顯示可理解的失敗訊息，原錯誤保留技術詳情。

## 功能驗證

瀏覽器：PDF 合併輸出 883 B；圖片旋轉後 JPEG 輸出約 7.8 KB；搜尋 MP3 並清除、保留五大核心導覽；工具步驟、深淺色切換。檢查期間未見瀏覽器錯誤。

Windows Electron 開發版：既有 UI smoke 通過（IPC、CSP、PDF 工作區、五大核心與圖片響應配置）；不是打包安裝程式驗收。

`npm test`：JS 240 passed / 4 skipped，Python 94 passed / 5 skipped，0 failed。`npm run typecheck`、`npm run check:ci`、`git diff --check` 通過。

## 殘餘驗收範圍

macOS 原生應用、Windows 原生 200% DPI 與安裝程式未實測。完整 OCR、Office、影音引擎需具備對應工具的環境；略過測試包含 pdf2docx、bundled Tesseract 及部分平台驗證。這些限制不代表該平台或引擎已獲驗收。

目前已檢查介面沒有未處理 P0/P1/P2 視覺問題。

final result: passed
