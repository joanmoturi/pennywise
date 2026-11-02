# Pennywise local SMS integration

## Acquisition boundary

The existing companion was migrated from `4735052`: `CaptureService`/notification-listener access and application discovery have been removed. `SmsReceiver` listens only for Android's protected `Telephony.Sms.Intents.SMS_RECEIVED_ACTION`; it does not become the default SMS app, read the SMS provider or query history. `RECEIVE_SMS` is the only dangerous/runtime permission. `ACCESS_NETWORK_STATE` remains solely for offline share gating.

Android delivers this broadcast to eligible SMS receivers in the background; the documented background-broadcast exception applies. Compile/target API 35 and minimum 28 remain unchanged. `getMessagesFromIntent` (API 19) decodes carrier PDUs/encoding; normal SMS is distinct from RCS, MMS, data-SMS and messages in other apps.

The permission is hard-restricted and can be unavailable unless the installer allowlists it. The system prompt must succeed; there is no bypass or competing notification-reader fallback. See `ANDROID_COMPANION_GUIDE.md`.

## Sender configuration

Add a sender ID or phone number manually, using the actual identifier shown in your SMS app. New entries start disabled. Configure/test the parser, enable that sender, and explicitly resume processing.

- Alphanumeric IDs compare with ASCII case folding, trimmed outer whitespace and collapsed internal spaces.
- Numeric sender formatting removes spaces, parentheses, periods and hyphens; a leading `+` is preserved.
- Local/international prefixes, `00` versus `+`, and alphanumeric punctuation are **not** guessed or merged. `M-PESA` is distinct from `MPESA`; add both only if both are genuinely intended.
- Unsupported/confusable Unicode, controls, wildcards, very short/long numbers and invalid identifiers are rejected.
- Duplicate canonical senders cannot be added; ambiguous configurations fail closed.

The list supports add/edit, disable without deletion, removal and last actual detected sender. No sender is discovered from history or silently added. Removing a sender does not delete already pending candidates. Legacy package configurations retain parser settings but migrate paused/disabled with no sender consent.

Each SMS source gets `sms.s` plus SHA-256 of the canonical identifier. This is a stable routing identifier, not encryption or sender authentication. New sources require explicit PWA mappings; old candidates and source rules retain their identities.

## Receiving and parsing

1. Check permission, first-unlock/secure-device availability, master pause and configuration revision.
2. Decode a bounded PDU broadcast to obtain originating addresses. Only after every part matches one enabled sender does acquisition access message bodies.
3. Accept framework text formats `3gpp`/`3gpp2`; join multipart text in the telephony-delivered order within that broadcast. Reject mixed senders, malformed/oversized parts, invalid timestamps, replacement-character/NUL decoding failures and unsupported formats.
4. Do not create a cross-broadcast raw-body accumulator. Public API does not expose a universal concatenation completeness proof; partial/unrecognized financial fields must not be invented.
5. Exclude known sensitive OTP/PIN/password/login wording and unmatched/balance-only text. Run the existing modular labelled parser locally.
6. Recheck permission, source consent and revision before recording, so pause/source changes cannot commit stale work. Queue/dedup/receipt mutations retain existing SQLite transaction behavior.

Only newly delivered broadcasts after explicit activation are considered; no history is queried. A delayed carrier SMS arriving after activation can qualify. SMS service-centre timestamps must be positive, not more than five minutes ahead, and consistent within multipart delivery. They never substitute for the actual transaction `Date`.

Profiles `mpesa`, `equity`, `kcb` and `generic` still use **synthetic labelled formats only**, with optional extracted account/channel. Categories include received/sent/paybill/till, credits/debits, transfers, independent charges, loan recovery/liability settlement, coupon/principal, reversal and failed/balance-only cases. This is structural coverage, not verified real-provider prose or accuracy. See `TRANSACTION_PARSING_REFERENCE.md`.

## Queue, handoff and confirmation

The companion and PWA have separate stores. No automatic background synchronization is claimed.

1. Keep candidates in the local queue while Pennywise is closed/unavailable/offline.
2. Select up to 100 and save private JSON; in Pennywise **Transaction Inbox**, choose **Companion transaction file**. This local file picker does not upload to Cloudflare.
3. Alternatively prime/install the PWA online, disconnect **all** phone networks, then use **Share selected JSON → Pennywise**. Remain offline throughout. A stale/missing worker must fail offline, not send a financial POST to hosting.
4. Pennywise validates the version/size/schema and stages or imports explicitly. Rule evaluation requires the existing trusted-file checkbox; safe posting/accounting checks are unchanged.
5. Verify the inbox, then choose **Download local receipt**. Import that file through the companion's **Import Pennywise confirmation receipt** and confirm exact pending ID/fingerprint matches.
6. Only those confirmed matches leave the queue and increment the new imported counter. A share chooser, saved file, failed import or wrong receipt changes no imported count. Other/conflicting versions remain retryable. Receipt means inbox persistence, not ledger approval, and is not cryptographically signed.

The historical version-1 batch/receipt format names and worker path are intentionally unchanged. Optional `senderId` metadata is accepted without replacing financial schema 4 or altering existing ledger postings. Old payloads/backups still work.

Use the matching PWA source revision for SMS files. This work is local only: the existing Cloudflare deployment has not gained the new Inbox/metadata support. Desktop localhost checks exercise the local production build; a phone-to-PWA acceptance test must wait for an explicitly authorized matching deployment or another trusted secure test installation. Do not expect an older deployed PWA to accept new fields.

PWA receipt export currently lists original inbox candidate identities. A conflicting updated candidate not listed by that receipt remains pending in the companion; resolve/review explicitly rather than deleting it based on a chooser success. Receipt import is bounded to 10,000 entries / 2.5 MB.

## Status and reliability

Dashboard: permission state; paused/enabled state; configured senders and last detected identifier; processed, pending, receipt-confirmed imported and duplicate counts; last successful candidate-processing time; fixed failure counters for malformed/timestamp/encoding/unrecognized/sensitive/storage/overload outcomes. No message bodies or exception details are logged.

Ordinary process recreation preserves enabled senders/master consent; a new broadcast can start the manifest receiver. Observed permission loss pauses capture and stops eligible work; regrant does not automatically resume it through onboarding. Force-stop, OEM battery policies, pre-first-unlock downtime, delivery suppression and queue saturation can lose captures. No history backfill or delivery guarantee is claimed.

Pause immediately, disable/remove one sender, revoke SMS permission in system settings, or explicitly delete pending data. Pending deletion does not delete PWA records. Keep separate recovery files and full encrypted PWA backups; they cover different stores.

## Primary platform references

- https://developer.android.com/reference/android/provider/Telephony.Sms.Intents
- https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS
- https://developer.android.com/develop/background-work/background-tasks/broadcasts/broadcast-exceptions
- https://developer.android.com/about/versions/15/behavior-changes-all
- https://developer.android.com/build/releases/agp-8-7-0-release-notes

These were consulted for API availability, protected/system SMS broadcasts, restricted permission, background delivery, stopped-state limitations and the unchanged toolchain baseline. Device behavior still needs actual Android testing.
