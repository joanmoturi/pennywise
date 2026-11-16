# Cross-device sync: owner setup and customer use

**Live on November 16, 2026** at `https://pennywise-7lz.pages.dev/` after the
owner's explicit deployment request. Implementation from
`feature/encrypted-cross-device-sync` is on `main`, including daily dashboard
and backup-health changes. The Firebase project, Google provider and published
owner-only rules are verified. The Standard database is in `eur3`, its free-tier
flag is true, and billing is disabled. Public Web settings are configured in
Pages Preview and Production, preserving existing Drive configuration.

Hosted desktop/mobile-emulated checks covered the actual Google popup, offline
local records and portable backup recovery without entering account credentials.
The owner requested release before performing real two-device acceptance;
completed consent, physical-device delivery and real Drive recovery remain
unconfirmed. Deployment does not enable sync or upload records automatically.

## One-time application-owner setup

Customers must not create Firebase projects, paste API keys or configure OAuth
clients. These steps belong to the Pennywise application owner:

1. In Firebase Console, create/select a dedicated **Spark, no-billing** project.
   Do not attach a billing account, enable Blaze, Functions or Cloud Storage.
   Register a Web app and retain its public Web config. Do not use a service
   account, private key, Google client secret or Admin SDK in this frontend.
2. Enable Authentication > Google provider, completing the required public app
   support details. Configure authorized domains for the exact production
   domain `pennywise-7lz.pages.dev` and each deliberately approved preview/local
   domain. Do not authorize every arbitrary Pages preview domain.
3. Create a **Cloud Firestore Standard edition** database in production/deny
   mode, selecting the intended region after reviewing data-location needs.
   Never start with public/test-mode access. Use one database for the free tier.
4. Review and publish the checked-in `firestore.rules` to that exact project.
   The console Rules editor avoids local cloud credentials. Alternatively, an
   authenticated owner can run the command below **only after verifying the
   project ID**. This command is documentation, not something run by this work:

   ```powershell
   npx firebase deploy --only firestore:rules --project YOUR_REAL_PROJECT_ID
   ```

5. Add these three **public Web config** build values to an isolated Cloudflare
   Pages preview environment first. Keep the existing Drive client ID unchanged:

   ```text
   VITE_FIREBASE_API_KEY=<Web app apiKey>
   VITE_FIREBASE_PROJECT_ID=<projectId>
   VITE_FIREBASE_APP_ID=<Web app appId>
   ```

   The application derives `authDomain` as `<projectId>.firebaseapp.com`; custom
   Firebase auth domains are not implemented. Firebase public API config is not
   an access-control mechanism; the deployed rules are mandatory. Apply
   provider-recommended API-key restrictions compatible with Auth/Firestore and
   validate them on the preview before release. Never commit a real `.env`.

6. Build a preview. HTML and Pages `_headers` both include the exact Firebase
   auth origin plus the three required Google service origins. Verify no
   `__PENNYWISE_SYNC_AUTH_ORIGIN__` placeholder remains. Existing Google Drive
   CSP and popup headers remain intact. Test the actual Google popup on desktop
   and Android Chrome; the automated browser fixture does not test the real
   Google popup, OAuth consent or hosted Firebase helper CSP.
7. Download existing local and Drive backups, then test with **synthetic data in
   two separate devices/profiles**. Confirm owner-only access, first linking,
   bidirectional changes, offline conflict, reload/unlock, quota/error behavior,
   safety-file restore and existing Drive recovery. Only after explicit release
   approval copy the configuration to Production and merge/deploy. Do not
   migrate customer records or enable sync silently.

The exact stable preview and canonical production hosts are now authorized in
Firebase Auth. Continue on the existing branch preview:
`https://feature-encrypted-cross-devi.pennywise-7lz.pages.dev`.
Use the separately chosen **test Google account**, not the eventual real-data
account, with synthetic records. Preview and production hostnames do not isolate
Firestore workspaces if the Firebase project and Google UID are the same.
Production was released on explicit owner request before real acceptance;
continue that acceptance with synthetic records, not an existing live workspace.
An existing Drive OAuth client is not a substitute for
Firebase setup; its own authorized JavaScript origins may also need the exact
preview origin for a real Drive test. Never remove its production origin.

## Customer flow after owner configuration

On the existing device, open Backup Centre > Cross-device sync > **Connect
Google for Sync**. Choose the intended Google account. Enter a separate sync
passphrase (12+ characters) twice and save it outside the app. Download the
encrypted safety copy, acknowledge the replacement rules, then select **Start
Sync With This Device**. Connection and unlocking alone do not publish records.

On another device, open the same deployed Pennywise origin, connect the **same
Google account**, and unlock with the **same sync passphrase**. Export both
versions, then select **Use Cloud Workspace on This Device**. Any existing
local data is replaced only after that explicit choice and a guarded local
safety snapshot. Export first even if the second device appears empty.

One-sided saved changes then synchronize automatically while devices are open,
online and unlocked. There is no reliable closed-app/background synchronization
claim. Reload requires sign-in/unlock again. Use **Sync Now** to retry a displayed
provider error. Opening a form delays incoming replacement in that tab. Use one
editing tab per device, and a separate browser profile for each person/account.

If both devices edited offline, sync stops at **conflict**. Select **Review Sync
Versions**, export both safety copies, and deliberately choose the full version
to keep. This is replacement, not a transaction-level merge; preserve the other
export to manually re-enter any wanted changes. No new income/coupon/transfer
is generated just by connecting or reading the cloud workspace.

**Lock Sync** clears the in-memory passphrase. **Pause and Disconnect Sync**
also disconnects Firebase and disables automatic sync, retaining local data and
account binding. Neither deletes cloud data nor locks local IndexedDB. A lost
passphrase cannot be reset with Gmail. Keep independently tested backups.

## Reproducible local checks

Use the repository's Node tooling; Firebase CLI's emulator requires Java 21+.
No real project or Google account is required for these checks:

```powershell
npm ci
npm test
npm run test:sync-rules
npm run lint
npm run format:check
```

`test:sync-rules` starts only the official local Firestore emulator on
`127.0.0.1:8088`, with demo project `demo-pennywise`, runs the actual adapter/rules
tests, then stops it. Ensure that port is free; do not stop unrelated processes.
Java 17 is insufficient for the installed Firebase CLI.

Configured synthetic browser suite:

```powershell
$env:VITE_FIREBASE_API_KEY = 'synthetic'
$env:VITE_FIREBASE_PROJECT_ID = 'demo-pennywise'
$env:VITE_FIREBASE_APP_ID = 'synthetic'
npm run test:e2e
```

Disabled-service fallback suite:

```powershell
$env:VITE_GOOGLE_CLIENT_ID = ''
$env:VITE_FIREBASE_API_KEY = ''
$env:VITE_FIREBASE_PROJECT_ID = ''
$env:VITE_FIREBASE_APP_ID = ''
npx playwright test enhancements.spec.ts workspace-sync.spec.ts
```

Playwright builds a disposable synthetic-configured preview. Restore the desired
real public Google client ID and real approved Firebase config (or empty sync
values) before preparing an actual release build. Do not deploy synthetic config.

See [architecture and limits](CROSS_DEVICE_SYNC_ARCHITECTURE.md) and
[test evidence / release gates](CROSS_DEVICE_SYNC_TEST_REPORT.md).
