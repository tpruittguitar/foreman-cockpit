# PIPELINE EXPLORER — DESIGN BRIEF v0.5

**Date:** 2026-09-30 (v0.1–v0.3 on 2026-09-29; v0.4 second-round corrections; v0.5 adds the non-interference rule from Tim)
**Author:** Claude (Foreman node), from Tim's spec in this session
**Status:** PROPOSAL FOR REVIEW. No code written. No Drive files changed. **v1 is read-only.** Nothing is authorized until Tim rules on §9. Merging this PR files the proposal; it does not authorize a build.
**Reviewers:** Tim (final authority), ChatGPT, Grok
**Repo:** tpruittguitar/foreman-cockpit (`docs/PIPELINE_EXPLORER_DESIGN_BRIEF.md`)

**What changed in v0.5 (Tim's instruction, 2026-09-30).** Tim: "Make sure the AI schedules and automation work continue like designed. This is just a viewer and analysis and management tool for their work." That is now §2.1, a hard rule above every other section. Two proposals that would have asked the pipeline to change its output are withdrawn as requests (SCHEMA header line, canonical APPLY_NOW field); the app adapts to whatever the pipeline produces. Manual refresh only, no polling. Reads are confirmed not to touch the master's modifiedTime, which the writers' concurrency protocol depends on.

**What changed in v0.4 (targeted; no redesign).** NEEDS ACTION no longer includes `VERIFY_LATER` (§4.3). Salary Floors tab deferred; the app shows row-level `FLOOR_STATUS` where the master carries it and never presents a reconstructed floor table as authoritative (§6.3). SCHEMA line fields revised for the fixed-ID, in-place regime (§3.4). PIPELINE preset verified against where interview and offer states actually live (§4.3). Active predicate shown in the status line. Undo window for v2 requests changed to "until the writer picks it up" (§5.3). Two fixture cases added (§3.1). Both reviewers state v0.3 architecture is acceptable for Step 1 with these edits; **Tim has not yet ruled.**

**What changed in v0.3.** (1) Master identity is a **fixed Drive ID by Tim's ruling** (`MASTER_TABLE_CUTOVER_IMPLEMENTATION_2026-09-29_REV2`), not "newest file matching a pattern". v0.2 had that wrong; Grok's review endorsed the same wrong rule; ChatGPT's "resolve per the governing directive, not filename age" was right. (2) The write channel is rebuilt on **FORGE_AMENDMENT_58** (STATE_CHANGE_REQUEST to an Authorized State Writer, with receipt), replacing the v0.2 ledger-plus-merge-rule entirely. (3) v1 is read-only: no notes, no rulings, no ledger. (4) Backend adapter and a schema-version line proposed (§3.3, §3.4). (5) APPLY NOW predicate reduced to canonical state only, every term labeled with its source (§4.3). (6) Open NEEDS-TIM items #90 and #92 from the cutover doc are cited where they bind this design.

---

## 0. One-paragraph summary

A single-file web app, hosted next to the existing Foreman Cockpit, that opens the canonical master job table from Drive as a dense, spreadsheet-style grid: every column, per-column dropdown filters and sorting, APPLY NOW and new rows at the top, row detail, integrity checks. Later, a channel for Tim's notes and status rulings that emits STATE_CHANGE_REQUEST records for the pipeline's Authorized State Writer. The visual style is minimal, black, dense. One codebase for desktop and phone (landscape). The app is a **derived view** of one fixed master and, later, a **request generator**; it never mutates canonical state and never becomes a second store.

---

## 1. What exists today (facts, verified 2026-09-29 ~23:10 UTC)

| Item | Fact | Source |
|---|---|---|
| Cockpit app | Single `index.html` on Netlify. Reads one public Google Doc as text through `netlify/functions/feed.js`. Read-only; paste fallback. Ops board, not a master viewer. | repo |
| Cockpit feed | Doc `16d2Ugupvf-kG0izs_3enct7X5PZSs3NoBZdFCwnP4OA`, last modified 2026-08-11. Stale seven weeks. | Drive metadata |
| **Canonical master: fixed ID** | `V2_CURRENT_POPULATION_MASTER.txt`, **Google Doc**, ID `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`, parent `AI_Coordination`. Tim's ruling of 2026-09-29: "ONE FIXED CANONICAL MASTER FILE, ONE FIXED DRIVE ID, UPDATED IN PLACE." "No resolve-which-file-is-newest step." Pattern-based resolution is **RETIRED — DO NOT FOLLOW.** | Cutover REV2 §1 |
| Master seed and drift | Seeded 16:54Z as a byte-identical copy of `_R6` (515 rows). Modified in place through 20:41Z; now 526 rows with a header naming itself `_R6 (reconciled ...)`. The file deliberately carries **no provenance wrapper**; provenance lives in the cutover document. | Cutover REV2 §1; file export |
| Who edits in place | Amendment 58 defines an **Authorized State Writer** by capability (mutate Drive state directly, preserve identity, separate applicant and posting state, recalc counts, read back, emit receipt, fail closed). "Current capable writers may include Forge or Grok." Claude/Foreman is **control plane only**: it may issue a STATE_CHANGE_REQUEST, must not create replacement masters. Cutover REV2 §8 item 2 records that the Foreman session's Drive tools cannot update content in place. | Amendment 58 §1–2; REV2 §8 |
| Write protocol | Read modifiedTime before write; recompute; re-read modifiedTime immediately before commit and stop on mismatch; commit to the same fileId; read back; log. Receipt fields include BEFORE/AFTER state, READBACK_VERIFIED, COMPLETION_STATUS ∈ {COMPLETE, FAILED, STATE_CHANGE_NEEDS_RESOLUTION}. COMPLETE is prohibited unless READBACK_VERIFIED=YES. | REV2 §1; Amendment 58 §8–9 |
| Evidence precedence for Tim's own application status | 1. Direct Tim statement. 2. Verified employer communication. 3. Canonical application ledger. 4. Verified prior pipeline state. 5. Posting-state inference. | Amendment 58 §6 |
| Master format | Header block (notes, MISSION RULES, `COUNTS:` line, `COLUMNS:` line), then rows under `=== BUCKET (n) ===` headings. Row = `INV \| PRIMARY_ID \| COMPANY \| TITLE \| BUCKET \| DISPOSITION/RULE_OUTCOME \| TAGS \| REQ \| LOCATION \| SCOUT_ACTION`; SCOUT_ACTION carries a `; KEY=value` payload. 496 rows have 10 cells, 30 have 11. | file export, all rows counted |
| Bucket authority | Row BUCKET is authoritative; headings "may lag during safe in-place updates". 99 of 526 rows sit under a heading that differs from their BUCKET. Heading counts lag (`APPLIED (30)` vs COUNTS 37). | file header; computed |
| Bucket vocabulary | READY_TO_PURSUE 23, DECLINED_BY_TIM 281, MANUAL_RESEARCH 8, BLOCKED 3, TIM_DECISION_REQUIRED 0, APPLIED 37, REJECTED_BY_EMPLOYER 8, DUPLICATE 49, CLOSED_DEAD 117. COVERAGE and REJECTED deprecated. Per-row tally matches COUNTS exactly. | COUNTS line; computed |
| Payload keys on every row | `DATE_ADDED` (ISO date, or `PRE-EXISTING / EXACT DATE NOT ESTABLISHED` on 197 rows), `NOTIFICATION_SOURCE`. | computed |
| Other payload keys | `DECLINE_REASON_CODE` / `_TEXT` / `REOPEN_TRIGGER` (281 each; codes: LEGACY_REASON_NEEDS_NORMALIZATION 195, PAY_BELOW_FLOOR 52, GEOGRAPHY_GATE_FAIL 11, FIT_TOO_WEAK 10, DOMAIN_MISMATCH 7, others ≤2), `FLEX` 133, `SALARY_BASE_EST` 93, `DEGREE_REQ` 91, `ANTI_RESURRECTION` 42, `BLOCKER` 27, `APP_STATUS_CHECK` 25, `TIM_DISPOSITION` 16, `VERIFY_LATER` 13, `APP_STATUS_EVIDENCE` 12, `APP_DATE` 8, plus the SALARY_* audit family. | computed |
| Export encoding | Doc `text/plain` export has no backslash escapes. The Drive connector's markdown-style rendering has 553 `\_`. Consumers must use the raw export. | both retrieved |
| Open NEEDS-TIM items that bind this design | **#90** floor-schema P0; **#92** APPLY NOW seat divergence; #94 degree-wall citation. Sheet migration deferred (REV2 §8 item 4). | REV2 §8 item 3–4 |
| Governance files | Versioned by new file, never in-place: `TIM_APPROVED_SEARCH_RULES_v1..v4`, `FORGE_AMENDMENT_55, 57, 58`, `GROK_SCOUT_OPERATING_RULES_v*`, `SCOUT_FORCE_PACK_*`. Load newest by createdTime. Amendment 58 has an open STATE_CHANGE_REQUEST (SCR-2026-09-27-001) asking a capable writer to fold it into the loader chain. | rules v4 §7; Drive listing; SCR file |
| Floors | Prose plus one table in rules v4 §1A/§1 (bands $400k / $300k midpoint with FLEX=Yes and FIT>75; rings $180k / $190k / $200k; FL $210k). | rules v4 |

**Inference.** The pipeline already has a written write architecture (Amendment 58) and a fixed master identity (REV2). An Explorer that invents its own resolution rule or its own write path contradicts both. The right design consumes the fixed ID and emits requests in the form the pipeline already defines.

---

## 2. Goals and non-goals

### 2.1 Non-interference rule (Tim, 2026-09-30; overrides anything below that conflicts)
The Explorer is a viewer, analysis and management tool **for** the pipeline's work. The AI schedules and automations continue exactly as designed. Concretely:
1. **No node depends on the Explorer.** It is not a governing artifact, it is not in any node's load order, and no automation reads it. It can be switched off with no effect on discovery, resolution, freeze, ranking, publication, failover or watchdog.
2. **The Explorer requests nothing from the pipeline.** It adapts to whatever the master and governance files contain. Proposals in this brief that would change a node's output (a SCHEMA header line, a canonical APPLY_NOW field) are recorded as ideas the pipeline may adopt on its own schedule, not as requirements. The app must work identically whether or not they ever happen.
3. **Reads leave no trace the writers can see.** Fetching the master by export does not change its modifiedTime, which the cutover REV2 read-before-write protocol relies on. The app never opens the Doc in an editing session and never copies, renames or moves it.
4. **Manual refresh only.** No background polling of Drive. One fetch per explicit user action, with the last fetch cached in the browser. The viewer must never be a source of load or quota use against the writers' Drive access.
5. **The Explorer writes nothing into AI_Coordination** in v1 or v2 except, in v2 and only after §9 A2/A3 are ruled, STATE_CHANGE_REQUEST records in the form Amendment 58 already defines, which is the pipeline's own designed input channel. Even then the Authorized State Writer processes them on its own schedule; the app never blocks on, retries into, or escalates to a node.
6. **Findings are not actions.** Step 1 will expose heading/BUCKET mismatches, legacy decline reasons, expired estimates and parse anomalies. Those are displayed for Tim's judgment. The Explorer never triggers a cleanup, a re-run, or a message to a node.
7. **The existing cockpit and its feed function are untouched.** Same repo, same Netlify site, a separate page.

**Goals (v1, read-only)**
1. Tim sees the whole master, filters and sorts any real or payload column, and finds APPLY NOW and new rows without scrolling.
2. Integrity faults are visible: parsed counts vs COUNTS, heading vs BUCKET, unparsed rows, expired estimates.
3. Nothing the app does mutates canonical state or creates a competing store.

**Goal (v2, gated)**
4. Tim records a note or status ruling from phone or desktop; it becomes a STATE_CHANGE_REQUEST executed by an Authorized State Writer, with a receipt the app can show.

**Non-goals**
- No discovery, research, ranking, emailing.
- No charts.
- No governance editing from the browser. No floors authority outside the rules file. No Drive-hosted UI config. No Sheet migration.
- No rewrite of the existing cockpit (its fate is §9 Q3).

---

## 3. Data contract

### 3.1 Read

**Master source.** One constant, `MASTER_FILE_ID = 19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`, set from the governing cutover document, overridable only by a future explicit Tim ruling. No search, no pattern, no newest-wins. The status line shows the file's title, ID and modifiedTime on every load. If the title is not `V2_CURRENT_POPULATION_MASTER.txt` the status line shows a warning; the app still renders.

**Fetch.** Raw text: Doc export as `text/plain`. Never the connector's markdown rendering. Offline: paste or file drop of the same export.

**Parser contract.**
1. Split header from body at the first `====` rule line. Parse `COUNTS:` and `COLUMNS:` from the header. If a `SCHEMA:` line exists (§3.4), parse it; if absent, assume schema 1 and say so in the status line.
2. A data row is a line matching `^\d+ \| `. `=== X (n) ===` headings are recorded as `SECTION` for reporting only.
3. Split each data row into **the first nine cells on ` | `; everything after the ninth separator is the payload**, pipes included.
4. Payload: split on `; ` into `KEY=value`; a segment without `=` is appended to the previous value. Leading free text before the first `KEY=` is `SCOUT_ACTION`. Unknown keys become virtual columns and are always shown in the row drawer. Nothing is discarded.
5. **Row BUCKET is authoritative.** SECTION is a separate column and is never used for counts, sorting, or presets.
6. A row that cannot be split into nine cells is kept, flagged `PARSE_ERROR`, and listed in Data Quality. **No row is ever hidden.**
7. Computed columns (render only): COMP_MID, DAYS_SINCE_SALARY_ASOF, DAYS_SINCE_FLEX_ASOF, IS_NEW (§4.2), SECTION_MISMATCH. No floor recalculation (§6.3); the row's own `FLOOR_STATUS` is shown when present.
8. Checksum: per-bucket counts from row cells vs the COUNTS line. Mismatch is a visible integrity fault in the status line. Heading counts are ignored.

**Also read.** Newest `TIM_APPROVED_SEARCH_RULES_v*` and later amendments, for inspection only (§6.3). In v2, STATE_CHANGE_RECEIPT records (§5). All reads are on explicit user action; no polling (§2.1 item 4).

**Fixture.** A scrubbed 20-row fixture in the repo for parser tests. The real export is not committed (§9 Q4). The fixture must include at minimum: a row with a pipe character inside a payload URL (an 11-cell row); a row whose SECTION heading differs from its BUCKET cell; a row with `DATE_ADDED=PRE-EXISTING / EXACT DATE NOT ESTABLISHED`; a row carrying an unknown payload key; and one deliberately malformed row that cannot be split into nine cells.

### 3.2 Write
None in v1. v2 is §5.

### 3.3 Backend adapter
The UI talks to one interface: `source.getMaster() → {text, title, id, modifiedTime}` and `source.getFile(id) → {text, ...}`. Adapters: `PasteSource` (v1), `AppsScriptSource` (step 2), and later `SheetCsvSource` if the master ever becomes structured. Parsers are keyed by schema version. Changing the master's storage changes an adapter, not the application.

### 3.4 Schema-version line (idea for the pipeline to adopt or ignore; not a request from this project, per §2.1 item 2)
The master's header already carries `COUNTS:` and `COLUMNS:` lines that every parser skips or reads by prefix. One more line of the same shape would let consumers know what they are reading:

```
SCHEMA: MASTER_SCHEMA_VERSION=1 | MASTER_FORMAT_VERSION=1 | MASTER_REVISION=<monotonic integer> | MASTER_UPDATED_AT=<ISO> | MASTER_UPDATED_BY=<authorized writer> | MASTER_SEED_ID=1kstEidVv9n5h9zjZSy2dFOP5UdVpmdoRmMCL-b6qmuE
```

Under the fixed-ID, in-place regime the useful concurrency identity is a revision counter, not a predecessor file ID, so `MASTER_REVISION` replaces the `MASTER_PREDECESSOR_ID` proposed in v0.3; `MASTER_SEED_ID` records the R6 seed once. The app shows `MASTER_REVISION` next to modifiedTime when present. Cutover REV2 chose not to decorate the row-bearing file with a provenance wrapper so that existing parsers would not choke. A single prefixed header line is consistent with the existing `COUNTS:` / `COLUMNS:` convention and carries that same low risk, but it is still a change to the master and therefore a STATE_CHANGE_REQUEST for a capable writer, not an app feature. The app tolerates its absence.

---

## 4. Main view: the grid

### 4.1 Layout
Full-width table, sticky header, frozen COMPANY and BUCKET, horizontal scroll. ~22 px rows, 11 px text, monospace for IDs, dates, money. Column set from local config (§6.4), desktop and phone sets. Status line always visible: title, ID, modifiedTime, row count, checksum result, schema version.

### 4.2 Default ordering
1. BUCKET order (local config): READY_TO_PURSUE, TIM_DECISION_REQUIRED, BLOCKED, MANUAL_RESEARCH, APPLIED, REJECTED_BY_EMPLOYER, DECLINED_BY_TIM, DUPLICATE, CLOSED_DEAD.
2. Within bucket: `DATE_ADDED` descending; `PRE-EXISTING` rows last. IS_NEW = DATE_ADDED within the last N days (default 3). No local-storage newness.
3. Then `SALARY_ASOF` / `FLEX_ASOF` descending.
Any header click overrides; "reset" restores priority order.

### 4.3 Filters and presets
Enum columns get checkbox lists with counts; text columns contains / not-contains; money and dates min/max. Active filters are chips; filter, sort and column set live in the URL hash.

Presets are saved filter sets. The active preset's predicate is printed in the status line so the reader always sees exactly what was filtered. **The Explorer does not recreate job policy.** Each term below is canonical state already written into the master by the nodes that own that policy, with its source labeled. If the ranking node ever writes an explicit `APPLY_NOW=YES/NO` (or equivalent) into the row on its own initiative, the preset switches to that field and this predicate is retired. The Explorer does not ask for that field (§2.1 item 2).

- **APPLY NOW (proposed; Tim to accept or replace; note open item #92 "APPLY NOW seat divergence"):**
  `BUCKET = READY_TO_PURSUE` (disposition owned by Foreman/Scout under current rules)
  `AND no BLOCKER key` (unresolved decision-changing blocker, written by resolver)
  `AND no ANTI_RESURRECTION key` (terminal suppression, Amendment 58 §14)
  `AND BUCKET ≠ APPLIED` (redundant with the first term; stated for the reader).
  Not included: liveness (no canonical column yet), first-party URL (per Tim's 2026-09-26 change as reported by ChatGPT; not independently verified this session), floor and FLEX tests (both are already inputs to the READY_TO_PURSUE disposition; re-applying them here would let the app second-guess Tim-advanced degree-wall rows such as those tagged `DEGREE_WALL_TIM_ADVANCE`). The row's own `FLOOR_STATUS`, where present, is shown as a column so the reader can see it.
- **NEW:** IS_NEW, any bucket except DUPLICATE and CLOSED_DEAD.
- **NEEDS ACTION:** BUCKET in (TIM_DECISION_REQUIRED, BLOCKED, MANUAL_RESEARCH). `VERIFY_LATER` is **excluded**: the master header defines it as "unknown but decision-irrelevant" that "must not remain in NEEDS_RESOLUTION", and 6 of the 12 rows carrying it are READY_TO_PURSUE. If a canonical NEXT_ACTION or DECISION_CHANGING field appears later, the preset switches to it.
- **PIPELINE:** BUCKET = APPLIED, sub-grouped by DISPOSITION. Verified against the live file: interview and offer states are not separate buckets; the one interviewed row is BUCKET=APPLIED with DISPOSITION `RESOLVED/APPLIED_INTERVIEWED`, and an offer decline appears in payload text. So BUCKET=APPLIED captures the whole pipeline today; the DISPOSITION sub-grouping surfaces the stages. If Amendment 58 §3 transitions (INTERVIEW_SCHEDULED, INTERVIEW_COMPLETED, OFFER) are later written as their own field, the preset reads that field.
- **DECLINED:** BUCKET = DECLINED_BY_TIM, grouped by DECLINE_REASON_CODE.
- **CLOSED:** BUCKET in (REJECTED_BY_EMPLOYER, DUPLICATE, CLOSED_DEAD).

### 4.4 Row detail drawer (v1: read-only)
Right-side drawer on desktop, full-screen on phone. Every real and payload field, SECTION vs BUCKET if they differ, verified links only. In v2 the drawer gains the request form in §5.

---

## 5. Write channel (v2, gated) — built on Amendment 58

### 5.1 Principle
Amendment 58 already answers "who materializes canonical state": an Authorized State Writer, defined by capability, executing STATE_CHANGE_REQUESTs and emitting STATE_CHANGE_RECEIPTs. Tim's direct statement is the highest-precedence evidence for his own application status (§6). So the Explorer's job is to let Tim make that statement in the pipeline's own request format. **There is no ledger, no merge rule for nodes, and no app-side mutation.** v0.2's ledger design is withdrawn.

### 5.2 Gate
No write channel is built until Tim confirms (a) which Authorized State Writer executes app-originated requests and through what surface, and (b) that a browser-originated request with Tim as REQUESTED_BY is acceptable evidence under Amendment 58 §6 item 1. Cutover REV2 §8 item 2 already flags that the writer surface is unresolved.

### 5.3 Mechanism (once gated)
1. **Request form in the drawer.** Applicant-state transitions limited to those Amendment 58 §3 lists (NOT_APPLIED→APPLIED, APPLIED→INTERVIEW_SCHEDULED, →INTERVIEW_COMPLETED, →REJECTED, →WITHDRAWN, →OFFER), posting-state changes (LIVE, CLOSED, REMOVED, REPOSTED), Tim disposition (DECLINED_BY_TIM with DECLINE_REASON_CODE, DECLINE_REASON_TEXT, REOPEN_TRIGGER; TIM_DECISION_REQUIRED), and a free-text note targeting a non-protected `TIM_NOTES` payload key. Applicant state and posting state are separate fields, never collapsed.
2. **Record shape.** Exactly the Amendment 58 §7 minimum fields: REQUEST_ID (UUID, idempotency key), TIMESTAMP, REQUESTED_BY=Tim via Pipeline Explorer, TARGET_SYSTEM, TARGET_CANONICAL_ID (PRIMARY_ID), COMPANY, TITLE, REQ_ID, CURRENT_* and REQUIRED_* application and posting state (CURRENT_* taken from the row as displayed, so the writer can detect a stale view), SOURCE_OF_CHANGE (Tim direct statement plus any note), TARGET_CANONICAL_ARTIFACT (the fixed master ID), AUTHORIZED_WRITER (per gate), VERIFICATION_REQUIREMENTS (Amendment 58 §8–9).
3. **Transport.** Requests are appended to an `SCR_QUEUE` file in AI_Coordination through an Apps Script endpoint executed as Tim (or a Netlify function with a service account). The app never writes the master.
4. **Confirm and cancel.** Confirm step shows the exact record. A queued request can be cancelled by Tim at any time until the writer has picked it up (a "cancel pending" control per request), not a fixed 30-second window, which is too short on a phone.
5. **Receipts.** The app reads STATE_CHANGE_RECEIPT records and shows, per request: pending, COMPLETE, FAILED, or STATE_CHANGE_NEEDS_RESOLUTION. Pending requests are overlaid on the grid as "requested", visually distinct from canonical state, never merged into it.
6. **Foreman verification duty** (Amendment 58 §13) is unchanged: at the next sweep Foreman checks propagation of open requests. The app's receipt view makes that check faster; it does not replace it.

### 5.4 What the app never does
Never mutates the master. Never writes on behalf of a node. Never changes BUCKET or DISPOSITION itself. Never creates a row; a missing opportunity is a request to Scout, not an insert. Never reads the 455-row Applicant Status Ledger as live state.

---

## 6. Tabs

- **6.1 PIPELINE** — the grid (§4). Step 1.
- **6.2 REPORTS** — step 2, plain tables: counts vs COUNTS; SECTION vs BUCKET mismatches; aging by SALARY_ASOF / FLEX_ASOF and SALARY_EXPIRES; rows missing FLOOR_STATUS (no recalculation); Data Quality (parse errors, 11-cell rows, unknown keys, no REQ and no URL, duplicate PRIMARY_IDs); DECLINED_BY_TIM by reason code with the 195 `LEGACY_REASON_NEEDS_NORMALIZATION` rows called out; open requests and receipts (v2).
- **6.3 SALARY FLOORS** — **deferred** until open item #90 establishes a deterministic authoritative floor source and precedence. The governance stack is rules plus later amendments with precedence, so "newest `TIM_APPROVED_SEARCH_RULES_v*`" is not guaranteed to be current floor truth, and a clean-looking reconstructed table would look authoritative when it is not. Until then the tab only opens the governing source text for inspection. The grid shows the row-level `FLOOR_STATUS` payload value where the master carries it (6 rows today) and does not recalculate floors. When floors are extracted to data, the migration is atomic: rules prose → structured authority, never prose plus an optional file.
- **6.4 COLUMNS** — step 1, local only: visibility, order, width, desktop vs phone set, bucket order. URL hash and browser storage. Presentation settings do not enter the governance stack.
- **6.5 GOVERNANCE** — read-only list of governance files by prefix, newest first, with createdTime, opening each read-only. No editing from the browser.
- **6.6 WALK-AWAY EVALUATOR** — placeholder; inputs named so columns exist (LOCATION → band/ring, COMP_LOW/HIGH/MID + confidence, FLEX, FIT, level, OEM adders). Not built.

---

## 7. Visual design
Pure black base, near-white text, two greys, 1 px hairlines, no gradients or animation. System sans for labels, monospace for data, uppercase micro-labels with wide tracking. One accent (§9 P1) for active tab, primary button, focused row, header rule. Status colors: green (READY_TO_PURSUE, APPLIED), red (REJECTED_BY_EMPLOYER, CLOSED_DEAD, BLOCKED), grey (DECLINED_BY_TIM, DUPLICATE, MANUAL_RESEARCH), accent for TIM_DECISION_REQUIRED and for "requested" overlays in v2. Corner brackets on the active panel, faint grid texture in the header band, monospace status line. 11 px body, 22 px rows; phone portrait 12 px with the phone column set.

---

## 8. Platform and delivery

- One HTML file, no framework, no build step, second page in this repo (`pipeline.html`) on the existing Netlify site. Cockpit untouched.
- Size: step 1 ≈ 1,200–1,600 lines. Step 2 adds ~300. Step 3 (v2) adds roughly step 1 again.
- Mobile: same page; breakpoints switch column set; filters become bottom sheets; drawer full-screen. Landscape phone fits ~8 dense columns; portrait shows the phone set with COMPANY + BUCKET frozen.

| Step | Ships | Does not ship |
|---|---|---|
| 1 | Parser + grid + filters + sort + presets + drawer (read) + paste/drop + checksum + scrubbed fixture + local column config | Any backend, any write |
| 2 | Apps Script `getFile(MASTER_FILE_ID)` and `getFile(rules)`, secret gate, status line, Reports, Salary Floors (read-only), Governance (read-only) | Any write |
| 3 (v2) | STATE_CHANGE_REQUEST form, SCR_QUEUE transport, receipts view — **only after §5.2 gate** | Governance editing, floors file, Drive UI config, walk-away |

Step 1 replaces the stale cockpit feed as the way to see the master and is testable against the fixture with no Drive access.

---

## 9. Open decisions for Tim

**Architecture**

| # | Question | Reviewer position | Claude position |
|---|---|---|---|
| A1 | Read backend for step 2: Apps Script executed as Tim with shared secret, vs Netlify function + service account | Grok: Apps Script. ChatGPT: defer, step 1 needs neither | Defer to step 2; recommend Apps Script then |
| A2 | Which Authorized State Writer executes app-originated STATE_CHANGE_REQUESTs, via what surface (the §5.2 gate). Cutover REV2 §8 item 2 says this is unresolved even for the pipeline's own writes | Both: one named materializer, never "every node" | Agree. Amendment 58 already says this; the gap is naming the surface |
| A3 | Is a browser-originated request with REQUESTED_BY=Tim acceptable as "direct Tim statement" under Amendment 58 §6? | Both reviewers: not with a shared secret alone; possession of a bearer secret is not identity | Agree, revised: v2 needs authenticated Google identity or a server-side authenticated session so the writer can distinguish "Tim submitted this" from "someone held the secret". Not needed for Step 1 or 2 |
| A4 | Floors as data | Both: no | Agree; tied to open item #90 |
| A5 | UI config as a Drive governing file | Both: no, local first | Agree |
| A6 | APPLY NOW predicate (§4.3) | ChatGPT: prefer a canonical field | Accept or replace the interim predicate. Whether the pipeline ever writes a canonical APPLY_NOW field is a pipeline decision under #92, not an ask from this project (§2.1) |
| A7 | Sheet/CSV migration | Both: not now | Agree; REV2 §8 item 4 already defers it |
| A8 | `SCHEMA:` header line in the master (§3.4) | ChatGPT proposed it; Grok: optional | Withdrawn as a request per §2.1. Recorded as an idea the pipeline may adopt; the app tolerates its absence |
| Q3 | Cockpit page (calendar/tasks/nodes): keep as a separate page, or retire after the Explorer ships | — | Keep both a week, then decide |
| Q4 | May a copy of the master export be committed to this public repo as a fixture? | — | No; scrubbed 20-row fixture |

**Paint**

| # | Question | Reviewer position | Claude position |
|---|---|---|---|
| P1 | Accent color | Grok: cyan | Either |
| P2 | Portrait phone | Both: narrow table, no cards | Agree |

---

## 10. Risks and weak assumptions
- **Writer surface unresolved.** Even the pipeline's own in-place writes are flagged as a tool gap (REV2 §8 item 2). Until A2 is settled, v2 cannot be built. Step 1 has no exposure.
- **Parser fragility.** Pipes inside values, headings that lag, 197 rows without a real DATE_ADDED. The parser never drops rows; Data Quality surfaces what it could not read.
- **Drive quota and writer interference.** Mitigated by §2.1: manual refresh, export reads only, no polling, nothing written to AI_Coordination.
- **Step 1 will make the pipeline look dirty.** It will show 99 heading/BUCKET mismatches and 195 `LEGACY_REASON_NEEDS_NORMALIZATION` declines on day one. That is the point. It must not trigger a cleanup pass from the Explorer; cleanup is a pipeline action under the directive's non-destructive cutover rules.
- **Fixed ID is a single point.** If a future ruling moves the master, the constant must change. The status-line title check makes a silent move visible.
- **Public site + shared secret** is acceptable for read. Any write surface needs the A2/A3 rulings first.
- **The 09-26 first-party URL rule change** is cited from ChatGPT's review and was not independently read this session.
- **What I read:** the full text export of the fixed master was decoded and counted programmatically. I did not read every row's prose. Amendment 58 and Cutover REV2 were read in full; Cutover Revision 1 was not.

---

## 11. Change record
- 2026-09-29 v0.1 — Created by Claude. Sources: repo; directive; cutover map; Amendment 55; scoring notice; rules v4; `V2_CURRENT_POPULATION_2026-09-27.txt` (header + samples). No Drive writes, no code.
- 2026-09-29 v0.2 — Revised after Grok review. Verified against `V2_CURRENT_POPULATION_MASTER.txt` by full export (526 rows, vocabulary, keys, 99 mismatches, encoding). No Drive writes, no code.
- 2026-09-29 v0.3 — Revised after ChatGPT review. Read `FORGE_AMENDMENT_58_CANONICAL_STATE_WRITE_ARCHITECTURE_2026-09-27` (`1Vz-ifWCspz1RPf_QyWZ9XYND2GrZsAwx`), `MASTER_TABLE_CUTOVER_IMPLEMENTATION_2026-09-29_REV2.txt` (`1t83d2awD2gA_JstH8eCHsfs5YLtxKDLW`), and `STATE_CHANGE_REQUEST_SCR-2026-09-27-001`. Master resolution corrected to fixed ID. Write channel rebuilt on Amendment 58; ledger withdrawn. v1 scoped read-only. §3.3, §3.4 added. §4.3 predicate reduced and labeled. No Drive writes, no code.
- 2026-09-30 v0.4 — Second-round corrections from ChatGPT and Grok, each verified against the live master before applying: VERIFY_LATER removed from NEEDS ACTION (header rule confirmed; 12 rows carry the key, 6 of them READY_TO_PURSUE); Salary Floors deferred to #90, row-level FLOOR_STATUS shown (present on 6 rows); SCHEMA fields revised; PIPELINE preset checked against where interview/offer states live (DISPOSITION under APPLIED); predicate shown in status line; cancel-pending replaces 30 s undo; five fixture cases specified; A3 position revised. No Drive writes, no code.
- 2026-09-30 v0.5 — Tim's non-interference instruction added as §2.1 and applied: SCHEMA line and canonical APPLY_NOW field withdrawn as requests; manual refresh only; reads confirmed not to touch modifiedTime; nothing written to AI_Coordination in v1. No Drive writes, no code.

---

## 12. Response to Grok's review (2026-09-29)
Accepted and applied in v0.2: stale §1; bucket vocabulary; DATE_ADDED for newness; row BUCKET over section; nine-cells-plus-payload; never hide rows; §5.5 citation; line estimate; governance editor out; floors-as-data deferred; config local; APPLY NOW written out; rulings mapped; Kill/Snooze removed; ship gates.
Corrected: `\_` escapes exist only in the connector's markdown rendering; raw export is clean.
**Superseded in v0.3:** Grok's parser rule "resolve newest file matching `V2_CURRENT_POPULATION*` by modifiedTime, including Google Docs" is the mechanism Tim's 2026-09-29 ruling retired. v0.2 adopted it; v0.3 replaces it with the fixed ID. "Sloppy regeneration" is also softened by REV2: the R-snapshots were one seeding run, and the MASTER file was a deliberate byte-verified copy.

## 13. Response to ChatGPT's review (2026-09-29, written against v0.1)
Already present in v0.2 before the review arrived: items 1, 3, 4, 5, 6 (as a gate), 7, 8, 9, 10, and the §5.5 fix.
Accepted and applied in v0.3: master source resolved per governing directive, not filename age (this was the decisive correction); v1 strictly read-only with no ledger at all; "one component materializes canonical state" restated as Amendment 58's Authorized State Writer; atomic floors migration wording; backend adapter (§3.3); schema-version line (§3.4); request record fields with REQUEST_ID idempotency, CURRENT/REQUIRED state, SOURCE, and actor (§5.3); liveness and first-party URL excluded from APPLY NOW; separate architecture and paint.
Adjusted: ChatGPT's APPLY NOW predicate says "current governing geography / compensation rules permit pursuit". v0.3 does not re-evaluate those rules in the app because READY_TO_PURSUE already encodes them and re-applying them would override Tim-advanced degree-wall rows; the row's FLOOR_RESULT is shown, not enforced.
Verified: Amendment 58 exists and is binding as ChatGPT said; it changed §5 more than any other input.
Not verified: the 2026-09-26 first-party URL rule change; cited with attribution in §4.3 and §10.

## 14. Second-round responses (2026-09-30)
Both reviewers accept the v0.3 architecture for Step 1 subject to small corrections. All applied in v0.4 after verification:
- **ChatGPT 1, VERIFY_LATER out of NEEDS ACTION:** confirmed against the master header and row data. Applied.
- **ChatGPT 2, floors not reconstructed from the newest rules file:** accepted; tab deferred to #90; `FLOOR_STATUS` exists on 6 rows and is displayed as-is.
- **ChatGPT 3, SCHEMA fields:** accepted; `MASTER_REVISION` / `MASTER_UPDATED_AT` / `MASTER_UPDATED_BY` / `MASTER_SEED_ID` replace the v0.3 set.
- **Grok 1, predicate visible:** applied to the status line.
- **Grok 2, PIPELINE preset vs interview/offer states:** checked; those states live in DISPOSITION under BUCKET=APPLIED today, so the preset holds with a DISPOSITION sub-group.
- **Grok 3 and ChatGPT's caution on A3:** accepted; shared secret is not identity; A3 position revised.
- **Grok 4, SCHEMA optional for Step 1:** agreed.
- **Grok 5, private master through a public site:** already in §10; read path requires the secret header and never a public export link.
- **Grok 6, fixed ID does not stop a rogue writer:** agreed; the status-line title check is detection, not prevention. Prevention is a pipeline rule, not an app feature.
- **Grok 7, reviewer labels:** role suffixes removed.
- **Grok, two fixture cases:** added, with three more.

Both reviewers say to stop iterating the document and build Step 1. **That is a recommendation. The authorization is Tim's.**

