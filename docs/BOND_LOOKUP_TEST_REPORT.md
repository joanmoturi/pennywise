# Bond lookup test report

Validation uses synthetic parser/UI fixtures plus separately identified live
official-source checks. Test fixtures never claim synthetic issues are real.

## Actual final results

- Full unit suite: 261 passed in 14 files, including 29 bond-specific cases.
- Full browser suite: 44 passed on desktop Chrome and Pixel 7 emulation.
- TypeScript/production PWA build, ESLint, formatting and diff checks passed.
- Original six-bond workflow, linked coupon income/partial receipts,
  principal separation, manual schedules, encrypted backup/restore and offline
  financial regression tests all passed without weakening their assertions.

Bond unit coverage: exact issue/ISIN/name/verified alias, case/whitespace,
multiple exact alternatives, similar-number separation, suggestions without
selection, invalid/not-found identifiers, offline/source outage, missing
prospectus/calendar, coupon-versus-yield separation, exact fractional rates,
fixed/zero coupons, amortisation choices, source conflicts/quarantine, cache and
refresh differences, manual fallback, no holding population, historical state
preservation, explicit confirmation and non-KES protection.

The new browser workflow fills personal principal/notes, looks up/reviews and
confirms a reference, proves IndexedDB is unchanged before Save, persists the
precise coupon and reference after Save, proves no transactions/events were
created, reloads and cancels refresh without altering saved records.

## Live official verification actually performed

CBK listing HEAD/GET succeeded from this machine; CORS headers were inspected.
The August 2026 prospectus's identification/amortisation table and explicit
calendar were read and visually checked. Its three issue references are bundled
with a historical review timestamp, not a claim of ongoing live PDF parsing.

A separate clean Playwright browser exercised the real Vite
`/api/bond-reference` adapter, imported the actual application lookup code and
searched `IFB1/2021/018`. It returned `source: live`, ISIN `KE7000003546`,
coupon `12.667`, maturity `2039-03-21`, and 26 published remaining coupon dates
from the independently reviewed prospectus. This used no user financial data.

The first live attempt exposed conflicting CBK rows for unrelated
`KE5000004100`. The implementation was corrected to quarantine conflicting
identity/term groups, retain valid unrelated searches, and block exact conflict
queries including cached results. This behaviour has a synthetic regression test.

## Limits

No automated arbitrary-prospectus interpretation or complete market catalogue
verification is claimed. Detailed prospectus coverage is three reviewed issues.
Other listing matches may need manual coupon dates/tax/frequency/redemption
details. Publication day/original issue date are blank when not established.
No documented public bond API was found; the official HTML is the live adapter.
This report records local evidence; hosted adapter acceptance is recorded
separately in DEPLOYMENT_REPORT.md after publication.
Physical-device/investor custody conditions have not been independently verified.

## Files changed for bonds

New: `src/bond-reference-schema.ts`, `src/bond-catalogue.ts`,
`src/bond-lookup.ts`, `src/bond-lookup-ui.tsx`,
`functions/api/bond-reference.ts`, `tests/bond-lookup.test.tsx`,
`e2e/enhancements.spec.ts`.

Integrated: `src/domain.ts`, `src/engine.ts`, `src/context.tsx`,
`src/forms.ts`, `src/ui.tsx`, `src/pages-records.tsx`, `vite.config.ts`,
`README.md`. `src/auxiliary-storage.ts` is shared with cloud backup.
New bond documents: audit, architecture, data sources, matching/verification
and this report.

Nothing was pushed or deployed. Automated tests used isolated synthetic
workspaces; no personal financial records were rewritten or deleted.
