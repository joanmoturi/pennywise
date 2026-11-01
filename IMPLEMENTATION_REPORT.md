# Pennywise implementation report

Implementation date: November 1, 2026. Application version 1.1.0, financial/IndexedDB schema version 3.

## Delivery

A separate offline-first financial application was added under `pennywise` without replacing Engineering Academy. It includes all twelve original navigation modules plus recurring, occasional, prepaid, savings capture, monthly review and Backup Centre areas. No backend or external financial-data service is required.

Architecture, setup, formulas, schema design/migrations, encryption format, privacy, deployment, Android installation, troubleshooting and feature limitations are documented in `README.md`.

## Actual validation

Initial repository baselines were executed before changes and rerun after implementation:

- Engineering Academy frontend: 42 tests passed.
- Engineering Academy backend: 45 tests passed; one pre-existing FastAPI/Starlette test-client deprecation warning.

Final executed validation on November 1, 2026:

| Check                                 | Actual result                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Pennywise Vitest                      | **101 tests passed**, five test files                                                                                 |
| Pennywise Playwright                  | **8 tests passed**: four desktop and four Pixel 7 Chromium-emulation workflows                                        |
| Strict TypeScript                     | Passed through `npm run build`                                                                                        |
| ESLint                                | Passed for application, unit tests and browser tests                                                                  |
| Prettier                              | Passed                                                                                                                |
| Production build                      | Passed; static `dist` generated                                                                                       |
| PWA                                   | Manifest, 192/512 PNG icons, service worker and Workbox runtime generated; 12 precache entries, approximately 520 KiB |
| Offline browser check                 | Desktop and mobile installed-shell reload, local add/edit persistence and no external requests passed                 |
| Development startup                   | Loopback Vite server rendered the overview with no page/console errors; stopped after verification                    |
| Production dependency audit           | **0 vulnerabilities** from `npm audit --omit=dev`                                                                     |
| Full dependency audit                 | **19 remaining development-tool advisory entries**: 2 low and 17 moderate; no high/critical entries                   |
| Existing Engineering Academy frontend | **42 tests passed**                                                                                                   |
| Existing Engineering Academy backend  | **45 tests passed**, one pre-existing test-client deprecation warning                                                 |

All reported pass results were executed, not inferred. No coverage percentage is claimed. Playwright's HTML report is generated in `playwright-report`; failure traces/screenshots are generated in `test-results` when needed. These generated artifacts are git-ignored.

The development nonce is generated per Vite server instance so React's development preamble can execute under CSP. The production HTML does not permit inline scripts.

### Browser workflows exercised

1. Accounts/opening funds; multiple income sources; business liability; six individually configured overlapping bond schedules; independent budget templates; expense; loan recovery; actual windfall allocation; isolated scenario; refresh persistence.
2. Recurring creation and variable-period adjustment; actual payment; six-period prepayment and covered occurrences; occasional planning; category rollover preference; actual savings capture and finalized review.
3. Complete portable backup download; independent fresh-browser restoration; downloaded safety backup; integrity rejection; preservation of current records after rejection.
4. Service-worker-controlled offline reload; actual expense add/edit/reload; manifest icon validation; no third-party requests; mobile layout fit.

### Unit and integration coverage

Exact parsing, overflow and percentage rounding; actual cash/income/expense distinctions; liability draw/repayment; loan disbursement/recovery/write-off; restricted/savings/reserve protection; partial and reconciled receipts; independent and overlapping bond schedules; future transaction rejection; necessities funding; category-specific safe spending; budgets and zero-based differences; negative runway; capped receivable forecasts; scenario isolation; windfall preview/commit/duplicate prevention; recurring frequencies/history/deduplication; occasional non-mandatory planning; prepaid cash, recognition, rounding, coverage, refunds and corrections; savings splits, transfer confirmation, reserve/carry/available decisions and independent rollover; retained reviews; backup reminders; complete JSON/encryption/migration/attachment round trips; malformed and unsupported data; missing relationships and duplicate IDs; concurrent IndexedDB updates; abort rollback and recovery; safety snapshots; safe CSV parsing/import and formula escaping; persisted UI workflows.

## Accounting and reliability highlights

- BigInt intermediate arithmetic, integer minor-unit persistence and safe bounds.
- Actual earned/distributed income excludes borrowing, transfers, loan recovery and refunds.
- Available cash protects restrictions, savings accounts, reserves and liabilities.
- Recurring creation makes unique scheduled obligations, not cash payments.
- Prepayments debit cash once and recognize consumed cost separately in budgets.
- Under-budget allocations require an explicit savings/carry/availability decision.
- Finalized monthly reviews retain snapshots when historical facts are corrected.
- Full portable backups include all entity collections, histories, relationships, preferences and receipt attachments.
- Integrity/schema/reference validation happens before replacement; database updates are atomic.
- Safety snapshots and downloaded safety backups precede destructive restore/reset.
- Optional authenticated encryption never persists passwords.

## Remaining limitations

This is not represented as an externally audited financial product or universally certified Android installation. Device-specific install UX and real-world hosting are not exercised by desktop browser emulation. Automated tests verify the shipped browser workflows and accounting cases, not financial advice.

See the README's explicit limitations: local-only unencrypted-at-rest database, personal-dataset snapshot storage, bounded attachments/backups, assumption-based projections, reference-only tax/interest fields, descriptive occasional recurrence notes, manual CSV reconciliation and browser print-to-PDF. User-confirmed ledger actions never execute real bank movements.

The remaining full-audit entries originate in development/build-tool chains using `minimatch`, `glob` and `deepmerge` (ESLint/TypeScript lint tooling and Workbox build dependencies). A compatible `npm audit fix` was attempted; these entries remain. No forced incompatible downgrade, audit suppression or bypass was used. Treat these as unresolved development-tool exposure, not a clean all-dependency audit. Production browser dependencies have a separate clean audit. Keep development/build inputs trusted, do not expose the dev server publicly, and review upstream patched tooling before an externally certified release.
