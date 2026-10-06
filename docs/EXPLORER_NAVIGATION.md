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

## URL state

The hash now also carries the open job (`j`) and full-screen map (`m`). Opening a link with `j` focuses that row, opens the job panel and scrolls it into view; `m:1` restores the full-screen map. Existing hashes (`t`, `p`, `s`, `f`) are unchanged.
