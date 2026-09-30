# Windows 11 consumer acceptance — Phase 2C

Date opened: 2026-09-23. Continued: 2026-09-30. Status: **PHASE 2C INCOMPLETE**. All human rows started `UNVERIFIED`; D1 now has explicit owner confirmation. Windows Server CI is not a consumer GUI pass. No Microsoft Store submission. Draft PR #13 is not merged. No v0.4.2. The published v0.4.1 GitHub Release is unchanged.

A human row may become `PASS` only after explicit project-owner confirmation of personally observing it. Record the date and confirmation in the row; a natural-language confirmation in this chat is sufficient when it clearly identifies the observation. `FAIL`, `PARTIAL`, and `UNVERIFIED` are the other allowed results. Screenshots belong next to the row that they show. Use synthetic fixtures. Do not attach private documents.

Continuation: 2026-09-30 (Asia/Hong_Kong). The owner selected **this PC** for the test. The existing PR description was checked and already recorded Phase 2B **BLOCKER FIXED**, retained Phase 2A history, and identified Phase 2C as the active gate. Preparation scripts were corrected for Windows PowerShell 5.1 UTF-8 handling and App Installer's machine certificate trust. These are acceptance-tool changes; the AppX and product code are unchanged.

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
| Windows machine re-check | PASS on 2026-09-30: downloaded artifact `10710269389` from the same run; filename, bytes, SHA-256, unsigned state, manifest identity, product description, x64, and package version verified. Automated preparation evidence only. |

The upload artifact stays unsigned. The preparation script signs a temporary copy for this machine only.

## Preparation

On the Windows 11 x64 machine, from this branch:

```powershell
./docs/acceptance/2026-09-23-store-consumer/prepare-sideload.ps1 -Package C:\path\SwiftLocal-0.4.1-store-x64.appx
```

The script checks the filename, byte size, SHA-256, unsigned state, XML manifest identity, package version, Windows 11, and x64. It creates a three-day, non-exportable certificate in `CurrentUser\My` and signs `store-evidence/consumer-2026-09-23/SwiftLocal-0.4.1-store-x64.developer-signed-test.appx`. It then stops. It does not install the package. If the SDK is not installed, pass `-SignTool` pointing to a valid Microsoft-signed SDK tool. The 2026-09-30 preparation uses Microsoft.Windows.SDK.BuildTools `10.0.26100.9169` downloaded into the ignored `store-evidence/signing-tools/` folder; no SDK installation is needed.

Before installation, use an administrator PowerShell for the public-certificate trust step:

```powershell
./docs/acceptance/2026-09-23-store-consumer/trust-sideload-certificate.ps1
```

