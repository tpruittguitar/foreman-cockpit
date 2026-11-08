# Strategic research completion markers

The strategic worklist already treats a stored fit score or a known `ANALYSIS_BY`, `ANALYSIS_ASOF`, `ANALYSIS_ACTOR`, or `STRATEGIC_ASOF` value as recorded analysis. Previously the Writer moved `ANALYSIS_ASOF` and `ANALYSIS_ACTOR` into the narrative companion. A row with only those markers then looked unfinished to the compact-master worklist builder.

## Storage and compatibility

- Keep `ANALYSIS_ASOF` and `ANALYSIS_ACTOR` inline on future Writer edits, just like the other decision-driving metadata. The existing evidence candidate list remains historical; the explicit inline keep list takes precedence. Analysis prose, quotes, basis and confidence continue to use the companion.
- For already-externalized markers, Writer worklist refresh reads the companion only if a strategic candidate has an evidence pointer. It projects only the two legacy marker fields, in memory, by following that exact row's canonical `EVIDENCE_REF` chain. It never uses the newest unreferenced record, another row's evidence, or archived rows.
- Explicit inline values take precedence. Missing/broken evidence chains, unknown markers, a pointer by itself, narrative and attempt stamps do not establish completion. The existing strategic eligibility predicate is unchanged.
- The projection does not rewrite the master, backfill markers, change evidence records, or resolve any Writer request. Source read/parse failure aborts refresh before worklist files or the refresh timestamp are written.

Strategic research completion is not whole-job completion. Salary and degree gaps remain on feasibility worklists, due posting checks remain on validation worklists, protected buckets remain excluded, and canonical writes still require independent verification. Schedule, ordering, limits, scoring and Writer authorization are unchanged.

## Verification and rollout

`tests/worklist-research-completion.test.js` covers evidence splitting, real synthetic Writer transactions, canonical-chain projection, off-chain evidence, missing/broken/cyclic chains, inline overrides, unknown and partial work, protected jobs, independent verification and the Apps Script refresh glue. All fixtures are synthetic; they do not establish a count of affected live jobs.

Validation: `npm test` (893 passing tests), `npm run check:cloudflare`, and `git diff --check`.

The implementation is a draft for review. No live master repair, worklist refresh, merge, Writer deployment or schedule change was performed. After separately authorized Writer deployment, the existing periodic worklist refresh can apply this compatibility read without a canonical backfill. A raw master consumer outside Writer worklist refresh still needs the canonical evidence chain for historical rows; it must not assume an absent inline marker means no completed analysis.
