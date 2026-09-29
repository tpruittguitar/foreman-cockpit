# PIPELINE EXPLORER — DESIGN BRIEF v0.1

**Date:** 2026-09-29
**Author:** Claude (Foreman node), from Tim's spec in this session
**Status:** PROPOSAL FOR REVIEW. No code written. No Drive files changed. Nothing in this brief is authorized until Tim rules on the open decisions in §9.
**Reviewers:** Tim (final authority), ChatGPT / Forge, Grok / Scout
**Repo:** tpruittguitar/foreman-cockpit (this file lives at `docs/PIPELINE_EXPLORER_DESIGN_BRIEF.md`)

---

## 0. One-paragraph summary

A single-file web app, hosted next to the existing Foreman Cockpit, that opens the canonical master job table from Drive as a dense, spreadsheet-style grid: every column, per-column dropdown filters and sorting, APPLY NOW and new discoveries at the top. Tabs give Reports, Salary Floors, Columns, Governance, and a future Walk-Away Evaluator. Tim's notes and quick status actions are written back through a small Apps Script endpoint. Visual style is minimal, black, dense, Anduril / Shield AI in spirit. One codebase for desktop and phone (landscape). The app is a **derived view and a Tim-write channel**; it never becomes a second state store. That last sentence is the whole design constraint, and it comes from `TIM_DIRECTIVE_MASTER_JOB_TABLE_SINGLE_SOURCE_2026-09-29`.

---

## 1. What exists today (facts, verified this session)

| Item | Fact | Source |
|---|---|---|
| Cockpit app | Single `index.html` on Netlify. Reads one public Google Doc as text through `netlify/functions/feed.js`, parses `[SECTION]` blocks of pipe-delimited rows. Read-only; paste fallback. Mobile CSS present. | repo |
| Cockpit feed | `COCKPIT_FEED_v2` Doc ID `16d2Ugupvf-kG0izs_3enct7X5PZSs3NoBZdFCwnP4OA`, last modified 2026-08-11. **Stale by seven weeks.** | Drive metadata |
| Canonical master | `V2_CURRENT_POPULATION_2026-09-27.txt`, Drive ID `1t61iHuOOorGZ11hLM4oI0MRhDukwI700`, parent `AI_Coordination`, plain text, 148,785 bytes, 487 rows. | MASTER_TABLE_CUTOVER_MAP_2026-09-29; file read |
| Master format | Header block (notes, MISSION RULES, COUNTS, COLUMNS line), then rows grouped under `=== BUCKET (n) ===` headers. Rows are `INV | PRIMARY_ID | COMPANY | TITLE | BUCKET | DISPOSITION/RULE_OUTCOME | TAGS | REQ | LOCATION | SCOUT_ACTION`. The SCOUT_ACTION cell carries a semicolon-delimited `KEY=value` payload (SALARY_BASE_EST, SALARY_BASIS, SALARY_CONF, SALARY_ASOF, SALARY_ANCHORS, SALARY_REASON, SALARY_EXPIRES, SALARY_AUDIT, SALARY_SOURCE, DEGREE_REQ, FLEX, FLEX_BASIS, FLEX_ASOF, APP_STATUS_CHECK, and others). 457 rows have exactly 10 cells; 31 have 11 because a value contains a pipe. | file read (header + sampled rows; not every row was read) |
| Master identity | The master is **regenerated as a new file with a new ID** on each rebuild (the 09-27 file supersedes a 09-23 file). Any consumer must resolve "newest file matching `V2_CURRENT_POPULATION_*` in AI_Coordination", never a pinned ID. | master header |
| Buckets present | BLOCKED 5, READY_TO_PURSUE 20, MANUAL_RESEARCH 97, COVERAGE 203, APPLIED 11, REJECTED 2, DUPLICATE 49, CLOSED_DEAD 100. TIM_DECISION_REQUIRED 0. | master COUNTS line |
| Authority model | One job = one canonical row = one current state. APPLY NOW, NEEDS ACTION, COVERAGE, PIPELINE, CLOSED are **derived views**, not stores. Protected state: APPLICATION_STATUS, LIVENESS, CANONICAL_ID/REQ_ID binding, terminal suppression, duplicate identity. Tim explicit ruling may override any state. | Directive §1, §6; Cutover Map §7 |
| Fields the cutover map says are missing as first-class columns | LIVENESS, APPLICATION_STATUS (normalized), JOB_URL, FIT, FLOOR_RESULT, BLOCKER, NEXT_ACTION, OWNER, DISCOVERED_AT, LAST_RESEARCHED_AT, APPLIED_AT, STATE_UPDATED_AT, STATE_SOURCE, RANK_SCORE, RANK_REASON, RANKED_AT. Cutover map recommends adding them "if the master is later migrated to structured CSV/Sheet form". | Cutover Map §4 |
| Governance files | Versioned by **creating a new file**, never editing in place: `TIM_APPROVED_SEARCH_RULES_v1..v4` (v4 = `1dZjUsh_waXWzdEaTDMasTgcXjEhlQbyd`, markdown in a .md text file), `FORGE_AMENDMENT_*`, `GROK_SCOUT_OPERATING_RULES_v*`, `SCOUT_FORCE_PACK_*`. Load order is "newest by createdTime" per rules §7. | rules v4 §7; Drive listing |
| Salary / geo floors | Live as prose and one markdown table inside the rules file: §1A gated bands (Band 1 CA/OR/WA + NE nine, base midpoint ≥ $400k; Band 2 MI + Chicago metro/NW IN + WI + MN, ≥ $300k; both AND FLEX=Yes AND FIT>75), §1 driving-mile rings from Cleveland TN ($180k / $190k / $200k), FL flat $210k. Scoring penalties in `FOREMAN_NOTICE_JOB_PIPELINE_SCORING_2026-08-26` (West Coast −20, FLEX:no −20, NE −7, +24 FLEX bonus after adjusted base ≥ 80). | rules v4 §1A, §1; notice |

