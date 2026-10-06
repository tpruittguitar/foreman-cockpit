# Pipeline Explorer — UI / UX / architecture audit (Phase 1)

Date: 2026-10-06 · Audited at `main` 6b37ab2 · Author: Claude (Foreman node) · Status: REPORT FOR TIM'S REVIEW. Nothing in the app has been changed by this audit. Evidence and line-level inventories are in `EXPLORER_UX_AUDIT_2026-10-06_APPENDIX.md`.

How it was done: four read-only code audits (UI structure; warnings and Writer state; every chart; dead logic), headless Chromium screenshots at 1440×900 and iPhone 390×844 against the scrubbed fixture with a mocked Writer, a simulated Writer-fault payload to see the strip and panel, live-master counts (339 live rows) to confirm which fields and buckets actually carry data, and the Shield AI / Hivemind pages. The Shield AI site itself is blocked by this container's egress proxy; I read its text through a second fetch service but could not inspect its CSS, so the visual-reference notes rely on the page content plus my prior knowledge of the site, not a live style read.

---

## 1. What I found

**Architecture.** One 250 KB `pipeline.html` (1,381 physical lines, many 1–10 KB long) plus 13 small modules. No framework, no build. Twelve `.view` panels switched by `switchTab()`; eleven of them are tabs in one top bar together with Compare / Compact / Refresh / gear. One render path for desktop and phone: the phone gets the same `<table>` with a narrower column set, 36 px rows and a full-screen drawer overlay. State in `localStorage` under `px.*` (24 keys); preset/sort/filters in the URL hash; **no job deep link**. All reads and writes go through the Writer (`gsGet`/`gsPost`); the Netlify `/api/master` and `/api/feed` functions return 410 and the `Source` object that used them is dead. Writes are refused unless the master read is LIVE, carry a request ID, and are verified by `request_result`. The archive is hydrated into the same row array as live rows (`ARCHIVE_STATE=ARCHIVED_TERMINAL`).

**Job detail.** A right-hand drawer (46 % wide on desktop) with four tabs: Overview, Interview, Timeline, Compensation. Overview is one long stack of eleven sections: decision form (9-state dropdown + reason + duplicate-of + note), current state, duplicate warning, rating card, source links, compensation strip, enrichment form, attention signals, AI context, on-demand narrative, write status. There are **no per-row actions in the grid**, the SOURCE_URL column is **plain text, not a link**, there is no copy/packet action, and no IDENTITY ruling control even though the Writer supports it.

**Warnings.** Two full-width strips (`#load-alert`, `#writer-alert`), two header badges (BUILD, WRITER) with click-to-open panels, a readout line, and about twenty smaller indicators. Nothing is dismissible and nothing auto-clears. The Writer raises warnings only for HOLD-type queue results; a queue file that ends FAILED (including governance rejections such as SOURCE_URL_REQUIRED, "identity ambiguous", "EVIDENCE is required") never changes the Writer level and appears only as a pill in the badge panel with the error text in a tooltip.

**Colour.** `:root` is declared three times; the last one wins and sets `--nm`, the token used by every class named `bad`, `critical` and `danger`, to **amber** (`#e9b06c`). The warn colour is a hard-coded yellow-orange (`#f5b041`). So "warning" and "critical" differ by about 15° of hue, and there is no red in the interface except the maroon strip backgrounds and the scoring heat gradient. All primary buttons (Refresh, every Save/Apply/Publish) are the same lime outline.

**Charts.** Forty items across six views. The same "Next actions" bars appear three times (Pipeline dashboard, Today, Reports); "Research gaps" twice; "Rolling 7-day rates" twice (bars and KPI tiles); "Why Tim declined" is drawn as a chart and as a table on the same page. No chart filters out archived rows, so "Every pipeline state", compensation mix and location charts are mostly history (521 of 827 rows at cutover), and they collapse toward zero when the archive read fails. No chart uses the scoring model.

