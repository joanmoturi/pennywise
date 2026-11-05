# Kichella usability test report

November 5, 2026. Automated Chromium desktop and Pixel-7-emulated cases; no
human usability sessions, physical-phone testing or screen-reader study.

| Journey                        | Verified behavior                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| Set up an account              | Initial account persists before continuing                                                 |
| Record/edit money              | Shared forms, retained fields, explicit save completion and reload persistence             |
| Recover after storage failure  | Focused explanation, unchanged inputs, no false commit and safe retry                      |
| Submit repeatedly              | Multiple immediate submit events create one ledger record                                  |
| Record an owned transfer       | Destination becomes visible; correct two-account balances; no income/spending double count |
| Use optional details           | Fields remain in the form and can be revealed; linked inputs auto-open                     |
| Navigate on mobile             | Existing pages remain reachable; direct Accounts and grouped menu                          |
| Use keyboard/error recovery    | Native dialog focus, Escape cancellation, summary focus and associated amount error        |
| Work offline                   | Accounts, budgets, recurring expenses and transactions save/edit and survive reload        |
| Protect backup/Inbox workflows | Existing restore, review, rule evaluation and idempotent imports remain tested             |

**32 browser cases passed, zero failed**, across 16 desktop and 16 mobile cases.
The suite also covers the other existing financial workflows; it is not 32
independent human journeys. Unit/integration tests: 179 passed.

Comparison screenshots and measured fictional-data flows are documented in
`KICHELLA_VISUAL_COMPARISON.md` and `KICHELLA_PERFORMANCE_REPORT.md`.

Remaining acceptance work: actual-user task completion and error rates, complete
keyboard traversal, screen readers, contrast/zoom review, touch keyboard and
Samsung installed-PWA behavior. No invented user quotes, satisfaction score or
before/after usability rating is reported.