**Inference from the above:** the master is a machine-regenerated text report, not a database. Any app that writes into it directly will be clobbered by the next regeneration unless the regenerating node is told to carry the app's columns forward. That drives §5.

---

## 2. Goals and non-goals

**Goals**
1. Tim can see the whole master at a glance, filter and sort any column, and find APPLY NOW / new rows without scrolling.
2. Tim can attach a note or a status ruling to a row from phone or desktop in under ten seconds, and it lands in the master with provenance.
3. Governance and floor changes Tim makes in the app become new versioned governance files the nodes already know how to load.
4. Nothing the app does creates a competing state store or violates the protected-state model.

**Non-goals (v1)**
- No discovery, research, ranking, or emailing. Those stay with Forge, Scout, Foreman.
- No charts. Row count is ~500; tables and counts are enough.
- No accounts or multi-user. Single user, Tim.
- No rewrite of the existing cockpit. It keeps running until the new app supersedes it.

---

## 3. Data contract

### 3.1 Read
- **Source of truth:** newest `V2_CURRENT_POPULATION_*` (or whatever the master is renamed to after cutover) in `AI_Coordination`, resolved by name pattern and createdTime, never by pinned ID.
- **Parser (v1):** reads the existing text format as-is. Splits header vs. bucket sections, splits rows on ` | ` with a guard for the 11-cell rows, explodes the `KEY=value;` payload into virtual columns. Every virtual column is filterable and sortable like a real one.
- **Derived columns computed at render time, never written back:** COMP_MID (from posted range or estimate), FLOOR_RESULT (band/ring test per rules §1A/§1), DAYS_SINCE_SALARY_ASOF, DAYS_SINCE_FLEX_ASOF, IS_NEW (see §4.2), TIM_NOTE (joined from the ledger, §5).
- **Also read:** newest `TIM_APPROVED_SEARCH_RULES_v*`, newest `FORGE_AMENDMENT_*`, the app's own `PIPELINE_EXPLORER_CONFIG_*` (column config, §6.4) and `COMP_FLOORS_*` (§6.3) if Tim adopts them, and the `TIM_WRITES_LEDGER` (§5).
- **Status line:** master file name, ID, modifiedTime, row count, and per-bucket counts checked against the file's own COUNTS line. A mismatch is shown in red; the app never silently trusts either number.

### 3.2 Write (Tim only)
See §5. Summary: append-only ledger keyed by PRIMARY_ID, overlaid immediately in the UI, merged into the master by the regenerating node under a governance rule.

### 3.3 Phase 2 option: structured master
The cutover map already anticipates a CSV/Sheet master. If Tim and Foreman make that move, the parser gains a second backend (CSV export of the Sheet), the virtual columns become real columns, and direct cell writes by PRIMARY_ID become possible. The UI does not change. **This brief does not propose the migration; it only keeps the door open.**