**Mobile.** Works, but the header is three stacked rows (brand + badges, tools, nav) ≈ 290 px of an 844 px screen before the readout. Phone detection uses two different rules (head script: touch + screen ≤ 500 px; JS `phoneLayout()`: innerWidth ≤ 760 or ≤ 980 with coarse pointer). Mobile CSS is three overlapping media blocks that restate the same selectors (`#drawer` is declared five times).

**Live population (for design decisions).** 339 live rows: SCOUT_INTAKE 164, DISCOVERY_LEAD 47, MANUAL_RESEARCH 48, APPLIED 62, READY_TO_PURSUE **1**, BLOCKED 1, TIM_DECISION_REQUIRED **0**. Tim's real decision queue is the 211 intake/lead rows plus the 48 research rows, not READY_TO_PURSUE, yet the Today view's "Next decisions" list and "Needs your decision" tile read READY_TO_PURSUE and TIM_DECISION_REQUIRED. Today therefore shows 1 and 0.

## 2. What is currently weak

1. **Navigation is feature-centric and flat.** Eleven tabs + four tools in one bar; Settings, Columns, Scoring, Rules, Automations (hidden), Job Documents and Manual Intake sit next to Pipeline with equal weight. On the phone this bar scrolls horizontally.
2. **Today and the Pipeline dashboard duplicate each other** and both point at the wrong buckets for where decisions actually happen (see live population above).
3. **The decision UI is a form, not an action.** A nine-option dropdown + Save, with the keyboard shortcuts (1–4, D, A) hidden in a hint line. Bulk decline uses `prompt()`/`confirm()`.
4. **Warning noise and wrong severity.** Audit facts (a PARTIAL_HOLD from yesterday that was already resubmitted) get the same full-width maroon strip as "master cannot be read", for 24 hours, not dismissible. Real governance failures (FAILED runs) are nearly invisible. Critical, bad, warn and "held" all render in near-identical amber.
5. **Green vs amber buttons** are the same weight, same fill, same type; only hue differs.
6. **Posting link is not clickable in the grid**; the Interview tab picks links by a different rule than everything else; `CLAUDE_REVIEW_EVIDENCE_URL` exists on 81 rows and nothing displays it.
7. **Job drawer is a scroll of eleven sections**; decision, evidence, research and application are interleaved. No deep link, so a job cannot be shared or reopened by URL.
8. **Charts answer old questions** (see §1) and three of them are triplicates.
9. **Visual hierarchy is "box soup"**: every card, KPI, chip, button and badge is a 1 px bordered box on black with the same radius; hierarchy comes only from size. Dense, but hard to scan.
10. **Mobile header cost** (≈ 35 % of the viewport before content) and the tool row that scrolls sideways.
11. **Preset chip counts count row-lines while KPIs count distinct roles**, so the numbers on screen disagree with each other.
12. **Duplicate-candidate warning in the drawer** uses a naive substring rule under which every row with REQ `UNCAPTURED` matches every other one.

## 3. What is obsolete

Full table with file:line, consumers and risk: appendix §E. Summary by class.

**SAFE TO REMOVE (no consumers, traced):** `Source` object (`pipeline.html:428–431`); `keyGroup`+`TIM_KEYS`/`SCOUT_KEYS` (306–308); `renderATSProfile` + `#view-ats` (1294, 276); `tableViewportRows_` (1029); `scheduleVisibleMap_` no-op (1032); 13 unreferenced CSS rules (`.ats-profile`, `button.danger`, `.map-grid`, `.map-tip-*`, `.security-note`, …); the duplicate `@media(max-height:520px)` block (177 = 173); the first two `:root` declarations (17, 182); `Amd59RecoveryWorker.gs` (never run; deploy.sh skips it; keep its doc); Code.gs `FINAL_BUCKETS` (never read); `POSSIBLE_MATCHES` in `INTAKE_PRESERVE` (unreachable); the three `PipelinePolicy.normalizeFlexPolicy ?` guards; `RULES_DOC_ID` alias + its one test line; `PACKET_SUPPORT_ONLY` in the fixture generator.

