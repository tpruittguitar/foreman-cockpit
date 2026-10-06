# Explorer navigation (rail, header, phone bar) — 2026-10-06

Where each old tab went after the rail redesign (PR B of the Explorer UI series). Nothing was removed: every old view is still reachable, under a group.

## Desktop: left rail

The rail is 52px of icons. Hovering it (or tapping a group icon on a touch screen) widens it to 236px and shows the sub-items. The current group carries an orange left tick; the current sub-item is inverted.

| Old nav button | New rail location | Internal tab id (unchanged) |
| --- | --- | --- |
| Today | Folded into Pipeline: the decide strip at the top of the band (Ready, Needs decision, Research, Awaiting AI, Interviews 14d, Stalled 72h, Applied, Maintenance when any). Each tile filters the table. Old `t:"today"` links open Pipeline. | `pipeline` |
| Pipeline | Pipeline → Awaiting review / Missing data / Applied / All live (presets) | `pipeline` |
| Quality (Scout analysis) | Scout → Scout analysis | `quality` |
| Manual intake | Scout → Manual intake | `intake` |
| (preset) New intake, Discovery leads | Scout → New intake / Discovery leads | `pipeline` + preset |
| Companies | Targets → Companies | `companies` |
| Expand map (button on the map card) | Map → Full-screen map (also still the button on the card) | `pipeline` + `map-full` |
| Reports | Analytics → Reports | `reports` |
| Automations (schedule reference) | Operations → Schedule reference | `automations` |
| Writer badge (header) | Operations → System status, and the dot in the rail footer | opens the System drawer |
| Rules, Scoring, Documents (was ATS), Columns, Settings | System → … | `rules`, `scoring`, `documents`, `columns`, `settings` |

The header is one row: breadcrumb (`GROUP › VIEW`), readout, Compare, Compact, Refresh, Writer setup, and on a phone the layout switch.

## Phone: bottom bar + sheet

The rail is hidden under 760px (and on coarse-pointer screens under 980px). A four-slot bottom bar carries Pipeline, Scout, Map and More. More opens a sheet with every other destination, grouped the same way as the rail. Full-screen map hides the bottom bar; Close map brings it back.

When a phone is switched to the desktop layout (the header switch), the rail is shown and opens on tap instead of hover. The Mobile switch leads the header there so it is reachable without panning.

## Pipeline layout (PR C)

The Pipeline view is a band over a table, with the Job Workspace as a full-height column on the right when a job is open.

- **Band**, left to right: the decide strip (one row of tiles), then Research gaps and Next actions underneath it, then the map, which now takes five of twelve columns on both rows. The map is unchanged inside; it only has more room.
- **Map point filters** (Selected, Current View, All Applied, Active Work, Scout Intake, Ready) sit on the map card under its title, each with a count. The old bar above the views is gone. On a phone they appear in the full-screen map only.
- **Search** is in the header (one input, bound once). It applies to the Pipeline table and switches to Pipeline when typed from another view.
- **Table** below the band; **Job Workspace** opens as the right column on desktop (the band and table shrink), and over the table on a phone, leaving the band visible.
- Short screens (under 520px tall, landscape phones) show the band as a single row: tiles and map, no charts.

## Job Workspace (PR D)

Opening a row opens the Job Workspace (the right column on desktop, over the table on a phone). Its header carries prev/next (same as J/K), the title, a chip row (bucket, rating, FLEX class, pay, location, pending ruling), decision buttons (Pursue · Hold · Decline · Research, same as keys 1–4: they prepare the Tim decision form; Save submits) and actions: Open posting (a plain named browser window, never automated), Copy packet (plain-text summary of the row for a note or an AI prompt, marked viewer-derived) and Draft cover letter, which stays disabled until Tim decides on the Phase 5 AI-workflow recommendation.

| Old tab | New tab | What moved |
| --- | --- | --- |
| Overview | Overview | Tim decision, Current state, Duplicate warning, AI context, on-demand evidence, write status |
| Overview (lower cards) | Fit & Score | Opportunity rating, FLEX-adjusted fit, Compensation, Research gaps + enrichment, Attention signals |
| Overview › Source links | Posting | Source links, posting facts (req, posted, found via, identity, degree/experience/clearance text), posting snapshot when a row stores one, posting viewer: Open external for any link; "Show here" embeds only Greenhouse, Lever and Ashby boards, with an 8 s watchdog |
| Interview | Application | Application state (bucket, disposition, status check/evidence, decline reason, anti-resurrection, reopen trigger, verify later, archive) plus the interview notes |
| Compensation | Fit & Score | the same card |
| — | Documents | library files whose name carries the company or PRIMARY_ID, with a link to the full library |
| Timeline | History | this device's ruling and write status, added/first-loaded dates, then the v5 event timeline |

