# Backup health and daily overview: usability test report

Executed November 15, 2026 on Windows, branch
`feature/backup-health-daily-overview`, using synthetic financial fixtures.

## Actual results

| Check                                                    | Result                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                               | **283 passed** across 18 files                                                                                       |
| `npm run test:e2e`                                       | **58 passed**, zero failures or skips; desktop Chromium and Pixel 7 emulation                                        |
| Explicit empty `VITE_GOOGLE_CLIENT_ID` browser selection | **6 passed**; dashboard empty/keyboard flow, optional manual backups and saved preference handling on desktop/mobile |
| `npm run lint`                                           | Passed                                                                                                               |
| `npm run format:check`                                   | Passed                                                                                                               |
| TypeScript and production/PWA build                      | Passed as part of the self-building E2E server                                                                       |

Existing nonfatal Zod annotation, shared dynamic/static imports and main bundle
size warnings remain. No dependencies or tooling were added.

## New coverage

`tests/backup-health.test.ts` checks verified/current versus dirty revision,
missing verification evidence, in-flight upload, failures, reconnection,
encryption, offline health, retry/pending ciphertext and disabled configuration.
`tests/backup-health-ui.test.tsx` checks immediate invalidation on a new revision,
navigation, optional storage failure/manual fallback and recovery on focus.

`tests/daily-overview.test.ts` checks overdue sorting, partial debt repayments,
paid/skipped/paused/prepaid exclusions, review-item counting and no financial
mutation. The full existing calculation/storage/backup suites remain unchanged.

`e2e/daily-usability.spec.ts` adds two journeys on each device profile:

1. Empty states, quick entry/cancel, keyboard disclosure of retained financial
   detail, budget/inbox navigation, unchanged stored records, no external
   requests during the journey and no horizontal overflow.
2. Restore a validated synthetic workspace using the actual backup UI; reconcile
   existing available money, automatic recurring budget allocation, overdue and
   due-today items and inbox count; navigate to the correct bill module; reload
   offline without changing the ledger; record income from Overview and verify
   the updated balance survives reopening.

`e2e/cloud-drive.spec.ts` adds a health journey on each device profile: disabled
backup, guided connection focus, encryption-input focus, first verified backup,
healthy Overview, expense-driven dirty state, guided backup focus, second verified
backup, reopening/reconnect guidance and preservation of records.

Initial new dashboard tests used an incorrect destination heading and a budget
expectation that omitted the existing automatic recurring allocation. The
assertions were corrected to the actual existing behavior (KES 13,000 planned,
not KES 10,000). Financial calculations were not changed to fit tests. The final
complete run passed without retries.

## Existing workflows retained

The full suite also passed account/budget/transaction/recurring CRUD, failed and
blocked writes, repeated-save idempotency, accessible validation/dialogs,
business ownership and distributions, liabilities/receivables, bonds and coupon
receipts, official lookup draft confirmation, recurring/prepaid expenses,
savings capture/monthly review, forecasts/scenarios, encrypted/manual backup,
fresh-browser restore and safety export, corrupted files/read-back, provider
failures, stable retry, SMS-file review/import, offline shell, schema migrations,
service-worker updates and dark/light theme preferences.

Updated `images/connected-desktop-overview.png` and
`images/connected-mobile-overview.png` show only synthetic test data. They are
documentation examples, not human usability-study evidence.

## Limits and real-account evidence

Google consent and Drive HTTP in automated cloud journeys are synthetic; no
customer credentials or financial records were used. On November 15 the owner
reported completing the real-account test. Its individual upload/read-back,
restore/recovery and independent-device outcomes were not supplied, so this
report does not infer a complete live acceptance matrix from that statement.

Pixel 7 is browser emulation, not a physical-phone/installed-PWA certification.
No human usability study, screen-reader audit or complete cross-browser matrix
was performed. The badge reports saved local verification evidence rather than
polling Drive for out-of-app deletions. Automation still requires an active,
authorized, unlocked application; it is not WhatsApp-style closed-app backup.

This delivery is a GitHub feature branch with all documentation, not a production
merge/deployment. See [BACKUP_HEALTH_AND_DAILY_OVERVIEW.md](BACKUP_HEALTH_AND_DAILY_OVERVIEW.md)
for operation, architecture boundaries and rollback.
