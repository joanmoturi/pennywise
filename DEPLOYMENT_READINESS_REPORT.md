# Pennywise deployment readiness

**Review date: November 1, 2026.**

**Verdict:** prepared for a dedicated, root-hosted Cloudflare Pages deployment. Production build and isolated desktop/mobile-emulated workflows pass. A live Cloudflare deployment, uncached public-registry installation and physical Android installation still require verification. This report is not financial release certification; the broader adversarial accounting/scenario audit requested earlier remains unfinished.

No commit, push, live deployment, real browser profile or existing financial database was modified. All application changes are inside `pennywise`. Engineering Academy and the pre-existing root README/ignore changes were preserved.

## Application inventory

Versions below are the actual lockfile/installed versions, not inferred framework presets.

| Item                                | Finding                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| Frontend                            | React and React DOM **19.3.1**, client-rendered TypeScript       |
| Bundler                             | Vite **7.3.7**, verified from configuration and lockfile         |
| TypeScript                          | **5.9.3**                                                        |
| PWA plugin                          | `vite-plugin-pwa` **1.1.0**, generated Workbox worker            |
| App / financial schema              | **1.1.0** / **3**                                                |
| Package manager                     | npm; local version **11.20.0**                                   |
| Reproducibility                     | `package-lock.json`, lockfile format **3**                       |
| Tested Node runtime                 | **26.13.0**, pinned in Pennywise `.node-version`                 |
| npm production build                | `npm run build` = `tsc --noEmit && vite build`                   |
| Pages build command                 | `npm ci && npm run build`                                        |
| Project / output                    | Root directory `pennywise`; output field `dist`                  |
| Production artifact                 | `pennywise\dist`; only its public contents are deployed          |
| Routing                             | React state navigation; no mandatory history-based URL router    |
| Hosting fallback                    | Pages' default SPA fallback, with no top-level `404.html`        |
| Application environment variables   | None at build time or runtime                                    |
| Hosting build controls              | `NODE_VERSION=26.13.0`; `SKIP_DEPENDENCY_INSTALL=1`              |
| Mandatory external application APIs | None identified                                                  |
| Financial storage                   | Origin-local IndexedDB `pennywise-private`, object store `state` |

The production build emitted `index.html`, `manifest.webmanifest`, `sw.js`, a same-origin content-hashed Workbox helper, bundled JS/CSS, SVG/PNG icons and `_headers`. Workbox reported **12 precache entries, 520.90 KiB** in the final build. No backend, Pages Function, Worker, secret binding, authentication service or paid dependency was added.

## Findings and implemented changes

| Finding                                                            | Change / result                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relative asset URLs could break an online nested-path refresh      | Root-absolute Vite base, HTML entry/icon URLs and manifest ID/start/scope/icon paths. Online and offline nested paths now load in both browser projects.                                                   |
| Recommended security/cache headers were documentation-only         | Added `public\_headers`, copied by the real build. It supplies CSP/frame protection/privacy headers, revalidation for the entry/worker/manifest/icons, MIME overrides, and immutable hashed-asset caching. |
| Long-open sessions relied on registration-time update discovery    | Added visible-session hourly checks, foreground/reconnection checks, and explicit detection of already-waiting workers. Checks fail harmlessly offline and are cleaned up on unmount.                      |
| Workbox can classify very rapid updates differently                | Waiting-worker detection is independent of its timing heuristic. A rapid second shell deployment is detected by the hourly check and still requires explicit reload.                                       |
| Mobile Quick add lost its accessible name when its text was hidden | Added and forwarded an explicit button `aria-label`. The new mobile workflow initially exposed the defect and passes after the fix.                                                                        |
| 577 lockfile tarball URLs referenced an environment-specific feed  | Normalized them to public npm URLs, preserving package versions and integrity hashes. No registry credentials or global developer registry changes were committed.                                         |
| Build runtime was unpinned                                         | Added Pennywise-only `.node-version` for the tested Node runtime.                                                                                                                                          |
| Deploy/build/backup artifacts could be staged accidentally         | Added Pennywise-only `.gitignore` for dependencies, build/test artifacts, environment files and normal backup/CSV filenames. Arbitrarily renamed private files still require manual review.                |
| Hosting and phone setup lacked exact instructions                  | Added `DEPLOYMENT_GUIDE.md` and `PWA_INSTALLATION_GUIDE.md`, with exact Pages fields, hosted URL checks and an explicit physical-device checklist.                                                         |

