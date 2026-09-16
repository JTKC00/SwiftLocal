# Windows bundled tools and installed-app acceptance — 2026-09-16

Status: **PASS for the automated Windows Server fresh-user and upgrade acceptance below.** This evidence is the basis for SwiftLocal v0.4.1 Windows 正式版. Interactive consumer items (GUI installer, SmartScreen prompt, default path, Explorer Open With, install/use/uninstall) are **PASS** by owner confirmation in [manual consumer acceptance](WINDOWS_MANUAL_ACCEPTANCE_2026-09-16.md). Clean Windows 11 VM / first-user OOBE remains **UNVERIFIED**.

v0.4.1 GitHub Release was published 2026-09-16. Lifecycle acceptance used a same-payload build stamp `0.4.1-qa.20260916`; the GitHub Release artifacts are a new Full Installer and Portable built with repository version `0.4.1`.

## Scope and environment

The release scope is Windows x64. GitHub-hosted `windows-2025` runners are disposable Windows Server environments with developer software preinstalled. A separate runner is used for installed-app acceptance, and separate newly created standard users with Unicode names are used for fresh installation and upgrade. The harness must prove absence of external engine registrations / known directories, remove developer tools from the app's PATH, and assert that every discovered conversion engine belongs to the installed Full package.

Installers are exercised in silent mode with explicit Unicode destination directories; interactive installer prompts and the default destination flow are not covered. The installed application itself is launched normally and its real renderer and IPC are exercised.

This provides fresh-user and installed-payload evidence. It does not prove Windows 11 OOBE, SmartScreen interaction, a visible Explorer Open With menu selection, or a pristine consumer OS image. When this runner evidence was written, no Windows VM or connected Windows host was found on the then-current Mac; those criteria remain unverified by this workflow.

## Bundled Tool Watch #11

Live upstream check on 2026-09-16 at 02:55:12 UTC: **0 updates, 0 source errors, 0 Windows tracking gaps**. The watch fingerprint is `fe6be9aa017429e18eb1`. This is the branch result; issue #11 and main are not represented as updated or closed before merge.

| Component | Locked Windows version | Source and runtime evidence |
| --- | --- | --- |
| yt-dlp | 2026.08.19 | Download SHA-256 checked on Windows and macOS; native version execution passed. |
| Deno | 2.9.6 | Download SHA-256 checked on Windows and macOS; native version execution passed. |
| FFmpeg | 9.0.1 | Gyan release archive and full selected runtime tree pinned; Windows execution and conversion passed. |
| QPDF | 12.4.1 | Official archive and full selected runtime tree pinned; Windows execution and PDF operations passed. |
| Tesseract | 5.5.3.20260724 | Official installer and runtime tree pinned; language data has its separate lock. Windows source and installed Unicode text/searchable-PDF OCR passed; installed language resources remained unchanged. |
| LibreOffice | 26.2.6 | Official MSI pinned; administrative extraction excludes the generated MSI itself. 19,486 runtime/resource/license files are covered by a checked-in tree digest. |

Reproducibility here means immutable downloaded source archives and verified application payload contents. Byte-for-byte reproducibility of the entire Electron/NSIS installer is not claimed.

LibreOffice runtime SHA-256: `8c88e50fe694958ff584b1868b707210877bf40850540c7cfc4348bbd6f6b003`.

