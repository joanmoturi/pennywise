# Android SMS companion: setup, build and installation

The separate Kotlin app under `android-companion` now receives **new SMS**, not Android notifications. Pennywise's PWA, financial schema, existing Inbox and records are retained. Nothing is pushed, deployed or published by this migration.

**No APK has been built or installed here.** JDK, Gradle, Android SDK/platform/build tools and adb are unavailable; there is no Gradle wrapper. Native compilation, encryption tests, permission behavior and physical-device capture remain unverified. Do not clear existing app/browser data to troubleshoot.

## Windows prerequisites

Pinned requirements: JDK **17**, Gradle **8.9**, Android SDK platform **35**, Build Tools **34.0.0** (AGP 8.7 default), platform-tools and command-line-tools. Compile/target **35** and minimum **28** are unchanged; Kotlin is 2.1.20 and AGP 8.7.3.

These are commands for the developer to run deliberately, not commands already executed:

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

Install the project's pinned Gradle in a user-local directory, verifying its official checksum before extraction:

```powershell
$tools = "$env:LOCALAPPDATA\PennywiseTools"
New-Item -ItemType Directory -Path $tools -Force | Out-Null
$zip = Join-Path $tools 'gradle-8.9-bin.zip'
Invoke-WebRequest 'https://services.gradle.org/distributions/gradle-8.9-bin.zip' -OutFile $zip
$expected = (Invoke-RestMethod 'https://services.gradle.org/distributions/gradle-8.9-bin.zip.sha256').Trim()
if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $expected) { throw 'Gradle checksum mismatch' }
Expand-Archive -Path $zip -DestinationPath $tools
$env:PATH = "$tools\gradle-8.9\bin;$env:JAVA_HOME\bin;$env:PATH"
java -version
gradle --version
& $sdkmanager --list_installed
```

Process-local variables must be set again in a new terminal. There is no fake wrapper or bundled toolchain. Do not store signing keys or secrets in the repository.

## Build and inspect

```powershell
Set-Location 'C:\Users\joanmoturi\pennywise\android-companion'
gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\apkanalyzer.bat" manifest permissions '.\app\build\outputs\apk\debug\app-debug.apk'
```

Expected requested permissions: `android.permission.RECEIVE_SMS` and `android.permission.ACCESS_NETWORK_STATE` only. `BROADCAST_SMS` restricts the receiver's sender; the app does not request it. There must be no `READ_SMS`, Internet, contacts, call logs, accessibility or notification-listener declaration.

Use an isolated API-28+ emulator or test phone with a secure PIN/password and first unlock completed:

```powershell
gradle --no-daemon :app:connectedDebugAndroidTest
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r '.\app\build\outputs\apk\debug\app-debug.apk'
```

For private manual installation, transfer only your locally built debug APK to a trusted device, temporarily permit installation by that file manager if needed, then revoke that installation permission. This guide does not publish an APK.

## First use and your own financial senders

1. Make and verify a full encrypted backup of existing Pennywise data. Do not uninstall the companion if it has unsent records; save private recovery batches first.
2. Open **Pennywise Companion**, read the explanation and choose **Allow receiving new SMS**. Grant the Android prompt deliberately. This does not read old messages or resume capture.
3. If grant is denied/unavailable, reception stays paused. `RECEIVE_SMS` is **hard-restricted**: installer allowlisting and device policy matter. The app cannot fix this with repeated prompts, shell grants, hidden APIs or another permission. Use a permitted test installation or leave SMS reception disabled.
4. Choose **Add SMS sender ID / phone number**. Inspect the actual sender yourself in your SMS app; add each intended financial sender separately. No inbox scan, contact lookup or sender discovery occurs.
5. Choose the parser profile and synthetic labelled settings. Existing M-Pesa/Equity/KCB adapters are not verified real-bank formats. Test only synthetic samples locally. Unknown real prose will not reliably create a candidate; do not make real transfers just to prove an unsupported parser.
6. Explicitly enable intended senders, then **Resume future capture**. Use **Pause now** to stop immediately, or disable/remove one sender. Ordinary process restarts preserve consent; observed permission loss pauses it. Screen relock is supported by design after first unlock, not verified here.
7. On an isolated emulator, send synthetic SMS using its Extended Controls > Phone interface (including multipart text), not forged app broadcasts or permission bypass commands. Verify allowed/unapproved/disabled senders, timestamps, duplicate retries and counters.
8. For your own M-Pesa/bank applications, first establish whether the institution actually sends an **SMS** and which sender ID it uses. App-only alerts, RCS and MMS are not captured. Do not save or share personal message samples with developers; real-format support still needs privacy-safe synthetic equivalents and independent tests.
9. Inspect structured candidates and the detected sender in the queue. Follow `SMS_INTEGRATION_GUIDE.md` for private file/offline sharing and receipt confirmation, then configure narrow account/rule mappings in Pennywise.
10. Test denial/revocation, pause, restart, screen relock, offline import/retry and encrypted PWA restore into a separate test workspace before financial reliance.

## Recovery and troubleshooting

Old notification-source parser configurations are retained disabled, without assuming any SMS sender. Assign a sender explicitly. New SMS sources use new stable identifiers and need their own PWA account mappings; old queued candidates and financial records are not rewritten.

No background/inbox catch-up is attempted after force-stop, permission denial, pre-unlock downtime or OEM suppression. A delayed carrier SMS newly delivered after consent is eligible; its SMS timestamp is not treated as a financial timestamp. Review dashboard failure counters without exposing message bodies.

Queue capacity is 2,000 with no eviction. Export at most 100 candidates / 500,000 UTF-8 bytes per batch. **Restore pending JSON file** preserves IDs but pauses capture/disables senders and does not restore config, keys, PWA records or receipts. Raw retention is off by default, optionally 1-90 days with opportunistic cleanup; pending structured data does not silently expire.

The phone does not need development tools. See `SMS_INTEGRATION_TEST_REPORT.md` for what actually ran, and `SMS_PRIVACY_AND_SECURITY.md` before exporting.
