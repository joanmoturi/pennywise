# Pennywise Android installation

**Physical Android verification: UNVERIFIED.**

**Live production URL: not available yet.** Cloudflare Git integration requires account authorization before a deployment can be created. Use only the actual verified URL recorded in `DEPLOYMENT_REPORT.md`; no hostname is assumed.

Your phone needs Chrome, not GitHub source code, Git, Node.js, npm or laptop development tools.

## Install and check the app

1. Open the actual production HTTPS URL from `DEPLOYMENT_REPORT.md` in normal Android Chrome, not Incognito or an embedded messaging-app browser.
2. Stay online for the initial successful load and wait for **Offline ready**.
3. In Chrome's three-dot menu, select **Install app**, **Install Pennywise**, or **Add to Home screen > Install**, depending on Chrome/device wording.
4. Confirm installation. Find the Pennywise icon on the home screen or app drawer.
5. Open that icon. Verify the name/icon and standalone launch without the ordinary Chrome address bar. A plain shortcut opening a browser tab is not proof of standalone installation.
6. Test the navigation drawer, Transactions, Budgets, Recurring Expenses, Monthly Review and Backup Centre. Use clearly hypothetical entries before real records.
7. Close and reopen the app; verify your test entries remain.
8. Turn on airplane mode and disable Wi-Fi. Reopen the installed app, navigate and create a hypothetical offline transaction. Close/reopen again and verify persistence.
9. Reconnect and confirm that the offline entry remains. No cloud synchronization should replace it.
10. Complete the controlled backup/restore check below before relying on the app for real records.

Installation, home-screen appearance, standalone launch, actual phone offline restart, the Android file picker and Downloads behavior remain **UNVERIFIED** until checked on your physical device.

## Download and restore a controlled backup

1. In Backup Centre, enter a strong 12+ character passphrase and choose **Download Encrypted Backup**. **Download Full Backup** instead produces sensitive readable JSON.
2. If the automatic download is blocked, tap **Save prepared file** within five minutes.
3. Open Android Files/Downloads and verify the portable file exists, has a nonzero size, and is copied securely away from this phone. Keep the passphrase separately; Pennywise does not store or recover it.
4. Prefer restoring into a separate test browser/device with no real records. If using the same test workspace, export its current safety copy first.
5. Open Backup Centre on the target, enter the passphrase before selecting the backup file, inspect its date/counts/integrity, then choose **Restore Entire Database** and explicitly confirm.
6. Verify/save the target's safety download. Check restored entries and preferences, close/reopen, and confirm persistence.
7. In the test workspace only, verify a wrong password or corrupted copy is rejected without replacing existing data. Do not edit the original good backup.

CSV exports are reports, not complete recovery files. Uninstalling/reinstalling or clearing site data may remove local data; never do either without a verified external full backup.

## Move laptop records to the phone

Installing the app **does not transfer laptop records**. Each device/browser profile has its own IndexedDB workspace. Download a full backup on the laptop, privately move the file to the phone, and explicitly restore it there. Chrome and its PWA on the same phone/origin may share site storage.

There is no mandatory registration, automatic sync or hosting-provider backup. Choose one authoritative workspace if updating records on multiple devices: restoration replaces the target state rather than merging independent new transactions.

## Receive future updates

Continue development and validation on the laptop and push reviewed Pennywise changes to the private repository's `main` branch. Once authorized, Git-connected Cloudflare Pages rebuilds the production site.

When online and visible, Pennywise checks for a waiting worker on registration, foregrounding, reconnection and hourly while open. On **A new version is ready**, download a full backup, save open forms, then tap **Reload update**. Do not clear site storage to update.

Offline devices cannot discover new deployments. A user may defer activation; unattended Android background updating is not guaranteed. Current automated shell-update tests preserve IndexedDB; future schema-changing releases still need migration tests.

For detailed backup format, recovery and phone troubleshooting, also read `PWA_INSTALLATION_GUIDE.md`.
