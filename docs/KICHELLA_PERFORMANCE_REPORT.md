# Kichella performance report

November 5, 2026. Real Chromium, isolated synthetic databases, development
bundles on the same Windows computer. Each UI result below is one run, not a
statistical benchmark or measurement on a physical phone.

The save interval starts before clicking Save and ends after the dialog closes
and two animation frames complete. Fixtures include matching audit-history
counts, 5/25 accounts and 10/100 recurring definitions with generated occurrences.

| UI case                                        | Startup   | Transactions navigation | Save to responsive | Rendered rows |
| ---------------------------------------------- | --------- | ----------------------- | ------------------ | ------------- |
| Original, 1,000 transactions, desktop          | 510 ms    | 756 ms                  | 1,819 ms           | 1,000         |
| Kichella, same fixture, desktop                | 284 ms    | 162 ms                  | 283 ms             | 50            |
| Original, 1,000 transactions, mobile viewport  | 440 ms    | 1,031 ms                | 1,836 ms           | 1,000         |
| Kichella, same fixture, mobile viewport        | 264 ms    | 379 ms                  | 217 ms             | 50            |
| Kichella, 10,000 transactions, desktop         | 2,435 ms  | 252 ms                  | 893 ms             | 50            |
| Kichella, 10,000 transactions, 4x CPU throttle | 12,603 ms | 1,591 ms                | 5,644 ms           | 50            |

The paired 1,000-record desktop save was approximately 6.4 times faster in this
run; mobile viewport approximately 8.5 times. Neither Kichella 1,000-record save
recorded a task above the observer's 50 ms long-task threshold. Desktop heap was
approximately 106 MB original versus 35 MB Kichella. These are point-in-time
figures, not memory-leak measurements.

Earlier repository-only measurements showed 10,000-record original writes
around 1.26-2.44 seconds versus approximately 0.28-0.34 seconds after the initial
fixes. Those measurements predate the final single-pass diff optimization and
exclude the UI and recurring-view costs; do not compare them as identical tests.
The detailed baseline is in `KICHELLA_TECHNICAL_AUDIT.md`.

## Limits and remaining work

- An earlier original 10,000-record UI comparison timed out after 90 seconds
  looking for Add transaction. It is a failed baseline stress case, not a
  successful result, and was not repeatedly rerun.
- Kichella's 10,000-record/4x-throttled run still recorded a 2,428 ms long task.
  Complete validation, cloning, diffing and some derived views remain on the
  main thread. Large histories are not yet consistently responsive.
- The practical 300 ms save target is not met for every dataset/device.
- Development timing phases were empty in these runs; no phase-level
  breakdown or inferred render timing is claimed.
- CPU throttling/mobile viewports do not establish Samsung hardware performance,
  low-memory reliability, battery behavior or production-bundle timings.
- Maximum schema limits, prolonged memory growth and repeated receipt-heavy
  histories were not stress-tested.

Session-only JSON preserves the measured rows. Public comparison screenshots
contain fictional TEST records only. No timing log contains personal records.
