# Pennywise Android companion

Native Kotlin application, independent of the Pennywise PWA. **No production bank-format accuracy or physical-device validation is claimed.** All four initial parser profiles use an explicitly `SYNTHETIC` labelled format; bank names select separate parser modules, not verified bank templates.

**Installation acceptance is BLOCKED:** this directory contains source, not a built APK. No installable artifact has been produced, compiled, installed, or launch-tested in this environment. It does not yet satisfy an “installable Android app” acceptance criterion. Complete the documented build and device validation, including locked-screen capture after first unlock, before claiming that outcome.

## What is implemented

- Programmatic midnight-navy/gold dashboard, master pause, source controls, notification-access settings, review queue, selection/pagination, statistics, privacy controls, explicit handoff and recovery.
- A `NotificationListenerService` with a single bounded background worker (32 waiting callbacks).
- Source-specific `MpesaParser`, `EquityParser`, `KcbParser`, `GenericParser` modules and a bounded literal-label extractor. No downloaded rules or executable/configurable regular expressions.
- AES-256-GCM encrypted queue **and source configuration**, using an AndroidKeyStore key, fresh random IV, and record-specific authenticated context. SQLite transactions protect queue/dedup/receipt mutations.
- FileProvider-style private read-only `content://` provider implemented directly with platform APIs; no AndroidX runtime dependency (only the Kotlin standard library beyond platform APIs).
- Explicit offline Sharesheet handoff; online-capable document-picker fallback, pending recovery import, and user-confirmed receipts.

The only requested app permission is `ACCESS_NETWORK_STATE`, used solely to block online Sharesheet sends. There is **no INTERNET permission, SMS permission, cloud client, analytics, local HTTP server, payload URL, or background synchronization**. The notification service's `BIND_NOTIFICATION_LISTENER_SERVICE` declaration restricts who can bind to it; users grant listener access separately in system settings.

## Build prerequisites and commands

Pinned versions (deliberately not presented as the latest):

| Component | Version |
|---|---|
| Android Gradle Plugin | 8.7.3 |
| Kotlin Android plugin | 2.1.20 |
| Gradle | **8.9** |
| JDK | **17** |
| Compile / target SDK | **35** |
| Minimum Android | **9 / API 28** |
| Unit test dependency | JUnit 4.13.2 |

The requested baseline is AGP 8.7.3 / Kotlin 2.1.20 / Gradle 8.9 / JDK 17. AGP 8.7 release notes specify API 35, Gradle 8.9 and JDK 17. Kotlin was reduced from 2.2.21 because Android's Kotlin metadata support table lists R8 8.10.21 for Kotlin 2.2, versus 8.6.17 for Kotlin 2.1; plugin/Gradle compatibility alone does not establish D8/R8 compatibility. Kotlin's Gradle table lists Gradle 8.9 within the 2.1.20 range but its fully supported AGP range ends at 8.7.2. The requested AGP 8.7.3 patch is retained, not claimed as a fully tested combination. An actual Android build remains required; no compiler or shrinker result is inferred from these tables.

No wrapper executable or wrapper JAR is fabricated or bundled. On a development workstation with JDK 17, Android SDK platform 35 and Gradle 8.9 already installed, run:

```powershell
Set-Location 'C:\Users\joanmoturi\pennywise\android-companion'
# Set these process-local paths to your actual installations:
$env:JAVA_HOME = 'C:\your-tools\jdk-17'
$env:ANDROID_HOME = 'C:\your-tools\android-sdk'
$env:PATH = "$env:JAVA_HOME\bin;C:\your-tools\gradle-8.9\bin;$env:PATH"
gradle --version
gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
# A connected API 28+ emulator/device, unlocked at least once after boot, is required:
gradle --no-daemon :app:connectedDebugAndroidTest
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r '.\app\build\outputs\apk\debug\app-debug.apk'
```

Alternatively open **this directory** as the Android Studio project and select JDK 17/Gradle 8.9. Download dependencies only on your development workstation; the installed companion has no network capability. Do not copy Keystore keys or place signing credentials in this directory.

If adding a wrapper later, obtain Gradle only from its official distribution, independently compare the published SHA-256 checksum, generate the wrapper with verified Gradle 8.9, and review its artifacts. This implementation did not download or verify any wrapper and does not provide a fake `gradlew`.

### Actual validation in the implementation environment

On November 2, 2026:

