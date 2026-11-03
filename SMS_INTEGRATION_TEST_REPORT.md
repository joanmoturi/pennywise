# SMS migration implementation and acceptance report

**Historical snapshot:** this report records the November 2 source-migration state. Its missing-toolchain/build/device statements below describe that earlier checkpoint, not the current environment. See `ANDROID_BUILD_AND_DEVICE_REPORT.md` for the subsequent successful APK build, 27 JVM/13 emulator instrumentation results, actual emulator SMS/file/receipt acceptance and remaining physical-device limitations.

**Date:** November 2, 2026. **Baseline:** local commit `4735052`.

**Implemented locally; PWA checks passed. Android build, native tests, installation and actual SMS reception are BLOCKED/UNVERIFIED.** This is not a claim that the complete Android acceptance standard has been met. No GitHub push, Cloudflare deployment, release or APK publication was performed.

## What changed and what was preserved

Replaced `CaptureService`/NotificationListenerService with a protected manifest `SMS_RECEIVED` receiver. Removed notification-access settings, app-package discovery and competing notification ingestion. Retained modular parsers, the same native SQLite layout/Keystore code, pending candidate identities, dedup/reference receipts, bounded private sharing and recovery.

The PWA's visual design, financial schema **4**, IndexedDB store/version, Inbox, account mapping, approval rules, posting/accounting safeguards, reversals, corrections, encrypted backup/restore and existing tests were retained. Its only production-source change is optional `senderId` metadata in the existing strict candidate schema. Historical batch/receipt/worker identifiers stay unchanged; no backend or dependency was added to the application. No personal financial workspace was opened or modified. Engineering Academy was not changed.

Native configuration version 1 migrates paused/disabled without inferring an SMS sender from an application package. Parser labels are preserved, including a nonconflicting default for the new optional account/channel label. Old queued candidates stay readable; new sender sources require explicit PWA mappings. Native app version is 0.2.0/code 2; compile/target 35 and minimum 28 were not reduced.

## Implemented acquisition, filtering and status

- Runtime permission: **android.permission.RECEIVE_SMS** only. The retained normal **ACCESS_NETWORK_STATE** permission blocks online Sharesheet sends.
- The receiver's **BROADCAST_SMS** permission is a system-sender restriction, not a permission requested by the app. No READ_SMS, default-SMS role, notification listener, Internet, contacts, call logs or accessibility.
- Manual sender add/edit/remove/disable, exact canonical matching and actual detected sender display. Case/phone formatting normalization does not guess country prefixes or collapse distinct alphanumeric punctuation.
- Platform PDU decode obtains addresses; all senders must pass before bodies are accessed. Framework-order multipart assembly, format/size/timestamp checks, bounded background work, permission/revision rechecks and stable fingerprint dedup.
- No historical provider query or cross-broadcast raw-body accumulator. No unrelated-body storage or logs. First-unlock/private-storage gating remains; ordinary process recreation preserves SMS consent.
- Dashboard exposes permission/processing state, allowlist, processed/pending/receipt-confirmed counts, last successful candidate-processing time and fixed failure counters. Pause and source disabling stop eligible commits.

## Local handoff and rules

Private local JSON file selection remains the portable default; offline Sharesheet/Web Share Target remains optional. A missing worker cannot intercept an online POST, so the existing no-active-network gate and throughout-handoff offline requirement remain mandatory. No cloud synchronization or automatic background PWA delivery is claimed.

Candidates remain pending until the user imports the PWA's own receipt and confirms exact ID/fingerprint matches. Failed/unmatched receipts do not delete data. A new counter distinguishes receipt-confirmed imports from historical manual acknowledgements. Confirmation proves inbox persistence, not ledger approval; receipts are not signed. Conflicting update identities absent from the current PWA receipt remain retryable rather than being silently acknowledged.

Rules still require explicit trusted-file evaluation, a unique trusted source/account mapping and a constrained enabled rule. Missing/low-confidence/conflicting/unsafe financial candidates cannot bypass the existing posting checks. No transfer becomes income/spending, no principal repayment becomes earned income, and balance-only/failed messages cannot post.

## Executed automated results

