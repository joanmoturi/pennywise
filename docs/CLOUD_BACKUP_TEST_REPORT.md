# Cloud backup test report

Local validation performed during the 2026-11-10/11 implementation session.
Only synthetic financial data and provider responses were used in automated
tests. No personal backup or financial record was committed or uploaded.

## November 11 persistent enablement follow-up

The customer flow now starts with **Enable Google Drive Backup**, requests the
Google account chooser directly, and saves the enabled preference and owner
binding. Reopening or losing authorization does not turn the preference off.
An authorized, unlocked session is still required to upload; this is not
persistent credentials or closed-app scheduling.

- 34 targeted tests passed across the cloud UI, encrypted backup engine and
  Google provider files. Six new cases cover customer enablement/reopening,
  cancellation, wrong account, first verified upload, failed upload and direct
  account selection without separate sign-in.
- Eight affected desktop/mobile browser cases passed: persisted enablement and
  disabling without authorization, unavailable-service/manual-backup behavior,
  bond draft preservation and offline local editing.
- TypeScript, production build, ESLint and formatting passed.
- The first desktop persistence test exposed an asynchronous controlled-checkbox
  reversion; disabling now updates immediately and rolls back on write failure.
  The affected desktop/mobile cases then passed without retries.

All Google authorization and HTTP behavior here uses synthetic mocks. The
application-owned OAuth client was absent during those runs, so real Gmail
consent, upload, restoration and physical-device behavior were not demonstrated.
The owner subsequently supplied the public Web client ID and confirmed saving
it in Pages Production. Real provider acceptance is a separate subsequent gate.

## Live configuration follow-up

The configured release passed its exact-SHA Pages check and its complete
production bundle matched the local configured build by SHA-256. An isolated
Chromium browser verified an enabled customer action and Google's real
authorization popup, without entering credentials or granting an account.
The 34 cloud/provider unit cases passed again with the shared configuration.

The owner reported a real Google account connection after tester approval,
then reported Audience **In production**. This is owner-reported authorization,
not an automated Drive upload/restore test. The owner explicitly chose to skip
the actual backup test; upload/read-back, recovery and independent-device
acceptance remain unverified.

## Original enhancement baseline

| Command/check                  | Result                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| `npm test`                     | 263 tests passed in 14 files after the hosted-source fallback |
| `npx playwright test`          | 44 passed, desktop Chrome and Pixel 7 emulation               |
| `npm run lint`                 | Passed                                                        |
| `npm run format:check`         | Passed                                                        |
| `npm run build`                | Passed, including TypeScript and offline PWA generation       |
| Pages Function ESLint/Prettier | Passed separately                                             |
| `git diff --check`             | Passed                                                        |

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
unverified by these tests. The OAuth Web client was supplied afterwards; its
configuration must not be confused with real provider acceptance. The automated provider tests are
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

Initial checks were local-only. Subsequent publication was explicitly authorized;
see DEPLOYMENT_REPORT.md for hosted evidence. Google setup remains a blocker for
enabling Drive, not an invented successful acceptance result.
