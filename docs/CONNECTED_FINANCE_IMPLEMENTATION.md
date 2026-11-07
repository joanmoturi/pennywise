# Connected Pennywise local preview

> Historical report for the original local preview. The later approved release
> adds a separate-database copy so the old version remains usable for rollback.
> See [the current release and rollback runbook](CONNECTED_FINANCE_RELEASE_AND_ROLLBACK.md)
> for production storage behaviour and the expanded verification results.

November 6, 2026. Local branch: `preview/connected-financial-planning`.
Baseline: production commit `82d0a4ece97e28edc426cc9870ccda72f6c59d73`,
not the simplified navigation prototype.

The deployed application and its data have not been changed. The earlier
simplified preview remains separate. This preview intentionally has a local
preview banner and independent browser storage.

Open `http://127.0.0.1:4183/?example=1` on this computer for the fictional monthly
example. It seeds only an untouched workspace. Desktop and mobile-browser smoke
checks confirmed that saving an additional expense and reopening the example
does not overwrite existing records. The server listens only on `127.0.0.1`;
the earlier simplified preview on port 4182 remains responsive.

## Initial audit

See [the verified production UX audit](CONNECTED_FINANCE_AUDIT.md). Before editing,
isolated desktop and Pixel 7 browsers visited all 20 deployed pages and ran
12 existing live workflows using fictional data. The confirmed gaps were missing
business ownership, unexpected expenses missing from budget rows, no explicit
budget funding history, and no linked allowance workspace. Existing transfers,
debt calculations, coupons, prepaid expenses and backups were not falsely
reported as broken.

## What changed

| Area                  | Connected behaviour                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Budgets               | Original and adjusted limits, actual spending/funding, remaining money, labelled overspending, unexpected categories and expandable ledger entries appear together.                                                                                     |
| Reallocation          | Fund a category from one or two sources in one form. Preserve the reason, source amounts and reversal history. The data model supports up to 20 moves per decision. Cash does not change.                                                               |
| Transactions          | The form shows account balance and current category position. Saved overspending and unexpected expenses get a contextual warning, without blocking accurate spending records.                                                                          |
| Businesses            | Record a company, ownership percentages, partners and explicitly owned accounts. Revenue, costs, retained profit, actual payouts, business cash and liabilities are separate from personal figures.                                                     |
| Distributions         | Pay yourself through one business-to-personal transfer; pay a partner through one marked cash outflow. Link an actual owner payout to an existing expected payment, or plan a future payout without posting cash. Reverse a mistaken payout explicitly. |
| Debts                 | Familiar obligations and receivables workflows now share **Debts**, with **I owe** and **Owed to me** tabs, keyboard navigation, partial repayments and histories.                                                                                      |
| Forecast              | Keep advanced forecasting and add an allowance workspace linked to a real period budget, spending account and optional expected funding event. Return actual unspent allocations to savings with a linked transfer.                                     |
| Overview and Accounts | Show actual personal cash, protected savings, liabilities, receivables, personal net worth and projected month-end cash. Business-owned cash is labelled separately and excluded from personal spending capacity.                                       |
| Backups               | Preserve business ownership, funding history and allowance relationships alongside all existing collections. Show record counts and the older-app compatibility warning before restore.                                                                 |

### A short path through the preview

1. Use **Accounts** for money already held and **Transactions** for money actually
   received, spent or moved. Opening balances are not new income.
2. Use **Businesses** to create an entity and its account. Record its revenue and
   costs against that account, then record only actual agreed distributions.
3. Use **Budgets** to review limits against real spending. **Reallocate funding**
   changes the plan, not the bank balance.
4. Use **Debts** for money owed in either direction and actual repayments.
5. Use **Forecast** for allowance envelopes and future scenarios. Use **Fund
   confirmed?** for an actual savings transfer, not for merely planning savings.

## Existing capabilities preserved

The deployed navy/gold identity, navigation groups and quick entry remain.
The four original budget profiles remain independent; the simpler prototype's
shared-mode replacement was not merged. Accounts, income schedules, linked bond
coupons, recurring and variable bills, occasional expenses, prepaid coverage and
recognition, reserves, windfall allocation, budget rollover, savings capture,
monthly review snapshots, reports, themes and advanced forecast scenarios remain.

Transaction Inbox approval rules, import deduplication, source mappings,
reversals and provenance remain. Encrypted full backups, safety exports, receipts,
offline installation/reopening, guarded saves, retained inputs, revision checks,
duplicate-submit protection, atomic record writes and failure deadlines remain.
No new Android/SMS setup is required.

