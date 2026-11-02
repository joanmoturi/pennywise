# Notification integration implementation and test report

**Historical report for `4735052`, not the current SMS implementation.** Listener-specific setup, permissions and native test counts below describe the earlier source revision only. Current acquisition, permission checks, test evidence and remaining blockers are in `SMS_INTEGRATION_TEST_REPORT.md`; the obsolete listener has been removed.

**Date:** November 2, 2026.

**Status: PWA implementation verified locally; Android companion source implemented, but APK build/install and physical notification capture remain BLOCKED/UNVERIFIED. This is not a completed real-device acceptance certification.**

## Architecture and files

The existing React/TypeScript financial ledger remains authoritative. No parallel ledger, backend, cloud database, login, analytics or AI transaction classification was introduced. Engineering Academy was not modified.

| Area | Implementation |
| --- | --- |
| Domain | `src/notification-schema.ts`; financial schema 4 adds inbox, source mappings, approval rules and transaction provenance |
| Migration/storage | `src/storage.ts`: v1/v2/v3 to v4; same IndexedDB version 3/object store; atomic import/approval/audit; no startup reset |
| Financial rules | `src/notifications.ts`: strict versioned payload validation, identity/content deduplication, conflict retention, exact trusted mappings, deterministic approval and simulation |
| Accounting | `src/engine.ts`: notification relationships and exact linked inverse validation; existing cash/transfer/receivable/liability calculations reused |
| Inbox UI | `src/pages-notifications.tsx`, navigation in `src/App.tsx`: file import, staged-share review, filters, details/corrections, approve/reject/duplicate/conflict reconciliation, mappings/rules/simulation |
| Offline handoff | `src/handoff.ts`, `src/sw.ts`, `vite.config.ts`: injectManifest worker, local POST interception, bounded staging and root-scoped offline precache |
| Recovery | `src/backup.ts`, `src/pages-backup.tsx`: schema-4 complete backups include notification records/configuration/provenance; prior full backups migrate |
| Android | `android-companion`: native Kotlin listener/UI/parsers, encrypted local queue/configuration, offline share gating, private-file fallback, queue recovery and explicit receipt workflow |
| Tests | `tests/notifications.test.ts`, updated backup tests, `e2e/notification-fixture.ts`, expanded `e2e/deployment.spec.ts` |
| Dependencies | Direct `workbox-precaching` / `workbox-routing` 7.4.1 declarations use already locked worker packages; app version 1.2.0 |

Audit findings and payload contract were documented in `NOTIFICATION_INTEGRATION_GUIDE.md` before implementation. Companion build/platform settings are in its README.

## Executed PWA results

| Command/check | Result |
| --- | --- |
| `npm run format:check` | PASSED |
| `npm run lint` | PASSED |
| `npm run test` | **145 passed**, six files; includes all 101 previous tests plus 44 notification scenarios |
| `npm run build` | PASSED, TypeScript + Vite + bundled custom worker |
| `npm run test:e2e` | **20 passed**, 10 desktop + 10 Pixel 7 Chromium-emulated cases |
| Actual offline POST navigation | PASSED; service worker intercepted multipart JSON, staged locally, reopened Inbox and permitted review/posting offline |
| No share-body network fallback | PASSED in the isolated static-host test: server recorded zero POST requests |
| Existing deployment/update/offline regressions | PASSED; manifest/icons/root assets/nested paths and waiting-worker update preserved IndexedDB |
| Independent encrypted full restore | PASSED; corrupt/password/schema rejection and source/target isolation retained |
| UI source mapping / enabled rule | PASSED; schema-3 fixture migrated, existing accounts preserved, trusted exact-sender rule posted once with versioned provenance |

Initial browser failures were fixture issues (a synthetic form underneath fixed navigation, then strict locator selection of a nested select/hidden option). The tests were corrected to simulate normal form submission and select the intended accessible controls; application safeguards were not disabled. All final checks passed in one complete 20-case run.

The production bundle is approximately 523 KB before gzip; Vite's normal chunk-size advisory remains visible. Existing Zod annotation warnings remain non-fatal. The dependency audit still reports 19 development/build entries (2 low, 17 moderate), unchanged from the prior dependency report. No untested forced upgrade was applied.

## Financial safety evidence

Tests independently verify KES 5,000 receipt to the chosen wallet exactly once, KES 2,000 merchant expense plus separately stated charges, KES 10,000 owned transfer with no income/expense, KES 5,000 receivable recovery, KES 100,000 liability-backed borrowing and a KES 3,000 bond coupon linked as investment income.

