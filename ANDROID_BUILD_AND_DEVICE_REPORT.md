# Android build and device acceptance report

**Date:** November 3, 2026. **Source baseline:** local `5b80804`.

**Historical build-phase snapshot:** this report records the local APK/device work before separately authorized GitHub/Cloudflare publication. Its no-push/local-only statements below describe that phase. Current web publication status is recorded in `DEPLOYMENT_REPORT.md`; the APK remains unpublished.

**Result:** debug APK compiled, signed, installed and launched on an isolated Android 15/API-35 AOSP emulator. All **27 JVM tests**, **13 Android instrumentation tests** and **7 native-export/PWA acceptance assertion groups** passed, with zero final failures or skips in those suites. Physical-phone installation, real-bank prose and Android browser/PWA Sharesheet acceptance are **not verified**. This is not production-readiness certification.

All changes remain local and uncommitted in the standalone Pennywise repository. Nothing was pushed, deployed, released or published. Engineering Academy, the financial architecture/schema, ledger safeguards, PWA design and existing records were not changed. No personal financial workspace or real SMS examples were used.

## 1. Environment and dependencies

Initial assessment found no usable JDK, Android SDK, ADB, Gradle or wrapper. Windows x64 had approximately 31 GB RAM, 697 GB free disk and usable WHPX acceleration. Tools were installed from official Microsoft, Google and Gradle distribution endpoints, after explicit user acceptance of the Android SDK license.

| Component                       | Configured/verified                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| JDK                             | Microsoft 17.0.21.0.2+1; `%LOCALAPPDATA%\PennywiseTools\jdk17\jdk-17.0.21.0.2+1`                     |
| SDK                             | `%LOCALAPPDATA%\Android\Sdk`                                                                         |
| SDK platform / minimum / target | Installed android-35; minimum 28, compile/target 35 unchanged                                        |
| Build Tools / SDK tools         | 34.0.0; command-line-tools 19.0; platform-tools/ADB                                                  |
| Gradle / plugin / Kotlin        | Verified wrapper 8.9; existing AGP 8.7.3 and Kotlin 2.1.20 unchanged                                 |
| Emulator                        | 37.2.13; AOSP API-35 x86_64 image revision 2; isolated `Pennywise_SMS_API35`, serial `emulator-5560` |
| Android Studio / physical phone | Studio not required/installed by this task; no physical device connected                             |

The process-local `android-companion\tools\Use-AndroidToolchain.ps1` locates/validates the installed JDK/SDK without global PATH changes. No app dependency, Maven repository, TLS policy, target SDK or permission safeguard was weakened.

Verified official archive identities:

| Artifact                               | Verification                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Microsoft JDK archive                  | SHA-256 `49154292866386B2F4F09A3ECF3BE07AB80A419149C84EC1D4419B9EEC9E4B64`                                         |
| Gradle 8.9 distribution                | SHA-256 `d725d707bfabd4dfdc958c624003b3c80accc03f7037b5122c4b1d0ef15cecab` pinned in wrapper properties            |
| Gradle wrapper JAR                     | SHA-256 `498495120a03b9a6ab5d155f5de3c8f0d986a449153702fb80fc80e134484f17`, compared with Gradle's published value |
| Google command-line-tools 19.0 archive | Published repository-XML SHA-1 `54a582f3bf73e04253602f2d1c80bd5868aac115` matched; official HTTPS download         |

No required build dependency remains missing on this machine. A permitted physical test phone and compatible Android PWA browser/installation remain needed for full phone acceptance. No unofficial browser APK was downloaded to work around the AOSP image's lack of a PWA-capable browser.

## 2. Exact build and test commands

Executed from the native project:

```powershell
Set-Location 'C:\Users\joanmoturi\pennywise\android-companion'
. .\tools\Use-AndroidToolchain.ps1
.\gradlew.bat --no-daemon --console=plain clean :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
$env:ANDROID_SERIAL = 'emulator-5560'
.\gradlew.bat --no-daemon --console=plain :app:connectedDebugAndroidTest :app:processReleaseMainManifest
```

