# Cloud backup test report

Local validation performed during the 2026-11-10/11 implementation session.
Only synthetic financial data and provider responses were used in automated
tests. No personal backup or financial record was committed or uploaded.

## Actual final results

| Command/check                  | Result                                                  |
| ------------------------------ | ------------------------------------------------------- |
| `npm test`                     | 261 tests passed in 14 files                            |
| `npx playwright test`          | 44 passed, desktop Chrome and Pixel 7 emulation         |
| `npm run lint`                 | Passed                                                  |
| `npm run format:check`         | Passed                                                  |
| `npm run build`                | Passed, including TypeScript and offline PWA generation |
| Pages Function ESLint/Prettier | Passed separately                                       |
| `git diff --check`             | Passed                                                  |

Build warnings: existing dependency pure-comment annotations, a main JS chunk
above 500 kB, and shared modules imported both statically/dynamically. No build
failure or paid dependency was introduced.

## Automated coverage

`tests/cloud-backup.test.ts` and `tests/google-services.test.ts` cover:
authenticated round-trip, recovery wrapping, fresh keys/salts/IVs, wrong password,
corrupt ciphertext, changed metadata, invalid IV/salt/version/work factor,
passphrase rewrapping without payload replacement, backward-compatible manual
encryption, 1 MB synthetic receipt payload, oversize rejection, durable encrypted
pending queue, upload read-back mismatch, duplicate prevention, offline/restart
revision recovery, in-flight new writes, owner mismatch, authorization/lock
gates, retry backoff, retention/protected/monthly versions and safe prune failure.

Synthetic JWTs exercise signature/issuer/audience/expiry/nonce/email validation.
Mock HTTP tests exercise application-only listing/pagination, folder creation,
multipart upload, stable backup IDs, HTTP 401/403/404/429/500, rate-limit versus
quota classification and bounded cloud download.

The original regression suite exercises complete State backup, independent
repositories, atomic replacement failure, safety snapshots, old schemas,
financial calculations and relationships. Browser tests preserve offline
accounts/budgets/transactions/recurring records, reloads, receipts, manual
encrypted restore, failed writes, service-worker updates and no unrequested
external data requests.

## Not demonstrated

Real Google sign-in/consent, real Drive upload/download/discovery, actual quota
and revocation, OAuth project review, and two physical-device restoration remain
unverified. No OAuth web client was supplied. The automated provider tests are
not live Google integration tests. A 35 MB full-backup stress run, browser
background suspension and hardware-specific PBKDF2 calibration were not performed.

Registration/email verification/password recovery/account linking are N/A for
the approved Google-only release. Automatic merge is not supported. Two-device
acceptance requires following GOOGLE_DRIVE_SETUP.md with disposable data.

## Files changed for cloud backup

New: `.env.example`, `src/auxiliary-storage.ts`, `src/google-services.ts`,
`src/cloud-crypto.ts`, `src/cloud-backup.ts`, `src/cloud-backup-ui.tsx`,
`tests/cloud-backup.test.ts`, `tests/google-services.test.ts`.

Integrated: `.gitignore`, `src/App.tsx`, `src/backup.ts`,
`src/pages-backup.tsx`, `index.html`, `public/_headers`, `README.md`.
New cloud documents: architecture audit/architecture, authentication, Drive
setup, encryption/recovery, automatic behaviour, restore/migration, security,
cost, release readiness and this report.

No commit, push or deployment was performed. Google setup remains a release
blocker rather than an invented successful acceptance result.
