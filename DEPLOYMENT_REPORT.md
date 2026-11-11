# Pennywise deployment execution report

**Updated:** November 11, 2026 (UTC+3). Initial publication: November 1, 2026.

## November 11 full end-to-end regression fixes

The final application candidate passed **270 unit/integration tests**, the complete
**52-case desktop/mobile browser suite** without failures/skips, and **four
additional configuration-disabled browser checks**. ESLint, formatting,
TypeScript/production build and diff whitespace checks passed.

Fixed Google initialization before opt-in, added blocked-popup guidance,
excluded generated browser reports from the Windows development watcher and
made browser tests build current source with explicit configuration.
Six new mock-provider browser journeys cover encrypted Drive upload, recovery,
fresh-browser restore with safety export, failed upload/read-back, stable retry,
consent failures and wrong-account preservation. They do not prove real Drive
file operations, which remain unverified.

Application commit `2b3dfeafae58cb241b37c3947915b5e44759cac2` was pushed to
`main` and passed its exact-SHA **Cloudflare Pages** check for deployment
`b0e9b1b0-4ee9-4e57-8024-7818a388655d`.
Production serves the separately built real-client `/assets/index-BofOZYVq.js`,
SHA-256 `1047029acd8c7b04be6674661973b3d009a5999e13e5427dc460035e55389012`.
Its complete bytes match the locally validated real-client build, not the
synthetic-client test build.

Fresh production desktop and Pixel 7-emulated browser contexts passed manual
full-backup download, no external requests before Google opt-in, offline reload
with preserved synthetic account records and Google's real authorization popup
on explicit enable. No credentials were entered, consent granted or real Drive
files created. No page errors were captured; Google's popup emitted COOP
`window.closed` console diagnostics, without preventing either popup.
First-install worker activation was explicitly awaited and followed by an
online navigation before testing offline control. The local development server
also remained responsive. Subsequent documentation-only publication retains
the application fingerprint above.

## November 11 shared Google authorization configuration

After the persistent-enablement release, the owner created the Pennywise
Google project, enabled Drive API, created a Web application OAuth client with
the production JavaScript origin and confirmed saving its public client ID in
the existing Pages Production `VITE_GOOGLE_CLIENT_ID` variable.

Configured release `868c4f788d7ab85192f2b5b02718f12d7fbf580c` passed its exact-SHA
Pages check for deployment `28237c65-ed5e-46ba-9fae-ce92ed6028db`.
Production `/assets/index-DOUS6jo2.js` matched the complete locally configured
build by SHA-256. Isolated Chromium confirmed that the enable action is available
and opens Google's authorization popup at `accounts.google.com`; that automated
check used no real Google credentials or financial records. The 34 targeted
cloud/provider tests also passed with the shared client configuration.

The owner separately reported a real account connection after adding their
account as a tester, then reported changing Audience to **In production**.
The owner explicitly skipped the actual backup test: upload/read-back,
restoration/recovery and independent-device acceptance are not claimed.
Subsequent documentation-only publication retains the same application asset.
No client secret, refresh token, customer developer configuration or financial
backend was introduced.

The earlier configuration-disabled publication evidence below is historical.
Owner-reported authorization is distinct from automated file-operation
acceptance; neither saving a client ID nor a successful build proves uploads or
restores. The enabled preference persists locally, but short-lived authorization,
memory-only encryption and closed-browser limitations are unchanged.

## November 11 persistent Google backup customer-flow follow-up

The customer entry action is now **Enable Google Drive Backup**, followed by the
Google account chooser, not mandatory separate application sign-in. The selected
account and enabled preference persist in auxiliary IndexedDB. Restarting,
authorization expiry and a failed upload do not switch the preference off.
Disabling remains available while disconnected. Encryption is still mandatory;
**Unlock and Back Up** starts an upload, with success reported only after a
newly verified snapshot.

The production-build candidate is `/assets/index-B8yMJWCY.js`. The existing
Git-connected Pages project remains the publication target. Local validation
passed 34 targeted cloud/provider tests, eight affected desktop/mobile browser
cases, lint, formatting and TypeScript/production build. The customer UI suite
was also rerun after final presentation changes. The earlier publication
fingerprints below describe the initial November 11 releases, not this candidate.

**Actual Google connection remains blocked by missing application-owned OAuth
configuration.** This is a one-time publisher setup, not per-customer developer
configuration. No credentials were fabricated, no tokens or encryption secrets
were made persistent, and no real Google integration or closed-app scheduling
is claimed. Persisting the enabled preference does not itself solve those
separate prerequisites.

