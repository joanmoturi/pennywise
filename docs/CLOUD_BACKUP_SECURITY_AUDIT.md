# Cloud backup implementation boundaries

This is an implementation checklist, not an independent penetration-test claim.

- No client secret, refresh token, service-account key or password database.
- Google identity signatures/issuer/audience/expiry/nonce are validated.
- Identity ID tokens are sessionStorage-only; Drive access tokens are memory-only.
- Drive uses drive.file plus identity scopes, not full Drive access.
- The chosen Drive subject is bound to the workspace; a different account blocks
  uploads. Sign-in identity is deliberately not substituted for Drive identity.
- Cloud upload uses encrypted snapshots only; filenames/Drive appProperties
  contain application/random backup IDs and flags, never account names or amounts.
- Envelope metadata exposes only nonfinancial UUID/version/revision/time data.
- AES-GCM authenticates metadata and encrypted payload; wrong keys/tampering fail.
- Pending payloads are encrypted; passphrases and recovery secrets are not persisted.
- HTTP errors are classified without showing raw provider response bodies.
- Download size, format, cryptography and financial relationships are checked.
- No local record deletion occurs on sign-out, disconnect or cloud-file deletion.
- Restore is explicitly confirmed, revision-guarded, validated and atomic.
- Retention only follows read-back verification; failure preserves older copies.
- OAuth/Drive responses are not service-worker cached and no financial analytics
  or third-party logging was added. The existing financial audit is local only.

Local browser-profile access and XSS remain relevant threats. Encryption cannot
protect records while the application is open on an already compromised device.
Sign-in is not a local access lock or multi-user tenant boundary. The optional
GIS library is loaded only for configured identity UI. CSP allows only the
necessary Google identity/API hosts in addition to the application origin.

Caller disconnection during an operation cannot make local commits depend on
Drive. Uploaded but unverified files can remain after interruption and are
rediscovered by ID. User-deleted files, quota errors and revoked tokens report
failures without discarding pending changes.

Provider consent, live revocation, project/account deletion and two-device
privacy acceptance require manual verification with the owner's OAuth project.
