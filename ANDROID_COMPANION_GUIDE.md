# Pennywise Android companion

The companion is a separate native Kotlin application in `android-companion`, not a replacement for the installed Pennywise PWA. Development/build tools belong on the laptop, not your phone. Financial ledger records remain in Pennywise's existing IndexedDB.

## Installation and first use

1. Build the companion following `android-companion/README.md`. Android SDK/JDK requirements and actual build results are recorded there and in `NOTIFICATION_INTEGRATION_TEST_REPORT.md`. Do not assume an APK exists until an Android build succeeds.
2. Transfer the resulting APK privately to your Android phone and install it. Android may require temporary permission to install from the file manager used. Revoke that installation permission afterward.
3. Configure a secure device PIN/password if needed, unlock once after boot and open **Pennywise Companion**. Read the notification-access explanation. Capture is optional and initially paused.
4. Open notification-access settings from the companion and enable access for this application. Android's system permission is broad; Pennywise's own package allowlist filters immediately before reading notification contents.
5. Select the exact source applications on your phone. Enable only the intended M-Pesa/bank/SMS application packages. Set a source profile, parsing preference and preview availability. Never select every application merely to find a bank.
6. Configure extraction only after inspecting synthetic examples and your actual notification wording. Initial source adapters are not certified parsers for live Safaricom, Equity or KCB messages.
7. Resume capture. Only new notification posts after activation are eligible. No historical SMS inbox or old notification backlog is requested.
8. Perform a small controlled transaction and inspect the companion's local captured/pending queue before sharing. Missing previews and unknown formats remain incomplete; they are not invented transactions.

## Safe transfer to Pennywise

The most portable path is **save a private transaction JSON file**, open Pennywise at `https://pennywise-7lz.pages.dev/`, go to **Transaction Inbox**, and choose **Companion transaction file**. This uses a local file picker, not an upload to Cloudflare.

For Android Sharesheet, first install/open the PWA online and verify Offline ready. Then disconnect the phone from networks (airplane mode with Wi-Fi off) before **Share selected JSON → Pennywise**. The worker must intercept the POST locally. Offline sharing avoids transmitting a file to hosting if the worker has been cleared or the installed target is stale. If the share target is missing or fails, retain the companion queue and use the file picker instead.

In the PWA, review the staged batch. Rule processing is opt-in for a selected trusted companion file; otherwise all candidates enter review. Check imported item counts/statuses before explicitly acknowledging successful handoff in the companion. Android's Sharesheet completion is not an import receipt.

Keep the companion's retained items until verified. A retry preserves candidate IDs, so it must not create another ledger entry.

## Permission changes, device limits and deletion

Notification access can be revoked in Android Settings without affecting existing Pennywise ledger records. Pause capture before changing sources. If access is revoked/disconnected, re-enable access and resume deliberately; there is no historical catch-up.

Android may restrict background execution, hide sensitive previews, suppress source notifications, aggregate notifications or stop a listener on some device profiles. Consult the phone's battery/background settings and the source application's notification settings. Do not grant unrelated SMS, accessibility, contacts or Internet permissions to work around missing previews.

Capture can continue when the screen relocks after the first unlock following boot. Before that first unlock, credential-encrypted storage is unavailable and capture is blocked. Queue keys do not require per-use authentication or a currently unlocked screen. Source notifications may still have redacted previews while locked; no missing financial details are inferred.

The dashboard/privacy controls expose pause, retention and explicit queue deletion. Deleting the companion queue does not remove PWA ledger records; deleting PWA records does not remove the companion queue. Keep external full Pennywise backups. Companion export/recovery is separate; an Android Keystore key is device-bound and is not copied by a PWA backup.

**Physical Android installation, source capture and real Sharesheet delivery are UNVERIFIED until tested on an actual device.** Use synthetic records and review-only rules first.

## Build configuration and queue recovery

The companion package is `ke.pennywise.companion` (Android 9/API 28 minimum, compile/target 35). Its build specifies AGP 8.7.3, Kotlin 2.1.20 and JDK 17; use Gradle 8.9 as documented in its README. There is no bundled Gradle wrapper and no prebuilt APK.

Use **Save selected JSON / recovery file** for a bounded 1–100 candidate export (500,000 UTF-8 bytes maximum). **Restore pending JSON file** restores stable identities into the companion queue; it does not restore source consent, Keystore keys, PWA records or configuration. Source capture is paused/disabled after recovery. Keep private exports before uninstalling.

Raw retention is off by default; **Privacy / raw retention** configures 1–90 days (default 7). Raw cleanup is opportunistic; structured pending items are not silently expired. Queue capacity is 2,000, with no eviction. Temporary share files expire after ten minutes and are cleaned/revoked on subsequent actions or resume.

Source consent is deliberately conservative: process restart/listener reconnection or permission loss pauses capture and disables sources. Re-enable the intended sources and resume future capture; notifications missed during downtime are not backfilled.
