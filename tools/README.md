# Bundled Tool Layout

Put portable command-line tools in this folder before running `npm run pack:win`.
Electron Builder copies this folder to the packaged app's `resources/tools` folder,
and SwiftLocal detects these binaries automatically.

Recommended Windows layout:

```text
tools/
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

### Full 版必備：繁中 tessdata

預設 OCR 語言為 `chi_tra+eng`。打 **Full** 包（`npm run pack:win:full` / `pack:mac:full`）前會自動執行：

```bash
npm run tools:tessdata
```

腳本 `scripts/ensure-tessdata.js` 會：

1. 在 `tools/**/tessdata` 檢查 `eng`、`chi_tra`、`osd`
2. 若缺少，優先從本機系統 Tesseract 複製（Windows：`C:\Program Files\Tesseract-OCR\tessdata`）
3. 仍缺少則從 GitHub `tesseract-ocr/tessdata_fast` 下載
4. Full build **缺少則中止**，避免出貨後用家無法用繁中 OCR

手動只檢查（不下載）：

```bash
npm run tools:tessdata:check
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

`pack:win` / `pack:win:full` 也會自動跑此檢查。

Optional LibreOffice layout:

```text
tools/
  libreoffice/
    program/
      soffice.exe
```

LibreOffice is intentionally optional because it is much larger than the other
tools. Office-to-PDF conversion needs it; most other SwiftLocal features do not.