---

## 4. Main view: the grid

### 4.1 Layout
- Full-width table. Sticky header row. Frozen first column (COMPANY). Horizontal scroll for the rest.
- Row height ~22 px, 11 px text, monospace for IDs, dates, money. Target 35–40 rows visible on a laptop.
- Every real and virtual column available. Column set shown by default comes from the Columns config (§6.4), with a desktop set and a phone set.
- Header status line (§3.1) always visible.

### 4.2 Default ordering ("Apply now and new discoveries near the top")
Priority sort, in this order, all editable in the config:
1. BUCKET order: READY_TO_PURSUE, TIM_DECISION_REQUIRED, BLOCKED, MANUAL_RESEARCH, COVERAGE, APPLIED, REJECTED, DUPLICATE, CLOSED_DEAD.
2. Within bucket: IS_NEW first. **Constraint:** the master has no DISCOVERED_AT column today (Cutover Map §4). Until it exists, IS_NEW is approximated as "PRIMARY_ID not present in the previous master file the app saw" (the app keeps the last-seen ID set in local storage and in the ledger). This is an approximation and is labeled as such in the UI.
3. Then SALARY_ASOF / FLEX_ASOF descending as a freshness proxy.
Clicking any header overrides the sort; a "reset" control returns to priority order.

### 4.3 Per-column filters
- Enum-type columns (BUCKET, DISPOSITION, FLEX, SALARY_CONF, SALARY_BASIS, FLOOR_RESULT, state tags): checkbox list of observed values, with counts.
- Text columns (COMPANY, TITLE, LOCATION, REQ, TAGS, notes): contains / not-contains.
- Money and date columns: min/max range.
- Active filters render as removable chips above the grid. Filter + sort + column set are encoded in the URL hash so a view can be bookmarked or pasted to a node ("here is the exact view I am looking at").
- Presets matching the directive's derived views: APPLY NOW, NEEDS ACTION / NEEDS RESOLUTION, COVERAGE, PIPELINE (APPLIED + INTERVIEW + OFFER), CLOSED / ARCHIVE. Presets are just saved filter sets, so they can never drift from the master.

### 4.4 Row detail drawer
- Tap or click a row: right-side drawer on desktop, full-screen sheet on phone.
- Shows every field including the full SALARY_* and FLEX_* payload, APP_STATUS_CHECK, and the verified links (same `^https?://` test the cockpit uses; anything else shows "no verified link").
- **Notes:** existing TIM_NOTE history, plus a textarea that appends a timestamped line.
- **Quick rulings (buttons):** Mark APPLIED, Mark REJECTED, Mark INTERVIEW, Mark OFFER, Mark WITHDRAWN, Set TIM_DECISION, Snooze N days, Kill req. Each writes one ledger event (§5). These are Tim explicit rulings and are therefore permitted to touch protected state per Cutover Map §7.

---

## 5. Write path and multi-AI safety

### 5.1 The problem
The master is rebuilt wholesale by a node. A column Tim edits in place is lost on the next rebuild unless every rebuild carries it forward. The master also contains Gmail message IDs and application history, so it must stay private; a public-link fetch like the cockpit's is not acceptable for this file.

