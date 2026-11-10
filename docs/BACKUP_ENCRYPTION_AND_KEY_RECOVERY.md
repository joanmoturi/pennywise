# Encryption and key recovery

Cloud backups use Web Crypto, never custom cryptography. Each snapshot gets a
fresh random 256-bit data key and 96-bit AES-GCM IV. Passphrase wrapping uses a
fresh 128-bit salt, PBKDF2-SHA-256 (600,000 iterations) and an independent fresh
96-bit AES-GCM wrapping IV. The data key is wrapped, not stored plaintext.

The strictly validated envelope contains format, backup/device UUIDs, timestamp,
app/schema versions, source revision, algorithm/KDF/work factor, wrapped keys,
payload IV and ciphertext. Canonically ordered validated metadata is AES-GCM
additional authenticated data for both key wrapping and payload encryption.
The decrypted payload is an existing full-backup envelope whose checksum,
schema and financial relationships are independently verified.

Passphrases must have at least 12 characters. Confirmation and a local
encrypt/decrypt self-test precede unlocking. Existing latest verified backup
must unlock too, so a typo does not silently start a new incompatible backup
history. Secrets exist only in the current tab's memory/inputs and can be
explicitly locked; restarting requires unlocking again.

Optional recovery is a randomly generated 256-bit hex secret with an
independently salted/wrapped copy of the same data key. Download and store it
separately. A recovery key applies only to envelopes containing its wrapper.
Supply that saved key when unlocking a new session if new backups should keep
that recovery route. The app does not persist the recovery secret for you.

Changing a selected version's passphrase decrypts/authenticates the old wrapper,
rewraps its existing data key and uploads a new protected file. The payload is
unchanged. The new file is downloaded and authenticated before verification;
the original readable file is retained. Historical versions keep their old
passphrases until explicitly rewrapped. Unlock the new passphrase before
resuming automatic backups. Recovery wrapping remains unchanged.

Google password recovery cannot recover an independent encryption passphrase.
Losing both passphrase and applicable recovery secret can permanently lose
access. Argon2id was not introduced: native Web Crypto PBKDF2 avoids a new
WASM dependency and offline/browser compatibility burden. The versioned work
factor is fixed, validated and tested; no hardware calibration claim is made.

Original `pennywise-encrypted-v1` manual downloads remain readable. The new
cloud format can also be imported through manual backup inspection with its
passphrase. Its recovery-key route is in the cloud history interface.
