# Kichella technical audit

Audit date: November 4, 2026. Baseline: Pennywise `95e6d83`.
This is a source review and synthetic test programme, not certification of every
financial calculation or reproduction on the owner's phone.

Publication update, November 5, 2026: the user subsequently authorized GitHub
publication and deployment. The verified original deployed commit `95e6d83` is
now preserved remotely as `backup/pennywise-deployed-2026-11-05`. The findings
below describe the pre-change baseline; current results and rollback constraints
are recorded in `KICHELLA_RELEASE_READINESS_REPORT.md`.

## Protected baseline

- Original: `C:\Users\joanmoturi\pennywise`, branch `main`, unchanged.
- Recovery tag: `pennywise-baseline-2026-11-04` (local).
- Development: `C:\Users\joanmoturi\kichella`, branch `kichella/stabilisation`.
- Original comparison: `http://127.0.0.1:4177`.
- Kichella comparison will use a separate origin. Browser databases, service
  workers and caches are origin-local; neither preview reads deployed data.
- At audit time, publication and deployment were not authorized. The subsequent
  authorization above supersedes that restriction; history rewriting and Android
  changes remain outside scope. Backups move between origins only explicitly.

## Architecture and mutation inventory

| Area                     | Modules and paths                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell / state            | `App.tsx`: startup repository read, React context, revision broadcasts, theme, navigation, service worker notices, dialogs and toasts. `context.tsx`: common mutation/dialog contracts.                                                                                         |
| Shared save / forms      | `ui.tsx:FormDialog`; `forms.ts:editRecord`, `editTransaction`, deletion, schedules, receipts, reserves and windfall confirmation. All persisted changes use `Repository.update` via `app.mutate`.                                                                               |
| Accounts / ledger        | `pages-records.tsx`: accounts, transactions, attachment reads, payment calendars, income, bonds, obligations/receivables, necessities, reserves, budget profiles/allocations/rollover.                                                                                          |
| Expenses                 | `pages-expenses.tsx` and `expense-engine.ts`: recurring definitions/generation/payments, occasional plans/payments, prepaid cash/recognition/refunds, savings capture/undo, retained monthly review.                                                                            |
| Planning / reporting     | `pages-planning.tsx`, `engine.ts`, `reports.ts`: overview, available cash/allowance, forecasts, hypothetical scenarios, windfall allocation and reports. Scenarios are not ledger writes.                                                                                       |
| Persistence / validation | `storage.ts`: IndexedDB v3, one `state/current` snapshot and a safety snapshot. `domain.ts`: strict Zod financial schema v4. `engine.ts:validateState`: relationship, cash and accounting checks.                                                                               |
| Backups / settings       | `backup.ts`, `pages-backup.tsx`, `pages-data.tsx`: integrity-checked full JSON, PBKDF2/AES-GCM exports, validated atomic restore, safety download/snapshot, reset and clearly labelled demonstration. CSV is not a full backup. Settings also has an older secondary backup UI. |
| Import / Inbox           | `import.ts`, `notifications.ts`, `notification-schema.ts`, `pages-notifications.tsx`: explicit reviewed CSV or structured candidate import, identity/deduplication, constrained rules, provenance, reversals. `handoff.ts`: separate temporary local share staging.             |
| Offline / deployment     | `vite.config.ts`, `sw.ts`, `index.html`, `public/_headers`: cached application shell, offline navigation and local POST shares, prompt-only worker updates, static Cloudflare deployment. No financial backend.                                                                 |
| Native                   | `android-companion`: separate SMS acquisition/queue. Left intact, outside this stabilization scope. Real-provider parsing and physical phone acceptance remain unfinished.                                                                                                      |
| Tests / prior evidence   | `tests`: six baseline files, 148 passing cases; `e2e`: desktop/mobile workflows and isolated two-version shell host. Prior reports are historical, not fresh test results. Broader financial acceptance remained incomplete.                                                    |

No live financial JSON file or localStorage financial database was found.
React state is a view of origin-local IndexedDB, not a second persistent store.

## Findings before implementation