No financial model, ledger calculation, account opening balance, stored record or schema was changed by this deployment work.

## PWA evidence

The generated manifest contains:

```json
{
  "name": "Pennywise Financial Command Centre",
  "short_name": "Pennywise",
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "standalone"
}
```

Its two real PNG files loaded with natural dimensions **192 x 192** and **512 x 512** in browser tests. The 512 icon declares `any maskable`; actual Android launcher appearance/cropping is not physically verified.

Workbox activation/control, precached offline loading, offline nested navigation, offline ledger creation/editing and reopening after reload were exercised. A test-only isolated static server used the built assets and supplied `_headers` to test root paths, MIME responses and browser security policies. This is **not** proof that Cloudflare's live CDN has applied those headers.

The update test serves two different in-memory precached HTML revisions without modifying production files. A waiting worker does not replace the displayed shell before acceptance; **Reload update** activates the new shell, and the entire IndexedDB snapshot remains unchanged. This proves the current shell-update path, not arbitrary future schema migrations or Android OS background behavior.

No forced reload, background financial synchronization or automatic database reset was introduced. An offline/hidden device cannot be guaranteed to discover a deployment, and a user may deliberately defer activation.

## Local-first and backup verification

Source inspection found no financial `fetch`, XHR, beacon, WebSocket, external financial endpoint or runtime environment-secret dependency. Financial inputs and receipt imports use local APIs; exports use local blobs/object URLs. Ordinary same-origin application-asset requests remain necessary for the first load and updates.

The encrypted browser recovery exercise:

1. Created hypothetical account and expense records in a disposable browser context.
2. Downloaded an encrypted full backup and confirmed the file did not contain the readable account name.
3. Added a source-only later transaction.
4. Opened a second independent browser context at the same origin and verified it started without accounts.
5. Created a distinct target account and verified wrong-password, corrupted-ciphertext and unsupported-file attempts left that target snapshot unchanged.
6. Restored the original encrypted download after explicit preview/confirmation.
7. Verified the target safety file preserved its replaced account.
8. Compared every original state field except intentionally updated `revision` and merged `audit`; records, IDs, relationships and preferences matched.
9. Verified restoring the target did not change the source device's later transaction.
10. Closed/reopened the target page and verified the portable original expense persisted.

Existing automated repository tests also passed full export/restore, attachments, older schema migration, duplicate/missing relationships, corrupted integrity, wrong passwords, transaction abort after `put`, and continued recovery after failed restoration. These tests use named fake IndexedDB databases, not the user's live database.

Network evidence observed no outbound external HTTP request in the source browser workflow and no non-GET/HEAD request to the isolated static host during entry/export/restore. This is bounded test evidence, not a claim of anonymity or immunity to a malicious hosting deployment.

Financial records are not app-encrypted at rest. Same-origin malicious JavaScript from a compromised repository/hosting account could access them; CSP is not protection against trusted-origin malicious application code. Protect the device, repository and hosting account. Unencrypted JSON contains sensitive data; use encrypted external backups.

Two devices/browser profiles are independent. Chrome and its installed PWA on the same device/origin may share storage. A hostname change, browser data clearing, eviction or device loss requires a portable backup. The app does not upload that backup or its passphrase. Download initiation is not proof that a file was saved.

## Executed validation

Final source validation ran on November 1, 2026:

