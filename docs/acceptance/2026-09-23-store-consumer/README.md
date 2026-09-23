# Windows 11 consumer acceptance — Phase 2C

Date opened: 2026-09-23. Status: **PHASE 2C INCOMPLETE**. Every human GUI row below is `UNVERIFIED`. Windows Server CI is not a consumer GUI pass. No Microsoft Store submission. Draft PR #13 is not merged. No v0.4.2. The published v0.4.1 GitHub Release is unchanged.

A row may become `PASS` only after the project owner writes the date and `I observed this` in the confirmation column. `FAIL`, `PARTIAL`, and `UNVERIFIED` are the other allowed results. Screenshots belong next to the row that they show. Use synthetic fixtures. Do not attach private documents.

## Frozen candidate

Do not rebuild this package for Phase 2C. A different hash is a different candidate and stops this cycle.

| Field | Value |
| --- | --- |
| Filename | `SwiftLocal-0.4.1-store-x64.appx` |
| Unsigned bytes | 1,115,695,293 |
| Unsigned SHA-256 | `38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404` |
| Built by | [run 35758117387](https://github.com/JTKC00/SwiftLocal/actions/runs/35758117387), commit `5b0e2c2` |
| Evidence commit | `1c577b7` records Phase 2B. It did not rebuild the AppX. |
| Identity | `JTKC.SwiftLocal` / `CN=48CB75C0-3F50-44EF-87EB-8203F196B957` / `JTKC` |
| Package family name | `JTKC.SwiftLocal_j44a9ewx73faj` (verification only) |
| Store ID | `9P6Z4M7VLWPD` (verification only) |
| Product version | 0.4.1 |
| Package version | 1.0.0.0 |
| Actions artifact re-check | Verified 2026-09-23 from run 35758117387 artifact `swiftlocal-appx`: filename, 1,115,695,293 bytes, SHA-256, manifest identity, and package version match. This is not a Windows 11 GUI result. |
| Windows machine re-check | UNVERIFIED until `prepare-sideload.ps1` prints the same SHA-256 on the acceptance machine |

The upload artifact stays unsigned. The preparation script signs a temporary copy for this machine only.

## Preparation

On the Windows 11 x64 machine, from this branch:

```powershell
./docs/acceptance/2026-09-23-store-consumer/prepare-sideload.ps1 -Package C:\path\SwiftLocal-0.4.1-store-x64.appx
```

The script checks the filename, byte size, SHA-256, manifest identity, package version, Windows 11, and x64. It creates a three-day, non-exportable certificate in `CurrentUser\My`, trusts that certificate only in `CurrentUser\TrustedPeople`, and signs `store-evidence/consumer-2026-09-23/SwiftLocal-0.4.1-store-x64.developer-signed-test.appx`. It then stops. It does not install the package.

`scripts/accept-store-package.ps1` is the CI path. It installs with `Add-AppxPackage` and must not be used for row A.

After the checklist and the Windows Settings uninstall:

```powershell
./docs/acceptance/2026-09-23-store-consumer/remove-sideload-certificate.ps1
```

That removes the temporary certificate and the signed test copy. It does not uninstall SwiftLocal and it does not delete user output.

`store-evidence/` is gitignored. Do not commit `prepare.json`, the signed AppX, a certificate, or a password.

## Machine record

Fill these from `store-evidence/consumer-2026-09-23/machine.json` and `prepare.json` after preparation. Until that file exists, each cell stays `UNVERIFIED`. `physicalOrVm` and `userTypeConfirmation` stay `UNVERIFIED` until the owner writes them; hypervisor and administrator flags are machine facts, not that confirmation.

| Record | Result | Value |
| --- | --- | --- |
| Windows edition | UNVERIFIED | |
| Windows version / build | UNVERIFIED | |
| x64 | UNVERIFIED | |
| Physical PC or VM | UNVERIFIED | |
| User type | UNVERIFIED | |
| Unsigned candidate SHA-256 on this machine | UNVERIFIED | expected `38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404` |
| Signed test-copy SHA-256 | UNVERIFIED | |
| PDF default before install | UNVERIFIED | |
| NSIS SwiftLocal installed | UNVERIFIED | record only; coexistence is Phase 2D |

## Human checklist

### A. Package installation

| Row | Required observation | Result | Owner confirmation | Evidence |
| --- | --- | --- | --- | --- |
| A1 | Double-click the developer-signed AppX | UNVERIFIED | | |
| A2 | Windows App Installer GUI appears | UNVERIFIED | | |
| A3 | SwiftLocal identity and display look sensible | UNVERIFIED | | |
| A4 | Install completes in that GUI | UNVERIFIED | | |
| A5 | No command-line or `Add-AppxPackage` install was used for this row | UNVERIFIED | | |

### B. First launch

Launch from the normal Windows UI, such as Start. The five core workspaces are PDF, OCR, Office, 圖片, and 影音.

| Row | Required observation | Result | Owner confirmation | Evidence |
| --- | --- | --- | --- | --- |
| B1 | SwiftLocal launches from Start or the normal Windows UI | UNVERIFIED | | |
| B2 | The main window appears | UNVERIFIED | | |
| B3 | Home opens | UNVERIFIED | | |
| B4 | PDF workspace opens | UNVERIFIED | | |
| B5 | OCR workspace opens | UNVERIFIED | | |
| B6 | Office workspace opens | UNVERIFIED | | |
| B7 | 圖片 workspace opens | UNVERIFIED | | |
| B8 | 影音 workspace opens | UNVERIFIED | | |

### C. Explorer PDF integration

Use a synthetic PDF.

| Row | Required observation | Result | Owner confirmation | Evidence |
| --- | --- | --- | --- | --- |
| C1 | Right-click a real PDF in Explorer | UNVERIFIED | | |
| C2 | Open with shows SwiftLocal | UNVERIFIED | | |
| C3 | SwiftLocal is chosen from that menu | UNVERIFIED | | |
| C4 | The PDF opens in the SwiftLocal PDF workspace | UNVERIFIED | | |

### D. Default PDF reader

| Row | Required observation | Result | Owner confirmation | Evidence |
| --- | --- | --- | --- | --- |
| D1 | The default reader was recorded before installation | UNVERIFIED | | |
| D2 | A normal PDF double-click after install still uses that previous reader | UNVERIFIED | | |
| D3 | Installation did not force SwiftLocal to become the default | UNVERIFIED | | |

### E. Representative operations

Open or inspect each output enough to see that it is a real file. A job-completed message is not enough.

| Row | Required observation | Result | Owner confirmation | Evidence |
| --- | --- | --- | --- | --- |
| E1 | A PDF operation, with the output inspected | UNVERIFIED | | |
| E2 | `chi_tra+eng` OCR, with the recognized text inspected | UNVERIFIED | | |
| E3 | A searchable PDF, with selectable text inspected | UNVERIFIED | | |
| E4 | DOCX → PDF, with the PDF opened | UNVERIFIED | | |
| E5 | PDF → DOCX, with the document opened | UNVERIFIED | | |
| E6 | A media conversion, with the output played or inspected | UNVERIFIED | | |

### F. Phase 2B deep-path regression

The automated result stays linked and is not downgraded. It is not a new GUI observation.

| Row | Required observation | Result | Owner confirmation | Evidence |
| --- | --- | --- | --- | --- |
| F1 | Phase 2B deep-AppData LibreOffice PASS remains the recorded package result | PASS | prior package evidence, not a Phase 2C GUI observation | [Phase 2B](../2026-09-22-store-phase2b/README.md), run [35758117387](https://github.com/JTKC00/SwiftLocal/actions/runs/35758117387) |
| F2 | Optional UI-accessible deep Unicode destination, if practical | UNVERIFIED | additional only; it does not replace F1 | |

### G. Normal exit

| Row | Required observation | Result | Owner confirmation | Evidence |
| --- | --- | --- | --- | --- |
| G1 | SwiftLocal closes normally | UNVERIFIED | | |
| G2 | No orphan visible SwiftLocal window remains | UNVERIFIED | | |

### H. GUI uninstall

Use Settings → Apps → Installed apps, or the equivalent consumer UI.

| Row | Required observation | Result | Owner confirmation | Evidence |
| --- | --- | --- | --- | --- |
| H1 | Uninstall starts from that Windows UI | UNVERIFIED | | |
| H2 | SwiftLocal disappears from installed apps | UNVERIFIED | | |
| H3 | The Start menu entry disappears | UNVERIFIED | | |
| H4 | The Open with registration disappears | UNVERIFIED | | |
| H5 | The original PDF default is unchanged | UNVERIFIED | | |
| H6 | Normal user output files remain | UNVERIFIED | | |

## Screenshots to collect

App Installer, Start or first launch, Explorer Open with, the PDF workspace, and Installed apps before uninstall. Store them beside this checklist only when they show the synthetic fixture and the SwiftLocal UI. Do not commit private filenames.

## Retained policy item

Optional WACK **Blocked executables** still fails with 593 messages in the Phase 2B report. That finding is unchanged and is not, by itself, a Phase 2C consumer-UI blocker. It stays open for later policy review.

## Verdict

**C. PHASE 2C INCOMPLETE.** One or more required manual rows remain unverified. All required GUI rows are unverified.

Jev (`jev-1.13.0`) chose C (confidence 1.0; probabilities A 0.0, B 0.0, C 1.0). The probability that a GUI row may pass from the hash or Server CI alone was 0.03. The probability that Store submission is allowed was 0.03. The probability that the described file is the frozen candidate was 0.61; the local SHA-256 comparison of the downloaded artifact matched the frozen digest exactly, and that comparison is the artifact check. Jev does not replace it and does not confirm any GUI row.

Phase 2D, Store update / data retention / uninstall semantics and coexistence with the NSIS release, waits until this verdict is A. Do not submit to the Microsoft Store.
