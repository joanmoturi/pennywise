# Local readiness and external acceptance

## Publication decision - 2026-11-11

The user subsequently authorized GitHub push and deployment of the tested
enhancements. Publication does not waive the Google acceptance limitations
below: connection remains configuration-disabled unless an application-owned
OAuth client ID is supplied at build time. Do not advertise WhatsApp-style
closed-app backups. See DEPLOYMENT_REPORT.md for actual publication evidence
and GOOGLE_DRIVE_SETUP.md for shared application setup versus user consent.

## Initial local implementation status

The original app had local encrypted/manual backup foundations, not cloud backup.
The local optional Google-only integration is implemented for inspection.
No push, deployment, account provisioning or live OAuth grant was performed.

## Implemented

Separate Google identity/Drive authorization, visible application-owned folder,
encrypted versioned snapshots, optional recovery wrapper/key rewrapping,
read-back verification, protected/history retention, durable encrypted queue,
active-app retry/scheduling, status UI and explicit safe replacement restore.
Existing local/manual functionality remains independent.

## Deliberate limits

No email/password/Firebase flow; no automatic merge; no financial cloud database;
no unattended execution after closure; no long-term access/refresh token storage;
no server-enforced local access control; no financial workspace isolation by
signed-in account. Web Locks required for safe cloud scheduling.

## External blockers / not yet verified

The owner must configure the real Google web client/consent screen, enable
Drive API and add authorized origins/test users. Actual Google sign-in/consent,
Drive upload/discovery/download/revocation/quota handling and migration across
two physical devices have NOT been demonstrated. Tests use synthetic provider
fixtures and independent local repositories/browser contexts. Do not equate
those with live Google or physical-device acceptance.

Before any release, complete GOOGLE_DRIVE_SETUP.md and verify all twenty
acceptance requirements from the request with disposable synthetic data.
Keep an independent manual encrypted backup throughout.
Consult CLOUD_BACKUP_TEST_REPORT.md for actual command outcomes.
