# Google Drive setup (manual external prerequisite)

No OAuth client or credentials have been fabricated. On November 11, 2026 the
owner created the shared Google project/Web client and confirmed saving its
public client ID in the Pages Production `VITE_GOOGLE_CLIENT_ID` variable.
The configured rebuild is separate from the earlier configuration-disabled
publication. Ordinary local features need no environment values.

## One-time application setup, not per-user configuration

The following Console steps belong to the Pennywise application owner. Create
the application project/client and consent configuration once per deployment
environment, not once per end user. All users of that deployment use its public
OAuth client ID. Enable Drive API in that project and put the public client ID
in Cloudflare Pages' Production build variable `VITE_GOOGLE_CLIENT_ID`.
Rebuild after changing it. It is not a user's Drive identifier or secret.
Authorize `https://pennywise-7lz.pages.dev` as the production JavaScript origin.

An ordinary user should only choose their Google account, grant the requested
backup permission, set up encryption/recovery and enable automatic backup.
They must not create a Cloud project, enable APIs, paste credentials or supply
an OAuth client ID. User accounts and Drive storage remain their own; access
tokens/consent are necessarily per-user and cannot safely be shared.

## Application owner Console steps

1. In Google Cloud Console, create/select a project you control. Enable
   **Google Drive API** in APIs & Services > Library.
2. Open **Google Auth Platform**. Configure Branding with your application name,
   support email, developer contact and authorized production domain. Configure
   Audience for the intended internal or external users. In testing mode add
   the Google accounts that will test the application.
3. Configure Data Access for `openid`, `email` and
   `https://www.googleapis.com/auth/drive.file`. Do NOT request full Drive access.
   The application only manages files created by its OAuth client; it cannot
   enumerate arbitrary unrelated Drive files.
4. Create an OAuth client of type **Web application**. Add the exact local
   JavaScript origin `http://127.0.0.1:5173`. Add `http://localhost:5173` only if
   you also use that origin. Add the approved HTTPS production origin
   `https://pennywise-7lz.pages.dev`. Origins have no path/trailing slash.
   The GIS popup token model does not need a custom redirect-handler backend.
5. Copy `.env.example` to `.env.local` locally. Set
   `VITE_GOOGLE_CLIENT_ID` to your public web client ID. Never add a client
   secret, service account, refresh token or password. `.env.local` is ignored.
6. Restart `npm run dev` locally. For production, set the shared public client
   ID in Pages and rebuild. Vite substitutes public VITE configuration at build
   time. Publishing the application does not configure this owner-controlled
   Google project; see DEPLOYMENT_REPORT.md for publication evidence.
7. Open Backup Centre and choose **Enable Google Drive Backup**. Select your
   Google account and grant permission. Separate application sign-in is
   optional, not required. The local workspace is bound to the selected Drive
   subject to prevent accidentally sending snapshots to another account.
   The enabled setting persists on this device across reloads and restarts.
8. Set and confirm an encryption passphrase. Optionally generate/download a
   recovery key and keep it outside this device. Choose **Unlock and Back Up**.
   Verify the visible **Pennywise Backups** folder and encrypted JSON in Drive.
   If Google authorization expires, reconnect that same account; the saved
   enabled preference is retained. Encryption still needs unlocking after a
   restart; secrets and access tokens are not persistently stored.
9. On an independent device/browser profile using the same OAuth application,
   connect that account, inspect history, unlock and review a backup, then
   explicitly replace only after keeping its safety file.

Production CSP must include the narrow GIS script/style/frame/connect origins
and Google's API host in both `index.html` and response headers. These local
changes are included; do not broaden them to arbitrary HTTPS. Popup deployments
use `Cross-Origin-Opener-Policy: same-origin-allow-popups`.

The OAuth consent status, organizational restrictions, branding/domain
verification and any Google verification requirements must be resolved by the
project owner before release. Console navigation can change: consult the
official references below.

## Official provider references

- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/drive/api/guides/api-specific-auth
- https://developers.google.com/drive/api/guides/manage-uploads
- https://developers.google.com/drive/api/guides/search-files
- https://developers.google.com/identity/gsi/web/guides/client-library

Actual Google consent/upload and two-physical-device acceptance were not
demonstrated by the earlier automated tests. The owner has now supplied the
shared configuration; the configured release still needs real consent/upload
and device acceptance. Configuration alone is not evidence of those operations.

## WhatsApp-style automatic backup: platform work still required

The current browser token model obtains short-lived tokens using user-triggered
authorization. The PWA also keeps its unlocked encryption secret in tab memory.
Installing the PWA does not turn it into a native unattended backup service.
Current automation is foreground/active-app backup, not guaranteed closed-app
or nightly execution.

For Android background backup without a financial backend, a native application
needs OS-scheduled WorkManager jobs, supported Google account authorization,
durable encrypted pending snapshots, network/battery constraints and protected
device-side key wrapping using Android Keystore. Background key-use policy must
be chosen explicitly; a key that always requires an interactive unlock cannot
also promise fully unattended backup. Preserve a separate portable recovery
route, because a device-bound key alone cannot restore a lost phone.

The native backup worker also needs a safe way to obtain an up-to-date consistent
financial snapshot. The existing SMS companion does not own the browser's
financial database. Simply adding a timer, wrapping the website, or adding a
worker to that companion cannot read Chrome's private IndexedDB. A native-owned
host/storage integration or explicit encrypted snapshot handoff with freshness
reporting must be designed and migration-tested before claiming parity.

A token-refresh backend alone does not solve this: it cannot read newer records
from a closed browser's local database. No native migration, additional backend,
credential storage or WhatsApp-style closed-app guarantee was added by this
publication request.

Official platform references:

- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developer.android.com/develop/background-work/background-tasks/persistent
- https://developer.android.com/privacy-and-security/keystore
