# Step 4A — in-place update, with the before-launch control missed

Status: **PARTIAL; Step 4A did not PASS**. Overall **C. PHASE 2D INCOMPLETE**. Resumed from `d9262c5f186976f75b37a8f671b061316ea41d83` without reseeding, reinstalling NSIS/baseline Store, rebuilding, re-signing or cleaning temporary signing material. No native probes, conversion smoke or Phase 2B regression ran.

The owner answered the explicit App Installer update question: **“更新了，完全沒問題”**. Windows records the old package in the same deployment activity's `updateList`, then successful deployment. However, the process monitor observed SwiftLocal at **17:08:38 +08:00**, immediately after deployment finished. The owner subsequently confirmed **“我手動開啟”**. The application was already closed when the requested snapshot began at **17:10:22 +08:00**. The snapshot completed at **17:12:59 +08:00** with zero SwiftLocal processes before and after collection.

Therefore the retained filename/stage `c-after-update-before-launch` describes the requested stage, **not a valid before-first-launch measurement**. Its actual scope is a closed-app snapshot after an owner-confirmed manual launch. This control failure is preserved; no settings/job/output loss or NSIS damage was observed. No rollback, downgrade, repeat installation or further app launch was attempted to disguise it.

## Requested results A–J

| Item | Result | Actual evidence |
| --- | --- | --- |
| A. App Installer visibly performs update | PASS | Owner reply to the GUI update question; screenshot not supplied. Deployment event 855 explicitly maps old version to new in `updateList` |
| B. Installed version | PASS | `JTKC.SwiftLocal_1.0.1.0_x64__j44a9ewx73faj`; exactly one current-user installed package, 1.0.0.0 no longer current |
| C. PFN before/after | PASS | Both `JTKC.SwiftLocal_j44a9ewx73faj`; Name, Publisher, x64, Application Id `SwiftLocal` and AUMID unchanged |
| D. Intervening uninstall | PASS | None observed or requested. Owner update reply and one deployment activity with explicit update list; no separate SwiftLocal Remove/DeRegister operation in the captured interval |
| E. Theme/preset/output/job retention | PASS | Exact durable values and complete jobs semantic record retained, measured after the manual launch; prelaunch timing requirement FAIL |
| F. Durable file comparison | PASS | Comparison complete: settings and Preferences byte-identical; jobs file hash changed only because `savedAt` changed. All job records remain identical. Details below |
| G. Output PDF comparison | PASS | Same 893 bytes and SHA-256 `d6ae46c6185fcdf639f1d68a8b195b29ec09545268f70ba33fdbff89a76287a1` |
| H. NSIS byte integrity | PASS | All 19,730 install files, durable profiles and uninstall registration unchanged from the frozen baseline; all six existing user outputs unchanged |
| I. PDF default/Open With | PASS | UserChoice `FoxitReader.Document`, hash `lNCw115bAok=`, unchanged; both `SwiftLocal.PDF` and `AppXnwtdh7rg4t5tbp7ewsmh9rcaxb3cgzrv` registered. New Explorer GUI behavior remains UNVERIFIED |
| J. Step 4A verdict | PARTIAL | Required before-first-launch control FAIL; do not mark Step 4A PASS |

The retained theme is `dark`. Preset `preset-1790754970948-0847f3` / `Phase 2D Store media preset` still has `#media-output-extension=mp3` and `#media-gif-fps=10`; the full raw localStorage string is identical. The output preference remains `%USERPROFILE%/Downloads/SwiftLocal-Phase2D-output`. Job `1790754980124-5d1059f7e28d4` remains `pdf-compress`, `done`, with every persisted job field intact. The output remains `retention-marker/a_compressed.pdf`.

## Exact state hashes and difference classification

