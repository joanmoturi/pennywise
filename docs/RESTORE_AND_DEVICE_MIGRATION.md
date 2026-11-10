# Restore and device migration

1. On a new browser/device, open the app and connect the same configured OAuth
   application's Google Drive account. It is not necessary to enter local
   financial records first. History is discovered after connection.
2. Inspect date, size and verification status. Upload verification is not a
   substitute for decrypting and validating the selected version.
3. Supply its passphrase, or explicitly select its recovery-key route. Unlock
   validates envelope bounds, cryptographic integrity, backup checksum, schema,
   IDs and every financial relationship before offering a preview.
4. Review account/transaction/bond counts, source device, version and revision.
   This only stages a preview; it does not write financial records.
5. Confirm replacement explicitly. A safety file is downloaded and the existing
   Repository transaction retains the full pre-destructive state locally.
   Verify the downloaded file exists before relying on it.
6. The preview's local revision must still match, checked before and inside the
   replacement transaction. Concurrent changes reject a stale restore.
7. Validated replacement is atomic. Transaction failure leaves the prior
   database intact. A subsequent read compares all restored collections and
   settings, allowing only the intentional local revision/audit additions.
   A mismatch is reported rather than silently claiming completion.

Empty devices use the same explicit replacement workflow. Existing devices can
cancel or replace after a safety snapshot. Merge is intentionally unsupported:
there is no naive object merge, ID regeneration or guessed duplicate handling.
Use separate browser profiles for independent workspaces.

Full State includes every user-owned collection and receipt. Stable IDs,
principal/coupon history, transfers, recurring occurrences and audit entries are
preserved. Existing manual legacy/current JSON and encrypted imports remain.
Accounts/authentication do not partition or erase a browser's local workspace.

Cross-device tests use separate IndexedDB repositories/browser contexts, not two
physical devices. Actual Google discovery and physical migration remain external
acceptance tasks until configured. No claim of live conflict resolution is made.