## November 11 encrypted Drive backup / official bond lookup publication

The user explicitly authorized pushing and deploying the existing enhancements.
The existing public repository, `main` branch and Pages project were retained.
No financial database service, paid financial API or Google credentials were
introduced.

**PUBLISHED AND VERIFIED, WITH THE LIMITATIONS BELOW.** Initial application commit
`410f02aab54fd84d3780f99a89b4ef68d01161a7` deployed successfully through Pages
deployment `bce0850b-82e7-400c-ab7f-f6d69d60b0d5`. Hosted-source fallback commit
`8af186dc9fe8577c7344f99808734b3b8d90fe51` then passed its exact-SHA
**Cloudflare Pages** check for deployment
`4585229d-6b9d-4054-af2b-4b5a3577a5a7`.

The stable production origin `https://pennywise-7lz.pages.dev/` serves
`/assets/index-QfbxraTq.js`; its complete SHA-256 digest matched the locally
validated production bundle. The separate Workers build check was not used as
Pages deployment evidence. The following documentation and local Vite adapter
publication does not change application assets.

Validation evidence:

- The initial enhancement passed 261 unit tests and the full 44-case
  desktop/mobile browser suite. The hosted-source follow-up passed all 263 unit
  tests, formatting, ESLint, separate Function lint, TypeScript and production
  build, plus six affected desktop/mobile browser cases.
- Isolated production desktop Chromium verified real lookup with explicitly
  dated fallback, confirmation before draft population, exact 12.667% coupon,
  preservation of a synthetic personal principal, cancellation without saving a
  bond, optional Google setup and offline reload preserving the synthetic
  account. No page errors or network writes were observed in that desktop run.
- A separate fresh Pixel 7-emulated context verified the backup UI and absence
  of horizontal overflow. Actual worker/manifest responses, manifest-referenced
  192/512 PNG icons and dimensions, production CSP and popup policy passed.
  The generated public-reference chunk is included in the service-worker
  precache.

**Live CBK limitation:** the published `/api/bond-reference` returns HTTP 503 with
the safe diagnostic `X-Pennywise-CBK-Status: network`. The underlying hosted
retrieval failure is not resolved or represented as a successful live source
request. Lookup instead offers the actual official listing snapshot retrieved
`2026-11-10T22:07:30.713Z`: 50 admitted records, with 161 conflicting rows
quarantined. Its visible warning explicitly says this is not fresh verification;
detailed prospectus terms retain their separate review date. Unknown or
conflicting identifiers must still be entered manually, not guessed.

**Google readiness limitation:** the optional Drive implementation is published
but configuration-disabled because no application-owned OAuth client ID has
been supplied. Real consent, Drive upload/download and physical two-device
restoration remain unverified. One shared application-owner Google project,
Drive API enablement, OAuth consent/client and production origin are needed;
set Pages Production `VITE_GOOGLE_CLIENT_ID` and rebuild. End users do not
create developer projects or provide OAuth client IDs.

The current web scheduler is active-app automation with an unlocked encryption
key and valid authorization, not a closed-app backup guarantee. WhatsApp-style
Android scheduling needs a native storage/snapshot integration, OS-scheduled
jobs and an explicit protected background-key policy. The existing SMS
companion cannot read Chrome's private IndexedDB. No such native migration or
refresh-token backend was added; see `docs/GOOGLE_DRIVE_SETUP.md`.

## November 3 SMS / Transaction Inbox publication

The user explicitly authorized publishing the current Pennywise changes and confirmed retaining the repository's existing **PUBLIC** visibility. Earlier private-repository statements in the historical report below describe the initial November 1-2 publication, not the current visibility.

This update publishes the existing Transaction Inbox, approval rules, duplicate safeguards, schema-4 backup compatibility and SMS companion source. The toolchain wrapper, local APK build evidence and redacted in-memory parser harness are included in source; the APK, signing keys, local databases, financial files and test artifacts are excluded. Remaining obsolete notification-reader setup labels in the PWA were corrected without changing financial logic or layout.

**PUBLISHED AND VERIFIED.** Application commit `263cded89aa7cf5d3ba726982f3fbfa9e9a76568` was pushed to `joanmoturi/pennywise` main, including the previously local Inbox/SMS commits. GitHub's exact-SHA **Cloudflare Pages** check succeeded for deployment `1b61fd4e-ef1a-4031-8c01-c9b7346c057c`. The stable production URL `https://pennywise-7lz.pages.dev/` serves `/assets/index-DPAK0JzT.js`, whose complete contents matched the validated local production bundle. The unrelated Workers build check was not used as Pages deployment evidence.

