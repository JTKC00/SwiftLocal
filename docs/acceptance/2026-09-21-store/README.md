# Store TEST evidence — 2026-09-21

The product remains v0.4.1. No Microsoft Store submission, GitHub release update,
production certificate or signing key is included here.

- `package.json`: exact unsigned AppX size/hash and build commit `17a510e`.
- `AppxManifest.xml`, `assets-receipt.json`: actual extracted manifest and generated-brand hashes.
- `certification-lifecycle.json`: unmodified Windows run 35564552400 lifecycle report,
  including temporary signed-copy hash, install/uninstall, PDF default preservation,
  conversion status and unchanged installed files.
- `wack-summary.json`: machine-readable interpretation of the complete WACK report;
  all 24 tests and all 593 optional finding messages are retained.
- `wack-tests.xml`: original REPORT attributes and entire REQUIREMENTS section;
  the large APPLICATIONS/dependency inventories are omitted. This is an excerpt,
  not a replacement for the original XML fingerprint in `wack-summary.json`.
- `rejected-appdata-paths.json`: exact earlier rejected package/arguments and failures;
  the deep AppData LibreOffice path case has not been diagnosed as fixed.
- `retest-lifecycle.json`, `store-installed.json`: passing content retest at `c60b8ec`
  against the identical unsigned candidate. The retest lifecycle says WACK was not
  requested; certification evidence belongs to the earlier identical candidate.
- `store-home.png`, `store-pdf.png`: actual installed Electron screenshots.
- `conversions/`, `output-content-checks.json`: synthetic conversion outputs and
  text readback; Chinese OCR/searchable PDF and DOCX-generated PDF content verified.

Original artifacts (14-day retention):

- [AppX](https://github.com/JTKC00/SwiftLocal/actions/runs/35564552400/artifacts/10623689745)
- [Full evidence, including the 6 MB original WACK XML](https://github.com/JTKC00/SwiftLocal/actions/runs/35564552400/artifacts/10623993880)
- [Same-candidate text-content retest](https://github.com/JTKC00/SwiftLocal/actions/runs/35566930271)

See [readiness and remaining gates](../../MICROSOFT_STORE_MSIX_READINESS.md).
