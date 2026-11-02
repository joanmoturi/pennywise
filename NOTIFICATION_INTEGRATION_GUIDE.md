# Transaction Inbox compatibility architecture

**Acquisition migrated to SMS.** Current setup and permissions are in `SMS_INTEGRATION_GUIDE.md` and `ANDROID_COMPANION_GUIDE.md`. The listener from local commit `4735052` has been removed. This file retains the original architecture audit and version-1 handoff contract for backward compatibility; it is not notification-access onboarding.

## Existing architecture audit (before implementation)

Pennywise is a React 19 / strict TypeScript / Vite 7 PWA. Financial amounts are safe integer minor units. `domain.ts` validates complete snapshots; `engine.ts` owns balance, income, transfer, receivable and liability invariants. `expense-engine.ts` handles recurring and prepaid recognition. CSV imports already require review of ambiguous receipts.

The existing IndexedDB `pennywise-private` database has one `state` object store and a `current` snapshot. `Repository.update` commits ledger changes, revisions and audit records atomically. Restore/reset retains a pre-change safety snapshot in the same transaction. Full portable backups include the complete snapshot with SHA-256 integrity and optional PBKDF2/AES-GCM encryption. The existing financial schema is 3; notification integration will migrate it to 4 without resetting any records. The object store layout is unchanged.

The existing root-scoped Workbox worker precaches the application and prompts before activation. A custom worker is needed for an offline, locally intercepted POST share target. No notification data belongs in query strings or in requests to Cloudflare.

## Implementation contract

The companion is a separate Kotlin application under `android-companion`. It has no financial ledger or Internet permission. A protected `SMS_RECEIVED` receiver checks the explicit enabled sender allowlist before accessing decoded bodies. `RECEIVE_SMS` is required; `READ_SMS` and notification access are not requested. Android does not offer a sender-scoped SMS permission, and installer policy may block this restricted permission.

The handoff is an explicit user action, not silent background synchronization. A versioned JSON file is selected in Transaction Inbox as the portable default, or shared through Android Sharesheet while completely offline. PWA share interception must be primed by a successful installed online load. A missing worker cannot intercept a network POST, so the companion blocks Sharesheet while any network is active. If the share target is missing or unsupported, keep the queue and use the local file picker.

Payload contract:

```json
{
  "format": "pennywise-notification-batch",
  "version": 1,
  "batchId": "stable-uuid",
  "createdAt": "2026-11-02T18:00:00Z",
  "candidates": [{
    "id": "stable-uuid",
    "source": "synthetic.example",
    "parserId": "synthetic-labelled",
    "parserVersion": "1",
    "capturedAt": "2026-11-02T18:00:00Z",
    "occurredAt": "2026-11-02T17:59:00Z",
    "reference": "TEST001",
    "amount": 500000,
    "currency": "KES",
    "direction": "credit",
    "kind": "received",
    "counterparty": "TEST sender",
    "fee": 0,
    "balance": 1500000,
    "confidence": 95,
    "missing": [],
    "validation": "valid",
    "fingerprint": "64-lowercase-hex-sha256"
  }]
}
```

Amounts, fees and balances are integer minor units, never floating point currency values. Optional fields may be omitted, not invented. Directions: `credit`, `debit`, `unknown`. Kinds: `received`, `sent`, `withdrawal`, `deposit`, `transfer`, `merchant`, `paybill`, `buy_goods`, `charge`, `loan_repayment`, `interest`, `coupon`, `refund`, `principal`, `reversal`, `failed`, `balance`, `unknown`. Validation: `valid`, `incomplete`, `excluded`. Confidence is 0–100; missing is an array of field names. Optional `originalReference` links reversal candidates; optional `senderId` records the detected SMS sender, and `accountHint` identifies an explicitly extracted account/channel. Raw text is optional, bounded and disabled by default; sensitive content must be excluded before persistence. The historical `pennywise-notification-batch` name remains unchanged to preserve backups and existing imports.

PWA inbox/rules/source mappings/fingerprint receipts are part of the complete financial backup. Companion configuration and pending queue are separate and are not included in that backup.

Each import and approval occurs inside the existing atomic repository mutation, never a parallel ledger. Repeated payloads do not post twice; conflicting updates are held. No source is trusted merely because a JSON file claims a bank package or a high confidence: automatic rules require an explicitly trusted source mapping and a constrained rule. Files are not cryptographically authenticated bank statements.

Sharesheet success does not prove PWA import. The companion retains entries until the user imports the PWA's local receipt and confirms exact ID/fingerprint matches. Sharing retries retain candidate IDs. Receipt confirmation means inbox persistence, not financial approval. Exported files contain financial data and need private handling.

## Platform references

- Android SMS broadcasts: <https://developer.android.com/reference/android/provider/Telephony.Sms.Intents>
- Android cryptography: <https://developer.android.com/privacy-and-security/cryptography>
- Web Share Target / service-worker POST: <https://developer.chrome.com/docs/capabilities/web-apis/web-share-target>
- Worker strategy: <https://vite-pwa-org.netlify.app/guide/inject-manifest>

Current results and physical-device limitations are recorded in `SMS_INTEGRATION_TEST_REPORT.md`. `NOTIFICATION_INTEGRATION_TEST_REPORT.md` is explicitly historical.
