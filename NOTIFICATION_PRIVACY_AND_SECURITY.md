# Notification privacy and security

## Data boundaries

The companion stores an encrypted local queue; Pennywise stores financial records in its existing local IndexedDB. Neither application needs a financial backend, login, analytics or AI service. The companion must not request Internet, broad SMS-reading, contacts or accessibility permissions. Android notification access is broad at OS level; package allowlisting before reading extras is the application privacy boundary.

Notification capture is future-only and optional. Enabling notification access alone must not enable every source. Pause/revocation/source disabling stops subsequent processing. OTPs, verification codes, passwords, PINs, login alerts and unrelated content are excluded rather than retained.

## Storage and key management

Companion sensitive queue data is encrypted with Android platform AES-GCM and a fresh random IV, using an Android Keystore key. App-private storage and disabled Android cloud backup avoid accidental queue uploads. Keystore encryption is device-bound; uninstall/data clearing/key invalidation may make that queue unrecoverable. Do not confuse an encrypted local queue with a portable external backup.

Raw-notification retention is minimized and disabled by default. Retention/deletion controls apply locally. PWA ingestion strips raw text; its imported structured records and historical audit remain sensitive financial data. Existing IndexedDB is not itself encrypted at rest by the application. Device/browser compromise and malicious same-origin application updates remain trust risks.

Full PWA backups retain imported inbox/rules/mappings/provenance, not the companion's separate queue or unimported staged shares. PWA encrypted backups keep existing PBKDF2/AES-GCM protection. Handoff JSON exports are sensitive plaintext files; store privately, transfer only locally, then delete temporary copies after verified receipt and backup. Do not send them in chat or commit them.

## Safe share-target operation

The custom worker intercepts `/notification-handoff` POST locally, validates size/schema and stages the batch in a separate local IndexedDB. Invalid shares return a local error; the worker never forwards notification payloads to hosting. No financial details appear in URL query strings.

**A missing service worker cannot intercept a POST.** A stale installed share target after site-data clearing could otherwise submit to the network. Therefore use the local file picker as the portable default; the companion's Sharesheet path requires the phone to be disconnected from networks first. Open/install/cache the PWA successfully before that offline handoff. An absent worker then fails offline instead of uploading financial data.

Staging is bounded (10 batches, each at most 100 candidates / 500 KB). Unimported stages are not part of a full backup; explicitly import or discard them. Candidate import and ledger approval use the existing atomic repository transaction. Share completion is not proof of receipt; companion items remain until explicit user confirmation.

## Trust and review

Payloads and claimed source names are not cryptographically signed bank records. A malicious file can claim a trusted package/confidence. Review only files from your own companion and explicitly opt into rule evaluation; never import unsolicited financial JSON. Reject malformed or unknown versions.

Rule conflicts, incomplete captures, unsafe classifications and missing references hold for review. Reference/fingerprint/idempotency checks reduce duplicates but cannot universally identify every bank/SMS wording variant or already-entered CSV transaction. Review same-day/same-amount transfers and provider-specific fee semantics.

Physical Android Keystore behavior, listener permissions, OEM background restrictions and actual Sharesheet routing require real-device testing. Automated browser simulation does not establish those facts.
