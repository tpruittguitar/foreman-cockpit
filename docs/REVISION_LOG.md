# Pipeline Explorer / Writer revision log

Tim's rule (2026-10-11): collect Explorer and Writer changes here and ship them together as batched releases. Newest batch first. Each entry names what changed, why, what did not change, and how it was verified.

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
