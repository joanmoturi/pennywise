# Connected-finance UX audit — November 6, 2026

## Baseline and evidence

The deployed reference is commit `82d0a4e`, verified against the actual live
`index-CQwo0I5C.js` bundle. Fresh isolated Chromium desktop and Pixel 7 contexts
visited all 20 pages and exercised the running production interface with fictional
data only. Twelve existing end-to-end workflows passed against production,
including receipts, accounts, bonds, lending, repayments, transfers, savings
capture, prepaid expenses, retained reviews, offline editing and backup recovery.
No real user's browser storage was accessed.

The newer local `c5c0d41` prototype was compared, not adopted as the baseline.
Its plain debt labels and contextual explanations are useful. Its eight-area menu,
hidden advanced planning and snapshot-based shared-mode editor do not replace the
deployed product. Its separate branch and server remain intact.

## Verified findings

| Priority | Page(s)                                   | Current behaviour and consequence                                                                                                                                                                       | Improvement                                                                                                                                                                                                    |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Income, Accounts, Overview, Reports       | Accounts have no business ownership classification. A business receipt recorded as generic income contributes its entire value to personal-looking totals. There is no ownership/distribution workflow. | Explicit business accounts and ownership; separate personal/business totals; distributions are one linked cash movement, not second consolidated revenue. Preserve ambiguous legacy records for manual review. |
| 1        | Budgets                                   | Category rows come only from allocations. The TEST unexpected repair expense was present in Transactions but absent from the budget category table on both devices.                                     | Include unbudgeted spending, with expandable linked ledger entries.                                                                                                                                            |
| 1        | Budgets, Transactions                     | There is no explicit multi-source budget reallocation action or retained funding explanation. Editing limits loses the simple explanation of where funding came from.                                   | Auditable, reversible allocation movements; no cash or income entry.                                                                                                                                           |
| 2        | Budgets                                   | Remaining amounts and warning colour exist, but there is no plain on-track/nearing-limit/over-budget status or inline expense history. An overspending transaction is accepted.                         | Keep that permissive ledger behaviour; show labelled overspending, progress, transactions and funding actions.                                                                                                 |
| 2        | Transactions                              | The account selector lists names, not balances; the form does not show the current category budget.                                                                                                     | Contextual account and budget summaries without extra data entry.                                                                                                                                              |
| 2        | Forecast, Windfalls, Savings Capture      | Advanced scenarios, future events, allocation rules and savings decisions already exist, but there is no named allowance tied to one period budget and its funding.                                     | Add allowance workspaces linked to existing budgets/events. Explicit savings returns reuse traceable capture transfers and lower the remaining plan once.                                                      |
| 2        | Obligations, Receivables                  | Both partial repayments and histories work, but separate navigation labels obscure the simple I owe / Owed to me distinction.                                                                           | A common debts view with two plain tabs, preserving original routes.                                                                                                                                           |
| 2        | Overview, Accounts                        | Cash, liabilities, receivables and net worth already reconcile; receivables are correctly excluded from spendable cash. Business assets and income cannot be separated.                                 | Preserve correct liability deductions; identify business cash and keep projected receipts distinct. Add contextual position links.                                                                             |
| 3        | Income, Bonds                             | Bond coupons already share the same schedules and confirmed receipts, including partial receipts.                                                                                                       | Preserve; business distributions should use similarly linked records.                                                                                                                                          |
| 3        | Recurring, Occasional, Prepaid            | Separate due, possible and already-paid expenses work, but terminology requires explanation.                                                                                                            | Preserve modules; surface their links from Budget/Planning rather than duplicate expense records.                                                                                                              |
| 3        | Reserves, Monthly Review, Savings Capture | Earmarks, actual savings transfers, review snapshots and undo exist.                                                                                                                                    | Preserve; provide a shorter return-to-savings path for allowances.                                                                                                                                             |
| 3        | Reports, Backup Centre, Settings, Inbox   | Reports, encrypted recovery, safety exports, approval rules, deduplication and reversals work in existing acceptance scenarios.                                                                         | Preserve safeguards and extend backup validation to new records.                                                                                                                                               |

## Scenario outcomes before changes

Salary/personal income, ordinary and overspending expenses, account transfers,
existing savings capture, debt creation, partial lending recoveries, liability
repayments, recurring/prepaid expenses and monthly review are supported and were
exercised in the isolated running interface. Unexpected expenses can be recorded
but are omitted from the allocation-only budget table. Business-specific ownership,
profit retention/distributions, explicit miscellaneous/split budget funding, and
named allowance allocation/return workflows are absent; they cannot honestly be
reported as passing baseline scenarios.

No evidence was found that existing account transfers, debt recoveries or savings
capture inflate earned income. No unrelated calculation rewrite is justified.

## Integrity map and preservation requirements

`transactions` is the cash ledger. `accountBalances` applies its signed effects.
`summary`, reports, budget actuals, forecast and monthly review derive from those
records. Existing liabilities and receivables use linked repayments, not duplicate
expenses. Expected events are not actual cash. Prepaid recognition and savings
captures already carry explicit relationships.

Physical IndexedDB 4 stores an ordered state header and individual keyed records,
with atomic validated mutations, revision checks, audit entries, a safety snapshot
and 15-second failure deadlines. Financial schema 4 backups use integrity checks
and optional AES-GCM encryption. The enhancement must migrate old data without
inventing business classifications, preserve Inbox provenance and maintain these
transaction/backup safeguards.