| Check                                                 | Actual result                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                | PASSED                                                                                                                                                     |
| `npm run lint`                                        | PASSED                                                                                                                                                     |
| `npm test`                                            | **148 passed**, 6 files, 0 failures                                                                                                                        |
| Notification/SMS contract scenarios within that suite | **47 passed**: original 44 plus 3 SMS metadata/mapping/backup compatibility cases                                                                          |
| `npm run build`                                       | PASSED: TypeScript, Vite and custom Workbox worker                                                                                                         |
| `npm run test:e2e`                                    | **20 passed**, 10 desktop + 10 Pixel 7 Chromium-emulated cases, 0 failures                                                                                 |
| Native manifest/XML assertions                        | PASSED: exact two requested permissions, protected SMS receiver, no listener, backups/direct boot disabled, unchanged SDK settings; **4 XML files parsed** |
| Native source boundary assertions                     | PASSED: sender gate precedes message-body access; revision checks/finalization present; no old listener/history API/logging calls                          |
| Kotlin syntax-only parse                              | **11 Kotlin source files parsed, 0 syntax diagnostics**; receipt API confirmed as an object member                                                         |
| Git whitespace check                                  | PASSED                                                                                                                                                     |

One initial targeted run had **1 failed / 46 passed** because a newly added test treated the serialized backup string as a state object. The test was corrected to use the existing `decodeBackup`; the final full run passed all 148. No financial safeguard or test was disabled.

The browser suite again exercised offline multipart share interception with **zero server POSTs**, retained pending/retry behavior, account/rule UI, schema-3 recovery, encrypted independent restore/corruption rejection, offline ledger workflows, no external data requests in exercised paths and update preservation. These are isolated browser simulations, not native Android evidence.

Existing nonfatal Zod annotation and approximately 523 KB application-bundle warnings remain visible. No forced package upgrade or dependency-manifest change was introduced.

Kotlin syntax checks used an isolated temporary tree-sitter parser, not a Kotlin compiler. XML/source assertions and syntax parsing do **not** establish Android type correctness, lint, crypto behavior or test execution. They found and corrected source/API placement issues during implementation; native compilation is still required.

## Native test inventory: authored, NOT executed

| Suite                    | Count  | Coverage authored                                                                                                                                                                                                                                                                          |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JVM `CoreTest.kt`        | **27** | Existing arithmetic/security/parsers plus allowed/unapproved/disabled sender gates, normalization/ambiguity, multipart GSM/CDMA text assembly, malformed/invalid time/unsupported encoding, permission denial/revocation gate, repeated-broadcast fingerprints and explicit SMS categories |
| Android `StorageTest.kt` | **13** | Existing crypto/tamper/private-provider/queue tests plus persisted SMS consent, legacy parser migration, exact receipt acknowledgement/retry and sender/account recovery metadata                                                                                                          |

**0 native tests executed; neither suite is reported passed.** Reopening a store in an authored test is not a verified Android process restart; pure multipart tests do not verify actual telephony PDU ordering or physical carrier delivery.

## Android environment and build result

`java`, `gradle`, `adb`, `sdkmanager` were unavailable on PATH; JAVA_HOME, ANDROID_HOME and ANDROID_SDK_ROOT were unset. Bounded probes found no Android Studio JBR, Microsoft/Eclipse JDK, default SDK platform-tools, Build Tools 34.0.0 or platform android-35. No Gradle wrapper exists.

An Android Gradle build command was attempted and **could not start: `gradle` was not recognized**. This is a missing-environment blocker, not a successful build or an observed Kotlin compilation failure.

Required installation/setup commands, license review, verified Gradle download, SDK installation and APK permission inspection are in `ANDROID_COMPANION_GUIDE.md`. No JDK/Android SDK/Gradle was installed globally, no SDK licenses were automatically accepted and no target SDK was lowered.

After deliberate setup, run from `C:\Users\joanmoturi\pennywise\android-companion`:

```powershell
gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
# On an isolated, unlocked emulator/test device:
gradle --no-daemon :app:connectedDebugAndroidTest
```

**APK built: NO. APK manifest inspected: NO. Emulator installation verified: NO. Physical Android installation/SMS tested: NO.** Crypto/Keystore tests, protected broadcast delivery, runtime permission denial/revocation, actual restart, screen relock, OEM restrictions and real Android Sharesheet routing remain unverified.

