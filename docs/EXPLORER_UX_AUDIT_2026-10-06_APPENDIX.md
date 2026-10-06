# Pipeline Explorer UX audit — appendix (inventories)

Date: 2026-10-06. Audited at commit `6b37ab2` (main). Companion to `EXPLORER_UX_AUDIT_2026-10-06.md`. These are the raw inventories the recommendations were built from. Line numbers refer to physical lines in `pipeline.html` (many are very long) and the named modules.

How it was gathered: four read-only code audits (UI structure, warnings/writer state, charts, dead logic), headless Chromium screenshots of the live page at 1440×900 and iPhone 390×844 against the scrubbed fixture with a mocked Writer (`scratchpad/audit/shoot2.js`, `fault.js`), and a simulated Writer fault payload to see how the strip and panel render.

---

## A. Views, navigation, toolbars, row actions, mobile, URLs, AI hooks, settings

### A.1 Page structure (`pipeline.html` 233–280)
- Header 236–246: brand, BUILD badge+panel (238), WRITER badge+panel (239), `#readout` (240), `<nav>` tabs (241–243), Compare / Compact / Refresh (244), gear + `#layout-toggle` (245).
- Alert strips: `#load-alert` (252; `renderLoadAlert_` 461–472), `#writer-alert` (253; 364).
- Bars: `#presets` 254, `#filters` 255, `#mapfilters` 256.
- `<main>` holds 12 `.view` divs (258–276); `.view.on` shows one (43). Footer `#autobar` 278. Header popover `#pop` 280.

### A.2 Top-level views
| View id | Nav label | Content | Reached by | Mobile |
|---|---|---|---|---|
| `view-today` | Today | `renderToday` 1365–1367: 4 action tiles, Next decisions / Interviews 14d / Research >72h lists, research-gaps chart, next-actions chart, Scout loop summary, heading maintenance | Nav; boot default (1376) | 2-col tiles, 1-col grid (207) |
| `view-pipeline` | Pipeline | `#dash` + `#worksplit` (`#gridpane` table, `#drawer`) | Nav, Today, Intake, map, chart drill-downs | dash re-gridded (137,159,160); drawer overlays grid (137) |
| `view-intake` | Manual Intake | `pipeline-manual-intake.js` 7–16 | Nav | 204 |
| `view-companies` | Target Companies | `pipeline-target-companies.js` 120–129 | Nav | none |
| `view-reports` | Reports | `renderReports` 1219–1249: 6 chart cards + Integrity, Buckets, My rulings, Heading≠BUCKET, Aging, Decline codes, Sources, Data quality | Nav (rendered from `render()` 663) | 1-col charts (159) |
| `view-quality` | Scout Analysis | `renderQuality` 1330–1347 | Nav; Today button | 1-col |
| `view-rules` | Rules | `renderRules` 1193–1216: outline, search, Global FLEX policy form, reader, source editor | Nav | 1-col |
| `view-documents` | Job Documents | `renderDocuments` 1169–1191: Resumes / Cover Letters / Supporting / Tim's Voice, iframe preview, ATS/AI proxy score | Nav; `t=ats` redirects here | stacked |
| `view-columns` | Columns | `renderColumns` 1286–1293 | Nav | — |
| `view-scoring` | Scoring | `renderScoring` 1300–1306 + `enhanceScoringControls_` 1314–1325 (MutationObserver 1326) | Nav | — |
| `view-settings` | (gear) | `renderSettings` 1349–1359 | Gear; forced when no writer (445) | 16px inputs |
| `view-automations` | (none) | `renderAutomations` 1278–1284 | `#autobar` click only (1276); deep link `t=automations` renders blank | — |
| `view-ats` | (none) | Always empty; `switchTab` maps `ats`→documents; `renderATSProfile` 1294 never called | — | — |

### A.3 Navigation model
- `switchTab()` 1369 toggles `.on`, shows presets/map/filter bars only on Pipeline, `pushHash()`, renders the tab.
- Hash: `#`+URI-encoded JSON `{t,p,s,f}` via `history.replaceState` (1372–1373). No job deep link (`S.focus` not in hash). Chart filter, search, map mode not in hash. Last view not persisted (boot → Today).
- `?src=` (443) only skips state/scoring/runs/rules/documents loads; `Source.url`/`Source.netlify` (428–431) never called.
- Drawer tabs Overview / Interview / Timeline / Compensation (740–742).
- Keyboard (801, Pipeline only): J/K ↑/↓ rows; Enter open; Esc close; 1–4 decision presets (1 READY, 2 MANUAL_RESEARCH, 3 DECLINE TIM_EXPLICIT_DECLINE, 4 MANUAL_RESEARCH + "Research requested by Tim:"); D decline; A applied; N note.

