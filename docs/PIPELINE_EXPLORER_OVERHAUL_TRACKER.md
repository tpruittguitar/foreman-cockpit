# Pipeline Explorer Phased Overhaul Tracker

Status date: 2026-10-10
Branch: `phase1-overhaul-visual-foundation`
Review rule: complete one phase, review with screenshots/summary, then begin the next phase only after approval.

## Guardrails

- Preserve current Pipeline Explorer functionality, data behavior, Writer flow, canonical master handling, scoring display, application state history, filtering/search, map behavior, and protected statuses.
- Do not directly edit the canonical master.
- Do not change live scoring weights or publish VNext scoring in the visual overhaul.
- Do not alter Writer authority, Writer transaction logic, queue behavior, or automation prompts as part of Phase 1.
- Keep changes reviewable and phase-bounded.

## Visual target

Pipeline Explorer should feel like a black/grey modern military manufacturing-intelligence cockpit with a slick Shield AI / Hivemind software feel. Movie/game/sci-fi interface inspiration is acceptable when it improves intuitiveness, exploration, priority guidance, and operational readability. Avoid blue-cast structural greys; use true black, white, and neutral greys as the base. Accent colors should communicate function and state.

## Color baseline

### Structural colors

| Token | Purpose | Value |
| --- | --- | --- |
| `--bg` | Page background | `#000000` |
| `--panel` | Main shell/panel | `#050505` |
| `--panel2` | Secondary panel | `#0b0b0b` |
| `--raised` | Raised card surface | `#111111` |
| `--line` | Primary divider | `#242424` |
| `--line2` | Secondary border | `#343434` |
| `--text` | Primary text | `#f4f4f4` |
| `--dim` | Secondary text | `#b8b8b8` |
| `--faint` | Muted text | `#7a7a7a` |
| `--white` | Hot emphasis | `#ffffff` |

### Functional highlights

| Token | Meaning | Value |
| --- | --- | --- |
| `--ok` | Verified / healthy / complete | `#35ff9e` |
| `--caution` | Caution / review | `#ffcf4d` |
| `--attn` | Aging backlog / warning | `#ff8a2a` |
| `--fault` | Failed / blocked / worsening | `#ff4d5e` |
| `--focus` | Active selection / live signal | `#2fe6ff` |
| `--new` | New intake / growth signal | `#35ff9e` |
| `--brand` | Primary hot accent | `#ffffff` or a controlled functional accent |

## Phase plan

| Phase | Name | Scope | Status |
| --- | --- | --- | --- |
| 0 | Tracker and governance | Create review-gated tracker and branch discipline | COMPLETE |
| 1 | Visual foundation and Pipeline density | Neutral black/grey tokens, typography scale, right-panel text reduction, compact queue styling, preserve map and behavior | IMPLEMENTED - ACCEPTED SCALE-WISE |
| 1B | Persistent Pipeline table layout controls | Smaller default column widths, drag column order left/right, manual width resizing, row-height setting, save/lock persistence | REQUIRED - NOT STARTED |
| 2 | Navigation consolidation | Collapse left rail/menu into Pipeline, Map, AI Operations, Control Center, Analytics | BLOCKED UNTIL PHASE 1B REVIEW |
| 3 | AI Operations dashboard | Intake/enrichment throughput, explicit enrichment backlog, backlog trend, Writer health, lane performance, Next Priority | BLOCKED UNTIL PHASE 2 REVIEW |
| 4 | Mobile sizing/readability review | Portrait/landscape sizing, map popup shrink, bottom nav, mobile charts, selected-job readability | BLOCKED UNTIL PHASE 3 REVIEW |
| 5 | Workspace layout system | Drag, resize, lock, save, restore, presets, responsive layout separation | TABLE-SPECIFIC CONTROLS MOVED FORWARD TO PHASE 1B; REMAINDER BLOCKED UNTIL PHASE 4 REVIEW |
| 6 | AI Control Center | External instructions, scoring, FLEX, geography, rules, Writer console, provider registry | BLOCKED UNTIL PHASE 5 REVIEW |
| 7 | VNext scoring backtest/cutover | Backtest, compare user-graded roles, validate, publish only by explicit approval | BLOCKED UNTIL PHASE 6 REVIEW |

## Phase 1 detailed scope

### Included

- Replace blue-cast structural colors with true black / neutral grey tokens.
- Reduce oversized text in the Pipeline right-side working panel.
- Tighten job detail metadata spacing and hierarchy.
- Preserve desktop Pipeline layout proportions.
- Preserve current queue/detail/map behavior.
- Preserve target density of 15–20 visible queue rows.
- Keep accent colors limited to state, selection, priority, charts, map pins, and warnings.
- Add subtle modern-military/sci-fi polish only where it improves readability or priority.

