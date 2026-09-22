# Microsoft Store / AppX readiness

Phase 1 used a TEST package identity. Phase 2A replaces that identity with the reserved Partner Center identity and builds one unsigned production-identity candidate. Neither phase is submitted. The v0.4.1 GitHub Release is unchanged.

## Phase 2A — official Partner Center identity

Date: 2026-09-22. Status: identity replacement is in source; Windows build, install, conversion, WACK and NSIS regression evidence is recorded below when the Store workflow for this commit finishes. Not submitted. Not a v0.4.2 release.

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

Pending the Windows workflow for the identity commit. Do not treat this section as a pass before it names the run, artifact bytes, SHA-256, installed PFN, six native probes, conversions, PDF default, WACK and NSIS regression.

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
| LibreOffice | `runLibreOfficeToUniqueOutput` creates `.swiftlocal-office-*` under chosen output; `lo-profile-*` is passed as `-env:UserInstallation=file:///...`. It does not need installed Office, registry registration or a shared user profile. Native DLL/bootstrap loading still needs package execution proof. |
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
directory; LibreOffice profile/scratch and media work live in the chosen output
directory. Unicode Downloads output passed. Every installed package file's size and
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
- `scripts/accept-store-package.ps1`, `scripts/accept-store-windows.js`: disposable signing, registration, real Electron smoke, certification and uninstall.
- `scripts/read-store-wack.js`, `scripts/create-store-fixtures.js`: require complete WACK results and create synthetic text-bearing acceptance documents.
- `scripts/store-activate.ps1`, `scripts/store-shell-open-pdf.ps1`: Windows activation and registered PDF shell invocation.
- `.github/workflows/store-packaging-spike.yml`: Windows packaging/acceptance and three-platform regressions.
- `tests/desktop/store-packaging.test.js`: config isolation, writable paths and malformed-package checks.
- `desktop/main.js`: skip the unpackaged AUMID override only when `process.windowsStore` is true.
- `package.json`: add `pack:win:store`; no dependency or product version change.
- `.gitignore`: generated Store output/evidence and certificate exclusions.
- This readiness document and `docs/acceptance/2026-09-21-store/`: durable acceptance evidence.

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

Phase 1 read the TypeSafe skill and live [System One docs](https://docs.typesafe.ai/concepts/system-one) and made no API call. Phase 2A called Jev (`jev-1.13.0`) for the identity, profile and package-version disposition recorded above. Jev is not part of the application, and its answers are not certification evidence.