### A.4 Toolbars and filters
- Header: `#compare-open`, `#density-toggle` (`body[data-density]`), `#refresh`, `#settings`, `#layout-toggle` (touch phones only; 248–250; reloads page with `px.layout`).
- Presets 584–599; table at 563–583: ACTIVE, MAINTENANCE, ALL, SCOUT_INTAKE, LEADS, NEEDS_ANALYSIS, MISSING_DATA, APPLY_NOW, NEW, RULED, DECLINED, APPLIED, NEEDS_TIM, DECLINE_CANDIDATES, HIGH_PAY, LOCAL, REMOTE, PINNED, TERMINAL. Chip counts use `S.rows` (row-lines) while KPIs use `distinctRows_` → numbers can disagree.
- `.pipeline-tools` 588: Select visible, Clear selection, N selected, Decline/Research/Invalid (bulk), AI discover missing data N, `#search`, Mark visible seen. `#predicate` 589/639 hidden on mobile.
- Filter chips 633–637; map points bar 256/887 (`mapRows_` 1034); header popover `openPop` 667–687 (sort + enum/text/date/money filters); column resize 853–856; Columns tab (desktop/phone chip sets, bucket order, NEW-days not persisted).
- Desktop-only: `#predicate`. Mobile-only: Expand map (211/219), `#layout-toggle`. Hidden on mobile unless map full screen: legend, mode buttons, Recenter/Reset. `#markseen` hidden in phone landscape (172).

### A.5 Row selection, row controls, drawer
- Select: row click 660 → `selectMapRow_` 992–995 (resets preset/search/filters if row hidden; sets map mode selected) → `openRow` 798 (sets `S.focus`, marks seen, opens drawer, re-renders) → scroll into view.
- Inline cells 642–657: NEW cell (checkbox, ★ pin, ◆ NEW, CHANGED), TIM_RULING glyph, COMPANY write-status tag + parse `!`, BUCKET § mismatch, salary/FLEX `~` with tooltip, IDENTITY_CONFIDENCE badge. **No per-row action buttons. SOURCE_URL column renders the preferred link as plain text (518, 650), not a hyperlink.**
- Bulk 806–847: DECLINE / MANUAL_RESEARCH / INVALID_DISCOVERY with bucket gates (810–814); `batch` in chunks of 50.
- Drawer: desktop in-flow pane 46% (380–680px) (86); ≤980px 52% (136); mobile absolute overlay (137). Close ✕ 800 / Esc 801.
- Overview (`renderOverview` 751–772), in order: Tim decision form (state select of 9 states, reason code, Duplicate-of, note; Save decision, Undo last, Compare, Pin) → Current state → Duplicate warning (695) → Opportunity rating card (736) → FLEX-adjusted fit + Source links (756) → Compensation strip (698) → Research gaps / enrichment form (699–704; Save enrichment = ENRICH ruling; Request AI research = `data_discovery`) → Attention signals (759) → AI context (760) → on-demand narrative evidence (744–750) → write-status line + shortcut hints.
- Interview 787–792: date/status, contacts, JD link uses `r.payload.SOURCE_URL` or first raw URL (**bypasses PipelinePolicy**), triage note (`interview_note`), history (`interview_notes`). Timeline 793–797 (`events`). Compensation = `compStrip`.
- Ruling mapping (`saveTimDecision` 773–786): READY_TO_PURSUE→APPLY_NOW/YES; DECLINED_BY_TIM→DECLINE; note only→NOTE; others→kind = state. Write status LOCAL_DRAFT→SUBMITTING→READBACK_PENDING/WRITE_FAILED/RESULT_UNKNOWN→VERIFIED/READBACK_UNCONFIRMED (481, 784; `rulingState` 494).
- **No IDENTITY ruling control in the UI** (Writer supports it: `Code.gs` 241, 1078, 1409, 1442). No per-job copy. No packet/handoff/cover-letter generation.

### A.6 Mobile
- Boot script 7–13: `touch-phone` class when touch + min screen side ≤500px; `force-desktop` (viewport 1280) when `px.layout==='desktop'` or Safari desktop-mode UA. JS `phoneLayout()` 550 uses a different rule (innerWidth ≤760, or ≤980 + coarse pointer).
- Breakpoints: main `(max-width:760px),(pointer:coarse) and (max-width:980px)` at 75,137,159,160,171,176,214–221; 980 at 136,158; 1100 at 157; 760-only at 204,207; `max-height:520px` at 76,161,173,177 (173 and 177 duplicate); 172, 231 landscape; `pointer:coarse` 212 (map), 213 (16px inputs); reduced-motion 174.
- No card view: same `<table>` with PHONE_DEFAULT columns (309), 36px rows. No bottom bar/sheet; drawer = full overlay; map full screen with safe-area (222–229); `100dvh` (171). Header wraps to its own scrolling row (171).
- Touch: map pan/pinch (`bindMapWheel_` 1001–1027); column resize pointer events. Horizontal overflow: `#gridwrap` (85), preset list, nav, filters, detail tabs, tools (215–217), mapfilters (163), compare, intake table.
- CSS override stacking: `#drawer` restated at 63, 86 (`!important`), 136, 137, 171; `#dash`/map card at 80,112,136,137,141,146,158–161; `.map-outline` 121,147,167,192; `#search` 75,171,218; `.pipeline-tools` wrap 171 vs nowrap 215; three overlapping mobile media blocks (75, 171, 214–221).

### A.7 External URL handling
- `PipelinePolicy.links(r)` (`pipeline-policy.js` 5–11): scans INITIATING_URL, INTAKE_SOURCE_URL, MANUAL_INTAKE_URL, SOURCE_URL, COMPANY_SOURCE_URL, CANONICAL_URL, JOB_URL, SOURCE, REQ, raw row; `preferred` = COMPANY_SOURCE_URL → SOURCE_URL → first; `initiating` = INITIATING_URL → first; `companyConfirmed` when `_CONF` VERIFIED/HIGH.
- Used by: grid SOURCE_URL text (518), `researchGaps_` (554), research card (700–701), "Source links" (756), enrichment save (712: keeps INITIATING_URL, new link → SOURCE_URL). Interview tab bypasses it (788).
- Opening: `linkify()` 799 → `<a target=_blank rel=noopener>`; no `window.open`; no tracking strip in the UI (canonicalisation only in Writer `canonUrl`, `Code.gs` 1595–1606).

