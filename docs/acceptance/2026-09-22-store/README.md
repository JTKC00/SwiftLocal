# Store production-identity evidence — 2026-09-22

Phase 2A candidate for product v0.4.1. Package version 1.0.0.0 is the Windows
Store package version, not product version 1.0. No Microsoft Store submission,
GitHub release update, production certificate or signing key is included here.

- `package.json`: unsigned `SwiftLocal-0.4.1-store-x64.appx` size/hash from commit `7e38c7c`.
- `AppxManifest.xml`: extracted manifest. Identity name, publisher and publisher display name are the reserved Partner Center values. Package family name and Store ID are absent.
- `lifecycle.json`: Windows run [35708405363](https://github.com/JTKC00/SwiftLocal/actions/runs/35708405363) install, installed package family name, PDF default, smoke, WACK and uninstall.
- `wack-summary.json`: all 24 tests and the optional Blocked executables messages. Overall PASS.
- `wack-tests.xml`: REPORT attributes and the REQUIREMENTS section. The large dependency inventory is omitted. The full XML fingerprint is `reportSha256` in the summary.
- `store-installed.json`: packaged Electron startup, six native probes and six conversion checks.
- `output-content-checks.json`: local readback of the retained OCR text, searchable PDF and DOCX XML.
- `store-first-launch.png`, `store-home.png`, `store-pdf.png`: installed Electron screenshots.
- `conversions/`: synthetic outputs retained from the run.

The deep AppData LibreOffice `0xC0000409` case is unchanged and is not in this folder as a fix. Its Phase 1 record remains `../2026-09-21-store/rejected-appdata-paths.json`.

Original artifacts (14-day retention):

- [AppX](https://github.com/JTKC00/SwiftLocal/actions/runs/35708405363/artifacts/10686752345)
- [Full evidence, including the original WACK XML](https://github.com/JTKC00/SwiftLocal/actions/runs/35708405363/artifacts/10687198062)
