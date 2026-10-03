# Installer-driven Windows PDF registration recovery

2026-10-04 status: **C. INCOMPLETE — full Windows restart not yet verified**. The exact fixed NSIS candidate was normally uninstalled and reinstalled; its registration was automatically recreated, and all four desktop checks passed before the reboot attempt. The latest actual-host capture still reports the earlier kernel boot time. The required later full restart and repeated desktop checks remain unfinished; the desktop PDF registration blocker remains open.

The earlier [manual host repair and reboot persistence](pdf-openwith-host-repair.md) remain historical PASS results for a **manual Codex registry repair**. The earlier owner Open With FAIL remains unchanged. None of those results proves installer-driven registration recovery. The cause of the earlier missing registration remains UNVERIFIED.

## Exact candidate

Use the already accepted fixed NSIS candidate, without rebuilding or changing version:

- Artifact: `store-evidence/verify-2026-10-02/dist-full/SwiftLocal-0.4.1-full-installer-x64.exe`
- SHA-256: `4192e17a3dadc49d15afed29a841be66d1820f8ffcde539ca3527bfd17ad228e`
- Size: `802528284` bytes
- Independently rehashed during gate preparation. Its hash must also match in the actual-host baseline and immediately before installer launch.

## Historical preparation snapshot, before the lifecycle ran

The following preparation observations and PENDING table were published on 2026-10-02 before the owner reconnected the diagnostic client. They are retained as history; the completed lifecycle evidence is appended below.

Actual Windows Settings still lists 快轉通 SwiftLocal, and Explorer's PDF Open With submenu still lists SwiftLocal. Fresh screenshots and the menu tree were saved under ignored `store-evidence/pdf-openwith-2026-10-02/installer-recovery/`. SwiftLocal was normally closed, and a subsequent process check returned zero running SwiftLocal processes. These observations describe the existing manual-repair state; they are not installer recovery results.

The actual Windows Desktop Commander connection is currently offline after the earlier reboot. Its existing cached client and Node runtime were identified without downloading or installing software. A small, reviewed launcher is ready for the owner to run from native Windows Explorer so subsequent snapshots do not inherit Codex's execution context. No uninstall will begin before a complete actual-host baseline is captured and read back.

The separate read-only capture helper covers HKCU, HKLM and HKCR in both 32-bit and 64-bit views, Installed Apps registration, the installer GUID, SwiftLocal.PDF, Applications\SwiftLocal.exe, shared .pdf\OpenWithProgids, PDF UserChoice, peer PDF registrations, both SwiftLocal profiles and user-output hashes. Static review and syntax checks are preparation evidence only; actual-host snapshot execution and lifecycle verification are pending. Later snapshots retain the baseline's peer and output coverage. Any capture error prevents a complete-baseline claim.

## Required isolated lifecycle

| Stage | Required evidence | Current result |
| --- | --- | --- |
| Before uninstall | Complete actual-host registration/default/peer snapshot, profiles and output hashes, accepted candidate hash | PENDING |
| Normal uninstall | SwiftLocal-owned registration removed; shared peer registration, Adobe/default, profiles and outputs preserved | PENDING |
| Normal reinstall of the same candidate | Registration automatically recreated without manual registry writes; protected state preserved | PENDING |
| Installed Apps | Actual Settings lists 快轉通 SwiftLocal | PENDING after reinstall |
| PDF Open With | Actual Explorer lists SwiftLocal | PENDING after reinstall |
| Open fixture | Selecting SwiftLocal renders the existing synthetic one-page a.pdf | PENDING after reinstall |
| Default preserved | Ordinary Explorer open still launches Adobe | PENDING after reinstall |
| New reboot after reinstall | Later measured Windows boot and all four actual desktop criteria repeated | PENDING |

Strict profile/output comparison checkpoints occur while SwiftLocal is closed, before the post-install viewer test. Ordinary viewer cache and recent-file activity is recorded separately. Peer registrations and the original UserChoice must remain protected throughout.

