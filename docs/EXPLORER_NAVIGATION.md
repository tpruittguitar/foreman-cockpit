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

## URL state

The hash now also carries the open job (`j`) and full-screen map (`m`). Opening a link with `j` focuses that row, opens the job panel and scrolls it into view; `m:1` restores the full-screen map. Existing hashes (`t`, `p`, `s`, `f`) are unchanged.