- `java`, `gradle`, `adb`, `kotlinc`: unavailable on PATH.
- `ANDROID_HOME`: not configured.
- The bounded probes for `C:\Program Files\Android\Android Studio\jbr\bin\java.exe`, `C:\Program Files\Java\jdk-17\bin\java.exe`, and `C:\Users\joanmoturi\AppData\Local\Android\Sdk` found no installation.
- `gradle --version` was attempted and failed because `gradle` was not recognized.
- No global tooling was installed. No APK, Gradle build, JVM test, Android lint result, emulator run, or physical-device result is claimed.
- XML/manifest permission checks, source lexical delimiter checks and test inventory checks were run using Python's standard library. These are **static checks, not Kotlin compilation or Android runtime verification**.
- A bounded manual self-check reviewed the Kotlin constructors/overrides/nullability, platform API calls against the declared API-28 minimum, legacy instrumentation library declarations, component declarations, URI provider and resource references. No additional concrete compilation/API defect was identified; only an actual Android build can establish compilation success.
- The 21 owned files are source/build configuration, resources, tests and this README. There are **no local toolchain-check logs**, downloaded toolchains, APKs, wrapper artifacts or generated build outputs among them. Check command output was reported in the session, not written to this directory.

## Safe first setup

1. Use a securely locked private Android device. The resume button requires a configured device PIN/password; screenshots/recording are blocked using `FLAG_SECURE`.
2. Open **Notification access settings** and explicitly grant access. Android's grant is broad: it cannot be narrowed to the packages selected inside the app.
3. Return and refresh the dashboard. A connected listener still leaves capture **paused**, with **all sources disabled**.
4. Choose a launcher-visible application, or manually enter an exact dotted package for non-launcher/system apps. Package visibility intentionally does not request `QUERY_ALL_PACKAGES`. A manual package is not proof of installation or identity; verify it yourself.
5. Choose the parser profile, inspect the labels, and explicitly enable that source. Saving enabled source settings advances its activation timestamp. The “preview observed” flag means a safe matched body was previously observed; it is not a permission promise or a stored raw preview.
6. Tap **Resume future capture**. Resuming advances all enabled source cutoffs to now. Old notifications and events occurring while paused are deliberately not backfilled.

On first start, process restart, listener disconnect/reconnect, or observed permission loss: pause and disable all sources. Explicitly enable them again and resume. This is intentionally conservative and may miss notifications while the process/listener restarts; it never promises historical recovery. Listener reconnection alone is not consent to resume.

Source deletion removes its configuration but does not silently erase that source's pending queue.

## Capture privacy boundary

Before any notification extras access, the service checks:

- exact package allowlist membership;
- explicitly enabled source, unpaused master, secure-device configuration and credential-encrypted storage available after the user's first unlock since boot;
- granted notification access and a connected future-capture session;
- non-group-summary notification;
- `postTime` strictly later than both session connection and source activation;
- not more than two minutes old and not more than five seconds ahead of the local clock.

The check is repeated on the worker before reading extras and again before committing, including configuration revision. Changes during work cause that callback to be discarded. The service never calls `getActiveNotifications()`. Callback filtering cannot prevent Android from delivering a package's notification object; it prevents this app reading its extras before allowlist/session gating.

The bounded worker reads only ordinary/big text and a title for exclusion checks. It does not read messaging conversations, attachments, remote views or historical notifications. Bodies over 8,192 characters, oversized titles, OTP/PIN/password/login/authentication content and unmatched/unrelated content are discarded before persistence. Balance-only messages are discarded. Filters are conservative heuristics, not a proof that every possible secret wording will be recognized.

Android versions/OEMs may redact notification text or suppress sensitive notifications; work profiles and managed policies may prohibit listener access. No SMS-reading workaround is implemented.

**Capture requires a secure device and the Android user to have unlocked at least once since boot, not a currently unlocked screen.** `UserManager.isUserUnlocked` and the credential-encrypted app context gate storage initialization/capture. After that first unlock, capture can continue when the screen locks again. The app is explicitly not direct-boot-aware and never processes notification contents or initializes the encrypted queue from device-protected storage before first unlock. Unlocking does not backfill previously ignored notifications.

The app-scoped AES-256-GCM key uses AndroidKeyStore with `setUserAuthenticationRequired(false)` and `setUnlockedDeviceRequired(false)`: there is no per-use authentication or screen-unlocked requirement, no portable key export, and no plaintext fallback. A configured device PIN/password is still required by the capture gate. If credential-encrypted storage or the Keystore is unavailable, capture fails closed. Errors expose only fixed counters; neither raw notification data nor exceptions containing it are logged.