### Excluded

- No navigation restructure.
- No AI Operations dashboard implementation.
- No Control Center implementation.
- No general drag/resize/lock layout engine.
- No scoring model changes.
- No Writer changes.
- No automation prompt/name changes.
- No Google Drive authority changes.

### Phase 1 acceptance checks

- Existing data loads normally.
- Existing Pipeline queue still works.
- Selecting a job still opens the existing working panel.
- Map remains visible and functional.
- No master/Writer/scoring logic changed.
- Right-side panel text is materially less oversized.
- Base UI reads black/white/neutral grey, not blue.
- Screenshots reviewed before Phase 2 begins.

### Phase 1 implementation notes

- Implemented as CSS-only overrides in `pipeline-ui-workspace.css`.
- Added neutral black/grey token overrides for the existing variable system.
- Neutralized blue-cast backgrounds across shell, rail, drawer, cards, queue, dashboard cards, map, popovers, and document panels.
- Tightened desktop queue row height, padding, and table typography.
- Reduced right-side job workspace title, metadata, tab, card, key/value, and action typography.
- Constrained map target label size, especially on phone/coarse-pointer layouts.
- Preserved existing selectors and behavior; no JavaScript or data logic changed in this pass.

## Phase 1B table-layout control requirement

User review on 2026-10-10 accepted the Phase 1 scale/look, but required the Pipeline table itself to become operator-adjustable and persistent before Phase 2.

### Required behavior

- Pipeline columns default to smaller, tighter widths than the current defaults.
- User can drag columns left/right to change visible column order.
- User can drag-resize column widths.
- User can choose a row-height setting.
- Column order, column widths, and row height persist across refresh/load/browser reopen.
- User can explicitly lock/save the table layout so the system keeps it after adjustments.
- User can unlock or reset back to default if needed.
- Saved table layout must be device-safe and must not alter canonical master data, Writer logic, scoring, filters, application state, or row content.

### Implementation notes for Phase 1B

- Existing table resize code already exists, but it is currently session-only and resets on fresh canonical load/refresh. Phase 1B must remove that defect.
- Existing column visibility model is stored in `S.cols` / `LS.get('cols')`; Phase 1B should reuse that governance rather than creating a second conflicting column source.
- Existing column-width state is `S.colWidths` and `S.colWidthsPhone`; Phase 1B should persist manual changes instead of clearing them on every load.
- Row-height should use a persisted setting, not only automatic fit logic.
- Lock/save state must make the user's manual table geometry authoritative until the user unlocks or resets it.

### Phase 1B acceptance checks

- Fresh load keeps saved column widths.
- Fresh load keeps saved column order.
- Fresh load keeps saved row-height setting.
- Locked table layout does not get overwritten by auto-fit.
- Reset returns to compact default widths/order/row height.
- Sorting/filtering/header popover behavior remains intact.
- Sticky first columns still align after reorder/resize.
- No master, Writer, scoring, automation, or Drive logic changed.

## AI Operations dashboard requirements for later phases

The dashboard must show both flow balance and enrichment backlog. Balance alone is insufficient.

Required chart groups:

- Verified intake vs verified enrichment by hour/day.
- Cumulative intake vs cumulative enrichment.
- Enrichment backlog by stage.
- Enrichment backlog trend over time.
- Writer failures and unverified writes.
- Lane health by task.
- Next Priority card that points to the highest-value next action.

## Mobile review requirements for later phases

- Full phone portrait sizing/readability review.
- Full phone landscape perimeter-padding review.
- Compact map location popup; no large text box covering the map.
- Mobile-specific chart presentation.
- Smaller selected-job typography while keeping tap targets usable.
- Constrained mobile layout customization, not chaotic free-floating panels.

## Progress log

- 2026-10-10: Created phased overhaul tracker and branch `phase1-overhaul-visual-foundation`.
- 2026-10-10: Implemented Phase 1 CSS-only visual foundation overrides in `pipeline-ui-workspace.css`.
- 2026-10-10: Restored `build-info.json` placeholder after an accidental branch-local stamp; the final file content matches the main placeholder.
- 2026-10-10: Phase 1 visual scale/look accepted by user; Pipeline table layout persistence is now a required Phase 1B correction before Phase 2.

## Expected review diff

The intended Phase 1 review surface is limited to:

- `pipeline-ui-workspace.css`
- `docs/PIPELINE_EXPLORER_OVERHAUL_TRACKER.md`

Phase 1B will intentionally add runtime table-layout control logic. That remains out of scope for the completed Phase 1 visual-only pass, but is now required before Phase 2 begins.

Any Writer, scoring, automation, master-data, or net build-info change should be treated as out of scope for Phase 1 and Phase 1B.
