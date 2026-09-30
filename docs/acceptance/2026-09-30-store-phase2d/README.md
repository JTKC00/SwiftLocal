# Phase 2D — package updates, retention and NSIS coexistence

Status: **C. PHASE 2D INCOMPLETE**. Started 2026-09-30 on Windows 11 x64. Product version remains **0.4.1**. PR #13 remains Draft. No merge, Partner Center upload or GitHub Release change is authorized.

[Phase 2C PASS](../2026-09-23-store-consumer/README.md) is owner-confirmed consumer GUI evidence. [Phase 2B BLOCKER FIXED](../2026-09-22-store-phase2b/README.md) preserves the exact rejected deep-AppData case and controlled profile-URI matrix. Historical Phase 1/2A failures and the optional WACK Blocked executables finding remain in [readiness history](../../MICROSOFT_STORE_MSIX_READINESS.md).

## Frozen baseline and explicit update fixture

The frozen unsigned `SwiftLocal-0.4.1-store-x64.appx` is 1,115,695,293 bytes, SHA-256 `38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404`. It is not rebuilt or modified. Source: Store Packaging Spike run [35758117387](https://github.com/JTKC00/SwiftLocal/actions/runs/35758117387), build commit `5b0e2c2eb9150c2142a1057b61c4675832a61878`, artifact `swiftlocal-appx` / `10710269389`, Phase 2B evidence commit `1c577b7`.

Run `scripts/create-store-update-fixture.py --makeappx <Microsoft SDK makeappx.exe>` explicitly to create the local-only unsigned **1.0.1.0** fixture. Only manifest `Identity/@Version` changes; MakeAppx regenerates package metadata and ZIP encoding. Every other payload entry must hash identically. Embedded Partner Center metadata continues to describe the intended first submission, **1.0.0.0**. `npm run pack:win:store`, production packaging and product version are unchanged.

Both packages must retain Name `JTKC.SwiftLocal`, Publisher `CN=48CB75C0-3F50-44EF-87EB-8203F196B957`, Application Id `SwiftLocal`, x64 and PFN `JTKC.SwiftLocal_j44a9ewx73faj`. Sign temporary copies using one non-exportable developer key, trust only its public certificate as needed, and clean up after acceptance. Record unsigned and signed hashes separately. Never commit certificate material or personal state.

## Acceptance ledger

Rows start UNVERIFIED. Allowed verdicts: PASS, FAIL, PARTIAL, UNVERIFIED. Automated evidence is scoped explicitly; GUI observations require owner confirmation. Any required product failure stops the acceptance verdict and requires a new candidate after a fix.

| Required evidence | Status | Evidence |
| --- | --- | --- |
| Frozen baseline identity, bytes, SHA and source | PASS | [Frozen baseline and fixture verification](update-fixture.json), [manifest](baseline-AppxManifest.xml) |
| Update fixture identity, version and unchanged payload | PASS | [Fixture verification](update-fixture.json), [manifest](update-AppxManifest.xml), [strict package/native preflight](package-preflight.json) |
| Both signed copies use same temporary certificate | PARTIAL | [Signed payload comparison](signed-payload-verification.json), [actual non-exportable key check](non-exportable-key.json); machine trust/signature verification pending |
| Published NSIS v0.4.1 Full Installer matches published SHA256SUMS | PASS | [Verification](published-nsis-verification.json), [published checksums](published-v0.4.1-SHA256SUMS.txt) |
| A: NSIS v0.4.1 alone, settings and file inventory | UNVERIFIED | Preserve existing NSIS state before upgrade |
| B: Store 1.0.0.0 installed with NSIS, both launch | UNVERIFIED | Owner GUI confirmation pending |
| Real Store preference, renderer state, output preference, jobs and output seeded | UNVERIFIED | Use existing product behavior; no invented persistence |
| In-place 1.0.0.0 -> 1.0.1.0 update, no intervening uninstall | UNVERIFIED | Deployment/package/state inventories pending |
| Store settings and persisted renderer state retained | UNVERIFIED | Compare values before mutation and state-file hashes |
| User output retained across update | UNVERIFIED | Compare exact hashes |
| Updated Store launch, six native probes and representative operations | UNVERIFIED | Installed-package smoke pending |
| Updated Store Phase 2B exact deep-path regression | UNVERIFIED | Earlier PASS remains linked, fresh update check pending |
| PDF default unchanged through all stages | UNVERIFIED | Registry snapshots plus owner observations |
| Both Open With entries, launch behavior and naming | UNVERIFIED | Owner Explorer observations pending |
| NSIS files, registration, version and profile unaffected by Store lifecycle | UNVERIFIED | Pre/post inventories pending |
| D: Store GUI uninstall, package/Start/PDF registration removed | UNVERIFIED | Owner GUI and package records pending |
| Store private versus package-managed state measured after uninstall | UNVERIFIED | Retain residue evidence before any cleanup |
| User output retained after uninstall | UNVERIFIED | Hash and owner checks pending; do not delete output |
| NSIS still launches with its PDF registration after Store removal | UNVERIFIED | Owner and installed smoke pending |
| Reverse coexistence safety where practical | UNVERIFIED | Record any untested direction explicitly |
| npm test, typecheck, check:ci, git diff --check | PASS | [Local regression summary](regression-summary.json); conditional skips disclosed |
| Appropriate published NSIS Full regression | UNVERIFIED | Actual published installed package smoke pending |
| Temporary trust, private key and test-copy cleanup | UNVERIFIED | Exact receipt-bound cleanup pending |

## Inventory and evidence rules

Keep separate inventories for (A) application-owned Store profile/settings/session files, (B) package-managed or redirected `%LOCALAPPDATA%/Packages/<PFN>` state, and (C) normal user output in Downloads/Documents. Record actual runtime paths; Windows can redirect desktop AppData writes ([Microsoft filesystem guidance](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes)). This is a reason to inspect both locations, not proof of retention or deletion.

Collect package full name/version/PFN, installed locations, Start registration, PDF UserChoice and Open With registrations, NSIS uninstall registration and representative install/profile hashes before and after every lifecycle step. Do not rewrite defaults, auto-migrate NSIS state, reset profiles or remove unexpected residue to improve a result. Personal filenames/documents stay in ignored local evidence; public evidence uses synthetic fixtures and sanitized paths.

An optional downgrade attempt may record the exact Windows rejection; never force it. GUI installer/update/uninstall screenshots are useful. A deployment failure must retain its exact text and activity ID. The next gate after a PASS is Phase 2E: licensing, Store policy, optional WACK finding, runFullTrust justification and listing/submission readiness. Passing Phase 2D does not authorize submission.

## Current preparation evidence

The verified unsigned 1.0.1.0 fixture is **1,115,795,156 bytes**, SHA-256 `d737b781d16e0b9b6dd23e876626df1095756816c6527a11945ff30c96fc4e4a`. It contains the frozen application payload: 19,693 unchanged original entries, plus the one changed manifest and two regenerated metadata entries. The embedded product remains 0.4.1. Six native executables from that exact extracted payload pass version probes and native/tessdata lock checks; these preparatory probes do not prove installed update behavior.

| Local-only copy | Bytes | SHA-256 |
| --- | --- | --- |
| Signed 1.0.0.0 | 1,115,166,892 | `a83caad0fff5465af1ec56ce22b15538e9470ad5d8654fb2062e56772fb7653c` |
| Signed 1.0.1.0 | 1,115,266,759 | `84ac4bc3bba6cd2d0f83fc9d8b8678b0b766f55d45e0ffe69d4c044f8a117fc1` |

Both signed copies preserve all **19,694** original non-generated entries, including their respective manifest. Signing adds `AppxMetadata/CodeIntegrity.cat` and `AppxSignature.p7x`, and regenerates signing metadata/ZIP encoding. Temporary certificate thumbprint `30E81230B7C3CCB8D19D5D6A67F975DDB8D93450` has the exact official Publisher subject and CNG export policy `None`; it expires **2026-10-05 13:31:23 +08:00**. Its private key stays in the original user's certificate store. Public DER and signed copies are ignored local test material, not release artifacts. Machine trust has **not** been added yet. Do not install the Store copies until both signatures verify after temporary trust.

[Initial machine inventory](initial-machine-summary.json): Windows 11 Home/Core 25H2 build 26200.9550 x64, physical PC/standard account as owner-confirmed in Phase 2C. At this Phase 2D snapshot, neither Store nor NSIS has a package/uninstall registration; retained NSIS profiles remain and have been hashed locally without modification. Store logical Roaming/Local and package-managed paths are absent. Phase 2C's earlier NSIS 0.4.0 observation remains historical evidence; it is not the current installed baseline. Current PDF UserChoice remains `FoxitReader.Document`, hash `lNCw115bAok=`. The prior owner-observed Adobe versus registry ProgID discrepancy remains disclosed; Phase 2D GUI default-reader checks are still UNVERIFIED.

Preparation history is retained locally. Attempt 1 incorrectly reused URI-escaped ZIP names as physical paths; the post-pack entry-set check rejected double-escaped `@`/`+` names before signing or installation. The script now decodes OPC names once, and the rebuilt **update fixture only** passes every original payload hash. The frozen baseline was never rebuilt or modified. An initial preflight helper used a POSIX ASAR path on Windows; correcting the helper to use native separators passed without changing either package. The first test run lacked FastAPI in the available Python environment; the isolated repository environment now has the existing pinned requirements, and the required test command passes. These are preparation/environment errors, not hidden consumer product failures.

## Controlled execution order

Do not run `scripts/accept-store-package.ps1`: that earlier CI helper creates its own certificate and automatically installs/uninstalls, so it cannot prove this two-version lifecycle. The Phase 2D signing/inventory helpers never install or uninstall.

1. Owner installs the verified published NSIS 0.4.1 Full Installer from `store-evidence/phase2d/published-nsis/`, preserving existing profiles/defaults. Confirm ordinary Windows launch, version and PDF behavior. Run `create-harness-config.ps1 -Channel NSIS -Stage nsis-alone`, then `scripts/accept-installed-windows.js <that config> phase2d` for the published Full smoke. Capture `capture-inventory.ps1 -Stage a-nsis-alone -OutputRoot <Downloads output>` after NSIS activity has stopped; this is the comparison baseline for later Store-only changes.
2. As administrator run `manage-test-signing.ps1 -Mode Trust`. It verifies **both** signed packages against the same trusted public certificate and stops before installation. Return to the original normal account and double-click the signed **1.0.0.0** copy in App Installer. Owner checks both launch paths, PDF defaults and Explorer Open With. Record both visible names, including indistinguishable entries if present.
3. Create Store config `-Channel Store -Stage store-baseline`, then run `scripts/accept-store-update-state.js <config> seed`. It clicks the real theme button and saved media-preset form, uses the supported output preference API, and creates a real PDF-compression job/output in Downloads. Record the configured profile/state files and output hashes with `capture-inventory.ps1 -Stage b-before-update`. Close both apps before updating.
4. Owner double-clicks the signed **1.0.1.0** copy and confirms App Installer offers an update. Do not uninstall 1.0.0.0 in between. Capture `c-after-update-before-launch` immediately. Create a new Store config for `store-updated`, then run `accept-store-update-state.js <config> verify` **before** smoke or preference writes. This reads the shared seeded baseline. Run `accept-store-windows.js <config> phase2d` afterward for fresh installed six-tool probes, six conversions, shell-open PDF and the exact deep-AppData regression. Fresh probe timestamps/tool paths must belong to the updated installation; an old probe JSON is insufficient. Capture `c-after-update-smoke` and owner GUI/default/Open With observations.
5. Compare NSIS install-file hashes/uninstall registration/profile and Store outputs at B/C against A. For Store-only transitions, NSIS must remain closed so its own activity does not change its profile. Before each explicit NSIS launch, take that transition's comparison inventory, then record NSIS launch separately. Normal jobs/log/cache changes from launching a channel must be distinguished from cross-channel damage.
6. Where practical, take a read-only `checkpoint` of Store state after smoke, record both-channel inventory, owner uninstalls NSIS normally, and run Store `verify-reverse` against that separate checkpoint. Confirm Store launch/default/association/output integrity and preserve all residue evidence. Reinstall the same verified NSIS 0.4.1 package and record its state before continuing. This does not overwrite the original in-place-update retention verdict. If reverse safety is not tested, record the limitation explicitly.
7. Owner uninstalls Store 1.0.1.0 through Settings. Immediately capture `d-after-store-uninstall` with the same Downloads output root; compare A/B/C/D package, Start, PDF, NSIS and private/redirected state. Measure all surviving state before any cleanup. Owner confirms NSIS still works, its Open With registration remains, the PDF default is unchanged and outputs remain.
8. As administrator run `manage-test-signing.ps1 -Mode CleanupMachine`, then as original signing user `-Mode CleanupUser`. This removes receipt-bound temporary trust/key/public DER/both signed copies and the derived update-package/extracted packaging copies (including the rejected preparation attempt). Every recursive scratch target is resolved under ignored Phase 2D evidence and checked for reparse points before removal. It never deletes installed application/profile residue, the frozen baseline or user output. Retain the cleanup receipt. Raw personal-path inventories stay ignored; publish sanitized comparisons and relevant synthetic-fixture screenshots.

No Phase 2D install, update, seeded-state check, coexistence observation or GUI uninstall has been confirmed yet. The project owner has been asked to perform the first published NSIS installation. All lifecycle rows remain UNVERIFIED. Cleanup is pending the acceptance cycle; an expired/replaced signing certificate would require new signed-copy hashes and a clearly recorded cycle change.
