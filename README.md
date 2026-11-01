# Pennywise

Private, offline-first personal financial command centre. Standalone React/TypeScript PWA in this repository's `pennywise` directory; the existing Engineering Academy frontend and backend are unchanged.

## Run locally

Requires Node.js 22.12+ (Node 26 was used during implementation) and npm.

```powershell
Set-Location C:\Users\joanmoturi\engineering-academy\pennywise
npm ci
npm run dev
```

Open the localhost address Vite prints. No backend, account registration, environment variables, bank credentials, API keys or paid infrastructure are required. Do not expose the development server publicly.

For the **production PWA**, including offline caching:

```powershell
npm run build
npm run preview
```

Open the printed localhost URL once online and wait for the **Offline ready** notice. Development mode intentionally does not cache the app.

## First-time setup with real records

1. Do not load demonstration data into a personal database. If exploring a demo, remove it in Settings first.
2. Choose currency before entering financial records. The default is KES; all accounts share one currency. Locale is en-KE and dates use Africa/Nairobi.
3. In Settings, add bank, mobile-money, cash and savings accounts with their **existing opening balances**. Opening balances are not income. Enter restrictions separately. Savings-account balances are protected from discretionary availability.
4. Add repayable business funds in Obligations, including original principal and deadline. If those funds are already in an opening balance, **do not record another draw**. For a new receipt of borrowed money, record a liability draw against its liability.
5. Record loans already owed to you in Receivables. A new loan also needs a loan-disbursement transaction. Record principal repayments as loan recovery, and actual interest separately as income.
6. Enter each bond's documented principal, issuer, rate, tax assumption, maturity and receiving account. Configure its first expected payment date and schedule explicitly. Do not enter the same holding in an investment account as well. Confirm coupons only when actually received.
7. Add income sources and explicit payment schedules. Reliability labels are your assumptions; even a confirmed future event is not current cash.
8. Add recurring necessities, variable utilities, occasional plans and reserves. Recurring definitions generate unpaid occurrences, not actual expenses. Adjust each variable occurrence before confirming its payment.
9. Select a budget profile and enter your actual category limits. The four initial modes have no assumed amounts. Scheduled recurring costs appear automatically when enabled; same-category manual and scheduled plans use the larger amount rather than double-counting the same allocation.
10. Use Monthly Review or Savings Capture to decide what to do with under-budget allocations. Record account transfers only after actually moving money; reserve/carry decisions are earmarks, not transfers.
11. Download a **Full Backup** in Backup Centre and keep a copy away from this device. Test its restore preview. Keep passphrases separately and securely.

## Modules and workflows

