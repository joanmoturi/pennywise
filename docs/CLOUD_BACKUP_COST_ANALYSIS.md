# Cost and infrastructure

No financial server, Firebase/Firestore, Supabase, hosted transaction database,
paid scheduler, paid API, analytics or additional dependency was introduced.

Google Identity Services provides Google sign-in and short-lived browser
authorization. A Google Cloud project, OAuth web client and enabled Drive API
are required for connection; they store configuration/consent, not this app's
financial database. There is no application-owned token-refresh backend.

Encrypted snapshots use the user's existing Google Drive storage/quota.
Storage limits depend on that user's Google account/plan and can change.
No storage subscription was purchased or assumed. Retention and protected/monthly
copies consume storage; users should check their own available quota. API quota,
OAuth audience and organizational restrictions must be checked in the owner's
Console. No numerical free-tier quota/cost guarantee is made.

The CBK same-origin adapter is only for public reference retrieval. Local
development runs it inside Vite, costing no hosted service. A Pages Function is
provided for the existing Pages project; when published it consumes the owner's Cloudflare
request/CPU allowance. Evaluate the account's current plan before deployment:
no paid tier is selected, and ordinary financial/manual operation never needs it.

A backend would be necessary to promise secure unattended refresh-token
management, but that promise is deliberately not made. Reauthorization and
foreground scheduling are the simpler approved browser-only alternative.
