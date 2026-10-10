# Local SQLite Structured Storage Design

Status date: 2026-10-10
Status: Phase 2 design complete; not production cutover.

## Purpose

Pipeline Explorer is a personal/local-first command center, not an enterprise application. The runtime store should therefore be boring, free, recoverable, and inspectable: one SQLite database with a small JSON API.

This design replaces Google Drive/App Script large text reads as the runtime data path while keeping Drive text files as exports, backups, references, and migration sources.

## Runtime source-of-truth rule

Once cut over, the browser reads bounded JSON or a generated master-compatible view from SQLite. Google Drive files may be generated from SQLite, but the browser should not depend on reading large Drive text files through Apps Script for normal runtime.

## Core tables

| Table | Purpose |
|---|---|
| `jobs` | Current live job rows keyed by `primary_id`. |
| `job_payload_fields` | Searchable structured payload fields from the master row. |
| `archive_jobs` | Terminal history rows, read-only unless restored. |
| `evidence_records` | Raw evidence fragments keyed by job/version/source. |
| `evidence_chains` | Resolved evidence head per job, including unresolved flag. |
| `source_files` | Imported source files or Drive IDs with hashes/counts. |
| `job_versions` | Historical row snapshots for audit and rollback comparison. |

## Operations and automation tables

| Table | Purpose |
|---|---|
| `automation_runs` | Durable run record: intended scope, completed scope, skipped scope, carry-forward work. |
| `automation_run_events` | Event log for each automation run. |
| `operation_obligations` | Open/closed obligations that AI Operations can show without guessing. |
| `operations` | Existing simple operation summary table retained for compatibility. |

## Writer and authority tables

| Table | Purpose |
|---|---|
| `writer_transactions` | Writer request lifecycle: request, state, target row, payload, receipt, verified time. |
| `scoring_model_versions` | Draft/live/retired scoring models. VNext remains non-live until approved. |
| `rule_versions` | Draft/live/retired rule authority snapshots with hashes. |
| `runtime_read_status` | Active master/archive/evidence read health for UI status panels. |
| `export_snapshots` | Records generated Drive/text exports from SQLite. |

## Cutover constraints

1. No production UI read cutover until row counts, bucket counts, archive counts, and evidence resolution are reconciled against the current master/archive/evidence files.
2. No Writer behavior change is implied by this schema design.
3. No scoring or rules authority change is implied by this schema design.
4. The SQLite API must return controlled JSON failures. No HTML error page should be treated as data.
5. Drive export generation is allowed after cutover; Drive runtime dependency is not.

## Initial validation targets

Before production reads move to SQLite, validate:

- live row count;
- distinct active job count;
- bucket counts;
- terminal archive row count;
- evidence record count;
- evidence unresolved count;
- selected detail-drawer row parity for at least 10 sampled jobs;
- Writer transaction replay/index parity where available;
- current scoring model hash and rule hash captured as authority snapshots.

## Current implementation status

Implemented prototype:

- local SQLite schema;
- real text master import;
- `/api/master` Pipeline-compatible read endpoint;
- dev-only `?src=local` adapter;
- runtime read health visible in AI Operations.

Still open:

- import terminal archive into `archive_jobs`;
- import evidence companion into `evidence_records` and `evidence_chains`;
- import operation/automation snapshots into run/obligation tables;
- import live scoring/rules authority snapshots;
- expose bounded JSON endpoints for production reads;
- cut production UI reads only after reconciliation.
