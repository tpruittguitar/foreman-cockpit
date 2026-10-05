# Master archive and evidence companion (option A)

Decision: Tim, 2026-10-05, chose a terminal archive plus an evidence companion (not B or C). The goal is to bring the canonical
master well under Google's 1,024,000-character limit for a Google Doc without creating a second master.

## What stays where

| Store | Holds | Authority |
|---|---|---|
| `V2_CURRENT_POPULATION_MASTER.txt` (canonical, same Drive ID) | every live row; every decision-driving field: identity, bucket/disposition, application state, salary, FLEX, degree, fit score/confidence, liveness, URLs | **authoritative** |
| `V2_TERMINAL_ARCHIVE.txt` | `CLOSED_DEAD`, `DUPLICATE`, `DECLINED_BY_TIM`, `REJECTED_BY_EMPLOYER` rows, verbatim | read-only history; still used for dedupe |
| `V2_EVIDENCE_COMPANION.jsonl` | narrative/evidence prose of live rows (78 keys, e.g. `SCOUT_NOTES`, `FIT_EVIDENCE`, `CLAUDE_REVIEW_NOTE`, `SALARY_NOTE`, `LIVENESS_NOTE`, `*_EVIDENCE_QUOTE`, `PRIOR_*`) | narrative only; never a population |

- **Stays inline even though the name sounds narrative.** These are decision state: `FLEX_BASIS`, `SALARY_BASIS`,
  `LIVENESS_BASIS`, `REOPEN_BASIS`, `PROPOSED_DISPOSITION`, `PROPOSED_DECLINE_REASON_*`, `RESEARCH_REQUEST`,
  `APP_STATUS_EVIDENCE`, `APP_EVIDENCE*`, `REJECTION_EVIDENCE`, `DECLINE_REASON_*`, `NEVER_CONSIDER_REASON`, `TIM_NOTE`,
  `NOTE`, every `*_URL`, every `DEGREE*`, `SALARY_BASE*`, and `FLEX_CLASS` / `FLEX_MODIFIER`.
- The full list is `EVIDENCE_KEYS` / `EVIDENCE_KEEP` in `apps-script/Code.gs`.
- New keys ending `_NOTE`, `_NOTES`, `_ANALYSIS` or `_QUOTE` are treated as narrative.

## Evidence companion format (schema EVC1)

- **File layout.** The first line is a JSON header. Every other line is one record:
  `{"pid","v","base","ts","src","f":{KEY:VALUE}}`.
- **Pointer.** A live row with narrative carries `EVIDENCE_REF=EVC1:<v>`, naming its head record.
- **Resolution.** Start at record `v`, follow `base` links back to 0, and merge oldest to newest; newer values win.
- **Off-chain records are ignored.** A record not on the chain came from a write whose master edit never persisted. This is
  how the master pointer, not the companion, decides which evidence is canonical.
- **Append-only.** Records are never edited or deleted.

## Consumers

- **Explorer:** reads `GET action=master&hydrate=1`. That is the live master with evidence merged back, plus the archived rows
  (marked `ARCHIVE_STATE=ARCHIVED_TERMINAL`) under their bucket headings, with COUNTS and END recomputed over both. Every
  existing view and rule works unchanged, and archived rows are labelled read-only.
- **Scout:** no change. It keeps sending `SCOUT_NOTES` and other intake facts; the Writer routes narrative to the companion
  and dedupes intake against live rows plus the archive. A declined, closed or rejected job is reported as
  `EXISTING_MATCH`, never re-admitted.
- **Claude, Forge, Grok:**
  - Decision fields are still inline in the master.
  - For narrative, read `GET action=master&hydrate=1` or `GET action=evidence&primaryId=…`.
  - Keep writing narrative fields in `ENRICH` rulings as before; the Writer externalizes them.
  - A ruling on an archived row fails closed with `ARCHIVED_ROW`; `POST restore_archived {primaryId}` moves it back,
    verified like any write.
  - An email upsert that matches an archived row is held with `ARCHIVED_MATCH`.
- **Master header:** after the cutover, a line starting `EVIDENCE_COMPANION_2026-10-05` sits above `COUNTS:` and states this
  contract with the companion's and archive's Drive IDs.

## Migration engine (Writer `POST action=migration`)

- `op=plan`: read-only. Returns the reconciliation and the chunk plan.
- `op=prepare, mode=REHEARSAL`: copies the master and builds rehearsal archive/companion files. Nothing touches the
  canonical master.
- `op=prepare, mode=LIVE`: requires `freeze_writer`. Steps:
  1. Writes immutable rollback copies: a Doc copy of the master, an exact text snapshot, and initial copies of the archive
     and the companion.
  2. Writes the archive and the companion.
  3. Stores the chunk plan in `PIPELINE_MIGRATION_STATE.json`.
- `op=step`: one document write per execution. First it verifies the previous chunk from this execution's fresh read:
  - `DONE`: continue.
  - Nothing landed and younger than 120 s: `WAIT`.
  - Nothing landed after that: re-apply.
  - Partial: `HALTED`.

  Then it applies the next chunk: archived-row removals, then live-row rewrites, then the COUNTS/END/contract-line trailer.
  The final step requires the whole document to equal the planned text (hash) before it records `CUTOVER_COMPLETE`.
- After cutover, every master write routes narrative to the companion, so the master cannot regrow, and intake/upsert dedupe
  consult the archive.

## Gates (Tim)

1. PR #43 merged first.
2. Writer frozen during the live migration/cutover.
3. Immutable pre-migration rollback copies.
4. Rehearse against a copy with 100% PRIMARY_ID reconciliation.
5. Decision-driving fields stay inline.
6. A stable evidence pointer/version.
7. Consumers updated before cutover.
8. Cut over only if the result is around the projected size, with counts and hashes reconciled.
9. One controlled ENRICH: PENDING → separate-execution COMPLETE → fresh master readback.
10. Then restart the fit backlog in 5-row batches.

## Measured on the live master (2026-10-05, read-only, actual code)

| Item | Value |
|---|---|
| Source | 1,534,531 chars, 827 rows |
| Target master | **670,653 chars (65.5% of the limit)**: 306 live rows, COUNTS `TOTAL=306 … UNACCOUNTED=0` |
| Archive | 521 rows, 518,973 chars |
| Companion | 279 rows, 2,265 fields, 351,446 chars of narrative |
| Hydrated round trip | all 827 rows reproduce their exact field maps; hydrated COUNTS equal today's COUNTS line byte for byte |

The earlier ~596K projection counted evidence URLs, `FLEX_BASIS`, `SALARY_BASIS` and application evidence as movable. Gate 5
keeps those inline, which gives 670K.