### 5.2 Proposed mechanism
1. **Apps Script web app** deployed from Tim's account (runs as Tim, files stay private). Endpoints: `getMaster` (resolves newest master by pattern, returns text + metadata), `getFile(pattern)` (newest governance/config file), `appendLedger(event)`, `saveVersionedFile(prefix, body)` (creates `PREFIX_vN_DATE`, never overwrites). Protected by a shared secret the page stores in local storage after Tim enters it once. Alternative: Netlify function + Google service account. Apps Script is less setup and needs no keys in Netlify; the service account is stronger if the secret model bothers Tim.
2. **`TIM_WRITES_LEDGER`** (Google Sheet or plain text, one row per event): `TS_UTC | PRIMARY_ID | COMPANY | FIELD | VALUE | NOTE | SOURCE=PIPELINE_EXPLORER | APPLIED_TO_MASTER=<master file name or blank>`. Append-only. Tim is the only writer.
3. **Immediate overlay:** the app reads the ledger on every load and overlays unapplied events on the grid, so Tim sees his ruling the instant he makes it, before any node has run.
4. **Merge rule for nodes (new governance line, needs Tim's ruling):** "Any node that regenerates the master MUST read `TIM_WRITES_LEDGER`, apply every event with blank APPLIED_TO_MASTER to the matching PRIMARY_ID, write the note text into the `TIM_NOTES` column verbatim, write status rulings into the row's state with `STATE_SOURCE=TIM_LEDGER:<ts>`, and mark the event applied. A regeneration that drops an existing TIM_NOTES value is a defect."
5. **Reconciliation report:** the app compares the ledger against the current master and lists any applied event whose value is missing from the master. That is the safety net against a node clobbering Tim's notes.

This satisfies "notes go into the main file in a column of its own" (TIM_NOTES, carried by the merge rule) while surviving regeneration and keeping Tim as the only direct writer to the ledger.

### 5.3 What the app never does
- Never rewrites the master file.
- Never writes on behalf of a node.
- Never changes a row's BUCKET or DISPOSITION by itself; it records Tim's ruling and lets the merge rule apply it.
- Never creates a second population. If the master lacks a row, the app cannot create one; it can only record a ledger note "Tim reports opportunity X, please upsert" for Scout.

---

## 6. Tabs

### 6.1 PIPELINE
The grid in §4. Default tab.

### 6.2 REPORTS
Plain tables, no charts. Each is a query over the parsed master and refreshes with it.
- Counts per bucket vs. the master's own COUNTS line (mismatch highlighted).
- Aging: rows by days since SALARY_ASOF / FLEX_ASOF; anything past SALARY_EXPIRES flagged.
- Floor check: every active row with COMP_MID, applicable floor (band/ring/FL), pass/fail, and the first-failing gate (`floor-400k`, `floor-300k`, `FLEX`, `fit<=75`), mirroring rules §1A ordering.
- Data quality: rows with values outside the config's allowed enums, rows with 11 cells, rows with no REQ and no URL, duplicate PRIMARY_IDs.
- Ledger reconciliation (§5.5).
- Node activity: last modifiedTime of the master and of each node's latest output file.

### 6.3 SALARY FLOORS
- Shows the floor model as structured data: bands (states, midpoint line, gates), rings (miles, floor), named-state overrides, scoring penalties and bonuses.
- **Governance decision required (§9):** today the floors are prose in the rules file, which the nodes parse as text. Editing structured floors in the app implies a machine-readable `COMP_FLOORS_vN_DATE.json` (or .md table) becoming the authority for numbers, with the rules file stating "floor values are defined in the newest COMP_FLOORS file; the tables here mirror it." Saving from the tab creates a new versioned file; it never edits v4 in place. Until Tim rules, this tab is read-only and just renders what it can parse out of rules v4.

### 6.4 COLUMNS
- Column list: key, label, type (text / enum / money / date / url / note), visible on desktop, visible on phone, width hint, allowed values for enums, owner (which node may write it; TIM_NOTES = Tim only).
- Saving creates `PIPELINE_EXPLORER_CONFIG_vN_DATE.json` in AI_Coordination. Nodes that want to validate their own output against the same enum vocabulary can load it; that is optional for them but is the point of "governing file".

### 6.5 GOVERNANCE
- Lists the governance files by prefix, newest first, with createdTime, so the load order in rules §7 is visible at a glance.
- Opens the newest of each in a plain text editor. Save = create next version (`_v5_2026-10-xx`), diff preview before save, and a required one-line change note that is prepended under a `CHANGES vs vN:` line the same way v4 does it. In-place overwrite is not offered.

### 6.6 WALK-AWAY EVALUATOR (future, placeholder tab)
Inputs it will need, so the columns exist from day one: LOCATION (resolved to band / ring miles), COMP_LOW / COMP_HIGH / COMP_MID and confidence, FLEX, FIT, level (Manager / Director / VP), OEM package adders (rules §3). Output: floor that applies, pass/fail, and a walk-away number = floor × level factor × fit adjustment, with the formula shown. Not built in v1.

---

## 7. Visual design

- **Base:** pure black (#000 or #050505). Text near-white (#e6e6e6), two greys for secondary and faint. 1 px hairlines (#1a1a1a). No gradients, no glow, no scan animation.
- **Type:** system sans for labels, monospace for data. Uppercase micro-labels with 1.5 px tracking for panel titles and column headers.
- **Accent:** exactly one. Options: Torque Explorer gold (#d9b52f) or a cold cyan (#42bce8). Used only for the active tab, primary button, focused row, and the header rule. **Decision in §9.**
- **Status colors:** green (positive: READY, APPLIED, INTERVIEW, OFFER), red (terminal negative: REJECTED, CLOSED_DEAD, BLOCKED), grey (COVERAGE, DUPLICATE, MANUAL_RESEARCH). No amber, so the accent never competes with a status.
- **Signature details:** thin corner brackets on the active panel, a faint 1 px grid texture in the header band, and a monospace status line (file, rows, sync time). That is most of what reads as Anduril / Shield AI without a design budget.
- **Density:** 11 px body, 10 px chips, 22 px rows on desktop. Phone landscape keeps the same sizes; phone portrait bumps to 12 px and shows the phone column set only.

---

## 8. Platform and delivery

- **One HTML file**, no framework, no build step, same pattern as the cockpit and Torque Explorer. Estimated 1,500–2,000 lines.
- **Where:** this repo, as a second page (for example `pipeline.html`) sharing the Netlify site. The existing cockpit is untouched.
- **Backend:** Apps Script per §5.2, or Netlify function + service account. No Google OAuth in the browser.
- **Offline fallback:** file drop / paste of the master text, same as today, so the app is useful even if the endpoint is down.
- **Mobile:** same page. Breakpoints switch the column set (from config), filter dropdowns become bottom sheets, drawer goes full-screen. Landscape phone (~800 px) fits about eight dense columns. Portrait shows the phone set with COMPANY frozen. No separate mobile code path.

**Build order (proposed):**
1. Parser + grid + filters + sort + presets, reading a pasted/dropped master. No backend. (This alone replaces the stale cockpit feed as a way to see the master.)
2. Apps Script `getMaster` / `getFile` and the status line.
3. Ledger + drawer + quick rulings + reconciliation report.
4. Governance tab with versioned save.
5. Columns config + Salary Floors (after §9 rulings).
6. Walk-Away Evaluator.

---

## 9. Open decisions for Tim

1. **Write mechanism:** Apps Script web app with shared secret (recommended) vs. Netlify function + service account.
2. **Merge rule:** adopt the §5.2(4) governance line requiring regenerating nodes to carry TIM_NOTES and apply the ledger. Without it, notes will not persist in the master.
3. **Floors as data:** authorize a machine-readable `COMP_FLOORS_*` file as the numeric authority (rules file mirrors it), or keep floors prose-only and make the Salary Floors tab read-only.
4. **Config file:** authorize `PIPELINE_EXPLORER_CONFIG_*` in AI_Coordination as a governing file nodes may read.
5. **Accent color:** gold or cyan.
6. **Portrait phone:** narrow table with phone column set (recommended) vs. card list.
7. **Master migration to Sheet/CSV:** not proposed here; if Foreman's cutover moves that way, the app follows. Confirm this sequencing is acceptable.

---

## 10. Risks and weak assumptions

- **Regeneration clobber** is the top risk. The ledger + merge rule + reconciliation report mitigate it, but only if every regenerating node honors the rule. The report makes violations visible; it cannot prevent them.
- **"New discoveries" is approximate** until DISCOVERED_AT exists in the master.
- **Parser fragility:** the master is a hand-shaped text report; 31 rows already break the 10-cell assumption. The parser must be defensive and the data-quality report must surface anything it could not parse rather than dropping it.
- **Apps Script secret model** is adequate for a personal tool but is not real auth. Anyone with the URL and the secret can append to the ledger. Rotate the secret if the page is ever shared.
- **Netlify site is public.** The page itself is fine to be public; the data is fetched only after the secret is entered. Confirm this is acceptable or add basic auth at Netlify.
- **I did not read every row of the master.** Structure claims are from the header, the COLUMNS line, bucket headers, and sampled rows across buckets.

---

## 11. Change record

- 2026-09-29 — Created by Claude in Claude Code session. Sources read: repo `index.html` and `netlify/functions/feed.js`; Drive: `TIM_DIRECTIVE_MASTER_JOB_TABLE_SINGLE_SOURCE_2026-09-29`, `MASTER_TABLE_CUTOVER_MAP_2026-09-29`, `FORGE_AMENDMENT_55_PIPELINE_V2_CUTOVER_2026-09-23`, `FOREMAN_NOTICE_JOB_PIPELINE_SCORING_2026-08-26`, `TIM_APPROVED_SEARCH_RULES_v4_2026-09-21.md`, `V2_CURRENT_POPULATION_2026-09-27.txt` (header and sampled rows). No Drive files were modified. No app code was written.
