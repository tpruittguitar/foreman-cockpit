# PIPELINE EXPLORER — DESIGN BRIEF v0.2

**Date:** 2026-09-29 (v0.1 earlier the same day; v0.2 after Grok review)
**Author:** Claude (Foreman node), from Tim's spec in this session
**Status:** PROPOSAL FOR REVIEW. No code written. No Drive files changed. Nothing in this brief is authorized until Tim rules on the open decisions in §9. **Merging this PR files the proposal; it does not authorize a build.**
**Reviewers:** Tim (final authority), ChatGPT / Forge, Grok / Scout
**Repo:** tpruittguitar/foreman-cockpit (`docs/PIPELINE_EXPLORER_DESIGN_BRIEF.md`)

**What changed in v0.2:** §1 rewritten against the live master (`V2_CURRENT_POPULATION_MASTER.txt`, a Google Doc, 526 rows, new bucket vocabulary). Parser contract made explicit (§3.1). IS_NEW now comes from `DATE_ADDED`, not local storage (§4.2). APPLY NOW predicate written as a sentence for Tim to accept or replace (§4.3). Quick rulings mapped to current state semantics with confirm and undo (§4.4). Ledger gated on a named regenerator (§5). Governance editor and floors-as-data moved out of v1 (§6.3, §6.5). Line estimate corrected (§8). §9 split into architecture vs. paint, with reviewer recommendations recorded. Broken §5.5 citation fixed. Grok review disagreements listed in §12.

---

## 0. One-paragraph summary

A single-file web app, hosted next to the existing Foreman Cockpit, that opens the canonical master job table from Drive as a dense, spreadsheet-style grid: every column, per-column dropdown filters and sorting, APPLY NOW and new discoveries at the top. Later steps add a Tim-only notes and rulings channel and read-only reports. The visual style is minimal, black, dense, Anduril / Shield AI in spirit. One codebase for desktop and phone (landscape). The app is a **derived view and, later, a Tim-write channel**; it never becomes a second state store. That constraint comes from `TIM_DIRECTIVE_MASTER_JOB_TABLE_SINGLE_SOURCE_2026-09-29` and drives every choice below.

---

## 1. What exists today (facts, verified 2026-09-29 ~22:50 UTC)