| Command / exercise                                          | Actual result                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`                                              | Passed                                                                                                                   |
| `npm run test`                                              | **101 tests passed**, 5 files                                                                                            |
| `npm run build`                                             | TypeScript and production/PWA build passed                                                                               |
| `npm run test:e2e`                                          | **14 tests passed**: 7 desktop, 7 Pixel 7 Chromium-emulated                                                              |
| `npm run format:check` and explicit guide formatting checks | Passed                                                                                                                   |
| `npm audit --json` after URL normalization                  | **19 dev/build entries**, 2 low and 17 moderate                                                                          |
| `npm audit --omit=dev --json` after URL normalization       | **0 production vulnerabilities**                                                                                         |
| Fresh isolated cached install                               | `npm ci --offline --no-audit --registry=https://registry.npmjs.org/` installed **527 packages**; production build passed |
| Online public npm verification                              | Both HTTPS transport methods failed TLS; uncached upstream installation remains unverified                               |
| Physical Android / ADB                                      | No device access available; not executed                                                                                 |
| Live Cloudflare / HTTPS production URL                      | Not deployed; not executed                                                                                               |

The isolated cached install did not replace the application's existing `node_modules`. It verifies lockfile consistency and cached integrity, **not** uncached tarball availability or the Linux Cloudflare build environment.

Rollup emits existing non-fatal Zod annotation-position warnings; build success was not obtained by disabling validation. Initial new browser checks exposed the mobile accessible-name defect; interrupted runs were cleaned up and the complete final suite passed without weakening test or permission controls.

Engineering Academy's frontend/backend tests were not rerun in this deployment task because those applications were not edited. Their earlier baseline results are recorded in `IMPLEMENTATION_REPORT.md`, not presented as fresh execution here.

## Security review and remaining dependency advisories

The scoped read-only security review found no high-confidence exploitable application vulnerability:

| #   | Severity | File | Lines | Vulnerability                                                                             | Confidence |
| --- | -------- | ---- | ----- | ----------------------------------------------------------------------------------------- | ---------- |
| -   | -        | -    | -     | No high-confidence exploitable application vulnerability identified in the reviewed scope | -          |

Reviewed encryption uses PBKDF2-SHA-256 with 600,000 iterations, random 16-byte salts, AES-256-GCM and fresh 12-byte IVs. Synthetic execution verified authenticated round-trip and failure atomicity. Plain SHA-256 integrity detects corruption, not deliberate recomputation; the app documents that distinction.

The same-day audit was rerun after URL normalization and reported **0 production vulnerabilities** and **19 development/build affected package entries: 2 low, 17 moderate, no high/critical**. Versions and dependency relationships were not changed by normalization. These entries derive from **three underlying advisories**, not 19 distinct application vulnerabilities.

| Reference | Underlying package | Advisory                                                                | Patch status verified by reviewer                                                         |
| --------- | ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A         | `deepmerge`        | `GHSA-gcqx-w48m-w2h4` / `CVE-2026-93753`, prototype poisoning           | No patched version listed; feed latest 4.3.1 remains affected                             |
| B         | `minimatch`        | `GHSA-g3hv-75wg-m249` / `CVE-2026-118764`, glob-pattern DoS             | GitHub lists 11.0.1; configured feed returned 404; public release availability unverified |
| C         | `glob`             | `GHSA-3g3m-2fjr-6pw4` / `CVE-2026-118773`, traversal after cancellation | GitHub lists 14.0.2; configured feed returned 404; public release availability unverified |

All entries below are development dependencies, not identified as shipped browser imports. "Inherited" is npm's dependency/peer attribution, not a separate vulnerability in that parent.

