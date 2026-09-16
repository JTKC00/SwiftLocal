# Windows 11 consumer manual acceptance — 2026-09-16

Status: **PASS for the GitHub Release v0.4.1 consumer flow below.** Clean Windows 11 VM / first-user OOBE remains **UNVERIFIED**. Automated Windows Server results stay in [WINDOWS_ACCEPTANCE_2026-09-16.md](WINDOWS_ACCEPTANCE_2026-09-16.md) and are not mixed into these rows.

## Scope

| Field | Recorded value |
| --- | --- |
| Environment | General Windows 11 x64 consumer PC (not a GitHub runner; not claimed as a clean VM / OOBE) |
| Source | Official GitHub Release [v0.4.1](https://github.com/JTKC00/SwiftLocal/releases/tag/v0.4.1) |
| Installer | `SwiftLocal-0.4.1-full-installer-x64.exe` |
| Method | Interactive GUI installer (not NSIS `/S`) |
| Confirmed by | Project owner, 2026-09-16 |

Automated Windows Server PASS is not treated as consumer PASS. These rows are owner confirmation of a manual session that had not previously been written into the repo.

## Verdict rules

- **PASS** — project owner confirmed the item
- **FAIL** — durable failure evidence exists
- **PARTIAL** — only part of the claim was observed
- **UNVERIFIED** — insufficient evidence

## Matrix — GitHub Release v0.4.1 consumer flow

| Item | Status | Evidence |
| --- | --- | --- |
| General Windows 11 x64 consumer environment | PASS | Owner confirmation 2026-09-16. Not recorded as a clean VM or first-user OOBE. |
| Official GitHub Release v0.4.1 | PASS | Owner confirmation 2026-09-16: downloaded from the v0.4.1 Release. |
| `SwiftLocal-0.4.1-full-installer-x64.exe` | PASS | Owner confirmation 2026-09-16. |
| Interactive GUI installer | PASS | Owner confirmation 2026-09-16: double-click, GUI install completed. |
| Windows SmartScreen / Unknown Publisher | PASS | Owner confirmation 2026-09-16: a SmartScreen / unknown-publisher prompt appeared; install still completed. Exact button labels were not captured. |
| Default install path (no custom folder) | PASS | Owner confirmation 2026-09-16: GUI install used the default destination, unchanged. |
| First launch after install | PASS | Owner confirmation 2026-09-16: main window opened without crash. |
| Home and main workspaces | PASS | Owner confirmation 2026-09-16: home and the five core workspaces opened. |
| Explorer → Open With → SwiftLocal | PASS | Owner confirmation 2026-09-16: visible Explorer menu listed SwiftLocal; choosing it opened the PDF workspace. |
| Existing default PDF reader retained | PASS | Owner confirmation 2026-09-16: double-click still opened the previous PDF reader, not SwiftLocal. |
| Basic PDF operations | PASS | Owner confirmation 2026-09-16: open plus at least one real PDF operation succeeded. |
| `chi_tra+eng` OCR | PASS | Owner confirmation 2026-09-16: Traditional Chinese + English OCR succeeded on the installed Full copy. |
| Office conversion | PASS | Owner confirmation 2026-09-16: at least one Office conversion succeeded. |
| Media conversion | PASS | Owner confirmation 2026-09-16: at least one media conversion succeeded. |
| Normal exit | PASS | Owner confirmation 2026-09-16: the app quit normally. |
| Uninstall | PASS | Owner confirmation 2026-09-16: Windows uninstall / product uninstaller completed. |
| After uninstall: shortcuts / app files / Open With | PASS | Owner confirmation 2026-09-16: shortcuts, install files, and Explorer Open With entry were gone. |
| After uninstall: previous PDF default retained | PASS | Owner confirmation 2026-09-16: double-click still used the original PDF reader. |
| Clean Windows 11 VM / first-user OOBE | UNVERIFIED | Not part of this session. Owner stated remaining untested items stay unverified. |
| Code signing / Microsoft Store / MSIX | UNVERIFIED | Out of scope. Release binaries remain unsigned. |

Owner also stated there was **no known FAIL** from this session.

## Developer-host snapshot (not the v0.4.1 consumer session)

A separate 2026-09-16 snapshot on the current workstation still had a **0.4.0** silent (`/S`) Full install under `%LOCALAPPDATA%\Programs\swiftlocal`, with `SwiftLocal.PDF` registered and `.pdf` UserChoice `FoxitReader.Document`. That snapshot is a later or earlier local 0.4.0 pack-and-install, not the GitHub v0.4.1 GUI session above.

## Product facts

- NSIS is `oneClick: true`, `perMachine: false`, `allowToChangeInstallationDirectory: false`.
- PDF registration is `SwiftLocal.PDF` Open With only; see `build/windows-file-associations.nsh`.
- GitHub Release Windows binaries are unsigned. Owner observed a SmartScreen / unknown-publisher prompt and still completed install.

## Still not tested

- Clean Windows 11 VM / first-user OOBE
- Commercial code signing
- Microsoft Store / MSIX
- Exact SmartScreen button copy / every Defender combination
