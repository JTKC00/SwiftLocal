# Home Windows PC continuation — preserve the work-PC cycle

Source/evidence checkpoint: `1998b4136eaacaf7e7efba05e4ca307f7ca03a7a`, branch `store/msix-readiness`, Draft PR [#13](https://github.com/JTKC00/SwiftLocal/pull/13). All tracked files at that checkpoint are pushed. The owner intends to delete the work-PC checkout and this chat, then continue on a home Windows computer. This document records the boundary; it does not authorize deleting profiles, outputs, signing keys or certificates.

## Current work-PC evidence

Phase 2B BLOCKER FIXED, Phase 2C PASS, Step 3 PASS. Overall **C. PHASE 2D INCOMPLETE**. [Step 4A PARTIAL](step4a.md): real same-identity update 1.0.0.0 -> 1.0.1.0 and durable state/output/NSIS integrity pass, but the owner manually launched the updated app before the requested first-launch snapshot. Preserve that control failure; do not reinterpret it as PASS.

Work PC currently has Store `JTKC.SwiftLocal_1.0.1.0_x64__j44a9ewx73faj` and published NSIS v0.4.1 installed, both closed at the final receipt. Actual AppData profiles, normal Downloads outputs, the original temporary private key and public machine trust remain outside the checkout. Deleting the checkout/chat does not remove or transfer those machine states. No native/update smoke, deep-path test, uninstall or certificate cleanup has run.

## What Git does and does not preserve

Git preserves source, acceptance helpers, sanitized evidence, exact recorded hashes, installed manifest and owner/deployment/process observations. It intentionally excludes the unsigned/signed AppX files, raw inventories, signing receipt/public DER, synthetic local fixtures and downloaded published NSIS installer. Do not commit or upload raw personal-path evidence, certificate material or passwords to GitHub. Never export the private key.

A private file handoff is prepared outside the checkout under `%USERPROFILE%/Downloads/SwiftLocal-Phase2D-handoff-20260930-175319`. Only a **PASS** `handoff-manifest.json` together with completed copy/hash verification establishes its completion. The handoff preserves exact frozen/update/rejected-attempt AppX files, both signed test copies, raw Phase 2D evidence/signing receipts, fixtures, published NSIS installer/checksums and the existing SDK tools. Every copied file is compared with its source SHA-256. Two extracted payload directories are omitted as recoverable duplicates of retained exact AppX archives. No source is deleted and no private key is exported.

This private handoff is local to the work PC. The owner must transfer it privately (for example, a USB drive or their own private file storage) to use those artifacts at home. A Git clone does not download it. It contains additional public certificate/signed test copies that must be accounted for during final cleanup, separately from user outputs.

## Safe home-PC continuation

1. Clone the repository and use `store/msix-readiness`. Read this handoff, [Step 4A audit](step4a.md), [acceptance ledger](README.md) and [readiness history](../../MICROSOFT_STORE_MSIX_READINESS.md). Keep PR Draft; no Store submission, merge, v0.4.2 or published Release modification.
2. First inspect the home environment: Windows 11 edition/build and x64, physical/VM, user type, existing NSIS/Store installations and PDF default. Do not assume the work-PC installed package, registry, profiles or file hashes exist at home.
3. Treat home as a **new controlled machine cycle**. Keep work-PC raw evidence immutable, and use separate home inventories/config/state-baseline paths. Do not copy the work-PC application profile into home or invent migration. The earlier no-reinstall/no-reseed instructions protected the existing work-PC baseline; they are not proof that any baseline exists at home. Establish any missing home baseline under the owner's explicitly authorized continuation, preserving existing personal data and installations.
4. Reuse the exact retained artifacts and verify hashes/identity before any action. Unsigned baseline: `38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404`. Unsigned update fixture: `d737b781d16e0b9b6dd23e876626df1095756816c6527a11945ff30c96fc4e4a`. Published NSIS Full: `3e930e523f3746e92bc9a05277a208491186c1563dabffd1e07d3c973bc30a40`. Do not rebuild or silently substitute packages.
5. Both retained signed test copies use certificate `30E81230B7C3CCB8D19D5D6A67F975DDB8D93450`, exact Publisher subject, expiry **2026-10-05 13:31:23 +08:00**. The home machine may trust its public certificate for local testing after identity/signature checks; no private key is required merely to install the existing signed copies. The non-exportable private key remains on the original work-PC account. If a retained signature is no longer valid, stop and record a changed signing cycle; never silently regenerate/re-sign.
6. Owner GUI installation/update confirmations remain required. For a fresh home update cycle, disable App Installer's launch option and do not manually launch after updating until the before-first-launch snapshot and offline comparisons are complete. Preserve any missing control/evidence rather than silently resetting or repeating the cycle.
7. Cleanup remains pending. Later authorized cleanup must account for home public trust, the original work-PC temporary trust/key, original test copies and additional copies in this private handoff. Cleanup must preserve normal user outputs and measured application residue. Do not export the work-PC private key to make cleanup or transfer easier.

No home-machine PASS is inferred from this work-PC evidence. The next agent must report the new cycle independently and retain all earlier history.
