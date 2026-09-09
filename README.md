# 快轉通 SwiftLocal

**版本 0.4.0** · 本機優先的辦公文件與媒體處理工作台。

> **PDF、OCR 與辦公檔案，盡量留在你的裝置完成。**

SwiftLocal 把 PDF、OCR、Office、圖片、影音與批量任務集中在一個桌面工作台，並整合 LibreOffice、FFmpeg、Tesseract、QPDF 等本機工具，減少在多個程式之間來回切換。

目前正式對外支援 **Windows x64**。macOS 與 Linux 尚未完成正式發佈驗收。

- 最新版本：[SwiftLocal v0.4.0](https://github.com/JTKC00/SwiftLocal/releases/tag/v0.4.0)
- 變更紀錄：[CHANGELOG.md](./CHANGELOG.md)
- 發佈準備與實測紀錄：[2026-09-09 發佈檢查](./docs/RELEASE_READINESS_2026-09-09.md)
- 產品資訊架構：[docs/PRODUCT_STRUCTURE.md](./docs/PRODUCT_STRUCTURE.md)

## 目前發佈狀態

| 平台 | 狀態 | 說明 |
| --- | --- | --- |
| Windows x64 | **正式支援** | v0.4.0 已正式發佈；目前唯一完成主要功能、封裝與 release 驗證的平台。 |
| macOS | **開發／實驗** | Repo 保留開發及打包腳本，但尚未完成完整實機驗收、Developer ID 簽章與 notarization。 |
| Linux | **未正式支援** | 尚未建立及驗證正式發佈流程。 |

> **現階段請把 SwiftLocal 視為 Windows 桌面應用程式。** macOS／Linux 的開發腳本或可啟動狀態，不代表已達正式支援標準。

## Windows 下載

一般使用者建議下載：

```text
SwiftLocal-0.4.0-full-installer-x64.exe
```

v0.4.0 Release 亦保留 Full Portable 產物作測試／備用，但 **Installer 是主要對外發佈格式**。

### 安裝版包含甚麼

Full Installer 會把常用本機引擎一併帶入，包括：

- FFmpeg
- Tesseract OCR
- 繁體中文／英文 OCR 語言資料（`chi_tra+eng`）
- QPDF
- LibreOffice
- 公開媒體網址處理所需的下載引擎與執行環境

一般使用者不需要另外安裝 Python、FFmpeg、Tesseract、QPDF 或相關下載工具即可使用主要功能。

### 未簽章提示

目前 GitHub Release 的 Windows 安裝檔 **尚未做商業程式碼簽章**，因此 Windows 可能顯示「未知發行者」或 SmartScreen 提示。

請只從本專案官方 GitHub Release 下載，並使用 Release 內的 `SHA256SUMS.txt` 核對檔案完整性。

PowerShell 範例：

```powershell
Get-FileHash -Algorithm SHA256 .\SwiftLocal-0.4.0-full-installer-x64.exe
```

## Microsoft Store / MSIX 狀態

Microsoft Store／MSIX 是目前正在評估的 Windows 發佈方向，目標是改善一般使用者的安裝、更新與發行者信任體驗。

**目前狀態：尚未宣告 Store-ready。**

- Repo 現時仍以 Electron Builder 的 NSIS／Portable Windows 封裝為正式流程。
- 尚未加入經正式驗證的 MSIX 打包流程。
- 尚未取得 SwiftLocal 自身的 Microsoft Store certification／acceptance 結果。
- 在真正完成 MSIX 建置、安裝驗證及 Store certification 前，README 不會把 Microsoft Store 列作已支援下載渠道。

因此目前公開下載仍以 GitHub Release 的 Windows Installer 為準。

## 五大核心工作區

| 工作區 | 主要用途 |
| --- | --- |
| **PDF** | 閱讀、填表、頁面整理、合併／分割、轉換、OCR、保護與壓縮 |
| **OCR** | 圖片／掃描 PDF 轉文字、建立可搜尋 PDF、掃描 PDF 轉 Word、批量辨識 |
| **Office** | Word／Excel／PowerPoint 轉 PDF、PDF 轉 Office、Office 歸檔流程 |
| **圖片** | 格式轉換、壓縮、尺寸調整、旋轉／翻轉、浮水印、圖片合成 PDF |
| **影音** | 影片壓縮、轉 MP3、擷取音訊、縮小解析度、剪取片段、GIF、公開媒體網址下載 |

任務中心、取消／重試、工作流程、我的常用設定、診斷、工具偵測及輸出資料夾是各工作區共用能力。

ZIP、批量改名、Hash、檔案分片、文字／資料與快速小工具仍完整保留，集中放在「其他工具」。

## 功能總覽

### PDF

- PDF 閱讀與多分頁工作區
- AcroForm 填表
- 簽名圖片與日期章
- 頁面旋轉、重排、刪除、複製、插入與匯出
- 合併、分割、抽頁、壓縮
- PDF ↔ 圖片
- JPG／PNG 合成 PDF
- PDF 加密／解密
- PDF OCR → TXT
- PDF → 可搜尋 PDF（OCR）
- PDF → Office
- Office → PDF

### OCR

- 圖片 OCR → TXT
- 掃描 PDF OCR → TXT
- 繁體中文 + 英文：`chi_tra+eng`
- 可搜尋 PDF
- 掃描 PDF → Word
- 批量 OCR

### Office

- Word → PDF
- Excel → PDF
- PowerPoint → PDF
- PDF → DOCX
- PDF → XLSX／PPTX／ODT（實驗性）

### 圖片

- JPG / PNG / WebP 格式轉換
- 壓縮
- 縮放
- 旋轉／翻轉
- 浮水印
- JPG／PNG 合成 PDF
- 批量處理

### 影音

- 音訊／影片格式轉換
- 影片 → MP3
- 擷取音訊
- 調整碼率與解析度
- 剪取片段
- GIF
- 公開媒體網址分析與下載
- 影片／音訊輸出選擇
- 進度顯示與取消

### 其他工具

- ZIP
- Hash
- 檔案分片
- 批量改名
- 文字整理
- 繁簡轉換
- 文字比對
- CSV / JSON / XML
- QR Code
- Base64 / URL / HTML
- UUID
- 顏色轉換

## 公開媒體網址功能

SwiftLocal 的產品介面以 **「公開媒體網址下載」** 描述這項功能，不把任何特定大型內容平台寫成產品保證或官方整合對象。

功能定位是：使用者貼上一個可公開存取的媒體網址，SwiftLocal 透過本機下載引擎分析可用格式，再按使用者選擇輸出影片或音訊。

實際可用性會受來源網站、內容類型、地區限制及上游工具支援狀況影響。

請只下載你有權下載、已獲授權或法律允許保存的內容，並遵守相關網站條款及所在地法律。

## 本機優先

SwiftLocal 的核心文件與媒體處理流程以本機工具為主，包括：

| 功能 | 主要引擎 |
| --- | --- |
| Office → PDF | LibreOffice |
| PDF → Office | LibreOffice／pdf.js／pdf2docx |
| PDF 處理 | pdf-lib／pypdf |
| PDF 加密／解密 | QPDF／pypdf |
| OCR | Tesseract |
| 音訊／影片 | FFmpeg |
| 公開媒體網址處理 | 本機下載引擎 + Deno + FFmpeg |

一般 PDF、OCR、Office、圖片及影音轉換不需要把使用者文件上傳到 SwiftLocal 自有雲端服務。

## Windows 使用方式

### 三步開始

1. 從 [GitHub Releases](https://github.com/JTKC00/SwiftLocal/releases/latest) 下載 Windows Full Installer。
2. 安裝「快轉通 SwiftLocal」。
3. 選擇檔案或貼上公開媒體網址，開始處理。

### 用 SwiftLocal 開 PDF

安裝版會註冊 `.pdf` 檔案關聯，讓 SwiftLocal 可出現在 Windows 的「開啟方式」候選中；它不會強制搶走系統預設 PDF 閱讀器。

你可以：

1. 在檔案總管對 PDF 右鍵。
2. 選擇 **開啟方式**。
3. 選擇 **快轉通 SwiftLocal**。

若要設為預設，可到：

```text
Windows 設定 → 應用程式 → 預設應用程式
```

雙擊以 SwiftLocal 開啟 PDF 時，應用程式會直接進入 PDF 工作區。

> 乾淨 Windows 環境的安裝、升級、卸載及 PDF 檔案關聯完整 acceptance 仍列在 release readiness 的後續驗收項目；現有本機封裝測試不等同所有乾淨環境均已驗證。

## macOS

macOS **目前不是正式發佈平台**。

Repo 保留以下開發／未來驗收能力：

```bash
npm install
npm run desktop
npm run pack:mac
npm run pack:mac:dmg
npm run pack:mac:dir
```

如要把 macOS 升格為正式支援平台，至少仍需完成：

- 實際 Mac 上的主要功能驗收
- 內建／外部 FFmpeg、Tesseract、QPDF、LibreOffice 路徑驗證
- `.dmg` 封裝驗收
- Developer ID 簽章
- Apple notarization
- 獨立 macOS release readiness

即使 `pack:mac` 成功產生 unsigned `.dmg`，也不代表 SwiftLocal 已正式支援 macOS。

## 開發者快速開始

### 環境

目前專案基準：

- Node.js 24 LTS
- Python 3.12
- Electron 43.6.0
- electron-builder 26.15.3

### 安裝依賴

```bash
npm install
```

### 啟動 Electron 桌面版

```bash
npm run desktop
```

Windows PowerShell 若擋下 `npm.ps1`，可改用：

```powershell
npm.cmd run desktop
```

### 啟動瀏覽器版前端

```bash
npm run start
```

預設：

```text
http://127.0.0.1:4173
```

### FastAPI 後端

Electron 桌面版會優先使用 Electron bridge，通常不需要另外啟動 FastAPI。

瀏覽器模式如需要後端功能：

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8787
```

亦可使用：

```bash
npm run backend
```

預設：

```text
http://127.0.0.1:8787
```

## Windows 打包

### 一般打包

```powershell
npm run check:pack
npm run tools:media-download
npm run tools:tessdata
npm run pack:win
```

### Full 打包

```powershell
npm run check:pack:full
npm run pack:win:full
```

主要輸出：

```text
dist/
dist-full/
```

目前正式對外發佈策略以 **Windows Installer** 為主；Portable 保留作內部測試、除錯或特殊情境備用。

## 打包工具佈局

Windows 打包版會從專案 `tools/` 取得可攜式工具。常見結構：

```text
tools/
  yt-dlp/
    bin/
      yt-dlp.exe
  deno/
    bin/
      deno.exe
  ffmpeg/
    bin/
      ffmpeg.exe
  tesseract/
    tesseract.exe
    tessdata/
      eng.traineddata
      chi_tra.traineddata
      chi_sim.traineddata
  qpdf/
    bin/
      qpdf.exe
  libreoffice/
    program/
      soffice.exe
```

更多工具佈局說明見 [tools/README.md](./tools/README.md)。

## 測試與驗證

常用指令：

```bash
npm test
npm run typecheck
npm run check:ci
npm run smoke
npm run smoke:release
npm run verify:win:dir
npm run verify:win:artifacts
npm run verify:packaged-ui
npm run smoke:packaged-ui
```

`npm run smoke:release` 會要求正式轉換引擎來自專案內的 `tools/`，用於 release 前本機煙霧檢查。

v0.4.0 已完成的 Windows release 驗證摘要包括：

- JavaScript 與 Python 測試通過
- 主要語法與 CI metadata 檢查通過
- PDF、繁中／英文 OCR、可搜尋 PDF、Office 與影音轉換 smoke 通過
- Full Installer／Portable 產物的版本、PE、必要資源、完整檔案清單及 SHA-256 驗證通過
- Packaged UI、IPC、CSP、五大核心導航及 PDF 主入口驗證

完整紀錄見 [docs/RELEASE_READINESS_2026-09-09.md](./docs/RELEASE_READINESS_2026-09-09.md)。

## 已知限制

### PDF → Office

| 情況 | 說明／建議 |
| --- | --- |
| LibreOffice 寫入失敗 | DOCX 可改用相容模式 |
| 掃描／影像型 PDF | 建議先使用「PDF → 可搜尋 PDF（OCR）」或 OCR 輸出模式 |
| XLSX／PPTX／ODT | 仍屬實驗性；正式用途優先 DOCX |
| 版面還原 | 不保證 100% 還原；「嘗試保留版面」屬盡力處理 |

### 平台

- Windows 是目前唯一正式支援平台。
- macOS 尚未完成簽章／notarization 及完整 release acceptance。
- Linux 尚未建立正式 release 流程。
- Windows GitHub Release 目前未做商業 code signing。
- Microsoft Store／MSIX 尚未完成正式 acceptance。

## 安全與資源限制

瀏覽器模式的 FastAPI 預設採本機來源限制與 session token：

- `/api` 請求需要 `X-SwiftLocal-Token`（`OPTIONS` 預檢除外）
- CORS 預設只接受 `http://127.0.0.1:4173` 與 `http://localhost:4173`
- 不接受 `null` origin
- 預設單檔上限 1 GB
- 預設單任務上限 2 GB
- 預設最多 50 個 queued 任務
- OCR 單頁預設上限 50 MP
- 已結束任務預設保留 72 小時
- 輸出重名時自動產生 `檔名 (2).ext`、`檔名 (3).ext`，不覆蓋既有檔案
- PDF 密碼不寫入任務狀態或診斷紀錄

架構細節：

- [docs/backend-architecture.md](./docs/backend-architecture.md)
- [docs/jobs-state-schema.md](./docs/jobs-state-schema.md)

## 專案結構

```text
frontend/   主介面、前端腳本、樣式與 vendor 資源
desktop/    Electron 桌面殼、preload、桌面本機任務處理器
backend/    瀏覽器模式可選用的 FastAPI 後端
scripts/    開發、驗證與打包腳本
build/      打包資源
tools/      可選／內建的第三方本機工具
docs/       產品、架構、驗收及 release 文件
dist/       打包輸出，不納入版本控制
```

## 維護原則

- 正式對外發佈目前以 Windows Installer 為主。
- Portable 不再作主要公開發佈格式。
- macOS 在完成獨立 release readiness 前維持開發／實驗狀態。
- Microsoft Store／MSIX 在真正完成打包與 certification 前維持「評估中」。
- 內建第三方工具前需確認授權、第三方 notices、更新來源及防毒誤判風險。
- Electron／electron-builder 升級後需重新跑 release smoke 與 packaged UI 驗證。
- 公開媒體網址功能在產品文案中以一般功能描述呈現，不把特定內容平台列作官方整合或保證支援對象。