Old hashes or saved tabs named `interview`, `timeline` or `compensation` map to the new tabs.

Table: BUCKET shows a coloured pill, OVERALL_RATING a score badge with its band, and two computed columns are new: LINK (icon to the preferred posting link, opens in a new tab) and AGE (days since DATE_ADDED). Saved column sets get LINK after TITLE and AGE after DATE_ADDED once.

## Analytics and Scout (PR E)

Reports keeps three charts: Every pipeline state, Base compensation mix (bins now follow the scoring model at $160k / $220k / $320k) and Discovery sources. Gone as duplicates: Work waiting for action (the Pipeline band has Next actions), Where the opportunities are (the map covers it) and Why Tim declined (its table stays). Every chart reads **live rows** by default; the line under the heading says how many archived (terminal) roles are hidden, and "Include archive" flips it for this device. Each chart's data builder carries a `// source:` comment naming the payload fields it reads.

Scout analysis drops the Rolling 7-day rates bars (the windows panel still lists the rates) and gains "New since your last visit": rows still counted as new on this device, each opening the Job Workspace.

## Polish and removals (PR F)

Motion: one easing, 160–200 ms, on chips, tiles, tabs, rows and cards; the Job Workspace slides in; views and panel bodies fade. `prefers-reduced-motion` switches it all off. Desktop with a mouse gets about 10% more padding in bars, the band, the workspace and the chart grid.

Removed, each traced to zero consumers in the 2026-10-06 audit: the `keyGroup` key-group tables, the viewport-row map scheduler and its scroll listener, `renderATSProfile` and the empty `view-ats` panel (the `t=ats` link still opens Job documents), the legacy `.map-mode`, map tip, coast-glow, writer-warn, barline, ATS-profile and security-note styles, the pulse keyframes, and a duplicated landscape media block.

Fixes: the SOURCE_URL column is a real link; the interview card reads its posting link through the shared link policy; the Posting tab shows `CLAUDE_REVIEW_EVIDENCE_URL` when a row carries it; preset chip counts count distinct roles; the Explorer's scoring `MODEL_VERSION` matches `SCORING_MODEL.md` (2026-10-04.1).

## URL state

The hash now also carries the open job (`j`) and full-screen map (`m`). Opening a link with `j` focuses that row, opens the job panel and scrolls it into view; `m:1` restores the full-screen map. Existing hashes (`t`, `p`, `s`, `f`) are unchanged.

## Cockpit composition (PR #65, 2026-10-06)

Built to Tim's approved desktop (16:9) and mobile references. Same data and controls, rearranged; no Writer, scoring, policy or data change.

