# PIPELINE EXPLORER — DESIGN BRIEF v0.9

**Date:** 2026-09-30 (v0.1–v0.3 on 2026-09-29; v0.4 second-round corrections; v0.5 non-interference rule; v0.6 Tim's rulings on the numbered questions; v0.8 state writer; v0.9 Scout intake architecture)
**Author:** Claude (Foreman node), from Tim's spec in this session
**Status:** Step 1 BUILT (2026-09-30) per Tim's answers to the numbered questions; see §9C. `pipeline.html` reads the fixed master through `netlify/functions/master.js` and holds Tim's rulings locally until the Authorized State Writer applies them. No Drive files changed by this project. The master must be shared "Anyone with the link, Viewer" by Tim for the live fetch to work.
**Reviewers:** Tim (final authority), ChatGPT, Grok
**Repo:** tpruittguitar/foreman-cockpit (`docs/PIPELINE_EXPLORER_DESIGN_BRIEF.md`)

**What changed in v0.9 (Tim's architectural ruling, 2026-09-30: canonical job pipeline = one population).** Scout no longer keeps a separate discovery population. Every plausible discovery enters the single fixed master (ID `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`) as a `SCOUT_INTAKE` or `DISCOVERY_LEAD` row through a new `action=intake` on the same Authorized State Writer that applies Tim's rulings (PR #3). Unknown pay, degree, FLEX, scope, reporting level, liveness or req ID is a **research state, not a rejection reason**; hard exclusions come only from the canonical Doc `TIM_NEVER_CONSIDER_RULES` (NC-001 pharma, NC-002 medical device, NC-003 food/beverage, NC-004 restaurant/food service; primary business only; see v0.9a). Three new buckets (`SCOUT_INTAKE`, `DISCOVERY_LEAD`, `INVALID_DISCOVERY`), a Scout Quality dashboard per `SCOUT_RUN_ID`, a Rules tab, new presets and a four-section row detail (Scout facts / Claude proposed analysis / Forge verified facts / Tim rulings). §2.1 item 5 and §5.4 are corrected: **the Explorer is never a second state store. All canonical mutations go through the Authorized State Writer against the single fixed master and require readback verification.** Full spec in §9E and `docs/SCOUT_INTAKE_CONTRACT.md`. Built as a PR for Tim's review; not merged, not deployed. Verified population at the time of writing is 562 rows; no size is hard-coded anywhere.

**What changed in v0.8 (Tim's ruling 2026-09-30: "it did not save my comments and decisions to the master job file").** Step 1 held rulings on the device by design; Tim wants them in the master. v0.8 adds a **state writer**: a Google Apps Script in Tim's account that applies Tim's rulings to the master row in place under the Amendment 58 writer contract, plus cross-device sync of seen-state and rulings. See §9D. The non-interference rule (§2.1) still holds: the writer only answers requests from the page, only touches the ruled row and the COUNTS line, never runs on a schedule, and never touches any other pipeline file.

**What changed in v0.7 (Tim's second-round answers and Step 1 build, 2026-09-30).** Q2: master made link-readable (Tim's call; privacy accepted) and fetched by a Netlify function, no Apps Script needed. Q6/7: rulings are held on the device across refreshes and shown as pending until the master reflects them; trust deferred. Q8: yes, one app; the Explorer will replace the cockpit page once Tim is satisfied. Q9: agree, master format unchanged; parser is format-agnostic. Q5: confirmed. New: automation timer panel. Step 1 built and smoke-tested against the real 526-row export on desktop, phone landscape and phone portrait; details in §9C.

**What changed in v0.6 (Tim's rulings, 2026-09-30).** §9 is replaced by §9A "Rulings received" and §9B "Still open, with plain-language explanations". Rulings applied: no paste, a refresh button that fetches the live fixed-ID master (§3.1); no new cost and no new website (§8); APPLY NOW is the AI disposition, with a Tim ruling field that overrides per row (§4.3); NEW is one day or "not yet seen by Tim", tracked per row (§4.2); AI decision capabilities unchanged, Tim overrules per row and the ruling becomes canonical through the pipeline's own request channel, and the nodes learn from his rulings (§5, §9B); visual: black and greys, white text, thin lines, neon only for focus, HUD feel (§7); portrait phone is a narrow scrolling table with smaller readable text (§8). Step 1 build is **on hold** at Tim's instruction until §9B is closed.

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
5. **The Pipeline Explorer is not a second state store.** It may perform canonical mutations only through the Authorized State Writer against the fixed master and only with identity checks, protected-state rules, recounting and readback verification. The Explorer itself is a control surface over canonical state. The Explorer holds no ledger, no queue and no replacement master; browser storage carries only seen-state and a display copy of Tim's rulings until the master reflects them. The writer never runs on a schedule, and the app never blocks on, retries into, or escalates to a node.
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

**Fetch.** Raw text: Doc export as `text/plain`. Never the connector's markdown rendering. **Tim's ruling (Q2): no pasting.** The page loads the live master on open and on a Refresh button. Constraints from Q3: nothing that costs money, no new website. The repo is public (verified 2026-09-30), so a copy of the master cannot be committed for testing. The zero-cost private path is a Google Apps Script web app deployed once from Tim's own Google account: it runs as Tim, reads the fixed-ID Doc, and returns the text to the page over HTTPS, gated by a secret the page stores after Tim enters it once. Tim's one-time setup is about five minutes (paste the script, click Deploy, copy the URL into the page). Fallback if Tim prefers zero setup: share the master Doc as "anyone with the link, viewer" and fetch its export through the existing Netlify function, exactly as the cockpit feed works today; this exposes the master to anyone who obtains the ID, and is not recommended for a file holding application history. Paste and file drop remain as an emergency path only, not the normal one.

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
2. Within bucket: `DATE_ADDED` descending; `PRE-EXISTING` rows last. **IS_NEW (Tim's ruling, Q5):** a row is NEW if `DATE_ADDED` is within the last 1 day, OR Tim has not yet seen it. "Seen" means Tim opened the row, interacted with it, or commented on it. Seen-state is per PRIMARY_ID and is Tim's own app state, not canonical state: it is kept in a small Tim-owned file outside AI_Coordination (via the same Apps Script) so phone and laptop agree, with browser storage as the offline cache. No node reads it. A "mark all seen" control exists.
3. Then `SALARY_ASOF` / `FLEX_ASOF` descending.
Any header click overrides; "reset" restores priority order.

### 4.3 Filters and presets
Enum columns get checkbox lists with counts; text columns contains / not-contains; money and dates min/max. Active filters are chips; filter, sort and column set live in the URL hash.

Presets are saved filter sets. The active preset's predicate is printed in the status line so the reader always sees exactly what was filtered. **The Explorer does not recreate job policy.** Each term below is canonical state already written into the master by the nodes that own that policy, with its source labeled. If the ranking node ever writes an explicit `APPLY_NOW=YES/NO` (or equivalent) into the row on its own initiative, the preset switches to that field and this predicate is retired. The Explorer does not ask for that field (§2.1 item 2).

- **APPLY NOW (Tim's ruling, Q4: "let the AIs decide; I can change their decision in my editable field and rule against apply now"):** the preset shows the AI disposition as the nodes wrote it, and Tim's per-row ruling (§5) overrides the display where one exists. Interim predicate until the nodes write an explicit field:
  `BUCKET = READY_TO_PURSUE` (disposition owned by Foreman/Scout under current rules)
  `AND no BLOCKER key` (unresolved decision-changing blocker, written by resolver)
  `AND no ANTI_RESURRECTION key` (terminal suppression, Amendment 58 §14)
  `AND BUCKET ≠ APPLIED` (redundant with the first term; stated for the reader)
  `AND no Tim ruling against pursuit on this row` (Tim's override, §5).
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

### 5.0 Tim's ruling (Q6, 2026-09-30)
"Don't change AI decision capabilities. I want the ability to overrule and make my ruling canonical for each one. Then improve decisions of the AI based on interpretation of my guidance. Learn. Get better." Three consequences: (1) the nodes keep deciding exactly as they do now; (2) Tim gets an editable ruling per row, and that ruling becomes canonical in the master through the pipeline's own STATE_CHANGE_REQUEST channel, not by the app editing the master; (3) the learning loop is a governance instruction to the nodes (read Tim's rulings and treat them as precedent when deciding similar rows), which is Tim's to issue and outside this app. The master already carries Tim-ruling vocabulary (`DECLINE_REASON_CODE=TIM_EXPLICIT_DECLINE`, `TIM_DISPOSITION=`, `DEGREE_WALL_TIM_ADVANCE`), so the request format reuses it. This moves the write channel from "maybe later" to "the next thing after the viewer", still behind the §5.2 gate.

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
The Pipeline Explorer is not a second state store. It may perform canonical mutations only through the Authorized State Writer against the fixed master and only with identity checks, protected-state rules, recounting and readback verification. The Explorer itself is a control surface over canonical state. The page itself never edits the master text, never writes on behalf of a node, and never creates a job row from the browser; rows enter only through Scout intake (§9E) or the pipeline's own regeneration. Never reads the 455-row Applicant Status Ledger as live state.

---

## 6. Tabs

- **6.1 PIPELINE** — the grid (§4). Step 1.
- **6.2 REPORTS** — step 2, plain tables: counts vs COUNTS; SECTION vs BUCKET mismatches; aging by SALARY_ASOF / FLEX_ASOF and SALARY_EXPIRES; rows missing FLOOR_STATUS (no recalculation); Data Quality (parse errors, 11-cell rows, unknown keys, no REQ and no URL, duplicate PRIMARY_IDs); DECLINED_BY_TIM by reason code with the 195 `LEGACY_REASON_NEEDS_NORMALIZATION` rows called out; open requests and receipts (v2).
- **6.3 SALARY FLOORS** — **deferred** until open item #90 establishes a deterministic authoritative floor source and precedence. The governance stack is rules plus later amendments with precedence, so "newest `TIM_APPROVED_SEARCH_RULES_v*`" is not guaranteed to be current floor truth, and a clean-looking reconstructed table would look authoritative when it is not. Until then the tab only opens the governing source text for inspection. The grid shows the row-level `FLOOR_STATUS` payload value where the master carries it (6 rows today) and does not recalculate floors. When floors are extracted to data, the migration is atomic: rules prose → structured authority, never prose plus an optional file.
- **6.4 COLUMNS** — step 1, local only: visibility, order, width, desktop vs phone set, bucket order. URL hash and browser storage. Presentation settings do not enter the governance stack.
- **6.5 GOVERNANCE** — read-only list of governance files by prefix, newest first, with createdTime, opening each read-only. No editing from the browser.
- **6.6 WALK-AWAY EVALUATOR** — placeholder; inputs named so columns exist (LOCATION → band/ring, COMP_LOW/HIGH/MID + confidence, FLEX, FIT, level, OEM adders). Not built.

---

## 7. Visual design (Tim's ruling, Q10 and Q11)
Black base and shades of grey only. White text, thin 1 px lines. **White is the accent** for active tab, primary control and header rule. Bright neon (one green, one cyan, one magenta, used sparingly) only for the element that needs focus: a highlighted row, the selected cell, a NEW marker, a Tim ruling. Star Trek, Anduril, Shield AI weapons-HUD feel: reticle corner brackets on the active panel, a faint grid in the header band, monospace readouts, no gradients, no animation beyond a focus pulse. System sans for labels, monospace for data, uppercase micro-labels with wide tracking. Status is shown by a small monochrome glyph plus text, not by colored chips, so the neon stays reserved for focus. Exceptions: NEW marker in neon green, Tim ruling in neon cyan, "requested, not yet canonical" in neon magenta. Corner brackets on the active panel, faint grid texture in the header band, monospace status line. 11 px body, 22 px rows on desktop. Portrait phone (Q11): narrow table, smaller but readable text, both axes scrollable, COMPANY and BUCKET frozen; no card list.

---

## 8. Platform and delivery

- One HTML file, no framework, no build step, on the existing free Netlify site in this repo. **No new cost, no new website (Q3).** The only backend is a Google Apps Script in Tim's own account, also free. See §9B item 8 for whether this page replaces the cockpit page or sits beside it.
- Size: step 1 ≈ 1,200–1,600 lines. Step 2 adds ~300. Step 3 (v2) adds roughly step 1 again.
- Mobile: same page; breakpoints switch column set; filters become bottom sheets; drawer full-screen. Landscape phone fits ~8 dense columns; portrait shows the phone set with COMPANY + BUCKET frozen.

| Step | Ships | Does not ship |
|---|---|---|
| 1 | Parser + grid + filters + sort + presets + drawer (read) + paste/drop + checksum + scrubbed fixture + local column config | Any backend, any write |
| 2 | Apps Script `getFile(MASTER_FILE_ID)` and `getFile(rules)`, secret gate, status line, Reports, Salary Floors (read-only), Governance (read-only) | Any write |
| 3 (v2) | STATE_CHANGE_REQUEST form, SCR_QUEUE transport, receipts view — **only after §5.2 gate** | Governance editing, floors file, Drive UI config, walk-away |

Step 1 replaces the stale cockpit feed as the way to see the master and is testable against the fixture with no Drive access.

---

## 9A. Rulings received (Tim, 2026-09-30)

| Q | Tim's ruling | Applied where |
|---|---|---|
| 1 | Hold the Step 1 build until the other questions are answered. | Build not started. |
| 2 | No pasting. Load the latest list and give a Refresh button. | §3.1: Apps Script read of the fixed-ID master; fallback stated. |
| 3 | No new cost, no new website. | §8: existing Netlify site + free Apps Script. |
| 4 | Let the AIs decide APPLY NOW; Tim's editable field overrides per row. | §4.3, §5.0. |
| 5 | NEW = one day, or not yet shown to / interacted with by Tim. | §4.2 seen-state. |
| 6 | Do not change AI decision capabilities. Tim overrules per row; ruling becomes canonical; AIs learn from his guidance. | §5.0. Learning loop is a governance instruction (§9B item 6). |
| 7 | "I don't know what this means." | Explained in §9B item 7. |
| 8 | "What's the difference? I asked for one app." | Explained in §9B item 8. |
| 9 | CSV is more portable and fundamental. | Explained in §9B item 9. |
| 10 | White, not gold. Black and greys, white text, thin lines, neon only for focus. HUD feel. | §7. |
| 11 | Narrow table, smaller readable text, scrolling. | §7, §8. |

## 9B. Still open, in plain language

**6 and 7 together: how your ruling becomes canonical, and who is allowed to say it came from you.**
When you tap "overrule" on your phone, something has to physically edit the master file in Drive. Your own Amendment 58 says Claude cannot edit files in place and must not create replacement files; only an "Authorized State Writer" may change the master, by reading a STATE_CHANGE_REQUEST, editing the row, reading it back, and writing a receipt. Amendment 58's filing note says ChatGPT holds in-place Drive edit authority today; Grok may also qualify. So the flow is: the app writes your ruling as a request into a small queue file; ChatGPT or Grok applies it to the master on its next run and writes a receipt; the app shows "requested" in magenta until the receipt arrives, then shows it as canonical. **Decision 6:** name which node picks up app-originated requests (recommend ChatGPT/Forge), and confirm you will add one line to their instructions telling them to do so and to treat your rulings as precedent for similar rows. That line is the "learn, get better" part; the app cannot make them learn. **Decision 7 (identity):** the queue is written by a web page. Anyone holding the page URL and the secret could file a ruling in your name, and Amendment 58 treats a direct Tim statement as the highest evidence. Options: accept that risk because the secret is yours alone and the tool is personal (recommended now, zero cost); or add Google sign-in to the page later (free, more setup) so the writer can verify it was your account. Recommend: accept the secret for now, revisit if the page is ever shared.

**8: cockpit versus Explorer, and "one app".**
There is no standalone app being proposed. Both are web pages. The cockpit is the page you have today: nodes, calendar, task board, top targets, fed by a Doc that has not been updated since August 11. The Explorer is the new master viewer. "One app" is achievable: make the Explorer the home page, and carry over the cockpit panels that still earn their place (upcoming interviews, node schedule) as tabs, if their data source is brought back to life by the pipeline. Otherwise the stale panels are dropped. **Recommend:** one page, the Explorer replaces the cockpit at the same address once it works; the old page stays reachable at a sub-address for a while. Your yes or no.

**9: CSV.**
You are right that CSV is more portable, and the master's row format is already nearly CSV (pipe-separated with a payload). But the master is written by ChatGPT and Grok, so moving it to CSV means changing how they write, which is a pipeline change under the cutover plan (REV2 defers it) and outside this app by your own non-interference rule. The app is built format-agnostic: it reads the pipe format today and will read CSV the day the pipeline produces it. **Recommend:** do not change the master's format for the viewer's sake; if you want CSV, issue it as a pipeline directive when the cutover is stable. Your call.

**2, follow-up:** Apps Script needs one five-minute setup by you. Confirm you are willing, or choose the link-sharing fallback with its exposure stated in §3.1.

**5, follow-up:** seen-state needs a small Tim-owned file so phone and laptop agree. It lives outside AI_Coordination and no node reads it. Confirm.

## 9C. Second-round answers (Tim, 2026-09-30) and what was built

| Q | Tim | Applied |
|---|---|---|
| 2 | "Make it public. Create the script and store it where it needs to be. Not concerned with privacy." | `netlify/functions/master.js` fetches the fixed-ID Doc's text export; `/api/master` redirect added. Requires Tim to set the Doc to "Anyone with the link, Viewer" (the Drive tool available to Claude can only share to a named email). The page shows the exact instruction on screen until then. |
| 6, 7 | "If I overrule and ChatGPT's update is an hour away, every refresh brings back the old status. Hold my ruling local until ChatGPT's next run. Not worried about trust. Function first." | Rulings are stored on the device with a snapshot of the row's BUCKET and DISPOSITION at ruling time. They survive Refresh and overlay the grid as PENDING (magenta ◇). When the master changes the row to match, the ruling shows as canonical (cyan ◈); if the master changes to something else, it shows MASTER CHANGED for Tim to look at. Rulings never edit the master. "Copy request text" and "Copy all pending" produce Amendment 58 STATE_CHANGE_REQUEST records to hand to the writer until a queue exists. Identity deferred per Tim. |
| 8 | Yes, one app. | `pipeline.html` is a second page for now. After Tim's feedback it becomes `index.html` and the cockpit moves to `cockpit.html`. |
| 9 | Agree; see what it looks like. | Master format untouched. Parser reads the pipe format; a CSV adapter is a small addition if the pipeline ever moves. |
| 5 | Confirmed. | Seen-state is per device today (browser storage, exportable/importable from Reports). The cross-device file comes with the first write endpoint. First visit on a device baselines everything already in the master as seen, except rows added within the NEW window, so NEW means new from then on. |
| New | Automation timer monitoring: who runs what, purpose, time until next run; minimized bar with expanded view. | Bottom bar shows the next four automations with live countdowns in ET; the Automations tab shows all of them with owner, purpose, schedule, source and a verified flag, plus an editable JSON config stored in the browser. Defaults were seeded from the August cockpit feed, TASK_BOARD v269, Amendment 55 and Cutover REV2 and are all marked **unverified** until Tim confirms the times. Countdowns are computed on the device from the schedule; nothing contacts the pipeline, and last-run evidence is not available through a public export. |

**Files added:** `pipeline.html` (app), `pipeline-parser.js` (parser, shared with tests), `netlify/functions/master.js`, `netlify.toml` (redirect), `tests/parser.test.js`, `tests/make_fixture.py`, `tests/fixtures/master.sample.txt` (scrubbed 21-row fixture: company names replaced, IDs hashed, URLs and Gmail IDs replaced, evidence text blanked).

**Verified before push:** parser tests pass on the fixture and on the real export (526 rows, COUNTS reconcile, 0 parse errors, 30 eleven-cell rows, 99 heading/BUCKET mismatches, Meta #398 case). Headless Chromium smoke test at 1440×900, 844×390 and 390×844: zero page errors, grid renders 526 rows, APPLY NOW preset yields 20, drawer and ruling buttons work, filter popover opens, Reports and Automations render.

**Not done:** cross-device seen-state and ruling sync (needs a write endpoint); STATE_CHANGE_REQUEST queue file (needs A2); governance file listing (needs Drive listing access); cockpit panel migration.

## 9D. State writer (Tim's ruling, 2026-09-30)

**Ruling.** Tim: rulings and comments made in the Explorer must be saved to the master job file. Tim has final authority; this supersedes the v0.3–v0.7 gate that waited for the pipeline to name a writer surface. It is implemented as an Authorized State Writer under Amendment 58 §2 (capability-based, not tied to an agent).

**Mechanism.** `apps-script/Code.gs`, deployed once by Tim as a web app executing as Tim (`apps-script/README.md`). Endpoints: `master` (read the fixed-ID Doc text), `state` (read/write the Explorer's seen and rulings JSON in `PIPELINE_EXPLORER_STATE.json` beside the master), `ruling` (apply one ruling), `receipts` (read the receipt log). The page prefers the script for reads when configured, so the Doc no longer needs link sharing.

**Writer contract, as implemented.** Script lock; read the master's modifiedTime; find the row by exact PRIMARY_ID and fail closed on 0 or more than 1 match; mutate only that row; re-read modifiedTime immediately before committing and abort if it changed (REV2 concurrency protocol); write the row paragraph in place; recompute the `COUNTS:` line from row BUCKET values; read back and verify; append a STATE_CHANGE_RECEIPT (Amendment 58 §9 fields) to `PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS` beside the master; return the receipt to the page. Section headings are not moved (BUCKET_AUTHORITY rule). Rows in APPLIED or REJECTED_BY_EMPLOYER cannot be declined or set to pursue (protected applicant state).

**What each ruling writes.**

| Ruling | BUCKET / DISPOSITION | Payload keys | TAGS |
|---|---|---|---|
| Note only | unchanged | `TIM_NOTE=<text> [Tim YYYY-MM-DD]` | — |
| Pursue | READY_TO_PURSUE / RESOLVED/PURSUE_CANDIDATE | `TIM_RULING=PURSUE`; prior `DECLINE_REASON_CODE` moved to `DECLINE_REASON_CODE_PRIOR` | `TIM_OVERRIDE_PURSUE_<date>` |
| Do not pursue / Decline | DECLINED_BY_TIM / RESOLVED/DECLINED_BY_TIM | `TIM_RULING=DO_NOT_PURSUE`, `DECLINE_REASON_CODE` (chosen, default TIM_EXPLICIT_DECLINE), `DECLINE_REASON_TEXT`, `REOPEN_TRIGGER=Tim explicitly overrides.`, `TIM_DISPOSITION=TIM_PASS_<date>_EXPLORER` | `TIM_DECLINE_<date>` |
| I applied | APPLIED / RESOLVED/APPLIED_CONFIRMED | `APP_DATE`, `APP_STATUS_EVIDENCE=Tim direct statement…`, `ANTI_RESURRECTION=YES`, `TIM_RULING=APPLIED` | `TIM_APPLIED_<date>` |
| every write | | `STATE_SOURCE=TIM_EXPLORER:<REQUEST_ID>`, `STATE_UPDATED_AT=<ISO>` | |

These reuse vocabulary the master already carries (`DECLINE_REASON_CODE`, `REOPEN_TRIGGER`, `TIM_DISPOSITION`, `APP_DATE`, `ANTI_RESURRECTION`). New keys are `TIM_NOTE`, `TIM_RULING`, `STATE_SOURCE`, `STATE_UPDATED_AT`, `DECLINE_REASON_CODE_PRIOR`. Nodes that parse payload keys they do not know should ignore them; none of the existing keys change meaning.

**For ChatGPT and Grok.** Tim's rulings now arrive in the master directly, tagged `STATE_SOURCE=TIM_EXPLORER:*`. Per Amendment 58 §6 these are direct Tim statements and outrank posting-state inference. Receipts are in `PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS` for Foreman's verification duty (§13). No change to any node's schedule or behavior is requested; whether to read `TIM_NOTE` / `TIM_RULING` as precedent is the "learn, get better" instruction Tim said he would issue.

**Identity.** Deferred by Tim ("not worried about trust; function first"). The passphrase is set in the script and entered once in the page. Anyone with the page URL and the passphrase could write rulings in Tim's name.

**Verified.** `tests/writer.test.js`: decline, pursue-override, note, applied, protected-state refusal, pipe-in-payload preservation, COUNTS recomputation; on the real export the recomputed COUNTS line equals the existing one exactly and a note mutation preserves every existing field on all 526 rows. Browser end-to-end with a mocked script endpoint: a "do not pursue" ruling writes the row, the page reloads the master, the row leaves APPLY NOW, shows CANONICAL, and COUNTS updates. The Apps Script runtime itself could not be executed from this session; the Drive and Docs calls are standard and the pure logic is what the tests cover.

**Not done.** Wife/second-user attribution (all rulings are Tim's). Real-run verification of the Apps Script after Tim deploys it.

## 9E. Scout intake architecture (Tim's ruling, 2026-09-30)

**Ruling (verbatim intent).** One canonical population, one fixed master, one state per job from discovery to final disposition. Scout's job is to find and admit, not to reject. UNKNOWN IS A RESEARCH STATE, NOT A REJECTION REASON. Do not hard-code the population size (562 verified today). Do not create a second job population, a second ledger or a replacement master. Do not change the fixed ID. Never delete historical rows. Do not change Tim's application protections. Do not break any scheduled AI work.

### 9E.1 Buckets
| Bucket | Meaning | Who sets it |
|---|---|---|
| `SCOUT_INTAKE` | Admitted discovery awaiting Claude analysis and Forge verification. Identity resolved (no existing match). | intake only |
| `DISCOVERY_LEAD` | Admitted discovery whose identity could not be resolved against existing rows (ambiguous employer+title, conflicting or unstated location, several candidates). Carries `POSSIBLE_MATCHES`. Never asserts identity. | intake only |
| `INVALID_DISCOVERY` | A row Tim or Forge judged not to be a real, distinct opportunity (mirror, agency repost, wrong entity). Row preserved, never deleted. | Tim ruling / Forge |
| `MANUAL_RESEARCH`, `BLOCKED` | unchanged: unresolved research states | Forge / Tim |
| `READY_TO_PURSUE`, `APPLIED`, `REJECTED_BY_EMPLOYER`, `DECLINED_BY_TIM`, `DUPLICATE`, `CLOSED_DEAD` | unchanged final/terminal states | Forge / Tim |

Intake can only create `SCOUT_INTAKE` or `DISCOVERY_LEAD` rows. A `PROPOSED_BUCKET` in a record is ignored. Intake never edits an existing row for any reason; a re-discovered job returns `EXISTING_MATCH` with the existing PRIMARY_ID and bucket, so `APPLIED` and `REJECTED_BY_EMPLOYER` (protected applicant state, Amendment 58) and every finalized state are untouchable from intake.

### 9E.2 Writer: `action=intake`
Same Apps Script web app as §9D. Sequence: LockService lock → read the fixed master (never a search) → parse → load rules → sanitize each record (newline, `; ` and ` | ` neutralized, non-http URLs dropped, 400-char cap) → classify against never-consider rules → dedupe in order INTAKE_KEY replay, REQ core token, canonical URL, normalized employer+title(+location) → allocate next INV and a collision-checked `V2I-` PRIMARY_ID → re-check modifiedTime → insert grouped under `=== SCOUT_INTAKE (n) ===` / `=== DISCOVERY_LEAD (n) ===` headings before the END marker → recompute `COUNTS:` (new buckets appear once they have rows; key order preserved) and `END … (N rows)` → save → reopen and read back every inserted line byte-for-byte → `INTAKE_RECEIPT` with `COMPLETION_STATUS=COMPLETE` only if readback matched → append a `SCOUT_RUN_METRICS.jsonl` record. Batch limit 200 records. Idempotent: replaying a batch creates zero rows (`REPLAY` by `INTAKE_KEY`). Fail closed: an ambiguous identity becomes a `DISCOVERY_LEAD`, never a merge; a modifiedTime change between read and write aborts with no write.

Provenance on every intake row: `INTAKE_KEY`, `SCOUT_RUN_ID`, `DISCOVERED_AT_ET`, `DISCOVERY_SOURCE`, `SOURCE_URL`, `SOURCE_PROVIDER`, `REQ_ID`, `IDENTITY_CONFIDENCE`, `INITIAL_UNKNOWN_FIELDS`, optional `POSSIBLE_MATCHES`, then any Scout facts (`PAY_POSTED`, `DEGREE_TEXT`, `FLEX_HINT`, `REPORTING_LEVEL`, `EMPLOYER_DOMAIN_HINT`, `SCOUT_NOTES`, `POSTING_DATE`, `REMOTE_HYBRID`), `DATE_ADDED`, `NOTIFICATION_SOURCE`, `STATE_SOURCE=SCOUT_INTAKE:<run>`, `STATE_UPDATED_AT`. Contract with JSON shapes: `docs/SCOUT_INTAKE_CONTRACT.md`.

### 9E.3 TIM_NEVER_CONSIDER_RULES (canonical Doc, amended 2026-09-30)
The authoritative hard-exclusion configuration is the Google Doc **`TIM_NEVER_CONSIDER_RULES`** in AI_Coordination, Drive ID `1qLeVwmW76Cm_lHdleb342sE7_ej4dqTfODR1TcnF5os` (ChatGPT's amendment; supersedes the JSON-beside-the-master design of the first draft of this PR). It is configuration only and never a job store. Format: KEY=VALUE header (`STATUS`, `DEFAULT_ACTION=ALLOW_INTAKE`, `UNKNOWN_RULE`, …), general interpretation rules, then rule blocks `RULE_ID`, `CATEGORY`, `ACTION`, `MATCH`, `DO_NOT_MATCH`, `REASON`, `EXCEPTION`, `STATUS`. Current rules: NC-001 PHARMACEUTICAL_MANUFACTURER, NC-002 MEDICAL_DEVICE_MANUFACTURER, NC-003 FOOD_OR_BEVERAGE_MANUFACTURER, NC-004 RESTAURANT_OR_FOOD_SERVICE.

One implementation path: the writer parses the Doc (`parseRulesText`) and the Explorer renders that parse read-only; neither hard-codes a category. Scout classifies each discovery with a rule id and `EXCLUSION_CONFIDENCE`; the writer excludes only when the cited rule is ACTIVE with `ACTION=DO_NOT_ADD` and confidence is `HIGH`. `MED`/`LOW`, an unknown or inactive id, an unreadable Doc, or the writer's own domain-hint heuristic all admit the record with `NEVER_CONSIDER_REVIEW_NEEDED`. Every exclusion is logged with the audit contract (run, time, company, title, location, source, URL, rule id, confidence, reason, `TIM_OVERRIDE=NO`) and counted per rule id in the run metrics; an exclusion can only cite an ACTIVE rule because the writer, not Scout, makes the decision; Scout's legacy pre-exclusion list is re-adjudicated as candidates, never accepted as excluded. Existing rows are never deleted or reclassified by a rule. Editing is Tim's, in the Doc; the Explorer's Rules tab is read-only in this PR (safe write-back with readback would widen scope; see §9E.6).

### 9E.4 Explorer
Presets: All · New Scout intake (hot) · Discovery leads (hot) · Needs analysis (`SCOUT_INTAKE`, `DISCOVERY_LEAD`, `MANUAL_RESEARCH`, `BLOCKED`) · Ready to pursue · New to me · My rulings · Declined · Applied · Terminal/archive. `SCOUT_INTAKE` rows are drawn in the focus color, and the status readout shows "<n> SCOUT NEW". Row detail is grouped: Scout discovery facts / Claude proposed analysis (`CLAUDE_*`, `ANALYSIS_*`, `PROPOSED_*`) / Forge verified facts / Tim rulings. Dispositions: Pursue, Do not pursue, Decline (coded), I applied, Manual research, Closed-dead, Invalid discovery (offered on `SCOUT_INTAKE`, `DISCOVERY_LEAD`, `MANUAL_RESEARCH`, `BLOCKED`), Mark duplicate (PRIMARY_ID field, prefilled from `POSSIBLE_MATCHES`), Note only. `APPLIED` and `REJECTED_BY_EMPLOYER` rows expose only note and clear.

Scout Quality tab (needs the writer configured for run metrics): per `SCOUT_RUN_ID` cohort with GROSS_FOUND, NEVER_CONSIDER_EXCLUDED, per-rule `<RULE_ID>_COUNT`, ENTERED_MASTER, SCOUT_INTAKE_WRITTEN, DISCOVERY_LEAD_WRITTEN, EXISTING_MATCH, WRITE_FAILED, NEVER_CONSIDER_REVIEW_NEEDED, plus the live SCOUT_INTAKE, DISCOVERY_LEAD, VALID_DISTINCT, DUPLICATE, DEAD_OR_STALE, INVALID_DISCOVERY, READY, APPLIED, DECLINED, STILL_UNRESOLVED; rates ADMISSION, VALIDITY, ACTIONABLE_YIELD, DUPLICATE, INVALID, UNRESOLVED; MEDIAN_TIME_TO_FINAL_DISPOSITION; windows Today / 7 days / 30 days. Cohorts younger than 24 h are IMMATURE, unresolved cohorts younger than 72 h are IN_PROGRESS, the rest FINALIZED; windows that include immature cohorts say so. A decline for pay, geography, FLEX or domain preference counts as a valid discovery (Scout found a real job; Tim chose not to pursue it).

### 9E.5 Migration implications
1. Nothing changes in the master until Tim redeploys the script and Scout starts posting to `action=intake`. Existing 562 rows are untouched; the new buckets appear in `COUNTS:` only once they have rows (verified byte-identical `COUNTS:` on a dry run against the live export).
2. Forge's regeneration/publication step must **preserve** `SCOUT_INTAKE`, `DISCOVERY_LEAD` and `INVALID_DISCOVERY` rows and their `SCOUT_*`/`INTAKE_KEY` keys when it rewrites the master, and must recount them. If a node rebuilds the master from an older snapshot, intake rows written since would be lost; the intake receipts and `SCOUT_RUN_METRICS.jsonl` allow a replay (idempotent by `INTAKE_KEY`).
3. Scout (Grok) needs a new output step: post discoveries as JSON to the writer instead of writing its own population file. Amendment 55's "Forge intake → Scout resolution" split becomes "Scout admits → Claude analyzes → Forge verifies" on the same row. That is a governance amendment for Tim to issue; this PR does not write it.
4. Claude's analysis and Forge's verification write to the same row through the writer (a future `enrich` action, not in this PR) or through Forge's existing regeneration. Until then those sections in the drawer read "none".
5. The parser's `BUCKETS` list is extended; older Explorer builds would still show the rows (row BUCKET is displayed as-is) but without the presets.

### 9E.6 Risks and open questions
- **Scout does not yet call intake.** Until Grok's routine is changed, `SCOUT_INTAKE` stays empty; nothing breaks.
- **Passphrase is shared** between Tim's page and Scout. A leak lets anyone add intake rows (never finalize or edit). Rotate by editing `Code.gs`.
- **Identity resolution is heuristic.** Wrong `EXISTING_MATCH` on a req-ID collision across employers is possible in theory; the req core must be at least 5 characters and match exactly. Ambiguity always fails closed to a lead.
- **Never-consider depends on Scout's classification.** The writer excludes only on a cited ACTIVE rule at HIGH confidence; without Scout's rule id nothing is excluded (a domain hint only flags a review). That is the amendment's intent (nothing disappears), but it means Scout's prompt must actually emit `NEVER_CONSIDER_RULE_ID` and `EXCLUSION_CONFIDENCE`.
- **Rules Doc is read-only in the Explorer.** Write-back to the Doc with rule-id preservation and readback is deferred; Tim edits the Doc. Requires Tim's approval to add later.
- **Rules Doc readability.** The script runs as Tim and reads the Doc by fixed ID; if the Doc is moved or its ID changes, the receipt reports `RULES_STATUS=UNAVAILABLE` and intake defaults to ALLOW_INTAKE with review flags (nothing excluded, nothing lost).
- **Google Docs concurrency.** LockService plus modifiedTime re-check covers the writer against itself and against Forge's Drive writes, but a Forge rewrite that starts before and saves after an intake would overwrite intake rows (see migration item 2).
- **Run metrics live beside the master** (`SCOUT_RUN_METRICS.jsonl`), not in the master; the quality tab needs the writer configured on that device.
- **`END … (N rows)` marker** is now recomputed by both actions; if Forge stops emitting it, the writer simply leaves it absent.

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
- 2026-09-30 v0.9a — ChatGPT's *Canonical never-consider ruleset + Scout intake integration* amendment applied (Tim-forwarded): rules source is the canonical Doc `TIM_NEVER_CONSIDER_RULES` (fixed ID) parsed by the writer, read-only in the Explorer; Scout classification with HIGH/MED/LOW; five explicit intake outcomes; per-rule counters and exclusion audit contract; §2.1.5 and §5.4 carry the amendment's exact wording. Tests 1–22 of the amendment mapped in the PR. Same PR (#4), not merged, not deployed.
- 2026-09-30 v0.9 — Tim's Scout-intake architecture ruling. Writer gains `action=intake`, `rules`, `runs`; parser gains the three buckets and END-marker check; `pipeline-quality.js` and the Scout Quality and Rules tabs added; presets, row detail sections and dispositions revised; §2.1 item 5 and §5.4 rewritten (Explorer is never a second state store). Tests: parser, writer, intake (synthetic 562+ population, no size assumption), rules, quality; all pass, also against the live 562-row export in dry run. Built on branch `feat/scout-intake` as a draft PR; not merged, not deployed, no Drive files modified.
- 2026-09-30 v0.8 — Tim ruled that rulings must be saved to the master. Added the Apps Script state writer (`apps-script/Code.gs`, README), writer settings in the page, cross-device state sync, writer tests. §9D. Non-interference rule unchanged. No Drive files modified by this session; Tim deploys the script himself.
- 2026-09-30 v0.7 — Second-round answers recorded (§9C). Step 1 built: `pipeline.html`, parser, Netlify master function, tests, scrubbed fixture. Verified against the real export and in headless Chromium at three viewports. No Drive files modified by this project; Tim shares the master Doc by link himself.
- 2026-09-30 v0.6 — Tim's rulings on the eleven numbered questions recorded (§9A) and applied to §3.1, §4.2, §4.3, §5.0, §7, §8; open items restated in plain language with recommendations (§9B). Repo visibility verified public. Build on hold per Tim. No Drive writes, no code.
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

