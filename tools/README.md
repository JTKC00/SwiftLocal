# Bundled Tool Layout

Windows builds provision pinned command-line tools in this folder before packaging.
Electron Builder copies this folder to the packaged app's `resources/tools` folder,
and SwiftLocal detects these binaries automatically.

Recommended Windows layout:

```text
tools/
  yt-dlp/
    bin/
      yt-dlp.exe
    .swiftlocal-media-tool-win32-x64.json
  deno/
    bin/
      deno.exe
    .swiftlocal-media-tool-win32-x64.json
  ffmpeg/
    bin/
      ffmpeg.exe
  tesseract/
    tesseract.exe
    tessdata/
      eng.traineddata          # required (Full)
      chi_tra.traineddata      # required (Full) — Traditional Chinese
      osd.traineddata          # required (Full) — orientation/script
      chi_sim.traineddata      # optional — Simplified Chinese
  qpdf/
    bin/
      qpdf.exe
```

### 線上媒體下載（安裝包內建）

Windows 封裝前會自動下載並校驗鎖定版本的 `yt-dlp.exe` 與 `deno.exe`：

```bash
npm run tools:media-download        # Windows x64，供 Full / Portable 封裝
npm run tools:media-download:check  # 不連網，只檢查版本 stamp、格式與 checksum
```

鎖定版本、官方發行 URL 與 SHA-256 位於 `tools/media-download-tools.lock.json`。下載腳本只接受鎖檔所列的官方 GitHub release，SHA-256 不符即中止。Deno 是 yt-dlp 完整 YouTube 支援所需的外部 JavaScript runtime；用家不需自行安裝 Python、yt-dlp 或 Deno。既有 FFmpeg 會負責影音合併及 MP3 轉檔。

本機 macOS 開發驗證可執行：

```bash
npm run tools:media-download:current
```

發行注意：yt-dlp 的 standalone executable 按其官方說明以 GPL-3.0-or-later 發佈，Deno 為 MIT。封裝時本 README、鎖檔與各工具隨附的版本 stamp 會一併置於 `resources/tools`；發行前仍應依各上游 release 的授權與 notices 做最終合規審閱：

- https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE
- https://github.com/yt-dlp/yt-dlp/blob/master/README.md#release-files
- https://github.com/denoland/deno/blob/main/LICENSE.md

### Bundled Tool Watch

SwiftLocal 另外以 `tools/bundled-tools.lock.json` 追蹤六個會隨 Windows 發佈版使用的外部工具：yt-dlp、Deno、FFmpeg、Tesseract、QPDF、LibreOffice。

本機可手動檢查：

```bash
npm run tools:updates
```

GitHub Actions 的 `.github/workflows/bundled-tool-watch.yml` 會每週自動檢查上游 stable release。這個流程是 **notify-only**：

- 不會自動下載或替換任何 binary
- 不會自動修改 lock file
- 不會自動 merge 更新
- 有新版本、來源檢查錯誤或尚未解決的追蹤缺口時，建立／更新 `[Maintenance] Bundled Tool Watch` issue
- 相同狀態使用 fingerprint 去重，不會每週重複通知同一批更新
- 關閉已知 issue 後，同一 fingerprint 不會再次建立；上游版本再變才重新提醒

`reviewedVersion` 代表維護者最後審閱過的上游版本，不一定等於實際 bundled binary。yt-dlp／Deno 的來源由 `tools/media-download-tools.lock.json` 鎖定；Windows FFmpeg、Tesseract、QPDF、LibreOffice 的來源由 `tools/native-tools.lock.json` 鎖定。Watch 的 maintenance 範圍是目前發佈的 Windows x64；未解決的 Windows 來源追蹤缺口即使版本已追上，仍會觸發報告。macOS 的 Homebrew／本機應用程式複製仍未鎖定，另列為未涵蓋的工作；Windows 安裝驗收狀態見 `docs/WINDOWS_ACCEPTANCE_2026-09-16.md`。

收到更新提示後，先看 release notes；決定升級才更新來源／checksum 或本機 bundled tool，然後重新跑 `npm run smoke:release` 與打包驗證。

### Full 版必備：繁中 tessdata

預設 OCR 語言為 `chi_tra+eng`。打 **Full** 包（`npm run pack:win:full` / `pack:mac:full`）前會自動執行：

```bash
npm run tools:tessdata
```

腳本 `scripts/ensure-tessdata.js` 會：

1. 在 `tools/**/tessdata` 檢查 `eng`、`chi_tra`、`osd`
2. 若缺少，優先從本機系統 Tesseract 複製（Windows：`C:\Program Files\Tesseract-OCR\tessdata`）
3. 仍缺少則從 GitHub `tesseract-ocr/tessdata_fast` 的 4.1.0 固定 commit 下載
4. 依 `tools/tessdata.lock.json` 驗證檔案大小與 SHA-256；Windows 建置與產物檢查亦涵蓋所有額外語言包，未鎖定或校驗不符者中止建置
5. Full build **缺少或校驗不符則中止**，避免出貨後用家無法用繁中 OCR

