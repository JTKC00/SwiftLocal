# SwiftLocal engineering hardening report — 2026-08-14

## Scope and environment

This sprint audited the existing Electron desktop application, FastAPI backend, file-conversion pipelines, external-tool lifecycle, tests, CI metadata, and Windows packaging integrity. It intentionally did not add a major product feature or publish a release.

Work and runtime verification were performed on macOS. Cross-platform logic was tested locally; Windows packaging and runtime behavior are separated below and are not claimed as verified from macOS.

Baseline at commit `498065e`:

- `npm run typecheck` and `npm run check:ci` passed.
- Node tests: 168 total, 166 passed, 2 sandbox loopback tests skipped.
- Python tests: 81 passed after creating a local ignored `.venv` from the pinned direct requirements.
- `npm run check:pack` correctly failed because this checkout does not contain the Windows Tesseract, FFmpeg, and QPDF distributions.

## Work completed

### File and conversion safety

- Added collision-safe numbered output names across Desktop and FastAPI conversion paths. Existing DOCX, searchable PDF, merge, and other conversion outputs are no longer silently replaced in the reproduced cases.
- Replaced predictable searchable-OCR work directories with operation-owned random temporary directories. Cleanup can no longer recursively delete a pre-existing user directory with the old fixed name.
- Staged DOCX and searchable-PDF writes so failed operations do not expose partial final files. Failure cleanup no longer removes a final path that may have been created concurrently by another operation.
- Media conversions now remove partial outputs after failure and reject/clean an exit-0 zero-byte output.
- Added UTF-8 byte budgets for upload, conversion-output, and media-download filenames, including Traditional Chinese names and Windows reserved device names.
- Normalized FastAPI uploads to NFC and used NFC plus `casefold()` collision keys, preventing canonically equivalent APFS filenames from overwriting one another.

### Queue, persistence, and cleanup reliability

- Added atomic admission reservations around Desktop enqueue/retry and FastAPI create/retry/copy paths. Concurrent requests can no longer exceed the 50-job queued limit reproduced during the audit.
- Registered FastAPI uploads as in-flight before creating their directories, preventing orphan pruning from deleting a directory while multipart streaming is still in progress.
- Made Desktop and FastAPI job-state writes same-directory atomic replacements with flush/fsync and temporary-file cleanup.
- Made malformed JSON, invalid root shapes, and invalid job entries fail closed. The original state file and unknown job directories are preserved rather than silently converting corruption into an empty state and deleting results.
- Added failure-path cleanup for upload/copy reservations and work directories.

### External process lifecycle and OCR semantics

- Added Desktop external-process timeouts and process-tree termination. Python subprocesses now start in their own process group/session and terminate descendants on cancel or timeout.
- Desktop quit now cancels queued work, requests cancellation for running work, waits for external child termination, and waits with a hard deadline for in-process jobs to observe cancellation.
- Fixed PDF-to-DOCX compatibility preflight so it does not unconditionally require LibreOffice.
- Fixed `scanOcr=force`: both backends now require Tesseract, take the OCR/direct path, and do not silently use a successful LibreOffice conversion instead.
- Added regression coverage for cancellation, stubborn descendants on macOS, partial/empty FFmpeg output, output collisions, forced OCR, and long/Unicode names.

### Windows package integrity gates

- Reordered both Windows pack entry points to provision required media tools and tessdata before a single fail-closed readiness check.
- Added `tools/tessdata.lock.json`; `eng`, `chi_tra`, `osd`, and optional `chi_sim` are pinned to tessdata_fast tag `4.1.0`, revision `65727574dfcd264acbb0c3e07860e4e9e9b22185`, with exact byte counts and SHA-256 values. Downloads and local copies must match the lock.
- Replaced the two-byte `MZ` check with structural PE validation: DOS/PE signatures, COFF machine and executable flag, PE32/PE32+ optional-header size/magic, section-table bounds, and raw-section bounds. Main/tool executables must be AMD64; NSIS artifacts may be PE32.
- Readiness and post-package checks now require Tesseract plus DLL/tessdata, FFmpeg, QPDF plus DLL, yt-dlp, Deno, and Full-edition LibreOffice startup support files.
- Removed the builder filter that excluded `.bin` files, which would omit LibreOffice `soffice.bin`.
- Post-package verification now locates one exact application root, indexes the extracted tree once, and requires the complete `win-unpacked` relative-path set, file sizes, and SHA-256 values to match the Installer/Portable payload. It covers the Electron runtime, main EXE, resources, `app.asar.unpacked`, and complete tool subtrees; misplaced, missing, changed, and unexpected files fail.
- Tightened exact main-EXE selection and NSIS unsafe product-name hints. Updated packaging documentation to match Standard versus Full contents and the stronger checks.