## Source of truth and financial rules

`transactions` remains the only cash ledger. Budgets, allowances, scheduled
payments and forecasts are not additional bank accounts or duplicate receipts.
Money uses integer minor units with checked arithmetic.

| Event                                        | Cash effect                                            | Classification                                                               |
| -------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Personal earned income                       | Adds to its personal account                           | Actual personal income                                                       |
| Business revenue                             | Adds to its explicitly business-owned account          | Business revenue only                                                        |
| Business operating cost                      | Reduces business cash and profit                       | Not personal spending                                                        |
| Distribution to me                           | One transfer, business account to personal account     | Personal distributed income; not another consolidated revenue receipt        |
| Partner distribution                         | One marked business cash outflow                       | Reduces retained profit; not operating costs or personal spending            |
| Capital contribution                         | One personal-to-business transfer                      | Not revenue; automatic capital-return accounting is not implemented          |
| Ordinary account transfer / savings transfer | Moves existing cash                                    | No new income or ordinary expense                                            |
| Borrowing / debt repayment                   | Adds borrowed cash / reduces cash and outstanding debt | Not earned income / not an ordinary consumption expense                      |
| Lending / loan recovery                      | Moves cash into / out of a receivable                  | Outstanding receivables are never available cash                             |
| Budget reallocation                          | None                                                   | Moves limits, keeps original allocations and decision history                |
| Allowance plan or projected distribution     | None                                                   | Future assumption until an actual ledger event occurs                        |
| Unspent allowance returned to savings        | One linked transfer                                    | Reduces the category limit once; does not count as another expense or income |

Business profit is opening retained profit plus cash-basis revenue minus
operating expenses. Retained profit additionally deducts owner and partner
distributions. The ownership-based indicative share is not an automatic payout,
a personal cash balance or an enforceable distribution entitlement.

A positive distribution must fit retained profit, unreserved source cash and
total business cash after recorded liabilities, restricted money, reserves and
protected savings. Investments and savings accounts cannot directly fund a
distribution. Both creation and full-state validation enforce the safeguards;
editing a raw transaction cannot bypass them.

Personal net worth includes personal recorded assets and receivables minus
personal liabilities, excluding full business-owned balances and unvalued business
equity. Available personal cash subtracts protected money and liabilities;
expected income and unrecovered loans are excluded.

Allowance spending derives from its existing budget period, account and expense
categories. Confirmed non-spending funding is counted separately from expenses.
Returning an allocation lowers its effective limit and posts one savings
transfer; its capture is excluded from a second remaining-budget deduction.
Undoing a return is explicitly a correction of a movement that did not occur,
not an instruction to erase a real completed transfer.

Forecasts replace baseline category spending with the explicit allowance plan
over covered dates, rather than adding both. Remaining planned costs are
prorated with integer arithmetic. Unreceived business-owned receipts do not
become personal forecast income; explicitly planned personal distributions can
appear only as projections.

## Reconciled monthly UI scenario

The real interface starts with KES 1,000,000 in a personal bank and KES 20,000
in savings. It records salary of 100,000, business revenue of 200,000 and costs
of 40,000; pays the owner 60,000 and a partner 20,000; and creates a 100,000
allowance.

Spending is groceries 17,000 against a 15,000 limit, unexpected repairs 3,000,
and personal spending 6,000. Repairs are funded from miscellaneous 1,000 and
transport 2,000; groceries receive miscellaneous 2,000. A 20,000 liability is
partly repaid by 5,000; a 10,000 receivable is partly recovered by 3,000.
Planned savings of 30,000 are actually transferred, and unused personal
allocation of 4,000 is returned to savings.

| Final result                                            |       KES |
| ------------------------------------------------------- | --------: |
| Personal actual income, including owner distribution    |   160,000 |
| Personal actual expenses                                |    26,000 |
| Personal liquid cash, including savings                 | 1,152,000 |
| Business cash and retained profit, separately displayed |    80,000 |
| Personal liabilities                                    |    15,000 |
| Personal receivables, not available cash                |     7,000 |
| Personal net worth                                      | 1,144,000 |
| Protected personal savings                              |    54,000 |
| Available personal cash                                 | 1,083,000 |
| Adjusted allowance limit                                |    96,000 |
| Actual allowance savings funding                        |    30,000 |
| Remaining allowance                                     |    40,000 |
| Savings recorded this month                             |    34,000 |
| Conservative November 30 projected available cash       | 1,043,000 |

