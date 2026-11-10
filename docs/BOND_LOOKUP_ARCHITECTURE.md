# Optional official bond reference lookup

Existing bond holdings and financial relationships are retained. The bond
schema has backward-compatible optional reference metadata, exact coupon
percentage, separately verified outstanding coupon principal/date and an explicit redemption
estimate choice. Existing IDs, rates, principal, events and receipts are not
rewritten by lookup, refresh or migration.

`bond-reference-schema.ts` validates official terms and HTTPS CBK URLs.
`bond-catalogue.ts` contains three manually reviewed prospectus references.
`bond-lookup.ts` parses published issue-listing table columns, quarantines
conflicting source rows, matches conservatively and caches public references.
`bond-lookup-ui.tsx` adds review/confirmation to the existing add/edit dialog.
`FormDialog.draftPanel` changes only draft form values, not the repository.

The browser requests the fixed same-origin `/api/bond-reference` route without
sending its selected identifier or any holding data. Vite supplies it locally.
The optional Pages Function fetches only the fixed official public
listing, omits credentials, rejects redirects, bounds response size and returns
inert text. It cannot proxy arbitrary user URLs and stores no financial records.

Official listing-only fields: issue identifier, ISIN, tenor, published coupon
percentage and maturity when parseable. Ambiguous original/reopening issue date
is not populated. Frequency, tax, detailed dates and redemption terms are only
added from independently reviewed prospectuses, never inferred generically.

Review + confirmation + Use These Details populates available official fields
only. Saving is separate. Principal, maturity proceeds, account, notes,
actual receipts and custody/purchase assumptions are not populated.
Manual entry is always available, including offline or on any source failure.

Saved reference copies preserve historical financial inputs even if the global
cache refreshes. Differences from saved reference are displayed before draft
replacement. No lookup automatically records an income, principal repayment,
cash movement or expected event.

Published future expected dates may be added using a separate explicit
confirmation. This skips existing active dates and never modifies historical
events/receipts. Personal coupon estimates preserve fractional basis points.
Optional amortisation estimates apply only after the user verifies their
outstanding-principal date and selects standard percentages or full redemption.
The estimate balance is separate from the historical asset principal: actual
principal-recovery transactions already reduce the asset ledger. Configuring
coupon estimates must not subtract those repayments twice from assets.
They do not post repayments. The amortisation-date coupon uses pre-redemption
principal; subsequent coupons use the selected projected reduction.
