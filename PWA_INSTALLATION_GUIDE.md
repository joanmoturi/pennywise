# Install Pennywise on Android

**You do not need GitHub, Git, Node.js, npm, a repository download or development tools on your phone.** Deploy from the laptop once; install from the stable production HTTPS URL.

Physical Android installation has not been tested during this preparation. The steps below are the device acceptance checklist, not a claim that it was completed.

## 1. Open the production site

1. On your Android phone, open Chrome in a normal browsing session, not Incognito.
2. Enter the production URL supplied by Cloudflare, for example:

   ```text
   https://YOUR-PROJECT.pages.dev
   ```

3. Confirm the address uses HTTPS and opens Pennywise, not Engineering Academy or a preview deployment.
4. Keep the phone online for the first load. Wait for **Offline ready** before testing airplane mode.

Do not enter real records at a temporary preview URL. Changing the URL's origin later does not automatically move your IndexedDB data.

## 2. Install

1. Open Chrome's three-dot menu.
2. Choose **Install app** / **Install Pennywise**. Some Chrome/device versions instead show **Add to Home screen**, followed by an **Install** option.
3. Confirm installation. Use Pennywise as the launcher name if asked.
4. Wait for installation to finish, then open the Pennywise icon from the home screen or app drawer.
5. Check the correct icon/name and verify the launch has no ordinary Chrome address bar: the manifest requests standalone display.

Pennywise also exposes an **Install Pennywise** action when Chrome supplies an installation prompt. Its absence does not itself mean the manifest is broken; use Chrome's menu.

Android installation dialogs and WebAPK support differ by device/browser. A simple website shortcut is not proof of a full standalone PWA installation. If it opens as a normal browser tab, complete the troubleshooting checks below rather than assuming standalone installation succeeded.

## 3. Verify persistence and offline use

Before entering real finances, use a temporary hypothetical account/transaction, or a separate test browser profile if available:

1. Create an account and a small hypothetical expense. Note its amount.
2. Navigate to Transactions, Budgets and Monthly Review; verify the entry remains.
3. Close the app and reopen from its icon. Verify the account and transaction.
4. Enable airplane mode; also turn Wi-Fi off so the test is genuinely offline.
5. Reopen Pennywise. Confirm **Offline / local data** and that existing records load.
6. Create a second hypothetical transaction offline. Close and reopen again; verify it persisted.
7. Reconnect. Verify both entries remain and that reconnecting does not replace them.
8. Download and restore a test backup using the steps below.

Remove hypothetical entries before using that workspace for real records. Do not combine demo balances with your real opening balances.

Offline support begins only after the initial successful load and service-worker precache. Storage eviction or clearing site data can remove both offline assets and financial records.

## 4. Backups are essential

**IndexedDB is local browser/device storage, not a cloud backup.** Clearing Chrome site data, phone loss, browser changes, storage eviction or uninstall/reinstall behavior can leave you without access to it. Uninstalling a PWA does not reliably prove its site data was deleted or retained; never rely on either behavior.

1. Open the navigation menu and choose **Backup Centre**.
2. For encryption, enter a strong passphrase of at least 12 characters and choose **Download Encrypted Backup**. Alternatively, **Download Full Backup** creates readable sensitive JSON.
3. If no automatic download appears, tap **Save prepared file**. This explicit save link expires after five minutes.
4. Use Android Files/Downloads to verify the `Pennywise-Full-Backup-...json` or `...encrypted.json` file really exists and has a nonzero size.
5. Keep an additional private copy away from this phone, using storage you choose. Pennywise itself does not upload it.
6. Keep the encryption passphrase securely and separately. It is not stored by Pennywise and cannot be recovered by resetting the app.

The backup is the whole workspace, including local receipts, history, relationships and preferences. CSV exports are reports, **not** complete restorable backups.

Back up after meaningful changes and before clearing data, switching devices/domains or accepting a major update. A reminder marked recent means export was initiated, not proof that Android saved the file.

## 5. Restore after reinstalling or on another device

1. Install/open Pennywise at the intended production HTTPS URL on the target device.
2. Open **Backup Centre**. For an encrypted backup, enter its passphrase before choosing the file.
3. Tap **Full backup file** and select the previously saved JSON in Android's file picker.
4. Review the backup date, app version, integrity result and record counts.
5. Choose **Restore Entire Database**, then explicitly confirm replacement.
6. The app prepares a safety download of the target's current data and stores a transactional local safety snapshot. Verify/save the safety file too, especially if restoring over real records.
7. Check restored accounts, transactions, budgets, recurring/prepaid records and preferences. Close and reopen to confirm persistence.

Wrong passwords, corrupted files, unsupported formats or interrupted validated writes must not replace the existing database. If you see an error, keep the original file and existing data; do not reset the app to retry.

Encrypted backups are portable and do not depend on the original phone, browser database or an account login. Restoring replaces the target workspace; it does not merge two devices' new financial entries or provide automatic synchronization.

## 6. Accept updates safely

When online, bring the app to the foreground. It checks for updated assets on reconnection/foregrounding and hourly while visibly open.

If **A new version is ready** appears, download a full backup, save open forms, then tap **Reload update**. Existing IndexedDB records were preserved in automated shell-update tests. Future migration compatibility must still be tested for each schema-changing release.

Updates cannot be discovered offline, and refusing the update keeps the current cached version. This is not a promise of unattended Android background updating.

## 7. Troubleshooting and physical-device sign-off

| Symptom                                | Action                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No installation option                 | Verify Chrome, normal mode, HTTPS, production root and a completed load; wait briefly and check the menu again.                                          |
| Ordinary tab instead of standalone app | Check whether only a shortcut was added; inspect manifest/service-worker errors from laptop Chrome, then retry proper installation.                      |
| Offline blank screen                   | Reconnect and complete the initial cache registration. Check storage permissions/free space. Do not clear existing site data without an external backup. |
| Backup not visible in Downloads        | Use **Save prepared file**, verify Android's download completion and locate the file in Files.                                                           |
| Wrong password                         | Use the original exact passphrase. No password recovery or bypass exists.                                                                                |
| Missing data at another hostname       | Restore an external backup; databases do not follow hostname changes.                                                                                    |

Record physical verification of: menu installation, launcher icon/name, standalone launch, first online load, mobile forms/navigation, close/reopen persistence, airplane-mode startup/entry, reconnection, backup download/file existence, fresh-install restore, and a later update retaining records. These remain unverified until performed on an actual phone.

Google's installation guidance, checked November 1, 2026: `https://web.dev/learn/pwa/installation/`.
