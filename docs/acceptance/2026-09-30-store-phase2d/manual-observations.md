# Owner observations — Phase 2D

Every row starts UNVERIFIED. Only explicit owner observations may change these GUI rows. Use PASS, FAIL, PARTIAL or UNVERIFIED, with date and an observation or screenshot reference. Automated package/state/file inventories are separate. Do not infer these rows from Phase 2C or Server CI.

| ID | Required observation | Result | Owner confirmation / evidence |
| --- | --- | --- | --- |
| A1 | Published NSIS Full Installer completes and appears in Windows installed apps; record version separately | PASS | 2026-09-30 owner: “NSIS 安裝完畢，能打開，能用…設定 → 應用程式 → 已安裝的應用程式 則見到”; actual registry/executable version 0.4.1 verified separately |
| A2 | NSIS can be opened and its window is usable | PASS | Same explicit owner confirmation: “能打開，能用” |
| A2a | NSIS Start entry is available | PASS | Owner initially could not find it, then corrected: “沒事了，是我看錯”; [read-only shortcut/Start diagnostic](nsis-start-diagnostic.json) matches; no repair |
| A3 | Record the current PDF reader by normal double-click before Store install | PASS | 2026-09-30 owner: “adobe”; current registry still says FoxitReader.Document, and both observations are retained |
| A4 | NSIS Open With opens the synthetic PDF in its PDF workspace | PASS | Same owner reply: “再右鍵 → 開啟檔案／Open with → 選 NSIS「快轉通 SwiftLocal／SwiftLocal」且僅此次也沒問題”; app was closed before the final A snapshot |
| B1 | Signed 1.0.0.0 installs through App Installer after both signatures verify | PASS | 2026-09-30 owner reply to the exact signed-copy/App Installer question: “安裝 Store 1.0.0.0成功，沒問題”; both signatures verified before installation |
| B2 | NSIS and Store both launch independently with their own profiles | UNVERIFIED | Pending |
| B3 | Explorer Open With shows both registrations; record exact visible labels | UNVERIFIED | Do not hide two indistinguishable SwiftLocal labels |
| B4 | Select each entry once and confirm the correct channel opens the PDF | UNVERIFIED | Pending |
| B5 | Normal PDF double-click still uses the recorded default reader | UNVERIFIED | Pending |
| B6 | Store theme, saved media preset and configured Downloads output are visible; open real seeded PDF output | UNVERIFIED | [Automated real-product seed and output validation PASS](b-before-update.md); owner observation has not been supplied |
| C1 | App Installer offers/completes 1.0.0.0 -> 1.0.1.0 UPDATE, with no intervening uninstall | PASS | 2026-09-30 owner reply to the explicit GUI update/no-uninstall question: “更新了，完全沒問題”; event 855 update list and event 400 success corroborate in-place update |
| C1a | Step 4A: do not launch either app before the immediate update snapshot | FAIL | Owner subsequently confirms “我手動開啟”; process sampling observes updated SwiftLocal at 17:08:38 +08:00. [Audit](step4a.md) preserves the control failure; no data loss observed |
| C2 | Updated Store launches normally and previous theme/preset/output preference remain | PARTIAL | Owner confirms manual launch, but does not separately confirm the complete UI/preference row. Offline durable preferences are retained; required prelaunch timing was missed |
| C3 | The pre-update user output still opens and has real content | UNVERIFIED | Also compare exact hashes |
| C4 | Representative PDF, chi_tra+eng OCR, searchable PDF, DOCX->PDF, PDF->DOCX and media outputs work | UNVERIFIED | Inspect/open/play outputs; automated smoke separately |
| C5 | NSIS still launches normally after the Store update | UNVERIFIED | Pending |
| C6 | Both Explorer Open With entries still open their correct channel; default unchanged | UNVERIFIED | Pending |
| R1 | Where practical, GUI-uninstall NSIS while Store remains installed | UNVERIFIED | Record any untested direction explicitly |
| R2 | Store launch/settings/output/default/PDF registration survive NSIS removal | UNVERIFIED | Use separate pre-reverse checkpoint and inventories |
| R3 | Reinstall the same published NSIS Full Installer; both channels remain usable | UNVERIFIED | No migration/reset of existing personal state |
| D1 | GUI uninstall Store 1.0.1.0 through Settings completes | UNVERIFIED | Pending |
| D2 | Store package and its Start entry disappear; NSIS stays installed | UNVERIFIED | Pending |
| D3 | Store Open With entry disappears; NSIS Open With remains and works | UNVERIFIED | Pending |
| D4 | Normal PDF double-click retains the original reader | UNVERIFIED | Pending |
| D5 | All normal user outputs remain and can be opened | UNVERIFIED | Do not delete user output |
| D6 | NSIS still launches normally after Store removal | UNVERIFIED | Pending |

Optional downgrade: UNVERIFIED. If attempted, record ordinary Windows rejection or acceptance and exact error; never force/bypass version rules. Private/virtualized state retention/deletion and NSIS file/state integrity are measured in the automated inventories, not assumed from these GUI rows.

The owner subsequently asked the agent to use computer-use for independent GUI checks. The agent double-clicked the exact baseline signed-copy entry in Explorer and observed returned App Installer and Store-app windows; this was not claimed as an agent-performed installation. Before App Installer state could be captured, the owner pressed physical Escape and the tool reported Computer Use stopped. No further Computer Use inputs were issued in that turn. The owner's separate installation-success reply above is the basis for B1 PASS. Agent GUI observations will remain attributed separately from owner confirmations.