| Item | Fact | Source |
|---|---|---|
| Cockpit app | Single `index.html` on Netlify. Reads one public Google Doc as text through `netlify/functions/feed.js`, parses `[SECTION]` blocks of pipe-delimited rows. Read-only; paste fallback. Mobile CSS present. It is an ops board (nodes, calendar, tasks, a few positions), not a master viewer. | repo |
| Cockpit feed | `COCKPIT_FEED_v2` Doc ID `16d2Ugupvf-kG0izs_3enct7X5PZSs3NoBZdFCwnP4OA`, last modified 2026-08-11. **Stale by seven weeks.** | Drive metadata |
| Canonical master (live) | `V2_CURRENT_POPULATION_MASTER.txt`, **a Google Doc despite the .txt suffix**, ID `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`, parent `AI_Coordination`, created 2026-09-29 16:54Z, modified 20:41Z. Header line names itself `V2_CURRENT_POPULATION_2026-09-29_R6 (reconciled ...)` and says "where task instructions say master, they mean THIS file". | Drive metadata; file export |
| Master regime | Stable-named Doc updated **in place** ("safe in-place updates" per its BUCKET_AUTHORITY note), plus dated snapshot Docs the same day (`_R3` … `_R6`, 04:52–05:00Z) and the 09-27 plain-text file. **Which node performs the in-place updates is not stated in the file.** | file header; Drive listing |
| Master format | Header block (notes, MISSION RULES, COUNTS, COLUMNS line), then rows grouped under `=== BUCKET (n) ===` headings. Row = `INV \| PRIMARY_ID \| COMPANY \| TITLE \| BUCKET \| DISPOSITION/RULE_OUTCOME \| TAGS \| REQ \| LOCATION \| SCOUT_ACTION`. SCOUT_ACTION holds a semicolon-delimited `KEY=value` payload. 496 rows have 10 cells, 30 have 11 (a pipe inside a value). | file export, all 526 data rows counted |
| Bucket authority | Header rule `BUCKET_AUTHORITY_2026-09-29`: the row BUCKET cell is authoritative; section headings "may lag during safe in-place updates and must not override the row BUCKET". Verified: 99 of 526 rows sit under a heading that does not match their BUCKET cell (e.g. Meta #398 under READY_TO_PURSUE but BUCKET=APPLIED; Cubic #202 under MANUAL_RESEARCH but BUCKET=DECLINED_BY_TIM). Heading counts also lag (`APPLIED (30)` vs COUNTS APPLIED=37). | file export, computed |
| Bucket vocabulary (current) | READY_TO_PURSUE 23, DECLINED_BY_TIM 281, MANUAL_RESEARCH 8, BLOCKED 3, TIM_DECISION_REQUIRED 0, APPLIED 37, REJECTED_BY_EMPLOYER 8, DUPLICATE 49, CLOSED_DEAD 117. Total 526. **COVERAGE and REJECTED are deprecated** (header note `DECLINED_BY_TIM_STATE_SEMANTICS_2026-09-29`). | COUNTS line; per-row BUCKET tally matches COUNTS exactly |
| Payload keys present on every row | `DATE_ADDED` (526; values are ISO dates or `PRE-EXISTING / EXACT DATE NOT ESTABLISHED` on 197 rows), `NOTIFICATION_SOURCE` (526; LinkedIn 250, Scout/ATS 101, Indeed 79, Glassdoor 49, Ladders 18, ZipRecruiter 9, email 13, other 1). | file export, counted |
| Other payload keys | `DECLINE_REASON_CODE` / `DECLINE_REASON_TEXT` / `REOPEN_TRIGGER` (281 each; codes: LEGACY_REASON_NEEDS_NORMALIZATION 195, PAY_BELOW_FLOOR 52, GEOGRAPHY_GATE_FAIL 11, FIT_TOO_WEAK 10, DOMAIN_MISMATCH 7, and five rarer), `FLEX` 133, `SALARY_BASE_EST` 93, `DEGREE_REQ` 91, `SALARY_BASIS` 81, `SALARY_CONF` 76, `ANTI_RESURRECTION` 42, `BLOCKER` 27, `APP_STATUS_CHECK` 25, `TIM_DISPOSITION` 16, `RESOLUTION_NOTE` 14, `VERIFY_LATER` 13, `APP_STATUS_EVIDENCE` 12, `APP_DATE` 8, plus the SALARY_* audit family. | file export, counted |
| Export encoding | The Doc's `text/plain` export contains **no** backslash escapes. The Drive connector's "natural language" rendering of the same Doc contains 553 `\_` sequences. Any consumer must use the raw text export (Apps Script `getBody().getText()` or `export?format=txt`), never a markdown-style rendering. | both retrieved and diffed |
| Cutover map | `MASTER_TABLE_CUTOVER_MAP_2026-09-29` still names the 09-27 plain-text file as the master and lists DISCOVERED_AT, BLOCKER, APPLIED_AT among missing fields. The live master now carries `DATE_ADDED`, `BLOCKER`, `APP_DATE`. **The cutover map is behind the live file.** (Foreman artifact; flagged, not edited here.) | both files |
| Authority model | One job = one canonical row = one current state. APPLY NOW, NEEDS ACTION, PIPELINE, CLOSED are derived views. Protected: APPLICATION_STATUS, LIVENESS, CANONICAL_ID/REQ_ID binding, terminal suppression, duplicate identity. Tim explicit ruling may override any state. | Directive §1, §6; Cutover Map §7 |
| Governance files | Versioned by creating a new file, never editing in place: `TIM_APPROVED_SEARCH_RULES_v1..v4` (v4 = `1dZjUsh_waXWzdEaTDMasTgcXjEhlQbyd`), `FORGE_AMENDMENT_*`, `GROK_SCOUT_OPERATING_RULES_v*`, `SCOUT_FORCE_PACK_*`. Load newest by createdTime (rules §7). | rules v4 §7; Drive listing |
| Salary / geo floors | Prose and one markdown table in rules v4: §1A gated bands (Band 1 CA/OR/WA + NE nine, base midpoint ≥ $400k; Band 2 MI + Chicago metro/NW IN + WI + MN, ≥ $300k; both AND FLEX=Yes AND FIT>75), §1 driving-mile rings from Cleveland TN ($180k / $190k / $200k), FL flat $210k. Scoring penalties in `FOREMAN_NOTICE_JOB_PIPELINE_SCORING_2026-08-26`. | rules v4; notice |

**Inference:** the master is a machine-maintained text document with a stable name and frequent in-place edits by an unnamed node. Anything the app writes into it directly will be overwritten. Anything the app reads must trust row cells, not headings.

---

## 2. Goals and non-goals

**Goals**
1. Tim can see the whole master at a glance, filter and sort any real or payload column, and find APPLY NOW and new rows without scrolling.
2. (Step 3, gated) Tim can attach a note or a status ruling to a row from phone or desktop, and it lands in the master with provenance.
3. Nothing the app does creates a competing state store or violates the protected-state model.

**Non-goals**
- No discovery, research, ranking, or emailing. Those stay with Forge, Scout, Foreman.
- No charts. Tables and counts only.
- No accounts. Single user.
- No rewrite of the existing cockpit. See §9 Q3 for its fate.
- **Not in v1:** governance editor, floors-as-data, config-as-governing-file, walk-away evaluator. Kept in this document as later phases so the column model anticipates them.

---

## 3. Data contract

### 3.1 Read

**Resolution rule.** Query `AI_Coordination` for files whose title starts with `V2_CURRENT_POPULATION`, any MIME type (Google Doc or plain text). If a title contains `_MASTER`, take the most recently modified such file. Otherwise take the most recently modified match. Never pin an ID. Show the chosen file's title, ID and modifiedTime in the status line so a wrong pick is visible.

**Fetch.** Raw text: Doc export as `text/plain`, or file download for plain text. Never the connector's markdown rendering.

**Parser contract.**
1. Split into header block and body at the first `====` rule line. Parse `COUNTS:` and `COLUMNS:` from the header.
2. A data row is a line matching `^\d+ \| `. Section headings (`=== X (n) ===`) are recorded as `SECTION` for reporting only.
3. Split each data row into **the first nine cells on ` | `; everything after the ninth separator is the payload**, pipes included. This handles the 30 eleven-cell rows without guessing.
4. Payload: split on `; ` into `KEY=value` pairs; a segment without `=` is appended to the previous value. The leading free text before the first `KEY=` is `SCOUT_ACTION`. Unknown keys become virtual columns too, and are always visible in the row drawer.
5. **Row BUCKET is authoritative.** SECTION is shown as a separate column and never used for counts, sorting, or presets.
6. Rows the parser cannot split into nine cells are kept, shown with a parse-error flag, and listed in the data-quality report. **No row is ever hidden by the parser.**
7. Computed columns (render time only, never written): COMP_MID (from posted range or estimate), FLOOR_RESULT (band/ring/FL test per rules §1A/§1), DAYS_SINCE_SALARY_ASOF, DAYS_SINCE_FLEX_ASOF, IS_NEW (§4.2), SECTION_MISMATCH (SECTION ≠ BUCKET).
8. Checksum: per-bucket counts from row cells compared to the COUNTS line; any mismatch is shown in the status line in red. Heading counts are ignored.

**Also read (step 2+):** newest `TIM_APPROVED_SEARCH_RULES_v*` for the floors table (read-only), and the `TIM_WRITES_LEDGER` (step 3).

**Fixture.** A copy of the current master export is committed to the repo as a test fixture so the parser can be regression-tested offline. (Contains application history; confirm Tim is comfortable with it in a public repo, else keep it out and test against paste only. See §9 Q4.)

### 3.2 Write (Tim only, step 3, gated)
See §5.

### 3.3 Structured master later
If Foreman's cutover moves the master to a Sheet or CSV, the parser gains a second backend and the UI does not change. Not proposed here.

---

## 4. Main view: the grid

### 4.1 Layout
Full-width table, sticky header, frozen COMPANY and BUCKET columns, horizontal scroll. Row height ~22 px, 11 px text, monospace for IDs, dates, money. 35–40 rows visible on a laptop. Column set comes from a config (§6.4), desktop set and phone set. Status line always visible: file title, ID, modifiedTime, row count, checksum result.

### 4.2 Default ordering
1. BUCKET order (editable in config): READY_TO_PURSUE, TIM_DECISION_REQUIRED, BLOCKED, MANUAL_RESEARCH, APPLIED, REJECTED_BY_EMPLOYER, DECLINED_BY_TIM, DUPLICATE, CLOSED_DEAD.
2. Within bucket: `DATE_ADDED` descending. Rows whose DATE_ADDED is `PRE-EXISTING ...` sort last. IS_NEW = DATE_ADDED within the last N days (default 3, adjustable). No local-storage tracking.
3. Then `SALARY_ASOF` / `FLEX_ASOF` descending.
Clicking any header overrides; "reset" returns to priority order.

### 4.3 Per-column filters and presets
- Enum columns (BUCKET, DISPOSITION, FLEX, SALARY_CONF, SALARY_BASIS, NOTIFICATION_SOURCE, DECLINE_REASON_CODE, FLOOR_RESULT, SECTION): checkbox list of observed values with counts.
- Text columns: contains / not-contains. Money and date columns: min/max.
- Active filters as removable chips. Filter, sort and column set live in the URL hash so a view can be bookmarked or pasted to a node.
- **Presets are saved filter sets.** Their predicates are written here so they can be reviewed:
  - **APPLY NOW (proposed predicate, Tim to accept or replace):** `BUCKET = READY_TO_PURSUE AND FLOOR_RESULT = PASS AND FLEX ≠ NO AND FLEX ≠ STRICT_NO AND no BLOCKER key AND no ANTI_RESURRECTION key`. Liveness is not a column yet, so it cannot be in the predicate until it is.
  - **NEW:** IS_NEW = true, any bucket except DUPLICATE and CLOSED_DEAD.
  - **NEEDS ACTION:** BUCKET in (TIM_DECISION_REQUIRED, BLOCKED, MANUAL_RESEARCH) OR VERIFY_LATER present.
  - **PIPELINE:** BUCKET = APPLIED.
  - **DECLINED:** BUCKET = DECLINED_BY_TIM, grouped by DECLINE_REASON_CODE.
  - **CLOSED:** BUCKET in (REJECTED_BY_EMPLOYER, DUPLICATE, CLOSED_DEAD).

### 4.4 Row detail drawer
Tap or click a row: right-side drawer on desktop, full-screen sheet on phone. Shows every real and payload field, SECTION vs BUCKET if they differ, and verified links only (same `^https?://` test the cockpit uses).

**Notes and quick rulings (step 3 only).** Each ruling is one ledger event and maps to current semantics:

| Button | Ledger FIELD → VALUE | Required extra fields |
|---|---|---|
| Applied | BUCKET → APPLIED; DISPOSITION → RESOLVED/APPLIED_CONFIRMED | APP_DATE (default today), APP_STATUS_EVIDENCE (free text) |
| Rejected by employer | BUCKET → REJECTED_BY_EMPLOYER | evidence text |
| Decline | BUCKET → DECLINED_BY_TIM; DISPOSITION → RESOLVED/DECLINED_BY_TIM | DECLINE_REASON_CODE (pick from observed codes), DECLINE_REASON_TEXT, REOPEN_TRIGGER (default "Tim explicitly overrides.") |
| Close dead | BUCKET → CLOSED_DEAD; DISPOSITION → RESOLVED/TIM_DISPOSITION | TIM_DISPOSITION text |
| Needs my decision | BUCKET → TIM_DECISION_REQUIRED | note |
| Note only | TIM_NOTES append | note |

Every ruling shows a confirm step with the exact fields it will write, and a 30-second undo that deletes the ledger row before any node can read it. "Kill req" and "Snooze" from v0.1 are removed: no first-class field exists for them.

---

## 5. Write path and multi-AI safety (step 3, gated)

### 5.1 The problem
The master is edited in place by a node that the file does not name, and rebuilt as dated snapshots. A column Tim edits directly is lost on the next rebuild unless the rebuilding node carries it forward. The master also contains Gmail message IDs and application history, so it must stay private; the cockpit's public-link fetch is not acceptable for it.

### 5.2 Precondition (hard gate)
**No ledger, no rulings, no notes are built until (a) Tim names exactly one node as the master regenerator/updater and (b) the merge rule below is in the newest `TIM_APPROVED_SEARCH_RULES` or an amendment.** "Any node that regenerates" is not enforceable. Without a single named writer, a ledger becomes a third store that nodes treat as optional.

### 5.3 Mechanism (once gated)
1. **Apps Script web app**, executed as Tim, files stay private. Endpoints in v1: `getMaster`, `getFile(pattern)`. Endpoints added in step 3: `appendLedger(event)`, `deleteLedgerEvent(id)` (for undo, within 30 s only). **No `saveVersionedFile` endpoint** (see §6.5). Shared secret stored in the browser after Tim enters it once. Alternative: Netlify function + service account.
2. **`TIM_WRITES_LEDGER`** (Sheet or text, append-only): `EVENT_ID | TS_UTC | PRIMARY_ID | COMPANY | FIELD | VALUE | NOTE | SOURCE=PIPELINE_EXPLORER | APPLIED_TO_MASTER`.
3. **Immediate overlay:** unapplied events are overlaid on the grid at load, so Tim sees his ruling before any node runs.
4. **Merge rule (proposed governance text):** "The named master updater MUST read `TIM_WRITES_LEDGER` at the start of every update, apply each event with blank APPLIED_TO_MASTER to the matching PRIMARY_ID, write TIM_NOTES text verbatim into the row payload as `TIM_NOTES=`, apply status rulings as Tim explicit rulings with `STATE_SOURCE=TIM_LEDGER:<EVENT_ID>`, and mark the event applied. An update that drops an existing TIM_NOTES value is a defect."
5. **Reconciliation report (§6.2):** every applied event whose value is missing from the current master is listed. It makes a clobber visible; it cannot prevent one.

### 5.4 What the app never does
Never rewrites the master. Never writes on behalf of a node. Never changes BUCKET or DISPOSITION itself; it records Tim's ruling and the named updater applies it. Never creates a row; a missing opportunity becomes a ledger note "Tim reports X, please upsert" for Scout. Never reads the 455-row Applicant Status Ledger as live state.

---

## 6. Tabs

### 6.1 PIPELINE — the grid (§4). Step 1.

### 6.2 REPORTS — step 2. Plain tables over the parsed master.
Counts per bucket vs COUNTS line; section-vs-bucket mismatches (99 today); aging by SALARY_ASOF / FLEX_ASOF with SALARY_EXPIRES flags; floor check per active row with first-failing gate in rules §1A order; data quality (parse errors, 11-cell rows, unknown keys, rows with no REQ and no URL, duplicate PRIMARY_IDs); DECLINED_BY_TIM by reason code, with the 195 `LEGACY_REASON_NEEDS_NORMALIZATION` rows called out; ledger reconciliation (§5.3 item 5, step 3).

### 6.3 SALARY FLOORS — step 2, **read-only in v1.**
Renders bands, rings, FL override and scoring penalties parsed from the newest rules file. No editing. Floors-as-data (`COMP_FLOORS_*`) is deferred until a node is required to load such a file; two floor sources with optional readers is worse than prose.

### 6.4 COLUMNS — step 1, local.
Column visibility, order, width, desktop vs phone set, enum display order. Stored in the URL hash and browser storage. Promotion to a Drive governing file is deferred until a node must share the enum vocabulary.

### 6.5 GOVERNANCE — **not in v1.**
A browser page with a shared secret that can mint the next `TIM_APPROVED_SEARCH_RULES_vN` is a governing-file publisher behind weak auth. Deferred until there is real authentication. In v1 the tab only lists governance files by prefix, newest first, with createdTime, and opens them read-only.

### 6.6 WALK-AWAY EVALUATOR — placeholder.
Inputs it will need, so columns exist now: LOCATION resolved to band / ring miles, COMP_LOW/HIGH/MID and confidence, FLEX, FIT, level, OEM package adders (rules §3). Not built.

---

## 7. Visual design
Pure black base, near-white text, two greys, 1 px hairlines, no gradients or animation. System sans for labels, monospace for data, uppercase micro-labels with 1.5 px tracking. One accent (§9 P1) for active tab, primary button, focused row, header rule. Status colors: green (READY_TO_PURSUE, APPLIED), red (REJECTED_BY_EMPLOYER, CLOSED_DEAD, BLOCKED), grey (DECLINED_BY_TIM, DUPLICATE, MANUAL_RESEARCH), accent for TIM_DECISION_REQUIRED. Corner brackets on the active panel, faint grid texture in the header band, monospace status line. 11 px body, 22 px rows; phone portrait 12 px with the phone column set.

---

## 8. Platform and delivery

- One HTML file, no framework, no build step, second page in this repo (`pipeline.html`) on the existing Netlify site. Cockpit untouched.
- **Size estimate, corrected:** step 1 (parser, grid, filters, sort, presets, drawer read-only, paste/drop, checksum) ≈ 1,200–1,600 lines. Steps 2–3 add roughly the same again. v0.1's 1,500–2,000 for everything was wrong.
- Offline fallback: paste or file drop of the master export.
- Mobile: same page; breakpoints switch the column set; filters become bottom sheets; drawer goes full-screen. Landscape phone fits about eight dense columns. Portrait: narrow table, COMPANY + BUCKET frozen.

**Build order (ship gates):**

| Step | Ships | Does not ship |
|---|---|---|
| 1 | Parser + grid + filters + sort + presets + drawer (read) + paste/drop + checksum + fixture | Any backend, any write |
| 2 | Apps Script `getMaster` / `getFile`, secret gate, status line, Reports, Salary Floors (read-only) | `appendLedger`, any governance write |
| 3 | Ledger, notes, rulings with confirm/undo, reconciliation — **only after §5.2 gate** | Governance editor, floors-as-data, config-as-governing-file |
| Later | Walk-away evaluator, governance editing behind real auth, structured master backend | |

Step 1 alone replaces the stale cockpit feed as the way to see the master, and can be validated against the committed fixture with no Drive access.

---

## 9. Open decisions for Tim

**Architecture (block step 2 or 3):**

| # | Question | Reviewer recommendation (Grok, 09-29) | Claude position |
|---|---|---|---|
| A1 | Write mechanism: Apps Script + shared secret vs Netlify function + service account | Apps Script, execute-as-Tim | Agree |
| A2 | Name exactly one node as master updater, and adopt the §5.3 merge rule | Yes, but only after naming the regenerator | Agree; this is the §5.2 gate |
| A3 | Floors as a machine-readable file | No for v1; read-only tab | Agree |
| A4 | Column config as a Drive governing file | Local/hash first | Agree |
| A5 | APPLY NOW predicate | Write it in one sentence before any preset is built | Proposed in §4.3; needs Tim's accept/replace |
| A6 | Sheet/CSV migration timing | Not now; viewer first | Agree |
| Q3 | Does the cockpit page (calendar/tasks/nodes) stay as a separate page, or is it retired once the explorer ships? | — | Keep both until the explorer has run for a week; then decide |
| Q4 | May a copy of the master export be committed to this public repo as a parser fixture (it contains Gmail IDs and application history)? | — | Recommend **no**; use a scrubbed 20-row fixture instead |

**Paint (do not block anything):**

| # | Question | Reviewer recommendation | Claude position |
|---|---|---|---|
| P1 | Accent color | Cyan (matches cockpit edge) | Either; gold ties to Torque, cyan ties to cockpit |
| P2 | Portrait phone | Narrow table, COMPANY + BUCKET frozen | Agree |

---

## 10. Risks and weak assumptions
- **Unnamed updater.** Multiple snapshots in one day and in-place edits by an unspecified node. Until A2 is settled, no write path is safe. Step 1 has no exposure to this.
- **Parser fragility.** Hand-shaped text with pipes inside values, headings that lag, and 197 rows with no real DATE_ADDED. The parser must never drop rows; the data-quality report must surface what it could not read.
- **Cutover map drift.** The Foreman cutover map describes a file that is no longer the master. Any node following it literally loads the wrong file.
- **Public site + shared secret** is acceptable for read and for an append-only ledger. It is not acceptable for governance writes; hence §6.5.
- **Fixture privacy.** See Q4.
- **What I read:** the full text export of the live master was decoded and counted programmatically (row count, cell distribution, bucket tally, key frequencies, section mismatches). I did not read every row's prose.

---

## 11. Change record
- 2026-09-29 v0.1 — Created by Claude. Sources: repo `index.html`, `netlify/functions/feed.js`; Drive: directive, cutover map, Forge Amendment 55, scoring notice, rules v4, `V2_CURRENT_POPULATION_2026-09-27.txt` (header + sampled rows). No Drive files modified, no code.
- 2026-09-29 v0.2 — Revised by Claude after Grok's review (relayed by Tim). Verified against `V2_CURRENT_POPULATION_MASTER.txt` (ID `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`, modified 20:41Z) by full text export: 526 rows, bucket vocabulary, payload keys, 99 section/bucket mismatches, export encoding. Sections 1, 3.1, 4.2–4.4, 5, 6.3–6.5, 8, 9, 10 rewritten. No Drive files modified, no code.

---

## 12. Response to Grok's review (2026-09-29)

Accepted and applied: stale §1 facts; bucket vocabulary; DATE_ADDED instead of local storage; row BUCKET over section; nine-cells-plus-payload parser rule; never hide unparsed rows; §5.5 citation; line estimate; governance editor out of v1; floors-as-data deferred; config local first; single named regenerator as a gate; APPLY NOW predicate written out; rulings mapped to current semantics with confirm and undo; Kill/Snooze removed; ship-gate table.

Verified with a correction: the `\_` escape issue exists only in the Drive connector's markdown-style rendering (553 occurrences). The Doc's raw `text/plain` export has none. The brief now requires the raw export, which resolves it without a parser workaround.

Nuance: "R2–R6 plus MASTER in one day, regeneration sloppy." The R3–R6 snapshots were written in an eight-minute window at 04:52–05:00Z, consistent with one run producing revisions; the MASTER Doc was then created at 16:54Z and edited in place through 20:41Z, and its header declares the in-place regime. That is more orderly than "sloppy", but the reviewer's underlying point stands: the file does not say who edits it, so A2 must be settled before any write path.

Not adopted: the accent-color recommendation is recorded as a reviewer preference in §9 P1, not a decision. Reviewer list unchanged; who reviews UI is Tim's call.