| File | Before SHA-256 | After SHA-256 | Interpretation |
| --- | --- | --- | --- |
| `tools.json` | `b1f2cfa7310f6864f516561b8f706030f014edf9d632272e9cd52c9c3458aa1a` | Same | A: durable output/tool settings unchanged |
| `jobs-state.json` | `1a42d9d177fa0468d2175d5d50cda04785daae9734a8b8f06965ee9bb30d08b0` | `0be476222efe052bc5bc5cccf98f907cdb4970ef13f62cb655f14722d880a4cb` | A: all jobs and schema version identical; only serializer `savedAt` changed from `2026-09-30T08:02:15.533Z` to `2026-09-30T09:08:41.491Z` |
| `session/Preferences` | `be4b8924ab38e8acf350e6e3b9f1f63a1a94952d8002759acd6946c4d5d0b5de` | Same | B: browser preference bytes unchanged |
| localStorage `000003.log` | `1469a0d5ed84afdb89b781496900a7cf01048a6eaa80b698040a9c7647e7faf9` | `173e83a9073a1e970ad3f1857a829fa331c898a7b724814765c1faa44566c23c` | Durable application values exactly identical; backing log grows 952 -> 1001 bytes with metadata changes |

The existing StateOnly baseline and corresponding post-update inventory both contain **28** physical profile files, with **nine** changed hashes and no tracked files removed. Two are application-owned changes: the jobs serializer timestamp above, and runtime diagnostic `resourcesPath` now referencing package 1.0.1.0; every other runtime field is unchanged. The remaining seven are DIPS, localStorage log/log diagnostics and Session Storage log/log diagnostics, classified as browser/LevelDB/session metadata. Durable localStorage semantics remain identical. Package-managed `Settings/settings.dat` and its log files are recorded separately as C: OS/package-managed metadata.

The additional complete current physical-profile inventory hashes **59 files**, including cache contents, without exclusions. The earlier frozen StateOnly inventory omitted cache-directory contents; their pre-update hashes are **UNVERIFIED**, and no full-cache comparison is invented. All known baseline state-file comparisons and complete current hashes are retained in [the sanitized record](c-after-update-before-launch-summary.json).

Offline localStorage inspection reads WAL bytes without opening LevelDB or launching a browser, checks CRC32C and replays write batches, then decodes Chromium strings. Its pre-update result matches the prior independent renderer baseline; a corrupted evidence-only WAL copy is rejected. Format references: [LevelDB log format](https://github.com/google/leveldb/blob/main/doc/log_format.md), [write batches](https://github.com/google/leveldb/blob/main/db/write_batch.cc), [Chromium stored string encoding](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/storage/cached_storage_area.cc). It deliberately rejects SSTable layouts rather than mutate or guess at the database.

## Update, preflight and audit receipts

[Preflight PASS](step4a-preflight.json) verifies the original baseline, all four unsigned/signed package hashes, valid signatures, the same temporary certificate `30E81230B7C3CCB8D19D5D6A67F975DDB8D93450` and existing public-only machine trust. No artifacts or certificates were regenerated. An initial optional event-channel lookup used the wrong channel name; that original preparation failure remains saved locally, and the corrected read-only preflight passes.

[Deployment events](step4a-deployment-events.json) preserve activity `{277e35e4-5078-0000-e855-36287850dd01}`: event 855 / record 426801 explicitly updates 1.0.0.0 to 1.0.1.0, and event 400 / record 426817 succeeds at 17:08:37 +08:00. Event 472 de-stages the superseded payload within that same activity; it is not hidden or treated as an intervening user uninstall. The [installed manifest](installed-1.0.1.0-AppxManifest.xml) retains official identity and Application Id.

[Process observation](step4a-process-observation.json) contains 1,660 samples, with four SwiftLocal process ids observed after the update. The owner-confirmed manual launch and runtime-path/job-timestamp corroboration invalidate the before-launch inference. The original state-only comparison PASS receipt is preserved locally; its before-launch wording is rejected by this audit. The helper now separates durable-retention results from the independent no-launch control.

**Stopped.** Store 1.0.1.0 and published NSIS 0.4.1 remain installed, both closed. Both signed copies and temporary certificate/key/trust remain. Agent actions did not launch either app, reseed, run updated-app smoke, probe native tools, run the deep-path regression, uninstall, rebuild or modify product code. Phase 2B PASS evidence remains linked and unchanged. PR #13 remains Draft; no Store submission, merge, v0.4.2 or published v0.4.1 Release changes.