### A.8 AI / workflow hooks
- `requestDiscoveryForRows_` 723–731 (≤50 rows; `data_discovery` with a hard-coded instruction string 727). Triggers: toolbar 593, drawer 770.
- Reads: `isDeclineCandidate_` 555–562 (PROPOSED_DISPOSITION, CLAUDE_REVIEW_NOTE, RECOMMENDATION); AI context card 760 (CLAUDE_NOTE, ANALYSIS_NOTE, FIT). `keyGroup` + SCOUT_KEYS/TIM_KEYS (306–308) dead.
- Documents: Approve resume (`approve_resume` 1186); local ATS/AI proxy (`documentProxyScore_` 1111–1121; pasted-text fallback `px.docPasted`); `document_text` 1167. Interview notes 790–791. Copy pending writer JSON (`scrText` 1250–1253), Export/Import rulings (1247–1248).
- Rules tab 1193–1216: Global FLEX form → `save_rules` with readback (1202–1208); source editor save (1214); "Load approved FLEX / URL update" (1209) injects hard-coded prose. Target Companies saves through `save_rules`. Scoring: local draft `px.scoring`, Publish `save_scoring_model` (1323), Load published (1324). `upsert_application` is only in the requestId map (394), never posted.
- Every write via `gsPost` 410–427; refused unless freshness LIVE; requestId added; unknown results recovered via `request_result`.

### A.9 Settings and localStorage (`px.` prefix, `LS` 299)
`layout` (raw), `cfg` {url,key} (key sent as `&key=` on GET 391; POST body 414; `x-writer-key` header in manual intake), `seen`, `rulings`, `pins`, `colWidths`, `colWidthsPhone`, `mapMode`, `docSelection`, `cols`, `autos`, `scoring`, `scoringLocalEdited`, `flexWeightV2`, `flexColumnsV1`, `scoreColumnsV1`, `compare`, `density`, `cache`, `baselined`, `writeError`, `lastWrite`, `geoCache`, `docPasted`. Not persisted: `newDays`, search, chart filter, focus, detail tab.

### A.10 Size and render path
Largest functions: `renderRules` ~10.7KB, `renderReports` ~7.4KB, `renderQuality` ~7.3KB, `renderOverview` ~6.3KB, `render` ~5.2KB, `renderScoring` ~4.5KB (+3.2KB), `renderToday` ~4.2KB, `bindMapWheel_` ~4KB, `renderDashboard` ~4KB, `bulkAction` ~3.8KB, `researchCard_` ~3.5KB, `renderWriterStatus_` ~3.5KB. Render: `load()` 442 → `PipelineLoader.load` → `apply()` 476 → `buildColumnModel`+`renderPresets`+`render` 630 (readout, dashboard/map, full table `innerHTML`, sticky, widths, resize, then active tab). `render()` also on every `resize` and search keystroke. Cells via `val()` 498–530 → `scoreFor_` 495 (memoised).

---

## B. Warning / status system and Writer state

### B.1 Indicators rendered
- BUILD badge `#build-badge` (238; class 322): `.latest` green outline; `.behind`/`.unknown` amber outline. Click toggles panel.
- WRITER badge `#writer-badge` (239; 359–361): `WRITER · FROZEN|PROCESSING n|QUEUED n|IDLE` (+ `not configured`, `checking`, `monitor unavailable`, `unreachable`); ` · !` warn, ` · !!` critical. `.ok` green outline; `.warn` `#f5b041` outline; `.critical` white on solid amber fill. `unsupported`/`fetchError` force warn (343–344).
- WRITER panel `#writer-panel` 340–360: warnings (`.writer-warn`, `#f5b041` left border / amber when critical), writes ACCEPTING/FROZEN pill, live code, processing, queued (+held), unverified, trigger, migration, "Recent queue results" (last 6: SUCCESS `.ok`, /HOLD/ `.warn`, else `.bad`; error only in `title`). Mobile `position:fixed; top:48px`.
- `#readout` (240; 623–627; `freshnessLabel_` 473): COUNTS OK/MISMATCH, counts, freshness; retry text (450); `body[data-freshness=stale|none]` turns it amber (33). Hidden in phone landscape (172).
- `#load-alert` (252; 461–471): STALE·FETCH FAILED / FETCH FAILED·NO DATA (striped maroon `#3a000f/#24000a`, amber border); `.partial` brown `#2a1d00` + `#f5b041` border for ARCHIVE/EVIDENCE UNAVAILABLE. Retry button; no dismiss.
- `#writer-alert` (253; 362): shows when level warn/critical AND ≥1 warning; text `WRITER WARNING|ALERT` + first warning (criticals first, 346) + `· details: WRITER badge`. Maroon `#2a0010` + amber border; warn → brown + `#f5b041`. Click opens panel. **Not dismissible; re-renders every 60s for up to 24h for HOLDs.**
- Grid: `.write-tag` always amber (206, 647) for LOCAL DRAFT…CANONICAL…LAST VERIFIED·CACHED; glyphs ◆ new (green) ◈ rule (teal) ◇ pend (amber) `!` err (amber) CHANGED (teal); `priority-hot` lime (191, 643; `pipeline-attention.js` 5–10); `.conf` pills (95): VERIFIED/HIGH green, ESTIMATED/MED teal, UNKNOWN/LOW amber, compound labels (`POSTED · UNVERIFIED` etc.) uncoloured; `~` prefix on non-VERIFIED salary/FLEX with tooltip only (652–653); `.gap-list` amber (94, 702); bucket colours (200).
- Scout Analysis run status (1345): WRITE NOT PERSISTED / NEEDS RESOLUTION / FAILED `.bad` amber; PENDING VERIFICATION / RUN INCOMPLETE amber; COMPLETE green; maturity colours. Today text lines (1365–1367). Intake statuses (202–203). `.maintenance-warning` (206, 1361). `#autobar` (1275). Inline `#edit-status`, `#enrich-status`, `#rules-status`, `#score-msg`. **No toasts; nothing auto-dismisses; strips have no close.**