手動只檢查（不下載）：

```bash
npm run tools:tessdata:check
```

### Windows 原生工具：固定來源及完整檔案校驗

```bash
npm run tools:native        # FFmpeg 9.0.1、QPDF 12.4.1、Tesseract 5.5.3
npm run tools:native:full   # 加上 LibreOffice 26.2.6（需要 Windows）
npm run tools:native:check  # 不連網，檢查前三項完整目錄
```

`tools/native-tools.lock.json` 記錄 Windows x64 的版本、URL、下載包 SHA-256 及抽取規則：

- FFmpeg 使用 Gyan 發行包；QPDF、Tesseract 使用各專案 GitHub release。抽取後的程式、DLL、PDF 支援檔及隨附授權檔有另一個 Git 內的完整目錄 digest，檔案新增、遺失或內容改變都會失敗。
- Windows 建置主機需安裝完整 7-Zip（`Program Files/7-Zip/7z.exe`）以抽取 NSIS；electron-builder 的精簡 7za 不支援此格式。抽取結果仍須符合固定目錄 digest。用家執行 Full 安裝包不需要 7-Zip。
- Tesseract 的 `tessdata/*.traineddata` 及 `swiftlocal-tessdata.json` 由既有 tessdata 流程管理，語言資料另行校驗；原有語言包會保留，打包前再驗證必要語言。
- LibreOffice 使用 Document Foundation 固定版本 MSI，先驗證下載包，再以 Windows `msiexec /a` 建立 administrative image，不從本機已安裝程式複製。排除 administrative image 重寫的 MSI 安裝資料後，19,486 個 runtime／授權／資源檔案以 Git 內固定 payload digest 校驗；不接受本機 receipt 自行核准內容。
- 替換既有目錄前會完整備份至 `~/.codex/backups/`，包含來源路徑及時間。備份不會混入發行包。
- `tools:populate` 保留為相容入口，現在會下載固定來源；`--skip-libreoffice` 只處理前三項。

Windows 一般版及 Full build 會自動 provision，再做 readiness 檢查。直接呼叫 electron-builder 也會檢查 native payload，成品驗證則再次核對 unpacked payload。

隔離驗證可使用：

```bash
node scripts/ensure-native-tools.js --download --tools-root /absolute/temp/tools
node scripts/ensure-native-tools.js --download --archives /absolute/archive-cache --tools-root /absolute/temp/tools
```

`--archives` 使用 lock 中的 `archiveName`，仍須通過原始 SHA-256；不會信任檔名或本機安裝版本。

**Windows 驗證：** 已實測 LibreOffice administrative extraction、四個原生工具的 runtime／轉換，以及 Installer 內容逐檔比對。`.github/workflows/native-tool-smoke.yml` 另外驗證真實 Tesseract 的非 ASCII 路徑，並在另一個 Windows runner 以新標準使用者執行安裝、啟動、轉換、升級及卸載。最新通過／失敗及乾淨 Windows VM 尚待驗收項目，以 [Windows 驗收報告](../docs/WINDOWS_ACCEPTANCE_2026-09-16.md) 為準。

**macOS 範圍：** yt-dlp／Deno 已鎖定；`bundle-mac-tools.js` 的 Homebrew 程式及 dylib、現有 LibreOffice.app 仍未鎖定。此變更不宣稱 macOS 或完整安裝包 bit-for-bit reproducible。

### 打包前一鍵檢查（建議）

```bash
npm run check:pack        # 一般版：tesseract.exe + chi_tra/eng/osd + ffmpeg + qpdf
npm run check:pack:full   # Full：上述 + LibreOffice soffice
```

缺什麼會用中文列出並 exit 1；通過後再：

```bash
npm run pack:win
# 或
npm run pack:win:full
```

`pack:win` / `pack:win:full` 會先補齊並校驗原生工具、媒體工具及 tessdata，再執行一次 fail-closed readiness 檢查。electron-builder 成功後會立即抽出成品，將整個 `win-unpacked` 檔案樹（包括 Electron runtime、`app.asar.unpacked` native modules、所有工具支援檔）逐檔與 Installer／Portable 內 payload 比對 SHA-256。另會明確要求 `app.asar`、yt-dlp、Deno、FFmpeg、Tesseract、QPDF、`eng`／`chi_tra`／`osd`，Full 版也要求 LibreOffice 主程式與啟動支援檔。缺檔、PE 結構／架構錯誤、SHA-256 不一致或不安全 NSIS 產品名稱提示都會以失敗結束。

Optional LibreOffice layout:

```text
tools/
  libreoffice/
    program/
      soffice.exe
      soffice.bin
      fundamental.ini
```

LibreOffice is intentionally optional because it is much larger than the other
tools. Office-to-PDF conversion needs it; most other SwiftLocal features do not.
