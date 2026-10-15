# Pipeline Explorer / Writer revision log

Tim's rule (2026-10-11): collect Explorer and Writer changes here and ship them together as batched releases. Newest batch first. Each entry names what changed, why, what did not change, and how it was verified.

## Batch 2026-10-14-B — Scoring model 2026-10-14.1 and Open roles default view

Trigger: Tim, 2026-10-14 20:13–20:49 ET. FPC of Brighton held the top score for days despite weight changes; Tim asked for the suggested scoring changes as the new default, Applied/closed jobs hidden by default, and the Target Companies list fed into the culture score.

Diagnosis: scores were recalculating. FPC led on every input (stored fit 92, comp 97 from a midpoint built on an estimated low end under a "up to $350k" ceiling, HIGH_FLEX, title 90), so no reweighting could move it. FPC is APPLIED.

### Changed
1. `pipeline-scoring.js` (and byte-identical `apps-script/PipelineScoring.gs`): model version `2026-10-14.1`; default weights experience 40, flex 30, comp 15, geo 10, culture 5, title/ats/ownership 0.
2. Compensation: two-segment line, 0 at floor, 50 at target, 100 at ceiling. The salary target setting was previously ignored.
3. Culture: explicit `CULTURE_SCORE` first; otherwise the Target Companies tier from the canonical rules (P1 100, P2 90, P3 75, WATCH 60; unlisted or PAUSED 40; hidden-client recruiter rows UNKNOWN). The viewer (`scoringCfg_`) and the Writer (`readFlexPolicy_`, `deriveWriterScores_`) both read the list with `PipelineScoring.targetCompaniesFromRules`. The list is stripped from the published model.
4. `pipeline.html`: new `OPEN` preset "Open roles" (nonterminal, not APPLIED) is the default; a saved "All live" view moves to it once (`px.openDefaultV1`). "All live", "Applied" and the terminal history views are unchanged.
5. Target Companies policy line and screen tip now say priority also sets the culture score.
6. `SCORING_MODEL.md`: weights, fit anchors for `SCOPE_FIT_RAW`, culture rule, comp curve, ceiling-only salary rule.

### Not changed
Master rows, FLEX policy, gates, Writer intake rules. FPC's stored fit and salary evidence are unchanged (separate correction).

### Verification
`npm test` 442 pass (new `tests/scoring-20261014.test.js`; two tests updated for the new defaults). Inline scripts parse. Branch code run against the live 578 open roles: spread ±11.2 → ±11.7, top 76; 74 open roles match a target company.

### Limits
The Writer's Apps Script copy needs a Writer deploy before Writer-stamped `OVERALL_RATING` values use the new curve and culture rule; the Explorer calculates live and does not depend on it. Removing title weight lets Manager-level titles rank beside Director/VP titles when the other inputs match.

## Batch 2026-10-14-A — AI usage panel shows new readings promptly

Trigger: Tim, 2026-10-14 00:10 ET ("change it now... its important to know so i can balance work load"). The System panel kept showing the 21:17 ET reading after the 00:04 ET reading was pushed.

### Changed
1. `pipeline-ai-usage.js` `load`: reads the GitHub contents API (`application/vnd.github.raw`, 60 s cache) first, falls back to raw.githubusercontent.com on refusal or network error. Raw caches 5 minutes and ignores query strings (verified: `?cb=<ms>` returned `x-cache: HIT`, `source-age: 234`), so the old cache-buster never worked.
2. `pipeline.html`: opening the System panel or pressing Refresh now always re-reads the readings file; otherwise the hold is 2 minutes (was 10). The AI usage section now prints when the file was checked and the time of the newest reading.

### Verification
`npm test` 436 pass (new: API-first and raw-fallback load test). Inline page scripts parse. API endpoint returns the current file with `Access-Control-Allow-Origin: *`.

### Limits
Unauthenticated GitHub API allows 60 calls per hour per IP; the panel uses at most 30. Above that it falls back to raw (up to 5 minutes stale).