| Package                                       | Locked vulnerable version(s) | Severity | Direct/transitive | Attribution / recommended remediation                                          |
| --------------------------------------------- | ---------------------------- | -------- | ----------------- | ------------------------------------------------------------------------------ |
| `@eslint-community/eslint-utils`              | 4.10.1                       | Moderate | Transitive        | B inherited; compatible ESLint chain update after patch availability           |
| `@eslint/config-array`                        | 0.21.2                       | Moderate | Transitive        | B; compatible ESLint chain update                                              |
| `@eslint/eslintrc`                            | 3.3.7                        | Moderate | Transitive        | B; compatible ESLint chain update                                              |
| `@rollup/plugin-node-resolve`                 | 16.0.3                       | Low      | Transitive        | A; await patched deepmerge or compatible parent removal of the chain           |
| `@trickfilm400/rollup-plugin-off-main-thread` | 3.0.0-pre1                   | Moderate | Transitive        | B via EJS/Jake/filelist; compatible PWA build chain update                     |
| `@typescript-eslint/eslint-plugin`            | 8.72.0                       | Moderate | Transitive        | B inherited; compatible typescript-eslint chain update                         |
| `@typescript-eslint/parser`                   | 8.72.0                       | Moderate | Transitive        | B inherited; compatible typescript-eslint chain update                         |
| `@typescript-eslint/type-utils`               | 8.72.0                       | Moderate | Transitive        | B inherited; compatible typescript-eslint chain update                         |
| `@typescript-eslint/typescript-estree`        | 8.72.0                       | Moderate | Transitive        | B; compatible typescript-eslint chain update                                   |
| `@typescript-eslint/utils`                    | 8.72.0                       | Moderate | Transitive        | B inherited; compatible typescript-eslint chain update                         |
| `deepmerge`                                   | 4.3.1                        | Low      | Transitive        | A underlying; no verified patched version                                      |
| `ejs`                                         | 3.1.10                       | Moderate | Transitive        | B through Jake/filelist; PWA build chain update, not an EJS RCE finding        |
| `eslint`                                      | 9.39.5                       | Moderate | Direct dev        | B; compatible release removing/updating affected minimatch                     |
| `filelist`                                    | 1.0.6                        | Moderate | Transitive        | B; compatible Jake/PWA build chain update                                      |
| `glob`                                        | 11.1.0                       | Moderate | Transitive        | C and B; verify 14.0.2 release, then compatibility-test parent update/override |
| `jake`                                        | 10.9.4                       | Moderate | Transitive        | B via filelist; compatible parent update                                       |
| `minimatch`                                   | 3.1.5, 5.1.9, 10.2.6         | Moderate | Transitive        | B underlying; verify 11.0.1 release and API compatibility before replacement   |
| `typescript-eslint`                           | 8.72.0                       | Moderate | Direct dev        | B inherited; compatible tested chain update                                    |
| `workbox-build`                               | 7.4.1                        | Moderate | Transitive        | A/B/C; compatible parent release replacing affected build chains               |

Build-tool advisories can still affect CI processing untrusted repository inputs; "not shipped to the browser" does not make them irrelevant. No path from imported financial files to these build globs/merge options was demonstrated.

No forced downgrade, major override, paid service or untested dependency remediation was introduced. Do not blindly accept npm's old ESLint/typescript-eslint graph suggestions. Recheck actual published patches, then validate audit, lint, build, offline/update and backup regressions after compatible changes.

Advisory sources inspected through GitHub's public advisory API:

```text
https://github.com/advisories/GHSA-gcqx-w48m-w2h4
https://github.com/advisories/GHSA-g3hv-75wg-m249
https://github.com/advisories/GHSA-3g3m-2fjr-6pw4
```

## Remaining gates

| Priority                       | Required evidence / action                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before installing real records | Push reviewed Pennywise files; get a successful uncached Cloudflare Production build and verify HTTPS/root/nested paths, real MIME and cache/security headers                                                   |
| Before Android acceptance      | Physically verify menu installation, launcher icon/name, standalone mode, mobile forms/navigation, closed-app/airplane-mode startup, offline writes, reconnect persistence, downloads and fresh-install restore |
| Before release certification   | Complete the independent adversarial financial accounting and A-F scenario audit; existing regression passes are not that certification                                                                         |
| Dependency maintenance         | Resolve the three underlying advisories only with available compatible packages and complete regression evidence                                                                                                |
| Every future schema upgrade    | Verify migrations and interrupted-write recovery; download an external full backup before upgrade                                                                                                               |

The requested path remains: **laptop push -> Git-connected Pages build -> stable HTTPS production URL -> Android Chrome installation**. No phone repository or development environment is required.
