# Step 3 — complete Store state baseline before update

Status: **PASS for controlled execution step 3**. Resumed from `208de189141ed29782b5f46c9ee8bd80faeb7a08`; Phase 2D was not restarted. The closed-app `b-before-update` inventory was captured **2026-09-30 16:05:55 +08:00**. This is automated installed-product evidence; it does not supply an owner GUI confirmation.

Store remains `JTKC.SwiftLocal_1.0.0.0_x64__j44a9ewx73faj`, PFN `JTKC.SwiftLocal_j44a9ewx73faj`, Application Id `SwiftLocal`, x64, Publisher `CN=48CB75C0-3F50-44EF-87EB-8203F196B957`. No reinstall, package update, rebuild or certificate cleanup ran. Both signed copies and temporary certificate/trust remain available for the existing cycle. PR #13 remains Draft.

## Actual paths and seeded values

The existing config helper created `Channel=Store`, `Stage=store-baseline`, with its config retained locally at ignored `store-evidence/phase2d/store-baseline/store-config.json`. The seed used existing product controls and public IPC only.

The physical profile is `%LOCALAPPDATA%/Packages/JTKC.SwiftLocal_j44a9ewx73faj/LocalCache/Roaming/SwiftLocal Store`. Renderer state is under that profile's `session` directory, including `session/Local Storage/leveldb`. Electron reports logical userData `%APPDATA%/SwiftLocal Store`; the unpackaged inventory observes both logical Store Roaming/Local paths absent and the package-redirected physical profile present. Its 28 inventoried state files and exact hashes are in [the full baseline record](b-before-update-summary.json).

| Actual product state | Recorded value |
| --- | --- |
| Theme UI and `swiftlocal-theme` | `dark` |
| Saved preset name | `Phase 2D Store media preset` |
| Saved preset id | `preset-1790754970948-0847f3` |
| Preset panel / settings | `media-panel`; `#media-output-extension=mp3`, `#media-gif-fps=10` |
| Configured output preference | `%USERPROFILE%/Downloads/SwiftLocal-Phase2D-output` |
| Store configured tool overrides | `{}` |
| `swiftlocal-workflows` | Exact stored string `[]` |
| `swiftlocal.recentPdfs` / `swiftlocal-accessibility` | Both `null`; no fake markers added |
| Persisted job | `1790754980124-5d1059f7e28d4`, `pdf-compress`, `done` |
| Normal user output | `%USERPROFILE%/Downloads/SwiftLocal-Phase2D-output/retention-marker/a_compressed.pdf` |

The compression job used the existing product IPC and real synthetic `a.pdf`, not a fabricated jobs file. Its 889-byte input produced a valid 893-byte PDF rewrite containing `SWIFTLOCAL STORE PDF` and `Invoice 12345`. For this tiny fixture the file grew by four bytes; no size reduction is claimed. The output passed QPDF structure checking and independent PDF text extraction. The prior five normal user outputs remain unchanged; six files now exist in the output tree.

## Exact retained hashes

| File relative to physical Store profile, or user output | Bytes | SHA-256 |
| --- | --- | --- |
| `tools.json` | 101 | `b1f2cfa7310f6864f516561b8f706030f014edf9d632272e9cd52c9c3458aa1a` |
| `jobs-state.json` | 886 | `1a42d9d177fa0468d2175d5d50cda04785daae9734a8b8f06965ee9bb30d08b0` |
| `session/Preferences` | 57 | `be4b8924ab38e8acf350e6e3b9f1f63a1a94952d8002759acd6946c4d5d0b5de` |
| `retention-marker/a_compressed.pdf` in Downloads output | 893 | `d6ae46c6185fcdf639f1d68a8b195b29ec09545268f70ba33fdbff89a76287a1` |

