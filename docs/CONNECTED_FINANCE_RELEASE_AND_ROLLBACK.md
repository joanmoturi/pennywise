# Pennywise 1.3.0 release and rollback

## Protected versions

| Item                                               | Reference                                      |
| -------------------------------------------------- | ---------------------------------------------- |
| Production origin                                  | `https://pennywise-7lz.pages.dev/`             |
| GitHub repository                                  | `joanmoturi/pennywise`                         |
| Production branch                                  | `main`                                         |
| Previous production source                         | `82d0a4ece97e28edc426cc9870ccda72f6c59d73`     |
| Previous source preserved remotely                 | `backup/pennywise-before-connected-2026-11-06` |
| Previous successful Pages deployment               | `374db5d5-abfb-4eed-a020-c86db5028182`         |
| Previous main asset                                | `/assets/index-CQwo0I5C.js`                    |
| Connected implementation before release safeguards | `895e9ffff76546d8c9c827681f8171561cc96085`     |
| Release tag                                        | `release/pennywise-1.3.0`                      |

This runbook describes recovery. Deployment success must separately be verified
against the GitHub Cloudflare Pages check for the release commit and the actual
live assets, not inferred from a push.

## Your existing information carries forward

The application still uses the same production URL. On the first opening of this
release, it reads the existing `pennywise-private` database without upgrading or
writing to it, validates the records, and copies them into
`pennywise-connected-v5`.

The new workspace retains account balances, transaction IDs, income, debts,
budgets, settings, histories, receipts, Inbox relationships and existing safety
backup. Business classifications are not guessed. The financial schema becomes
5 only in the new workspace.

The copy and completion marker are committed together. An interrupted or
quota-failed copy does not mark the copy complete and does not change the old
database. The application reports failure instead of silently showing an empty
workspace. Retrying can complete the copy.

After a successful copy, later launches use the new workspace. They do not
re-copy the old records over transactions entered in the new version. Concurrent
initial launches check the completion marker within the target write transaction.

This requires additional browser storage. Keep an external full backup: neither
database survives clearing site data, origin eviction or device loss.

## Before opening the update

1. Download a full backup from the current application and verify the download.
   Keep this schema-4 backup separately from later schema-5 exports.
2. Save open forms and close other Pennywise tabs/windows to avoid editing the
   old workspace while the new workspace is being copied.
3. Reopen the existing production URL. When offered, choose **Reload update**.
   A cached installation can remain on the old version until it accepts the
   update; no forced form-discarding reload is used.
4. Confirm accounts and recent transactions are present before adding new data.

Do not clear browser/site data, unregister storage, change domains or manually
delete either database as an update step.

## If you prefer the previous version

### Immediate website rollback

1. While the new version is still available, export its full backup too.
2. In Cloudflare, open **Workers & Pages > pennywise > Deployments**.
3. Select the previous successful **production** deployment
   `374db5d5-abfb-4eed-a020-c86db5028182` and choose **Rollback**.
4. Confirm the production entry references `/assets/index-CQwo0I5C.js`.
5. Close other Pennywise windows, reconnect and accept the available update.
   The previous application then opens the preserved `pennywise-private`
   database at physical version 4.

Cloudflare documents successful production deployments as rollback targets:
`https://developers.cloudflare.com/pages/configuration/rollbacks/`.
Do not delete the protected production deployment while evaluating this release.

**A rollback reopens the pre-upgrade records. Entries made in the new version
remain in `pennywise-connected-v5`, but cannot be displayed by the old app.**
Returning to this release reopens those newer records; it does not erase them.

Do not restore a schema-5 backup into the old schema-4 application. Changes made
after rollback in the old workspace and changes made in the new workspace are
separate histories, not an automatic two-way merge. Export both before any
further version switch or reconciliation.

### Keep GitHub consistent with the website rollback

A Cloudflare rollback does not revert `main`. A subsequent push could otherwise
publish the new application again. On a clean, up-to-date `main`, review the
release changes and create a normal revert commit rather than force-resetting
history:

```powershell
Set-Location C:\Users\joanmoturi\pennywise
git switch main
git pull --ff-only origin main
git revert --no-commit 82d0a4ece97e28edc426cc9870ccda72f6c59d73..release/pennywise-1.3.0
git diff --cached --stat
git commit -m "Restore the pre-connected Pennywise experience"
git push origin main
```

Resolve conflicts by review if later work has changed the same files. Do not
force-push, delete browser records or overwrite later unrelated changes.
The rollback source branch and release tag retain both versions for review.

## Verification completed before publication

- Formatting, ESLint, TypeScript and the production/PWA build pass.
- 204 unit/integration tests pass.
- All 40 desktop/mobile browser acceptance cases pass after changing the default
  database. Existing schema-3 recovery, Inbox processing, offline editing,
  guarded saves, encrypted restore and financial workflows remain covered.
- New storage cases cover concurrent first launches, copying without altering the
  original physical-v4 database, preserving its safety backup, retaining newer
  edits on reopening, failed-copy atomicity/retry, an absent old workspace and
  refusing incomplete old records.
- A separate isolated desktop and Pixel 7 exercise loaded the actual previous
  production HTML/JavaScript, entered fictional records, loaded the new build on
  the same test origin, entered another expense, switched back to the old build,
  and returned to the new build. The original header and records stayed exactly
  unchanged; the old app reopened its original records and the new entry remained
  available when returning to the new app.

The switching test used isolated browser contexts and local response routing,
not an actual rollback of the public Cloudflare deployment. No real personal
browser profile or financial records were accessed.

The preview-only banner and example seeding are restricted to localhost.
Production does not claim to be a local preview or seed fictional balances from
an example query parameter.

Existing bundle-size and third-party annotation warnings remain visible.
No new dependency, account, hosting project or financial-data backend is added.