The first attempt failed during dependency resolution because Maven Central DNS lookup failed for Kotlin's compiler artifact; it did not establish a source compilation failure. After checking the official endpoints, retrying with unchanged repositories/TLS succeeded. The final source, including the private sample harness and updated privacy wording, was rebuilt and the 13 instrumentation tests rerun successfully.

Connected-test cleanup removed its installed app packages on the disposable emulator. The final debug APK was then reinstalled using ordinary `adb install -r` and cold-launched successfully, initially paused with permission missing and no senders. Do not run instrumentation against a personal installation with pending records; uninstall/cleanup can erase them. Earlier acceptance counters below refer to the synthetic file/receipt exercise before that cleanup, not preserved real data.

| Check                                      | Actual final evidence                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Clean debug build                          | PASSED; subsequent final incremental build also passed                                                                               |
| JVM tests                                  | **27 passed, 0 failures/errors/skips**; `app\build\test-results\testDebugUnitTest`                                                   |
| Instrumentation                            | **13 passed, 0 failures/errors/skips**, API-35 emulator; `app\build\outputs\androidTest-results\connected`                           |
| Lint                                       | **0 errors, 1 warning**: existing `MissingApplicationIcon`; not suppressed                                                           |
| Compiler/static feedback                   | Build passed; existing deprecated window-inset/legacy test API warnings remain                                                       |
| APK inspection                             | Exact two requested permissions; minimum 28/target 35; v2 signature verifies                                                         |
| Release merged manifest                    | Generated/inspected; no `debuggable=true`, no backup/direct boot, no cleartext traffic; protected receiver/private provider retained |
| Native export to offline local desktop PWA | **7 acceptance assertion groups passed**, 0 failures                                                                                 |
| Prior PWA regression suites                | Earlier migration report records 148 unit/integration and 20 browser passes; **not rerun or counted as current-phase tests**         |

The release configuration contains no signing credentials or debug secrets. A production-signed release APK was not built or published. The existing release minification setting was not changed.

## 3. APK and checksum

```text
C:\Users\joanmoturi\pennywise\android-companion\app\build\outputs\apk\debug\app-debug.apk
SHA-256: 2316BF71EAF7F73C834035FDB5B87283A69778D7F26B9F0F1BC49FBEF7190361
```

This is the final debug-signed build, version 0.2.0/code 2, application ID `ke.pennywise.companion`. APK/build outputs remain ignored by Git. Rebuilding can change the checksum.

Inspection commands:

```powershell
Get-FileHash '.\app\build\outputs\apk\debug\app-debug.apk' -Algorithm SHA256
& "$env:ANDROID_HOME\cmdline-tools\19.0\bin\apkanalyzer.bat" manifest permissions '.\app\build\outputs\apk\debug\app-debug.apk'
& "$env:ANDROID_HOME\build-tools\34.0.0\apksigner.bat" verify --verbose '.\app\build\outputs\apk\debug\app-debug.apk'
```

Requested permissions are exactly `android.permission.RECEIVE_SMS` and `android.permission.ACCESS_NETWORK_STATE`. `BROADCAST_SMS` restricts the receiver's caller; it is not requested. No READ_SMS, SEND_SMS, Internet, notification access, contacts, call logs, accessibility or historical inbox access was added.

## 4. Actual emulator acceptance

The isolated emulator had a synthetic test PIN and first unlock completed. Installation used normal `adb -s emulator-5560 install -r`; SMS permission was denied, granted and revoked through the real Android prompt/Settings UI. No shell permission grants or automatic grant flags were used. Its installer allowed the restricted permission; that does not guarantee every phone/installer will.