SHA-256 over exact UTF-8 localStorage values: theme `e6bb5689beec52c4672bd4df92c3613d128d30cdc2b704f76953fe43d89c4ae8`; full saved-preset string `76694f5f3a4d7997043c1e1fbcafc5b067419e7f244c13bbd31112f4a9f5369a`; workflows `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`. The full raw preset string, parsed values, renderer backing-file hashes and other profile hashes are retained in the JSON record. The completed shared seed receipt has SHA-256 `a46c9e0e780a1df61c65408779c8d2b8da89d8e09bb0de863e5474dbcedd936f` and remains ignored locally for the later update verifier.

## Cross-channel and Windows checks

| Check | Result | Evidence |
| --- | --- | --- |
| NSIS installation files | PASS | All **19,730** files byte-identical to both the resumed pre-seed snapshot and the original post-install checkpoint; sorted relative-file inventory SHA-256 `0f71c70112ef6b0a84a1c6d43534d54d73f516e44d328aaf45d2ec899d295630` |
| NSIS durable profiles | PASS | Roaming `快轉通 SwiftLocal` (29 files), Roaming `SwiftLocal` (24 files) and absent Local `快轉通 SwiftLocal` unchanged; inventory hashes and actual settings/jobs hashes in JSON |
| NSIS settings | PASS | Original `tools.json` remains 84 bytes / `70dbbb9a7a7faa7c90bdc3258aefdf9bb1bcfb2f537929dcdcc73327f086613d`; no NSIS launch or preference write performed in this step |
| NSIS uninstall registration | PASS | Byte-equivalent values, version 0.4.1 |
| Both PDF/Open With registrations | PASS | NSIS `SwiftLocal.PDF`; Store `AppXnwtdh7rg4t5tbp7ewsmh9rcaxb3cgzrv` bound to `JTKC.SwiftLocal_j44a9ewx73faj!SwiftLocal`; both registrations unchanged |
| PDF default | PASS | UserChoice `FoxitReader.Document`, hash `lNCw115bAok=`, unchanged; earlier owner-observed Adobe remains recorded separately |
| Both applications closed | PASS | Store completed normal close; no `SwiftLocal` processes before/after final inventory, rechecked at 16:05:59 +08:00 |

Explorer visible naming and new GUI double-click behavior remain UNVERIFIED; registration/default measurements are not substituted for those GUI observations.

## Seed audit and preserved preparation evidence

The original seed harness returned PASS but independently auditing its values found `swiftlocal-theme=null`. That initial receipt is preserved unchanged with SHA-256 `075feb87ecb6316aa39048b5b590d6262159b4385a65c60e4f0fe18c827ade8e` and classified **PARTIAL** in the audit. Its readiness gate checked that the theme button existed without checking initialization. The real initialized button was then observed in `light` state and clicked once; it changed the UI and persisted `dark`. The original saved preset, output preference, job id and output hash all remained unchanged. No preset or job was recreated. The shared baseline now contains the complete values above; the initial raw receipt remains separate.

Only the acceptance harness changed: it now waits for the initialized theme attributes and asserts a persisted `light`/`dark` value. This addresses the preparation gap; product code and both AppX candidates are unchanged. [Automated dark-theme/preset screenshot](b-before-update-dark-theme.png) shows the resulting real UI state.

Directly invoking QPDF under protected WindowsApps from an unpackaged inspector returned `EPERM`, including outside the sandbox. The installed Store product's compression job succeeded. Output-only QPDF inspection therefore used the existing extracted payload, whose 13 QPDF payload files match the frozen package's original hashes; no package was rebuilt or installed. This is an output check, not a fresh installed-update native probe. Both direct-execution attempts and that scope are recorded in the JSON.

**Stopped at the requested step-3 boundary.** Store 1.0.0.0 and published NSIS 0.4.1 remain installed, both closed. 1.0.1.0 has not been installed. Overall verdict remains **C. PHASE 2D INCOMPLETE** until the later authorized update, coexistence, uninstall and cleanup gates are completed.