## Bugs discovered

| Severity | Reproduction condition | Result before fix | Resolution and regression protection |
| --- | --- | --- | --- |
| P1 data loss | Existing `{stem}_ocr_searchable.pdf` or DOCX in output directory | Desktop/Python overwrote or deleted the existing file | Collision-aware staged outputs; Desktop/Python regressions preserve original bytes |
| P1 data loss | User directory named `{stem}_ocr_searchable_work` | Python recursively deleted that predictable directory | Random operation-owned temporary directory regression |
| P1 input corruption | Upload `é.pdf` and `é.pdf` to APFS | Second upload overwrote the first directory entry | NFC/casefold collision naming regression preserves both contents |
| P1 cleanup race | Slow upload overlaps another job's prune | In-progress upload directory was deleted | In-flight registration plus event-controlled async regression |
| P1 state/data loss | Truncated or structurally invalid jobs-state then restore/prune | Queue/history was replaced and job directories could be deleted | Atomic writes and fail-closed state regressions on both backends |
| P1 release false positive | Artifact omits/misplaces runtime/native/tool support or adds stale files | Selected-file/suffix checks could accept an unusable artifact | Exact complete path-set, size, and SHA-256 comparison; independent 7z counterexamples now reject |
| P2 resource cap | 51 concurrent enqueue/upload calls | All 51 passed a 50-job limit | Atomic admission reservations and concurrency tests |
| P2 lifecycle | Tool hangs or spawns a descendant; app quits | Desktop could wait indefinitely or leave a child running | Timeouts, process-tree termination, bounded quit wait, macOS descendant regressions |
| P2 partial output | FFmpeg writes a partial file then fails, or exits 0 with empty output | User-visible partial/empty output was retained as failure/success | Failure cleanup and non-empty-output tests on both backends |
| P2 filesystem | Long ASCII/CJK stems create output components over filesystem limit | `ENAMETOOLONG`/unknown failure | UTF-8 byte-budget helpers and regressions |
| P2 feature correctness | DOCX compatibility mode without LibreOffice, or `scanOcr=force` with LibreOffice available | Compat was blocked; forced OCR could be silently skipped | Mode-aware preflight/direct path and Desktop/Python tests |
| P2 release ordering | Missing tessdata at start of Windows pack | Readiness aborted before the downloader could provision it | Provision-before-gate tests for Standard and Full entry points |
| P2 release integrity | Header-shaped junk or incomplete Full/tool tree | Shallow PE/resource checks could pass | Structural PE and required-support-tree tests |

## Verification

Final verification after all code changes:

| Command / check | Platform | Result |
| --- | --- | --- |
| `SWIFTLOCAL_PYTHON=.venv/bin/python npm test` | macOS | PASS: Node 186 total / 184 passed / 2 sandbox loopback skips / 0 failed; Python 99/99 passed |
| `node --test tests/desktop/release-artifacts.test.js` | macOS, synthetic Windows fixtures | PASS: 13/13 |
| `npm run typecheck` | macOS | PASS |
| `npm run check:ci` | macOS | PASS |
| `git diff --check` | macOS | PASS |
| `SWIFTLOCAL_PYTHON=.venv/bin/python npm run smoke -- --skip-tests` | macOS, outside app sandbox | PASS: PDF merge/split/rotate/compress/encrypt/decrypt, image conversion, Traditional Chinese + English image/PDF OCR, DOCX→PDF through LibreOffice, WAV→MP4→MP3 through FFmpeg, queued cancellation |
| `npm run check:pack` | macOS checkout | Expected fail-closed: missing Windows Tesseract/tessdata, FFmpeg, and QPDF; pinned yt-dlp and Deno accepted |
| Independent reliability re-review | macOS | PASS; no remaining P0/P1 in the verifiable scope |
| Independent release counterexample re-review | macOS, generated 7z fixtures | PASS: exact artifact accepted; missing root main/runtime/native module/LibreOffice support, misplaced main, unexpected file, unsafe NSIS hint, helper-only main, and malformed PE all rejected |

