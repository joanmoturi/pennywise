# Cross-device sync test report

Date: November 15, 2026. Feature branch: `feature/encrypted-cross-device-sync`.
This reports local automated evidence, not a real-account or production rollout.

## Evidence

| Check                                                                       | Actual result                                                                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Full unit/integration suite including all 8 sync cases                      | 291 passed, 19 files                                                                                                        |
| Focused sync engine suite after post-apply edit-race regression             | 8 passed                                                                                                                    |
| Firestore SDK + actual rules on official isolated emulator                  | 4 passed                                                                                                                    |
| Full desktop/Pixel 7 browser suite, synthetic sync configuration            | 62 passed; 2 disabled-build-only cases intentionally skipped                                                                |
| Focused desktop/Pixel 7 sync journeys after the edit-race fix               | 4 passed; 2 disabled-build-only cases intentionally skipped                                                                 |
| Google/sync-disabled desktop/Pixel 7 fallback suite                         | 8 passed; 4 configured-sync-only cases intentionally skipped                                                                |
| TypeScript, ESLint, Prettier, configured and unconfigured production builds | Passed                                                                                                                      |
| Runtime npm audit after patched gRPC override, before final checks          | 0 vulnerabilities                                                                                                           |
| Latest audit refresh                                                        | Incomplete: configured registry returned HTTP 429; public npm registry TLS handshake failed. Not a fresh clean-audit claim. |

The earlier complete dependency audit also reported 23 development-only
advisories (2 low, 21 moderate), largely in the additional Firebase CLI toolchain.
No forced major-version audit repair was applied. A current complete audit must
be rerun from an environment with working registry access before release.
Firebase CLI warns that its `superstatic` dependency lists Node 20/22/24 while
local Node is 26.13.0; the local CLI/emulator checks completed successfully.

## What is actually exercised

`tests/workspace-sync.test.ts` uses real browser cryptography and separate
IndexedDB repositories with an injected remote contract. Coverage includes
explicit initial linking, authenticated encryption and context binding,
independent-device propagation without audit echo, divergent-edit conflicts,
encrypted safety exports, wrong passphrases, other-owner binding, damaged
ciphertext, offline/quota failures, pause, non-persistence of secrets,
compare-and-swap races, open-form deferral, stale review, payload size limit,
legacy cloud-backup compatibility and edits committed immediately after apply.

`tests/workspace-sync.rules.ts` uses the real modular Firestore adapter with the
official Firestore emulator, local mock Google identities and the exact checked-in
rules. Coverage includes owner get/write, unauthenticated/other-UID/unverified/
non-Google denial, list and unrelated-path denial, plaintext-field rejection,
chunk size/immutability, malformed heads, multi-chunk integrity, previous-version
retention, grandparent pruning, stale CAS refusal and concurrent writers with
exactly one winner. Java 17 initially failed because Firebase CLI requires Java
21+. A session-local Microsoft JDK21 was used; no machine-wide Java change.

`e2e/workspace-sync.spec.ts` uses actual built UI, controller, WebCrypto,
IndexedDB and independent browser contexts. Only the dynamically loaded Firebase
provider boundary is replaced by a synthetic in-process provider; all external
HTTPS requests are blocked. No production test hooks are added. It covers:
no provider calls before opt-in; disabled setup; explicit initial publishing;
mandatory safety exports/confirmation; second-device local-versus-cloud review;
automatic saved-edit propagation; simultaneous offline changes and explicit
conflict resolution; encrypted cloud payloads; reload locking; incorrect
passphrase; UID-switch rejection; retained local data; mobile fit and file saving.

The first mobile journey exposed a test-helper startup race: it checked the
navigation toggle before the second app finished mounting. Waiting for the app
shell, matching existing helpers, fixed that test without changing navigation.
Later inspection found and fixed a genuine sync marker race: an unrelated local
edit after incoming apply must not become the synchronized base. The focused
regression proves that edit is uploaded by the next run.

The full existing browser suite also verifies financial pages, record edits,
offline app shell and PWA upgrades, backups/restoration, Drive failure and
recovery, CBK lookup, dashboard priorities and backup health. No existing ledger
schema or financial calculation was changed by this work.

## Not validated / release gates

No real Firebase project or Web config was supplied. No cloud resources or rules
were deployed. Real Firebase Google popup/consent, domain authorization, hosted
CSP helper behavior, real cross-device delivery and production quota behavior
remain untested. The owner's earlier real-account test applied to Google Drive,
not this new Firebase sync implementation.

Before enabling for customers: complete owner setup, deploy reviewed rules,
rerun dependency audit, test a real Google account with synthetic financial data
on two physical devices, verify independent safety-file restore and Drive
recovery, monitor quota, and approve a staged release. No claim is made for
Safari/iOS, embedded WebViews, large customer datasets, multi-person ledgers,
unsaved forms in other tabs, continuous closed-app sync, automatic merging,
lost-passphrase recovery or local-at-rest encryption.

The feature remains an isolated branch; live `main` and its deployment were not
updated. See [owner setup](CROSS_DEVICE_SYNC_SETUP.md) and
[architecture / rollback / retention](CROSS_DEVICE_SYNC_ARCHITECTURE.md).