Lock-screen notification bodies/previews may be redacted by the source app, Android, device policy or an OEM. A remaining safe labelled financial fragment can result in an incomplete review candidate; content lacking the expected prefix/financial fields results in no capture. The app does not bypass redaction or guarantee complete locked-screen capture.

No APK of the earlier revision was produced here. If you independently built that revision and generated an unlock-required key, changing the builder cannot relax that existing key's policy. Export all pending recovery batches while unlocked before any explicit uninstall/app-data reset; those operations destroy local keys/settings/receipts. A fresh installation of this revision generates the background-usable key, and saved pending JSON can then be restored. This code never silently deletes/replaces an existing key or queue.

## Parser examples and customization

**These are synthetic test fixtures, not M-PESA, Equity, or KCB production formats:**

```text
SYNTHETIC|Amount=123.45|Currency=KES|Ref=TEST001|Date=2026-11-02T18:00:00Z|Direction=credit|Kind=received|Party=TEST sender|Fee=0|Balance=900.10
SYNTHETIC|Amount=50|Currency=KES|Ref=TEST002|Date=2026-11-02T18:02:00Z|Direction=debit|Kind=paybill|Party=TEST merchant
SYNTHETIC|Kind=failed|Ref=TEST003
SYNTHETIC|Amount=50|Currency=KES|Ref=TEST004|OriginalRef=TEST002|Date=2026-11-02T18:03:00Z|Direction=credit|Kind=reversal
```

The prefix must start the **notification body**, followed immediately by the configured delimiter. Titles are checked for sensitive wording but not prepended as transaction fields. Each subsequent field is `Label=value`.

In source settings, you can configure a literal 4–48 character safe prefix, one delimiter (`|`, `;`, `~`), and unique bounded labels for the existing fields. Labels compare case-insensitively. A local sample-test button previews parsed structured data without adding it to the queue or saving the sample. This intentionally supports only labelled examples; it does not pretend arbitrary prose from real banks is understood. Future real-format parsers need redacted, user-supplied examples and independent tests.

Amounts use `BigDecimal`, exact two-decimal conversion and safe integer minor units bounded by JavaScript's maximum safe integer. `123.45 KES` becomes `12345`; commas, exponents, negative values and fractional minor units are rejected. Transaction amount must be positive. Fee/balance may be zero. No floating-point currency conversion occurs.

Currency must explicitly be `KES`; date must explicitly parse as an ISO timestamp with offset; direction and kind must be explicit contract values. Missing/invalid amount/reference/date/direction/currency/kind stay absent or `unknown`, with `missing` fields and low confidence. No missing reference or transaction date is invented. Capture time is separately recorded from the device clock.

Unknown/incomplete but matched financial candidates stay reviewable. Failed and reversal candidates always require review. Duplicate labels make the candidate incomplete instead of silently treating the last value as verified.

## Queue, deduplication and retention

Each candidate has a UUID assigned once, a dotted source package, parser ID/version, capture timestamp, confidence, validation, missing fields, and a lowercase SHA-256 fingerprint of `source + newline + normalized body`. Optional values are omitted from JSON, not serialized as nulls. Reversals can include `originalReference`.

- Repeated normalized content from the same package is a duplicate, even if Android notification IDs change.
- Changed content with the same source/reference hash becomes a **separate incomplete review version**, with its own stable candidate UUID and `updatedReference` warning. **The earlier pending candidate is not overwritten or deleted.**
- A reused notification ID with different content and no reference is not sufficient to merge financial events. Such incomplete candidates remain separate for review.
- Export retries retain candidate UUIDs. Batch UUID is deterministic for the selected IDs/fingerprints; creation timestamp is fresh.
- Local dedup receipts/reference hashes survive user receipt confirmation. Explicit **Delete ALL local pending data** clears those receipts too. Receipt indices contain hashes and candidate UUIDs, not bodies/references in plaintext.
- Up to 2,000 pending candidates are allowed. At capacity, new capture is rejected and counted as a fixed capture/storage error; it never evicts older unreceived entries. Worker overload is counted and drops callbacks rather than growing unboundedly. Check counters periodically.

Raw retention defaults **OFF**, configurable 1–90 days (default 7). Turning it off strips existing raw on the next maintenance pass. Raw expiry is opportunistic on foreground/capture maintenance, including capture after screen relock; it is not an exact background deletion timer while the app is stopped or storage is unavailable. Queue age warnings use the same period, **but pending structured entries never expire automatically**.

