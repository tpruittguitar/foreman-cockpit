# foreman-cockpit
Foreman Cockpit — operations dashboard

`pipeline.html` — Pipeline Explorer: viewer, analysis and management tool over the canonical master job table (single fixed Drive ID), with Tim rulings, Scout intake presets, a Scout Quality dashboard, a read-only view of the canonical never-consider rules (Doc `TIM_NEVER_CONSIDER_RULES`) and automation timers. The Pipeline Explorer is not a second state store. It may perform canonical mutations only through the Authorized State Writer (`apps-script/Code.gs`) against the fixed master and only with identity checks, protected-state rules, recounting and readback verification. The Explorer itself is a control surface over canonical state.

- Design brief: `docs/PIPELINE_EXPLORER_DESIGN_BRIEF.md` (v0.9; §9D writer, §9E Scout intake).
- Scout intake contract: `docs/SCOUT_INTAKE_CONTRACT.md`.
- Writer setup (Apps Script, one time, Tim only): `apps-script/README.md`.
- Tests (plain node, no dependencies): `for t in parser writer intake rules quality; do node tests/$t.test.js; done`. `tests/intake.test.js <path-to-master-export>` also dry-runs intake against a real export without writing anything.

Pipeline UI feedback update: explicit drag/keyboard column tracks, fixed 35% dashboard / 65% work area, real bundled state boundaries, employer-rejection controls, SVG report and cohort charts, and a searchable Rules outline with lossless source editing.

- Visualization regression checks: `node tests/visualization.test.js`.
- Browser interaction/layout checks (Playwright installed): `node tests/ui.browser.js`. Set `PIPELINE_CHROMIUM` for a custom Chromium executable and `PIPELINE_UI_ARTIFACTS` for screenshot output. All writer requests in this test are intercepted locally; it does not change canonical data.
- Basemap attribution: [us-atlas license](licenses/us-atlas-LICENSE.txt).