### B.2 `writer_status` payload (`Automation.gs` 209–293)
Fields: `ok`, `now`, `build`, `errors[]` (per-part soft failures), `freeze` (`readFreeze_` `Code.gs` 857–860; unreadable → frozen), `migration`, `queue{pending,oldestPendingAt,processing[{file,claimedAt,ageMs}],hold[]}`, `triggerInstalled`, `recentRuns` (last 8 of `WRITER_QUEUE_LOG.jsonl`; `docAccess`/`errorStack` not surfaced), `recentHolds` (24h window `STATUS_RECENT_HOLD_MS`; `recovered` via `partialHoldRecovered_` 150–159 — only when every request has an ID and all are COMPLETE), `unverified{count,oldestWrittenAt}`, `warnings[{level,code,message}]`, `level` (critical > warn > ok).

| Code | Level | Condition |
|---|---|---|
| FROZEN_FOR_MIGRATION | warn / critical | frozen during LIVE migration; critical after 30 min |
| FROZEN_UNEXPECTED | critical | frozen with no running migration |
| CLAIM_ABANDONED | critical | PROCESSING claim ≥8 min |
| CLAIM_RUNNING_LONG | warn | PROCESSING claim ≥4 min |
| QUEUE_HOLD | warn | any `HOLD__` file in queue (no expiry) |
| QUEUE_BACKLOG | warn | oldest pending >10 min |
| TRIGGER_MISSING | critical | queue trigger not installed |
| WRITE_UNVERIFIED | warn / critical | oldest unverified >5 min / >20 min |
| PARTIAL_HOLD / HOLD_ABANDONED / HOLD_UNMOVED | warn | unrecovered HOLD-type run in 24h |
| STATUS_PART_UNAVAILABLE | warn | one per `errors[]` entry |

**FAILED and REJECTED_SCHEMA never produce a warning** (`terminalStatus_` 144–148). That includes governance rejections: `identity ambiguous` (`Code.gs` 1539), `SOURCE_URL_REQUIRED` (1546), `EVIDENCE is required` (1520), intake `WRITE_FAILED` (1807).

### B.3 Explorer consumption
Poll 60s while visible (366–370), on load (1375), settings save (1356), visibilitychange, badge open, Refresh now. Level→UI: ok green/no strip; warn yellow badge+`!`+brown strip; critical white-on-amber badge+`!!`+maroon strip. FAILED runs: panel pills only (last 6), tooltip error, no escalation. HOLDs: warn badge + full strip for 24h unless recovered. QUEUE_HOLD until a human removes the file. Explorer never reads `docAccess`.

