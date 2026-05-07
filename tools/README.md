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
      eng.traineddata
      chi_tra.traineddata
      chi_sim.traineddata
  qpdf/
    bin/
      qpdf.exe
```

Optional LibreOffice layout:

```text
tools/
  libreoffice/
    program/
      soffice.exe
```

LibreOffice is intentionally optional because it is much larger than the other
tools. Office-to-PDF conversion needs it; most other SwiftLocal features do not.
