# Automatic backup behaviour

Automatic backup is opt-in. The application must be open, visible when periodic
checks run, online, connected to the confirmed Drive account and unlocked.
Ordinary financial saves never depend on cloud success.

Financial revision is committed inside the existing local transaction and
survives closure even if no scheduler callback ran. On opening/foregrounding,
the controller compares current revision with the last verified revision.
Successful UI writes debounce scheduling by ten seconds; active checks run
every minute and connectivity restoration triggers another check. Fixed timers
are not the sole trigger. No worker claims to execute after the app closes.

Auxiliary IndexedDB stores queue state: pending, uploading, uploaded, verified,
failed, retry scheduled, authorization required or encryption required.
A prepared snapshot is encrypted and locally validated before its ciphertext,
owner, source revision and stable UUID enter the durable queue.

Uploads create new files. On retry the repository searches by stable backup ID
before creating another file. Uploaded bytes must match a downloaded copy,
decrypt successfully and pass full financial validation before clearing pending
state. Changes committed during upload remain dirty for a subsequent snapshot.
Web Locks serialize cloud backup work across tabs; browsers without Web Locks
fall back to manual encrypted downloads rather than unsafe concurrent automation.

Transient network/rate-limit/server failures use 30-second exponential backoff,
capped at one hour and eight attempts. Permanent configuration/quota failures
and authorization failures do not retry indefinitely. Reconnection or manual
action resets eligibility. Pending ciphertext is never cleared on failure.

Retention keeps the configured recent verified window (2..100, default 10),
one checkpoint for each older month and protected manual snapshots. Only after
a new verified upload can older eligible verified files be moved to Drive trash.
Failed pruning leaves the successful backup and older files intact.
This policy is conservative: monthly/protected files can accumulate and consume
Drive storage. Unverified/failed-upload files are not automatically deleted.
