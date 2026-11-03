# Android SMS companion: setup, build and installation

The separate Kotlin app under `android-companion` now receives **new SMS**, not Android notifications. Pennywise's PWA, financial schema, existing Inbox and records are retained. Nothing is pushed, deployed or published by this migration.

**A debug APK has been built and installed on an isolated Android 15/API-35 emulator.** All 27 JVM tests and 13 Android instrumentation tests passed. Actual SMS reception, permission handling and the explicit native-file/PWA-receipt loop were exercised. Physical-phone installation and Android browser/PWA Sharesheet routing remain unverified. See `ANDROID_BUILD_AND_DEVICE_REPORT.md` for the final checksum and exact evidence. Do not clear existing app/browser data to troubleshoot.

## Windows prerequisites

Pinned requirements: JDK **17**, Gradle **8.9**, Android SDK platform **35**, Build Tools **34.0.0** (AGP 8.7 default), platform-tools and command-line-tools. Compile/target **35** and minimum **28** are unchanged; Kotlin is 2.1.20 and AGP 8.7.3.

The Windows machine now has official, user-local tools:

- Microsoft JDK 17.0.21.0.2+1 under `%LOCALAPPDATA%\PennywiseTools\jdk17`.
- Android SDK under `%LOCALAPPDATA%\Android\Sdk`: platform 35, Build Tools 34.0.0, platform-tools, command-line-tools 19.0 and an API-35 AOSP emulator.
- A generated Gradle 8.9 wrapper with a pinned distribution SHA-256 and independently verified wrapper JAR.

SDK installation followed explicit user acceptance of the Android SDK license. No global PATH, SDK version, app dependency or security policy was changed.

On this machine, start a fresh PowerShell terminal with:

```powershell
Set-Location 'C:\Users\joanmoturi\pennywise\android-companion'
. .\tools\Use-AndroidToolchain.ps1
java -version
.\gradlew.bat --version
& "$env:ANDROID_HOME\cmdline-tools\19.0\bin\sdkmanager.bat" --list_installed
```

The helper changes only the current PowerShell process. To use different installations, pass `-JavaHome 'YOUR-JDK-17-PATH' -SdkRoot 'YOUR-SDK-PATH'`. It rejects the wrong JDK or missing required SDK components.

For a **different Windows machine** with missing prerequisites, these official-source installation commands are alternatives, not additional requirements for this configured machine:

```powershell
winget install --id Microsoft.OpenJDK.17 --exact --source winget
winget install --id Google.AndroidStudio --exact --source winget
```

Open Android Studio, review its licenses and use SDK Manager to install Android 15/API 35, Build Tools 34.0.0, Android SDK Platform-Tools and Android SDK Command-line Tools. Select JDK 17 for Gradle. Do not assume the bundled JDK matches the pinned version.

Alternatively, after installing the official Android command-line-tools package and setting paths to the actual installations:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.REPLACE-WITH-INSTALLED-VERSION'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$sdkmanager = "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"
& $sdkmanager --licenses
# Review and accept licenses yourself; do not pipe automatic answers.
& $sdkmanager 'platform-tools' 'platforms;android-35' 'build-tools;34.0.0'
```

The current Android SDK documentation also offers `android sdk` as a replacement for sdkmanager; the commands above target the existing official command-line-tools package. Android Studio SDK Manager is an equivalent supported route.

Inspection commands below use this machine's installed `cmdline-tools\19.0`; on another machine substitute the actual SDK tools directory, commonly `latest`.

Use the included wrapper; a global Gradle installation is unnecessary. The first wrapper run downloads the official Gradle 8.9 distribution and verifies the pinned checksum. Do not store signing keys or secrets in the repository.

## Build and inspect

```powershell
Set-Location 'C:\Users\joanmoturi\pennywise\android-companion'
. .\tools\Use-AndroidToolchain.ps1
.\gradlew.bat --no-daemon --console=plain clean :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
Get-FileHash '.\app\build\outputs\apk\debug\app-debug.apk' -Algorithm SHA256
& "$env:ANDROID_HOME\cmdline-tools\19.0\bin\apkanalyzer.bat" manifest permissions '.\app\build\outputs\apk\debug\app-debug.apk'
& "$env:ANDROID_HOME\build-tools\34.0.0\apksigner.bat" verify --verbose '.\app\build\outputs\apk\debug\app-debug.apk'
```

Expected requested permissions: `android.permission.RECEIVE_SMS` and `android.permission.ACCESS_NETWORK_STATE` only. `BROADCAST_SMS` restricts the receiver's sender; the app does not request it. There must be no `READ_SMS`, Internet, contacts, call logs, accessibility or notification-listener declaration.

Use an isolated API-28+ emulator or test phone with a secure PIN/password and first unlock completed:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
$env:ANDROID_SERIAL = 'emulator-5560' # Replace deliberately with your isolated test device.
.\gradlew.bat --no-daemon --console=plain :app:connectedDebugAndroidTest
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s $env:ANDROID_SERIAL install -r '.\app\build\outputs\apk\debug\app-debug.apk'
```