This checks the signed-copy hash, certificate thumbprint and subject, imports **only the public certificate** into `LocalMachine\TrustedPeople`, verifies the package signature, and stops before installation. [Microsoft's package signing instructions](https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing) require that machine store for installation; the former CurrentUser trust instruction was insufficient. No private key or PFX is exported. Return to your normal Windows session for the owner-performed App Installer GUI check.

`scripts/accept-store-package.ps1` is the CI path. It installs with `Add-AppxPackage` and must not be used for row A.

After the checklist and the Windows Settings uninstall, remove machine trust in an administrator PowerShell (also clean up if preparation is abandoned). Because this owner's normal account is standard, use the separate machine step:

```powershell
./docs/acceptance/2026-09-23-store-consumer/remove-sideload-certificate.ps1 -MachineTrustOnly
```

Then return to the **original signing user's normal PowerShell** and run:

```powershell
./docs/acceptance/2026-09-23-store-consumer/remove-sideload-certificate.ps1
```

That removes the exact receipt's machine trust, CurrentUser certificate and private key, public `.cer`, and signed test copy. It does not uninstall SwiftLocal or remove user outputs. Preserve `prepare.json` until cleanup; use a new evidence directory for any later preparation cycle.

`store-evidence/` is gitignored. Do not commit `prepare.json` (it contains local paths and a user SID), the signed AppX, a certificate, or a password. Publish only the sanitized machine/candidate receipt and reviewed evidence. Temporary trust cleanup remains pending until acceptance or abandonment finishes.

### Preparation evidence — 2026-09-30

The sanitized receipt is [preparation-2026-09-30.json](preparation-2026-09-30.json). The temporary certificate's subject exactly matches the official publisher. Its private key is non-exportable. Trust is limited to this test machine's LocalMachine TrustedPeople store; the certificate expires **2026-10-03 12:13:02 Asia/Hong_Kong**, and explicit cleanup is still required after acceptance or abandonment.

| Check | Result | Evidence |
| --- | --- | --- |
| Frozen unsigned candidate and source workflow/run/commit | PASS | Local hash/bytes/XML verification and source run metadata |
| Windows PowerShell 5.1 syntax for all three preparation scripts | PASS | Zero parser errors after UTF-8 BOM correction |
| Preparation contains no package install/uninstall or PFX export commands | PASS | PowerShell AST inspection |
| Separate signed-copy hash | PASS | `6487e87e0d9d563f4eee31a1733ce441e1434836510308d36384ba155e807b59` |
| Public-only temporary machine trust and valid AppX signature | PASS | Elevated trust helper; SignTool `/pa` and matching Authenticode signer thumbprint |
| Product payload preserved through signing | PASS | All 19,696 original entries compared by SHA-256; only `[Content_Types].xml` changes. Signature and CodeIntegrity catalog are added; all application payload bytes are identical. |
| GUI installation | PASS | Owner explicitly confirmed GUI installation completed and no command-line installation was used; A4/A5 only. A1–A3 confirmation pending. |
| Temporary trust, certificate and key cleanup | UNVERIFIED | Run cleanup after the owner's Settings uninstall or abandonment |

Preparation failure history is retained: the first Windows PowerShell 5.1 invocation rejected the old UTF-8 source without a BOM, before creating a certificate. After that was corrected, cached legacy SignTool failed with “A required function is not present”; failure cleanup removed the temporary certificate/key and failed signed copy. Microsoft SDK BuildTools `10.0.26100.9169` then signed the unchanged frozen candidate successfully. These were preparation failures, not product or consumer GUI findings.

## Machine record

Fill these from `store-evidence/consumer-2026-09-23/machine.json` and `prepare.json` after preparation. Until that file exists, each cell stays `UNVERIFIED`. `physicalOrVm` and `userTypeConfirmation` stay `UNVERIFIED` until the owner writes them; hypervisor and administrator flags are machine facts, not that confirmation.

| Record | Result | Value |
| --- | --- | --- |
| Windows edition | PASS | Microsoft Windows 11 Home; automated OS caption and edition `Core` |
| Windows version / build | PASS | 25H2 / 26200.9550 / Client; automated registry and CIM |
| x64 | PASS | AMD64; automated machine check |
| Physical PC or VM | PASS | Owner explicitly confirmed physical PC in this chat on 2026-09-30 |
| User type | PASS | Owner explicitly confirmed standard user account in this chat on 2026-09-30 |
| Unsigned candidate SHA-256 on this machine | PASS | `38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404` |
| Signed test-copy SHA-256 | PASS | `6487e87e0d9d563f4eee31a1733ce441e1434836510308d36384ba155e807b59`; developer-test copy only, 1,115,166,890 bytes |
| PDF default before install | PASS | Owner double-clicked synthetic `a.pdf` and reported Adobe, showing `SWIFTLOCAL STORE PDF / Invoice 12345`, on 2026-09-30. Automated pre-install registry snapshot records `FoxitReader.Document`; retain this discrepancy and compare owner-observed Adobe after installation and uninstall. |
| NSIS SwiftLocal installed | PASS | Existing `快轉通 SwiftLocal` 0.4.0 uninstall record; record only, coexistence is Phase 2D |

The machine-record PASS entries above are automated facts, not human GUI verdicts. The process was not elevated during signing; that does not establish whether the normal account is standard or administrator. A hypervisor flag does not establish physical PC versus VM.

The automated [post-install snapshot](after-install-2026-09-30.json) records the official installed package `JTKC.SwiftLocal_1.0.0.0_x64__j44a9ewx73faj` and Start registration `JTKC.SwiftLocal_j44a9ewx73faj!SwiftLocal`. PDF UserChoice `FoxitReader.Document` and its hash were unchanged from the automated pre-install snapshot. This supports the registry record but does not replace the owner's launch, Explorer-menu or normal double-click observations.

Synthetic inputs are ready in `smoke-temp/store-input/`, produced by the existing `scripts/create-store-fixtures.js`. `fixtures.json` records their sizes and hashes. The generated silent WAV was populated with a one-second 440 Hz tone so playback is audible. Use `a.pdf` for Explorer/default-reader/PDF checks, `ocr-text.png` for `chi_tra+eng`, `ocr-scan.pdf` for searchable PDF, `office-smoke.docx` for DOCX → PDF, and `tone.wav` for media conversion. Inspect OCR for `SWIFTLOCAL OCR SMOKE`, `香港特別行政區`, and `HONG KONG`; inspect documents for `Invoice 12345`. Choose a normal user output directory outside the installed package and preserve these outputs through the uninstall check.

## Human checklist

### A. Package installation

| Row | Required observation | Result | Owner confirmation | Evidence |
| --- | --- | --- | --- | --- |
| A1 | Double-click the developer-signed AppX | UNVERIFIED | | |
| A2 | Windows App Installer GUI appears | PARTIAL | Owner supplied the pre-install screenshot on 2026-09-30; explicit row confirmation pending | [app-installer-before-install-2026-09-30.png](app-installer-before-install-2026-09-30.png) |
| A3 | SwiftLocal identity and display look sensible | PARTIAL | Screenshot shows SwiftLocal, version 1.0.0.0 and the official Publisher CN GUID; owner acceptance of display pending | [app-installer-before-install-2026-09-30.png](app-installer-before-install-2026-09-30.png) |
| A4 | Install completes in that GUI | PASS | 2026-09-30, owner: “安裝也是成功的” and “GUI 安裝完成” | Prior [2% progress screenshot](app-installer-progress-2026-09-30.png) retained; completion explicitly confirmed in this chat |
| A5 | No command-line or `Add-AppxPackage` install was used for this row | PASS | 2026-09-30, owner: “而且沒有使用命令列安裝” | Owner confirmation in this chat |

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
| D1 | The default reader was recorded before installation | PASS | 2026-09-30, owner: “是用Adobe打開的”; synthetic PDF content explicitly observed | Owner confirmation in this chat; Adobe is the human baseline. Registry snapshot separately records FoxitReader.Document. |
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
| H4 | The Store package's Open with registration disappears as expected; record any pre-existing NSIS entry separately | UNVERIFIED | | |
| H5 | The original PDF default is unchanged | UNVERIFIED | | |
| H6 | Normal user output files remain | UNVERIFIED | | |

## Screenshots to collect

App Installer, Start or first launch, Explorer Open with, the PDF workspace, and Installed apps before uninstall. Store them beside this checklist only when they show the synthetic fixture and the SwiftLocal UI. Do not commit private filenames.

## Defect and confirmation rules

If any required product behavior fails, record `FAIL`, retain the observation/output/screenshot, stop the acceptance verdict, and propose the smallest fix. Do not fix product code and continue under this candidate's hash. A product-code change requires a new candidate and fresh acceptance cycle. A preparation-tool failure leaves GUI rows `UNVERIFIED`; resolve and record the preparation issue without changing the AppX.

All required rows in A, B, C, D, E, G, and H must have explicit owner confirmation for **PHASE 2C PASS**. F1 is retained automated Phase 2B evidence; F2 is optional. A required product failure means **PHASE 2C FAIL**. Otherwise any unverified required row means **PHASE 2C INCOMPLETE**. Record observations by row ID, the date, which synthetic fixture/output was inspected, and any evidence link. On 2026-09-30 the owner confirmed the pre-install PDF baseline (D1), physical PC, standard user account, GUI install completion (A4), and absence of command-line installation (A5). Other required GUI results are pending.

## Retained policy item

Optional WACK **Blocked executables** still fails with 593 messages in the Phase 2B report. That finding is unchanged and is not, by itself, a Phase 2C consumer-UI blocker. It stays open for later policy review.

## Verdict

**C. PHASE 2C INCOMPLETE.** A4, A5 and D1 are owner-confirmed PASS. Other required consumer GUI rows remain PARTIAL or UNVERIFIED.

Historical 2026-09-23 review: Jev (`jev-1.13.0`) chose C (confidence 1.0; probabilities A 0.0, B 0.0, C 1.0). The probability that a GUI row may pass from the hash or Server CI alone was 0.03. The probability that Store submission is allowed was 0.03. The probability that the described file is the frozen candidate was 0.61; the local SHA-256 comparison of the downloaded artifact matched the frozen digest exactly, and that comparison is the artifact check. Jev does not replace it and does not confirm any GUI row. No new Jev review was run for this continuation.

Phase 2D, Store update / data retention / uninstall semantics and coexistence with the NSIS release, waits until this verdict is A. Do not submit to the Microsoft Store.