Full linked expense and loan-recovery reversals retain both events and offset cash/principal. Second reversals, wrong original references, transfer/refund/coupon/principal misclassifications, over-recovery and invalid relationships cannot silently enter the ledger. Complex borrowing/principal/prepaid/reserve/windfall reversals require separate manual reconciliation.

The suite also covers low/missing confidence/fields, currency mismatch, future/actual-time handling, broad incoming-income rules, contradictory rules, disabled-rule simulation, two-account ambiguity, duplicate retries/reference changes, cross-source app/SMS duplication, conflicting updates and explicit resolution, already-entered statement rows, sensitive-text exclusion, backup idempotency, concurrent repository updates and bounded local staging.

## Android build and device status

No JDK, Gradle, Android SDK, `adb` or Kotlin compiler was available in the execution environment. Android environment variables were unset. `gradle --version` failed. Static XML/privacy/source checks were performed by the companion implementation pass; **19 authored JVM tests and 9 authored instrumentation tests were not executed**.

The source specifies Android API 28 minimum, compile/target 35, AGP 8.7.3, Kotlin 2.1.20, Gradle 8.9 and JDK 17. First-unlock credential storage gating permits capture after subsequent screen relock; direct boot and plaintext fallback remain disabled. These are source/static-check results, not device evidence.

**No APK has been built or provided.** Android Kotlin compilation, Android lint, JVM/instrumentation execution, Keystore persistence on a device, listener permission grant/revocation, actual source capture, process-restart recovery, OEM battery restrictions and Android Sharesheet routing are not verified.

When an Android SDK/JDK/Gradle environment is available, follow `android-companion/README.md` and run:

```powershell
Set-Location C:\Users\joanmoturi\pennywise\android-companion
gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Run connected instrumentation only against an isolated test device/emulator after build. Never point tests at a personal financial browser profile or notification archive.

## Parser/rule coverage and remaining limits

Prepared M-Pesa, Equity, KCB and generic adapters use explicitly synthetic fixtures/configurable labels. Real Safaricom/Equity/KCB formats, changing provider text, language variants and parsing accuracy are unverified. Missing previews/unknown formats remain incomplete/manual review. No historical SMS is accessed, and incoming money is never assumed earned income.

Rules support source/type/direction/amount/counterparty/confidence/reference conditions, account/relationship targets, explicit priority, five actions, versions and simulation. Exact account hints distinguish multiple accounts from one institution. Updates to rules/mappings do not rewrite historical ledger postings. Conflicting actions hold even when priorities differ.

Automatic import is an explicit choice on a selected trusted companion file; the JSON is not a cryptographically authenticated bank record. Real two-bank transfer notifications may carry different references. Existing CSV rows without provenance may still need manual reconciliation. Partial/complex reversals and ambiguous fee-inclusion formats are held rather than guessed.

The live Pages origin continues to serve the previously verified application until these changes are pushed/deployed. This report's new notification evidence is **local production-build simulation**, not physical Android or live bank evidence.

## Security findings and user test sequence

No credentials, personal notifications or real financial fixtures were used. OTP/password/PIN content is excluded, raw content is stripped at PWA ingress, and staging/JSON inputs are bounded. The companion uses device-local encryption and no Internet/SMS permission. The PWA's existing IndexedDB is not itself encrypted at rest.

A missing service worker cannot intercept a POST; therefore Sharesheet is offline-only, with local file selection as the portable fallback. Do not send financial payloads to public endpoints or put them in query strings. Queue deletion requires explicit confirmation after verified receipt; chooser completion is not acknowledgement.

1. Download and verify an encrypted full backup of existing Pennywise records before installing/updating anything.
2. Build/test the Android app on the laptop, then install the APK on an isolated test device.
3. Configure one selected package, grant notification access and resume capture. Verify disabled packages and OTPs are ignored.
4. Start with synthetic messages and review-only rules. Inspect amount, reference, direction, timestamp and fees.
5. Save a private JSON file and select it in Transaction Inbox, or prime the installed PWA online and use Sharesheet while completely offline.
6. Map to the correct account, simulate a narrow rule, enable deliberately and import the trusted batch.
7. Verify wallet balance/classification exactly once, retry the same file, and confirm no duplicate.
8. Test unknown/failed/reversal messages, permission revocation and offline process restart before real financial reliance.
9. Export a full encrypted backup and restore into a separate empty test workspace; verify inbox/rules/mappings and ledger.
10. Only after Pennywise displays the expected items, explicitly acknowledge companion receipt; retain external backups.

The earlier broader adversarial financial audit remains a separate unfinished acceptance gate. The reported phone hang was not reproduced in fresh browser contexts and is not claimed fixed by this feature.
