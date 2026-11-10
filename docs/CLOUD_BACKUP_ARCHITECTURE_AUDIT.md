# Cloud backup audit - 2026-11-10

## Actual starting status: partially implemented foundations, no cloud backup

Inspected `domain.ts`, `storage.ts`, `backup.ts`, `pages-backup.tsx`,
`App.tsx`, `sw.ts`, `index.html`, `public/_headers`, package scripts and
existing storage/backup tests. There was no identity provider, OAuth client,
Drive repository, cloud queue or cloud backup UI. Do not describe the existing
encrypted download as a Google Drive backup.

Financial schema 5 uses IndexedDB `pennywise-connected-v5`, physical version 5,
with `state` headers and individually keyed `records`. Previous
`pennywise-private` storage is copied without modifying it. Collections:
accounts, transactions (including receipts), incomes, liabilities, receivables,
bonds, events, budgets, necessities, reserves, rules, scenarios, recurring,
occurrences, occasional, prepaids, captures, reviews, audit, businesses,
budgetChanges, allowances, notifications.inbox/rules/sources. Settings are in
the header. Revisions increment transactionally; cross-tab notifications use
BroadcastChannel. There is no separate attachments store.

Existing full backups include the complete validated State with schema/app
versions and canonical SHA-256 integrity. Existing encrypted downloads use
PBKDF2-SHA-256 (600,000 iterations), AES-256-GCM, 16-byte salt and 12-byte IV.
Existing replacement restore validates relationships, commits atomically and
retains a pre-destructive safety snapshot. Manual backups must remain readable.

The service worker precaches application assets, not financial data or remote
credentials. Cloudflare Pages is a static Git-integrated deployment; both HTML
and response headers originally restricted network connections to self.
No configuration credentials were supplied. No deployment is authorized.

## Selected architecture

User approved Google-only Google Identity Services on 2026-11-10. Firebase
would add email/password recovery and managed application sessions, but is
unnecessary for this Google-only browser release. No Firestore or backend.
Google sign-in identity and Drive authorization remain separate. A visible
Pennywise Backups folder uses drive.file, not full Drive access or appDataFolder.
Short-lived access tokens and unlocked passphrases are memory-only.

Use the existing consistent Repository.read snapshot and encryption/restore
primitives. Add a separate auxiliary IndexedDB database for queue/configuration
and public bond references; do not migrate or replace financial storage.
The existing revision committed in each financial transaction is the durable
dirty marker. A recovered/reopened app reconciles it with queue state, even
when the tab closed before any cloud scheduler callback ran.

## Boundaries, risks and cost

Only Google receives identity/consent data and encrypted backup bytes.
No financial database, paid API, scheduler or account-owned backend is needed.
OAuth client configuration and Drive API enablement are external prerequisites.
Drive storage consumes the user's quota; no paid service is provisioned.
No execution is promised while the browser is closed, no refresh token is
stored, and expired consent requires user interaction. Backups are snapshots,
not multi-device live synchronization. Merge is intentionally unsupported:
replacement plus a safety snapshot is safer than guessed financial conflicts.
Local records remain available regardless of authentication state.
