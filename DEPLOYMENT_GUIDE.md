# Pennywise: Cloudflare Pages deployment

Use a **separate Cloudflare Pages project** for Pennywise. Development stays on your laptop; your Android phone needs only Chrome and the resulting HTTPS URL. Engineering Academy is not deployed or changed by this configuration.

## 1. Publish the application from your laptop

Pennywise uses the existing **PRIVATE** repository `joanmoturi/MyLearningApp`, production branch `main`. Do not create a replacement repository, change its visibility or include unrelated Engineering Academy changes. Current publishing status, verified commit and hosting blockers are recorded in `DEPLOYMENT_REPORT.md`.

```powershell
Set-Location C:\Users\joanmoturi\engineering-academy\pennywise
npm ci
npm run build
npm run test
npm run test:e2e
```

Review your Git changes, commit only the intended Pennywise files, and push them to `main` using your usual Git workflow. Do not commit downloads, financial backups, receipts, passwords or `.env` files. `pennywise\.gitignore` excludes build output, dependencies, test artifacts and the application's normal backup/CSV filenames.

Commit `package-lock.json`, `.node-version`, source, public assets, configuration, tests and these guides. Do **not** commit `dist` or `node_modules`.

The lockfile now uses public npm tarball URLs instead of the development environment's package feed. Package versions and integrity hashes are unchanged. An isolated install from the local npm cache passed; an uncached public-registry install could not be verified here because outbound registry TLS connections failed. The first Cloudflare build must verify that network installation succeeds. Do not add private feed credentials or disable certificate/integrity checks.

## 2. Enter these exact Cloudflare settings

In the Cloudflare dashboard, choose **Workers & Pages > Create application > Pages > Connect to Git**. Connect GitHub and authorize access to the selected repository. Choose **Pages**, not a Workers project requiring a deploy command.

| Setting                                   | Value to enter                                    |
| ----------------------------------------- | ------------------------------------------------- |
| Git provider                              | GitHub                                            |
| Repository                                | `joanmoturi/MyLearningApp`                        |
| Project name                              | `pennywise-joanmoturi`, or another available name |
| Production branch                         | `main`                                            |
| Framework preset                          | `None`                                            |
| Root directory / advanced path            | `pennywise`                                       |
| Build command                             | `npm ci && npm run build`                         |
| Build output directory                    | `dist`                                            |
| Build environment variable                | `NODE_VERSION` = `26.13.0`                        |
| Build environment variable                | `SKIP_DEPENDENCY_INSTALL` = `1`                   |
| Application/runtime environment variables | None                                              |
| Functions, databases, bindings, secrets   | None                                              |

Apply the two build variables to both Production and Preview environments. `SKIP_DEPENDENCY_INSTALL=1` prevents a separate automatic install; the explicit `npm ci` then installs the committed lockfile. `.node-version` also records the tested Node version.

**Important:** with root directory `pennywise`, the output field is **`dist`**, not `pennywise/dist`, `.next`, `out`, `public` or the repository root. The npm build script is exactly `tsc --noEmit && vite build`. Select `None` to avoid framework presets silently substituting another build command.

Use the free `pages.dev` hostname; a purchased domain is unnecessary. Do not enable Web Analytics, add analytics snippets, or configure cloud financial storage. The build uses development dependencies as well as runtime dependencies: do not set npm to omit dev dependencies.

Select **Save and Deploy**. A successful deployment supplies the actual production HTTPS URL. If you chose the suggested available name, its form is:

```text
https://pennywise-joanmoturi.pages.dev
```

Use the actual URL shown by Cloudflare, not an assumed hostname. Do not install a commit-specific or preview URL for your real financial records.

## 3. Static serving configuration already included

- Vite builds root-absolute script, stylesheet and manifest paths. The manifest ID, start URL and scope are `/`.
- `public\_headers` is copied to `dist\_headers`. Pages interprets it as configuration, not as a public download.
- HTML entry points, `sw.js`, the manifest and icons revalidate rather than receiving permanent browser cache lifetimes.
- Content-hashed files under `/assets/` receive immutable caching. Security headers include CSP, `frame-ancestors 'none'`, `nosniff`, `DENY`, no-referrer and disabled camera/microphone/geolocation.
- Manifest and service-worker MIME types are explicitly set. Other asset types are determined from their file extensions.
- No `_redirects`, `404.html`, Pages Function, Worker or Wrangler configuration is needed. Cloudflare Pages' documented SPA default serves the root document for non-asset paths when there is no top-level `404.html`. Do not add such a file without revisiting routing.
- Navigation currently selects views in React state, not a URL router. Refreshing `/monthly/review/` loads the application, but does not select the Monthly Review screen automatically. Use the navigation menu.
- Workbox supplies the corresponding offline navigation fallback after successful precaching.

Deploy this build at its **own origin root**. Do not put it inside Engineering Academy's path or overwrite that application's hosting project. Subdirectory deployment would require deliberately revising Vite base, manifest scope and asset URLs.

## 4. Verify the real production URL

First check that Cloudflare reports a successful **Production** deployment for the intended `main` commit, not merely a preview.

On the laptop, substitute the actual production URL:

