# Store Phase 2B evidence — 2026-09-22

Phase 2B keeps the Phase 2A Partner Center identity and package version
`1.0.0.0`. Product version remains 0.4.1. No Microsoft Store submission, GitHub
release update, production certificate or signing key is included here. Draft
PR #13 is not merged.

The Phase 2A failure record stays in
[docs/acceptance/2026-09-22-store](../2026-09-22-store/). The original
`0xC0000409` rejection stays in
[rejected-appdata-paths.json](../2026-09-21-store/rejected-appdata-paths.json).

- `package.json`: unsigned `SwiftLocal-0.4.1-store-x64.appx` size and SHA-256 from commit `5b0e2c2`.
- `AppxManifest.xml`: extracted manifest. Identity name, publisher and publisher display name are the reserved Partner Center values.
- `lifecycle.json`: Windows run [35758117387](https://github.com/JTKC00/SwiftLocal/actions/runs/35758117387) install, PDF default, smoke, WACK and uninstall.
- `wack-summary.json`: all 24 tests. Overall PASS. Optional Blocked executables fails with 593 messages.
- `store-installed.json`: packaged Electron startup, six native probes, the normal conversions, and `installed-conversion-office-to-pdf-deep-appdata`.
- `lo-matrix.json`: pre-fix packaged soffice path matrix from run [35756020077](https://github.com/JTKC00/SwiftLocal/actions/runs/35756020077). Every row has absolute paths, lengths, cwd, TEMP, the exact command, exit code and PASS/FAIL.
- `conversions/office-to-pdf-deep-appdata-office-smoke.pdf`: `%PDF-1.7`, 24,657 bytes, SHA-256 `a599b97d1c50f0a662dbdb3d1a63304cc88bfdacebc49df3a216ee953b121512`.
- `conversions/ocr-image-ocr-text_ocr.txt`: retained `chi_tra+eng` OCR text from the same run.

The full WACK XML and the installed-file inventory are omitted. Their fingerprints
are the report SHA-256 in `wack-summary.json` and the lifecycle payload check.
Original artifacts expire after 14 days:

- [AppX](https://github.com/JTKC00/SwiftLocal/actions/runs/35758117387)
- [Path matrix](https://github.com/JTKC00/SwiftLocal/actions/runs/35756020077)
