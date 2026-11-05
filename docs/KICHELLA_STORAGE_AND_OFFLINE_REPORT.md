# Kichella storage and offline report

November 5, 2026.

## Preserved contracts

Production origin stays `https://pennywise-7lz.pages.dev/`; database name stays
`pennywise-private`; financial schema stays 4. Accounts, ledger records, Inbox,
rules, audit, receipts and full-backup/encryption formats remain supported.
Package version and portable backup identifiers remain unchanged.

Physical IndexedDB upgrades from 3 to 4. The `state/current` header contains
settings, revision and ordered collection IDs. Individual records live in the
`records` store. Changed records, audit and header commit in one transaction
after full financial validation. Restore/reset retains the prior full state at
`state/safety-before-destructive` in that same transaction.

Migration validates the legacy state before committing the new stores/header.
An invalid migration aborts and leaves the original database intact. A blocked
open reports that other app tabs should be closed; neither failure path resets
the database. Optional cross-tab messaging is not a commit prerequisite.

## Automated evidence

- Physical-v3 migrations with financial schemas 1, 2, 3 and 4 preserve balances,
  accounts and transactions and can export/read a full backup.
- Invalid migration preserves the original v3 store and contents.
- Targeted-write, cross-connection serialization, cache isolation, quota and
  abort regressions pass.
- Desktop/mobile offline account, budget, recurring and transaction create/edit
  workflows survive reload; repeated submissions persist once.
- A genuinely blocked write aborts on the deadline, retains entries and commits
  exactly once when retried.
- Full/encrypted backup restore, corrupt-file rejection, safety export,
  service-worker updates and no-financial-upload tests pass.
- Existing Inbox import, approval rules, duplicate handling and schema recovery
  pass in both browser projects.

Full browser result: 32 passed. A restored-database **offline full browser
close/reopen** scenario was not separately added; reload, independent-context
restore and offline saves were tested, not every combination.

## Upgrade and rollback procedure

1. Before updating a personal installation, download a Full Backup and keep a
   copy outside this browser/device. Hosting and a Git branch are not backups
   of financial records.
2. Finish edits, close other app tabs, and accept the available update. Reload
   online if necessary; never clear site data as an update step.
3. Check account balances, transaction count and a recent record. Export another
   backup after a successful upgrade.
4. If upgrade fails, keep browser data intact, close other tabs and retry. Do
   not reset/uninstall; investigate the displayed storage/validation error.
5. After physical version 4 is committed, **do not deploy the old version-3
   opener as a rollback for upgraded users**. It cannot open that database.
   Prefer a forward fix retaining the v4 storage reader.
6. If reverting code is unavoidable, first export using v4-compatible code and
   verify restoring that backup with the intended recovery build in an isolated
   browser profile. Never delete or downgrade the only copy of user data.

The baseline Git branch preserves code, not an automatic database downgrade.
Storage is browser-local, not automatically encrypted at rest by this change.
Only explicitly encrypted full backups use the existing tested encryption.
Browser eviction, private-browsing limits, physical-device interruption and
owner-profile recovery are not guaranteed or verified.
