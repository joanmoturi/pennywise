# SMS privacy, permissions and protection limits

## Exact permissions and access

The companion requests **RECEIVE_SMS** (dangerous/runtime, new incoming broadcasts) and **ACCESS_NETWORK_STATE** (normal, to refuse online Sharesheet sends). The receiver requires its caller to hold **BROADCAST_SMS**; the companion does not request that privileged permission.

There is no READ_SMS, SEND_SMS, Internet, contacts, call logs, accessibility, notification listener, boot permission, inbox/provider query, or request to become the default SMS app. It cannot read other apps' messages, historical SMS, RCS or MMS.

Android's SMS grant is not sender-scoped. The framework must decode PDUs to expose addresses; the app checks every sender before accessing decoded bodies. Unapproved/disabled senders' contents are not persisted, displayed or logged. Granting permission does not add senders or resume capture. The installer must allowlist hard-restricted RECEIVE_SMS before a grant is possible; no restriction-bypass workaround is implemented.

Sender normalization is conservative and IDs are spoofable. Selecting a bank-like identifier or matching a reference is not proof of bank authenticity. Never trust unsolicited JSON files or broad rules.

## Necessary local data

The existing Keystore AES-256-GCM implementation is retained for configuration and queued payloads, with random IVs and record-specific authenticated context. There is no plaintext fallback and no key export. **The 13 Android instrumentation tests, including crypto round-trip, IV uniqueness, tamper/wrong-context rejection, key configuration and storage persistence, passed on an API-35 AOSP emulator.** This is not hardware-backed-key attestation, physical-device verification or independent encryption certification. SQLite's routing IDs, hashes, counters and timestamps are not full-database encrypted. Device compromise can expose data after unlock.

Credential-encrypted storage requires first unlock after boot; capture also requires a configured device PIN/password. Keys do not require per-use screen authentication, so screen relock need not block by design. Unlocked emulator capture/storage was exercised; screen-relock, direct-boot, physical-device and OEM-specific behavior remain unverified. Key loss/uninstall/app-data clearing can destroy pending recovery; do not reset data without private exports.

Raw SMS retention is OFF by default. Only matched financial candidates can optionally retain up to 4,000 characters, for configured 1-90 days (default 7). Cleanup is opportunistic, not a guaranteed wall-clock deletion job. Legacy longer retained raw bodies remain readable locally but exports are bounded to 4,000 characters. Structured pending items never silently expire; queue cap 2,000 has no eviction.

Known OTP/PIN/password/login/authentication content and unmatched/balance-only messages are excluded before persistence. These are conservative filters plus strict financial-format matching, not proof that every possible secret wording is recognized. Unknown real-bank prose is not collected as an error archive. No message bodies, amounts, account numbers, references or sensitive exception text are logged. Only fixed diagnostic counters and last successful processing time are shown.

App screenshots are blocked with FLAG_SECURE. Android backup/data extraction is disabled. No analytics, telemetry, crash SDK, cloud database, financial API client or local HTTP server is introduced.

## Exports and PWA

Transfer JSON is sensitive **plaintext**. The private read-only content provider grants temporary URI access, uses unpredictable filenames and cleans/revokes expired shares on subsequent actions/resume; ten-minute expiry is not a background timer. Deleting a provider file cannot recall a copy another app already read.

Use local Inbox file selection as the portable default. Storage Access Framework providers/other share targets may independently sync to cloud; choose a trusted local location. The companion's lack of Internet permission does not prevent another chosen app from uploading data.

Sharesheet is permitted only with no active network. Remain completely offline throughout: a cleared/missing worker cannot intercept a POST and an online browser could send it to hosting. The existing worker validates/stages locally and does not forward data. File picker is safer if installation or worker control is uncertain. No financial values appear in URLs.

Sharesheet completion is not acknowledgement. Only a selected PWA receipt with exact pending IDs/fingerprints, explicitly confirmed by the user, removes candidates and increments the new imported count. Receipts are local evidence, not signed proof; an attacker with access to files/device could forge one. Failed/unmatched receipts retain the queue.

Pennywise still validates every candidate, strips raw text at ingestion, uses atomic existing ledger mutations and enforces duplicate/account/rule/financial invariants. Its IndexedDB is not encrypted at rest by the app. Full encrypted PWA backups retain imported inbox/rules/mappings/provenance, not the native queue/configuration or unimported staged shares.

## Disable/delete and residual limits

Use **Pause now**, disable individual senders, or revoke SMS permission. Pending workers recheck permission/revision before persistence. Explicit queue deletion pauses/disables capture and clears pending data plus native dedup receipts; it does not delete PWA records or copies exported elsewhere. Reimport remains guarded by PWA provenance.

Native compilation, lint, 27 JVM tests and 13 emulator instrumentation tests passed. Actual emulator permission denial/grant/revocation, sender gates, SMS capture, process restart, offline capture and explicit local-file/receipt exchange were exercised. The PWA side used isolated desktop browser contexts, not an installed Android PWA share target. Physical devices, real carrier formats, OEM behavior and Android browser Sharesheet routing remain unverified. See `ANDROID_BUILD_AND_DEVICE_REPORT.md`; this is not an independent security certification. The earlier phone-hang report and broader financial acceptance audit are not claimed resolved.