| Behavior                       | Observed result                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Install and launch             | Successful; initial capture paused and SMS permission missing                                                                             |
| Permission request timing      | Prompt appeared only after choosing **Allow receiving new SMS**                                                                           |
| Denial / grant                 | Denial retained paused/empty state; grant alone did not resume capture                                                                    |
| Explicit sender selection      | Added synthetic numeric sender `12345`; initially disabled; enabled explicitly                                                            |
| Paused / unapproved / disabled | Synthetic paused messages and sender `54321` were ignored; disabled `12345` also ignored                                                  |
| Allowed sender / metadata      | Supported SMS created one candidate; last detected sender displayed `12345`                                                               |
| Duplicate delivery             | Same synthetic body delivered again: processed counter 2, pending 1, duplicate counter 1                                                  |
| Permission revocation          | Real Settings revocation showed `granted=false`, capture paused, existing pending candidate preserved; revoked messages were not captured |
| Regrant                        | App remained paused until explicit resume                                                                                                 |
| Long SMS                       | More than 500 padding characters received; trailing amount/currency/account fields survived in exported structured candidate              |
| Incomplete direction           | Native transfer candidate stayed incomplete at confidence 35                                                                              |
| Process restart                | Confirmed process PID 3819 stopped, then cold-launched PID 4811; consent, counters and three pending candidates survived                  |
| No data network / PWA closed   | Wi-Fi/mobile data disabled; Android reported active default network **none**; another SMS queued, raising pending to four                 |
| Export does not acknowledge    | SAF saved native JSON; pending remained three and confirmed imports zero at export time                                                   |
| Invalid receipt                | Unsupported receipt left all four pending and confirmed count zero                                                                        |
| Exact PWA receipt              | User confirmation matched three original IDs/fingerprints: confirmed count three, pending one; newer offline candidate retained           |
| Receipt retry                  | Reimporting the same receipt left confirmed count three and pending one                                                                   |
| Parser harness                 | Redaction guard exercised, valid preview shown, input cleared, unsupported prose rejected; harness reference absent from actual export    |

Long-message tail preservation and pure multipart JVM tests passed. Actual telephony segment count/order was not instrumented; carrier-specific multipart delivery, malformed radio PDUs, unsupported real encoding and bad carrier timestamps remain unverified on devices. JVM tests cover the corresponding fail-closed assembly/validation gates.

Screen-relock, pre-first-unlock delivery, OEM background suppression and Android versions other than API 35 were not separately verified. Force-stop is a delivery restriction until relaunch; the restart test did not claim background delivery while force-stopped.

The headless software-rendered emulator logged graphics color-buffer and intermittent ADB-protocol diagnostics. They did not prevent the successful tests/UI-hierarchy checks, but no physical-screen or complete visual-rendering acceptance is claimed.

## 5. Native-to-PWA evidence and financial safeguards

The AOSP emulator has no installed PWA-capable browser. Therefore the verified route was **native SAF JSON export > USB/ADB retrieval of synthetic file > isolated local desktop PWA > receipt file > native SAF receipt import**, not Android Sharesheet/Web Share Target acceptance.

The session-only acceptance harness used two fresh browser contexts at loopback `127.0.0.1:4187`, primed the existing worker, then disabled browser networking. It asserted:

1. Three actual native candidates exported without raw bodies or harness samples; long-message tail fields were intact.
2. Untrusted file import persisted all three in the existing Inbox with zero ledger entries.
3. Repeated import retained the same three identities, incremented delivery counts and still posted nothing.
4. The PWA's downloaded receipt contained the exact native IDs/fingerprints after persistence.
5. An explicitly trusted source/account mapping and narrow enabled rule approved only the eligible received/credit candidate; ambiguous transfer and unmatched debit stayed pending.
6. Repeated trusted import left exactly one ledger entry in the intended account.
7. No external network requests were observed; file import, rule evaluation and receipt generation worked offline.

The native queue was cleared only for matching receipt entries after explicit confirmation, not because sharing, saving or PWA ledger approval was assumed. The production PWA remains unchanged and is not presented as compatible with this local Inbox revision.

## 6. Parser harness and limits

The existing settings harness now requires explicit redaction confirmation, disables sample saved state/autofill, requests no personalized keyboard learning, and clears input after preview or dismissal. It never writes test samples to the queue. Tests and exports used fictional names/references only. Clipboard/keyboard software remains outside the app's complete control.

