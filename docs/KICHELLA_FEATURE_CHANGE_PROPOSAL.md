# Kichella feature change record

November 5, 2026. The user authorized promotion of the existing stabilization
work to main and the existing deployment after preserving the original source.

## Included, without removing financial capabilities

- Rename the visible shell and install manifest to Kichella.
- Keep the navy/gold palette, stored theme preference and existing icon assets.
- Group the existing navigation and expose Accounts directly.
- Add overview shortcuts for expense, income and budget entry.
- Show essential form fields first; retain optional/linked fields and reveal
  required transfer/custom-schedule details automatically.
- Paginate transaction display at fifty rows; retain complete filtering,
  exports and underlying history.
- Improve save status, error recovery, safe retry and storage diagnostics.
- Change physical persistence layout only, with atomic migration and unchanged
  financial schema/backup format.

## Preserved

All existing financial modules, integer-money calculations, liability and loan
treatment, own-account transfers, bonds/coupons, scheduling, prepayments,
savings capture, reports, scenarios, backup/restore, Inbox, approval rules and
idempotency remain. Native Android acquisition is untouched.

## Not included or claimed

No backend, cloud database, telemetry, bank connection, new SMS capability,
automatic device sync, financial-schema replacement, dependency upgrade or
mobile security bypass. No guarantee that the largest datasets never block
the main thread. Existing icon/package/backup names are intentionally not all
renamed; they preserve compatibility.

Deferred changes need separate evidence and scope: worker-based full-state
validation/calculation, receipt-heavy maximum-size stress testing, broader
accessibility remediation and verified real-user/physical-phone testing.