| Area                | Functional workflow                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview            | Actual assets, cash, restrictions, liabilities, receivables, reserves, budget consumption, recurring dues, under-budget allocations, captured savings, prepaid savings, renewals, charts and spending assessment                                  |
| Accounts            | Create/edit/delete accounts; opening balances and restricted portions; distinct investment and protected savings accounts                                                                                                                         |
| Transactions        | Actual income, expense, owned transfers, liability draw/repayment, loan disbursement/recovery, adjustments, principal recovery and local receipts; search, account/type/date filters, sorting and confirmed deletion                              |
| Income              | Independent active/inactive sources, explicit schedules, reliability, tax references, partial actual receipts and reconciliation                                                                                                                  |
| Bonds               | Independent holdings, integer net coupon calculations, custom or semiannual schedules, overlap/no-payment months, delayed/cancelled events and coupon history                                                                                     |
| Obligations         | Business funds and creditor liabilities, partial repayments, due dates, priorities and necessities-first funding                                                                                                                                  |
| Receivables         | Principal ledger, partial repayments, manual schedules, historical recovery and write-off                                                                                                                                                         |
| Budgets             | Four independent templates; custom categories; weekly/monthly/custom periods; essential and goal allocations; zero-based difference; compare/duplicate/archive profiles; create next periods without overwriting history                          |
| Recurring Expenses  | Fixed/variable definitions, bounded custom intervals, reminder lead time, automatic budget inclusion, generated occurrence history, adjustments/postponement/skip, partial actual payments, pause/cancel and explicit additional payments         |
| Occasional Expenses | Expected month/optional date, estimate, spending cap, priority, pattern notes, optional reserve funding and confirmed actual payments; not mandatory monthly expenses                                                                             |
| Prepaid Expenses    | Actual advance cash payment, coverage periods, exact discounted cost allocation, normal-price comparison, remaining prepaid asset, duplicate-charge protection, renewal/expiry, early termination/refund and corrections                          |
| Reserves            | Account-linked earmarks, targets, dates, planned contributions, contribution/release history and emergency identification                                                                                                                         |
| Savings Capture     | Category-level or whole-budget decisions, up to three split destinations, actual savings transfers, reserve earmarks, available/unallocated decisions and later-period carry-forward                                                              |
| Monthly Review      | Reconstructed starting availability, actual income and cash spending, consumed prepaid cost, recurring paid/unpaid status, occasional plans, under-budget/overspent categories, savings decisions, carry-forward and retained finalized snapshots |
| Forecast            | Custom horizon to 730 days, conservative/expected/optimistic lines, delayed events, spending changes, hypothetical salary/emergency inputs, exact balances and independent saved scenario comparison                                              |
| Windfalls           | Actual receipt selection, ordered fixed/percentage/threshold rules, caps, minimum-cash conditions, preview and explicit commit; complete allocation reversal                                                                                      |
| Reports             | Actual custom-date income, spending, recovery, repayment, coupon, category/month trends, reserve growth, current obligations and supporting ledger; CSV and print-to-PDF                                                                          |
| Backup Centre       | Complete portable JSON/encrypted JSON, integrity verification, schema migration, restore preview, transactional safety snapshot, safety file export, reminder preferences and separate reporting CSV exports                                      |
| Settings            | Currency/theme, allowance horizon, progressive setup, storage persistence request, privacy explanation, local audit history, fictional demo and typed reset                                                                                       |

### Recurring expenses

Creation generates occurrences through a two-year horizon. Extend it in Recurring Expenses. Each occurrence has a permanent original scheduled date plus its editable due date; `(definition ID, original date)` is unique. Changing an occurrence's amount or date does not regenerate it. Monthly schedules retain their original day through short months (January 31 -> February 28 -> March 31).

Payments are separate actual transactions. Skipping retains the record. Pausing/cancelling stops generation and skips future unpaid occurrences without removing their history. Resuming a definition does not silently undo previous skips; adjust individual skipped occurrences explicitly. Existing actual payments remain in the ledger.

Reminder preferences are in-app lead times; no OS notifications or unreliable background jobs are claimed. Custom schedules use a day interval. Occasional recurrence patterns are descriptive planning notes, not automatically generated obligations.

### Prepaid accounting

Example: normal cost KES 3,000 per month, actual six-period payment KES 15,000.

- Cash decreases KES 15,000 on the actual payment date.
- The asset starts at KES 15,000; it declines as the service is consumed.
- Each of six periods is allocated KES 2,500. Any indivisible minor units are distributed to the earliest periods.
- Actual cost recognition within each period is prorated by elapsed covered days using cumulative integer division. A complete period recognizes exactly its allocated amount.
- Normal-price comparison is KES 18,000, so the recorded advance-payment saving is KES 3,000.
- Cash reports show the upfront expense once; budget actuals exclude it and show consumption instead.
- Forecasts remove already-paid prepaid recognition from new cash requirements. This is not new income.
- Covered recurring occurrences cannot receive another ordinary payment. The user must explicitly approve an additional payment.
- An early termination records an actual refund as recovery, not earned income. Any unrefunded, unconsumed cost is recognized on termination. Corrections update linked records with an audit trail.

Coverage can use a count or an explicitly shortened final period. The count and coverage dates must agree. For a standalone prepaid expense, create it directly; for recurring-service duplicate protection, link its existing recurring definition.

### Savings and rollover

Under-budget allocation is **not automatically saved**. Capturable money is capped by both uncaptured category surplus and actual available cash. Goal allocations are not treated as expense underspending.

