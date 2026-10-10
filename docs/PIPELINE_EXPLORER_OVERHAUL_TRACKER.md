# Pipeline Explorer Phased Overhaul Tracker

Status date: 2026-10-10
Branch: `phase1-overhaul-visual-foundation`
Review model: Tim does not need to navigate GitHub. Each phase is summarized in chat with clear changed files, behavior changes, and guardrails. Proceed only on Tim's direct instruction.

## Guardrails

- Preserve current Pipeline Explorer functionality, data behavior, Writer flow, canonical master handling, scoring display, application state history, filtering/search, map behavior, and protected statuses.
- Do not directly edit the canonical master.
- Do not change live scoring weights or publish VNext scoring in the visual overhaul.
- Do not alter Writer authority, Writer transaction logic, queue behavior, automation prompts, or Drive-authority files as part of the UI overhaul.
- Layout and dashboard work is presentation/supporting evidence only unless Tim explicitly authorizes backend/Writer changes.

## Phase plan

| Phase | Name | Scope | Status |
| --- | --- | --- | --- |
| 0 | Tracker and governance | Create review-gated tracker and branch discipline | COMPLETE |
| 1 | Visual foundation and Pipeline density | Neutral black/grey tokens, typography scale, right-panel text reduction, compact queue styling, preserve map and behavior | IMPLEMENTED - ACCEPTED SCALE-WISE |
| 1B | Persistent Pipeline table layout controls | Smaller default column widths, drag column order left/right, manual width resizing, row-height setting, save/lock persistence | MARKED COMPLETE BY TIM FOR PHASE PROGRESSION; FUTURE TABLE/PANEL PERSISTENCE REMAINS TRACKED |
| 2 | Navigation consolidation | Collapse visible navigation into Pipeline, Map, AI Operations, Control Center, Analytics | IMPLEMENTED BASELINE |
| 3 | AI Operations dashboard | Intake/enrichment visibility, explicit backlog, Writer health, lane performance, Next Priority | BASELINE IMPLEMENTED |
| 4 | Mobile sizing/readability review | Portrait/landscape sizing, map popup shrink, bottom nav, mobile charts, selected-job readability | IMPLEMENTED BASELINE |
| 5 | Workspace layout system | Drag, resize, lock, save, restore, responsive layout separation for panels in every view | FOUNDATION IMPLEMENTED |
| 6 | AI Control Center | External instructions, scoring, FLEX, geography, rules, Writer console, provider registry | BASELINE IMPLEMENTED |
| 7 | VNext scoring backtest/cutover | Backtest, compare user-graded roles, validate, publish only by explicit approval | NEXT |

## Visual target

Pipeline Explorer should feel like a black/grey modern military manufacturing-intelligence cockpit with a slick Shield AI / Hivemind software feel. Movie/game/sci-fi interface inspiration is acceptable when it improves intuitiveness, exploration, priority guidance, and operational readability. Avoid blue-cast structural greys; use true black, white, and neutral greys as the base. Accent colors should communicate function and state.

## Global workspace layout requirement

Every major view must ultimately support operator-owned panel arrangement, not just the Pipeline table.

Required behavior:

- Panels in each view can be moved.
- Panels in each view can be resized.
- Panel placement and sizing can be locked.
- Locked layouts persist across refresh/load/browser reopen.
- Each view can have its own saved layout.
- Desktop, phone portrait, and phone landscape layouts can differ.
- User can unlock, adjust, save, restore, or reset a view layout.
- Layout state is presentation-only; it must never change job data, master state, Writer behavior, scoring, rules, automations, or application history.

## Phase 1 implementation notes

- Implemented as CSS-only overrides in `pipeline-ui-workspace.css`.
- Added neutral black/grey token overrides for the existing variable system.
- Neutralized blue-cast backgrounds across shell, rail, drawer, cards, queue, dashboard cards, map, popovers, and document panels.
- Tightened desktop queue row height, padding, and table typography.
- Reduced right-side job workspace title, metadata, tab, card, key/value, and action typography.
- Constrained map target label size, especially on phone/coarse-pointer layouts.
- Preserved existing selectors and behavior; no JavaScript or data logic changed in this pass.

## Phase 1B table-layout control requirement

Tim accepted the scale/look and required Pipeline table geometry to become operator-adjustable and persistent. This remains part of the future layout-work backlog even though Tim authorized phase progression.

Required behavior:

- Pipeline columns default to smaller, tighter widths than the prior defaults.
- User can drag columns left/right to change visible column order.
- User can drag-resize column widths.
- User can choose a row-height setting.
- Column order, column widths, and row height persist across refresh/load/browser reopen.
- User can explicitly lock/save the table layout so the system keeps it after adjustments.
- User can unlock or reset back to default if needed.
- Saved table layout must be device-safe and must not alter canonical master data, Writer logic, scoring, filters, application state, or row content.

## Phase 2 implementation notes

Runtime file changed: `pipeline-navigation.js`.

Visible navigation is now organized as:

- Pipeline
- Map
- AI Operations
- Control Center
- Analytics

Existing route IDs stay stable so the old pages remain reachable under the new grouping.

## Phase 3 implementation notes

Runtime file changed: `pipeline-operations-ui.js`.

Baseline AI Operations dashboard now adds:

- Next Priority card.
- Open enrichment backlog card.
- Completion ratio card.
- Writer blocked card.
- Intake reviewed card.
- Oldest open age card.
- Enrichment backlog by stage table.
- Coverage-limits note distinguishing UNKNOWN from zero.

The dashboard uses existing Writer-owned supporting operations snapshots. It does not mutate canonical job data, scoring, rules, Writer authority, or automation prompts.

Known Phase 3 limitation: historical intake-vs-enrichment trend lines require durable per-run history in the Writer snapshot. Where history is absent, the dashboard reports UNKNOWN rather than inventing a trend.

## Phase 4 implementation notes

Runtime file changed: `pipeline-ui-mobile.css`.

Baseline mobile pass now adds:

- tighter phone portrait header spacing.
- smaller decision count cards.
- compact map height and controls.
- smaller map target/location popup labels.
- smaller selected-job title/meta/chips while preserving tap targets.
- tighter detail tabs and action buttons.
- five-item bottom navigation sizing after the Phase 2 navigation model.
- landscape safe-area/perimeter padding so edge controls are less likely to be unusable.

This is a CSS-only presentation pass. It does not change map data, route logic, selected-job behavior, Writer, master, scoring, or automations.

## Phase 5 implementation notes

Runtime file changed: `pipeline-pane-split.js`.

Baseline workspace layout foundation now adds:

- A floating Layout toolbar.
- Explicit layout edit mode so normal app use remains unchanged.
- Move handles for eligible visible panels while layout edit mode is active.
- Resize handles for eligible visible panels on desktop/fine-pointer layouts.
- Per-view lock/unlock behavior.
- Save behavior using localStorage only.
- Reset-view behavior that clears presentation geometry for the current view/device.
- Device-separated layout records for desktop, phone portrait, and phone landscape.
- Presentation-only persistence under `px.workspace.layouts.v1`.

Safety constraints:

- The layout system stores only panel transforms and sizes.
- It does not edit canonical job data.
- It does not change master rows, Writer logic, scoring, rules, automation prompts, route logic, or application history.
- Phone layouts are intentionally constrained; free drag/resize is desktop/fine-pointer only.

Known Phase 5 limitation: this is the foundation pass. It does not yet implement named layout presets, cross-device layout copy, or full table column-order persistence from Phase 1B.

## Phase 6 implementation notes

Runtime file changed: `pipeline-navigation.js`.

Baseline Control Center now adds a non-mutating shell on the existing scoring/control route:

- Control Center header and governance statement.
- Live scoring status card.
- Rules authority card.
- Writer connection card.
- Display/columns card.
- Documents / ATS tools card.
- Governance / AI Operations card.
- Shortcut buttons into existing screens.

Safety constraints:

- The Control Center shell is navigation/status only.
- It does not publish scoring.
- It does not save rules.
- It does not touch Writer transport.
- It does not edit Drive authority files.
- It does not alter master data, job state, application history, automation prompts, or VNext scoring status.

Known Phase 6 limitation: this is a cockpit shell, not the final editable authority manager. Future work needs versioned drafts, validation, compare/rollback, provider registry, and explicit publish workflows before it becomes a true authority editor.

## Progress log

- 2026-10-10: Created phased overhaul tracker and branch `phase1-overhaul-visual-foundation`.
- 2026-10-10: Implemented Phase 1 CSS-only visual foundation overrides in `pipeline-ui-workspace.css`.
- 2026-10-10: Restored `build-info.json` placeholder after accidental branch-local stamp; final file content matched main placeholder.
- 2026-10-10: Phase 1 visual scale/look accepted by Tim; Pipeline table layout persistence recorded as required.
- 2026-10-10: Reconfirmed global requirement that panels in every view must be movable, resizable, lockable, saved, restored, and presentation-only.
- 2026-10-10: Implemented Phase 2 baseline in `pipeline-navigation.js`.
- 2026-10-10: Implemented Phase 3 baseline in `pipeline-operations-ui.js`.
- 2026-10-10: Implemented Phase 4 baseline in `pipeline-ui-mobile.css`.
- 2026-10-10: Implemented Phase 5 workspace layout foundation in `pipeline-pane-split.js`.
- 2026-10-10: Implemented Phase 6 Control Center shell in `pipeline-navigation.js`.

## Current review surface

Changed files in PR #85 are expected to include:

- `pipeline-ui-workspace.css`
- `pipeline-navigation.js`
- `pipeline-operations-ui.js`
- `pipeline-ui-mobile.css`
- `pipeline-pane-split.js`
- `docs/PIPELINE_EXPLORER_OVERHAUL_TRACKER.md`

Any Writer, scoring, automation, master-data, or net build-info change should be treated as out of scope.