There are 12 cash-ledger entries. Budget reallocations create none. A separate
10,000 projected distribution creates no cash entry. Desktop and mobile tests
check these amounts across the running pages, reload offline, download an
encrypted backup and restore the same relationships in a fresh browser.

## Migration and backup compatibility

Financial schema and physical IndexedDB are version 5. Existing physical-v4
record headers and records migrate in one version-change transaction. A
`safety-before-schema-5` snapshot preserves the previous header/records, and the
existing destructive-action safety backup is retained. A malformed v4 header
aborts migration without replacing the original version or header.

Schemas 1-4 migrate forward, with the three new collections initially empty.
Legacy ownership is not guessed. Account ownership changes with opening funds
or existing history require explicit confirmation; unclassified historical
cross-ownership transfers may require manual review before reclassification.

Actual plain and encrypted schema-4 exports from the running deployment are
regression fixtures containing fictional demo data only. Both migrate and
round-trip through schema-5 encryption. A browser acceptance case restores
the deployed encrypted backup through the real Backup Centre.

**Schema-5 backups cannot be restored into the older deployed schema-4 app.**
Keep the original production backup while evaluating this preview. The full
backup envelope/encryption formats are unchanged; CSV remains a reporting
export, not a restorable database.

## Verification

Verified locally on November 6, 2026:

- Formatting, ESLint, TypeScript and the production/PWA build pass.
- 200 unit/integration tests pass, including financial conservation, payout
  protections, reversals, duplicate protection, forecasts, migration rollback,
  actual deployed backup fixtures and all prior financial/storage tests.
- 40 browser acceptance cases cover desktop Chromium and emulated Pixel 7,
  including the complete monthly workflow, payout/event linking and corrections,
  old encrypted backups, recurring/prepaid expenses, review snapshots, Inbox
  behaviour, offline persistence and independent restore.
- A deliberately blocked database write reaches the existing 15-second failure
  deadline without a false commit, retains form entries and succeeds once on
  retry. Both desktop and mobile cases pass.
- The monthly workflow checks that no financial requests go to external origins.

The first full browser run exposed a duplicate save-status live region and a
new test helper that checked the mobile menu before initialization. The context
message now uses a polite live region without competing with save status, and
navigation waits for the application shell. Targeted desktop/mobile reruns
verified both corrections before the final regression run.

Build output still warns about the main bundle exceeding 500 kB and third-party
Zod annotation placement. Neither warning was hidden. This change does not add
dependencies or claim a new large-dataset performance benchmark.

## Screenshots

All images are generated by the monthly UI workflow and contain fictional data.

| Page                           | Desktop                                                 | Mobile                                                |
| ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------- |
| Overview                       | [Desktop](images/connected-desktop-overview.png)        | [Mobile](images/connected-mobile-overview.png)        |
| Budgets and actual expenses    | [Desktop](images/connected-desktop-budget-expenses.png) | [Mobile](images/connected-mobile-budget-expenses.png) |
| Businesses                     | [Desktop](images/connected-desktop-businesses.png)      | [Mobile](images/connected-mobile-businesses.png)      |
| Debts                          | [Desktop](images/connected-desktop-debts.png)           | [Mobile](images/connected-mobile-debts.png)           |
| Advanced planning / allowances | [Desktop](images/connected-desktop-planning.png)        | [Mobile](images/connected-mobile-planning.png)        |
| Accounts                       | [Desktop](images/connected-desktop-accounts.png)        | [Mobile](images/connected-mobile-accounts.png)        |

## Remaining limitations

- Allowance periods cannot overlap, even on different personal accounts. This
  deliberately avoids claiming the same spending twice; parallel envelopes
  require a future explicit allocation-matching design.
- Business accounting is cash-basis planning, not full accrual, tax, inventory
  or statutory partnership accounting. Capital returns and business equity
  valuation are not automated.
- Historical mixed-use accounts require careful manual classification, not
  automatic guesses. A partner referenced by payout history must retain the
  recorded name; removing or renaming that partner is rejected.
- Common forms still expose advanced record relationships progressively; the
  original advanced planning and profile-comparison sections remain available.
- Mobile testing is browser emulation, not a new physical-phone installation,
  complete screen-reader audit or multi-device financial synchronization test.
- This is a local preview only. No push, merge, production migration or
  deployment has been performed.

## Exact local commit

The handoff includes the full commit hash. It can also be retrieved in this
worktree with:

```powershell
git log -1 --format=%H -- docs\CONNECTED_FINANCE_IMPLEMENTATION.md
```

The complete implementation, audit, regression fixtures and screenshot evidence
are committed together on the local preview branch.