- A savings-account transfer creates an actual owned-account transfer. The destination's entire balance is protected; the movement is neither income nor an expense.
- A reserve decision creates an account-linked earmark only.
- A carry decision references an explicit later budget period and protects the cash until that period starts.
- Available/unallocated decisions create no cash movement. Undo the decision if you want to choose a different destination later.
- Full and partial category rollover use traceable prior-period surplus, less previously captured amounts. Explicit carries are not also automatically rolled over.
- None returns the plan to the general pool; manual/savings rules require a confirmed review decision. Rules never perform unconfirmed transfers.
- Overspending remains a displayed deficit; it is not silently transferred to a new month.

Creating a next budget period retains the profile lineage and its historical period. Duplicating a profile creates a separate lineage. Periods in the same lineage cannot overlap.

## Financial rules

All persisted monetary amounts are integer minor units (KES cents); parsing and arithmetic use `BigInt` intermediates with safe-integer bounds. Percentage and coupon rounding is half-up. Allowances and time prorating use cumulative integer division so no minor units disappear.

```text
Liquid cash = recorded cash/bank/mobile/savings opening balances + actual ledger movements
Protected reserves = reserve earmarks + savings-account balances + not-yet-effective explicit carries
Available = liquid cash - restricted portions - protected reserves - all outstanding liabilities
Net worth = actual account assets + bond principal held + receivables + unconsumed prepaids - liabilities
Liability outstanding = original principal - actual liability/debt repayments
Receivable outstanding = original principal - actual principal recoveries (or zero when written off)
Gross coupon = principal * annual rate / payments per year
Net coupon = gross coupon - rounded configured tax
Category surplus = max(0, effective planned allocation + rollover - recognized actual expense)
Daily allowance = min(available cash after category-specific essential protection, remaining discretionary plan) / planning days
```

Every dashboard total comes from records or labeled assumptions. Forecast cash starts after protecting all existing liabilities, so it does not subtract those same obligations again. Known necessities above a budgeted category are charged as excess, not duplicated with that category. A 30-day planning month is explicit; weekly/custom manual plans are scaled to that horizon. Future income remains projected until receipt. The conservative line includes configured confirmed future events, **not a guarantee**; one-off salary/emergency scenario inputs remain hypothetical on all lines.

There are no automatic investments, real bank transfers, real bond dates/rates, inferred taxes, or external AI calls.

## Architecture and database

- `domain.ts`: strict Zod schemas, domain types and calendar utilities.
- `money.ts`: exact monetary parsing, formatting, bounded aggregation and ratios.
- `engine.ts`: ledger balances, validation, coupons, budgets, necessities, decision support, windfalls and projections.
- `expense-engine.ts`: recurring generation, prepaid recognition, savings decisions, rollover and review snapshots.
- `storage.ts`: IndexedDB version 3, v1/v2 migration, serialized read/write transactions, revisioning and safety snapshots.
- `backup.ts`: versioned full envelopes, canonical SHA-256 integrity, PBKDF2/AES-GCM encryption and validated inspection.
- `import.ts` / `reports.ts`: reviewed CSV import, exact duplicate fingerprints, safe CSV output and actual reporting.
- `context.tsx`, `ui.tsx`, `pages-*.tsx`, `App.tsx`: presentation and form workflows.
- `vite.config.ts`: manifest, precache generation and prompted updates.

Database: `pennywise-private`, object store `state`, key `current`. Complete snapshots are validated and saved in one read/write transaction. The transaction reads the latest revision before applying the synchronous mutation, avoiding lost updates across tabs. Audit entries record before/after changes (receipt binaries omitted from audit, but included in full backups). BroadcastChannel refreshes other tabs after commit. The app does not use localStorage as its financial database.

Before restore/reset, the current state is saved under `safety-before-destructive` in the same transaction. Validation, exceptions and aborts roll back the entire operation. The safety snapshot is available in Backup Centre, but it cannot survive clearing browser storage; use the downloadable safety file too.