### B.4 Colour tokens in effect
`:root` declared three times (17, 182, **198 wins**): `--ng #b8f36a` lime, `--nc #61d9c4` teal, `--nm #e9b06c` amber. Green: `.pill.ok`, `.writer-badge.ok`, `.build-badge.latest`, `.conf.VERIFIED`, `.g.new`; `button.neon` (#b8f36a / #709447 border / #13200d) for Refresh and every Save/Apply/Publish. Yellow-orange `#f5b041` (hard-coded): warn badge, writer-warn border, `.pill.warn`, warn strips. Amber `--nm`: everything named bad/critical/danger plus write-tag, BLOCKED/TIM_DECISION buckets, intake FAILED, maintenance, security-note. `button.danger` (22) unused. Gold `#e4c66d` doc-score warn. Red: only maroon strip backgrounds and the scoring heat gradient. Hover border teal; `nav button.on`/`.chip.on` teal.

### B.5 Load path (`pipeline-loader.js`)
Writer GETs only (`gsGet` 391). `PipelineLoader.load` 146–218: parallel `master`, `migration_status`, `archive`, then `document_text` (evidence). Retries 3s/8s on network/HTML/transient doc errors; not on structural errors. `/api/master`, `/api/feed` return 410. Cache `px.cache` written after archive+evidence settle; read only on master failure → freshness LIVE / STALE / NONE; `gsPost` refuses unless LIVE (411). Archive rows hydrated into `S.rows` with `ARCHIVE_STATE=ARCHIVED_TERMINAL` (67–90).

### B.6 Classification
Active fault: load-alert STALE/NONE; FROZEN_UNEXPECTED; TRIGGER_MISSING; CLAIM_ABANDONED; WRITE_UNVERIFIED critical; QUEUE_BACKLOG; badge `unreachable`; COUNTS MISMATCH; own ruling WRITE FAILED / RESULT UNKNOWN.
Informational/historical: recent-run pills incl. governance FAILED; Scout run status; cohort maturity; BUILD behind; heading maintenance; trust labels; research gaps; priority-hot; autobar; LAST VERIFIED·CACHED.
Ambiguous: HOLD-type warnings (audit facts rendered as outage); QUEUE_HOLD; FROZEN_FOR_MIGRATION; WRITE_UNVERIFIED warn; CLAIM_RUNNING_LONG; STATUS_PART_UNAVAILABLE; load-alert.partial; `monitor unavailable`; READBACK PENDING/UNCONFIRMED.

---

## C. Charts and KPIs (40 items)

Key facts: archived rows are hydrated into `S.rows` and **no chart filters on `ARCHIVE_STATE`**, so terminal slices show live+archived together (521 of 827 rows at cutover) and collapse toward zero when the archive read fails. No chart uses `scoreFor_`/`Policy.assess`. `OVERALL_RATING`, `SCREEN_GATE`, `ATS_MATCH_SCORE` are viewer-computed; `pipeline-scoring.js:51` reads payload ATS keys only as legacy overrides; ATS weight is 0. `pipeline-scoring.js:20 MODEL_VERSION='2026-10-03.1'` vs `SCORING_MODEL.md` `2026-10-04.1`. Design brief §2 lists "No charts" as a non-goal.

Writer-written keys: SCOUT_RUN_ID, DISCOVERED_AT_ET, DISCOVERY_SOURCE, SOURCE_PROVIDER, NOTIFICATION_SOURCE, DATE_ADDED, STATE_UPDATED_AT, REQ_ID, IDENTITY_CONFIDENCE, POSSIBLE_MATCHES, DECLINE_REASON_CODE, APP_DATE, FLEX_CLASS/FLEX_MODIFIER, ADJUSTED_FIT/PURSUIT_STATUS, run COUNTERS. Agent ENRICH vocabulary: SCOPE_FIT_RAW, FIT_CONF, SALARY_BASE_EST, SALARY_BASIS, SALARY_CONF, DEGREE_*. Legacy per `pipeline-evidence.js`: other fit keys (23), SALARY_MIDPOINT, SALARY_BASE_LOW/HIGH, GROK_SALARY, SALARY_POSTED, PAY, SALARY_ESTIMATED (29–33). Nothing writes: DOMAIN_FIT, PAY_MATCH, TITLE_FIT/LEVEL_FIT, DOMAIN_CONF, FLOOR_STATUS, SALARY_ASOF/EXPIRES, INTERVIEW_DATE, ALT_LOCATIONS, LATITUDE.

Bucket vocabulary: `BUCKET_ORDER_DEFAULT` (303) = Writer BUCKETS (different order). `ARCHIVE_BUCKETS` = CLOSED_DEAD, DUPLICATE, DECLINED_BY_TIM, REJECTED_BY_EMPLOYER; INVALID_DISCOVERY stays live. "Terminal / archive" preset (582) omits DECLINED_BY_TIM and adds INVALID_DISCOVERY. `TIM_DECISION_REQUIRED` is in BUCKETS but the Writer never sets it (one mention in `Code.gs`), so "Needs your decision" is structurally 0.

### C.1 Pipeline dashboard (`renderDashboard` 877–893)
| # | Item | Reads | Notes | Class |
|---|---|---|---|---|
| 1 | KPI Master · distinct roles | BUCKET count over `distinctRows_` | includes archive → overstates live master; same as readout | RETIRE (duplicate, misleading label) |
| 2 | KPI Applied | BUCKET=APPLIED | = Applied preset chip | KEEP |
| 3 | KPI Ready | READY_TO_PURSUE raw | also readout, Next actions, Today tile (which uses stricter APPLY_NOW preset) and chip | KEEP one source |
| 4 | KPI Awaiting AI | SCOUT_INTAKE+DISCOVERY_LEAD | = Today tile | KEEP |
| 5 | Job Location Map | LOCATION (+ALT/WORK/TRAVEL keys, remote flags; salary label; priority-hot) | most location keys not Writer-written; LOCATION is | KEEP |
| 6 | Map legend | static | omits priority-hot / approximate states actually drawn | SIMPLIFY |
| 7 | priority-hot highlight | needs pay+flex+fit+level+domain; domain keys and FLOOR_STATUS never written; hard-coded $200k | likely never fires | UNKNOWN → retire-leaning |
| 8 | Research bottlenecks bars (`attentionChart_` 869) | compMid, FLEX_CLASS/FLEX, FIT_KEYS, identity fields | duplicated on Today; gaps differ from `researchGaps_` (554) that drives the Missing-data preset | KEEP one, align |
| 9 | Next actions bars (`workloadData` 861) | 6 active bucket counts | repeats KPIs/chips; also Today and Reports | RETIRE (3rd copy) |

Header: readout builds a `ck` string never displayed. Chip counts over row-lines vs KPIs over distinct rows.

### C.2 Today (1365–1367)
4 tiles (Ready uses APPLY_NOW preset: BLOCKER, ANTI_RESURRECTION, rulings) KEEP as the single KPI row; Next decisions KEEP; Interviews next 14d reads INTERVIEW_DATE (never written) UNKNOWN; Research >72h (DATE_ADDED) KEEP; Research gaps chart RETIRE (dup); Next actions RETIRE (dup); Scout control loop text KEEP (`maturity` var computed, unused); Heading maintenance KEEP.

### C.3 Reports (1219–1240)
R1 Every pipeline state donut (`bucketData` 860) — mostly archive; SIMPLIFY to live vs archived KPI. R2 Work waiting bars — 3rd copy, RETIRE. R3 Base compensation mix — bins $150/200/250k vs model $160/220/320k; includes archive; SIMPLIFY to % pay known + median (active). R4 Where the opportunities are — overlaps map, archive included, RETIRE. R5 Discovery sources — mixes provider/channel/EMAIL categories, UNKNOWN. R6 Why Tim declined — exact copy of the reason-code table, archive-dependent, RETIRE (keep table). R7 Integrity table KEEP. R8 Buckets table KEEP. R9 Aging estimates (SALARY_ASOF/EXPIRES never written) UNKNOWN. R10 Rulings + heading-mismatch tables KEEP.

### C.4 Scout Analysis (1330–1347; `pipeline-quality.js`)
Sources are current Writer output (SCOUT_RUN_ID, DISCOVERED_AT_ET, STATE_UPDATED_AT, BUCKET; run COUNTERS, COMPLETION_STATUS, WRITE_STATUS). Intake by discovery day KEEP; Current cohort outcomes donut KEEP (terminal slices need archive); Rolling 7-day rates bars RETIRE (exact repeat of the KPI row below); Cohort maturity donut SIMPLIFY-TO-KPI (also on Today); windows KPI tiles KEEP (REJECTED_BY_EMPLOYER not summed in `window()` 48); per-run table KEEP.

### C.5 Others
Scoring geo heat map + legend (config only) KEEP. Job Documents ATS/AI proxy cards (local heuristics; ATS weight 0) UNKNOWN. Manual Intake stat tiles, Target Companies priority counts — not classified. `pipeline-charts.js` fully used. `tests/ui.browser.js:88` expects "FLEX unverified" but chart says "FLEX unresolved" (stale test).

---

## D. Screenshots (scratchpad `audit/shots/`)
`desk-main.png` (Today), `desk-pipeline-row-open.png` (grid + drawer), `desk-tab-*.png` (each view), `desk-fault-panel.png` / `desk-fault-strip.png` (simulated critical Writer state: WRITE_UNVERIFIED critical, PARTIAL_HOLD, QUEUE_BACKLOG, two governance FAILED runs), `phone-*.png` equivalents at 390×844. Observations: phone header consumes three rows (brand+badges, tools, nav) ≈ 290 px before the readout; desktop nav bar holds 11 tabs + 4 tools; desktop drawer opens beside a 35%-tall dashboard so the grid shows ~14 rows; the fault strip is maroon with amber text; FAILED pills in the panel are the same amber as the critical badge.

---

## E. Dead logic and legacy schema (each item traced by grep; live-master counts checked 2026-10-06 ~03:40 UTC on 339 live rows)

Three live defects found while tracing, not dead code:
1. **Writer dedupe ignores the URL fields it now writes.** `indexExisting` (`Code.gs:1621`) indexes REQ, `SOURCE`, `SOURCE_URL`, `JOB_URL`, `CANONICAL_URL` but not `INITIATING_URL`, `COMPANY_SOURCE_URL`, `INTAKE_SOURCE_URL`. Live master: `COMPANY_SOURCE_URL` on 129 rows, differing from `SOURCE_URL` on 97 → a rediscovery via the employer ATS URL does not match by URL. `JOB_URL`/`CANONICAL_URL`: 0 live rows, no writer.
2. **Manual Intake reads only plain `master`** (`netlify/functions/manual-intake.mjs:11`), so `link` to an archived row fails "PRIMARY_ID not found"; its stage label tests `CLAUDE_*`/`ANALYSIS_*` keys that moved to the companion.
3. **Docs instruct `GET action=master&hydrate=1`** (`ACTIVE_PIPELINE_AUTHORITY.md:31`, `MASTER_ARCHIVE_EVIDENCE_COMPANION.md:58`) while the same archive doc (33–34) says Google cannot serve that response.

| ITEM | FILE:LINE | WHY OBSOLETE | CURRENT REFERENCES | RISK | CLASSIFICATION |
|---|---|---|---|---|---|
| `TIM_DECISION_REQUIRED` bucket | `Code.gs:46`; ~19 sites in `pipeline.html` (53,200,303,557,564,569,576,595,626,811–813,858,861,879,1034,1238,1365); attention/quality/parser/loader; tests | No Writer path sets it; **0 live rows**; "Needs your decision" tile is structurally 0 | UI lists, presets, Today tile | low | PROBABLY OBSOLETE — keep in BUCKETS for parsing; retire from UI prominence |
| `BLOCKED` bucket | same | No Writer path sets it; **1 live row** | same | low | PROBABLY OBSOLETE — VERIFY the one row |
| `PACKET_SUPPORT_ONLY` | `tests/gen_population.js:18` (2 live rows carry it as legacy lead text) | legacy token, no reader | fixture only | none | SAFE TO REMOVE (fixture) |
| "VERIFY_LATER excluded" preset text | `pipeline.html:569` | disposition no longer in use (3 live rows carry key) | label only | none | SAFE TO REMOVE (text) |
| Code.gs `FINAL_BUCKETS` | `Code.gs:49`, export 2111 | never read by Writer; no test | none | none | SAFE TO REMOVE |
| Parser exports `BUCKETS/FINAL_BUCKETS/UNRESOLVED_BUCKETS/FIXED_COLUMNS` | `pipeline-parser.js:11–13,135` | unused externally; third copy | none | none | PROBABLY OBSOLETE |
| `SOURCE` payload key | `Code.gs:1625,1770`; `pipeline-policy.js:7` | not written on new rows; **22 live rows** | dedupe index, links, chart label | low | STILL ACTIVE (legacy reader) |
| `JOB_URL`, `CANONICAL_URL` | `Code.gs:1625`; policy 7 | **0 live rows**, no writer | dedupe/links | none | PROBABLY OBSOLETE — drop from index after INITIATING/COMPANY added |
| `MANUAL_INTAKE_URL` | policy 7; `manual-intake.cjs:12` | **0 live rows**, no writer | read only | none | PROBABLY OBSOLETE |
| `CLAUDE_REVIEW_EVIDENCE_URL` | — | **81 live rows** carry it; zero readers in code | none | — | DATA ONLY — add a reader (evidence links) rather than delete |
| Link precedence ×4 | `pipeline-policy.js:7–11`; `pipeline.html:518,788,868`; `Code.gs:1350,1772` | four orders; Interview card (788) is the outlier | — | med | STILL ACTIVE — consolidate on `PipelinePolicy.links` |
| `duplicateCandidates` | `pipeline.html:695` | naive REQ/company/title substring; `UNCAPTURED` rows match each other; no normEmployer/canonUrl | drawer dup card 752,755 | med | STILL ACTIVE — diverges from Writer `matchExisting` |
| `usableReq_`/`hasResolvedIdentity_` | `pipeline.html:867–868` | placeholder set narrower than Writer `IDENTITY_PLACEHOLDER_RE` (`Code.gs:1293`) | gap chart 869; test | low | STILL ACTIVE — divergent |
| "no REQ and no URL" diagnostic | `pipeline.html:1242` | checks `-` only, not `UNCAPTURED` | diagnostics | low | PROBABLY OBSOLETE predicate |
| `parsePayload` ×3 | `pipeline-parser.js:32`; `Code.gs:1273`; `pipeline-loader.js:21` | parser copy drifted (truthiness merge, `scoutAction` vs `lead`); loader copy sync-tested | — | med | STILL ACTIVE — unsynced duplicate |
| `parseMoney` | `pipeline-parser.js:111` | does not strip URL digits (fix went to `moneyNumbers`) | money filter 609 | low | PROBABLY OBSOLETE — VERIFY |
| Netlify `/api/manual-intake` + Blobs queue | `netlify/functions/manual-intake.mjs`; `netlify/lib/manual-intake.cjs` | second queue beside WRITER_QUEUE; reads plain master; worker not in repo | Manual Intake tab; tests; `MANUAL_INTAKE_CONTRACT.md` | high if removed blind | STILL ACTIVE (UI) — VERIFY worker; schema stale |
| `/api/master`, `/api/feed` 410 stubs | `netlify/functions/*`; `netlify.toml` | retired | `tests/trust.test.js:6`; `ui.browser.js:104` | none | PROBABLY OBSOLETE — deliberate tombstones |
| `Source` object | `pipeline.html:428–431` | never referenced | none | none | SAFE TO REMOVE |
| `?src=` | `pipeline.html:443,447` | leftover of `Source.url` | none | none | PROBABLY OBSOLETE |
| `index.html` | `/index.html` | netlify.toml already 302s `/` | brief only | none | PROBABLY OBSOLETE |
| `AUTOS_DEFAULT` | `pipeline.html:1256–1267` | cites COCKPIT_FEED_v2 / Amendment 55 / regeneration (declared obsolete); lacks the 1-min queue trigger | Automations view, autobar | low | STILL ACTIVE UI, stale content |
| `Amd59RecoveryWorker.gs` | whole file | one-time; never run; skipped by deploy.sh | doc only | none | SAFE TO REMOVE (keep doc) |
| Migration engine (`migration_`, `migrationPrepare_`, `migrationStep_`, `planMasterMigration_`, `migrationChunks_`, `chunkState_`, REHEARSAL) | `Code.gs:789–1011` | single-use cutover (CUTOVER_COMPLETE 2026-10-05); **`readMigrationState_` is load-bearing** (archiveId/companionId, routing, `migration_status`) | tests | med | PROBABLY OBSOLETE — keep state reader |
| `readMasterHydrated_` (`hydrate=1`) | `Code.gs:62,912` | response too large to serve | tests; docs | med | PROBABLY OBSOLETE — fix docs first |
| `rotate_receipts` / Doc-receipt branches | `Code.gs:112,630,344–350,2107` | one-time; `ALREADY_ROTATED` | docs; tests | low | PROBABLY OBSOLETE |
| `correct_receipts` | `Code.gs:656` | evidence-gated generic tool | docs; tests | — | UNKNOWN (keep) |
| `parseRulesText` (legacy NC Doc parser) | `Code.gs:1667` | runtime uses `parseCanonicalNeverConsiderRules` | tests + fixture | low | PROBABLY OBSOLETE — tests depend |
| `RULES_DOC_ID` alias | `Code.gs:26` | compatibility alias | `rules.test.js:9` | none | SAFE TO REMOVE with test |
| `applyPlanToLines` | `Code.gs:1842` | test-only mirror of inline insert | `intake.test.js` | low | PROBABLY OBSOLETE — VERIFY test path |
| Stale docs | `SCOUT_INTAKE_CONTRACT.md:5,83`; `apps-script/README.md:20`; `README.md:4` (old NC Doc id); `WRITER_DURABLE_VERIFICATION.md:3`; `Code.gs:7–8` action list | describe superseded state | — | low | STALE DOCS |
| `pipeline-trust.js` | whole | extended, not retired by #54 | cells, labels, ruling readback; tests | — | STILL ACTIVE |
| `PipelineTrust.flexClass` | `:60` | diverges from `PipelinePolicy.flex` | internal | low | STILL ACTIVE (internal) |
| `PipelineAttention.ranked`/`grade` | `:11–12` | no production caller | tests | none | PROBABLY OBSOLETE |
| `POSSIBLE_MATCHES` in `INTAKE_PRESERVE` | `Code.gs:1454` | unreachable (rejected at 1466) | — | none | SAFE TO REMOVE (entry) |
| LS one-time flags `flexColumnsV1`, `scoreColumnsV1`, `flexWeightV2`, `baselined` | `pipeline.html:378–383,480` | one-time migrations | self | low | PROBABLY OBSOLETE (keep until devices migrated) |
| Computed `FLEX_CLASS/FLEX_MODIFIER/RAW_FIT/ADJUSTED_FIT/PURSUIT_STATUS` | `pipeline.html:519–524` | shadow Writer-stored keys; raw-fit key order differs (Explorer FIT_KEYS vs Writer SCOPE_FIT_RAW→RAW_FIT) | — | med | STILL ACTIVE — may diverge from stored |
| Legacy FLEX values YES/SOFT/NO/STRICT_NO | `pipeline.html:703,714`; `Code.gs:1471`; policy 25; attention 4; rules 36 | enrich form still writes them | — | — | STILL ACTIVE (by design, compatibility) |
| `PipelinePolicy.normalizeFlexPolicy ?` guards | `Code.gs:1489,1949,1964` | files identical, deployed together | — | none | SAFE TO REMOVE |
| `NEG_HINT_RE` alias | `Code.gs:1732` | alias of `PROTECTED_CASE_RE` | 1760 | none | PROBABLY OBSOLETE (cosmetic) |
| `keyGroup` + `TIM_KEYS`/`SCOUT_KEYS` | `pipeline.html:306–308` | no callers | none | none | SAFE TO REMOVE |
| `renderATSProfile`, `#view-ats` | `pipeline.html:1294,276` | unreachable | none | none | SAFE TO REMOVE |
| `tableViewportRows_`, `scheduleVisibleMap_` (no-op) | `pipeline.html:1029,1032` | no callers / no-op | none | none | SAFE TO REMOVE |
| `upsert_application` in requestId map | `pipeline.html:394` | never posted from page | none | none | SAFE TO REMOVE (or keep for future) |
| Unused CSS: `.ats-profile`(209), `.dash-card .barline`(82), `button.danger`(22), `.dim`(25), `.doc-preview-fallback`(105), `.map-grid`/`.map-coast-glow`(122–123), `.map-tip-bg`/`.map-tip-text`(132–133), `.map-pin.primary.pulse`(130), `#drawer .rul`(66), `.security-note`(206), `#autobar .soon`(71), `.density-comfortable`(206) | — | no element/JS reference | none | none | SAFE TO REMOVE |
| Duplicate `@media(max-height:520px)` blocks | `pipeline.html:173,177` | identical | — | none | SAFE TO MERGE |
| First two `:root` declarations | `pipeline.html:17,182` | overridden by 198 | — | none | SAFE TO CONSOLIDATE |
| `PipelinePolicy.gs` = `pipeline-policy.js` | both | byte-identical; sync by `policy.test.js` | deploy.sh | — | STILL ACTIVE (intentional) |
| Loader copies of 13 Writer functions | `pipeline-loader.js` | sync-tested (`master-loader.test.js:182–186`) | — | — | STILL ACTIVE |
| Bucket lists ×5 | Code.gs, loader, parser, quality, html 303 | — | — | med | DUPLICATE — single source recommended |
| Writer GET actions with no repo consumer: `discovery_requests`, `receipt_index`, `verify_pending`, `process_queue`, `rules` | Code.gs | may be used by external AIs (documented) | WRITER_ACCESS.md | — | UNKNOWN (keep) |

Design point (not dead code): the archive was a one-time migration; new terminal rulings stay in the live master and nothing re-archives them (live master now: 7 DUPLICATE, 4 CLOSED_DEAD, 2 DECLINED_BY_TIM, 2 REJECTED_BY_EMPLOYER plus the rows declined in the 2026-10-06 sweep).

Live-master shape at audit time (339 live rows): SCOUT_INTAKE 164 · DISCOVERY_LEAD 47 · MANUAL_RESEARCH 48 · APPLIED 62 · READY_TO_PURSUE 1 · BLOCKED 1 · INVALID_DISCOVERY 1 · terminal 15. Keys: INITIATING_URL 159, COMPANY_SOURCE_URL 129, SALARY_ASOF 264, CLAUDE_REVIEW_EVIDENCE_URL 81, FLOOR_STATUS 7, INTERVIEW_DATE 0, DOMAIN_FIT 0, PAY_MATCH 0.
