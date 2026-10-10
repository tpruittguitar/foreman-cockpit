# Storage Runtime Read Inventory

Status date: 2026-10-10
Status: INITIAL INVENTORY
Decision link: `docs/STORAGE_ARCHITECTURE_DECISION.md`

## Purpose

This file inventories the production runtime read paths that still depend on Google Drive / Apps Script text-file or document access.

The move from a Google Doc master to `V2_CURRENT_POPULATION_MASTER.txt` was the correct first fix. This inventory covers the remaining problem: the app still reads large or important runtime data through Apps Script and Drive APIs. Those reads can stall, return HTML, or fail inconsistently when the UI expects JSON.

## Current production failure that triggered this track

Observed production failure:

```text
archive: Writer returned an HTML error page instead of JSON
```

Failing path:

```text
Pipeline Explorer -> Apps Script Writer GET action=archive -> DriveApp.getFileById(archiveId).getBlob().getDataAsString() -> browser JSON expectation
```

This is a storage dependency problem, not a visual PR #85 problem.

---

## Runtime read inventory

| Read area | Frontend action / call | Backend source today | Runtime criticality | Migration direction | Priority |
|---|---|---|---|---|---:|
| Current population master | `gsGet('master')` via `PipelineLoader.load()` | `DriveApp.getFileById(MASTER_ID).getBlob().getDataAsString()` | Critical: app table cannot reliably load without it | structured `jobs` / `job_rows` table and JSON API | P0 |
| Terminal archive | `gsGet('archive')` | `DriveApp.getFileById(st.archiveId).getBlob().getDataAsString()` | Critical/degrading: currently can stall load and block job click verification | structured `job_archive` table and paged JSON API | P0 |
| Migration state | `gsGet('migration_status')` | migration state text/JSON file in Drive | Critical to archive/evidence routing | structured `storage_state` / migration metadata table | P0 |
| Evidence companion | `gsGet('document_text', companionId)` from loader | Drive text file containing evidence JSONL | Critical/degrading: evidence hydration depends on large text read | structured `job_evidence` table keyed by primary ID/version | P0 |
| On-demand row evidence | `gsGet('evidence', primaryId)` | companion Drive text file | Important for details panel | structured evidence lookup endpoint | P1 |
| Operations / automation ledger | `gsGet('operations')` | Drive text/JSON operations store | Critical for AI Operations dashboard | structured `automation_runs`, `automation_messages`, `obligations` tables | P0 |
| Schedules | `gsGet('schedules')` | Drive JSON scheduler file | Important for operations/control surface | structured `automation_schedules` table | P1 |
| Writer status | `gsGet('writer_status')` | Apps Script aggregates Drive files / queue state | Important health surface | JSON health endpoint backed by structured queue/transaction records | P1 |
| Runs / Scout run metrics | `gsGet('runs')` | Drive JSONL run log | Important for Scout quality / intake accounting | structured `intake_runs` and `intake_run_records` tables | P1 |
| Canonical rules | `gsGet('canonical_rules')` | currently Google Doc / Drive read path | Critical authority | structured `rules_versions` table; generated doc export optional | P0 |
| Published scoring model | `gsGet('scoring')` | Drive JSON file | Critical authority | structured `scoring_model_versions` table; generated export optional | P0 |
| Documents library | `gsGet('documents')` | Drive folder/config scan | Useful but not core data load | metadata table plus Drive file references, Drive only for file bytes | P2 |
| Document text preview | `gsGet('document_text', fileId)` | Drive / Docs text extraction | Useful only for preview/scoring support docs | async extraction cache, not live UI dependency | P2 |
| Interview notes | `gsGet('interview_notes', primaryId)` | Drive text files | Important detail data | structured `interview_notes` table | P1 |
| Event timeline | `gsGet('events', primaryId)` | Drive JSONL event log | Important detail/history | structured `events` table | P1 |
| Receipts | `gsGet('receipts')` / receipt index | Drive text receipt log and index | Important verification data | structured `writer_transactions` and `receipts` tables | P0 |
| Request result recovery | `gsGet('request_result', requestId)` | receipt/index readback through Apps Script/Drive | Critical write verification | structured transaction lookup endpoint | P0 |
| Local UI cache | browser `localStorage` | browser only | fallback only, not authoritative | keep as non-authoritative stale cache | P2 |
| Build identity | `/build-info.json`, GitHub commit check | static Netlify/GitHub | not app data | keep | P3 |
| Geocode/map lookup | external geocode fetch | remote geocode API/cache | useful, not canonical | cache normalized geocodes in structured store later | P3 |