The snapshot approach is simple and transaction-safe for personal datasets; it is not an indexed high-volume multi-user ledger. Limits include 50,000 transactions, 20,000 occurrences, 100,000 audit entries, 2 MB per local receipt, 20,000 CSV rows and a 35 MB plaintext full-backup export limit. Imported encrypted files are limited to 50 MB.

## Complete backup and restore guide

1. Open **Backup Centre** and select **Download Full Backup**. For encryption, enter a 12+ character passphrase and use **Download Encrypted Backup**. If a mobile browser blocks the automatic download, tap **Save prepared file**; its explicit user-activated link remains available for five minutes.
2. Verify the downloaded `Pennywise-Full-Backup-<timestamp>.json` file exists. Keep a copy off the device. Export reminders record download **initiation**, not a browser guarantee that a file was saved.
3. On a new device/browser, install or open Pennywise on HTTPS, then open Backup Centre.
4. For an encrypted file, enter its passphrase first. Choose **Full backup file**.
5. Review timestamp, app version, integrity status, record counts, currency and demo/personal label.
6. Select **Restore Entire Database**, then explicitly confirm replacement.
7. A full current-state safety file is downloaded first. The old state is also retained atomically in IndexedDB. Verify the restored accounts and transactions.
8. If the file is invalid, corrupted, unsupported, has broken relationships, or the password is wrong, nothing is replaced.

### Portable format

The plaintext JSON envelope contains `format: pennywise-full-backup`, `backupVersion: 1`, financial `schemaVersion`, `appVersion`, UTC `createdAt`, full `data`, and `{ algorithm: SHA-256, digest }`. The digest covers the canonical envelope fields other than `integrity`: object keys sorted lexically, array order retained, compact JSON, UTF-8.

Receipts use validated supported MIME types and Base64 data URLs inside their transactions. They are downloaded as local blobs, not rendered as arbitrary imported HTML. Financial IDs and relationships are preserved.

Encryption envelope: `format: pennywise-encrypted-v1`, `algorithm: AES-GCM`, `iterations: 600000`, Base64 16-byte `salt`, Base64 fresh 12-byte `iv`, and Base64 ciphertext/tag `data`. PBKDF2-SHA-256 derives a non-extractable 256-bit AES key from the UTF-8 passphrase; AES-GCM uses the browser default 128-bit tag. The decrypted plaintext is the full versioned integrity envelope. Passwords never enter IndexedDB.

SHA-256 detects corruption, not deliberate modification by someone who can recompute a digest. AES-GCM also authenticates encrypted content. Legacy raw v1/v2 snapshots can migrate but have no integrity timestamp and are labeled as legacy. Current-schema raw snapshots without an integrity envelope are rejected by the file importer.

## Deployment and Android installation

```powershell
npm ci
npm run build
```

Deploy **the contents of `pennywise\dist`** to the root of a dedicated HTTPS static-host origin so its root-scoped service worker does not interfere with Engineering Academy. Asset and manifest paths are root-absolute, including when a nested URL is refreshed. Subdirectory hosting requires deliberately changing the build base and PWA scope; do not copy this root deployment under Engineering Academy.

For exact GitHub-connected Cloudflare Pages settings, see `DEPLOYMENT_GUIDE.md`. Current publishing/live-verification status is in `DEPLOYMENT_REPORT.md`. Phone-only installation is covered by `ANDROID_INSTALLATION_GUIDE.md`, with extended backup instructions in `PWA_INSTALLATION_GUIDE.md`; earlier readiness evidence is retained in `DEPLOYMENT_READINESS_REPORT.md`.

Recommended host headers:

