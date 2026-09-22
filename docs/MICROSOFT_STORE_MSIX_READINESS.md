# Microsoft Store / AppX readiness

Phase 1 used a TEST package identity. Phase 2A replaces that identity with the reserved Partner Center identity and builds one unsigned production-identity candidate. Phase 2B isolates the packaged LibreOffice deep-AppData `0xC0000409` crash and fixes the profile-URI cause on that same identity. None of these phases is submitted. Draft PR #13 is not merged. The v0.4.1 GitHub Release is unchanged.

## Phase 2A — official Partner Center identity

Date: 2026-09-22. Status: production-identity AppX built, installed, converted and uninstalled on Windows Server 2025; WACK overall PASS with the same class of optional Blocked executables finding. Not submitted. Not ready for Windows 11 consumer acceptance. Not a v0.4.2 release.

Jev (`jev-1.13.0`) was asked to choose among keeping the TEST identity, adding a second development identity, or making the reserved identity the only Store package identity. It selected the reserved identity only (confidence 1.0), a non-TEST profile folder distinct from NSIS (confidence 0.99), and package version `1.0.0.0` (confidence 0.82). Those judgments selected the implementation shape. They do not replace manifest, PFN, install or WACK evidence.

### Official identity

Copied exactly. No value below was inferred from the desktop `appId`.

| Field | Value | Where it is used |
| --- | --- | --- |
| Package/Identity/Name | `JTKC.SwiftLocal` | manifest `Identity/@Name` |
| Package/Identity/Publisher | `CN=48CB75C0-3F50-44EF-87EB-8203F196B957` | manifest `Identity/@Publisher` |
| Package/Properties/PublisherDisplayName | `JTKC` | manifest `PublisherDisplayName` |
| Reserved Store product name | `SwiftLocal` | manifest `DisplayName` |
| Package family name | `JTKC.SwiftLocal_j44a9ewx73faj` | verification only; not a manifest Identity field |
| Store ID | `9P6Z4M7VLWPD` | verification only; not a manifest Identity field |

`Application Id` remains `SwiftLocal`, the same manifest choice as Phase 1 and the reserved product name. It is not a Partner Center identity field. The expected AUMID is `JTKC.SwiftLocal_j44a9ewx73faj!SwiftLocal`.

The package family name is checked two ways: the Windows publisher-id algorithm (UTF-16LE SHA-256, first 8 bytes, one zero bit, Crockford Base32) must equal the reserved suffix `j44a9ewx73faj`, and the installed `PackageFamilyName` must equal `JTKC.SwiftLocal_j44a9ewx73faj`. The algorithm also reproduces Microsoft’s `8wekyb3d8bbwe` and the Phase 1 TEST suffix `t6bf8bs4kmxeg`, so the calculator is not a special case for this publisher.

### Package-version mapping

Windows Store AppX/MSIX package versions have four numeric components. The first component cannot be 0. For Windows 10/11 Store packages the fourth component must be 0. Each component is at most 65535.

SwiftLocal’s product version remains **0.4.1**. That is `package.json`, the NSIS/Portable artifact name, and the manifest descriptions. electron-builder’s normal Windows form of 0.4.1 is `0.4.1.0`. That value is illegal for this Store package because its first component is 0, so the manifest does not use `${version}`.

| Product version | Store package version | Meaning |
| --- | --- | --- |
| 0.4.1 | 1.0.0.0 | First production-identity candidate. Package version 1.0.0.0 is not product version 1.0. Not published. |

Phase 1 also used package version 1.0.0.0, but only for the different identity `SwiftLocal.StoreSpike.TEST`. That does not consume a version slot for `JTKC.SwiftLocal`. The repository has no Partner Center submission and no earlier package for this identity, so this candidate keeps 1.0.0.0. A later product update must record the next unused package version before building. The same identity cannot reuse a package version. Do not publish this candidate.

The unsigned artifact name is `SwiftLocal-0.4.1-store-x64.appx`. The `0.4.1` in that filename is the product version. The package Identity Version inside the file remains `1.0.0.0`.

### What this phase changes

The production NSIS/Portable config, commands, native locks, dependency lockfile and v0.4.1 release assets stay unchanged. Store output moves from `dist-store-test/` to `dist-store/`. Visible TEST naming is removed from the production candidate: display name `SwiftLocal`, publisher display name `JTKC`, PDF association `SwiftLocal PDF`, and descriptions `SwiftLocal 0.4.1`. The writable profile is `%APPDATA%/SwiftLocal Store`, still separate from the NSIS profile created under the product name `快轉通 SwiftLocal`. Automated tests assert the reserved identity directly. There is no second buildable TEST identity; `pack:win:store` rejects identity overrides. Local/CI installation still creates a three-day, non-exportable certificate in the machine store, trusts it only for that run, and deletes it. The certificate subject must remain exactly the reserved publisher. No certificate, key, PFX or password is committed.

The deep AppData LibreOffice `0xC0000409` case is not reclassified. Passing the Downloads conversion does not prove that case fixed. It remains a submission blocker.

### Reproduce the production-identity candidate

On Windows x64, from this branch:

```powershell
npm ci
npm run pack:win:store
node scripts/create-store-fixtures.js
./scripts/accept-store-package.ps1 -RunWack
```

`npm run pack:win:full:installer` remains the separate NSIS regression. The Store workflow runs both.

### Phase 2A evidence