---

## P0 replacement target

The first storage migration slice should not try to rebuild the whole app. It should replace the unstable app-load path first.

Minimum P0 structured store:

1. `jobs`
   - canonical `PRIMARY_ID`
   - current bucket/state/disposition
   - company/title/location/req/source URLs
   - normalized fields used by filtering, scoring, map, and detail cards

2. `job_rows` or `job_versions`
   - preserves INV/version history if needed
   - supports exact row-count and count-line reconciliation against the current text master during migration

3. `job_archive`
   - terminal/archived rows as structured records
   - dedupe still checks archive records
   - UI can page/query archive without loading one huge text blob

4. `job_evidence`
   - evidence records keyed by `PRIMARY_ID`, version/ref
   - replaces evidence companion JSONL read

5. `writer_transactions`
   - request ID
   - action
   - target ID(s)
   - submitted body hash
   - status
   - receipt/readback result
   - durable verification status

6. `automation_runs` / `automation_obligations`
   - source scope
   - planned work
   - completed work
   - skipped work
   - carry-forward obligations
   - Writer submissions and verification

7. `rules_versions`
   - canonical rules source and fingerprint
   - active version
   - generated human-readable export optional

8. `scoring_model_versions`
   - active scoring version
   - draft/review/published state
   - readback hash

## API shape required

The frontend should read bounded JSON endpoints, for example:

```text
GET /api/jobs?bucket=active&limit=500&cursor=...
GET /api/jobs/:primaryId
GET /api/jobs/:primaryId/evidence
GET /api/archive?primaryId=...&limit=...
GET /api/operations/summary
GET /api/operations/runs?cursor=...
GET /api/writer/status
GET /api/writer/transactions/:requestId
GET /api/rules/active
GET /api/scoring/active
```

Rules:

- endpoints must return JSON on every failure;
- endpoints must be bounded/paged;
- app load must not require reading terminal archive or evidence companion before showing active jobs;
- terminal archive and evidence can load progressively after the active job table is usable;
- Google Drive exports can be generated from structured records, but Drive files are not runtime authority.

---

## Immediate short-term hardening while migration is not complete

Before full migration, harden the current backend so production degrades safely:

- [ ] add a guarded `readArchive_()` wrapper;
- [ ] make `action=archive` return controlled JSON failure on Drive errors;
- [ ] never allow archive failure to block active master rendering;
- [ ] add a short timeout / bounded retry pattern around archive/evidence reads if possible;
- [ ] make the frontend show active rows as soon as canonical master succeeds;
- [ ] log archive/evidence failure in AI Operations/System Health as degraded, not blank-table failure.

---

## Migration validation requirements

Before switching runtime reads, prove structured storage matches current authority:

- [ ] total row count matches current text master;
- [ ] bucket counts match current text master;
- [ ] active row count matches current text master;
- [ ] archive row count matches current terminal archive;
- [ ] dedupe behavior matches live + archive behavior;
- [ ] evidence refs resolve to the same reconstructed detail fields;
- [ ] rules fingerprint matches active rules authority;
- [ ] scoring fingerprint/version matches active scoring authority;
- [ ] sample job detail views match old loader output;
- [ ] Writer transaction readback can prove durable completion without parsing large receipt docs.

## Non-goals for first migration slice

Do not combine this with:

- visual redesign;
- VNext scoring cutover;
- automation strategy changes;
- table column persistence;
- broad Control Center editing;
- bulk cleanup of old job data.

The first objective is boring but critical: make production data loading reliable.