## Batch 2026-10-13-I — ZipRecruiter redirect links are not identity

Trigger: ChatGPT's first weekly ZipRecruiter pass (FORGE-ZIPR-CHATGPT-20261013-1740ET-B01, 12 records): 1 written, 11 `WRITE_FAILED` with `IDENTITY_CONFLICT: SOURCE_URL_IDENTITY_CONFLICT`. Every ZipRecruiter link is `ziprecruiter.com/job-redirect?match_token=...`; `canonUrl` dropped the query, so all ZipRecruiter roles shared one identity with the first row written (Red Frog Solutions, V2I-2D41E91681F5).

### Changed
`canonUrl` (Code.gs) returns no identity for ZipRecruiter redirect paths (`/job-redirect`, `/jobs/redirect`, `/clk`), the same treatment as Indeed sponsored-click links. Dedupe falls back to employer + title + location. ZipRecruiter company job pages keep their identity.

### Not changed
Other URL identities, intake rules, the 11 failed records (resubmitted separately after deploy).

### Verification
`npm test`: 435 pass, 0 fail (2 new checks in `tests/canon-url.test.js`).

## Batch 2026-10-13-H — TinyFish posting date in bold layout

Trigger: dry run after deploying batch G (Writer v62, 2026-10-13 18:00 ET): TinyFish sometimes returns Workday fields as `**posted on**:   Posted N Days Ago`; the posting-date pattern now reads both layouts. Liveness, pay and degree were unaffected. Verification: `npm test` 435 pass (1 new).

## Batch 2026-10-13-G — Writer reads Workday through TinyFish

Trigger: Tim, 2026-10-13 17:46 ET, "Yes" to the Writer calling TinyFish's free Fetch API. Evidence: Workday answers 403 to requests from Google's servers (73 of 929 active rows, first ATS batch 2026-10-13); Claude's TinyFish test the same evening rendered Workday job and search pages in full (Blue Origin R67034, Entegris REQ-13635 with pay $220,000-$280,000).