```powershell
$site = 'https://YOUR-PROJECT.pages.dev'
curl.exe --fail --head "$site/"
curl.exe --fail --head "$site/index.html"
curl.exe --fail --head "$site/manifest.webmanifest"
curl.exe --fail --head "$site/sw.js"
curl.exe --fail --head "$site/icon-192.png"
curl.exe --fail --head "$site/icon-512.png"
curl.exe --fail --head "$site/monthly/review/"

$html = (Invoke-WebRequest -Uri "$site/").Content
$asset = [regex]::Match($html, 'src="(/assets/[^"]+\.js)"').Groups[1].Value
if (-not $asset) { throw 'No root-absolute production module found' }
curl.exe --fail --head "$site$asset"
```

Expect successful HTTPS responses, not HTML returned in place of the worker or JavaScript asset. The root/index and worker should have `Cache-Control: no-cache`; the manifest should have `application/manifest+json`; the worker should have `application/javascript`; PNGs should have `image/png`; hashed assets should include `immutable`. Check CSP, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` too. `/index.html` may redirect to `/` according to Pages' normal URL canonicalization.

Then use laptop Chrome:

1. Open the production root and `/monthly/review/`; refresh both. The shell must load without missing JS/CSS, MIME errors or CSP failures.
2. In DevTools **Application > Manifest**, verify the full name, short name Pennywise, `/` start/scope, standalone mode and loaded 192/512 PNG icons.
3. In **Application > Service Workers**, verify an activated worker whose scope is the production root. Wait for **Offline ready**.
4. Create a clearly hypothetical account and transaction in an isolated test browser profile. Reload and verify persistence. Do not load demo data into a personal database.
5. With DevTools Network set to Offline, reload the root and a nested path, navigate, and add a hypothetical transaction. Reconnect and reopen; confirm the entry remains.
6. Download an encrypted full backup, verify the file exists, and restore it into a second isolated browser profile. The second profile must start independently empty.
7. In Network, inspect requests during entry and backup/restore. Pennywise should retrieve same-origin application assets, with no financial-record upload or analytics request.
8. Complete the physical Android checklist in `ANDROID_INSTALLATION_GUIDE.md`. The existing `PWA_INSTALLATION_GUIDE.md` retains the extended backup instructions.

The local preview server does **not** implement Cloudflare `_headers`; local static-host simulation passed, but real response headers still require these hosted checks.

## 5. Continuing development and updates

Continue editing and testing on the laptop. Push tested changes to `main`; Git-connected Pages rebuilds the same project automatically. Use preview deployments only with hypothetical records.

While online and visible, Pennywise checks for a new worker on registration, return to the foreground, reconnection, and hourly while open. A waiting version displays **A new version is ready**; it does not silently reload an open form. Download a full backup, finish/save forms, then choose **Reload update**. Closing all old app windows may also allow a waiting worker to activate normally.

Do not apply custom CDN rules that permanently cache HTML, the manifest or `sw.js`. A device that is offline cannot discover an update. A user who declines reload can deliberately remain on the old version; no forced or guaranteed background update is claimed.

The tested update replaced a precached application-shell revision and preserved IndexedDB exactly. Future schema-changing releases still need migration tests and an external backup.

## 6. Local data, recovery and troubleshooting

The hosting project serves public application assets only. There is no application login, synchronization service or financial-data backend. Cloudflare still processes ordinary website request metadata such as IP addresses; this is not anonymous browsing.

Your laptop, another phone and another browser profile have independent local databases, even at the same URL. Chrome and its installed PWA on the **same device/origin** can share storage. A different domain, preview hostname or browser profile is a different workspace. Choose a stable production hostname before starting real records, and use portable backups when changing origin/device.

| Problem                               | Check                                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare builds Engineering Academy | Root directory must be `pennywise`; output must be `dist`.                                                                             |
| Missing compiler/Vite                 | Do not omit dev dependencies; check the explicit `npm ci` step.                                                                        |
| npm TLS, 404 or integrity failure     | Fix registry/network access and verify available package versions. Do not disable TLS, ignore integrity or inject private credentials. |
| Worker/manifest returns HTML          | Check generated output and MIME headers; do not rewrite existing assets to the SPA entry.                                              |
| CSP errors from analytics             | Disable hosting-injected analytics; do not relax script or connection policies.                                                        |
| Old version remains                   | Reconnect, foreground the app, check `sw.js` cache headers, save forms and accept the update.                                          |
| Empty records on another URL/device   | Expected origin/device isolation; restore a full JSON backup.                                                                          |
| Storage clearing needed               | First verify an external full backup. Never clear site data as the first troubleshooting step.                                         |

## Authoritative references

Checked November 1, 2026:

- Cloudflare Git setup and monorepo root: `https://developers.cloudflare.com/pages/get-started/git-integration/`
- Build runtime and install controls: `https://developers.cloudflare.com/pages/configuration/build-image/`
- SPA defaults: `https://developers.cloudflare.com/pages/configuration/serving-pages/`
- Header behavior: `https://developers.cloudflare.com/pages/configuration/headers/`
- Prompted-worker update checks: `https://vite-pwa-org.netlify.app/guide/periodic-sw-updates`
