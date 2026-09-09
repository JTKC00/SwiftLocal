# Bundled Tool Layout

Put portable command-line tools in this folder before running `npm run pack:win`.
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
- 有新版本或來源檢查錯誤時，才建立／更新 `[Maintenance] Bundled Tool Watch` issue
- 相同狀態使用 fingerprint 去重，不會每週重複通知同一批更新
- 關閉已知 issue 後，同一 fingerprint 不會再次建立；上游版本再變才重新提醒

`reviewedVersion` 代表維護者最後審閱過的上游版本，不一定等於實際 bundled binary。yt-dlp／Deno 可直接由 `tools/media-download-tools.lock.json` 取得真正鎖定版本；FFmpeg、Tesseract executable、QPDF、LibreOffice 目前仍主要從本機安裝複製，因此 Watch 會清楚標示未完全 lock-pinned 的範圍。

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
4. 依 `tools/tessdata.lock.json` 驗證檔案大小與 SHA-256
5. Full build **缺少或校驗不符則中止**，避免出貨後用家無法用繁中 OCR

手動只檢查（不下載）：

```bash
npm run tools:tessdata:check
```

### 從本機安裝一鍵複製到 tools/（Windows）

若已用官方安裝程式裝過 Tesseract／FFmpeg／QPDF／LibreOffice：

```bash
npm run tools:populate    # 複製到 tools/（LibreOffice 較大，需數分鐘）
npm run tools:tessdata    # 確保 eng + chi_tra + osd
npm run check:pack        # 或 check:pack:full
```

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

`pack:win` / `pack:win:full` 會先補齊並校驗 tessdata，再執行一次 fail-closed readiness 檢查。electron-builder 成功後會立即抽出成品，將整個 `win-unpacked` 檔案樹（包括 Electron runtime、`app.asar.unpacked` native modules、所有工具支援檔）逐檔與 Installer／Portable 內 payload 比對 SHA-256。另會明確要求 `app.asar`、yt-dlp、Deno、FFmpeg、Tesseract、QPDF、`eng`／`chi_tra`／`osd`，Full 版也要求 LibreOffice 主程式與啟動支援檔。缺檔、PE 結構／架構錯誤、SHA-256 不一致或不安全 NSIS 產品名稱提示都會以失敗結束。

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
