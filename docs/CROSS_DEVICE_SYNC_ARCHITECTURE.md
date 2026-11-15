# Encrypted cross-device workspace sync

Implementation date: November 15, 2026. Branch:
`feature/encrypted-cross-device-sync`. Not enabled or deployed to production.
The branch includes the separate backup-health/daily-dashboard improvement.

## Scope and separation

This is optional synchronization, not another financial engine. Existing schema-5
IndexedDB records, calculations, manual backups, CBK lookup and Drive backup
remain in place. There is no automatic conversion of existing records and no
sync-provider network operation merely because a customer opens Pennywise or Backup Centre.
Firebase is dynamically initialized only after Connect Google for Sync.

Google Drive stores independent encrypted backup snapshots in the customer's
Drive. New sync stores an encrypted current workspace in the application-owned
Firestore project. Firebase Google authentication is separate from Drive
authorization; enabling one does not authorize or enable the other. Gmail is
used for account identity, not mailbox access.

## Protocol and storage

- One workspace per verified Google/Firebase UID and project, currently `main`.
- Head: `users/{uid}/workspaces/main`. Fields: protocol, generation UUID,
  ciphertext chunk count, SHA-256 digest and previous generation pointer.
- Immutable chunks: `users/{uid}/snapshots/{generation}/chunks/{index}`.
  Each document contains only a `ciphertext` string: a slice of the encrypted
  backup envelope, not financial records or an email address.
- Maximum 16 chunks of 200,000 characters, with an overall 3,200,000 UTF-8 byte
  cap checked before publishing. Encryption/base64 overhead counts toward this
  limit. Larger workspaces remain usable locally and through existing backups.
- Actual Firebase SDK transactions compare the expected head generation before
  atomically publishing chunks and the new head. A stale writer must review;
  no last-write-wins overwrite. Current and previous snapshots are retained;
  each successful commit deletes the old grandparent's chunks.
- Readers assemble all chunks and verify SHA-256, authenticated decryption,
  complete backup validation and record relationships before applying anything.
  Missing, outdated or invalid chunks fail closed; retry the latest head.

Snapshot ciphertext includes the full validated financial state, receipts and
audit trail. Revision numbers and audit entries are excluded only from the
local comparison digest, because restore audits differ across devices. Financial
records and settings remain in that digest. The digest is stored locally, not
sent to Firestore in plaintext; the remote digest covers ciphertext.

## Initial connection, normal edits and conflicts

Connection alone never transfers or replaces records. A user supplies and
confirms a sync passphrase of at least 12 characters. If cloud data exists, it
must decrypt successfully before review. Initial review shows counts for both
versions; the user must export encrypted safety copies of every available
version and acknowledge replacement before selecting a source. Exports are
ordinary encrypted cloud-backup files, readable by the existing full restore
picker using the sync passphrase, without an active Google session.

After explicit linking, compare the local financial digest and remote head
against the last synchronized base:

| Changes since base      | Action                                                     |
| ----------------------- | ---------------------------------------------------------- |
| Neither                 | Mark synchronized; no upload                               |
| Local only              | Encrypt and publish using compare-and-swap                 |
| Cloud only              | Validate, retain local safety snapshot and guarded-restore |
| Both, identical content | Reconcile markers without another upload                   |
| Both, different content | Stop for explicit version review; never merge              |

The active app debounces local revisions for 10 seconds, watches the remote
head, and checks every 60 seconds while visible and on online/visibility events.
Errors stop automatic retries until Sync Now or another explicit unlock. Offline
changes remain local and retry when connectivity returns. A missing previously
linked cloud head is an error, not permission to silently republish.

Both upload and incoming apply retain the digest of the actual synchronized
snapshot, not a later local reread. Edits arriving during encryption, upload or
immediately after apply therefore remain dirty and are sent later.

Incoming replacement uses the existing guarded Repository update, preserving a
pre-replacement safety snapshot and combining local/remote audit IDs. Local
revision is checked inside the committing transaction. Open forms in the same
tab delay automatic apply. Initial choice and automatic sync are serialized
across same-origin tabs using Web Locks. **Keep one editing tab per device:**
other tabs' unsaved form state is not coordinated by this form guard.