Only four app-owned HKCU trees, their children and SwiftLocal's own empty REG_NONE shared value may change during uninstall/reinstall. The shared OpenWithProgids key and other PDF viewers must remain. Read-only observation of existing Capabilities/App Paths is allowed for preservation checking; adding or experimenting with them is outside this gate.

The Windows reboot already completed at 22:04:29.500 +08:00 proved persistence of the manual repair. It cannot satisfy the required reboot **after** this new uninstall/reinstall sequence.

## Verdict rule and boundaries

- **A. INSTALLER RECOVERY PASS** requires the complete normal lifecycle, preservation checks, four real desktop criteria after reinstall and the same four after a subsequent Windows reboot. Only A closes the desktop PDF registration blocker.
- **B. INSTALLER RECOVERY FAIL** records an observed gate failure with its evidence; it must not be repaired manually to manufacture a PASS.
- **C. INCOMPLETE** applies while required evidence or actions remain unfinished. This is the current verdict.

Use the existing Windows account. No registry repair, Capabilities/App Paths experiment, Store package install, v0.4.2 build, Microsoft Store submission or merge is authorized by this gate. PR #13 remains Draft. Preserve all earlier FAIL/PASS receipts and describe the actual mechanism established by the new test.

## 2026-10-02 to 2026-10-03 normal lifecycle, before the new reboot

The owner launched the existing Windows diagnostic client. All three lifecycle captures used the same actual Windows machine, user SID and `Owner-launched Desktop Commander Windows PowerShell` route. Codex's separate registry view was not substituted for these captures. Each snapshot completed without capture errors and was read back; an independent reviewer also compared the raw receipts.

1. **Before uninstall:** `before.json`, captured at 23:22:23 +08:00, contains 971 typed registry rows across six views, 15 PDF ProgIDs, 10 application executables, both profile trees (110 files) and 57 existing output hashes. It captures Installed Apps, SwiftLocal.PDF, Applications\SwiftLocal.exe, shared .pdf\OpenWithProgids, Adobe UserChoice/default, peer registrations and existing App Paths/Capabilities for preservation checking only.
2. **Normal uninstall:** Windows Settings → Uninstall → the native NSIS confirmation. The four app-owned HKCU trees, SwiftLocal's own empty REG_NONE shared value, corresponding HKCR views and its Installed Apps entry disappeared. There were zero unexpected registry changes. The shared OpenWithProgids keys remained present; their peer values, Adobe UserChoice/default, all peer registrations, all 110 profile file hashes and all 57 output hashes were unchanged. Actual Settings and Explorer screenshots also show SwiftLocal absent. The original installed EXE, ASAR and uninstaller were absent.
3. **Normal reinstall:** the accepted candidate was rehashed immediately before use at `2026-10-02T23:27:28.2528432+08:00`; SHA-256 and size exactly matched the candidate above. Its existing `.exe` was double-clicked in native Explorer, with the same per-user installation directory. No rebuild, alternate candidate or manual registry operation intervened.
4. **After reinstall:** the four owned trees, shared value and Installed Apps entry were automatically present again. Before → installed all 971 typed registry rows were exactly equal, including Adobe/default, peers and existing App Paths/Capabilities. The accepted EXE and ASAR identities were restored. All 57 output files were still byte/hash-identical, including another check after both viewer tests.

This candidate is configured with `oneClick: true` and `runAfterFinish: true` (`electron-builder.config.js:156,163`). It completed and automatically opened SwiftLocal's main window. There was no final assisted-install page on which to disable auto-run. SwiftLocal was then normally closed before `installed.json` at 23:54:05 +08:00; both capture process checks returned zero. This is an **after-auto-run, closed-app checkpoint**, not a checkpoint before the app had ever launched. The attempted installer window inspection timed out; no installer process/exit-code receipt was obtained, and none is claimed.

