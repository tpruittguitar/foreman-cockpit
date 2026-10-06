# Explorer navigation (rail, header, phone bar) — 2026-10-06

Where each old tab went after the rail redesign (PR B of the Explorer UI series). Nothing was removed: every old view is still reachable, under a group.

## Desktop: left rail

The rail is 52px of icons. Hovering it (or tapping a group icon on a touch screen) widens it to 236px and shows the sub-items. The current group carries an orange left tick; the current sub-item is inverted.

| Old nav button | New rail location | Internal tab id (unchanged) |
| --- | --- | --- |
| Today | Pipeline → Today | `today` |
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

## URL state

The hash now also carries the open job (`j`) and full-screen map (`m`). Opening a link with `j` focuses that row, opens the job panel and scrolls it into view; `m:1` restores the full-screen map. Existing hashes (`t`, `p`, `s`, `f`) are unchanged.
