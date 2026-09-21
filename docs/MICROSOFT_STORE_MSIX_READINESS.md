# Microsoft Store / AppX readiness — Phase 1

Date: 2026-09-21. Status: implementation and Windows evidence pending.
Baseline: `c98b27fd01eac54710e291db205039e7ed41190d` (`origin/main`), product v0.4.1,
Electron 44.2.0, electron-builder 26.15.3, Windows x64. Branch: `store/msix-readiness`.
The original local checkout was v0.4.0; an isolated worktree was created from the
current remote main. The v0.4.1 GitHub Release remains outside this work.

## Decision (made after source audit, before implementation)

Choose **Route A: electron-builder 26.15.3 AppX**. Microsoft accepts `.appx` and
`.msix` package families. Format alone does not establish certification. Keep
the exact production builder and native locks; use a separate Store entrypoint,
config, manifest, output directory and manual CI workflow. No v27 upgrade.

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
| CI | `ci.yml` runs unit/syntax/metadata checks on three OSs. `native-tool-smoke.yml` already proves NSIS Full conversion and fresh-user/upgrade scenarios. Store workflow must be separate, manual, read-only repository permissions, artifact upload only. |

No automatic Store update/download feature, service, driver, elevated app operation
or NSIS registry dependency was found in the Electron desktop path. Native payload
size (~684 MB existing installer) does not by itself prohibit AppX. Technical bundling
does not establish redistribution rights: FFmpeg build license/codecs, QPDF,
Tesseract/tessdata, LibreOffice and its bundled components, yt-dlp and Deno licenses,
notices/source-offer duties need owner review before submission. yt-dlp/media download
functionality also needs Store content-policy review. WACK may flag unused native
helpers; do not remove locked files ad hoc or suppress certification checks.

## Store-specific differences

Windows owns package installation/upgrade/uninstall and manifest registration;
NSIS customInstall/customUnInstall do not run. WindowsApps is immutable. Package
data follows package identity and OS virtualization; update should retain it,
uninstall normally removes managed package data, while explicit files in Downloads
remain. Actual retention/cleanup must be measured; do not promise migration from
NSIS profiles or remove user outputs. Coexistence and upgrade from TEST to a real
Store identity are not automatic migrations. TEST identity is a separate application.

Only TEST placeholders may be used now. Product version remains **0.4.1**; the
spike manifest uses package version **1.0.0.0** because Store's package numbering
requires a nonzero first component and a zero final component. This is not a
v1.0 product release and is not a reserved production Store version.

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

### Reproduce the TEST spike

Use Windows x64 with Node 24, full 7-Zip, and Windows SDK signing tools. From a
clean checkout of this branch:

```powershell
npm ci
npm run pack:win:store
node scripts/smoke-release.js --require-bundled --skip-tests
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

Initial state: no Store-format artifact, package registration, native package smoke,
PDF default comparison or WACK result yet. Existing NSIS acceptance is historical
baseline evidence, not AppX acceptance. Results will be appended after execution.

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

## Official sources checked 2026-09-21

- [electron-builder AppX](https://www.electron.build/docs/appx/) and installed 26.15.3 AppxTarget.js/AppXOptions.d.ts (live site also documents later versions).
- [v27 overview](https://www.electron.build/docs/migration/whats-new-v27/), [migration](https://www.electron.build/docs/migration/v26-to-v27/), [breaking changes](https://www.electron.build/docs/migration/v27-breaking-changes/), [Beta MSIX target](https://www.electron.build/docs/msix/).
- [Microsoft package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements), [package identity](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/package-identity-overview).
- [Prepare desktop applications](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-prepare), [Packaging Tool](https://learn.microsoft.com/en-us/windows/msix/packaging-tool/tool-overview), [installer conversion](https://learn.microsoft.com/en-us/windows/msix/packaging-tool/create-app-package).
- [WACK](https://learn.microsoft.com/en-us/windows/uwp/debug-test-perf/windows-app-certification-kit), [test signing certificate](https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing), [Electron process.windowsStore](https://www.electronjs.org/docs/latest/api/process).

The explicitly requested TypeSafe skill and live [System One docs](https://docs.typesafe.ai/concepts/system-one)
were read. This deterministic packaging task needs no semantic AI integration,
API calls or new product feature.