**PROBABLY OBSOLETE — VERIFY DEPENDENCY:** `TIM_DECISION_REQUIRED` (0 live rows; ~19 UI sites) and `BLOCKED` (1 live row) as *prominent* UI states — keep in BUCKETS for parsing, retire from tiles/presets; `JOB_URL`, `CANONICAL_URL`, `MANUAL_INTAKE_URL` (0 live rows, no writer); `?src=` and `index.html`; the migration engine (`Code.gs:789–1011`, cutover complete) **except `readMigrationState_`, which is load-bearing**; `readMasterHydrated_` (`hydrate=1`, response too large to serve — the docs still tell AIs to use it); `rotate_receipts` and the Google-Doc receipt branches; `parseRulesText` (legacy never-consider Doc parser; tests depend on it); `applyPlanToLines` (test-only mirror); the four one-time `px.*` migration flags; `PipelineAttention.ranked/grade`; the `priority-hot` highlight, whose domain/floor inputs are never written (0 rows carry `DOMAIN_FIT`/`PAY_MATCH`; 7 carry `FLOOR_STATUS`); the Netlify `/api/master` and `/api/feed` tombstones (tests assert the 410).

**STILL ACTIVE but stale or divergent (fix, do not delete):** `pipeline-trust.js` (extended, not retired by #54); the Manual Intake Netlify queue (second queue beside WRITER_QUEUE; reads plain master so it cannot see archived rows; worker is not in this repo — verify one still runs); `AUTOS_DEFAULT` (cites obsolete Amendment 55 / COCKPIT_FEED and lacks the 1-minute queue trigger); `parsePayload` ×3 (the parser copy has drifted); `duplicateCandidates` and `usableReq_` (diverge from Writer identity rules); five copies of the bucket list; computed FLEX/fit columns that shadow Writer-stored keys with a different raw-fit key order; `pipeline-scoring.js` `MODEL_VERSION='2026-10-03.1'` vs `SCORING_MODEL.md` `2026-10-04.1`; `tests/ui.browser.js:88` expects a chart label that was renamed; stale docs (`SCOUT_INTAKE_CONTRACT.md`, `apps-script/README.md`, `README.md`, `WRITER_DURABLE_VERIFICATION.md:3`, the `Code.gs` header action list).

**Defects found while tracing (not dead code; Writer-side; Tim's call):**
- **Writer dedupe skips the URL fields it now writes.** `indexExisting` (`Code.gs:1621`) indexes `SOURCE`, `SOURCE_URL`, `JOB_URL`, `CANONICAL_URL` but not `INITIATING_URL`, `COMPANY_SOURCE_URL`, `INTAKE_SOURCE_URL`. 129 live rows carry `COMPANY_SOURCE_URL`, differing from `SOURCE_URL` on 97, so a rediscovery through the employer's own ATS link is not matched by URL. Same class of bug as the Glassdoor fix; same size.
- **Manual Intake cannot link to archived rows** (reads plain `master`).
- **Docs point AIs at `hydrate=1`**, which the Writer cannot serve.

## 4. What I recommend changing now (Phase 2, low risk, no approval needed beyond this report)

**A. One colour system, semantic tokens.** Collapse the three `:root` blocks into one and define: `--ok` green, `--caution` amber, `--attn` orange, `--fault` red (reserved), `--focus` teal (selection/active), `--new` lime (NEW marker only), plus the grey ramp. Re-map every `bad/critical/danger` class away from amber. Buttons get three distinguishable treatments: **primary** = filled near-white on black (Shield-style, one per view), **confirm/ok** = green outline + 2 px left rule + check glyph, **caution** = amber outline + ▲ glyph + dimmer fill, **fault/destructive** = red fill, rare. Luminance, border weight and glyph differ, not just hue. Verified contrast ≥ 4.5:1 for text on all four.

**B. Warning severity model + dismissal + status centre.** Map every signal to INFO / NOTICE / CAUTION / DEGRADED / FAULT in the Explorer (no Writer deploy needed for the model itself):

| Level | Examples | Treatment |
|---|---|---|
| FAULT | master unreadable with no cache; Writer unreachable; TRIGGER_MISSING; FROZEN_UNEXPECTED; CLAIM_ABANDONED; WRITE_UNVERIFIED > 20 min; own ruling WRITE FAILED | red strip (dismissible per instance), red status dot persists until cleared |
| DEGRADED | stale cache in use; archive/evidence unavailable; QUEUE_BACKLOG; COUNTS mismatch | amber strip, dismissible; amber dot |
| CAUTION | unrecovered PARTIAL_HOLD/HOLD_*; QUEUE_HOLD; WRITE_UNVERIFIED 5–20 min; CLAIM_RUNNING_LONG; FROZEN_FOR_MIGRATION | no strip; amber dot; listed in the drawer |
| NOTICE | FAILED queue runs (governance rejections), REJECTED_SCHEMA, BUILD behind, STATUS_PART_UNAVAILABLE | grey dot count; listed in the drawer with the error text visible |
| INFO | trust labels, research gaps, cohort maturity, autobar | in place only |

Dismissal is keyed by code + message hash in `px.dismissed`; a FAULT that is still active after dismissal keeps the red dot and stays at the top of the drawer. The BUILD panel, WRITER panel, load state and a 24-hour notification history merge into one **System drawer** opened from a single status indicator in the header (and later the rail). One optional Writer change (own PR, Tim's deploy): surface FAILED runs in `warnings[]` at a new `notice` level so other consumers see them too.

**C. Spacing.** Desktop only: card gap 12→14 px, section gap 16→18, toolbar row gap +2, card padding 10→12, drawer section spacing +10 %. Table row height, map area and phone layout unchanged.

**D. Motion.** 160–220 ms ease-out on drawer open/close, panel/drawer slide, tab switch (opacity + 2 px translate), row focus, chip toggle, button press; `prefers-reduced-motion` honoured globally (today only the map halo respects it). No loops, no glow.

**E. Chart cleanup.** Remove the duplicate "Next actions" (Pipeline dash and Reports), the duplicate research-gaps chart on Today, the "Rolling 7-day rates" bars (KPI row stays), the "Why Tim declined" chart (table stays), and "Where the opportunities are" (the map covers it). Every remaining chart defaults to **live rows** with an "include archive" toggle, and gets a source-field comment in code. Rename "Master" KPI to "Live roles". Align compensation bins to the model's $160k / $220k / $320k. Fix the Today tiles and lists to the buckets Tim actually works (Scout intake + leads awaiting his review, research, applied), keeping "Ready" as a tile.

**F. Small correctness fixes in the same PRs:** SOURCE_URL column becomes a real link; Interview tab uses `PipelinePolicy.links`; show `CLAUDE_REVIEW_EVIDENCE_URL` among source links; add `j=<PRIMARY_ID>` to the hash so a job can be reopened by URL (backward-compatible); chip counts use distinct roles; delete the SAFE TO REMOVE items above; fix the stale browser test; bump `MODEL_VERSION` to match `SCORING_MODEL.md`.

## 5. What I recommend NOT changing yet

- Any schema field, payload key or bucket in the master (Phase 3, after your review of §3 and a consumer check with ChatGPT/Grok prompts).
- The Writer (`Code.gs`/`Automation.gs`) beyond the optional notice-level warning and the dedupe-index fix, each as its own small PR with your deploy approval.
- Manual Intake's Netlify queue: don't remove until you confirm whether its worker still runs; the UI tab moves under Scout either way.
- The map engine and the table-on-phone model (no card view; the table works and you ruled for it).
- `pipeline-trust.js`, `PipelinePolicy.gs` duplication, loader copies — working and sync-tested.
- The navigation restructure and Job Workspace (§6, §8): structural; stop after this recommendation until you approve.

## 6. Left-navigation recommendation

**Desktop: yes, a compact rail; and fold the eleven tabs into six workflow destinations.** The rail is 48 px (icons + 2-letter labels), expands to 200 px on hover/click and remembers the choice. The top bar shrinks to one row (brand, readout, status indicator, Refresh), so the grid gains ~36 px of height and loses 48 px of width (3.3 % at 1440) — a net gain in visible rows. Destinations and where today's functions go:

| Rail item | Workflows | Absorbs (old → new) |
|---|---|---|
| **Pipeline** | Find · Qualify · Evaluate · Track | Pipeline grid + dashboard; **Today** becomes the dashboard's "Decide" strip at the top of Pipeline (tiles re-pointed to intake/leads/research/applied); **Compare** stays as a toolbar action; **Columns** becomes a popover from the column header; **Manual Intake "add job link"** becomes a toolbar action |
| **Scout** | Find · Qualify | **Scout Analysis** (cohorts, rates, runs) + **Manual Intake** submissions table + never-consider/review-needed queue + a "new since last visit" list that opens the workspace |
| **Targets** | Find · Improve | **Target Companies** unchanged |
| **Analytics** | Improve | **Reports**, cleaned per §4E: pipeline health, progression, aging, salary/FLEX completeness, priority-company activity |
| **Operations** | Maintain | Writer state, queue, recent runs (with FAILED runs visible), notification history, **Automations** reference, receipts, **Settings → Connection** and diagnostics |
| **System** | Improve | **Rules**, **Scoring** model, **Job Documents** library (resumes, cover letters, Tim's Voice), column defaults, writer credentials |

Rail foot: the status indicator (opens the System drawer) and Refresh. Hash becomes `#/pipeline?p=…&j=…`; old hashes still parse.

**Mobile: no rail.** A 4-item bottom bar — Pipeline · Scout · Ops · More (sheet with Targets, Analytics, System) — plus a one-row header (brand, status dot, refresh). The drawer becomes a full-screen workspace with its own sticky tab row. Presets stay a horizontally scrolling chip row. This cuts the header from ~290 px to ~100 px. Bottom bar respects the safe-area inset. The table stays a table.

Regression control: the rail is additive (`switchTab` keeps its names; the nav markup changes), hash parsing is backward-compatible, and the harness tests run at 1440 and 390 before each push.

## 7. External job-viewer architecture

The app is a static page on Netlify plus Apps Script. Facts that bound the design: LinkedIn, Indeed, Glassdoor, ZipRecruiter and Workday send `X-Frame-Options`/`frame-ancestors` and will not render in an iframe; Greenhouse job-boards, Lever and Ashby are designed to be embedded; a blocked iframe still fires `load`, so blocking cannot be detected reliably from script; **Back/Forward on a cross-origin iframe are impossible** (`contentWindow.history` throws), so that part of the wish list is off the table; Refresh (reset `src`), current URL, context and Open External are all feasible. Server-side fetching of the page (Netlify function or Apps Script `UrlFetchApp`) would be a reader-mode proxy, not a security bypass, but the big boards block it or require login, so it would mostly return nothing — I don't recommend building it.

**Recommendation: a "Posting" tab in the Job Workspace with three tiers, and a JD snapshot as the primary content.**
1. **Snapshot first.** The posting's text (title, employer, location, pay, requirements, description) stored once as a companion narrative record (`JD_TEXT` via an ENRICH ruling; the companion already exists for narrative). The intake guardrails already have the AIs open the posting; adding "store the JD text" is a prompt line for you to approve. The snapshot renders instantly, offline, survives the posting being taken down, and is exactly what the AI packet needs.
2. **Embed when the host allows it.** Allow-listed hosts (Greenhouse, Lever, Ashby, SmartRecruiters, employer career pages that have been seen to work) load in a sandboxed iframe beside the snapshot, with a 4-second watchdog that shows "This site doesn't allow embedding → Open external" if nothing paints. Known blockers skip the attempt.
3. **Open External always**, as a named window (`window.open(url,'px-posting')`) so repeated opens reuse one window — the "secondary app window" you described — and never auto-submits anything. "Apply" = open external + offer the "I applied" ruling afterwards.

## 8. Fit / cover-letter workflow recommendation

**Yes, and it should be a Job Workspace, not more buttons.** Opinion, before any build:

- **Don't call AI APIs from the page.** Your subscriptions can't be invoked from a web page, API use is separately billed, and the pipeline already has an in-band route (`data_discovery` → the Claude routine). Build the page to be an excellent **hand-off and import surface** instead. That gets ~90 % of the value with no credentials in the browser and no fragile automation.
- **Workspace shape** (replaces the four drawer tabs; the drawer frame stays):
  - **Overview** — identity, state, decision actions as buttons (Pursue / Research / Decline / Applied / Duplicate / Invalid), current score, gaps.
  - **Posting** — snapshot + embed + Open External (§7).
  - **Fit** — fit score + confidence + evidence + rating breakdown + risks + research gaps + "Request pipeline research" + **Copy Fit Packet** + **Import fit assessment**.
  - **Application** — cover letter (gated), documents (approved resume, Tim's Voice), interview notes, "I applied" / rejection evidence, **Copy Cover-Letter Packet**, **Import cover letter**.
  - **History** — timeline events, Writer activity on this row, prior analyses, state changes.
- **AI Packet** = Markdown with a fixed header (PRIMARY_ID, company, title, location, URLs, pay, degree text, FLEX, state, score context), the JD snapshot, prior analysis, the applicable rules excerpt (floor for this location, FLEX policy), approved career evidence, and a trailing **RESPONSE FORMAT** block asking the AI to answer inside a fenced `PX-FIT v1` block (key=value lines for the structured part, then narrative). That makes paste-back deterministic.
- **Import** parses that block and writes through the Writer as an ENRICH ruling using the existing vocabulary (`SCOPE_FIT_RAW`, `FIT_CONF`, `FIT_EVIDENCE`, `DEGREE_TEXT`/`FLEX`, `SALARY_BASE_EST`/`SALARY_BASIS`/`SALARY_CONF`, `FIT_MODEL_VERSION`); narrative goes to the companion as it does today. No new master keys without your approval.
- **Cover letter gate:** enabled only when a fit assessment exists on the row *and* the row is READY_TO_PURSUE or you press Pursue. The packet includes the JD, the fit output, Tim's Voice and the approved resume. The draft comes back by paste, is stored as companion narrative (`COVER_LETTER_DRAFT`) with a Copy button, never auto-sent, never generated in bulk. Writing it as a Drive document in the Cover Letters library is a later Writer action.
- **Research packet** and **Writer/Resolver diagnostic packet** are cheap variants of the same generator (§11 of your brief): yes, build them in the same pass.

Build order once approved: packet generator + import parser (pure functions, unit-tested) → workspace tabs → gating. The data model needs nothing new in the master.

## 9. Multi-AI chatroom feasibility (opinion only; nothing built)

1. **Technically feasible** as a local app, but not the way first proposed. Driving the four vendors' consumer web apps with persistent browser profiles is fragile (DOM selectors change monthly, Cloudflare/CAPTCHA, session expiry) and, more importantly, **automated access to the consumer chat products is prohibited by all four vendors' consumer terms**, with real account-enforcement risk. I won't build or recommend that.
2. **The legitimate path is the official CLIs.** Claude Code (claude.ai login, subscription usage), OpenAI Codex CLI (ChatGPT login) and Gemini CLI (Google account) are first-party, scriptable (`-p` prompt mode), and consume the subscription entitlements you already pay for. That gives a ToS-clean 3-of-4 room. **Grok has no subscription-backed CLI**; xAI's API is separately billed, so Grok joins by API (paid) or by manual paste.
3. **Security:** CLI agents can run commands — each must run sandboxed (no tools, read-only working directory, no network beyond the vendor). The transcript store (SQLite) is harmless; the vendor logins are the sensitive part and stay in each CLI's own keychain, never in the room app.
4. **Maintainability:** CLI flags are stable and documented; browser automation is not.
5. **Architecture if you want it:** a separate local "room" daemon: SQLite transcript; `@claude/@codex/@gemini/@grok/@all` routing; each turn sends a rolling summary + last N turns; responses captured back verbatim with vendor and timestamp; a small local web UI.
6. **Coupling to Pipeline Explorer: agree it should stay separate.** The only shared contract is the packet format (§8) and the `PX-FIT` import block, so a room transcript's conclusion can be pasted straight back into a job. I challenged the assumption and found no better architecture: tight coupling would put four vendor sessions behind the same page that holds the Writer credential, and would tie the Explorer's release cadence to the vendors' CLIs.

Not in this pass. Decide separately.

## 10. Implementation sequence

| Phase | Scope | Gate |
|---|---|---|
| 2A | Colour tokens, button semantics, warning severity model, dismissal, System drawer (Explorer only) | proceed after this report |
| 2B | Spacing, motion, reduced-motion | proceed |
| 2C | Chart cleanup, live/archive toggle, source-field comments, Today re-pointing | proceed |
| 2D | Small fixes (§4F) + SAFE TO REMOVE deletions in `pipeline.html` | proceed |
| 2E | Navigation rail + bottom bar + hash `j=` | **your approval of §6** |
| 3 | Dead-logic cleanup of PROBABLY OBSOLETE items in Writer/parser/docs; dedupe-index fix (Writer PR + deploy) | **your approval of §3** |
| 4 | Job Workspace shell + Posting tab (snapshot + embed + external) | **your approval of §7/§8 shape** |
| 5 | Packets + import + cover-letter gating | **your approval of §8** |
| 6 | Multi-AI room | out of scope; separate decision |

Each Phase-2 step is its own PR, validated by the harness at 1440×900 and 390×844 plus the unit suite, merged and deployed to Netlify like #49–#54. Nothing touches the Writer until Phase 3.

## 11. Files / components expected to change

- `pipeline.html` — `<style>` (tokens, buttons, strips, drawer, nav, media blocks), header markup, `renderWriterStatus_`, `renderLoadAlert_`, new `notifications_`/System drawer, `renderDashboard`, `renderToday`, `renderReports`, `renderQuality` (chart removals), `switchTab`/`pushHash`/`readHash`, cell renderer for SOURCE_URL, Interview tab link.
- `pipeline-charts.js` — unchanged or a `liveOnly` helper. `pipeline-attention.js` — align gap definitions with `researchGaps_`.
- `pipeline-scoring.js` — `MODEL_VERSION`.
- `tests/ui.browser.js`, `tests/mobile.browser.js` — label fix; new assertions for dismissal, severity classes, rail/bottom bar, deep link.
- `docs/OPERATOR_TRUST_CONTROLS.md` (warning model), this audit and appendix (the reasoning record), `docs/ACTIVE_PIPELINE_AUTHORITY.md` + `MASTER_ARCHIVE_EVIDENCE_COMPANION.md` (drop the `hydrate=1` instruction).
- Writer, only in Phase 3 and only with your deploy: `apps-script/Code.gs` (`indexExisting` URL fields), `apps-script/Automation.gs` (optional `notice` warnings).

## 12. Risks / regression points

- **One huge file with 3–10 KB lines**: edits are error-prone; mitigated by small PRs, `node --check`, the unit suite and the browser harness at both widths before every push.
- **Consolidating `:root`** changes colours everywhere at once; checked by screenshot diff of every view.
- **Dismissible warnings must never hide an active FAULT**: dismissal is per instance and the red dot/drawer entry stays; covered by a browser test with the simulated fault payload.
- **Charts defaulting to live rows change numbers Tim is used to** (e.g. "Every pipeline state"); the toggle and a one-line note make it explicit.
- **Today re-pointing** changes what "Next decisions" lists (intake/leads instead of READY_TO_PURSUE); it reflects the live population but is a visible change — flagging it here.
- **Hash format change** must keep old links working; `readHash` accepts both.
- **Rail width** takes 48 px from the grid; offset by removing the tab row.
- **Writer-side fixes** (dedupe index, notice warnings) are deploys; held to Phase 3 with explicit approval.
- **Manual Intake**: its worker is outside this repo; moving the tab is safe, removing the queue is not until verified.
- **Shield AI reference was read as text, not styled markup** (egress block); the visual direction follows your stated preferences and the brief's §7, and can be adjusted once you compare screenshots.