Database payloads/configuration are encrypted; SQL indexes contain only UUIDs/hashes and fixed statistics. AES-GCM keys never leave AndroidKeyStore. Device backup is disabled (`allowBackup=false`, `fullBackupContent=false`), with Android 12+ rules excluding cloud backup and device-transfer domains; Keystore hardware backing depends on the device. Rooted/compromised OSes, recipient apps, unlocked-device access and external document providers remain outside this protection.

## Safe handoff: OFFLINE Sharesheet or private file picker

Select **1–100 candidates**, at most **500,000 UTF-8 bytes**. If raw makes a batch too large, select fewer entries or turn raw retention off. Export never posts ledger entries by itself.

### Sharesheet: stay offline throughout

1. Prepare/install/open Pennywise online beforehand so its offline app/worker is available.
2. Turn **airplane mode on and disable Wi-Fi**. Keep networking off throughout the handoff and review.
3. Tap **Share selected JSON → Pennywise**, confirm the private-data warning and choose the trusted Pennywise target.
4. Verify the exact entries in Pennywise Transaction Inbox. Only then return and confirm **I verified receipt in Pennywise** for those selected candidates.

Immediately before launching `ACTION_SEND`, the companion checks `ConnectivityManager.activeNetwork == null` using `ACCESS_NETWORK_STATE`. An active network blocks the launch and displays the airplane-mode/Wi-Fi instructions. Capture/parsing/queueing are independent of networking.

**Why:** Chrome can retain an installed POST Web Share Target registration after its service worker is missing/cleared. Without a local intercepting worker, a share could be POSTed to hosting. A correctly installed worker handles it locally, but the companion cannot inspect Chrome's worker state. Offline gating prevents knowingly launching a share with an active network; it is a point-in-time check, **not an OS network lock**. You must not re-enable networking while Chrome is handing off or holding a failed submission. If uncertain, cancel/close that flow and use the file picker.

The share is a read-only `content://` URI with a temporary read grant and MIME `application/json`, never a `file://` URI or payload URL. Files are created in the private cache, become unreadable through the provider after ten minutes, and are removed/revoked on later actions/resume after expiry. A new export, explicit receipt, privacy update, or delete-all also clears previous share files. No persistent URI grant is issued. Recipient copies cannot be recalled.

### File-picker fallback: also usable online

Use **Save selected JSON / recovery file**, choose a private location, then select that file using Pennywise **Transaction Inbox**. This path does not invoke Chrome's POST share target and does not require the offline Sharesheet check. Some SAF providers upload to cloud storage independently: do not select them if you want local-only files.

Both paths expose plaintext financial JSON to the selected recipient/provider. A chooser closing, activity returning, successful file write, or “share completed” signal is **not** evidence Pennywise imported anything. The queue stays intact until a separate explicit user receipt confirmation. Confirming only selected exact candidate fingerprints leaves unselected versions pending.

## Recovery

The meaningful portable recovery artifact is the same version-1 handoff JSON:

1. Select pending entries and **Save selected JSON / recovery file** to a private location. Repeat in batches of no more than 100 / 500,000 bytes for a larger queue.
2. Keep the saved files private: they are **plaintext**, including raw when enabled. AndroidKeyStore keys are intentionally not portable.
3. On the recovered/reinstalled companion, use **Restore pending JSON file** and choose each file explicitly.
4. Files are size-bounded before parsing, UTF-8 validated, depth-limited to eight levels, and checked for format/version, unique canonical UUIDs, package syntax, required fields, timestamp validity, enum values, safe exact integer amounts, hash syntax, sensitive text and candidate limits. Restore is transactional; conflicting existing IDs roll back the file.
5. Candidate UUIDs are retained. Already-known fingerprints are skipped without deleting or re-adding receipted entries. Changed references are held as review versions. Raw is discarded unless current raw retention is enabled.
6. Capture pauses and sources disable before choosing a restore file. Configure/enable sources and resume explicitly afterward.

These files are not authenticated bank statements. Recovery intentionally does **not** port the Keystore, source settings/allowlist consent, local duplicate receipts, dashboard counters, already confirmed/deleted entries, or the PWA ledger. A missing file cannot recover notifications Android no longer delivers. An Android reinstall/key loss without saved JSON may make the old encrypted queue unrecoverable.

The PWA's own complete backup/restore is separate and belongs in Pennywise. Do not select it in this companion.

## Tests and device acceptance