The existing 27 JVM tests exercise all four `mpesa`, `equity`, `kcb` and `generic` **synthetic labelled** profiles and the actionable types, including received/sent/paybill/buy_goods, credits/debits/transfers/charges, loan repayments, coupons, reversals, failed/balance-only and ambiguous cases. A bank name is not evidence of real-format support. No representative real/redacted customer SMS was supplied or saved, and no real institutional wording was invented.

Use the procedure in `ANDROID_COMPANION_GUIDE.md` to enter manually redacted examples locally. Unsupported prose cannot reliably provide amount, reference, date, direction, fees or account; missing values stay unknown. Real M-Pesa/Equity/KCB formats, variants and accuracy remain a blocker to financial reliance, not a solved requirement.

## 7. Security inspection and residual risks

The actual APK has no Internet permission or broad SMS inbox permission. The release manifest retains disabled backup/data extraction, no cleartext traffic, a system-protected receiver and an unexported temporary-file provider. Existing ledger/rule/schema code and dependencies were not changed.

API-35 instrumentation verified actual Keystore AES-GCM round-trip, random IV behavior, tamper/wrong-context rejection and protected storage persistence. This is not hardware attestation or universal physical-device verification. Routing metadata is not full-database encrypted; PWA IndexedDB is not app-encrypted at rest.

Sender IDs are spoofable; deterministic confidence is not bank authentication. Receipts are unsigned local evidence. Transfer/recovery files are plaintext and chosen document/share providers can independently upload them. Use trusted local storage and remain offline for any Sharesheet attempt. No production security certification or completion of the earlier broad financial audit is claimed.

## 8. Exact next steps and remaining manual acceptance

1. Read `ANDROID_COMPANION_GUIDE.md`, verify the APK checksum, and copy it privately over USB to a trusted Android 9+ test phone. Install via its file manager; remove that manager's install permission afterward.
2. Back up pending companion data before replacing/uninstalling any existing signed installation. Never clear real PWA/app data to resolve an install or permission issue.
3. Use a secure device PIN, unlock after boot and exercise actual denial/grant/revocation. If installer policy blocks RECEIVE_SMS, leave capture paused; do not bypass restrictions.
4. Test manually redacted examples in the memory-only harness first. Do not make real transfers to test an unsupported provider parser.
5. Configure exact SMS sender identifiers, explicitly enable them and resume capture. Verify new allowed/unapproved/disabled synthetic messages, long/multipart delivery, screen relock and restart. Verify no historical inbox backfill.
6. Use a fresh separate local PWA test profile with no real ledger. Import only synthetic exports; test pending review, narrow rules, duplicate retry and receipt return. The currently live PWA has not been deployed with this work.
7. Separately verify an installed Android PWA's offline Sharesheet routing only when a trusted compatible secure PWA installation is available. The private file workflow remains the supported tested alternative. No deployment is authorized by this report.

The owned emulator/loopback preview are stopped after the self-contained checks. Installed tools, wrapper, guides and ignored local APK remain available. No physical device was installed or tested.

## Files changed in this phase

- `android-companion\gradlew`, `android-companion\gradlew.bat`
- `android-companion\gradle\wrapper\gradle-wrapper.jar`, `android-companion\gradle\wrapper\gradle-wrapper.properties`
- `android-companion\tools\Use-AndroidToolchain.ps1`
- `android-companion\app\src\main\java\ke\pennywise\companion\MainActivity.kt`
- `ANDROID_COMPANION_GUIDE.md`, this report, `android-companion\README.md`, `README.md`
- `SMS_INTEGRATION_TEST_REPORT.md` (historical snapshot pointer)
- `SMS_PRIVACY_AND_SECURITY.md`, `TRANSACTION_PARSING_REFERENCE.md`

Official compatibility/setup references: `https://developer.android.com/build/releases/agp-8-7-0-release-notes`, `https://developer.android.com/tools/sdkmanager`, `https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS`. Detailed build logs and synthetic acceptance artifacts remain in this Copilot session's private `files` directory, not source control. No new commit was created.
