# Kichella bug fix report

November 5, 2026. Baseline: `95e6d83`. All fixtures and screenshots are synthetic.

| Problem                                                                                      | Change                                                                                                          | Evidence                                                        |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Whole-database rewrites and repeated serialization on saves                                  | Atomic changed-record writes; revision-aware cache; one record diff for audit and persistence                   | Targeted-write, cache isolation, concurrency and rollback tests |
| Committed save can appear stuck if optional BroadcastChannel throws                          | Resolve committed success independently of cross-tab notification                                               | Constructor/postMessage failure regressions                     |
| Repeated submissions can race                                                                | Synchronous shared-form submission guard and disabled controls while pending                                    | Unit tests and desktop/mobile repeated-submit cases             |
| Failed writes lose user confidence or appear indefinite                                      | Retained inputs, focused error summary, quota explanation, four-second slow status, 15-second database deadline | Real blocked transaction abort/retry and simulated quota tests  |
| Stale forms overwrite a concurrent edit; stale deletion can remove the last unrelated record | Reject changed/deleted source records; verify deletion index before splice                                      | Record-workflow concurrency regressions                         |
| Large transaction tables block rendering                                                     | Fifty-row pagination, complete filters retained, cached money formatter                                         | Real Chromium comparison and browser workflows                  |
| Repeated date formatting and account scans                                                   | Cached Nairobi formatter; one validation date; one-pass account balances                                        | Midnight and differential ledger tests                          |
| Setup navigates before persistence finishes                                                  | Await successful setup save                                                                                     | Existing first-account browser workflows                        |
| Shell-only changes recalculate financial views                                               | Stable context/callbacks and memoized active page                                                               | Source review and measured UI comparison                        |

Final automated result: **179 unit/integration tests and 32 desktop/mobile
browser tests passed; zero failures**. Formatting, lint and production build
passed. These tests do not establish that every production phone issue has been
reproduced or eliminated.

The largest throttled synthetic case still takes several seconds to save. See
`KICHELLA_PERFORMANCE_REPORT.md`; no universal instant-save claim is made.
