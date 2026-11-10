# Optional cloud backup architecture

The approved initial release is browser-only Google Identity Services, with
independent Drive consent. Local financial IndexedDB remains the operational
source of truth. This is snapshot backup, not live synchronization.

Components:

- `google-services.ts`: signed identity validation, memory-only Drive tokens,
  application-owned Drive files, pagination, bounded download and error classes.
- `cloud-crypto.ts`: versioned encrypted snapshot envelope, recovery wrapping,
  authenticated metadata and passphrase rewrapping.
- `cloud-backup.ts`: consistent snapshots, durable encrypted pending payload,
  stable upload IDs, read-back verification, retention, retries and revision checks.
- `cloud-backup-ui.tsx`: active-app scheduling, consent/account controls,
  history, explicit restore preview, safety export and post-restore checks.
- `auxiliary-storage.ts`: independent optional feature database. No financial
  database migration is needed for the cloud service.

All State collections and settings, including receipts and saved bond references,
use the existing validated full-backup format. Auxiliary provider identity,
Drive tokens, queue configuration, passphrases, public reference cache,
temporary UI, Android companion queue and unimported handoffs are excluded.
The auxiliary queue stores encrypted payloads and nonfinancial snapshot metadata.

Original schema/app backup formats remain readable. Added optional bond fields
are for this build; export before switching builds and do not load these new
records into an older strict-schema build. There is no automatic cloud merge.

No Firebase, application financial backend, hosted database, analytics, new
package dependency or paid API was added. The optional fixed-upstream CBK
adapter is unrelated to Google backups and receives no financial data.
