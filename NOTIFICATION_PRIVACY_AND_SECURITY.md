# Legacy notification privacy guide

The companion no longer reads Android notifications or requests notification-listener access. Current permissions, sender filtering, storage protections, local handoff and limitations are documented in `SMS_PRIVACY_AND_SECURITY.md`.

The historical `pennywise-notification-batch`, receipt names, Inbox schema and `/notification-handoff` worker route remain for compatibility, not as a second active acquisition system. Original listener documentation is retained in Git history at `4735052`.

Existing PWA records, backups and previously queued candidates remain sensitive. Do not clear site/app data or uninstall without verified external backups. Sharesheet still requires complete offline operation; file selection remains the portable local alternative.