### Changed
1. **`apps-script/PipelineAts.gs` TinyFish fallback.** When a Workday row's CXS call fails and the script property `TINYFISH_API_KEY` is set, the Writer reads the public job page through `POST https://api.fetch.tinyfish.ai` (rendered on TinyFish's servers). A stored URL without the requisition token (`_R12345`, `_REQ-12345`, `_JR12345`) is resolved through the site's own search page (`?q=` with up to three title words): one unique title match (location breaks ties) is fetched; several matches with no way to tell them apart are never guessed (`AMBIGUOUS_SEARCH`).
2. **Fields.** Same ENRICH fields as the checker, plus `ATS_CHECK_VIA=TINYFISH`, `ATS_CXS_RESULT` (the original Workday answer), `LIVENESS_METHOD=TINYFISH_FETCH:WORKDAY`, `ATS_POSTED_NOTE` for "Posted 30+ Days Ago" (no invented date). `ATS_POSTING_URL` holds the full job link and is now read first, so later checks go straight to it.
3. **Limits.** 6 Workday rows per run (three sequential TinyFish rounds of up to 35 s each fit after the 90 s claim cutoff, under the 6-minute limit), 300 URLs per UTC day (TinyFish's free allowance is 1,000; beyond it the wallet is charged). Rows over a limit are deferred unwritten, so they stay due. A TinyFish outage defers the rows instead of recording a failure.

### Safety rules in code
- CLOSED only when a URL carrying the requisition token shows Workday's "page you are looking for doesn't exist" page or a 404. The same page on a token-less URL, absence from search, a block or an unreadable page never closes a row.
- Title check as before; "Similar Jobs" text is excluded from pay and degree reading.
- The API key lives only in script properties; it is never logged, returned or written to a file.

### Not changed
Other providers, the queue, scoring, Writer authority. Without `TINYFISH_API_KEY` the checker behaves exactly as batch E.

### Verification
`npm test`: 434 pass, 0 fail (7 new in `tests/ats-tinyfish.test.js`, built on page text captured from TinyFish on 2026-10-13). The Apps Script glue (UrlFetchApp to TinyFish) is not unit-tested; first live check is `GET action=ats_check&dry=1` after deploy with the key set.

## Batch 2026-10-13-F — AI usage panel and PC keep-alive

Trigger: Tim, 2026-10-13 15:49-15:54 ET: a bar chart in the app with the estimated shutdown day, updated automatically, plus a PC script that keeps the machine and Chrome available for it ("B now").

### Changed
1. **`pipeline-ai-usage.js` (new) + System panel section "AI usage".** One bar per provider meter (Claude weekly/session, ChatGPT weekly/5-hour, Grok weekly/bot) with the exact percent, reset time and projected run-out. Projection: measured rate between the newest reading and one at least 2 h older in the same reset window; with one reading, the average since the window started. Text status beside every bar (OUT, RUNS OUT BEFORE RESET, LASTS TO RESET, NEED 2 READINGS, NO READING, RESET PASSED), colour only as a second channel (UI doctrine v1.1 Accessibility Floor). Reads `usage/AI_USAGE_READINGS.jsonl` from the public forge-coordination repo (raw GitHub, CORS open), at most every 10 minutes while the System panel refreshes.
2. **`tools/forge-pc-keepalive.ps1` + `tools/install-forge-pc-keepalive.ps1` (new).** Hidden logon task on Tim's PC: keeps it awake on AC power only (SetThreadExecutionState; power settings untouched), restarts the Claude desktop app if closed on AC, opens Chrome minimized only around the usage-reader times. `-Uninstall` removes it.

### Not changed
Writer, master, scoring, lanes.

### Verification
`npm test`: 427 pass, 0 fail (4 new in `tests/ai-usage.test.js`). Browser render not run here (no Playwright); check the System panel after deploy.

## Batch 2026-10-13-E — Writer ATS liveness checker

Trigger: Tim, 2026-10-13 14:47 ET, "Implement everything else" (items 1, 2, 4 and 5 of the verification integration plan; item 3, JobSpy, deferred). Evidence: Claude's 9-row test against the live master the same afternoon; first-party ATS APIs were conclusive on 5 of 6 rows.

### Changed
1. **New `apps-script/PipelineAts.gs`.** Detects a row's ATS from its stored URLs (Workday, Greenhouse, Lever, Ashby, Oracle HCM with a CX_n site, SmartRecruiters, BambooHR), builds the public API URL from the stored URL only (no invented hosts or slugs), reads the answer and turns it into ENRICH fields. `runAtsCheck_` fetches with `UrlFetchApp.fetchAll` (10 at a time, one Ashby board call per board) and queues ONE batch file `ATSCHK_<stamp>.json` of up to 25 ENRICH rulings (actor `WRITER_ATS`). Every write goes through the normal queue, receipts and three-proof verification.
2. **Queue tick** (`Automation.gs`): runs the checker at most every 30 minutes on a quick, non-busy tick, and never while an earlier ATSCHK file is still queued.
3. **GET `action=ats_check`** (`Code.gs`): run now; `&dry=1` returns the plan and queue body without writing.
4. **Posting-validation worklist** (`PipelineWorklists.gs`): rows with a checker-supported URL are left to the checker unless `ATS_CHECK_RESULT` is not LIVE/CLOSED. The AI lane gets only the residue.

### Safety rules in code
- CLOSED only on positive evidence: per-posting 404/410 from Workday, Greenhouse or Lever (`CLOSED_EMPLOYER_404`); Workday `posted=false`/`canApply=false` or Oracle end date in the past (`CLOSED_EMPLOYER_ATS`). Any error, block, unreadable body, title mismatch, board absence or untested-provider miss writes only `ATS_*` fields and leaves `LIVENESS` alone.
- Title check: the ATS title must share at least half the row title's significant words, else `TITLE_MISMATCH` and no stamp.
- Pay: one structured annual USD range, or exactly one plausible range in the text; malformed (Entegris `$330,00.00`) and tiered ranges are skipped. `DEGREE_TEXT` is written only when the row has no posting-based degree evidence; otherwise the line goes to `ATS_DEGREE_TEXT` only.
- Never writes BUCKET, DISPOSITION, POSTING_STATE, application or TIM_* fields. Protected and anti-resurrection rows are never selected.

### Not changed
- No master row changes on deploy. The first checker batch runs on the first quick tick after deploy.
- Lane ownership, scoring, FLEX rules, intake and identity matching.

### Verification
- `npm test`: 423 pass, 0 fail (412 before + 11 in `tests/ats-checker.test.js`, built from the real API bodies seen on 2026-10-13: Entegris and Blue Origin Workday, Vulcan Greenhouse, Palantir Lever, Ramp Ashby, KIK Oracle, fly.io BambooHR).
- Not run: live fetch from Apps Script (the build workspace cannot reach ATS hosts). After deploy, run `action=ats_check&dry=1` and check the plan before the first real batch lands.

### Deploy note
Writer only. `UrlFetchApp` is already authorised (REV-005). New file `PipelineAts.gs` is pushed by `deploy.sh` with the other `*.gs` files.

## Batch 2026-10-13-D — Writer clears held queue files by itself

Trigger: Tim, 2026-10-13 12:44 ET, on the QUEUE_HOLD warning for `HOLD__FORGE_GOFER_CLAUDE_20261012_TIM_03_hitachi_R0109990_applied.json`: "I don't want to do an exception action. I'd like trivial non problems to be processed programmatically."

Facts: the request ran 2026-10-12 01:40 UTC, SUCCESS, CREATE `V2E-89E2C036440E` (Hitachi Energy, R0109990, APPLIED). Its RESULT is in `processed`. Only the move of the request file out of the queue failed, so `finalizeClaim_` renamed it HOLD__. Row readback 2026-10-13 13:56 UTC found the row APPLIED and protected.

### Changed (`apps-script/Automation.gs`)
- New `reconcileHolds_`, run on each quick, non-busy queue tick (up to 10 held files). A HOLD__ file whose RESULT__ exists in `processed` or `failed` is renamed back and moved into that folder, which is where `finalizeClaim_` meant to put it. Each move is appended to `WRITER_HOLD_RECONCILE_LOG.jsonl`; the tick summary carries `holds`.
- A HOLD__ with no RESULT, or whose move fails again, stays held under its HOLD__ name, so the QUEUE_HOLD warning keeps reporting real anomalies.

### Not changed
Nothing is re-run. No master read or write. Queue log, incident rules and warnings unchanged. Claim, finalize and repair paths unchanged.

### Verification
`npm test` 412 pass, 0 fail. New `tests/hold-reconcile.test.js` (5): SUCCESS result moves to processed; failed result to failed; no RESULT stays held; second move failure restores HOLD__; pending and RESULT files untouched.

### Deploy note
Writer change. Deploy with `apps-script/deploy.sh`. The current Hitachi hold clears on the first quick tick after deploy.

## Batch 2026-10-13-C — System dashboard counted finished obligations as open backlog

Trigger: Tim, 2026-10-13 12:35 ET, phone screenshot of System > Dashboard: "Processing backlog by stage" showed Writer / verification 514 and Qualification 33 (sum 547) while the state mix showed 452 verified complete, 51 existing verified, 2 excluded verified, 42 needs resolution, and the Writer header read idle with queue 0.

### Root cause
`pipeline-operations-ui.js` had its own `isDone` regex anchored to `VERIFIED|COMPLETE|DONE|RESOLVED|WRITE_VERIFIED|VERIFIED_MASTER`. No real obligation state matches it (the real final states are `VERIFIED_COMPLETE`, `EXCLUDED_VERIFIED`, `EXISTING_VERIFIED`, `CANCELED_VERIFIED`), so every obligation counted as open. This inflated "Processing backlog by stage", "Open work by lane", the Writer-blocked count and the dashboard's next-action text. "Obligation state mix" and "Resolved vs open" use `PipelineOperations.summary` and were already correct.

### Changed (`pipeline-operations-ui.js`)
- `isDone` now calls `PipelineOperations.complete` (final state plus independent proof), the same test `summary()` uses. Fallback when that module is absent: the four final state names.
- `create()` exposes `metrics` (the existing `dashboardMetrics`) for tests.

### Not changed
Obligation data, Writer, scoring, master, the stage classifier, chart rendering. The company filter chip still does not scope System dashboard charts (they are global; separate item, not addressed here).

### Verification
`npm test` 407 pass, 0 fail. New `tests/ops-dashboard-done.test.js` (2 tests) fails against the old logic (open 11 vs expected 3) and passes with the fix. Expected live effect: the Writer bar drops from 514 to the count of obligations still in non-final states (or final without proof); this equals summary's open count.

## Batch 2026-10-13-B — intake dedupe: ATS job id and state names

Trigger: Claude 07:15 ET check. Grok web intake FORGE-WEB-GROK-20261013-0315ET inserted three Anduril VP Production rows (V2I-7506B47A8EAD, V2I-1F7FCDC7D808, V2I-121F69D9A93E) that already exist in the archive as DECLINED_BY_TIM (V2S-ANDURIL-VPPROD-MS-5199174007, V2S-ANDURIL-VPPROD-FRON-5218932007, V2L-ANDURIL-VPCONNECTEDWARFARE-5173257007). Intake carried Anduril's internal req (12461, 13466, 11414); the archived rows carry GH-<Greenhouse job id>; locations read "Costa Mesa, California, United States" against "Costa Mesa, CA". No match path fired.

### Changed (`apps-script/Code.gs`)
1. `atsJobIds`: Greenhouse job id (`greenhouse.io/<board>/jobs/<id>`, `gh_jid`) and Workday R-number from URLs. Indexed per row from the REQ cell and every URL field.
2. `matchExisting`: REQ_ID also matches a row's ATS ids; new `ATS_JOB_ID` path matches the intake URL's job id against a row's requisition or ATS ids. Same-employer only.
3. `normLocation`: full US state names map to postal codes.

### Not changed
Match order, conflict and ambiguity handling, employer compatibility, protected states.

### Verification
`npm test` 405 pass (5 new in `tests/ats-job-id-dedupe.test.js`, built from the live Anduril and Blue Origin rows, including a cross-employer negative case).

## Batch 2026-10-13-A2 — worklist selectors match live master keys (fix to A)

Trigger: first live build of batch A (Writer v57, 2026-10-13 00:54 ET) listed 862 of 1,408 rows as needing strategic analysis. A scan of the live master showed strategic fit stored as SCOPE_FIT_RAW / FIT_CONF / FIT_ASOF / ANALYSIS_BY, salary as SALARY_BASE_LOW/HIGH/MIDPOINT and PAY_POSTED, and DEGREE_TEXT="not stated in alert" on most intake rows.

### Changed
- Strategic: a row is done when `PipelineEvidence.fit` reads a fit value (the Explorer's own FIT_KEYS) or ANALYSIS_BY/ANALYSIS_ASOF/STRATEGIC_ASOF is set. Live count 862 -> 18.
- Feasibility: SALARY missing when `PipelineEvidence.salary` finds no midpoint; DEGREE missing when DEGREE_REQ is absent and DEGREE_TEXT is absent or alert-derived. FLEX dropped from NEED (the Writer derives FLEX_CLASS from DEGREE_TEXT). Live count 821 -> 452.
- Posting validation unchanged (337).

### Verification
- `npm test` 400 pass. Counts above from the live master read at 00:54 ET on Tim's machine.

## Batch 2026-10-13-A — lane worklists built by the Writer

Trigger: Tim, 2026-10-13 00:29 ET ("Implement 1-5"): Grok at 80% of weekly usage; Grok runs spent most of their budget reading and parsing the 3 MB master, and FORGE-ENRICH-STRATEGIC-GROK-20261013-0224ET hard-blocked because the master truncates in Grok's reader. Control: forge-coordination CONTROL 2026-10-13.2, GROK EFFICIENCY AMENDMENT.

### Changed

1. **New `apps-script/PipelineWorklists.gs`.** Pure builder (`build`, `render`) plus `refreshWorklists_`. Writes three small plain-text files in AI_Coordination, overwritten in place (IDs never change): `WORKLIST_FORGE_ENRICH_STRATEGIC.txt` 1nGzvaRZufMkXD0dIAqcrMeAWZEUzoPu8, `WORKLIST_FORGE_ENRICH_FEASIBILITY.txt` 1B0IxEim2QUxvZ8swiZKwbSMB-1dkY9O1, `WORKLIST_FORGE_POSTING_VALIDATION.txt` 1KyBWb2RTVMoDEkdYGCHuXMAAqCShdQl0. Each lists up to 40 rows (about 10 KB) with eligibility rule, counts and master stamp.
2. **Queue tick hook** (`Automation.gs`). `processWriterQueue` calls `refreshWorklists_(false)` after the claim loop, at most every 30 minutes, only when the tick was quick and not busy. Errors are caught and reported in the tick summary; the queue path is unaffected.
3. **GET `action=refresh_worklists`** (`Code.gs`) forces a rebuild; added to the `ping` action list.

### Not changed

- No master writes. Eligibility rules are read-only selectors; protected buckets, ANTI_RESURRECTION and DO_NOT_REWORK rows never appear. Writer actions, scoring, FLEX policy unchanged.

### Verification

- `npm test`: 399 pass, 0 fail (4 new in `tests/worklists.test.js`: payload parsing of space-joined keys, lane selection and exclusions, attempt cooldown ordering, render size cap on the scrubbed fixture).

### Deploy note

Writer deploy with `apps-script/deploy.sh`. After deploy, call `action=refresh_worklists` once (or wait for the next quick queue tick) and check that the three files show `GENERATED_AT_UTC`.

## Batch 2026-10-12-C — REV-006 preferred-only degree is SOFT_FLEX

Trigger: Tim, 2026-10-12 16:56 ET, answering two questions raised by the batch B scan of the live master (1) a degree named only in preferred wording → SOFT_FLEX; (2) a stated degree with no experience alternative and no word "required" → NO_FLEX (confirms batch B behavior).

### Changed

1. **Preferred-only degree → SOFT_FLEX** (`pipeline-policy.js` = `apps-script/PipelinePolicy.gs`). Batch B left such rows UNKNOWN (11 rows that were HIGH/SOFT would have fallen back to NEEDS_EVIDENCE). A degree stated outside the preferred clause stays hard (`Bachelor's … Preferred: MBA` → NO_FLEX). A recorded STRICT hold is not released by preferred-only wording.

### Not changed

- Rulings (a), (b), (c), Tim locks, modifiers and scoring weights. No master row changes on deploy; rows reclassify on their next write carrying DEGREE_TEXT.

### Verification

- `npm test`: 395 pass, 0 fail. `tim-lock-v4` expectation for bare "Degree preferred" changed UNKNOWN → SOFT_FLEX per this ruling. New cases in `tests/flex-rulings-20261012.test.js`.
- Scan of the 1,295-row master against old and new code: 309 rows change class in total (batches B + C), none to UNKNOWN. List sent to Tim as CSV.

### Deploy note

Writer-only change in effect (Explorer shares `pipeline-policy.js`). Deploy with `apps-script/deploy.sh`.

## Batch 2026-10-12-B — FLEX rulings, refresh waits for queue, decision tabs, GitHub policy switch

Items REV-001, REV-002, REV-004 and REV-005 from `control/PIPELINE_EXPLORER_REVISION_LOG.txt` in `tpruittguitar/forge-coordination`. REV-003 (gofer drains the held queue) is an operations task with no code and is not in this release.

### Changed

1. **REV-004 FLEX derivation per Tim's rulings of 2026-10-12 12:55 ET** (`pipeline-policy.js` = `apps-script/PipelinePolicy.gs`). (a) "Bachelor's ... preferred, or equivalent education and experience" → HIGH_FLEX (was UNKNOWN). (b) Hard engineering degree or tiered BS/MS/PhD with no experience alternative → NO_FLEX (was SOFT_FLEX). (c) "B.S. in <field> or an equivalent technical field" → NO_FLEX (was HIGH_FLEX): "equivalent" followed by field/discipline/major/degree no longer counts as an experience alternative. Degree abbreviations (BS, BSEE, MS, MBA, M.Eng …) are recognised; "MS Office/Excel" is not. A degree mention with "preferred / a plus / desired / ideally" and no hard wording is no longer treated as a hard requirement.
2. **REV-001 Refresh review waits for the queue** (`pipeline.html`). Queue checks show ⏳ while the Writer queue still has items, the panel says "Ready when the queue clears (N waiting, M unverified)", and every Writer status poll repaints an open review.
3. **REV-002 Decision tabs and whole-queue tile** (`pipeline.html`, `pipeline-navigation.js`). Pipeline menu gains Review queue, Decline candidates and My rulings. The "Needs decision" tile counts the whole NEEDS_TIM queue and opens it.
4. **REV-005 Policy source switch** (`apps-script/Code.gs`). Rules and scoring model reads and saves go through one switch. Drive stays the default. With Script Property `POLICY_SOURCE=GITHUB` they use `tpruittguitar/forge-policy` (`rules/TIM_PIPELINE_RULES_CANONICAL.txt`, `scoring/PIPELINE_SCORING_MODEL.json`; overridable by property). Saves need `GITHUB_POLICY_TOKEN`, pass the file's blob SHA (a concurrent change is a `REVISION_CONFLICT`, never an overwrite), commit with a `TIM ...` message so the unreviewed-push alarm stays quiet, verify by readback, and still write the Drive history and event log. A failed GitHub read takes the same degraded path a failed Drive read takes today; it never silently falls back to Drive. New editor function `checkPolicySource()` reports the live source.

### Not changed

- No master row, published scoring model or Rules text is changed by deploying. Rows reclassify under REV-004 only on their next write that carries DEGREE_TEXT; the refresh re-derives modifiers from stored FLEX_CLASS and does not reclassify.
- Drive remains the policy source until Tim sets `POLICY_SOURCE=GITHUB`. `pipeline-alignment.js` still names the Drive Rules ID for automation contracts; that changes with CONTROL at policy cutover.
- STRICT holds, `TIM_FLEX_CLASS` locks, modifiers and scoring weights are unchanged.

### Verification

- `npm test`: 393 pass, 0 fail. New: `tests/flex-rulings-20261012.test.js` (rulings a–c, edges, Writer copy identical), `tests/policy-source-github.test.js` (7 cases: Drive default with no network call, token and raw reads, no Drive fallback, rules save with conflict and label, scoring publish with revision check, concurrent-change conflict). One `tim-lock-v4` expectation changed to NO_FLEX per ruling (b).
- Browser suites not run (no Playwright in the build environment). `tests/derived-refresh.browser.js` was updated for the ⏳ text and should be run before deploy.

### Deploy note

Writer and Explorer deploy together. The Writer now references `UrlFetchApp`, so Apps Script will ask for the external-request permission: after `deploy.sh`, open the script editor and run `checkPolicySource` once to authorise it. If the live `appsscript.json` lists `oauthScopes` explicitly, add `https://www.googleapis.com/auth/script.external_request` first.

## Batch 2026-10-12-A — settings stick (FLEX, map/geo, scoring publish)

Trigger: Tim, 2026-10-12 03:12 ET: "My scoring and flex keeps getting reset" / "And my map geo changes". Diagnosis on Drive: `AI_REASON_DIAGNOSIS_Scoring_FLEX_Geo_Resets_2026-10-12.txt` (1R-JM_cJLMR3K4rVWH1JR6Z6_Db9_dyte).

### Changed

1. **FLEX class settings stick under V4** (`pipeline-rules.js`, `pipeline-policy.js` = `apps-script/PipelinePolicy.gs`). The V4 lock supplied hard-coded class mappings that overrode what Tim saved. V4 now supplies defaults only; a saved `NOT_STATED_CLASS`, `EQUIVALENCY_CLASS`, `HARD_DEGREE_CLASS`, `SINGLE_PATH_CLASS` or `FRESH_DEGREE_OVERRIDES_STALE_CLASS` wins. V4 classification now uses those mappings.
2. **V4 description text follows the saved numbers** (`pipeline-rules.js`). The V4 prose was static (+15/+6/-10) while the live keys are +90/+30/-60/-100. Prose is now generated from the keys. The one-click FLEX/URL update in the Rules editor always regenerates it.
3. **Tim's row FLEX choice is locked** (`apps-script/Code.gs`, policy module). An actor-TIM ruling that sets `FLEX`/`FLEX_CLASS`/`FLEX_HINT` records `TIM_FLEX_CLASS` + `TIM_FLEX_SET_AT`. That class outranks text re-derivation and survives unrelated writes from any lane. Tim choosing UNKNOWN releases it. Agents cannot write `TIM_FLEX_CLASS` (added to `FIELD_DENY`).
4. **Placeholder degree text is unresearched** (policy module). Text such as "not stated in email alert excerpt", "UNKNOWN (... not extracted ...)", "feasibility to capture" now classifies as UNKNOWN per Rules V4 ("Blank/unresearched requirements remain UNKNOWN"). A recorded STRICT hold still survives.
5. **"No degree required" / "degree is not required"** now classify as the not-stated class. They were classified as a hard degree requirement because the word "required" matched.
6. **Map edits survive reload** (`pipeline.html`). Add, remove, edit and geocode of a control point now mark the local draft as edited, so loading the published model no longer discards them. Reset asks for confirmation.
7. **Stale scoring publishes are rejected** (`apps-script/Code.gs`, `pipeline.html`). The Explorer sends `baseRevision`; the Writer rejects a publish edited from an older revision (or with no base revision once a model exists) with `REVISION_CONFLICT`. The Explorer keeps the draft, refreshes the published model and asks Tim to review again.
8. **Exact duplicate map points** (same name and coordinates) are removed on review and publish. Rev 20 has Seattle, WA twice.

### Not changed

- No row in the master, no published scoring model and no Rules text is modified by this release. The live Rules' saved class keys equal the old V4 forced values, so scores do not move on deploy. Rows change only on their next write, and only where a placeholder or "no degree required" text was misclassified.
- STRICT hold / `TIM_FLEX_OVERRIDE` semantics, modifiers, ownership, identity and protected application states are unchanged.

### Verification

- `npm test`: 381 pass, 0 fail (371 existing + 10 in `tests/settings-stick.test.js`, one or more per defect, using the live +90/+30/-60/-100 policy).
- Browser suites (`*.browser.js`) were not run: Playwright is not installed in the build environment. `tests/scoring-publish.browser.js` mocks `save_scoring_model` and should be run before deploy.

### Deploy note

Writer and Explorer must deploy together. An old cached Explorer tab will get `REVISION_CONFLICT` on publish until it reloads; that is intended.