The previously used emulator may be stopped; list devices before choosing a serial. Never target an unknown device. Do not use shell permission grants or automatic SMS permission-grant flags.

**Instrumentation is destructive to test installations:** connected-test tooling can uninstall its app packages and erase their local data during cleanup. Run it only on a disposable emulator/test installation, never a personal installation containing pending financial records. The final APK was reinstalled and launched normally after that cleanup.

## Transfer, install and uninstall safely

The APK is at `C:\Users\joanmoturi\pennywise\android-companion\app\build\outputs\apk\debug\app-debug.apk`. Compare its SHA-256 with `ANDROID_BUILD_AND_DEVICE_REPORT.md`; a later rebuild can have a different hash.

Copy this local file over USB to your trusted phone's local Downloads folder. Open it with a trusted file manager, temporarily allow that file manager to install unknown apps if Android requests it, install, then revoke that installation permission. No APK has been published. This is a debug-signed development build, not a production release.

If Android refuses SMS permission because of installer/device restrictions, leave capture paused. Do not grant broader permissions, switch default SMS apps or bypass policy. Android's generic SMS permission dialog may say "send and view SMS messages"; the inspected APK requests only RECEIVE_SMS, not SEND_SMS or READ_SMS.

Before uninstalling, pause capture, privately export any pending batches and verify they are recoverable. An update signed by a different key may be rejected; do not uninstall or clear data to work around that without recovery. Uninstall through Android Settings > Apps > Pennywise Companion. Uninstall removes local app data and keys; it does not delete the PWA ledger or exported copies. Delete sensitive exports separately when no longer needed.

## First use and your own financial senders

1. Make and verify a full encrypted backup of existing Pennywise data. Do not uninstall the companion if it has unsent records; save private recovery batches first.
2. Open **Pennywise Companion**, read the explanation and choose **Allow receiving new SMS**. Grant the Android prompt deliberately. This does not read old messages or resume capture.
3. If grant is denied/unavailable, reception stays paused. `RECEIVE_SMS` is **hard-restricted**: installer allowlisting and device policy matter. The app cannot fix this with repeated prompts, shell grants, hidden APIs or another permission. Use a permitted test installation or leave SMS reception disabled.
4. Choose **Add SMS sender ID / phone number**. Inspect the actual sender yourself in your SMS app; add each intended financial sender separately. No inbox scan, contact lookup or sender discovery occurs.
5. Choose the parser profile and synthetic labelled settings. Existing M-Pesa/Equity/KCB adapters are not verified real-bank formats. Use the local harness described below. Unknown real prose will not reliably create a candidate; do not make real transfers just to prove an unsupported parser.
6. Explicitly enable intended senders, then **Resume future capture**. Use **Pause now** to stop immediately, or disable/remove one sender. Ordinary process restarts preserve consent; observed permission loss pauses it. Screen relock is supported by design after first unlock, not verified here.
7. On an isolated emulator, send synthetic SMS using its Extended Controls > Phone interface (including multipart text), not forged app broadcasts or permission bypass commands. Verify allowed/unapproved/disabled senders, timestamps, duplicate retries and counters.
8. For your own M-Pesa/bank applications, first establish whether the institution actually sends an **SMS** and which sender ID it uses. App-only alerts, RCS and MMS are not captured. Do not save or share personal message samples with developers; real-format support still needs privacy-safe synthetic equivalents and independent tests.
9. Inspect structured candidates and the detected sender in the queue. Follow `SMS_INTEGRATION_GUIDE.md` for private file/offline sharing and receipt confirmation, then configure narrow account/rule mappings in Pennywise.
10. Test denial/revocation, pause, restart, screen relock, offline import/retry and encrypted PWA restore into a separate test workspace before financial reliance.

