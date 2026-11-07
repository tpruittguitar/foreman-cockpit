# Pipeline health request CPU

`/api/pipeline-health` used to parse ten full evidence reports on every request. The two discovery reports dominated the payload with job descriptions that health never used. The source-revision resolver already cached its lookup, but that did not cache health results.

## Changes

- Prefer `state/source-trial-report.health.json` and `state/board-discovery-report.health.json` from the same immutable coordination revision as the other evidence. The companion producer change is [forge-coordination #308](https://github.com/tpruittguitar/forge-coordination/pull/308).
- The `forge.discovery-health.v1` projection contains `at`, `failedBoards`, `candidates`, and `urls`. `candidates` counts all report rows; `urls` contains the unique HTTPS strings with fragments removed. Counts and cross-report URL unions retain their previous meanings.
- Fall back independently to each original report when its sidecar is absent, invalid, unreadable, or too large. Never replace an unavailable source with an apparently healthy zero. The first rollout and older source revisions remain compatible.
- Bound sidecar reads to 256 KiB and full reports to 8 MiB of bytes, canceling oversized or retried responses before continuing.
- Memoize and edge-cache only fully verified health results, keyed by source revision and observation minute. Concurrent requests share one build. A new minute recomputes time-dependent execution checks. Response TTL ends at that same minute boundary, including time spent loading. Partial results and unverified revision fallbacks are `no-store` and not memoized. Cache failure does not prevent evidence reads.

The sidecars are generated and committed by the existing discovery runs alongside their full reports. No scheduling, Writer, canonical-state, billing, or deployment configuration changes are needed. No live reports or credentials are included in this repository. Until a sidecar-producing run has published, the corresponding source still incurs the original full-report cost.

## Verification

Run `npm test` and `npm run check:cloudflare`. For a repeatable local CPU comparison, use a read-only coordination checkout:

```
node scripts/benchmark-health.cjs /path/to/forge-coordination [baseline-function.js]
```

The optional baseline is the original `functions/api/pipeline-health.js`. Without it, the script compares the current legacy fallback to the compact path. It generates projection strings only in memory, excludes file reads from the timing loop, and asserts complete output equality. It prints only aggregate byte and CPU measurements, not evidence contents. Each path uses five warmups and thirty measured iterations.

On the 2026-11-07 source snapshot, Node process CPU measured:

| Path | Evidence bytes | Median CPU | p95 CPU |
| --- | ---: | ---: | ---: |
| Original full-report path | 6,641,912 | 34.1 ms | 59.6 ms |
| Compact cold build | 956,189 | 5.4 ms | 15.1 ms |
| Cached repeat | 0 | 0.43 ms | 0.62 ms |

These local values are comparative, not Cloudflare production CPU measurements or a guarantee of fitting a plan's CPU limit. The historical resource errors have not been attributed to this route. After review and an authorized production rollout, confirm both sidecars are present at the resolved coordination revision, compare route-level CPU/error telemetry, and verify no freshness/fallback regressions. No production rollout is part of this change.
