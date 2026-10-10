# Writer durable verification, receipt rotation and master archive

Status: verification, rotation and corrections are implemented in this PR. The master archive is designed and sized here and
is **not implemented**, because the sizing shows the proposed scope does not get the master under Google's limit (see §4).

## 1. What failed (2026-10-05)

- The canonical master is a Google Doc of 1,533,639 characters. Google documents that a Doc holds at most 1,024,000
  characters, so the master is at about 150% of that limit. The receipts Doc is at 1,109,515 characters (108%).
- Writes to the master began failing with `The document is inaccessible. Please try again later.`. Small writes sometimes
  still succeeded. Under v20 the master stayed unchanged and no receipts were written.
- Under v21 (PR #42, rolled back), a 5-row ENRICH batch wrote five `COMPLETE` / `READBACK_VERIFIED=YES` receipts and five
  events, but two independent master reads showed the master unchanged (Drive version 814, modified 00:27:50Z).
- **Cause 1, persistence.** Docs edits are flushed when the Apps Script execution ends. That flush failed after the script
  had already returned, which is why callers got an HTML error page and no script line threw.
- **Cause 2, false verification.** A re-open of the master inside the same execution returns that execution's own unsaved
  edits. The in-execution "readback" therefore certified edits that were never persisted.

## 2. Contract now

```
WRITE  (one master write per execution)
  -> index entry PENDING  (Drive text file: synchronous, independent of the Docs flush)
  -> provisional receipt COMPLETION_STATUS=PENDING_VERIFICATION, READBACK_VERIFIED=PENDING
  -> execution ends (Docs flush succeeds or fails)
VERIFY (a LATER execution: next queue tick, the start of the next write, GET verify_pending / request_result)
  -> fresh master read -> per pending write:
       every row equals its intended result and COUNTS matches -> COMPLETE  (receipt READBACK_VERIFIED=YES)
       still equals the pre-write row, younger than 120 s     -> WAIT      (stays PENDING; writes are fenced)
       still equals the pre-write row, older than 120 s       -> FAILED, FINDING=MASTER_NOT_PERSISTED (may be resubmitted)
       anything else (changed by someone else, duplicate ID)   -> STATE_CHANGE_NEEDS_RESOLUTION
```

- **`COMPLETE` means post-execution durable verification.** No execution ever certifies its own write; the verifier refuses
  to run in an execution that wrote the master.
- **Write fence.** No new master write is planned while an earlier one is unverified (a stale read could otherwise be
  planned on), and never twice in one execution. The queue processor leaves a fenced request in the queue for the next
  tick; it does not fail it.
- **Replay protection** comes from the index plus the current receipt log: `COMPLETE` blocks replay, `PENDING` blocks replay,
  and `FALSE_COMPLETE` / `NOT_PERSISTED` allow resubmission. If the index exists but cannot be parsed, the write fails closed.
- **Write paths covered:** batch, single ruling, upsert, intake and undo. Undo only undoes rulings proven durable.
- **Commits** compute COUNTS/END positions from the snapshot already read, so no path re-reads every paragraph after editing.
- **Diagnostics.** Errors return `errorStack` (V8 frames `Code:LINE:COL`) and `docAccess` telemetry; the queue log keeps both.
- **Explorer impact:** none needed. After a write it already re-reads the master in a separate request and marks a row
  `VERIFIED` only on a match (`pipeline.html:418`, `:709`).

## 3. Receipt log rotation and corrections

- **`rotate_receipts` (POST, once).** Steps in order:
  1. Read the legacy receipts Doc.
  2. Write every request it proves `COMPLETE` (951 today) into `PIPELINE_RECEIPT_INDEX.json`.
  3. Only then rename the Doc to `PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS__ARCHIVE_<date>`. It keeps the same file ID, and
     its content is untouched.
  4. Start a new receipt log under the canonical name as a plain Drive text file. It uses the same block format, has no
     Docs size limit, and is written synchronously.

  A second call returns `ALREADY_ROTATED`.
- **`correct_receipts` (POST).** It appends a `RECEIPT_CORRECTION` block and never edits or deletes the original. The block
  carries `CORRECTION=FALSE_COMPLETE`, `FINDING=MASTER_NOT_PERSISTED`, `DISPOSITION=SUPERSEDED`, evidence hashes and a
  replacement note.
  - Evidence-gated: a correction is accepted only if a fresh read shows that the result row recorded in the event log is
    absent from the master. A request whose result IS in the master is refused.
  - Replay protection then stops treating the request as done. Replacements get new request IDs.
- **Known false receipts to correct:** `FITRELAY-1005-22529EC30AD7`, `-6BDFD3B81E28`, `-827F99247F9C`, `-AC9FF5BF740E`,
  `-CONFIDENTIAL` (2026-10-05T01:07:23Z). An audit of 482 COMPLETE receipts since 2026-10-04T12:00Z found no others.

## 4. Master archive: sizing (measured 2026-10-05 on the live master, 1,533,639 chars, 827 rows)

| Bucket | Rows | Characters |
|---|---:|---:|
| SCOUT_INTAKE | 149 | 561,758 |
| DECLINED_BY_TIM | 304 | 354,028 |
| MANUAL_RESEARCH | 48 | 188,420 |
| DISCOVERY_LEAD | 53 | 166,512 |
| CLOSED_DEAD | 137 | 101,346 |
| APPLIED | 53 | 79,902 |
| DUPLICATE | 67 | 46,058 |
| REJECTED_BY_EMPLOYER | 13 | 17,542 |
| non-row notes / blank / COUNTS / END | 570 lines | 12,825 |
| BLOCKED, READY_TO_PURSUE, INVALID_DISCOVERY | 3 | 5,249 |

**The proposed archive** (CLOSED_DEAD, DUPLICATE, DECLINED_BY_TIM, REJECTED_BY_EMPLOYER) moves 521 rows and 518,974
characters. The live master would then hold 306 rows and about **1,014,665 characters, 99.1% of the 1,024,000 limit**. That is
not enough headroom: the remaining 83-row fit backlog alone adds about 50K characters, and each new Scout intake row averages
about 3.8K. The archive is necessary but not sufficient.

**Where the live rows' size actually goes** (306 rows, 1,001,535 chars, 357 distinct payload keys):

| Category | Characters | Share |
|---|---:|---:|
| Notes / evidence prose (`*_NOTE(S)`, `*_EVIDENCE`, `*_REASON`, `*_BASIS`, `*_ANALYSIS`, `*_REVIEW`, `*_AUDIT`) | 418,621 | 41.8% |
| Other facts | 283,710 | 28.3% |
| Provenance / timestamps | 151,737 | 15.2% |
| Fixed columns | 66,371 | 6.6% |
| URLs | 52,478 | 5.2% |
| Retained history (`INTAKE_*`, `*_PRIOR`) | 12,351 | 1.2% |

**Options that reach real headroom** (decision for Tim; none is implemented):

- **A. Terminal archive + evidence companion.** Move long prose fields of live rows to a companion evidence store keyed by
  PRIMARY_ID, leaving a short pointer in the row. Gives about 1,014,665 − 418,621 ≈ **596K (58%)**. This is a row-schema
  change, so readers (Explorer evidence panes, Forge/Claude/Grok) must follow the pointer.
- **B. Terminal archive + archive APPLIED.** About **935K (91%)**. Little headroom, and it contradicts keeping APPLIED live.
- **C. Terminal archive only.** About 1,015K (99%). Not recommended.

The migration procedure (both options) is transactional and keeps the canonical master's file ID:
1. Make a Drive copy of the master as the rollback copy, and record its ID.
2. Create the archive and copy the archived rows exactly.
3. Validate row and ID counts and a per-row content hash.
4. Rebuild the live master text without those rows.
5. Validate totals, COUNTS and UNACCOUNTED=0.
6. Verify in a separate execution.
7. Only then declare cutover.

Rehearse it on a copy of the master first. The rebuild write method (DocumentApp clear+setText versus a Drive content
replace) must be proven on that copy, because the live write path is the thing that is failing.

## Intake receipt identity recovery (2026-10-09)

An original submission RESULT with PENDING is historical. Read the latest final receipt/index by stable requestId (request_id alias; older intake fallback run.SCOUT_RUN_ID). Empty pending obligations and a missing mapping do not prove the rows failed to persist.

The identity-only reconcile_intake_receipt action accepts the original requestId/run ID and WRITE_ID and validates a final independently verified COMPLETE intake receipt for the live master, current unique rows and matching counts/END markers before backfilling the index. Identical legacy END markers are tolerated; conflicting markers are rejected. It does not mutate the master, replay intake or promote partial evidence. A recovery based on a legacy receipt records historical independent proof plus current row presence; it does not reconstruct unavailable original row hashes.

See [intake handoff](automation/intake-handoff.md) for the recovered email batch, shared instruction files and readback evidence. Persistence verification remains distinct from research completeness and readiness to pursue.
