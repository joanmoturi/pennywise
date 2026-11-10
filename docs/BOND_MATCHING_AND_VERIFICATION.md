# Matching and verification

Matching priority is exact ISIN, exact issue number, then an explicitly recorded
official alias or recognised full name. Case, outer whitespace and spaces around
slashes are normalized. Numeric issue components are not guessed or globally
collapsed. The reviewed catalogue explicitly links CBK listing's unpadded
tenor aliases to its prospectus identifiers using the same exact ISIN.

Partial-text suggestions require explicit selection and never auto-populate.
Multiple exact matches stay visible for review. Unsupported/invalid identifiers
fail validation. Not-found results offer retry, edit search and manual entry.
No fake bond is created.

HTML is parsed as inert DOM, locating named table columns rather than positional
guesses. Coupon Rate is independent of Redemption Yield. Parseable values are
schema validated; missing/unverified fields remain unavailable. Changed layout,
inconsistent terms or ambiguous identity fail closed. Conflicting ISIN/issue
groups are excluded from public cache; exact conflict searches are blocked.
An unrelated conflict does not make an otherwise verified bond unsearchable.

Successful listing reads cache public reference metadata locally. No financial
holdings are sent to CBK or the proxy. The reviewed offline catalogue is bundled
with the application; its timestamps remain historical. Failed source reads
are not persisted as verified bonds. An unavailable source can fall back to a
clearly labeled last-known cache/catalogue.

Refresh updates cache candidates only. Saved holdings retain their own prior
reference copy until the user inspects differences and explicitly applies
available terms to a draft and saves. Personal principal/account/price/notes and
historical receipts/events are never overwritten by the lookup.

The user must confirm they reviewed the source before Use These Details enables.
KES terms cannot populate a non-KES workspace. Cash, maturity recovery, purchase
price, secondary-market details and actual coupons remain personal records.
