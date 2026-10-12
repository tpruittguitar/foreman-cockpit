# Pipeline Explorer / Writer revision log

Tim's rule (2026-10-11): collect Explorer and Writer changes here and ship them together as batched releases. Newest batch first. Each entry names what changed, why, what did not change, and how it was verified.

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
