# Notification approval rules

Open **Transaction Inbox**. Create the receiving accounts in Settings first, then choose **Map source**. Enter the exact Android package name and select an existing account. An optional exact account hint distinguishes multiple accounts at the same institution; ambiguous mappings never auto-post.

New source mappings are review-only until you explicitly trust them for automation. New rules are disabled by default and have no broad all-incoming-income rule.

## Configure and simulate

Choose **Create rule**, then specify source, notification type, direction, inclusive amount range, optional exact known counterparty, priority (1 is highest), reference matching, confidence threshold (90–100), action, financial classification and target account/category. Link existing receivables, liabilities, bonds or transfer destination accounts where required.

Actions:

- **approve**: post only after all financial, identity and confidence gates pass;
- **categorise / assign**: propose category/account details, leaving the item pending;
- **hold**: retain for manual review;
- **reject**: explicitly reject the matched notification without posting.

Select an inbox item and **Simulate rules (including disabled)** before enabling a new rule. Simulation does not post money, mutate balances or increment match counts. Use a hypothetical or captured candidate with representative fields. Edit a rule to enable/deactivate it; changing it increments its version and preserves prior approval provenance and repository audit history.

Rules run when importing a selected file with **This is my trusted companion file; evaluate my enabled approval rules** checked. Without that explicit choice, import stays manual. Rules do not sweep previously imported items merely because they were enabled later; simulate/review those items individually.

## Financial safety

No automatic approval is possible without valid amount, matching currency, actual timestamp, reference, unambiguous direction, sufficient confidence, no missing fields and one trusted source/account mapping. Automatic incoming earned income/borrowed funds/loan recovery/investment income additionally requires an exact known counterparty.

Multiple identical matching actions use explicit priority and ID order. Any contradictory matching action/target, even at a lower priority, holds for review. No silent “first match wins” financial conflict.

Incoming transfers are held for source/destination review. Reversals, failed messages, balance-only updates, unknown types and potentially existing same-day/same-amount ledger items do not auto-post.

Borrowed funds require an explicitly created liability whose principal already includes this borrowing. A draw increases cash, not income; do not increase that principal twice. Loan recoveries reduce an existing receivable and cannot exceed its remaining principal. Bond coupon rules link the bond and classify income; principal recovery is not coupon income.

The inbox retains rule ID/version, approval timestamp/explanation, parser confidence, source, fingerprint and ledger transaction IDs. Posted records cannot be discarded or directly deleted through the inbox; link an allowed reversal or perform a carefully reviewed correction.