Run [35708405363](https://github.com/JTKC00/SwiftLocal/actions/runs/35708405363), commit `7e38c7c`, Windows Server 2025 Datacenter. Overall workflow success. Durable copies are in [docs/acceptance/2026-09-22-store](acceptance/2026-09-22-store/).

- Artifact: [`SwiftLocal-0.4.1-store-x64.appx`](https://github.com/JTKC00/SwiftLocal/actions/runs/35708405363/artifacts/10686752345), unsigned, **1,115,697,028 bytes**.
- SHA-256: `da8a8f08dc2d46522eaf1aeab99f9c5f02072737f991f75b1b73c7d77958b693`.
- Extracted manifest: `Name="JTKC.SwiftLocal"`, `Publisher="CN=48CB75C0-3F50-44EF-87EB-8203F196B957"`, `<PublisherDisplayName>JTKC</PublisherDisplayName>`, `Version="1.0.0.0"`, display name `SwiftLocal`. Package family name and Store ID are not in the manifest. 19,695 package entries matched the verified Full `win-unpacked` tree.
- Developer-signed temporary copy installed as `JTKC.SwiftLocal_1.0.0.0_x64__j44a9ewx73faj`. Installed package family name: `JTKC.SwiftLocal_j44a9ewx73faj`. Store ID recorded for verification: `9P6Z4M7VLWPD`. `process.windowsStore=true`. Profile: `%APPDATA%/SwiftLocal Store`. Install, normal exit and uninstall passed. The temporary certificate was not exported and is not in the repository.
- PDF association ProgID `AppXnwtdh7rg4t5tbp7ewsmh9rcaxb3cgzrv` opened `a.pdf` through the registered shell verb. `MSEdgePDF` and UserChoice hash `GFzkaLZRrpI=` were identical before install, after install and after uninstall.
- Six packaged native probes passed: FFmpeg 9.0.1, QPDF 12.4.1, Tesseract 5.5.3, LibreOffice 26.2.6.3, yt-dlp 2026.08.19, Deno 2.9.6.
- Conversions passed: PDF compress, `chi_tra+eng` image OCR, searchable PDF, DOCX → PDF, PDF → DOCX, WAV → MP3. Retained OCR text is `SWIFTLOCAL OCR SMOKE`, `香港特別行政區` and `HONG KONG`. Searchable PDF text contains the same Chinese phrase with PDF item spacing. DOCX XML contains `SWIFTLOCAL STORE PDF` and `Invoice 12345`. Installed package files were unchanged after smoke.
- WACK **10.0.26100.8249**: `OVERALL_RESULT=PASS`, `PARTIAL_RUN=FALSE`, `APP_NAME=JTKC.SwiftLocal`, `APP_VERSION=1.0.0.0`. All 13 required tests passed. Optional **Blocked executables** failed with 593 messages, the same category retained from Phase 1. This is not Store approval.
- NSIS regression in the same run: `npm run pack:win:full:installer` passed, and the three regression jobs (Windows, macOS, Linux) passed `typecheck`, `check:ci`, `npm test` and `git diff --check`. That NSIS artifact is a new QA build, not a claim that the published v0.4.1 GitHub Release bytes changed.

Jev (`jev-1.13.0`) judged this evidence `not_ready` for Windows 11 consumer acceptance (confidence 1.0) and gave probability 0.04 that the deep AppData LibreOffice case is proven fixed. Those judgments agree with the gates below; they do not replace them.

The deep AppData LibreOffice `0xC0000409` case was not rerun. The passing DOCX → PDF conversion used the normal Downloads path. It remains an explicit submission blocker. Consumer Windows 11 standard-user GUI, Open With menu visibility, physical double-click, Store update/uninstall data retention and native licensing review also remain open. Do not submit this candidate.

Those sentences describe Phase 2A. The Phase 2B section records the later reproduction and fix.

## Phase 2B — LibreOffice deep-AppData crash

Date: 2026-09-22. Status: **verdict A, BLOCKER FIXED**. The formerly rejected user path shape now passes on the official-identity package, and the single-factor matrix supports the profile file-URI cause. Windows 11 consumer acceptance has not been run. Not submitted. Not merged. Not a v0.4.2 release. The published v0.4.1 release is unchanged.

Jev (`jev-1.13.0`) chose verdict A (confidence 0.46; probabilities A 0.64, B 0.34, C 0.02). It gave probability 0.81 that the profile file-URI length is the supported cause, 0.03 that the optional Blocked executables finding changed, and 0.02 that Windows 11 consumer acceptance was already done. The B probability comes from the missing URI-length ladder between the 187-character pass and the 211-character failure, and from the post-fix run avoiding that URI. The recorded matrix and the passing rejected path shape still meet verdict A. Jev does not replace those Windows results.

### Reproduction matrix

The matrix ran inside the official-identity package from Phase 2A, before this fix. Run [35756020077](https://github.com/JTKC00/SwiftLocal/actions/runs/35756020077). Launch context `packaged-electron-main`. Binary: `C:\Program Files\WindowsApps\JTKC.SwiftLocal_1.0.0.0_x64__j44a9ewx73faj\app\resources\tools\libreoffice\program\soffice.com`. LibreOffice `26.2.6.3 8221e31b3ac356a1623c672912a3d2b492f7e3d1`. Fixture: repository `office-smoke.docx` from `writeTextDocx("SWIFTLOCAL STORE DOCX\nInvoice 12345")`, 3,409 bytes, SHA-256 `0a1f0a615a4d86d887752a0eeae6e82ee9f449f4cd570637fa0838675e9d91c0`. The 2026-09-21 rejection recorded the same filename at 3,420 bytes; this zip is the current generator output, and the same file was used for every matrix row. Target: PDF. `PASS` means exit 0 and an output that starts with `%PDF-`.

The packaged process had already set `TEMP`/`TMP` to `%APPDATA%\SwiftLocal Store\temp`. The TEMP row compares that directory with `%APPDATA%\SwiftLocal Store TEST\temp`. It does not compare an untouched machine temp directory. The baseline working directory is the short Downloads matrix directory.

Causal rule, stored with the evidence: only a `causal: true` row may support a cause, and only by comparison with `baseline-short-downloads-short-profile`. `contrastWith` pairs isolate the single difference between those two rows. Combined rows are reproductions.

Character lengths are UTF-16 code units of the absolute path. The profile URI length is the `file:///` string passed to `-env:UserInstallation`. Every absolute input, outdir, profile, cwd, TEMP, exact command, exit code and output byte count is in [lo-matrix.json](acceptance/2026-09-22-store-phase2b/lo-matrix.json).

| Case | Role | Result | Exit | Input | Outdir | Profile | Profile URI |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| baseline-short-downloads-short-profile | causal baseline | PASS | 0 | 142 | 125 | 129 | 137 |
| input-deep-ascii-downloads | input depth only | PASS | 0 | 158 | 113 | 117 | 125 |
| outdir-deep-ascii-downloads | outdir depth only | PASS | 0 | 131 | 159 | 118 | 126 |
| profile-deep-ascii-downloads | profile depth only | FAIL | 0xC0000409 | 132 | 115 | 203 | 211 |
| cwd-roaming-profile | cwd only | PASS | 0 | 123 | 106 | 110 | 118 |
| temp-roaming-profile | TEMP only | PASS | 0 | 124 | 107 | 111 | 119 |
| input-short-appdata | input under short AppData | PASS | 0 | 97 | 106 | 110 | 118 |
| outdir-short-appdata | outdir under short AppData | PASS | 0 | 124 | 80 | 111 | 119 |
| profile-short-appdata | profile under short AppData | PASS | 0 | 125 | 108 | 84 | 92 |
| input-unicode-short | short Unicode input | PASS | 0 | 103 | 106 | 110 | 118 |
| outdir-unicode-short | short Unicode outdir | PASS | 0 | 124 | 85 | 111 | 119 |
| profile-unicode-short | short Unicode profile | PASS | 0 | 125 | 108 | 85 | 109 |
| input-spaces-short | short spaced input | PASS | 0 | 112 | 105 | 109 | 117 |
| short-appdata-short-profile | combined, short AppData | PASS | 0 | 107 | 90 | 94 | 102 |
| deep-downloads-short-profile | deep Unicode input and outdir, short profile | PASS | 0 | 153 | 155 | 119 | 127 |
| deep-appdata-short-profile | same shape under long Local Temp | PASS | 0 | 116 | 118 | 117 | 125 |
| exact-rejected-shape | 8.3 temp root, Unicode scratch under the output, TEST cwd and TEMP | FAIL | 0xC0000409 | 113 | 141 | 159 | 225 |
| exact-rejected-long-temp-root | same shape, long temp root | FAIL | 0xC0000409 | 116 | 144 | 162 | 226 |
| ascii-equivalent-of-exact | same 8.3 shape and nesting, ASCII names | PASS | 0 | 122 | 151 | 169 | 187 |

Passing outputs in this matrix are 24,657-byte PDFs. The three failures produced 0 bytes. Elapsed time for `profile-deep-ascii-downloads` was about 4.3 seconds.

The only causal failure is `profile-deep-ascii-downloads`. Its input (132) and outdir (115) stayed short. Its profile path is 203 characters and its file URI is 211:

`file:///C:/Users/runneradmin/Downloads/sl-lo-matrix-d8bca8897483422046f25993731c8de8/SwiftLocalStoreASCIId8bca8897483422046f25993731c8de8/outputfiles/store/officetopdf/.swiftlocal-office-0cfe82/lo-profile-0cfe82`

`exact-rejected-shape` and `exact-rejected-long-temp-root` both crash, so the 8.3 prefix is not the difference. Their URIs are 225 and 226. `ascii-equivalent-of-exact` uses the same 8.3 root, cwd, TEMP and `.swiftlocal-office-*` / `lo-profile-*` nesting. Its profile path is 169 characters, longer than the failing Unicode profile path of 159, but its URI is 187 because the ASCII names are not percent-encoded. It passes.

### Root cause

LibreOffice 26.2.6.3 crashes with `0xC0000409` (`3221226505`, `STATUS_STACK_BUFFER_OVERRUN`) when the `-env:UserInstallation` file URI is long. The observed bounds are a 187-character URI of this shape passing and a 211-character URI failing. There is no finer ladder between those two lengths.

The shared converter created `.swiftlocal-office-*` and `lo-profile-*` under the user-selected output directory. That coupling is what pushed the rejected deep Unicode output path to URI 225. A short profile with the same deep Unicode input and output passes, so the output directory is the publication target, and the profile URI is the crash trigger.

### Rejected hypotheses

These do not explain the crash on this matrix:

- Input-path depth. The deep ASCII input row passed, and deep Unicode input with a short profile passed.
- Output-directory depth by itself. The deep ASCII outdir row passed while its profile stayed short.
- AppData versus Downloads by itself. Short AppData input, outdir and profile rows passed. Deep Unicode input and output passed under both Downloads and long `Local\Temp` when the profile stayed short.
- Current working directory. Moving cwd to `%APPDATA%\SwiftLocal Store TEST` passed.
- `TEMP`/`TMP`, within the two short roaming directories compared inside the packaged process.
- Unicode or spaces at short depth.
- The 8.3 `RUNNER~1` temp root versus the long temp root. Both rejected-shape rows crashed.
- An earlier direct spawn of `soffice.com` returning `EPERM`. That was the WindowsApps ACL on an unpackaged process. It did not execute LibreOffice and does not falsify the crash. The matrix ran after the packaged Electron process could launch the same binary.

An owned temporary copy of the input was not added. Deep input paths passed whenever the profile URI stayed short.

### Fix

`runLibreOfficeToUniqueOutput` now creates `.swiftlocal-office-*` and `lo-profile-*` under the first usable private parent: `os.tmpdir()`, then on Windows `%LOCALAPPDATA%\Temp`, then `~/.swiftlocal-private`. A parent inside `Program Files\WindowsApps` is skipped. The profile file URI must be at most 180 characters; a longer scratch is deleted and the next parent is tried. `--outdir` is that scratch. The user-selected directory receives the final file through `nextAvailablePath`. `renameSync` publishes it, and `EXDEV` falls back to a copy that removes a partial destination if the copy fails. The `finally` block deletes only that scratch. Aged `.swiftlocal-office-` directories under `os.tmpdir()` and `~/.swiftlocal-private` use the existing 24-hour owned-prefix sweeper. Cancellation still reaches `runProcess`, and the scratch cleanup still runs. Media scratch is unchanged. Path checks and exclusive publication are unchanged.

The cap is below the shortest observed failure (211) and below the longest observed pass of this shape (187). The unit test `keeps LibreOffice scratch and profile outside the user output directory` checks the cap, the owned prefixes, and that the scratch is outside the user output directory and outside WindowsApps.

This is shared with NSIS because both entrypoints call the same function. The Store workflow's unchanged NSIS Full build passed on this commit, so the change is not a Store-only mask.

### Exact previously failing case

The 2026-09-21 rejection remains [rejected-appdata-paths.json](acceptance/2026-09-21-store/rejected-appdata-paths.json): TEST identity, input under `C:\Users\RUNNER~1\AppData\Local\Temp\SwiftLocal Store 中文 <id>\輸入 文件\office-smoke.docx`, output under `輸出 文件\store\office-to-pdf`, exit `3221226505`.

After the fix, run [35758117387](https://github.com/JTKC00/SwiftLocal/actions/runs/35758117387) executed `installed-conversion-office-to-pdf-deep-appdata` inside `JTKC.SwiftLocal_1.0.0.0_x64__j44a9ewx73faj`:

- Temp root: `C:\Users\RUNNER~1\AppData\Local\Temp`
- Input: `C:\Users\RUNNER~1\AppData\Local\Temp\SwiftLocal Store 中文 482a9ea41b3ecf3b06f70581523db102\輸入 文件\office-smoke.docx` (113 characters)
- Output directory: `...\輸出 文件\store\office-to-pdf` (115 characters)
- Published PDF: that directory plus `office-smoke.pdf`
- Result: PASS. Retained file is `%PDF-1.7`, 24,657 bytes, SHA-256 `a599b97d1c50f0a662dbdb3d1a63304cc88bfdacebc49df3a216ee953b121512`
- The output directory contained no leftover `.swiftlocal-office-` directory

The token differs from `ca07ae647d514a7b8d2e6c6c55c64aca`. The path shape matches: 8.3 temp root, `SwiftLocal Store 中文`, `輸入 文件`, `輸出 文件\store\office-to-pdf`, `office-smoke.docx`, PDF target, official packaged LibreOffice 26.2.6.3. The regression does not resend the 225-character UserInstallation URI. The fix keeps that URI at or below 180 characters. The normal Downloads DOCX → PDF conversion also passed and is recorded separately; it is not this result.

### New Store artifact

Commit `5b0e2c2`. Windows Server 2025 Datacenter.

- Filename: `SwiftLocal-0.4.1-store-x64.appx`
- Unsigned bytes: **1,115,695,293**
- SHA-256: `38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404`
- Product 0.4.1, package version `1.0.0.0`, electron-builder 26.15.3, 19,695 entries, payload byte-identical to the verified Full `win-unpacked` tree
- Identity unchanged: `JTKC.SwiftLocal`, publisher `CN=48CB75C0-3F50-44EF-87EB-8203F196B957`, publisher display name `JTKC`, package family name `JTKC.SwiftLocal_j44a9ewx73faj`, Store ID `9P6Z4M7VLWPD`
- Installed full name: `JTKC.SwiftLocal_1.0.0.0_x64__j44a9ewx73faj`
- Developer-signed temporary copy SHA-256, runner-local only: `2CAF143D25E562F6EB53398462B56A861EC6B9585A342ED005B5A8D10834539D`

Install, activation, normal exit and uninstall passed. The temporary certificate was not exported.

Installed checks that passed beside the deep AppData case: PDF compress, `chi_tra+eng` image OCR, searchable PDF, Downloads DOCX → PDF, PDF → DOCX, WAV → MP3, and the six probes FFmpeg 9.0.1, QPDF 12.4.1, Tesseract 5.5.3.20260724, LibreOffice 26.2.6.3, yt-dlp 2026.08.19, Deno 2.9.6. OCR text retained `SWIFTLOCAL OCR SMOKE`, `香港特別行政區` and `HONG KONG`. PDF ProgID `AppXnwtdh7rg4t5tbp7ewsmh9rcaxb3cgzrv`. `MSEdgePDF` hash `NgR2+xUd8r8=` was identical before install, after install and after uninstall. Installed payload unchanged: PASS.

### WACK

Kit `10.0.26100.8249`. `OVERALL_RESULT=PASS`, `PARTIAL_RUN=FALSE`, exit code 0. Report SHA-256 `0127e6251cdab18e36379f9352e808ad3aa445263217f4b049c3c0c40bc3b912`.

Required, all PASS: App manifest, Enterprise Features, Resource Packages, Banned file analyzer, Private code signing, Branding, Special use capabilities, ExclusiveTo attribute, Type location, Type name case-sensitivity, Type name correctness, Properties, DPIAwarenessValidation.

Optional PASS: Install signed driver and executable files, User account control run level, Application count, File association verbs, Registry checks, App resources, Debug configuration, General metadata correctness, Archive files usage, Platform appropriate files.

Optional FAIL: **Blocked executables**, 593 messages. The count matches Phase 2A. This report does not show that finding fixed.

### NSIS regression

In the same run, `Build and verify unchanged NSIS Full entrypoint` succeeded. The `regression` jobs on `ubuntu-latest`, `windows-2025` and `macos-latest` succeeded (`typecheck`, `check:ci`, `npm test`, `git diff --check`). The `retest` job was skipped because this was a push build, not an acceptance-only rerun. The NSIS artifact is a new QA build. It is not a claim that the published v0.4.1 GitHub Release bytes changed.

### Verdict

**A. BLOCKER FIXED** — the exact rejected user path shape now passes, and the profile-URI cause is supported by the single-factor matrix.

Windows 11 consumer standard-user GUI, Open With, physical double-click, Store update/uninstall data retention and native licensing review remain open. Verdict A allows that acceptance to start. Do not submit this candidate. Do not merge PR #13.

Durable copies: [docs/acceptance/2026-09-22-store-phase2b](acceptance/2026-09-22-store-phase2b/).

## Phase 1 — TEST identity evidence

Date: 2026-09-21. Status: TEST AppX build/install/native conversions and text-content retest PASS; WACK overall PASS with an optional finding. Not submitted. Manual acceptance gaps remain. This section is historical. Its TEST identity is not the Phase 2A candidate.
Baseline: `c98b27fd01eac54710e291db205039e7ed41190d` (`origin/main`), product v0.4.1,
Electron 44.2.0, electron-builder 26.15.3, Windows x64. Branch: `store/msix-readiness`.
The original local checkout was v0.4.0; an isolated worktree was created from the
current remote main. The v0.4.1 GitHub Release remains outside this work.

## Decision (made after source audit, before implementation)

Choose **Route A: electron-builder 26.15.3 AppX**. Microsoft accepts `.appx` and
`.msix` package families. Format alone does not establish certification. Keep
the exact production builder and native locks; use a separate Store entrypoint,
config, manifest, output directory and isolated CI workflow. No v27 upgrade.

| Route | Capability and practical fit | Risk / disposition |
| --- | --- | --- |
| A — v26 AppX | Directly maps the unpacked Full application into `app/`, including EXEs/DLLs in `app/resources/tools`; custom manifest, PDF extensions and brand assets supported. Full-trust desktop app. | Recommended. Smallest toolchain change; still requires real registration, activation, native smoke and WACK. |
| B — v27 MSIX | Dedicated `msix` target is **Beta**, alongside AppX. Modern manifest options do not solve application path or native licensing issues. | Deferred. Native ESM / Node >=22.12, moved signing and ASAR config, changed toolset defaults, dependency platform filtering and NSIS ProgID behavior create a separate migration project. |
| C — MSIX Packaging Tool | Captures existing installer changes in a prepared Windows environment; supports CLI conversion templates and VMs. Could capture Full native files and registrations. | Not selected: installer capture adds machine state, registry translation and clean-VM maintenance where the source payload is already available. Captured NSIS registration is not proof of correct manifest association. No capture experiment needed. |

v27 does not inherently forbid CommonJS configs on supported Node: `require(esm)`
is supported. However our scripts resolve internal `electron-builder/out/cli/cli.js`
and import builder internals, so exports/layout changes need testing. Automatic
schema migration must not run against production. Any future Route B experiment
must pin an exact published v27 version in a separate lockfile/worktree, migrate
only its config and prove unchanged NSIS behavior with the existing Full acceptance.
No v27 candidate was installed or chosen in this phase.

## Repository audit

| Area | Evidence and implication |
| --- | --- |
| package.json / builder | v0.4.1, exact Electron/builder pins. Production portable/nsis targets, ASCII `SwiftLocal.exe`, Chinese product description; `dist` / `dist-full` outputs. Existing commands and lockfile must remain unchanged. |
| pack-win / build-win-full | Provision locked archives, media tools and tessdata, verify before build, use `--publish never`, verify produced NSIS payload. Store needs its own command because the existing artifact verifier expects EXE containers. |
| artifact verification | `verify-release-artifacts.js` checks PE headers/resources, app.asar version/runtime exclusions, complete native digests and tessdata. Reuse unpacked verification and add AppX extraction/content comparison. |
| main / preload | `desktop/main.js` directly instantiates JS BackendService; no Python server or system Python is spawned. Preload uses existing IPC. Frontend, PDF.js workers/cmaps/wasm/fonts and ICO paths derive from `__dirname`. |
| AUMID | main unconditionally sets `com.swiftlocal.converter` on Windows. Microsoft requires package-assigned AUMID for packaged apps; skip this call when `process.windowsStore` is true. NSIS behavior stays identical. |
| settings / jobs | main supplies `app.getPath('userData')/tools.json`; job state lives alongside it. Constructor CWD fallbacks are not used by desktop main. Store bootstrap gives the spike a separate profile, preserving existing NSIS settings. |
| localStorage / cache | Chromium session data defaults to userData. Store bootstrap sets both userData/sessionData and crash/log locations before app ready. Package registration redirects supported AppData operations; actual paths must be recorded. |
| CWD | Backend `runProcess`, version probes and PDF compress inherit CWD; executable/resource and normal input/output paths are absolute. Store launch does not guarantee shortcut CWD. Store bootstrap moves CWD to its writable profile; OCR overrides CWD to its private scratch. |
| FFmpeg / QPDF | `desktop/backend.js` resolves `process.resourcesPath/tools` before development paths and PATH; config/environment overrides exist. Clean-profile acceptance must assert `source=bundled` and exact installed resource prefix. EXEs stay outside ASAR. |
| Tesseract | tessdata resolved beside native executable; `chi_tra`, `eng`, `osd` locked. Windows OCR copies only needed traineddata plus support files into private `os.tmpdir()` scratch, uses relative input/output names and deletes only owned copies. No junction back to installed data. |
| LibreOffice | `runLibreOfficeToUniqueOutput` publishes the final file into the chosen output directory. `.swiftlocal-office-*` and `lo-profile-*` are created under a private temporary parent, and the UserInstallation file URI is capped at 180 characters. Phase 2B records why the old output-directory coupling crashed. It does not need installed Office, registry registration or a shared user profile. |
| yt-dlp / Deno | `resolveBundledMediaTool` resolves absolute paths in resources; no system fallback. Media working files go in `.swiftlocal-media-*` under selected output, diagnostics under userData. Store bootstrap explicitly sets DENO_DIR, TEMP/TMP and XDG_CACHE_HOME to writable profile locations. No runtime self-update feature added. |
| output / PDF save | Default output is Downloads/SwiftLocal, or an absolute user selection. PDF save uses a temporary sibling of the user-selected destination. Selecting a protected directory must fail normally; no ACL workaround or writes back to WindowsApps. |
| Python backend | `backend/main.py`, tools_service and job_service use source-relative temp/config. This is unsafe inside immutable packages **if launched**, but is not the desktop runtime. Exclude backend Python and start-backend scripts from Store payload; leave desktop/NSIS code unchanged. |
| PDF association | NSIS include writes only HKCU OpenWithProgids/Applications and own ProgID, preserves UserChoice. Store must declare `windows.fileTypeAssociation` in manifest; no NSIS include runs. Existing argv, single-instance and PDF workspace routing can receive file activation. UI's NSIS ProgID string is descriptive, not a runtime lookup dependency. |
| native provisioning | Native lock validates official source checksums, PE executables, complete trees and LibreOffice source receipts. LibreOffice MSI administrative extraction requires Windows; never copy local installations. Retain native licenses/support payload for the spike. |
| assets / filenames | Existing brand SVG master and pinned canvas renderer support reproducible PNG creation. Package EXE is ASCII. Add four exact-size AppX logos; validate actual package entries, case collisions, forbidden path components and manifest references, not only source names. |
| CI | `ci.yml` runs unit/syntax/metadata checks on three OSs. `native-tool-smoke.yml` already proves NSIS Full conversion and fresh-user/upgrade scenarios. Store workflow is separate, manually dispatchable and triggered only by relevant changes on `store/msix-readiness`; read-only repository permissions, Actions artifact upload only. |

No automatic Store update/download feature, service, driver, elevated app operation
or NSIS registry dependency was found in the Electron desktop path. Native payload
size (~684 MB existing installer; first verified AppX 1,115,692,336 bytes) is below
Microsoft's current 25 GB per-package limit for Windows 10/11 AppX/MSIX. Technical bundling
does not establish redistribution rights: FFmpeg build license/codecs, QPDF,
Tesseract/tessdata, LibreOffice and its bundled components, yt-dlp and Deno licenses,
notices/source-offer duties need owner review before submission. yt-dlp/media download
functionality also needs Store content-policy review. WACK may flag unused native
helpers; do not remove locked files ad hoc or suppress certification checks.

The first installed tree includes LibreOffice's Python packaging launchers
`setuptools/cli-arm64.exe`, `setuptools/gui-arm64.exe`,
`pip/_vendor/distlib/t64-arm.exe` and `pip/_vendor/distlib/w64-arm.exe` under
`program/python-core-3.12.14/lib/`. Their names initially raised a cross-architecture
concern. Microsoft permits x86 alongside x64 but
not ARM binaries in an x64 package. Other bundled helpers include `updater.exe`
and `update_service.exe`; merely including them does not register a service, but
their manifests and runtime reachability need certification review. Therefore the
unaltered Full payload is a **test candidate**, not an assertion that every native
file is submission-ready. The actual WACK 10.0.26100.8249 run reported **PASS**
for its optional Platform appropriate files and User account control checks,
with no messages; no architecture failure was observed. Do not convert the
filename-based concern into a claimed WACK failure. Reconcile the retained
cross-platform helpers with production/S-mode requirements during Phase 2.
Any future Store-only pruning must have an explicit
reviewed omission manifest derived from the verified source tree, exact retained
file comparison and repeat runtime/WACK tests; NSIS locks must remain intact.

## Store-specific differences

Windows owns package installation/upgrade/uninstall and manifest registration;
NSIS customInstall/customUnInstall do not run. WindowsApps is immutable. Package
data follows package identity and OS virtualization; update should retain it,
uninstall normally removes managed package data, while explicit files in Downloads
remain. Actual retention/cleanup must be measured; do not promise migration from
NSIS profiles or remove user outputs. Coexistence and upgrade from TEST to a real
Store identity are not automatic migrations. TEST identity is a separate application.

Phase 1 used only TEST placeholders. Product version remained **0.4.1**; the
spike manifest used package version **1.0.0.0** because Store's package numbering
requires a nonzero first component and a zero final component. That numbering was
not a v1.0 product release. Phase 2A keeps the same package version for a different
identity and documents the mapping above.

PDF registration must add an Open With candidate; it must not set extension default,
UserChoice or call SetAsDefault. Compare existing PDF default before/after install
and uninstall and exercise package activation separately from direct executable launch.

## Owner values needed from Partner Center

Copy exact values from the reserved product's **Product identity** page:

- `Package/Identity/Name` → appx.identityName.
- `Package/Identity/Publisher` → appx.publisher (entire distinguished name, unchanged).
- `Package/Properties/PublisherDisplayName` → appx.publisherDisplayName.
- Reserved application/display name → manifest DisplayName and Store listing.
- Package family name (PFN) and Store ID/Product ID → verify resulting identity/listing.

Application Id (`SwiftLocal` in the spike) is our manifest choice, not an invented
Partner Center value. Confirm it before first submission; AUMID is PFN + `!` + Id.
Confirm available package version with product history. Do not send signing secrets.
Store re-signs submitted packages; test certificate trust is only local development.

## Verification and remaining gates

### Reproduce the Phase 1 TEST spike

Historical only. The current candidate is the Phase 2A procedure above.

Use Windows x64 with Node 24, full 7-Zip, and Windows SDK signing tools. From a
clean checkout of this branch:

```powershell
npm ci
npm run pack:win:store
node scripts/smoke-release.js --require-bundled --skip-tests
node scripts/create-store-fixtures.js
# In an elevated development PowerShell on a disposable test machine:
./scripts/accept-store-package.ps1 -RunWack
```

The build writes `dist-store-test/SwiftLocal-0.4.1-store-TEST-x64.appx` (unsigned).
The acceptance harness signs a temporary copy with a three-day, non-exportable,
developer-only certificate, temporarily trusts it in that machine's TrustedPeople
store, and removes its own trust/certificate after uninstall. It never exports a
PFX/private key or changes the build artifact. It refuses to replace an existing
TEST installation. Use the harness only on a disposable test machine; it exercises
real package registration and retains generated conversion outputs for inspection.
It requires full 7-Zip and Node dependencies for output verification.

`store-evidence/` contains package bytes/hash, extracted manifest, assets receipt,
runtime paths, native versions, screenshots and lifecycle results. Full raw CI logs
provide the NSIS build and existing native smoke evidence. The Store workflow uses
`contents: read` and uploads Actions artifacts only. `runFullTrust` will require a
clear justification during Store submission: local desktop document processing and
bundled native engines, without app elevation.

### Evidence ledger

| Run / commit | Actual result |
| --- | --- |
| [35561701864](https://github.com/JTKC00/SwiftLocal/actions/runs/35561701864), `9aab2aa` | Three-platform regressions passed; locked LibreOffice source download timed out. Retained checksum validation and added bounded curl retries; no source/version substitution. |
| [35561865600](https://github.com/JTKC00/SwiftLocal/actions/runs/35561865600), `ca647a0` | Three-platform regressions, Full native smoke, Electron Unicode OCR, NSIS Full build and its EXE payload verifier passed. AppX built, but generic ZIP extraction exposed OPC-escaped names (`%40`); switched verification to Microsoft MakeAppx unpack, retaining semantic checks. Overall run failed; this is only evidence for its passing steps. |
| [35563159817](https://github.com/JTKC00/SwiftLocal/actions/runs/35563159817), `83036ba` | Cancelled when superseded by a fix that separates opt-in native probes from the real application's job-state file. Not a pass. |
| [35563235411](https://github.com/JTKC00/SwiftLocal/actions/runs/35563235411), `b04e785` | AppX extraction and all 19,695 entries verified; installed, activated as a real Windows package and uninstalled. All six native version probes, PDF compression, chi_tra+eng OCR, PDF→DOCX, media conversion, Shell PDF activation and default-reader preservation passed. Searchable PDF harness used a removed PDF.js cleanup method; LibreOffice DOCX→PDF crashed with `0xC0000409` under a deep AppData temp path. WACK present but not reached. Overall fail. |
| [35564552400](https://github.com/JTKC00/SwiftLocal/actions/runs/35564552400), `17a510e` | PASS: three-platform regressions, Full native smoke, Electron Unicode OCR, AppX build/extraction, install/activation, all six native probes, all six conversion classes, Shell PDF activation/default preservation, unchanged installed files, normal exit and uninstall. WACK overall PASS; one optional finding described below. |
| [35566930271](https://github.com/JTKC00/SwiftLocal/actions/runs/35566930271), `c60b8ec` | PASS: all three regression jobs; SHA-verified reuse of the same AppX; install/launch, six bundled native probes and six conversion classes; known PDF text retained in DOCX XML; PDF shell activation/default preservation, unchanged installed payload and uninstall. WACK was parsed/reused from the same candidate, not rerun. [Retest evidence](https://github.com/JTKC00/SwiftLocal/actions/runs/35566930271/artifacts/10624224784). |

### Built artifact and certification

- Artifact: [`SwiftLocal-0.4.1-store-TEST-x64.appx`](https://github.com/JTKC00/SwiftLocal/actions/runs/35564552400/artifacts/10623689745), unsigned, **1,115,692,339 bytes** (1.116 GB / 1,064 MiB).
- SHA-256: `9d94ccaaf4c6ea851ac0d0d10269014efb26d4343dc547be0a33ee756f1cec5f`.
- Builder 26.15.3; product 0.4.1; TEST package 1.0.0.0; 19,695 package entries. Unpacked installed tree: approximately 2.98 GB.
- [Full evidence artifact](https://github.com/JTKC00/SwiftLocal/actions/runs/35564552400/artifacts/10623993880). Actions artifacts expire after 14 days; key results are preserved in [docs/acceptance/2026-09-21-store](acceptance/2026-09-21-store/).
- Developer-signed temporary copy installed as `SwiftLocal.StoreSpike.TEST_1.0.0.0_x64__t6bf8bs4kmxeg`; actual `process.windowsStore=true`. Package registration/activation, normal process exit and uninstall passed on Windows Server 2025 Datacenter.
- WACK **10.0.26100.8249** XML: `OVERALL_RESULT=PASS`, `PARTIAL_RUN=FALSE`, `APP_TYPE=Centennial`. All **13 required tests passed**; 10 optional tests passed, one optional test failed. This is a real certification-kit result, not a build-success inference. It is not Microsoft Store approval.
- Optional **Blocked executables**: 593 messages (57 process-launch API imports, 536 literal executable references) in Electron and native payloads. Some are binary/data string matches; their presence alone does not establish execution. Packaged child-process use is intentional. Actual desktop cancellation also invokes Windows `taskkill.exe`; S-mode/provider paths need separate review. Do not label every warning a false positive or silently suppress the test. Microsoft documents this category as informational for Desktop Bridge onboarding; investigate reachable external launches before submission.
- WACK architecture, UAC, service/driver registration, private signing keys, manifest, resources and branding checks all passed. Both independent Windows builds produced identical brand-asset receipts; cross-OS PNG byte identity is not promised.

### Runtime observations and remaining acceptance

The app uses a separate Store TEST profile under `%APPDATA%/SwiftLocal Store TEST`;
Chromium sessions, settings/jobs, temp, caches, logs and crash data are routed below
it. AppData can be virtualized by Windows. OCR uses a private copied tessdata scratch
directory. Phase 1 observed LibreOffice profile/scratch, and still observes media scratch, under the chosen output directory. Phase 2B moved the LibreOffice scratch and profile to a private temporary parent. Unicode Downloads output passed. Every installed package file's size and
SHA-256 was unchanged after smoke, including OCR language/support files. This
establishes the observed flows, not syscall tracing of every unused native helper.

PDF manifest registration produced `AppX93s5vjqrxjz3j2mtatx9ks1qvrc12vqp`.
Windows ShellExecuteEx invoked this registered class and opened `a.pdf` in the real
PDF workspace. `MSEdgePDF`, its UserChoice hash and the extension default were
identical before install, after install and after uninstall. Explorer menu selection
and physical double-click behavior on consumer Windows 11 remain manual checks.

The earlier deep AppData-temp DOCX conversion crash (`0xC0000409`) remains a
**reproducible unresolved path case**. Moving test documents to the normal Downloads
location and shortening the path made the same packaged LibreOffice pass; this
changed two factors and does not isolate virtualization versus path length. No
LibreOffice/runtime fix is claimed. Keep the rejected parameters in
`rejected-appdata-paths.json`; compare short/deep AppData and Downloads paths on
Windows 11 before broad acceptance. Do not change production NSIS to mask it.
That is the Phase 1 conclusion. Phase 2B later ran that comparison, fixed the
profile URI, and passed the same user path shape. The other gates below stayed open.

Phase 2 preparation can start with the proven Route A candidate, with the following
gates still open before a submission-ready release: exact Partner Center identity
and package numbering; consumer Windows 11 standard-user GUI/install/Open With and
default double-click; Store update/uninstall data retention and NSIS coexistence;
the deep-path LibreOffice case; optional WACK/S-mode warning disposition and native
licensing/media policy review. Final identity/payload changes require fresh WACK
and package smoke. Phase 1's entire manual acceptance list is not claimed complete.

The NSIS evidence is a newly built QA artifact, not a claim of byte-identical output
to the published release. Production config, builder pin, lockfile, packing scripts
and NSIS registry include are unchanged. Store-only follow-up edits do not alter that
NSIS payload. The published v0.4.1 installer and portable hashes were independently
re-read and remained unchanged.

Local regression baseline: `npm test` passed 310 JavaScript tests and 102 Python
tests (two Python skips); `npm run typecheck`, `npm run check:ci` and
`git diff --check` passed. The Store workflow repeats the required checks on
Windows, macOS and Linux. Its optional `nsis_regression=false` input only skips
rebuilding the unchanged NSIS artifact after a recorded passing run; it does not
skip unit tests, Full native smoke or installed Store acceptance.

At `c60b8ec`, all three regression jobs passed. Windows ran 311 JS tests
(307 passed, four platform skips) and 102 Python tests (99 passed, three skips:
the POSIX process-tree case and two absent development tessdata fixtures).
Real bundled Windows OCR runs separately in the package/native smoke jobs.
`candidate_run=35564552400` selects acceptance-only retesting: it checks the
downloaded unsigned AppX against that run's SHA-256 and parses its complete WACK
report, then installs and exercises the same candidate. It explicitly skips a new
package build and WACK execution; it never turns that skip into a new build/pass.

Acceptance scope: the six-tool probe proves bundled executable resolution and
child-process startup/version output inside the package. Representative conversion
jobs exercise FFmpeg, QPDF, Tesseract and LibreOffice separately. This is not an
online yt-dlp provider/download or Deno extractor integration certification, nor a
Chinese OCR accuracy benchmark. The OCR fixture contains Chinese and English;
language availability, resource hashes, execution with `chi_tra+eng`, and recognized
English text are asserted in CI. Readback of the retained image-OCR and searchable
PDF outputs also confirmed the Chinese phrase `香港特別行政區` (allowing whitespace
between PDF text items); the
Office-generated PDF retained `SWIFTLOCAL STORE DOCX`. See `output-content-checks.json`.
Consumer Windows 11 and standard-user GUI behavior are
not inferred from an elevated disposable Windows Server CI runner.

Required Windows sequence: provision Full locks → build AppX → unpack/compare →
developer-only test signing → register package → activate installed app → home/PDF
and Unicode PDF/OCR/searchable/Office/media smoke → normal exit → WACK if available →
uninstall and compare PDF default. Capture OS, commit, artifact SHA/bytes, tools,
runtime paths and all failed checks. Do not classify package build as WACK PASS.

If WACK is unavailable, record exactly **UNVERIFIED — WACK environment unavailable**.
On a Windows test machine with Windows SDK App Certification Kit installed, run
from an elevated PowerShell after trusting the local TEST certificate:

```powershell
& "${env:ProgramFiles(x86)}\Windows Kits\10\App Certification Kit\appcert.exe" reset
& "${env:ProgramFiles(x86)}\Windows Kits\10\App Certification Kit\appcert.exe" test -appxpackagepath "C:\path\SwiftLocal-0.4.1-store-TEST-x64.appx" -reportoutputpath "C:\evidence\wack.xml"
```

Read XML/HTML results, retain warning/failure categories and remediate before Store
submission. Interactive Windows 11 GUI, Open With menu visibility, default double
click, and real Store update semantics remain separate acceptance gates.

## Rollback

Uninstall only the exact TEST package; remove only the test certificate created by
the harness. Keep user output. Revert Store commits / delete Store build output to
drop the spike. No production builder, native lock, NSIS include, production commands,
version, GitHub release asset, certificate purchase or Store submission changes.
Do not merge this branch automatically.

## Changed files

- `electron-builder.store.config.js`: isolated Full AppX overlay. Phase 1 used a TEST identity; Phase 2A points it at the reserved Partner Center identity.
- `build/store/identity.js`, `build/store/partner-center-identity.json`: exact reserved identity, package-version mapping, and PFN verification. PFN and Store ID are not manifest fields.
- `build/store/AppxManifest.xml`: package version, desktop entrypoint, PDF declaration and assets.
- `build/store/main.js`, `build/store/runtime.js`: Store bootstrap, writable profile and opt-in native probes.
- `scripts/pack-win-store.js`, `scripts/verify-store-package.js`: build/provision and MakeAppx payload verification.
- `scripts/build-store-assets.js`: generate four PNGs and a source/output hash receipt.
- `scripts/accept-store-package.ps1`, `scripts/accept-store-windows.js`: disposable signing, registration, real Electron smoke, the deep-AppData DOCX → PDF regression, certification and uninstall.
- `scripts/read-store-wack.js`, `scripts/create-store-fixtures.js`: require complete WACK results and create synthetic text-bearing acceptance documents.
- `scripts/store-activate.ps1`, `scripts/store-shell-open-pdf.ps1`: Windows activation and registered PDF shell invocation.
- `.github/workflows/store-packaging-spike.yml`: Windows packaging/acceptance and three-platform regressions.
- `tests/desktop/store-packaging.test.js`: config isolation, writable paths and malformed-package checks.
- `desktop/main.js`: skip the unpackaged AUMID override only when `process.windowsStore` is true.
- `package.json`: add `pack:win:store`; no dependency or product version change.
- `.gitignore`: generated Store output/evidence and certificate exclusions.
- `desktop/backend.js`: LibreOffice scratch and profile use a private temporary parent and a 180-character profile URI cap.
- `tests/desktop/backend.test.js`: scratch stays outside the user output directory.
- `.github/libreoffice-matrix/`, `.github/workflows/libreoffice-path-matrix.yml`: packaged soffice path matrix.
- This readiness document, `docs/acceptance/2026-09-21-store/`, `docs/acceptance/2026-09-22-store/` and `docs/acceptance/2026-09-22-store-phase2b/`: durable acceptance evidence.

`package-lock.json`, `electron-builder.config.js`, `scripts/pack-win.js`,
`scripts/build-win-full.js`, `build/windows-file-associations.nsh`, native lockfiles,
the existing CI/Native Tool Smoke workflows and release metadata are unchanged.

## Official sources checked 2026-09-21

- [electron-builder AppX](https://www.electron.build/docs/appx/) and installed 26.15.3 AppxTarget.js/AppXOptions.d.ts (live site also documents later versions).
- [v27 overview](https://www.electron.build/docs/migration/whats-new-v27/), [migration](https://www.electron.build/docs/migration/v26-to-v27/), [breaking changes](https://www.electron.build/docs/migration/v27-breaking-changes/), [Beta MSIX target](https://www.electron.build/docs/msix/).
- [Microsoft package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements), [package identity](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/package-identity-overview).
- [Prepare desktop applications](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-prepare), [Packaging Tool](https://learn.microsoft.com/en-us/windows/msix/packaging-tool/tool-overview), [installer conversion](https://learn.microsoft.com/en-us/windows/msix/packaging-tool/create-app-package).
- [WACK](https://learn.microsoft.com/en-us/windows/uwp/debug-test-perf/windows-app-certification-kit), [test signing certificate](https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing), [Electron process.windowsStore](https://www.electronjs.org/docs/latest/api/process).
- [Desktop Bridge required and optional certification tests](https://learn.microsoft.com/en-us/windows/uwp/debug-test-perf/windows-desktop-bridge-app-tests), [MakeAppx packaging and unpacking](https://learn.microsoft.com/en-us/windows/msix/package/create-app-package-with-makeappx-tool).

Phase 1 read the TypeSafe skill and live [System One docs](https://docs.typesafe.ai/concepts/system-one) and made no API call. Phase 2A called Jev (`jev-1.13.0`) for the identity, profile and package-version disposition recorded above. Phase 2B called the same model for the crash verdict recorded in that section. Jev is not part of the application, and its answers are not certification evidence.