```text
Cache-Control for index.html, sw.js and manifest.webmanifest: no-cache
Cache-Control for content-hashed assets: public, max-age=31536000, immutable
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

An HTML meta CSP supplies the compatible policies locally; `frame-ancestors` must be an HTTP header. Inline styles are permitted for chart/progress dimensions, not inline scripts. Self-host all assets. Do not add analytics or external fonts.

On Android Chrome:

1. Visit the deployed HTTPS URL online.
2. Wait for **Offline ready**.
3. Open Chrome's menu and choose **Install app** / **Add to Home screen**.
4. Launch the installed app, then test reopening in airplane mode.
5. Back up frequently. Uninstalling or clearing site storage can remove the database.

Manifest includes 192/512 PNG icons, maskable-safe artwork, standalone display and scoped relative start URL. Workbox precaches the built shell and hashed assets. New builds present an update prompt rather than silently reloading a form. Back up before an upgrade. Browser-specific install UX still needs testing on the user's actual Android device.

## Validation commands

```powershell
npm test
npm run lint
npm run format:check
npm run build
npm run test:e2e
npm audit
npm audit --omit=dev
```

Playwright uses its own production preview port 4179 and closes it when finished. If Chromium is missing, install the matching browser with `npx playwright install chromium`. Never bypass permission or trust controls to run tests.

Tests cover exact arithmetic, financial distinctions, schedules, recurring adjustments, prepaid coverage and recognition, savings/rollover, scenario isolation, CSV import, portable encryption, schema migration, full cross-database restoration, transaction interruption rollback, attachment preservation, actual UI persistence, desktop/mobile workflows and offline reload/write/edit.

See `IMPLEMENTATION_REPORT.md` for executed results and limitations.

## Security and known limitations

The production dependency audit reports zero vulnerabilities. The full development-tool audit still reports 19 advisory entries (2 low, 17 moderate), documented in `IMPLEMENTATION_REPORT.md`; a compatible fix was attempted without unsafe or incompatible forced downgrades.

- No bank integration, server, multi-device synchronization, notifications, analytics or external AI.
- IndexedDB is **not app-encrypted at rest**. Device encryption, browser profile protection and private backups remain necessary. Financial records/receipts are not written to application logs.
- Local revision history is not tamper-proof, signed or an automatic undo database.
- No multi-currency accounts, FX conversion, tax advice, security valuation, bond trading or automated interest accrual. Loan-interest rates and income tax fields are references; record actual net receipts/interest explicitly.
- Bond maturity recovery reduces recorded principal only; gains are separately recorded income. Do not double-count bond holdings in investment accounts.
- Occasional recurrence patterns are notes; planned reserve contributions require explicit actual funding. Savings rules never silently move funds.
- In-app reminder lead times do not guarantee OS notifications. Backup reminders run on open/data changes, not in an unattended scheduler.
- Forecasts are transparent planning estimates, not calendar-perfect actuarial models. The user's configured income reliability is not independently verified. Actuals and hypothetical scenarios are always separate.
- Historical starting availability is reconstructed from recorded opening balances/prior transactions, original obligation dates and current write-off status; it is not a bank-certified historical statement. Corrections may change old review calculations; retained finalized snapshots do not disappear.
- CSV import checks exact fingerprints and flags uncertain credits; different descriptions can conceal duplicates. The selected statement balance is shown for manual reconciliation, not falsely claimed as automatic bank reconciliation.
- Reserve funding from a windfall or savings capture must use the receipt/source account. Move money yourself and record an owned-account transfer if needed. An application ledger confirmation does not execute that bank action.
- PDF export uses the browser's Print / Save as PDF dialog.
- Browser eviction, private browsing and clearing site storage may erase records. A downloaded full backup kept elsewhere is the recovery mechanism.

### Troubleshooting

- **Storage unavailable/blocked:** enable site storage and close old Pennywise tabs; retry. No reset occurs automatically.
- **Offline reload fails:** use the production build on HTTPS/localhost and wait for service-worker readiness before going offline.
- **Cannot spend reserved cash:** release the reserve earmark first, then record the actual expense.
- **Import rejected:** inspect the first validation error; correct source/account/date/classification, duplicate or amount issues. Nothing is partially imported.
- **Restore rejected:** do not edit a file to bypass integrity checks. Retrieve a valid backup; verify the passphrase. Current data remains intact.
- **Old update remains:** close other tabs or use the update prompt after saving and backing up. Avoid clearing site data unless you already have a portable backup.
- **Capture seems too small:** budget surplus is capped by actual spendable funds; future income, restricted cash, savings and money owed cannot finance capture.