- **Header:** menu button, brand, search, then status cells: Writer (the existing Writer badge, still opens the System panel), Queue (pending + processing from `writer_status`) and Last sync (the last verified master read; reads "stale" in red when the master is served from cache). The bell opens the same System panel. The long readout stays in the page for assistive tech and tests but is not drawn. Below 1600px the breadcrumb hides; below 1280px Refresh hides (it stays in the rail footer). There is no "Resolver" cell: nothing in the app reports one.
- **Rail:** 96px with a label under each icon; hover, or the menu button, opens the sub-items as before.
- **Pipeline, desktop:** left column = Job decision queue (title, visible count, Needs decision / Applied / Research / Interviews 14d, the view button, filters) over the Job location map; right column = the Job workspace, full height, always on screen. On first load the top row of the current view is shown in the workspace (display only: not marked seen, nothing synced, no URL change). Closing a job leaves an empty workspace prompt.
- **View & filters panel** (the view button or the funnel): the existing preset chips, bulk tools (Select visible, AI discover missing data, Mark visible seen, bulk rulings) and the other decide tiles (Ready, Awaiting AI, Stalled 72h, Maintenance). On a phone it is a bottom sheet.
- **Research bottlenecks** and **Next actions** charts moved from the Pipeline band to the top of Analytics → Reports; their bars still open the filtered queue.
- **Map:** controls stacked on the right (zoom in, level, zoom out, layers); the layers button opens the map point filters (Selected, Current View, All Applied, Active Work, Scout Intake, Ready) and the map preferences below.
- **Map acquisition (refinement pass):** an explicit job selection glides to the job's pin, zooms to the selection zoom, then pulses the pin once. Preferences (kept per browser in local storage as `px.mapAutoZoom`, `px.mapSelZoom`, `px.mapDenseBoost`):
  - *Auto zoom on selection* (default on). Off: the map recentres on the job and keeps the current zoom.
  - *Selection zoom* 300 / 450 / 600 (default) / 800 / 1000%. Manual zoom (buttons, wheel, pinch) is not limited to these steps.
  - *Selected layer.* Three terms:
    - **Selected set:** the checked rows (`S.checked`). Table scrolling, filters and search do not change it; opening a job does not change it. The map subtitle counts only these ("3 selected jobs").
    - **Focused job:** the job open in the workspace. It may or may not be checked, and it always has a pin while it is open.
    - **Rendered set:** checked jobs plus the focused job, de-duplicated. No checks + an open job = one pin; three checks including the open job = three pins; three checks + a different, unchecked open job = four pins (the subtitle still says 3 selected jobs).
    - Pin states: a checked pin has an amber square frame (selected); the open job's pin is enlarged and green with a glow (focused) and keeps that look after hovering other pins; a checked open job shows both, with the focused look dominant. A focused-only pin is never called selected.
    - Framing and the dense-area boost use the rendered set, including a focused-only pin. Checking or unchecking a row reframes; opening a job highlights and pulses its pin within that frame.
  - *Dense-area boost* (default on). Counts only pins drawn on the map. When drawn pins sit closer than about 28 screen pixels at the selection zoom, the map zooms just far enough to separate them, up to 1000%, but never so far that a checked job leaves the screen. A single job on its own is never boosted. No places are hard-coded.
  - Maximum zoom is now 1000% (was 800%) so the 1000% preset and the boost have room; the minimum is unchanged (100%).
  - The mouse wheel zooms only while the pointer is over the map, about 10% per notch, about the point under the cursor. Wheel and pan never trigger auto zoom; auto zoom runs only on an explicit selection. The first-load display of the top row does not zoom.
  - Pins: hover enlarges a pin slightly, the selected pin more. Pins are positioned with a transform. Reset glides back to the full-US view; Recenter keeps the current zoom. Reduced motion removes the glides and the pulse but keeps wheel, pan and buttons.
- **Queue columns:** the desktop cockpit set is NEW, TITLE, COMPANY, LOCATION, LINK, OVERALL_RATING (shown as SCORE), BUCKET (STATUS), SALARY_BASE_EST (COMP), FLEX_CLASS (FLEX), EXPERIENCE_FIT (FIT), AGE. Every column is still in System → Columns. One-time migration (`px.cockpitColumnsV1`): a device still on the old built-in default moves to the cockpit set; a customised set is left as it is. Either way the prior sets are saved once as `px.colsBeforeCockpit`. System → Columns has **Use cockpit columns** and **Restore columns from before the cockpit layout**.
- **Row density (desktop, compact):** row height fits the queue panel: 19 rows (up to 32px, 14px text) when there is room, else 16 rows, else 15 rows (down to 20px, 11.5px text on the shortest windows). Rows stay single-line. Comfortable density and phones are unaffected.
- **Workspace:** role title, a company · location · arrangement · posted/added line, the opportunity rating as a ring with its band, the existing six tabs (one indicator slides between them), and at the top of Overview: Key details, Top evidence (the five existing viewer attention signals, each tagged favorable / conflict / unknown and labelled as viewer-derived from stored fields, not a sourced claim), Summary (FIT_EVIDENCE, else SCOUT_NOTES, else the employer's business) and Next step (research gaps, else the saved ruling, else "Decide"). The existing Tim decision, state, duplicate and AI context cards follow. Actions sit in a footer: Open posting · Copy packet · Draft cover letter (still gated), then Pursue · Hold · Research · Decline (labels and actions unchanged).
- **Phone:** one scrolling column: compact header (menu, brand, Writer / Queue / Last sync), the four counts, the map, the Jobs queue (search, view, filters), then the selected job with its actions pinned to the bottom while it is on screen. Tapping a row scrolls to the job. Bottom bar: Pipeline, Scout, Targets, Map, Analytics; the menu button opens the More sheet. Phone columns: NEW, TITLE, COMPANY, LOCATION, SCORE, STATUS, COMP; they stay touch-resizable, so the queue scrolls sideways when they do not fit.
