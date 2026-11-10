# Authentication implementation

User approved Google-only Google Identity Services rather than Firebase.
Google account registration/password recovery remains Google's responsibility.
Application email/password registration, account linking and Firebase are not
implemented and are not advertised.

Google Identity Services supplies a Google ID token. The browser verifies the
RS256 signature against Google's public JWKS, expected OAuth audience, issuer,
expiry, nonce and verified email before showing an authenticated identity.
This is not a custom password system. No passwords or administrative secrets
exist in the application.

A signed ID token and nonce are kept in sessionStorage for reload within the
tab. They are NOT Drive access tokens. Resumption re-verifies signature and
expiry online. An offline or expired identity never locks financial storage.
Full browser closure, unavailable identity verification or expiration may
require sign-in again; this is not Firebase's long-lived managed app session.
The app does not claim a server-enforced authentication boundary: local data is
shared within the browser profile and sign-in does not partition it.

Drive has independent consent, connection, account identity and expiry.
Drive access tokens remain in memory only, with an expiry safety margin.
They are never saved in sessionStorage, localStorage, IndexedDB or backups.
The connected Drive identity is obtained from Google's authenticated userinfo
endpoint, not guessed from application sign-in.

Sign-out clears the local identity session and unlocked encryption, but does
not delete local data or independently authorized Drive files. Drive disconnect
clears its in-memory token, disables automation and requests consent revocation;
local application identity and records are not deleted. Google may apply
revocation at the OAuth project-grant level; reconnect if needed.

Remove account connection requests Google sign-in revocation. Cloud-file
deletion is separately confirmed and moves selected files to Drive trash.
To remove every cloud copy, manage the visible folder in Drive and empty trash
deliberately. Local records are never deleted by these account controls.
