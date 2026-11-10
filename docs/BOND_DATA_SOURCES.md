# Official bond data sources and limitations

Primary source: Central Bank of Kenya.

- Treasury Bonds and embedded issues listing:
  https://www.centralbank.go.ke/bills-bonds/treasury-bonds/
- Prospectus reviewed on 2026-11-10, pages 1-3:
  https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/44389638_AUGUST%202026%20IFB1-2019-016%2C%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026..pdf

The official page links prospectuses, auction results, payment and maturities
publications. Its HTML issues table is machine-readable without executing CBK's
JavaScript. No documented public bond API was found in the official-site
investigation. WordPress wp-json discovery is not evidence of a documented
financial API, and no such endpoint has been invented.

Direct GET/HEAD succeeded from this machine; headers lacked
Access-Control-Allow-Origin. A fixed-upstream same-origin adapter was therefore
necessary for live browser listing access. Local Vite access was exercised.
The Pages Function is optional for ordinary offline/manual financial operation.
See DEPLOYMENT_REPORT.md for hosted publication and verification status.

The reviewed fallback catalogue covers IFB1/2019/016, IFB1/2021/018 and
IFB1/2021/021. Their coupon calendars are the explicit remaining dates in the
2026 re-opening prospectus, not complete original-issuance histories.
Reopening settlement is not acquisition or original issue date. Tax exemption
and amortisation terms are from that prospectus; custody/pledge and small-balance
conditions still need personal review. No personal principal is inferred.

The live issues listing actually contained conflicting rows for unrelated
ISINs during this task. Such rows are quarantined. Other unambiguous issues
remain searchable. Exact conflicting identifiers report an error rather than
choosing a convenient row, yield or maturity.

The adapter does not automatically interpret arbitrary PDFs. For issues outside
the reviewed catalogue, prospectus URL, fixed/floating classification, tax,
coupon frequency/dates and redemption terms may be unavailable. Those fields
require manual verification. Publication day and original issue date remain
blank where not established; retrievedAt is not the same as verifiedAt.

Cached listings are last-known references, not promises of current coverage.
Detailed catalogue calendars retain their actual review date even after a new
listing fetch. The feature never labels a derived six-month date as official.
Prices, effective returns, auction/redemption yields and personal acquisition
terms are not substituted for the coupon rate.

## Hosted-source availability fallback

The first hosted deployment returned HTTP 503 for live CBK retrieval although
the same official page remained accessible through the local adapter. Hosting
success is not evidence that CBK accepts requests from its network.

`src/bond-listing-snapshot.json` was generated from the actual official HTML at
`2026-11-10T22:07:30.713Z`. The existing conservative parser admitted 50
unambiguous issue records and quarantined 161 conflicting rows. These are public
reference data, not user financial records. The three prospectus-reviewed
entries retain their earlier detailed-term verification timestamps.

If live retrieval is unavailable and no local cache exists, the application
loads this versioned snapshot as a same-origin, precached application chunk,
validates it, blocks conflicting identifiers and explicitly displays its
retrieval date and lack of fresh verification. It never labels this route as
live CBK success. Refreshing this bundled snapshot requires checking the official
source again and publishing an updated build; no unattended freshness guarantee
is made. The smaller reviewed catalogue remains a final fallback if the snapshot
cannot load.

The public proxy exposes only a coarse source HTTP status or timeout/network
category on failure. It does not expose upstream bodies, credentials or logs.
