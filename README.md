# foreman-cockpit
Foreman Cockpit — operations dashboard

`pipeline.html` — Pipeline Explorer: viewer, analysis and management tool over the canonical master job table (single fixed Drive ID), with Tim rulings, Scout intake presets, a Scout Quality dashboard, never-consider rules and automation timers. The Explorer is never a second state store: all canonical mutations go through the Authorized State Writer (`apps-script/Code.gs`) against the single fixed master and require readback verification.

- Design brief: `docs/PIPELINE_EXPLORER_DESIGN_BRIEF.md` (v0.9; §9D writer, §9E Scout intake).
- Scout intake contract: `docs/SCOUT_INTAKE_CONTRACT.md`.
- Writer setup (Apps Script, one time, Tim only): `apps-script/README.md`.
- Tests (plain node, no dependencies): `for t in parser writer intake rules quality; do node tests/$t.test.js; done`. `tests/intake.test.js <path-to-master-export>` also dry-runs intake against a real export without writing anything.
