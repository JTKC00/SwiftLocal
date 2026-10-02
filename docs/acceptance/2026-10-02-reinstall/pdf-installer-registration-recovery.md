# Installer-driven Windows PDF registration recovery

2026-10-02 status: **C. INCOMPLETE**. This isolated gate has not executed an uninstall or reinstall. It does not close the desktop PDF registration blocker.

The earlier [manual host repair and reboot persistence](pdf-openwith-host-repair.md) remain historical PASS results for a **manual Codex registry repair**. The earlier owner Open With FAIL remains unchanged. None of those results proves installer-driven registration recovery. The cause of the earlier missing registration remains UNVERIFIED.

## Exact candidate

Use the already accepted fixed NSIS candidate, without rebuilding or changing version:

- Artifact: `store-evidence/verify-2026-10-02/dist-full/SwiftLocal-0.4.1-full-installer-x64.exe`
- SHA-256: `4192e17a3dadc49d15afed29a841be66d1820f8ffcde539ca3527bfd17ad228e`
- Size: `802528284` bytes
- Independently rehashed during gate preparation. Its hash must also match in the actual-host baseline and immediately before installer launch.

## Preparation and current limit

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
