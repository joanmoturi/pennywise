# Pennywise SMS companion

Native Kotlin companion, migrated from local commit `4735052`. The notification listener has been removed. The existing parser modules, private queue, deduplication, file handoff and recovery remain; no financial ledger is implemented here.

**Debug APK built; 27 JVM and 13 API-35 emulator instrumentation tests passed.** Emulator SMS reception and the explicit native-file/local-desktop-PWA/receipt loop were verified. Physical phones and Android browser Sharesheet routing remain unverified. See `..\ANDROID_BUILD_AND_DEVICE_REPORT.md` for the APK location, checksum, evidence and limits. The APK is not published.

## Platform and permissions

- Minimum API 28; compile/target API **35 unchanged**.
- AGP 8.7.3, Kotlin 2.1.20, Gradle 8.9, JDK 17; AGP's default Build Tools 34.0.0.
- Version 0.2.0/code 2; application ID remains `ke.pennywise.companion`.
- Requested permissions: `RECEIVE_SMS` (runtime, new broadcasts only) and `ACCESS_NETWORK_STATE` (normal, offline share gating).
- The exported SMS receiver requires the system sender's `BROADCAST_SMS` permission. This is a component restriction, **not** a permission requested by the companion.
- No `READ_SMS`, Internet, sending SMS, notification-listener, contacts, call-log, accessibility or default-SMS role.

`RECEIVE_SMS` is hard-restricted: Android's installer must allowlist it before the user can grant it. Device/installer policy may prevent this. Do not bypass that restriction or use hidden APIs; leave capture paused. RCS, MMS, app messages and SMS history are unsupported.

## Setup/build

Exact Windows setup and private installation steps are in `..\ANDROID_COMPANION_GUIDE.md`. Official user-local tools were installed after explicit SDK-license consent. The included Gradle 8.9 wrapper pins its distribution checksum; the wrapper JAR was checked against Gradle's official checksum. No global PATH or SDK settings were changed.

With prerequisites installed:

```powershell
Set-Location 'C:\Users\joanmoturi\pennywise\android-companion'
. .\tools\Use-AndroidToolchain.ps1
.\gradlew.bat --no-daemon --console=plain clean :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
# Only on an isolated, unlocked test emulator/device:
$env:ANDROID_SERIAL = 'emulator-5560' # List devices and replace deliberately.
.\gradlew.bat --no-daemon --console=plain :app:connectedDebugAndroidTest
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s $env:ANDROID_SERIAL install -r '.\app\build\outputs\apk\debug\app-debug.apk'
& "$env:ANDROID_HOME\cmdline-tools\19.0\bin\apkanalyzer.bat" manifest permissions '.\app\build\outputs\apk\debug\app-debug.apk'
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

The local harness requires explicit manual-redaction confirmation, disables sample saved state/autofill, requests no personalized keyboard learning, clears input after testing/dismissal and never writes to the queue. No sample is saved by **Test sample locally (no queue write)**. Keyboard/clipboard privacy remains the user's responsibility. See `..\TRANSACTION_PARSING_REFERENCE.md` for categories, exact minor-unit arithmetic and limitations.

Save private JSON and choose it in the PWA Transaction Inbox, or use Sharesheet **completely offline** after priming the installed PWA. No automatic synchronization is claimed. Shared/saved candidates remain pending. Download the PWA's local receipt, import it through **Import Pennywise confirmation receipt**, and confirm exact ID/fingerprint matches. This confirms inbox import, not ledger approval; receipts are not cryptographically signed.

The existing Keystore/AES-GCM protection code is retained, with fresh IVs and record-specific authenticated context, no plaintext fallback and Android backup disabled. **Crypto round-trip/tamper/storage tests passed on the API-35 emulator**, not physical hardware or every Android version. Device/storage compromise, spoofable SMS senders and plaintext export providers remain risks. Read `..\SMS_PRIVACY_AND_SECURITY.md`.