`CoreTest` contains 19 JVM tests for all four synthetic profiles, exact/minimum/overflow amounts, missing data, zero amounts, sensitive/unrelated/balance exclusions, field ambiguity, reversal/failed review, all action kinds, safe label customization, bad dates/fees, raw/fingerprint behavior, allowlist/time/pause/permission gates, first-unlock/secure-device/credential-storage eligibility independent of screen relock, reference/content dedup, bounded/depth-limited recovery input and offline share gating.

`StorageTest` contains 9 Android instrumentation tests covering GCM fresh IV/tamper/AAD checks, 256-bit key/no-per-use-authentication policy with credential-protected storage, encrypted restart/config/queue persistence, idempotent restore, update versions without deleting earlier entries, exact receipt confirmation, transactional recovery rollback, raw stripping, strict JSON/stable retry IDs/batch limits, and provider read-only/cleanup behavior. Run after the Android user's **first unlock since boot**. Automated tests do not simulate a real screen lock or validate OEM redaction; the locked-screen capture acceptance below remains manual and unexecuted here. Tests use synthetic data, unique test database/key names, and remove their artifacts afterward.

Before private production use, complete on an actual target Android/OEM:

- Grant access, enable a synthetic source, resume, post fresh labelled synthetic notifications, and verify queue fields.
- Verify denied packages, old posts, group summaries, sensitive text, balance-only text and paused-period posts do not persist.
- Before first unlock after reboot, confirm no direct-boot capture/storage access. After setup/resume, lock the screen and post fresh synthetic notifications; verify capture continues when full text is available, and redacted content yields incomplete/no capture without bypassing redaction. Screen relock alone must not disable sources or advance session cutoffs.
- Separately revoke access while callbacks are queued, restart the process, or disconnect/reconnect the listener and confirm explicit re-enable is required; confirm no replay via active notifications.
- Repost identical content under a different Android ID; then update the same reference/content and verify duplicates vs separate incomplete versions.
- Verify raw opt-in/off/expiry and storage-full/error counters without sensitive log output.
- Verify Sharesheet is blocked with active Wi-Fi/mobile data, allowed offline, and retained across chooser cancellation. Test stale/cleared PWA worker offline without enabling networking mid-flow.
- Verify online private-file-picker fallback and the PWA's strict candidate review, trusted source/account mapping and receipt deduplication.
- Rotate/recreate activities, retry exports, restore files, exceed candidate/byte bounds, and confirm incomplete/failed writes never confirm or delete queue entries.
- Inspect APK merged permissions, disabled backup, private provider grants and screenshots on that OS.

## File inventory

```text
.gitignore
settings.gradle.kts
build.gradle.kts
gradle.properties
README.md
app\build.gradle.kts
app\src\main\AndroidManifest.xml
app\src\main\res\values\styles.xml
app\src\main\res\xml\data_extraction_rules.xml
app\src\main\java\ke\pennywise\companion\
  Core.kt                 # Models, modular parsers, gates, hashing, dedup policy
  JsonCodec.kt            # Contract export and bounded recovery validation
  CryptoBox.kt            # AndroidKeyStore AES-256-GCM
  QueueStore.kt           # Encrypted transactional SQLite/config/receipts
  CompanionApp.kt         # Fail-closed capture configuration/session state
  CaptureService.kt       # Future-only allowlisted notification capture
  PrivateFileProvider.kt # Narrow read-only private JSON URI provider
  BoundedIo.kt            # Bounded strict UTF-8 recovery input
  MainActivity.kt         # Native dashboard/source/review/export/recovery UI
app\src\test\java\ke\pennywise\companion\CoreTest.kt
app\src\androidTest\AndroidManifest.xml
app\src\androidTest\java\ke\pennywise\companion\StorageTest.kt
```

### Official platform/build references

- Android AGP 8.7 compatibility / 8.7.3 fixes: <https://developer.android.com/build/releases/agp-8-7-0-release-notes>
- Kotlin Gradle/AGP compatibility: <https://kotlinlang.org/docs/gradle-configure-project.html>
- Android Kotlin class-file / D8 / R8 compatibility: <https://developer.android.com/build/kotlin-support>
- Listener semantics: <https://developer.android.com/reference/android/service/notification/NotificationListenerService>
- Android cryptography: <https://developer.android.com/privacy-and-security/cryptography>
- Android user first-unlock / credential storage semantics: <https://developer.android.com/reference/android/os/UserManager#isUserUnlocked()>
- Keystore key policy: <https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder>
- File sharing permissions: <https://developer.android.com/training/secure-file-sharing/share-file>
