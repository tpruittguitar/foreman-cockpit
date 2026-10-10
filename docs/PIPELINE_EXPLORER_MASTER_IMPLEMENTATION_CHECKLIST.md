# Pipeline Explorer Master Implementation Checklist

Status date: 2026-10-10
Branch: `main`
Purpose: preserve the full implementation plan so it does not get lost in chat history.

## Status key

- `[x]` Done enough for the current PR / deploy
- `[~]` Started, not finished
- `[ ]` Not started
- `[LOCKED]` Do not start until earlier work is complete and Tim explicitly approves

## Rule for this file

This file is the durable checklist. Future work should update this file when an item is completed, added, split, or intentionally deferred.

---

## Phase 1 — Foundation deploy: PR #85

Goal: put the new command-center structure into the app without changing Writer, automations, master data, or live scoring.

- [x] Create visual overhaul branch and PR #85.
- [x] Add black / grey military-style visual foundation.
- [x] Reduce blue visual feel.
- [x] Tighten Pipeline table row density.
- [x] Reduce oversized right-panel text.
- [x] Preserve Pipeline map.
- [x] Reorganize app navigation into five sections: Pipeline, Map, AI Operations, Control Center, Analytics.
- [x] Update mobile bottom navigation to the five-section model.
- [x] Add AI Operations dashboard starting view.
- [x] Add Control Center starting shell.
- [x] Add mobile sizing/readability improvements.
- [x] Add workspace layout edit foundation.
- [x] Add VNext scoring warning/backtest panel.
- [x] Run syntax checks on changed JavaScript files.
- [x] Run full test suite on PR branch.
- [x] Run full test suite on main for comparison.
- [x] Confirm PR #85 does not introduce a new test regression versus main.
- [x] Merge PR #85.
- [x] Let production deploy complete.
- [x] Run production smoke test.

Production smoke test checklist:

- [x] App opens.
- [x] Pipeline loads.
- [ ] Job click opens detail panel.
- [ ] Map appears.
- [x] Navigation shows Pipeline, Map, AI Operations, Control Center, Analytics.
- [ ] AI Operations page opens.
- [ ] Control Center page opens.
- [ ] Mobile bottom nav works.
- [x] No blank screen or fatal UI break is visible.

Smoke test note, 2026-10-10: production app loaded at `https://foreman-cockpit.netlify.app`; visible table showed 647 roles and 1255 row-lines; top navigation rendered Pipeline, Map, AI Ops, Control, and Analytics. Browser automation did not click through job detail, map, AI Operations, Control Center, or mobile bottom nav, so those remain unchecked for real interaction verification.

---

## Phase 2 — Finish Pipeline table controls

Goal: finish the concrete table-control request so Tim can make the job queue fit his workflow and keep the settings.

- [~] Start smaller/tighter Pipeline table density.
- [ ] Set smaller default column widths intentionally, not just visually.
- [ ] Allow column width resizing to persist after refresh.
- [ ] Allow column order drag left/right.
- [ ] Save column order after refresh.
- [ ] Add row-height setting.
- [ ] Save row-height setting after refresh.
- [ ] Add table layout lock/unlock.
- [ ] Add table layout reset.
- [ ] Verify sorting still works after table changes.
- [ ] Verify filtering still works after table changes.
- [ ] Verify sticky columns still align.

---

## Phase 3 — Finish automation visibility

Goal: solve the problem where an automation can do partial work and Tim cannot tell what was skipped or left unfinished.

- [x] Show current tracked automation/operations backlog starting view.
- [x] Show Next Priority starting card.
- [x] Show Writer blocked count starting card.
- [x] Show oldest open obligation starting card.
- [x] Show backlog by stage starting table.
- [ ] Store durable run history for every automation run.
- [ ] Record what each run intended to do.
- [ ] Record what each run actually completed.
- [ ] Record what each run skipped.
- [ ] Record unfinished carry-forward work.
- [ ] Record Writer writes attempted.
- [ ] Record Writer writes verified.
- [ ] Show intake versus enrichment over time.
- [ ] Show backlog trend over time.
- [ ] Show per-lane automation performance.
- [ ] Prevent silent partial completion from looking complete.

---

## Phase 4 — Finish automation strategy enforcement

Goal: make the five-lane strategy enforceable and visible, not just described in prompts.

Current lane strategy:

1. Job Alert Intake
2. Career Site Discovery
3. Strategic Job Analysis
4. Job Qualification Research
5. Pipeline Resolution Agent

Checklist:

- [x] Define the five-lane automation strategy.
- [~] Configure ChatGPT automation lanes.
- [ ] Verify automation names match function names.
- [ ] Verify every automation points to the correct Drive authority.
- [ ] Verify each lane has the correct source scope.
- [ ] Verify no lane can silently mark partial work complete.
- [ ] Verify unfinished work carries forward.
- [ ] Verify ChatGPT / Grok / Claude handoff rules.
- [ ] Connect automation run outputs into the AI Operations dashboard.

---

## Phase 5 — Finish Control Center

Goal: turn Control Center from a shell into a real management surface for authority and governance.

- [x] Create Control Center shell.
- [x] Add cards/links for scoring, rules, Writer, documents, columns, and AI Operations.
- [ ] Add rule draft mode.
- [~] Add scoring draft mode. Existing scoring local draft exists, but Control Center workflow is not finished.
- [ ] Add automation prompt draft mode.
- [ ] Add validation before publish.
- [ ] Add compare old versus new before publish.
- [ ] Add rollback.
- [ ] Add Drive authority readback proof.
- [ ] Add provider registry/status.
- [ ] Add explicit publish workflow.
- [ ] Ensure Control Center cannot accidentally change live authority.

---

## Phase 6 — Finish workspace layout system

Goal: make each major view operator-adjustable while preserving app behavior.

- [x] Add Layout button.
- [x] Add layout edit mode.
- [x] Allow eligible panels to move on desktop.
- [x] Allow eligible panels to resize on desktop.
- [x] Save layout locally.
- [x] Separate desktop / phone portrait / phone landscape layouts.
- [ ] Add named layout presets.
- [ ] Add copy layout between devices.
- [ ] Add polished per-panel lock indicators.
- [~] Make every major view layout-capable. Foundation exists; polish incomplete.
- [~] Add restore default layouts. Current reset exists; named defaults still needed.

---

## Phase 7 — Finish mobile review

Goal: verify the mobile UI on the real target device and tune it from actual use.

- [x] Add initial mobile CSS improvements.
- [ ] Test on actual iPhone portrait.
- [ ] Test on actual iPhone landscape.
- [ ] Verify edge controls are usable in landscape.
- [ ] Verify map popup is not too large.
- [ ] Verify selected job is readable below queue.
- [ ] Tune mobile spacing after real-device review.

---

## Phase 8 — VNext scoring model

Goal: prove a new scoring model is better before it becomes live.

Important current status: VNext is not live. PR #85 only adds a warning/backtest panel.

- [x] Add VNext warning/backtest panel.
- [x] Keep VNext out of live scoring.
- [x] Define VNext proposed weight shape.
- [ ] Map VNext categories to real row fields.
- [ ] Select at least 24 labeled roles.
- [ ] Label roles Good / Borderline / Bad.
- [ ] Run current model against labeled roles.
- [ ] Run VNext model against labeled roles.
- [ ] Compare current model versus VNext.
- [ ] Prove VNext beats current model.
- [ ] Prepare cutover proposal.
- [LOCKED] Get explicit Tim approval before making VNext live.
- [LOCKED] Publish VNext to live scoring authority.
- [LOCKED] Update automations to use VNext only after live scoring cutover.

---

## Phase 9 — Writer test debt cleanup

Goal: get the repo test baseline clean so future PRs are easier to judge.

Current status: Writer tests fail on PR #85 and main with the same failures. These are not caused by PR #85.

- [x] Confirm Writer tests fail on PR branch.
- [x] Confirm Writer tests fail on main.
- [x] Separate Writer test debt from UI PR #85.
- [ ] Investigate Windows `fsync` failure in writer-transport CLI test.
- [ ] Investigate Writer output formatting assertion: `result is a single line with >=10 cells`.
- [ ] Fix or classify both failures.
- [ ] Get test suite green on main.

---

## Recommended execution order from here

1. Finish remaining production interaction smoke checks.
2. Finish Pipeline table controls.
3. Finish automation visibility and durable run history.
4. Finish automation strategy enforcement.
5. Finish Control Center authority workflow.
6. Finish workspace layout system polish.
7. Finish mobile real-device review.
8. Run VNext scoring backtest.
9. Only publish VNext if it wins and Tim explicitly approves.
10. Clean up Writer test debt.

---

## Hard rule

Do not bury policy changes inside UI work.

Separate PRs should be used for:

- visual/UI work
- Writer behavior
- automation behavior
- scoring model cutover
- Drive authority changes
- master data changes
