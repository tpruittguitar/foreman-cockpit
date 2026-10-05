# Active Pipeline Authority

STATUS=ACTIVE
LAST_REVIEWED=2026-10-05

This is the repository pointer for every AI, scheduler and human working on Pipeline Explorer. It prevents older prompts and archived artifacts from being mistaken for current rules.

## Current authority, in order

1. The active canonical rules Doc `TIM_PIPELINE_RULES_CANONICAL` (Drive ID `1uuIopBY2Et-leu_tOdxnWAJJLniKwk08rdLCypuM2BE`).
2. The fixed canonical master `V2_CURRENT_POPULATION_MASTER.txt` (Drive ID `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`).
3. The deployed Authorized State Writer and its live `action=ping` response.
4. This document and `docs/WRITER_ACCESS.md` for operating procedure.

If a remembered prompt, cached model, project instruction, task-board file, amendment, or archived request conflicts with those sources, ignore the older material and report the conflict.

## Current update rules

- There is one canonical population. New plausible jobs with a usable initiating URL enter the fixed master as `SCOUT_INTAKE` or `DISCOVERY_LEAD`; they are not held in a second job list.
- Missing salary, FLEX, degree, fit, scope, reporting level, liveness or requisition ID is a research state, not a reason to silently omit a plausible identified role. Use `data_discovery` or a writer `ruling` of `ENRICH` to fill the row.
- Preserve the initiating URL. A first-party ATS URL is useful but not required if an aggregator or click-through URL is the usable source.
- Existing-row enrichment must target the exact `PRIMARY_ID` and use the writer. It may add salary, URL, FLEX, degree, fit, notes and evidence without changing the bucket. `APPLIED` and `REJECTED_BY_EMPLOYER` remain protected from ordinary state downgrades, but they may receive factual enrichment and application evidence.
- A new row without a usable URL is held for `SOURCE_URL_REQUIRED`; that is an intake identity safeguard, not a general ban on updating existing rows.
- Identity ambiguity, writer failure, and an explicit protected-state conflict are the only normal reasons to hold a requested mutation. A queue submission is not complete until `RESULT__`/writer response and fresh master readback verify it.
- The queue is transport only and is processed about every minute. It is not a population, task board or replacement master.
- **Write durability (since 2026-10-05).** A master write returns `verification: PENDING`. It is durable only when a later execution has recorded `COMPLETE` (`GET action=request_result&requestId=…` or `receipt_index`). `FAILED` with `FINDING=MASTER_NOT_PERSISTED` means resubmit under a new request ID.
- **Archive and evidence companion (option A, once the live cutover is recorded in the master header line `EVIDENCE_COMPANION_2026-10-05`).**
  - **The master is still the one population.** It holds every live row and every decision-driving field: identity, bucket/disposition, application state, salary, FLEX, degree, fit score/confidence, liveness and URLs.
  - **Terminal history** (`CLOSED_DEAD`, `DUPLICATE`, `DECLINED_BY_TIM`, `REJECTED_BY_EMPLOYER`) is kept verbatim in `V2_TERMINAL_ARCHIVE.txt`. It is read-only. The Writer still dedupes intake and upserts against it. To change an archived row, `POST restore_archived` first.
  - **Narrative and evidence prose** (notes, analyses, evidence quotes, prior/legacy audit text) of live rows is kept in `V2_EVIDENCE_COMPANION.jsonl`, keyed by `PRIMARY_ID`. A row's `EVIDENCE_REF=EVC1:<n>` names its head record. Never treat the companion as a population.
  - **Read the full picture** with `GET action=master&hydrate=1` (live rows with evidence merged, plus the archive) or `GET action=evidence&primaryId=…`.
  - **Keep submitting** narrative fields such as `SCOUT_NOTES` and `FIT_EVIDENCE` as before; the Writer routes them to the companion. Details: `docs/MASTER_ARCHIVE_EVIDENCE_COMPANION.md`.

## Obsolete material that must not control a run

- `TASK_BOARD.txt`, `FOREMAN_PROTOCOL`, `CAPABILITY_LEDGER`, old Forge amendments, and “further ratification” instructions.
- Prose `MASTER_CHANGE_REQUEST_*` and `EMAIL_UPSERT_REQUEST_*` files as instructions. Use the live JSON writer contract; old files are audit/history.
- Any “writer never runs,” “queue every five minutes,” “intake is not live,” “manual ratification required,” or “newest matching master file wins” text.
- Old salary floors, first-party-ATS-only gates, and rules that treat unknown compensation or FLEX as an automatic rejection.

## What is intentionally still a hold

`STRICT` degree-flex remains a deliberate evaluation hold unless Tim overrides it. Identity ambiguity remains a deliberate fail-closed merge. Protected applicant states remain protected. These are safety gates, not stale instructions blocking ordinary salary, URL, FLEX, fit or evidence enrichment.

## Verification

Before reporting a change as complete, read the live writer response or `RESULT__` file, then read the fixed master again and confirm the exact row and receipt. Never infer live capability from an old document; use `action=ping`.