The target remains existing project `pennywise`, branch `main`; no new origin, backend or financial-data service was introduced. Current Android build/device evidence is in `ANDROID_BUILD_AND_DEVICE_REPORT.md`. Publishing the PWA does not certify real-bank formats, physical-phone behavior or Android Sharesheet routing, and the APK is not published.

Pre-push validation for this update passed: formatting, ESLint, **148 unit/integration tests**, TypeScript/production build and **20 desktop/mobile browser tests**, with no failed or skipped cases. Existing Zod annotation and approximately 523 KB bundle warnings remain visible. The produced main bundle is `/assets/index-DPAK0JzT.js`.

Live verification used fresh isolated Chromium contexts, never an existing personal browser profile:

- Desktop and Pixel 7 mobile-emulated smoke checks passed: root/nested refresh, active controlling worker, offline nested reload, preserved navy/gold presentation, no horizontal overflow and no captured JavaScript/console errors.
- Actual HTTPS manifest/worker/icon responses, MIME/cache/security headers, PNG dimensions, standalone manifest and immutable hashed JavaScript were checked successfully.
- **Seven live SMS-file acceptance assertion groups passed:** actual synthetic native export validation (including `senderId`), offline Inbox import without ledger posting, duplicate import preservation, exact receipt identities, constrained trusted source/account/rule posting, repeated-import ledger idempotency, and no observed external requests or network writes.
- Those SMS checks used two independent desktop browser contexts at the real production origin, switched offline after priming the worker. They do not claim installed Android PWA Sharesheet acceptance or a new native-device test.

All exercised production requests were same-origin asset GETs; no real financial records or SMS were used. Native file/receipt test fixtures remain private session artifacts and were not committed. Subsequent documentation-only commits retain the same application asset fingerprints. Existing installations should back up records, save open forms and choose **Reload update** when offered; no storage clearing or forced reload is required.

## Historical November 1-2 publication

**Status: LIVE AND VERIFIED in isolated desktop and mobile-emulated Chromium. Physical Android installation remains UNVERIFIED.**

**Production:** `https://pennywise-7lz.pages.dev/`

## Target and authentication

| Item                          | Evidence / status                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Repository URL                | `https://github.com/joanmoturi/pennywise`                                                                     |
| Repository visibility         | **VERIFIED PRIVATE** using GitHub API/CLI; not changed                                                        |
| GitHub identity / permission  | `joanmoturi` / repository ADMIN                                                                               |
| Production branch             | `main`                                                                                                        |
| Extracted repository base     | `86578147a2335c71fd2c53fec33e2bf007a9c1de` — Pennywise-only history published to new private main             |
| Original implementation hash  | `d84c66531c1b5d7c5d65aac1cde732527191a33d` in the original repository; subtree extraction rewrites commit IDs |
| Push                          | **COMPLETED / VERIFIED**, new private repository contains only the reviewed Pennywise subtree                 |
| Verified application commit   | `3d3f146d1567827ff573a2530e8c28368274bad8` — midnight navy / warm gold palette and theme persistence fix      |
| Cloudflare Pages project      | `pennywise`, Git-connected; successful GitHub Cloudflare Pages check for the exact application commit         |
| Production deployment ID      | `38fc404e-46dd-49d3-a6d2-301c45755ea6`                                                                        |
| Live HTTPS URL                | `https://pennywise-7lz.pages.dev/`                                                                            |
| Cloudflare authorization      | User completed dashboard authorization; no credentials shared with the agent                                  |
| Physical Android verification | **UNVERIFIED**                                                                                                |

At the user's explicit request, Pennywise was separated into its own private repository on November 1, 2026. `git subtree split --prefix=pennywise` preserved Pennywise-specific history without changing the original repository's branches or deleting files. The extracted root tree `35e58abee5e9d9665fdf57a5c29fba531cdffdc5` exactly matched the previously reviewed and validated Pennywise subtree before documentation updates. No Engineering Academy files, ignored databases, dependencies or backups were copied.

The independent laptop checkout is `C:\Users\joanmoturi\pennywise`. Continue development there, not in the old application's subfolder. The original `MyLearningApp` repository retains its existing history and pre-existing root README/ignore edits unchanged. Its previously published Pennywise copy was not deleted or force-rewritten.

The extracted base identifies the original validated application. The verified application commit above adds the requested midnight-navy/warm-gold presentation, matching icons/chrome, a dark default for new workspaces and a fix that captures theme selection before asynchronous persistence. Existing saved preferences and financial records are preserved; select **Settings > Theme > Dark** if an existing workspace is light. Storage, encryption and accounting engines were not modified.

