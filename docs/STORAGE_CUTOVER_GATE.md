# SQLite Runtime Cutover Gate

Status date: 2026-10-10
Status: CUTOVER BLOCKED UNTIL ALL GATES PASS

## Purpose

This file prevents an accidental production cutover from Google Drive/App Script runtime reads to SQLite-backed structured storage.

The SQLite path is proven locally. It is not yet the production default.

## Current authority

- Production Pipeline Explorer default still reads through the existing Writer/App Script path.
- Local SQLite is a mirror and development/runtime proof path.
- Drive-synced SQLite exports are generated artifacts only.
- Canonical live Drive files are not yet generated from SQLite.

## Required cutover gates

All gates must pass before production default can use structured storage.

| Gate | Required status | Current status |
|---|---|---|
| SQLite import from current local files | PASS | PASS |
| Master parity validator | PASS | PASS |
| Archive parity validator | PASS | PASS |
| Evidence parity validator | PASS | PASS |
| Bounded local UI read from SQLite | PASS | PASS |
| Drive-synced export publishing | PASS | PASS |
| Production-reachable structured JSON endpoint | PASS | NOT DONE |
| Production UI fallback to current Writer/App Script path | PASS | NOT DONE |
| Fresh production smoke on structured endpoint | PASS | NOT DONE |
| Explicit Tim approval to change production default | REQUIRED | NOT GIVEN |

## Hard stop rules

Do not switch production default data loading until:

1. a production-reachable structured endpoint exists;
2. current Writer/App Script loading remains available as rollback and `docs/STORAGE_RUNTIME_ROLLBACK_PLAN.md` exists;
3. parity validation passes immediately before cutover;
4. a production smoke test passes on structured storage;
5. Tim explicitly approves the production default change.

## Rollback rule

Any structured-storage production cutover must be reversible without changing canonical data.

Rollback must restore the existing Writer/App Script read path as production default.

## What is allowed before cutover

Allowed:

- local SQLite imports;
- local API testing;
- local UI testing with `?src=local`;
- parity validation;
- generated export snapshots;
- publishing generated snapshots to `AI_Coordination/SQLite_Exports`;
- documentation and preflight tools.

Not allowed without explicit approval:

- replacing canonical Drive files;
- changing Writer as the source of truth;
- changing production default data source;
- removing the current Writer/App Script runtime path;
- marking Phase 2 runtime retirement complete.

## Production structured endpoint scaffold

A parallel Netlify endpoint exists at:

    /api/structured/health

It is now a token-gated structured runtime route. Public health is harmless. Counts/jobs/job-detail endpoints accept the existing Writer key and require a loaded Netlify Blob snapshot. This preserves functionality without publishing the full pipeline population to the open web.

Current state as of 2026-10-10: `production_structured_data_available` is true. The UI must still not cut over while `tim_explicit_cutover_approval` is false.

### Non-default UI adapter

`pipeline.html?src=structured` is a parallel test adapter only. It is allowed before cutover because it does not change the default production data source. The default UI must not switch to structured runtime until the gate passes and Tim explicitly approves cutover.


## Browser-seeded structured import

A non-default UI test path can seed structured runtime data from the existing Writer master:

    /pipeline.html?src=structured&import=1

This route uses the existing Writer key already configured in the browser. It does not introduce a second secret and does not change the default Pipeline Explorer load path.