## Encryption and privacy boundary

Existing AES-256-GCM envelope encryption is reused: a fresh random data key,
random IVs and salt, PBKDF2-SHA-256 with 600,000 iterations for password wrapping.
Metadata is authenticated as additional data. Sync additionally requires the
authenticated context `firebase:{projectId}:{uid}:main`, preventing another
account/project's snapshot from being accepted as this workspace.

Passphrases and Firebase Auth sessions use memory only. Auxiliary IndexedDB
stores account/project binding, random device ID, enabled/linked flags and base
markers, never a passphrase or Auth token. Reload requires Google reconnection
and unlocking. Pause disconnects and clears encryption material but deliberately
retains account binding. A different UID/project cannot silently inherit this
browser's records; use a separate profile. No cross-account migration UI exists.

Firebase can see the Google authentication identity and sync timing, ciphertext
size, generation identifiers, and the backup envelope's device/revision/version/
creation metadata. Financial content is encrypted in the browser. This is not
an independently audited cryptographic product or a zero-metadata service.
An attacker who can execute application code while unlocked, or who compromises
the delivered client code, can access plaintext and keys. No App Check or
per-user server rate limiter is provided; valid users can consume shared quota.

**Local IndexedDB is not encrypted at rest.** Lock, pause and sign-out are not a
local privacy lock and do not erase local records. Use separate browser profiles
on shared devices. Google/Gmail recovery cannot recover a lost sync passphrase.
Keep it separately, plus independently tested encrypted backups. Passphrase
rotation, key sharing, household collaboration and lost-passphrase reset are
not implemented. Do not select different passphrases on different devices.

Rules require UID ownership, verified email and a Google sign-in token. Public
access, listing workspaces, other-user access, unrecognized paths, extra
plaintext document fields, malformed heads and mutable chunks are denied.
These rules enforce access/shape, not the truth of an owner's ciphertext.

## Cost and availability

Use Spark without linking billing. Firebase documents Spark as requiring no
payment information. Firestore's published free allowance is shared across the
project, not per Pennywise customer: one free database, 1 GiB stored data,
50,000 reads/day, 20,000 writes/day, 20,000 deletes/day and 10 GiB/month outbound
transfer. Check current provider terms before release; do not promise unlimited
free service. No Cloud Storage, Functions, paid financial API or server is used.

The one-minute foreground polling can consume roughly 1,440 head reads per
device for a full day open, plus listeners, chunk reads and transaction retries.
Publishing uses up to 17 writes and prunes up to 16 old chunks. Monitor both
operation and bandwidth limits. Quota exhaustion stops optional sync; it must
not prompt a billing upgrade or block ordinary local use. An abusive valid
account can exhaust shared allowance. Scale/capacity decisions remain a release
responsibility, not an assurance of unlimited customer growth.

References checked November 15, 2026:

- <https://firebase.google.com/docs/projects/billing/firebase-pricing-plans>
- <https://firebase.google.com/docs/firestore/quotas>
- <https://firebase.google.com/docs/auth/web/google-signin>

## Rollback and retention

No production merge, resource provisioning or deployment was performed for this
feature. Omit the three Firebase build values to keep the panel disabled, or
roll back the frontend commit while retaining existing financial schema-5
storage. Never clear browser data as a rollback method. Keep existing Drive
configuration intact. Remote ciphertext remains in Firestore after pause or
frontend rollback; pause is not cloud deletion. There is no customer cloud-delete
button in this version. For deletion, the owner must verify the requester and
remove that UID's workspace/snapshot subcollections through trusted Firebase
administration, and handle its Auth account separately. Never publish Admin
credentials in the PWA. Snapshot sync is not an immutable backup history.

Implementation: `sync-protocol.ts` (limits/digests), `workspace-sync.ts`
(state machine), `firebase-sync.ts` (Auth/Firestore), `workspace-sync-ui.tsx`
(provider/review), `cloud-crypto.ts` (authenticated context), and
`firestore.rules`. AppContext/App/Backup Centre and CSP integrate it without
changing the ledger schema or financial calculations.