The established recovery mechanism is the exact candidate's normal reinstall with its bundled default auto-run, without Codex registry repair. An independent source review matched five relevant runtime files from the accepted ASAR to the frozen source. The packaged association module's `registerPdfAssociation` only reads status; startup does not recreate the registration. The frozen NSIS source places Installed Apps registration (`installSection.nsh:67`), custom PDF registration (`:82`, `build/windows-file-associations.nsh:2–10`) and then app auto-run (`:96`) in that order. This supports the installer hooks as the registration writer. Runtime observation does not provide a pre-app checkpoint or directly observed writing PID. The earlier missing-registration cause and a claim of old-installation contamination remain UNVERIFIED.

### Actual desktop checks after reinstall

| Criterion | Result | Private local evidence |
| --- | --- | --- |
| Installed Apps lists 快轉通 SwiftLocal | PASS | `installed-installed-apps.png` |
| PDF Open With lists SwiftLocal alongside the existing viewers | PASS | `installed-pdf-openwith.png` |
| Selecting SwiftLocal opens the synthetic PDF | PASS | `installed-swift-pdf.png`, `installed-swift-pdf-tree.txt`, `installed-swift-processes.json` |
| Adobe remains the default | PASS | `installed-adobe-default.png`, `installed-gui-proof.json` |

The SwiftLocal workspace rendered `SWIFTLOCAL STORE PDF` / `Invoice 12345`, reported one page and the exact existing `picker/a.pdf` path. Its main process was launched by Explorer with that fixture argument. No PDF edits or set-default action were performed. SwiftLocal and the earlier Adobe window were normally closed, then an ordinary Explorer double-click launched a new Adobe process with the same fixture; its actual page was inspected. The subsequent actual-host proof has both UserChoice views exactly equal to before, all 57 output hashes equal, zero SwiftLocal processes and one Explorer-launched Adobe fixture process.

### Profile capture and explicit limitation

Uninstall preserved all 110 profile file hashes. After the installer's default auto-run, 14 files in the main profile changed: Chromium cache/log files, LocalStorage/SessionStorage logs, DIPS and `jobs-state.json`. The strict raw profile comparison therefore remains **FAIL** in `comparison-installed.json`; this receipt is not relabelled PASS. Both profile roots remain, and the four Chromium `Preferences` / `Local State` files plus the old profile's jobs-state hash remain identical.

App startup can normalize/prune/save jobs and rewrite `savedAt`, but no exact before jobs-state content copy exists for this run. Job-record semantics and LocalStorage-based theme/accessibility/presets preservation are **UNVERIFIED**. The 14 differences cannot all be described as harmless cache. This registration gate captures profiles and proves user-output retention; it does not claim byte-identical main profiles after normal app startup or verified preservation of every UI preference.

### Immutable receipts

Raw host snapshots, screenshots, process metadata and output/profile hashes remain private under ignored `store-evidence/pdf-openwith-2026-10-02/installer-recovery/`; no personal output content or UserChoice hash is published here.

| Receipt | SHA-256 |
| --- | --- |
| `before.json` | `ab81ac896d7239a2bbc74e0a8aaa97b61cd94b0c1af8366e296a0f4474b0e53e` |
| `uninstalled.json` | `fb2ec3c6cc082a07e0d813f675f315ac4bd11b16acb43fb106b59817e32830f4` |
| `comparison-uninstalled.json` | `2d52503f7569ae759cffed4d6bf28fb7d74bae08cb471272a32a3102b811f2c0` |
| `installed.json` | `58db36bc512592dc71f2fb14a45c17a8d2d8acb8c4a4e7097f10e1f288281118` |
| `comparison-installed.json` (strict profiles FAIL retained) | `e816985184828e19f0e57d84afb85d65103523034f440f0af40e4e1c8a1be319` |
| `installed-swift-processes.json` | `704220ce649b805aa94470261d4049d45d1a41091343b48e5b9faca770eab846` |
| `installed-gui-proof.json` | `b17d0072a5f56f0ad1e02ddcc95accffc0d786c37b2412b67798dc8c54015035` |

