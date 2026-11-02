# Transaction parsing reference

## Supported contract, not invented bank formats

The PWA accepts `pennywise-notification-batch` version 1 as documented in `NOTIFICATION_INTEGRATION_GUIDE.md`; this historical name is retained for compatibility after SMS migration. Maximum: 100 candidates / 500 KB. Source adapters are prepared for M-Pesa, Equity, KCB and configurable SMS senders. Their initial fixtures are explicitly synthetic labelled examples, not representations of real provider wording. Actual provider accuracy is **UNVERIFIED** until privacy-safe representative formats can be independently validated. Never commit personal SMS samples.

A candidate preserves parser ID/version, original source, capture time, confidence (0–100), missing fields, validation result and a normalized SHA-256 fingerprint. A transaction timestamp is optional at capture, but required before posting. Capture time must not silently become transaction time. Dates are posted using Pennywise's existing Africa/Nairobi financial calendar.

The initial companion's exact synthetic body format is:

```text
SYNTHETIC|Amount=123.45|Currency=KES|Ref=TEST001|Date=2026-11-02T18:00:00Z|Direction=credit|Kind=received|Party=TEST sender|Fee=0|Balance=900.10|Account=TEST wallet
```

Each sender can choose profile `mpesa`, `equity`, `kcb` or `generic`, a literal safe prefix, delimiter (`|`, `;` or `~`) and unique field labels. Use **Test sample locally (no queue write)** with synthetic text before enabling that parser. This intentionally supports known labelled structures, not arbitrary bank prose or invented provider-specific templates. Real SMS formats require new tested adapters, not merely enabling a bank-name profile.

The original detected sender is optional `senderId` metadata; the stable source is `sms.s` plus SHA-256 of its canonical allowlist identifier. New native candidates carry parser version 2; stored version-1 candidates retain their evidence. SMS service-centre timestamps are validated but never substituted for an absent transaction `Date`. Native initial currency support remains KES. Absent fees/balances/accounts remain absent, not zero. Complete explicit labelled fields score 95; missing/ambiguous fields or failed/reversal types score 35 and require review. These are deterministic parser scores, not measured provider accuracy. Conflicting kind/direction and oversized ambiguous fields cannot be high-confidence.

Amounts, fees and balances are safe integer minor units. KES 5,000 is `500000`. Amount excludes a separately stated additional fee; where a source format does not establish that distinction, hold for review. A balance must never substitute for the transaction amount. No amount/reference/currency is inferred merely because the source is a known bank.

## Candidate types and financial treatment

| Candidate | Safe ledger treatment |
| --- | --- |
| Received/deposit | Review receipt classification; never default earned income |
| Sent/withdrawal/merchant/PayBill/Buy Goods | Confirm debit, account and expense versus owned transfer |
| Charge | Expense only if it represents an independently stated transaction; avoid importing a fee twice |
| Transfer | Two distinct owned accounts; no income or expense |
| Loan repayment received | Existing receivable principal recovery; interest separate |
| Loan/debt payment sent | Existing liability repayment |
| Coupon/interest | Explicit investment classification; coupon links the bond |
| Principal | Bond principal recovery, not income |
| Refund/other receipt | Reviewed cash adjustment, not automatically earned income |
| Reversal | Manual exact original-transaction link; original retained |
| Failed/balance-only | Cannot post |
| Unknown/incomplete | Review and correct extracted fields first |

Sensitive OTP/PIN/password/login content is excluded rather than retained as a parsing error. Disabled/unapproved senders' decoded message bodies are not accessed by acquisition code. Android must decode PDUs to expose addresses; no unrelated decoded body is persisted. Malformed multipart data, unsupported format/encoding and invalid SMS timestamps fail closed. RCS, MMS, app messages and historical inboxes are not read.

## Deduplication and conflicting changes

Stable source/reference identities and normalized fingerprints survive queue retries and PWA backup restoration. Reference conflicts are held; updates are retained on the original inbox item for inspection. Exact retries increase a delivery count rather than post again. Sources mapped to the same account are checked for matching references to reduce duplicate app/SMS capture. Ledger provenance protects against reimport after approval.

SMS messages for both sides of an owned transfer may use different references. Automatic processing conservatively holds possible same-day/same-amount existing ledger entries. This is not a universal cross-bank transfer reconciler: review both sides explicitly. Existing CSV entries without reference/provenance may require manual reconciliation.

Missing references are never automatically posted, even if a rule's matching condition does not require one. A file's source/fingerprint is self-reported data, not a bank signature. Only process your own companion files.

## Reversals

Full-amount simple income, expense, transfer and loan/debt repayment reversals can be explicitly linked. The inverse retains the original type, account relationships and exact negative amount, so original financial totals are offset instead of creating unrelated income. Repeated reversals are rejected.

Borrowing draws, bond principal/maturity, reserve earmarks, prepaid, savings-capture and windfall-linked corrections are held for separate manual reconciliation. Partial reversals and reversing fees are not auto-guessed. Failed originals and balance-only notifications cannot be edited into completed ledger entries.