The two skipped Node tests require loopback listeners, which the execution sandbox prohibits. Equivalent networking code was not weakened to make those tests green.

The smoke test initially encountered the macOS app sandbox's LibreOffice restriction; rerunning the same repository smoke command outside that sandbox succeeded. This is an execution-environment distinction, not a Windows verification claim.

## Remaining risks

- Desktop `runProcess` and Python `_run_process_sync` still collect subprocess stdout/stderr without a byte bound. A faulty or hostile external tool could cause memory pressure. A bounded diagnostic tail should replace unlimited capture.
- `nextAvailablePath`/`next_available_path` prevent overwriting files that already exist at selection time, but selection and final creation are not an atomic no-clobber transaction. A narrow cross-process/cross-service TOCTOU race remains.
- Full-artifact verification hashes every file synchronously. Correctness is covered with fixtures, but the time, memory, and disk cost of a real large Full package needs measurement on the Windows release host.
- tessdata, yt-dlp, and Deno have pinned integrity metadata. The locally populated Tesseract, FFmpeg, QPDF, and LibreOffice binary distributions are structurally checked and copied exactly into artifacts, but their upstream versions/hashes are not yet centrally locked.
- Python direct requirements are version-pinned, but platform-specific transitive dependencies are still resolved by pip without a cross-platform hash lock.
- PyMuPDF/fitz emitted deprecation warnings during tests; migration to the supported `pymupdf` import should be scheduled before the legacy alias is removed.

## Windows verification required

The following are explicitly **not runtime-verified on macOS** and must be checked on a real x64 Windows environment:

- Build Standard and Full `win-unpacked`, Portable, and NSIS Installer artifacts with the real release tool tree; run the strengthened verifier and measure Full-package resources.
- Launch installed and portable applications and exercise bundled-path Tesseract (`eng`/`chi_tra`/`osd`), FFmpeg, QPDF, and LibreOffice conversions.
- Verify Node/Python `taskkill.exe /T /F` cancellation, timeout, and app-quit behavior, including descendant processes.
- Verify NTFS Unicode/case behavior, long paths, atomic replace semantics, read-only destinations, and locked files.
- Inspect main EXE version resources, NSIS `FriendlyAppName`, PDF file association, Explorer open-with behavior, icons, install/uninstall, and clean-VM startup.
- Run the Windows CI matrix. Fake external-tool integration tests that use `.cmd` are intentionally skipped on Windows because production uses `spawn(..., shell: false)`; real `.exe` smoke coverage is required.
- Validate code signing and SmartScreen behavior once signing credentials are available.

## Blocked items

- No Windows host or Windows packaging tool tree was available in this macOS sprint, so no Installer/Portable was built merely to obtain a green result.
- No signing identity, private key, or release credentials were available or needed. No release was created or published.
- Explorer integration and clean-VM/manual UI checks require human-accessible Windows infrastructure.

## Product recommendations

- Add a visible recovery notice when a jobs-state file is quarantined/fail-closed, with a user-controlled export/reset action. The sprint preserved data but deliberately did not design this UX.
- Introduce a shared atomic output reservation/no-clobber service across local conversion and media-download services.
- Add a Windows release qualification workflow that builds Standard and Full artifacts, runs real bundled-tool smoke conversions, then records the exact verifier manifest and timing.
- Lock upstream versions and hashes for every populated Windows binary distribution, not only tessdata/yt-dlp/Deno.

## Commits

- `2c658be` — `fix: harden job and conversion reliability`: output safety, queue/state reliability, process lifecycle, OCR semantics, and regression tests.
- `6908508` — `build: strengthen Windows package integrity gates`: pinned tessdata, structural PE validation, complete exact artifact manifests, packaging order/support checks, tests, and documentation.
- `docs: record hardening sprint results` — this report. Its own hash is intentionally not embedded because a Git commit cannot contain its final self-referential hash.