The current boot is still the earlier manual-repair boot at 22:04:29.500 +08:00. A measured boot later than this reinstall checkpoint, followed by all four actual desktop checks, is required. Until then the verdict is **C. INCOMPLETE**, not A. PR #13 stays Draft; no merge or Store submission occurred.

## 2026-10-04 reported restart: measured full restart INCOMPLETE

The owner reported a restart and relaunched the same existing diagnostic client. `reboot.json` completed on the same machine, SID and actual-host execution route at 00:49:28 +08:00, with 971 registry rows, both profiles (110 files), all 57 outputs and zero capture errors. The candidate SHA-256 still matches. Its stage/filename records the attempted check; it does not establish that a new full restart occurred.

The measured kernel boot remains `2026-10-02T14:04:29.5000000Z`, earlier than the reinstall. A separate read-only cross-check at 00:52:39 +08:00 returned the same CIM boot time and 96,489 seconds of system uptime. System events include a new Kernel-Boot event 27 at 00:31:01 +08:00 with boot type `0x1`; the most recent Kernel-General OS-start event 12 and EventLog service-start event 6005 still belong to 2026-10-02 at 22:04:29 and 22:04:49 +08:00. The event capture had zero read errors.

These observations are consistent with a Fast Startup/resume transition rather than a new kernel boot (inference). Microsoft documents that Fast Startup preserves the kernel session, while choosing Restart performs a full boot cycle. [Microsoft Fast Startup documentation](https://learn.microsoft.com/en-us/troubleshoot/windows-client/setup-upgrade-and-drivers/fast-startup-causes-system-hibernation-shutdown-fail). No power setting or registry value was changed for this diagnosis.

`comparison-reboot.json` therefore remains **VERIFICATION INCOMPLETE**, with the later-boot criterion INCOMPLETE. SwiftLocal-owned registration, Adobe UserChoice/default, installed payload and all 57 frozen user-output hashes are PASS; both profile roots remain. The actual current Installed Apps screen still lists 快轉通 SwiftLocal (`resume-20261004-installed-apps.png`), but this is a current/resume observation, not the required post-full-restart acceptance.

### Later peer-version drift, preserved as a strict FAIL

The strict original-baseline registry comparison also reports **12 unexpected rows / FAIL**. An independent raw review confirms that these are real value changes, not GUI MRU exceptions:

- Eight rows change Edge PDF ApplicationIcon / DefaultIcon version paths across HKCR and HKLM views.
- Four rows change Edge, Edge Update, Edge WebView and OneDrive Installed Apps version/metadata.

The original before → immediate installed comparison remains exactly zero differences. These later version-shaped changes appear between the installed and current snapshots; their trigger is UNVERIFIED. Adobe, PDF OpenWith/MRU and shell-open-command rows have zero differences. No registry value was restored, no comparison exception was added, and the strict FAIL is retained. A separate current checkpoint may be used to assess what changes across the next full restart; it cannot erase these original-baseline differences or turn the earlier receipt into PASS.

| Attempt receipt | SHA-256 |
| --- | --- |
| `reboot.json` | `97acf3019bcaa8d5827316c505e277acacd09d921a44f1c4633212aab8b2f82b` |
| `comparison-reboot.json` | `a342dfe107cde0c61cc46a6ac9ba8505e1dcc40a17baa48823a6de3b0fcfbdc2` |
| `boot-crosscheck-20261004.json` | `2be05636fed01158170d1b56ba9064fb0620baad2748a247e5e586059969f1e1` |

The next step is Windows Power → Restart, followed by a measured later kernel boot and the same four actual desktop checks. New receipt filenames will preserve this attempt without overwriting it. The final verdict remains **C. INCOMPLETE**; only A can close the desktop PDF registration blocker. Historical owner FAIL, manual repair/reboot PASS, normal lifecycle evidence and strict profile/peer FAIL receipts remain intact. PR #13 stays Draft, with no merge or Store submission.