Verification is a snapshot of that application commit. Subsequent report and origin-portable browser-test commits do not alter application assets.

## Pre-push validation completed

Executed again for this deployment request on November 1, 2026:

| Check                  | Result                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`               | **PASSED**, 527 packages installed from the exact lockfile, 528 audited                                                                       |
| `npm run lint`         | **PASSED**                                                                                                                                    |
| `npm run format:check` | **PASSED**                                                                                                                                    |
| `npm run test`         | **PASSED**, 101 unit/integration tests across 5 files                                                                                         |
| `npm run build`        | **PASSED**, includes `tsc --noEmit`                                                                                                           |
| `npm run test:e2e`     | Original 14 cases passed; 2 added theme-persistence cases passed after fixing theme selection. Final affected theme/offline rerun: 4/4 passed |
| Output                 | **VERIFIED** `dist` relative to the Pennywise application root                                                                                |
| PWA artifacts          | **VERIFIED** manifest, actual 192/512 PNG dimensions, worker, root-absolute module URLs and copied `_headers`                                 |
| Routing fallback       | No root `404.html`; configured Workbox fallback and Pages' documented SPA default                                                             |

All checks above were rerun successfully from the separate `C:\Users\joanmoturi\pennywise` checkout after separation: locked installation, formatting, lint, 101 unit/integration tests, TypeScript/production build and 14 browser tests. The fresh Windows clone initially lacked dependencies and checked text out as CRLF, causing build/format failures. Dependencies were restored using `npm ci`; `.gitattributes` now pins LF text checkout and the existing formatter normalized local line endings without changing application content. No failing validation or permission controls were disabled.

For the palette update, formatting, lint, 101 unit/integration tests and production build also passed. All 16 local browser cases passed across the full run and targeted reruns; the initial new theme cases exposed an asynchronous selection bug, which was fixed rather than bypassed.

Existing non-fatal Zod build annotation warnings and npm development-tool advisory warnings remain visible. The local install uses the development environment's configured registry. The real Cloudflare Linux build now succeeded; its dashboard logs were not independently downloaded, so this report does not infer a particular registry/network route from success alone.

## Repository security gate

**Independent reviewed snapshot: PASS.** The reviewer inspected all **50 Pennywise candidates** and all **9 locally reachable commits / 162 unique file blobs**, including freshly fetched `origin/main`. No actual credentials, personal financial records, local databases, backups or generated artifacts were found in the candidate set. History remains unchanged.

Pennywise-only ignore rules were strengthened for data/backup/export/receipt/statement/credential directories, local database formats, key/certificate files, CSV exports and logs. The reviewer then rechecked the rules and unchanged 50-file candidate set and explicitly returned **PASS TO COMMIT/PUSH**. Arbitrarily renamed financial JSON still requires explicit review rather than relying on filename patterns.

| #   | Severity | File | Lines | Vulnerability                                                                                                   | Confidence |
| --- | -------- | ---- | ----- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| -   | -        | -    | -     | No high-confidence exploitable application vulnerability or actual committed secret found in the reviewed scope | -          |

Intended exclusions include dependency/build/test artifacts, `.env`, databases, receipts/backups/financial exports and actual credentials. Hypothetical test amounts, fictional record names and test-only encryption passphrases are not personal financial records.

The previous application security review identified no high-confidence exploitable application vulnerability. There are still **19 development/build advisory entries (2 low, 17 moderate)** from three underlying advisories; no compatible untested forced upgrades are being introduced. Details remain in `DEPLOYMENT_READINESS_REPORT.md`.

## Completed Cloudflare setup

**COMPLETED.** The user authorized Git integration and created the separate Pages project. The first Pages build generated the application successfully but failed to locate an output directory entered as `" dist"` with a leading space. Correcting it to `dist` allowed production publication.

The project is Pages, not the separate Worker created during dashboard navigation. No Worker configuration, financial-data backend, API token, database or paid infrastructure was added to the source repository. Use the existing Pages project for updates; no new project or hostname is required.

The documented build configuration remains:

| Pages field                            | Exact value                   |
| -------------------------------------- | ----------------------------- |
| Repository                             | `joanmoturi/pennywise`        |
| Production branch                      | `main`                        |
| Framework preset                       | `None`                        |
| Root directory                         | Leave blank (repository root) |
| Build command                          | `npm ci && npm run build`     |
| Build output directory                 | `dist`                        |
| Build variable                         | `NODE_VERSION=26.13.0`        |
| Build variable                         | `SKIP_DEPENDENCY_INSTALL=1`   |
| Functions / bindings / runtime secrets | None                          |

The successful GitHub check identifies Cloudflare project `pennywise` and the exact application SHA above. Live HTML references `/assets/index-EnVoWNBp.js`, matching the tested local production artifact. The complete setup/update guide is `DEPLOYMENT_GUIDE.md`.

## Live verification and remaining work

| Check                                                                           | Status                                                                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Production build on Cloudflare / intended Git commit match                      | **VERIFIED** successful Pages check for `3d3f146d1567827ff573a2530e8c28368274bad8`                        |
| Actual public HTTPS homepage and nested-route refresh                           | **VERIFIED** root and `/monthly/review/`, desktop and mobile emulation                                    |
| Live JS/CSS, worker/manifest/icon responses                                     | **VERIFIED** successful loads; no captured JavaScript/console errors                                      |
| Live MIME, cache and security headers                                           | **VERIFIED** manifest/worker/PNG MIME, CSP/nosniff, no-cache entry/assets metadata, immutable hashed JS   |
| Live service-worker registration and offline reload                             | **VERIFIED** active controlling worker and offline root/nested reload                                     |
| Live browser network capture / absence of financial uploads                     | **VERIFIED in exercised workflows** same-origin asset GETs only; no external financial/API calls          |
| Live theme, navigation and financial workflows                                  | **VERIFIED** 10 workflow tests, 5 desktop and 5 Pixel 7 Chromium-emulated                                 |
| Live encrypted recovery into empty independent browser                          | **VERIFIED** desktop and mobile emulation; full state comparison, reopen persistence and source isolation |
| Live failed encrypted restore preserves existing state                          | **VERIFIED** wrong password, damaged ciphertext and unsupported-file rejection; safety download           |
| Local simulated offline entry/reopen/reconnect                                  | **VERIFIED** in automated isolated browser contexts                                                       |
| Local independent-device encrypted backup/restore                               | **VERIFIED** by browser/repository tests                                                                  |
| Local shell update without IndexedDB replacement                                | **VERIFIED** in automated static-deployment simulation                                                    |
| Physical Android installation, standalone launch, downloads and offline restart | **UNVERIFIED**                                                                                            |

Two additional live browser smoke runs verified actual manifest/icon dimensions, standalone-compatible display/start/scope, root/nested refresh, worker control, offline startup, navy/gold computed colours, no horizontal overflow and error-free asset loads. Screenshots were inspected at desktop and mobile sizes.

The root, worker, manifest and icons return `Cache-Control: no-cache`; nested SPA fallback returns `public, max-age=0, must-revalidate`, which also requires revalidation. Content-hashed JavaScript returns immutable caching. No CDN setting was weakened to force a check to pass.

The encrypted recovery exercise used only hypothetical records in fresh automated browser contexts at the real origin. It downloaded an encrypted full backup, changed the source afterward, started an independently empty target, rejected three invalid imports without changing state, restored the original snapshot, verified its safety export and reopened the target successfully. Financial records and passphrases were not uploaded to hosting.

Live standalone compatibility is manifest evidence, not proof of actual Android installation. Shell-update preservation and interrupted transactional restoration retain local automated evidence; an actual two-release update on a physical Android device remains unverified. No local simulation is called live Cloudflare verification.

## Hosting versus financial storage

Cloudflare serves public application assets, not your local financial database. Source inspection and local/live test network capture support the existing local-first design: IndexedDB, no mandatory registration/cloud synchronization/financial endpoint, local file-based backup encryption and restoration, and no application analytics code. Hosting may still process ordinary request metadata and platform network-error telemetry; this is not financial-data synchronization.

The stable production hostname is not a commit-specific temporary preview. It is intended to remain the same across deployments while the Pages project remains available; this is not a guarantee of perpetual hosting or storage durability. Local records normally survive reloads and compatible updates, but browser/site clearing, storage eviction or device loss can remove them. A full backup can be selected in Backup Centre and restored into an empty/reinstalled workspace; encrypted backups require their original passphrase. CSV reports are not complete recovery files.

Each device/browser profile is independent. Installing on Android does not move laptop records; transfer a portable external backup and explicitly restore it. Browser/site storage clearing, eviction, device loss and origin changes can require that backup. Hosting still processes ordinary asset-request metadata such as IP addresses.

Physical Android steps are in `ANDROID_INSTALLATION_GUIDE.md`. The broader adversarial financial accounting audit remains a separate unfinished release gate; deployment checks do not certify every financial calculation.