| ID  | Finding and source evidence                                                                                                                                                                                                              | Impact / severity                                                                                                               | Recommended treatment                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `Repository.update` gets, validates, structured-clones and rewrites the complete snapshot on every save. `changes` serializes whole collections, then serializes individual records again. Audit grows indefinitely up to schema limits. | Confirmed slow-save architecture; high. No demonstrated corruption.                                                             | Retain financial schema and atomic validation; normalize physical persistence with an atomic, tested migration and only changed record writes; cache by committed revision. |
| S2  | `validateState` calls `today()` inside every transaction loop; `today()` constructs an Intl formatter each call.                                                                                                                         | Confirmed hot path: at 10,000 transactions validation alone took 579.1 ms in Chromium. High: main-thread blocking.              | Reuse formatters and compute validation's date once. Retain Nairobi timezone and all checks.                                                                                |
| S3  | `FormDialog.submit` has no synchronous in-flight guard, no paint opportunity before work, no fieldset locking or associated field errors, and no slow-operation explanation.                                                             | Confirmed source gaps; duplicate submits and confusing saving state possible. High.                                             | Ref guard, visible pending state, retained form on error, field errors/focus, honest slow status and transaction-bound abort deadline.                                      |
| S4  | `Repository.update` posts a BroadcastChannel message before resolving committed success without guarding the optional API. A throw after commit can leave its promise pending.                                                           | Confirmed exceptional-path hang candidate, not confirmed as the owner's exact phone cause. High: persisted save can look stuck. | Resolve committed result independently of optional notification; regression test with throwing BroadcastChannel.                                                            |
| S5  | `TransactionsPage` renders every matching ledger entry, including receipt inputs/actions. `formatMoney` constructs an Intl formatter for each cell.                                                                                      | Confirmed unbounded rendering; high for long histories.                                                                         | Measured bounded pagination and cached formatter; filters/export still include all entries.                                                                                 |
| S6  | The entire page consumes context and recalculates when shell-only state (dialog, toast, network status) changes; overview computes forecast/reports/summary repeatedly.                                                                  | Confirmed render dependency; suspected contribution pending browser timing. Medium.                                             | Stable context and mutation callbacks, memoized active page and measured calculations.                                                                                      |
| S7  | `generateOccurrences` scans all occurrences for every generated date.                                                                                                                                                                    | Confirmed quadratic membership work; medium at large recurrence counts.                                                         | Build a set of existing schedule identities; preserve dates, skipped/paid records and idempotency.                                                                          |
| U1  | Nineteen equally weighted primary navigation items; Accounts only reachable through overview/settings, not directly in navigation.                                                                                                       | Confirmed discoverability/cognitive load problem; medium.                                                                       | Group existing links and make Accounts explicit; preserve all pages and labels needed by established workflows.                                                             |
| U2  | Transaction form exposes twelve fields including rarely used references; unfamiliar debt/recovery terms lack nearby guidance.                                                                                                            | Confirmed heuristic concern, not a human-study result; medium.                                                                  | Essential fields first; accessible optional detail section with linked fields retained and auto-opened where needed.                                                        |
| U3  | Setup continues directly into Settings while saving asynchronously. No direct expense/income shortcuts on overview.                                                                                                                      | Confirmed navigation-before-persistence gap; medium.                                                                            | Await setup save; context-rich quick actions and meaningful setup text.                                                                                                     |
| O1  | IndexedDB open has no deadline; blocked request rejects but a later success can leak a database connection.                                                                                                                              | Confirmed lifecycle gap; medium.                                                                                                | Bounded open with late-connection cleanup; non-destructive recovery.                                                                                                        |
| O2  | Storage persistence request exists, but storage usage and quota diagnostics are not surfaced.                                                                                                                                            | Confirmed omission; medium.                                                                                                     | User-triggered storage estimate/persistence status and explicit quota error; no promises against eviction.                                                                  |
| A1  | Native dialog provides a useful focus trap, but errors have no field association, chart progress has no accessible name, main has no skip link and small icon controls need review.                                                      | Confirmed accessibility gaps; medium.                                                                                           | Labels, error summary focus, skip link, minimum target sizing and keyboard/browser checks; no palette replacement.                                                          |

## Baseline measurements

Real Chromium IndexedDB, development bundle, fresh synthetic databases, desktop
hardware, no CPU throttling; three ordinary writes per operation. These are
repository timings, not end-to-end phone measurements.

| Transactions / audit records | Accounts | Read     | Validation | Account save range | Budget save range  | Transaction save range |
| ---------------------------- | -------- | -------- | ---------- | ------------------ | ------------------ | ---------------------- |
| 100 / 100                    | 3        | 8.7 ms   | 6.8 ms     | 27.4-29.1 ms       | 25.9-32.2 ms       | 22.9-26.8 ms           |
| 2,500 / 2,500                | 25       | 161.7 ms | 142.9 ms   | 347.9-624.5 ms     | 318.2-376.8 ms     | 339.7-367.9 ms         |
| 10,000 / 10,000              | 25       | 636.9 ms | 579.1 ms   | 1,259.4-1,970.9 ms | 1,287.7-2,444.6 ms | 1,282.3-1,340.7 ms     |

Baseline unit/integration run: 148 passed, 0 failed.
Raw anonymized benchmark evidence is in the session artifacts, not personal data.

## Review limits

The owner's Samsung/browser profile was not inspected. A failing native storage
implementation, installed stale shell, private-browsing restrictions or actual
quota exhaustion cannot be asserted without that device. The reports below
separate deterministic regression tests from those unverified hypotheses.
