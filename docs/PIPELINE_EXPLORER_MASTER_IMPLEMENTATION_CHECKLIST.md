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
- [x] Map appears.
- [x] Navigation shows Pipeline, Map, AI Operations, Control Center, Analytics.
- [x] AI Operations page opens.
- [x] Control Center page opens.
- [ ] Mobile bottom nav works.
- [x] No blank screen or fatal UI break is visible.

Smoke test note, 2026-10-10: production app loaded at `https://foreman-cockpit.netlify.app`; visible table showed 647 roles and 1255 row-lines; top navigation rendered Pipeline, Map, AI Ops, Control, and Analytics. Follow-up interaction smoke test verified Map, AI Operations, and Control Center page navigation. That run observed a transient/backend data-load error (`Writer returned an HTML error page instead of JSON`), so job-row click/detail behavior could not be verified end-to-end. Mobile bottom navigation remains unverified because the browser automation could not use a true narrow mobile viewport.

---

## Phase 2 — Storage foundation migration

Goal: make production data loading reliable. The master was already moved from a Google Doc to a plain text file, which was the right first fix. The remaining issue is that production runtime still depends on Google Drive/App Script text-file reads for large runtime data.

Decision file: `docs/STORAGE_ARCHITECTURE_DECISION.md`

Runtime read inventory: `docs/STORAGE_RUNTIME_READ_INVENTORY.md`

- [x] Move live population master away from Google Docs document storage to a plain text master file.
- [x] Record decision: do not use Google Docs as a live app database.
- [x] Record clarified decision: do not rely on Google Drive/App Script large text-file reads as the production runtime data path.
- [x] Restrict Google Docs / Drive files to export, backup, reference, migration source, or manual review artifacts once structured storage exists.
- [x] Inventory runtime reads that depend on Google Drive text files or Apps Script file reads.
- [x] Classify first-pass runtime reads by criticality and migration direction.
- [ ] Choose the replacement durable structured store.
- [ ] Design structured storage for rows, archive, evidence, automation runs, Writer transactions, scoring, and rules.
- [ ] Build a read-only structured mirror from the current text master.
- [ ] Validate counts, bucket totals, archive totals, and evidence resolution against the current text master.
- [ ] Switch production UI reads to bounded JSON endpoints backed by structured storage.
- [ ] Keep Google Drive exports generated from the structured store only.
- [ ] Retire Google Drive text-file reads from the production UI load path.

Immediate hardening while migration is pending:

- [ ] Add guarded archive read wrapper.
- [ ] Make `action=archive` return controlled JSON failure on Drive errors.
- [ ] Never allow archive failure to block active master rendering.
- [ ] Add archive/evidence degraded status to System Health / AI Operations.

---

## Phase 3 — Finish Pipeline table controls

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

## Phase 4 — Finish automation visibility

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

## Phase 5 — Finish automation strategy enforcement

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

## Phase 6 — Finish Control Center

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

## Phase 7 — Finish workspace layout system

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

## Phase 8 — Finish mobile review

Goal: verify the mobile UI on the real target device and tune it from actual use.

- [x] Add initial mobile CSS improvements.
- [ ] Test on actual iPhone portrait.
- [ ] Test on actual iPhone landscape.
- [ ] Verify edge controls are usable in landscape.
- [ ] Verify map popup is not too large.
- [ ] Verify selected job is readable below queue.
- [ ] Tune mobile spacing after real-device review.

---

## Phase 9 — VNext scoring model

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

## Phase 10 — Writer test debt cleanup

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

1. Finish remaining production interaction smoke checks after data loading is stable.
2. Execute the storage foundation migration track so runtime data no longer depends on Google Drive/App Script text-file reads.
3. Finish Pipeline table controls.
4. Finish automation visibility and durable run history.
5. Finish automation strategy enforcement.
6. Finish Control Center authority workflow.
7. Finish workspace layout system polish.
8. Finish mobile real-device review.
9. Run VNext scoring backtest.
10. Only publish VNext if it wins and Tim explicitly approves.
11. Clean up Writer test debt.

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
- storage architecture / runtime data store changes
