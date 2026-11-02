# Pennywise SMS companion

Native Kotlin companion, migrated from local commit `4735052`. The notification listener has been removed. The existing parser modules, private queue, deduplication, file handoff and recovery remain; no financial ledger is implemented here.

**Source implemented, Android build/device acceptance unverified. No APK is provided.** See `..\SMS_INTEGRATION_TEST_REPORT.md` for exact executed checks and blockers.

## Platform and permissions

- Minimum API 28; compile/target API **35 unchanged**.
- AGP 8.7.3, Kotlin 2.1.20, Gradle 8.9, JDK 17; AGP's default Build Tools 34.0.0.
- Version 0.2.0/code 2; application ID remains `ke.pennywise.companion`.
- Requested permissions: `RECEIVE_SMS` (runtime, new broadcasts only) and `ACCESS_NETWORK_STATE` (normal, offline share gating).
- The exported SMS receiver requires the system sender's `BROADCAST_SMS` permission. This is a component restriction, **not** a permission requested by the companion.
- No `READ_SMS`, Internet, sending SMS, notification-listener, contacts, call-log, accessibility or default-SMS role.

`RECEIVE_SMS` is hard-restricted: Android's installer must allowlist it before the user can grant it. Device/installer policy may prevent this. Do not bypass that restriction or use hidden APIs; leave capture paused. RCS, MMS, app messages and SMS history are unsupported.

## Setup/build

Exact Windows installation, SDK/license and checksum-verified Gradle setup commands are in `..\ANDROID_COMPANION_GUIDE.md`. There is no Gradle wrapper, and this migration did not install global tooling or accept licenses.

With prerequisites installed:

```powershell
Set-Location 'C:\Users\joanmoturi\pennywise\android-companion'
gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
# Only on an isolated, unlocked test emulator/device:
gradle --no-daemon :app:connectedDebugAndroidTest
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r '.\app\build\outputs\apk\debug\app-debug.apk'
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\apkanalyzer.bat" manifest permissions '.\app\build\outputs\apk\debug\app-debug.apk'
```

Grant SMS permission through the app's Android permission prompt, not shell grants. Configure a secure device PIN/password and unlock once after boot. Explicitly add and enable intended SMS sender IDs, then **Resume future capture**. No historical catch-up occurs. Ordinary process restarts preserve SMS consent; observed permission loss pauses capture. Force-stop/OEM restrictions can prevent delivery.

Existing version-1 source configurations migrate paused/disabled with their parser labels retained. Old application packages are **not** inferred to be SMS senders. Edit a retained configuration to choose a sender; its new hashed SMS source needs an explicit PWA account mapping. Old queued candidates, reference receipts and source identities remain intact.

## Capture and transfer

`SmsReceiver.kt` receives protected `SMS_RECEIVED` broadcasts. `Core.kt` provides normalization, multipart validation, pure capture gates and the existing parser modules. `CompanionApp.kt` owns consent/revision checks. `QueueStore.kt` retains the same SQLite layout and transaction/idempotency behavior.

Framework PDU decoding is necessary to obtain addresses. Every part's sender is checked before accessing bodies. Only one enabled canonical sender may match. Multipart text is joined in telephony-delivered order inside one broadcast; no cross-broadcast raw-body cache is created. Malformed/unsupported input fails closed; SMS service-centre time is not a transaction timestamp.

The initial parsers are **synthetic labelled formats**, not production M-Pesa/Equity/KCB prose:

```text
SYNTHETIC|Amount=123.45|Currency=KES|Ref=TEST001|Date=2026-11-02T18:00:00Z|Direction=credit|Kind=received|Party=TEST sender|Fee=0|Balance=900.10|Account=TEST wallet
```

No sample is saved by **Test sample locally (no queue write)**. See `..\TRANSACTION_PARSING_REFERENCE.md` for categories, exact minor-unit arithmetic and limitations.

Save private JSON and choose it in the PWA Transaction Inbox, or use Sharesheet **completely offline** after priming the installed PWA. No automatic synchronization is claimed. Shared/saved candidates remain pending. Download the PWA's local receipt, import it through **Import Pennywise confirmation receipt**, and confirm exact ID/fingerprint matches. This confirms inbox import, not ledger approval; receipts are not cryptographically signed.

The existing Keystore/AES-GCM protection code is retained, with fresh IVs and record-specific authenticated context, no plaintext fallback and Android backup disabled. **Its Android encryption tests have not run here.** Device/storage compromise, spoofable SMS senders and plaintext export providers remain risks. Read `..\SMS_PRIVACY_AND_SECURITY.md`.
