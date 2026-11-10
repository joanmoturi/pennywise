# Bond lookup audit - 2026-11-10

## Existing architecture

`domain.ts` bondSchema: id/name/identifier/issuer/accountId/notes strings;
principal and maturityValue nonnegative integer minor units; couponBps and
taxBps integer basis points; paymentsPerYear integer 1..12; maturity ISO date.
Each bond record is an independent holding. Multiple purchases can be separate
holdings with the same issue identifier. There is no issue-level reference
table, purchase-price ledger, custody field or amortisation rule model.

`forms.ts` defines add/edit fields and defaults. `pages-records.tsx` provides
Bonds and linked Income cards. `engine.ts` computes coupons from personal
principal, rate, frequency and tax; principal recovery transactions reduce
bond assets. `reports.ts` reports linked actual coupon income separately from
principal. PaymentEvent records store explicit due dates, amounts and status.
Receipts link by sourceId/eventId and support partial actual receipts.
Manual schedule generation is explicitly user-selected; maturity is entered,
not calculated from a guessed tenor. Existing expected event amounts are
historical records and must not be rewritten by lookup or refresh.

## Source investigation

CBK's official Treasury Bonds HTML has embedded wpDataTables with Issue Date,
Issue No, ISIN Number, Tenor, Face Value, Maturity Date, Coupon Rate and
Redemption Yield. Coupon and yield are distinct columns. A WordPress discovery
link is not a documented financial API. No documented public bond API was found
in the official site investigation; this is not proof that none exists.
2026-11-10 HEAD/GET succeeded from this machine, but did not return an
Access-Control-Allow-Origin header. Browser access therefore needs a
same-origin public-data adapter or an explicitly maintained offline catalogue.

A CBK August 2026 re-opening prospectus was read and its table and coupon
calendar visually checked. It covers IFB1/2019/016, IFB1/2021/018 and
IFB1/2021/021. Original issue dates are not the re-opening settlement date.
Small-holding full redemption is per CSD account, not per application holding;
do not infer it without the user's complete custody position.

## Scope and preservation

Add optional issue reference metadata to existing bonds without changing IDs,
principal, cash, receipts, historical events or purchase assumptions. Lookup
populates a draft only after confirmation; saving remains separate. Published
schedules are reference dates, not received payments. Fractional-basis-point
official coupons must retain their exact rate, not silently round 12.667%.
Amortisation estimates require an explicitly configured personal remaining
principal and review of custody-dependent redemption conditions.

Cloud backup is separately audited in CLOUD_BACKUP_ARCHITECTURE_AUDIT.md:
existing encrypted/manual backup foundations, but no cloud integration at audit.
