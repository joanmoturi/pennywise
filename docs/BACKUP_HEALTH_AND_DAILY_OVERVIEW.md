# Backup health and daily overview

Updated November 15, 2026. Branch: `feature/backup-health-daily-overview`.
This is a presentation/usability enhancement, not a financial-engine rewrite.

## Daily use

Overview keeps actual available money and the existing discretionary allowance
upfront, followed by backup health and daily priorities:

- **Budget remaining** uses the active budget's existing calculation, including
  automatic recurring allocations, spending, funding and captured savings.
  It is explicitly a plan, not additional cash.
- **Transactions to review** counts pending, error and conflict inbox records.
  Approved, rejected and duplicate items are not counted. Opening the inbox does
  not approve or post a transaction.
- **Upcoming bills & overdue items** shows unpaid recorded necessities, active
  recurring occurrences and debts due on or before today plus seven days.
  Overdue items sort first. The first four items link to their existing modules;
  a larger list explicitly reports truncation. No aggregate spendable balance
  is inferred from this mixed list.
- **Record expense**, **Record income**, account management and budget planning
  still use their existing forms. An empty workspace starts with account setup.
- **Financial details & reports** is a native keyboard-accessible disclosure.
  It retains the existing asset/business/savings metrics, forecasts, charts,
  planning information and purchase assessment; it starts collapsed.

Paid, skipped, prepaid and inactive recurring periods do not appear as unpaid
daily bills. Partial payments use the existing remaining-amount helpers.
Unentered bills cannot be inferred. Future receipts remain excluded from actual
available money. Negative availability keeps an upfront warning.

## Backup health

The same status card is available on Overview and at the top of Backup Centre.
Overview opens the existing Backup Centre; its next-action button then moves
keyboard focus to the relevant connection, passphrase, upload, progress or
manual-download control. Moving focus never grants consent or submits a backup.

| Status             | Meaning                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backed up          | The saved queue has a file ID, a valid last-success timestamp, no pending ciphertext and the same verified revision as current local state; no current failure/retry gate applies. |
| Changes pending    | There is no confirmed snapshot of the current revision, retained pending/retry work, or offline changes waiting for connectivity.                                                  |
| Action needed      | Reconnect the bound Google account, unlock encryption, review a failed operation, configure the shared service, or use manual backup when optional status storage cannot be read.  |
| Backup in progress | Upload or read-back is running; uploaded bytes alone are not verified success.                                                                                                     |
| Backup is off      | Automatic backup is disabled. Prior verification time, if any, remains visible separately.                                                                                         |

An offline device with a current verified revision may still show **Backed up**,
but explicitly says new backups require a connection. Disabled/unconfigured
service and authorization/encryption requirements are never hidden by an old
success timestamp. A financial revision change invalidates a healthy badge
immediately, before the next asynchronous status refresh.

The card refreshes existing local auxiliary metadata every two seconds and on
focus/online/offline events. It does not initialize Google, fetch a remote file,
save a financial transaction, authorize an account, unlock encryption or start
an upload. The existing active-app monitor remains responsible for scheduling.
Optional metadata access uses the existing storage helpers and does not change
the financial revision. Status-read failures leave the financial workspace usable
and provide a manual-backup route.

**Last verified Drive backup** is a device-local observation, not a fresh remote
existence check. Files deleted outside Pennywise cannot be detected from this
badge alone. A **manual export initiated** timestamp is displayed separately:
the browser cannot prove a downloaded file was kept safely.

## Architecture and preservation

- New pure selectors: `src/backup-health.ts` and `src/daily-overview.ts`.
- New presentation: `src/backup-health-ui.tsx`.
- Integration: existing Overview/Backup Centre and optional IDs on existing
  buttons/inputs for accessible recovery focus; existing palette retained.
- No changes to financial schemas, database versions, ledger calculations,
  record IDs/relationships, backup formats, encryption, consent scopes,
  retention, upload verification or restore semantics.
- No backend, paid API, persisted encryption secret or closed-app scheduling
  was introduced. No existing records are migrated by these UI changes.

The feature branch includes the code, automated tests, this design/user guide,
the usability test report, the existing documentation history and refreshed
synthetic desktop/mobile overview screenshots. It does not merge into `main`
or change production as part of this branch delivery.

## Preview and rollback

Run the existing local commands from README. Drive controls need the shared
application OAuth environment configuration; ordinary local usage does not.
E2E builds deliberately use a synthetic client and must not be uploaded as a
production release. A real release must rebuild with the actual public client.

Because there is no schema change, switching back to the previous application
revision requires no new database migration. Keep a portable full backup before
any release; never clear browser data to roll back a presentation issue.
See [USABILITY_TEST_REPORT.md](USABILITY_TEST_REPORT.md) for actual checks and
the distinction between synthetic-provider and user-reported real-account tests.