## Private parser harness and ledger-safe tests

Open a sender's configuration and scroll to **Local parser harness**. Before pasting, manually replace all names, phone/account numbers and references with fictional values. Clear any clipboard copy afterward; keyboard/clipboard software is outside the companion's control. Never send real examples to a service, source control, screenshots or logs.

Check **I manually redacted all identifying details**, paste into **Optional redacted sample (memory only)** and choose **Test sample locally (no queue write)**. Inspect extracted fields and missing values. Testing does not save a sample, enqueue a transaction, train a parser or touch the PWA ledger. Input clears after testing or closing configuration; sample view state/autofill/keyboard personalized-learning requests are disabled. This cannot certify every keyboard or compromised device.

Use synthetic received/sent/paybill/buy_goods examples with the `mpesa` profile and synthetic deposit/withdrawal/transfer examples with `equity`, `kcb` or `generic`. These exercise configurable labelled parsing, **not real institutional formats**. Representative redacted provider prose may correctly return unsupported; amount, date, direction, account, reference and fees must remain unknown rather than invented. See `TRANSACTION_PARSING_REFERENCE.md`.

For an actual end-to-end test, use an isolated emulator/test phone and a fresh, separate local PWA browser profile with no real records. Send only synthetic SMS through emulator controls. Save the companion's local JSON, import it into that test Inbox with rule evaluation unchecked and verify zero ledger entries. Then test one narrow mapping/rule in a separate test workspace. Return the downloaded receipt only after inspecting the Inbox.

Use a PWA revision containing **Transaction Inbox** and SMS metadata support; see `DEPLOYMENT_REPORT.md` for the verified production revision. Back up your records, save open forms and accept **Reload update** when an older installation offers the update. The emulator acceptance workflow used a local desktop PWA and returned the receipt file; it did not verify an installed Android PWA share target. Public deployment does not establish physical-phone/Android Sharesheet acceptance. Do not expose a development HTTP server publicly.

For physical-phone acceptance, use a second trusted phone's normal SMS app to send fictional labelled messages to the test phone; allowlist that second phone's actual detected number, not a spoofed bank ID. Sending an SMS is not making a financial transfer. Test the same body twice (one pending candidate, duplicate counter increases), then disable that sender and send a new fictional reference (pending count unchanged). Revoke permission in Android Settings and confirm capture pauses without losing pending data. Regrant, explicitly resume and repeat with Wi-Fi/mobile data off but SMS service still available. Restart and screen-lock/unlock the test phone, then check persistence and delivery. Keep all test imports in the separate PWA test workspace; verify exact receipt confirmation and repeat-import idempotency before any financial use.

## Recovery and troubleshooting

Old notification-source parser configurations are retained disabled, without assuming any SMS sender. Assign a sender explicitly. New SMS sources use new stable identifiers and need their own PWA account mappings; old queued candidates and financial records are not rewritten.

No background/inbox catch-up is attempted after force-stop, permission denial, pre-unlock downtime or OEM suppression. A delayed carrier SMS newly delivered after consent is eligible; its SMS timestamp is not treated as a financial timestamp. Review dashboard failure counters without exposing message bodies.

Queue capacity is 2,000 with no eviction. Export at most 100 candidates / 500,000 UTF-8 bytes per batch. **Restore pending JSON file** preserves IDs but pauses capture/disables senders and does not restore config, keys, PWA records or receipts. Raw retention is off by default, optionally 1-90 days with opportunistic cleanup; pending structured data does not silently expire.

The phone does not need development tools. See `ANDROID_BUILD_AND_DEVICE_REPORT.md` for current results, `SMS_INTEGRATION_TEST_REPORT.md` for the earlier migration snapshot, and `SMS_PRIVACY_AND_SECURITY.md` before exporting.