Two independent Windows extractions produced this identical digest: [run 35047265865](https://github.com/JTKC00/SwiftLocal/actions/runs/35047265865) and [run 35047413949](https://github.com/JTKC00/SwiftLocal/actions/runs/35047413949). These whole workflows were cancelled after their useful evidence was captured because newer commits superseded their builds; they are not recorded as whole-workflow passes.

In run 35047413949, the **Exercise bundled OCR, PDF, media and Office conversions** step passed: PDF merge/split/rotate/compress/encrypt/decrypt; image conversion; chi_tra+eng OCR; searchable PDF; DOCX→PDF; PDF→DOCX and PDF→Office; WAV→MP4→MP3; queue cancellation.

The same native provisioning, Full readiness and conversion-smoke stages also passed in [run 35048060107](https://github.com/JTKC00/SwiftLocal/actions/runs/35048060107) with the immutable LibreOffice pin enforced. That run failed later during NSIS compilation because of malformed quoted registry values; it did not reach installed-app acceptance. The quote syntax was corrected in `e00df61`, with targeted tests passing. [Run 35048634907](https://github.com/JTKC00/SwiftLocal/actions/runs/35048634907) then compiled the installer, but electron-builder attempted implicit CI publishing and failed for lack of a publish token; nothing was published and payload verification did not run. Commit `8585a10` explicitly disables publishing for Windows packaging.

Local validation: 307 JavaScript tests passed with no failures or skips; targeted native-lock and Windows association regressions passed after the subsequent changes. Syntax and CI metadata checks passed. PowerShell scripts were additionally parsed on the real Windows runner.

Every bundled language model, including optional models, must also match `tools/tessdata.lock.json`; an unknown model or a modified optional model is rejected before packaging and during artifact verification.

macOS native Homebrew binaries, dylibs and LibreOffice.app remain outside this Windows release scope and are not claimed reproducible.

Upstream release notes were reviewed for [yt-dlp 2026.08.19](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19), [Deno 2.9.6](https://github.com/denoland/deno/releases/tag/v2.9.6), and [QPDF 12.4.1](https://github.com/qpdf/qpdf/releases/tag/v12.4.1). Live third-party video-site extraction is not part of this Windows installer sign-off.

## Installed-app acceptance matrix

The corrected Full Installer was built and compared file-for-file with the build output in [run 35054778424](https://github.com/JTKC00/SwiftLocal/actions/runs/35054778424), application commit `5d12ea58e6707bdc62527c87a988cec0a77f21af`. Both the build and separate fresh-user job finished successfully. The fresh-install and upgrade scenarios passed in independent new standard-user profiles.

- Candidate Installer: `SwiftLocal-0.4.1-qa.20260916-full-installer-x64.exe` (802,518,507 bytes).
- Candidate SHA-256: `d608c790eab1118394d76158bfef2cec339bb5e3849593c8a82da4605b13456c`.
- Published v0.4.0 baseline SHA-256: `561baa2a6edaf02dade16c1dfe791daf785e0646027f92eb71e6df9cb8177b59`.

Candidate version is build-only `0.4.1-qa.20260916`; repository/release version is not changed or published. The published baseline was checked against its release SHA256SUMS.

Commit `bf92296` subsequently strengthened build verification of optional language models without changing application runtime files. Its Ubuntu, Windows and macOS CI passed in [run 35055554239](https://github.com/JTKC00/SwiftLocal/actions/runs/35055554239). The same candidate was downloaded and rechecked with that verifier on macOS: all four native runtime digests and all four language hashes matched. The application manifest contains 19,691 files; this count is not a claim that the whole Installer is reproducible byte-for-byte. Windows-specific version execution was covered by the Windows run, not the later macOS content audit.

| Requirement | Status | Evidence |
| --- | --- | --- |
| Fresh standard Windows user | PASS | Run 35054778424: actual SL驗收71645 identity and new Unicode profile |
| Install Full without external engine discovery | PASS (runner scope) | No engine registrations, known directories or commands; all four engines resolved under installed resources/tools |
| First launch and renderer | PASS | Actual installed EXE, live IPC, visually inspected desktop home; the immediate first-frame capture precedes the desktop badge initialization |
| Unicode install/input/output/temp paths | PASS (both scenarios) | Chinese user profile, Chinese/Japanese/accented paths, successful installed conversion outputs |
| OCR / PDF / Office / media conversion | PASS (both scenarios) | PDF compression, image text OCR, searchable PDF, DOCX→PDF, WAV→MP3; recorded nonempty outputs and OCR text assertion |
| Installed OCR resources survive conversions | PASS (both scenarios) | chi_tra, eng, PDF config and font hashes remain identical after all five jobs |
| Upgrade v0.4.0 to candidate | PASS | Separate SL驗收16232 profile; product version replaced, localStorage marker and Unicode output setting preserved; all five conversions and shell-open repeated successfully |
| Uninstall | PASS (both scenarios) | EXE, uninstall registration, shortcuts, PDF class, Applications entry and OpenWithProgids entry removed; existing PDF default retained |
| PDF Open With registration + shell invocation | PASS (both scenarios) | ShellExecuteEx invoked the registered class and opened a.pdf in the PDF workspace; screenshot visually inspected |
| Visible Explorer Open With menu selection | PASS (manual consumer) | Not covered by this runner (`ShellExecuteEx` only). Owner confirmation 2026-09-16 on GitHub v0.4.1: visible Explorer menu listed SwiftLocal and opened the PDF workspace. See [manual consumer acceptance](WINDOWS_MANUAL_ACCEPTANCE_2026-09-16.md). |
| Interactive installer / default install destination / SmartScreen | PASS (manual consumer) | CI still uses silent `/S /D=…`. Owner confirmation 2026-09-16 on GitHub v0.4.1: GUI installer, default path, SmartScreen/unknown-publisher prompt then successful install. See [manual consumer acceptance](WINDOWS_MANUAL_ACCEPTANCE_2026-09-16.md). |
| Clean Windows 11 VM / first-user OS setup | UNVERIFIED | Requires a clean consumer Windows VM / OOBE. The manual session was a general Windows 11 PC, not a first-user image. See [manual consumer acceptance](WINDOWS_MANUAL_ACCEPTANCE_2026-09-16.md). |

The shell fixture `a.pdf` is intentionally a blank one-page PDF. Its screenshot verifies the correct document tab and page count; it is not a test of complex PDF rendering.

Durable evidence: [fresh installed checks](acceptance/2026-09-16/fresh-installed.json), [fresh lifecycle](acceptance/2026-09-16/fresh-lifecycle.json), [upgrade installed checks](acceptance/2026-09-16/upgrade-installed.json), [upgrade lifecycle](acceptance/2026-09-16/upgrade-lifecycle.json), [desktop home](acceptance/2026-09-16/fresh-desktop.png), [shell-opened PDF](acceptance/2026-09-16/fresh-shell-pdf.png), [native payloads](acceptance/2026-09-16/native-payloads.json), [Windows Electron OCR](acceptance/2026-09-16/unicode-ocr-electron.json), [strict candidate content audit](acceptance/2026-09-16/final-payload-audit.json).

## Failures found and addressed during real Windows execution

1. Windows electron-builder `7za` cannot extract NSIS. The build host now uses full 7-Zip for the Tesseract installer; the output must still match the pinned tree digest.
2. Tesseract reports the complete build version `5.5.3.20260724`, which is now explicitly recorded instead of broadening the version check.
3. `ensure-tessdata` generates `swiftlocal-tessdata.json`. Only its managed language files and exact manifest are excluded from the native runtime digest; PDF configs/fonts remain covered, and required language hashes are independently enforced.
4. LibreOffice administrative extraction rewrites a build-specific MSI. That installer metadata is excluded from the application payload; the remaining runtime digest was identical across two runners.
5. Windows temporary-file locks could mask the original provisioning error. Cleanup has bounded retries and preserves the original error and staged manifest.
6. NSIS compilation rejects malformed dollar-prefixed quote characters. Registry values now use correctly quoted strings; the compiler failure is retained in run 35048060107.
7. electron-builder's standard NSIS association macro writes the `.pdf` default value. Windows now uses an explicit `SwiftLocal.PDF` Open With registration without that macro. Global associations were moved to macOS because electron-builder concatenates global and platform associations.

8. The Windows builder arguments are checked with electron-builder's actual parser for Installer, Portable, combined, and unpacked targets. An incorrect option position was caught and repaired before the final run.
9. electron-builder implicitly attempted publishing from CI after successful NSIS compilation. Both Windows packaging entrypoints now pass `--publish never`; publishing is separate from build/acceptance.

10. The installed IPC job contract exposes output objects with `path`, not strings. A harness assertion originally failed after PDF compression completed; it now reads the actual public contract. This was a harness failure, not evidence of a failed conversion.
11. A new RunAs token still inherited runneradmin's AppData environment. The harness now derives AppData and Temp from the verified new Unicode profile and records the paths. The initial failure is not counted as an app installation failure or a pass.

12. **Product defect found by installed-app acceptance:** run 35051454680 installed and launched successfully, discovered all four bundled engines, and completed PDF compression, but real Tesseract failed on Unicode tessdata paths (`??` in its diagnostic). The initial installer is not accepted. Commit `f554e0a` uses a private working directory, ASCII relative arguments, and an ephemeral tessdata junction for both text OCR and searchable PDF; output publication stays exclusive and cleanup must preserve installed language data. Unit/process regressions and the real Windows binary regression passed in run 35052264243. Its installed candidate SHA-256 is `f6f45a3b01436765200d080ce2485442c5e9d658c72209d3f522f5fd04ae95a3`. Installed text OCR passed, but searchable PDF failed to load language data; this candidate is still not accepted. A follow-up run records language-resource hashes between operations and continues independent checks without turning any failure into a pass.

13. **The junction workaround was rejected by acceptance:** in run 35053746187, checksums proved that the first OCR operation removed the installed language models, PDF config and PDF font under packaged Windows Electron. Plain Node smoke and unit tests had not exposed this runtime difference. Commit `5d12ea5` removes junctions entirely and copies only selected models plus support files into private scratch storage. The regression deliberately mutates scratch copies and proves the originals remain intact. Windows smoke now also runs inside the actual Electron runtime, and installed acceptance compares resource hashes after every conversion. Neither failed candidate was published. The retained [rejection evidence](acceptance/2026-09-16/rejected-junction-candidate.json) includes both scenarios and their before/after resource hashes.
14. The shell helper originally used Windows PowerShell 5's `Add-Type`, whose compiler failed on the new user's Unicode Temp path. Acceptance now invokes the runner's absolute PowerShell 7 executable; the app still runs with an OS-only PATH. This harness failure does not count as a failed or passed Windows shell association.

Run 35053746187 additionally confirmed installed PDF compression, image OCR, DOCX→PDF, WAV→MP3, normal exit, upgrade retaining settings and localStorage, and uninstall in both scenarios. Its searchable PDF and shell-helper failures keep the whole run failed. The corrected Installer subsequently passed the complete acceptance in run 35054778424.

## Repeating the checks

`Native Tool Smoke` builds a Full Installer from pinned sources, verifies its unpacked contents, then downloads that artifact on a separate Windows runner. The lifecycle harness creates and later removes its own standard test accounts; it refuses ordinary local machines.

The workflow's optional `candidate_run` input reuses the exact `windows-full-candidate` artifact from a completed build run. It allows changes to acceptance scripts to be tested without rebuilding the installer. Lifecycle evidence records the source run and candidate/baseline SHA-256 values. Candidate artifacts are retained for 3 days and evidence for 7 days; the results in this document are the durable summary.

The recorded candidate passed the complete automated lifecycle. Passing this workflow alone must not close consumer interactive criteria.

## Manual consumer acceptance

Owner confirmation of the GitHub Release v0.4.1 GUI flow is in [WINDOWS_MANUAL_ACCEPTANCE_2026-09-16.md](WINDOWS_MANUAL_ACCEPTANCE_2026-09-16.md): interactive installer, SmartScreen prompt with continued install, default path, first launch, workspaces, visible Explorer Open With, retained PDF default, PDF / OCR / Office / media, normal exit, and uninstall leftovers. Clean Windows 11 VM / first-user OOBE remains **UNVERIFIED**.

A separate developer-host snapshot of a silent local **0.4.0** Full Installer is recorded in that document and is not this workflow.

Historical failures, rejected candidates, and runner evidence in this file are unchanged.
