# Owner observations — Phase 2D

Every row starts UNVERIFIED. Only explicit owner observations may change these GUI rows. Use PASS, FAIL, PARTIAL or UNVERIFIED, with date and an observation or screenshot reference. Automated package/state/file inventories are separate. Do not infer these rows from Phase 2C or Server CI.

| ID | Required observation | Result | Owner confirmation / evidence |
| --- | --- | --- | --- |
| A1 | Published NSIS Full Installer completes; Windows installed-app version is 0.4.1 | UNVERIFIED | Pending |
| A2 | NSIS alone launches from ordinary Windows UI and its main window works | UNVERIFIED | Pending |
| A3 | Record the current PDF reader by normal double-click before Store install | UNVERIFIED | Phase 2C observed Adobe; current registry says FoxitReader.Document; measure this cycle |
| A4 | NSIS Open With opens the synthetic PDF in its PDF workspace | UNVERIFIED | Pending |
| B1 | Signed 1.0.0.0 installs through App Installer after both signatures verify | UNVERIFIED | Pending |
| B2 | NSIS and Store both launch independently with their own profiles | UNVERIFIED | Pending |
| B3 | Explorer Open With shows both registrations; record exact visible labels | UNVERIFIED | Do not hide two indistinguishable SwiftLocal labels |
| B4 | Select each entry once and confirm the correct channel opens the PDF | UNVERIFIED | Pending |
| B5 | Normal PDF double-click still uses the recorded default reader | UNVERIFIED | Pending |
| B6 | Store theme, saved media preset and configured Downloads output are visible; open real seeded PDF output | UNVERIFIED | Automated real-product seed is not an owner observation |
| C1 | App Installer offers/completes 1.0.0.0 -> 1.0.1.0 UPDATE, with no intervening uninstall | UNVERIFIED | Preserve error text/activity ID if rejected |
| C2 | Updated Store launches normally and previous theme/preset/output preference remain | UNVERIFIED | Read-only retention measurement precedes smoke |
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
