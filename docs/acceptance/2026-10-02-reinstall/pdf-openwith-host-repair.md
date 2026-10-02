# Windows PDF Open With and installed-app listing repair

2026-10-02: **host repair PASS before reboot; reboot persistence PENDING.** Settings now lists 快轉通 SwiftLocal 0.4.1; Explorer's PDF Open With submenu lists SwiftLocal. Selecting that entry opens the existing one-page `a.pdf` fixture in the installed SwiftLocal PDF workspace. Adobe Acrobat remains the PDF default.

**Actual repair mechanism: Codex manually wrote the missing registry registration through the external Windows host connection. No NSIS installer was executed during this successful repair.** This result does not establish that the fixed NSIS installer automatically restores registration, and does not prove that an old installation state caused the failure.

## Verdict history (append only)

The earlier [owner desktop PDF follow-up](../2026-09-30-store-phase2d-home/owner-desktop-pdf.json) remains **Open With FAIL**. Its historical owner verdict and the agent's missing-menu observation are unchanged. The earlier failed registration experiments and earlier installer/coexistence verdicts are also retained in PR #13.

The new **2026-10-02 host repair PASS** is a separate, later result after manual registry repair. It does not retrospectively turn the owner FAIL into PASS or validate a normal installer lifecycle. A reinstall-only restoration test would be required before attributing this recovery to the fixed NSIS candidate or concluding that the earlier failure was caused by stale installation state.

## Finding and correction of earlier evidence

The owner's observation that SwiftLocal was absent from Installed apps exposed different registry contents read through different execution paths. Codex `exec_command` with `require_escalated` could read the NSIS installation and PDF registration, while PowerShell through the already authorized Desktop Commander connection on the same Lenovo PC could not. Both processes reported the same user SID and `GetCurrentPackageFullName=15700` (NO_PACKAGE). WinGet's enumeration and Windows Settings agreed with the external process. The cause of the missing host registration and the precise isolation mechanism remain **UNVERIFIED**; neither old installation state contamination nor MSIX virtualization is a proven cause.

Earlier Codex-side registry/native results do not prove the state visible to Explorer and cannot rule out repairs in the actual Windows registry. The earlier trace captured 5,951 events with zero reported loss, but contained no attributable SwiftLocal rejection and did not exercise the complete chooser. It is retained as diagnostic history.

## Applied repair

Codex invoked `repair-host-registration.ps1 -Action apply` once through the external Desktop Commander PowerShell connection. It completed at 2026-10-02 20:45:30 +08:00 with exit code 0. No NSIS reinstall, production source change or installed payload change occurred in this repair.

Using a manifest copied from the existing, verified NSIS registration, the script manually created four previously absent app-owned HKCU trees:

- `Software\6f69ae82-83d4-59c7-bf3c-6308d8283277`
- `Software\Microsoft\Windows\CurrentVersion\Uninstall\6f69ae82-83d4-59c7-bf3c-6308d8283277`
- `Software\Classes\SwiftLocal.PDF`
- `Software\Classes\Applications\SwiftLocal.exe`

It also manually added one empty REG_NONE `SwiftLocal.PDF` value under the shared `.pdf\OpenWithProgids` key, matching `build/windows-file-associations.nsh`. The manifest describes the values written; its NSIS origin must not be confused with an installer having performed the repair.

The external repair required all four target trees and the shared value to be absent, the expected user SID, and matching installed EXE, ASAR and uninstaller hashes. It preserved a typed registry snapshot in `C:\Users\Lenovo\.codex\backups\Registry_HKEY_CURRENT_USER_Software_Classes_.pdf_2026-10-02T204509+0800.json` before writing. Twelve app-owned key rows were restored. Read-back verified all manifest values and the empty REG_NONE shared value; 623 existing peer/default rows were preserved. The script completed with exit code 0. The viewer test subsequently performs ordinary application launch/cache activity; the zero profile-write claim applies to the registration repair itself.

Manifest SHA-256: `cb8bae22355726080906d9a894cf7e81682becf95ec7cbea01a08b717c3da2c4`. Independently reviewed repair-script SHA-256: `c64ec36a7117ff88fd45e93969176eefaf404cad699ccb5793e0815a9496308a`.

No Capabilities or App Paths were added in this host repair. No further registry experiments are part of the reboot check; that check only observes the repaired state.

## Acceptance evidence

Private evidence is retained under ignored `store-evidence/pdf-openwith-2026-10-02/actual-host-repair/`:

| Criterion | Evidence |
| --- | --- |
| Actual Windows registration repaired | `plan.json`, `backup.json`, `receipt.json`, `registry-before.json`, `registry-after.json` |
| Installed-app listing visible | `gui-acceptance.json`: Settings search SwiftLocal returned one card named 快轉通 SwiftLocal; external `winget list --name SwiftLocal --disable-interactivity` returned the matching ARP GUID and 0.4.1 |
| PDF Open With entry visible | `pdf-openwith-menu-tree.txt`: menu item SwiftLocal, ID 32005; real screenshot inspected |
| Entry opens the intended installed application | `pdf-viewer-tree.txt`: a.pdf, one page, rendered fixture text and loaded status; `external-post-gui.json`: main process launched by Explorer with the fixture path |
| Original default preserved | `external-post-gui.json`: Acrobat.Document.DC and original UserChoice hash retained |
| Native association valid in external view | `native/native-identity-probe-receipt.json`: SwiftLocal recommended handler and installed executable resolved successfully |

The original payload integrity and unrelated Store submission gates retain their separate scope. This repair does not claim a new installer lifecycle, Store installation, coexistence or certification pass.

## Reboot persistence check

**PENDING: no post-reboot PASS is claimed yet.** The original pre-reboot receipts remain unchanged. A separate read-only receipt must show a later Windows boot time, and post-reboot desktop observations must establish all four criteria:

| Required post-reboot criterion | Status |
| --- | --- |
| Installed apps still lists 快轉通 SwiftLocal | PENDING |
| Explorer PDF Open With still lists SwiftLocal | PENDING |
| Selecting the entry successfully opens the one-page PDF fixture | PENDING |
| Adobe Acrobat remains the default, with the original UserChoice retained | PENDING |

The check uses the existing Windows user account. It must not run an installer or write registry values to obtain a PASS. If any criterion fails, record that failure separately and retain the earlier host repair PASS as history.