The matching Inbox-capable PWA revision is also local only; production remains unchanged. Actual phone-to-PWA acceptance requires a trusted secure installation of the matching PWA, or a separately authorized deployment. Nothing in this task authorizes that deployment, and the old live application must not be presented as SMS-ready.

## Parsing and security limits

The existing M-Pesa/Equity/KCB/generic modules use synthetic labelled formats only, not invented bank prose. Explicit types cover received/sent/paybill/till, credits/debits, transfers, independent charges, loan recovery/liability settlement, coupon/principal, reversal and failed/balance-only cases. Money lent/borrowed and owned-account transfers still need explicit account/relationship classification; origin alone never establishes income.

An optional account/channel field is extracted only when explicitly labelled. Missing fee/balance/date values are not invented. Fully explicit consistent labelled fields score 95; incomplete/ambiguous/failed/reversal cases score 35. These are deterministic scores, **not measured parser accuracy**. Real financial SMS formats and language/provider variants are unverified and generally unsupported until privacy-safe synthetic equivalents are implemented and tested.

Known OTP/PIN/password/login wording and unmatched text are excluded. Raw retention is off by default and bounded/optional. Existing Keystore/AES-GCM protection code is retained, but its Android encryption tests have not run; no encryption certification is claimed. PWA IndexedDB and transfer files have their documented at-rest/plaintext limitations.

RECEIVE_SMS is **hard-restricted**, requiring installer allowlisting as well as a user grant. An installer/device policy may make direct reception unavailable. No shell permission grants, hidden APIs, notification workaround, SMS-provider access or role spoofing is used. Sender IDs/files/receipts are spoofable, not signed bank records. Force-stop, pre-unlock downtime, queue saturation and delivery suppression can lose captures; no history backfill is possible.

## Changed files

| Area                        | Files                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Acquisition                 | Added `android-companion\app\src\main\java\ke\pennywise\companion\SmsReceiver.kt`; removed `CaptureService.kt`; updated `CompanionApp.kt`, `Core.kt`, `MainActivity.kt`, `JsonCodec.kt`, `QueueStore.kt` in that directory                                   |
| Android configuration/tests | `android-companion\app\src\main\AndroidManifest.xml`; `android-companion\app\build.gradle.kts`; `android-companion\app\src\test\java\ke\pennywise\companion\CoreTest.kt`; `android-companion\app\src\androidTest\java\ke\pennywise\companion\StorageTest.kt` |
| PWA compatibility/tests     | `src\notification-schema.ts`; `tests\notifications.test.ts`                                                                                                                                                                                                  |
| Current guides              | `ANDROID_COMPANION_GUIDE.md`; new `SMS_INTEGRATION_GUIDE.md`, `SMS_PRIVACY_AND_SECURITY.md`, this report; updated `TRANSACTION_PARSING_REFERENCE.md`, `APPROVAL_RULES_GUIDE.md`                                                                              |
| Entry/legacy documentation  | `README.md`; `android-companion\README.md`; `NOTIFICATION_INTEGRATION_GUIDE.md`, `NOTIFICATION_PRIVACY_AND_SECURITY.md` compatibility pointers; `NOTIFICATION_INTEGRATION_TEST_REPORT.md` explicitly historical                                              |

All work stays in the standalone Pennywise repository. The local migration commit contains this report; use `git log -1 --oneline` for its exact hash. Nothing is pushed or deployed.

## Acceptance status and test sequence

**Implemented:** SMS acquisition source, sender controls, parser reuse, queue/status/receipt workflow and compatible Inbox metadata.

**Automatically tested:** PWA financial/regression/backup/offline scenarios, manifest/source assertions and Kotlin syntax only.

**Verified on Android:** none.

**Remaining gate:** install the documented tools; compile/run native suites and lint; inspect the built manifest; install privately on an isolated permitted device; grant through the real prompt; test new allowed/disabled/unapproved synthetic multipart SMS, duplicates, malformed input, permission revocation/restart/offline capture, file import and exact receipt return. Then validate real-provider formats privately without committing personal messages. Full setup and your-own-sender steps are in `ANDROID_COMPANION_GUIDE.md`.

The earlier broader financial audit remains unfinished, and this migration does not claim to resolve the previously reported phone hang.
