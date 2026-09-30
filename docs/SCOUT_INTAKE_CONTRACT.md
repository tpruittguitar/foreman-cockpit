# Scout intake contract (canonical master, single population)

**Status:** proposed in the scout-intake PR (amended 2026-09-30 per ChatGPT's *Canonical never-consider ruleset + Scout intake integration* amendment); not live until Tim merges and redeploys the Apps Script. Nothing in this document changes any node's schedule.

**Canonical never-consider configuration:** the Google Doc `TIM_NEVER_CONSIDER_RULES` in AI_Coordination, Drive ID `1qLeVwmW76Cm_lHdleb342sE7_ej4dqTfODR1TcnF5os`. Configuration only; never a job database. The fixed canonical master remains `V2_CURRENT_POPULATION_MASTER.txt`, Drive ID `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`.

**Principle.** One job = one canonical row = one current state, from discovery through final disposition. Scout does not keep its own population. Every plausible discovery becomes a canonical row in `SCOUT_INTAKE` or `DISCOVERY_LEAD`, or is reported as excluded, or returns the existing PRIMARY_ID it duplicates. **Unknown is a research state, not a rejection reason.** Scout must not withhold a plausible role because pay, degree/FLEX, scope, reporting level, liveness or the exact req ID is unknown; list those in `INITIAL_UNKNOWN_FIELDS`.

## Flow
Grok/Scout discovery → `intake` → canonical row (`SCOUT_INTAKE` or `DISCOVERY_LEAD`) → Claude analysis (proposed enrichment written as `CLAUDE_*` / `ANALYSIS_*` / `PROPOSED_*` keys) → Forge/ChatGPT verification (canonical `SALARY_*`, `FLEX`, `DEGREE_REQ`, `LIVENESS`, floor, disposition to `READY_TO_PURSUE` / `MANUAL_RESEARCH` / etc.) → Tim disposition in the Explorer → same row throughout.

## Endpoint
POST to the Explorer's Apps Script web app (the same one that applies Tim's rulings), body `text/plain` JSON:

```json
{
  "action": "intake",
  "key": "<passphrase>",
  "run": {
    "SCOUT_RUN_ID": "SCOUT-2026-10-01-0300",
    "RUN_STARTED_AT_ET": "2026-10-01 03:00 ET",
    "GROSS_FOUND": 23,
    "NEVER_CONSIDER_EXCLUDED": [ ],
    "SOURCE_PROVIDERS": ["LinkedIn", "Greenhouse"]
  },
  "records": [
    {
      "INTAKE_KEY": "optional stable key; derived from run + identity when omitted",
      "COMPANY": "Nova Forge Robotics",
      "TITLE": "Director of Manufacturing",
      "LOCATION": "Huntsville, AL",
      "REQ_ID": "GH-7777777001",
      "SOURCE_URL": "https://job-boards.greenhouse.io/novaforge/jobs/7777777001",
      "SOURCE_PROVIDER": "Greenhouse",
      "DISCOVERY_SOURCE": "Scout direct ATS rotation",
      "DISCOVERED_AT_ET": "2026-10-01 03:12 ET",
      "IDENTITY_CONFIDENCE": "HIGH",
      "PROPOSED_BUCKET": "SCOUT_INTAKE",
      "INITIAL_UNKNOWN_FIELDS": ["PAY", "DEGREE", "FLEX", "FIT", "LIVENESS", "REPORTING_LEVEL"],
      "EMPLOYER_DOMAIN_HINT": "defense robotics manufacturer",
      "NEVER_CONSIDER_RULE_ID": "", "EXCLUSION_CONFIDENCE": "", "EXCLUSION_REASON": "",
      "PAY_POSTED": "", "DEGREE_TEXT": "", "FLEX_HINT": "", "REPORTING_LEVEL": "", "POSTING_DATE": "", "REMOTE_HYBRID": "", "SCOUT_NOTES": ""
    }
  ]
}
```

`COMPANY` and `TITLE` are required. Everything else may be empty or UNKNOWN. `SOURCE` is accepted as an alias of `DISCOVERY_SOURCE`. `EMPLOYER_DOMAIN_HINT` is the employer's **primary business** (never the job title). Batch limit 200 records.

**Every gross discovery is submitted as a record. The writer, not Scout, owns the NEVER_CONSIDER_EXCLUDED decision.** A record may *propose* `NEVER_CONSIDER_RULE_ID` (an id that is ACTIVE in the Doc), `EXCLUSION_CONFIDENCE` (`HIGH|MED|LOW`), `EXCLUSION_REASON` and employer evidence (`EMPLOYER_DOMAIN_HINT` / `EMPLOYER_PRIMARY_BUSINESS`); the writer adjudicates. `GROSS_FOUND` should equal the number of records submitted. `run.NEVER_CONSIDER_EXCLUDED` is retained only for backward compatibility and is **not** accepted as already excluded: each entry is appended as an input candidate (`SUBMITTED_VIA=RUN_PRE_EXCLUSION`) and goes through the same classification and admission path; an entry the writer cannot adjudicate (no COMPANY/TITLE) is `WRITE_FAILED`, never silently excluded. Run metadata can carry counters but can never remove a candidate from writer adjudication.

## Outcomes
Every gross discovery ends in exactly one explicit outcome; nothing is omitted because information is unknown:

| Outcome | Meaning |
|---|---|
| `NEVER_CONSIDER_EXCLUDED` | An ACTIVE rule cited at `HIGH` confidence. No row is created. The exclusion is logged with the full audit contract and counted by rule id. |
| `SCOUT_INTAKE_WRITTEN` | A `SCOUT_INTAKE` row was written and read back. |
| `DISCOVERY_LEAD_WRITTEN` | A `DISCOVERY_LEAD` row was written and read back (weak or ambiguous identity; carries `POSSIBLE_MATCHES` when ambiguous). |
| `EXISTING_MATCH` | The job already has a canonical row (req, URL, employer+title+location, or `INTAKE_KEY` replay). Existing row untouched; its PRIMARY_ID and bucket are returned. |
| `WRITE_FAILED` | Malformed input (`INVALID_INPUT`), or readback did not verify. Nothing counted as entered. |

`HIGH` is necessary, not sufficient: when the supplied employer evidence (`EMPLOYER_DOMAIN_HINT` / `EMPLOYER_PRIMARY_BUSINESS`) names a case every rule's `DO_NOT_MATCH` protects (supplier, equipment or machine maker, automation, integrator, software, consultancy, engineering firm, logistics, component supplier, "serving" an industry), the outcome is REVIEW with basis `EVIDENCE_CONFLICT_DO_NOT_MATCH`, never EXCLUDE. `MED` or `LOW` confidence, a rule id the Doc does not carry as ACTIVE, an unreadable Doc, or a writer-side domain hint never exclude: the record is admitted and the row carries `NEVER_CONSIDER_REVIEW_NEEDED=<rule id> <confidence> (<basis>)` and `NEVER_CONSIDER_REASON`. The writer never invents a category.

## Response
```json
{ "ok": true, "WRITE_VERIFIED": true, "RUN_ACCOUNTING": "RECONCILED", "DISCOVERY_UNACCOUNTED": 0, "COMPLETION_STATUS": "COMPLETE", "error": "",
  "receipt": { "RECEIPT": "INTAKE_RECEIPT", "SCOUT_RUN_ID": "...", "RECORDS_RECEIVED": 23,
               "COUNTERS": { "GROSS_FOUND": 23, "NEVER_CONSIDER_EXCLUDED": 2, "NC-001_COUNT": 1, "NC-002_COUNT": 0, "NC-003_COUNT": 0, "NC-004_COUNT": 1, "ENTERED_MASTER": 18, "SCOUT_INTAKE_WRITTEN": 15, "DISCOVERY_LEAD_WRITTEN": 3, "EXISTING_MATCH": 3, "WRITE_FAILED": 0, "NEVER_CONSIDER_REVIEW_NEEDED": 1, "DISCOVERY_ACCOUNTED": 23, "DISCOVERY_UNACCOUNTED": 0, "RUN_ACCOUNTING": "RECONCILED" },
               "RULES_STATUS": "ACTIVE", "RULES_DOC_ID": "1qLeVwmW76Cm_lHdleb342sE7_ej4dqTfODR1TcnF5os", "DISCOVERY_LEAD_AMBIGUOUS": 1,
               "NEW_PRIMARY_IDS": ["V2I-..."], "COUNTS_UPDATED": "YES", "END_UPDATED": "YES", "READBACK_VERIFIED": "YES", "RUN_ACCOUNTING": "RECONCILED", "DISCOVERY_UNACCOUNTED": 0, "COMPLETION_STATUS": "COMPLETE" },
  "results": [ { "INTAKE_KEY": "IK-...", "result": "NEVER_CONSIDER_EXCLUDED|SCOUT_INTAKE_WRITTEN|DISCOVERY_LEAD_WRITTEN|EXISTING_MATCH|WRITE_FAILED", "PRIMARY_ID": "V2I-...", "INV": 563, "BUCKET": "SCOUT_INTAKE", "matchedBy": "", "detail": "", "NEVER_CONSIDER_RULE_ID": "", "NEVER_CONSIDER_REVIEW_NEEDED": "" } ],
  "counts": "COUNTS: TOTAL=... SCOUT_INTAKE=... UNACCOUNTED=0",
  "endLine": "END V2_CURRENT_POPULATION_MASTER (N rows)" }
```
`ok` means the **whole** intake contract completed: readback verified **and** the run reconciles. `WRITE_VERIFIED` is reported separately so a caller can tell a successful canonical write from incomplete Scout accounting. `COMPLETION_STATUS`: `COMPLETE` (ok:true); `FAILED` when readback did not verify (ok:false, WRITE_VERIFIED:false; Scout retries once, safe because the endpoint is idempotent); `INCOMPLETE` when the write verified but the run does not reconcile (ok:false, WRITE_VERIFIED:true; rows already written are canonical and must not be retried; Scout submits the missing discoveries as records). The Explorer's Scout quality tab shows each run as COMPLETE, WRITE VERIFIED / RUN INCOMPLETE, or WRITE FAILED.

**Full-accounting invariant**, checked per submitted run: `GROSS_FOUND = NEVER_CONSIDER_EXCLUDED + SCOUT_INTAKE_WRITTEN + DISCOVERY_LEAD_WRITTEN + EXISTING_MATCH + WRITE_FAILED`. A supplied `GROSS_FOUND` never disagrees silently: the difference is emitted as `DISCOVERY_UNACCOUNTED` with `RUN_ACCOUNTING=INCOMPLETE` (discoveries Scout found but did not submit or list as excluded; Scout must submit them) or `OVERREPORTED` (fewer found than outcomes). When `GROSS_FOUND` is omitted it is derived from the submitted records plus Scout's exclusion list and reconciles by construction.

## Writer behavior (Amendment 58 contract)
1. Script lock; read the fixed master (ID `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`) and its modifiedTime.
2. Sanitize every field (newlines, `; `, ` | ` neutralized; non-http URLs dropped; length capped).
3. Never-consider: the canonical Doc `TIM_NEVER_CONSIDER_RULES` (fixed ID) is read (never saved, so its modifiedTime is untouched) and parsed (`RULE_ID`, `CATEGORY`, `ACTION`, `MATCH`, `DO_NOT_MATCH`, `REASON`, `EXCEPTION`, `STATUS`). A record is excluded only when it cites an ACTIVE `DO_NOT_ADD` rule at `HIGH` confidence; it is then **not** written, returned as `NEVER_CONSIDER_EXCLUDED`, logged with the audit contract, and counted under `<RULE_ID>_COUNT`. Anything less certain is admitted with `NEVER_CONSIDER_REVIEW_NEEDED`. If the Doc cannot be read the default is `ALLOW_INTAKE`: nothing is excluded, reviews are flagged, and the receipt says `RULES_STATUS=UNAVAILABLE`. Existing rows are never deleted or reclassified by a rule.
4. Dedupe, in order: `INTAKE_KEY` (replay) → requisition ID **bound to the same normalized employer** (req formats are employer-local; the same token at a different employer is not a match unless the record's canonical URL binds it to that row, `REQ_ID+SOURCE_URL`) → canonical source URL (LinkedIn job id, Indeed jk, or host+path; search/list URLs ignored) → normalized employer + title + location, **exact only when both normalized locations are present and equal and exactly one row matches**. One match → `EXISTING_MATCH` with the existing PRIMARY_ID, no new row, existing row untouched. Anything else (several candidates, a different location, a missing location on either side, a req collision at another employer) → **fail closed on merge**: a `DISCOVERY_LEAD` is created with `IDENTITY_CONFIDENCE=LOW` and `POSSIBLE_MATCHES=<ids>`, asserting no identity. A later distinct requisition at the same employer/title with no stated location is therefore preserved, never swallowed.
5. New record: next INV = max existing INV + 1; PRIMARY_ID = `V2I-` + 12 hex of SHA-256(intake key, INV, time), collision-checked; one row appended before the END marker under a `=== SCOUT_INTAKE (0) ===` / `=== DISCOVERY_LEAD (0) ===` heading (headings are presentation only; row BUCKET is authoritative). Bucket is `SCOUT_INTAKE` or `DISCOVERY_LEAD` only; any other proposed bucket is ignored.
6. Re-check modifiedTime immediately before writing; abort if the master changed.
7. Recount `COUNTS:` from row BUCKET values and rewrite `END V2_CURRENT_POPULATION_MASTER (N rows)`.
8. Read back every inserted line and the COUNTS line; if readback fails, the would-be rows are reported as `WRITE_FAILED` and count as nothing entered. Emit `INTAKE_RECEIPT` to `PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS`; append the run record (counters, exclusion audit list, per-record outcomes) to `SCOUT_RUN_METRICS.jsonl` beside the master. That file is telemetry, not candidate state, and never a second ledger.

## Row shape written
`INV | PRIMARY_ID | COMPANY | TITLE | SCOUT_INTAKE | INTAKE/AWAITING_ANALYSIS | SCOUT_INTAKE_<date>; RUN_<id> | <REQ_ID or UNCAPTURED> | <LOCATION or NOT_STATED> | SCOUT_INTAKE_PENDING (Claude analysis, then Forge verification); INTAKE_KEY=…; SCOUT_RUN_ID=…; DISCOVERED_AT_ET=…; DISCOVERY_SOURCE=…; SOURCE_URL=…; SOURCE_PROVIDER=…; REQ_ID=…; IDENTITY_CONFIDENCE=…; INITIAL_UNKNOWN_FIELDS=…; [POSSIBLE_MATCHES=…]; [PAY_POSTED=…; …]; DATE_ADDED=…; NOTIFICATION_SOURCE=…; STATE_SOURCE=SCOUT_INTAKE:<run>; STATE_UPDATED_AT=…`

## Idempotency
`INTAKE_KEY` is stored on the row. Re-sending a batch returns `EXISTING_MATCH` (matchedBy `INTAKE_KEY`, detail `REPLAY`) for every record already present and creates nothing. When Scout omits `INTAKE_KEY`, it is derived from `SCOUT_RUN_ID` + normalized identity + req + URL, so the same run re-sent is still a no-op.

## What intake never does
Modify, overwrite or reclassify any existing row. Create `READY_TO_PURSUE`, `APPLIED`, `REJECTED_BY_EMPLOYER`, `DECLINED_BY_TIM`, `CLOSED_DEAD`, `DUPLICATE`, `INVALID_DISCOVERY` or any bucket other than the two intake buckets. Delete anything. Downgrade any row. Write to the rules Doc. Touch any file other than the master, the receipts Doc and the run-metrics file beside it.

## Downstream expectations (no schedule changes)
- Claude analysis reads `SCOUT_INTAKE` rows and writes proposed enrichment as `CLAUDE_*` / `ANALYSIS_*` / `PROPOSED_*` keys through its own writer path or a STATE_CHANGE_REQUEST; it does not change BUCKET.
- Forge verification writes canonical facts and moves the row to `READY_TO_PURSUE`, `MANUAL_RESEARCH`, `DECLINED_BY_TIM` (rule-based), `DUPLICATE`, `CLOSED_DEAD` or `INVALID_DISCOVERY` through the Authorized State Writer.
- Tim dispositions in the Explorer are canonical immediately (`STATE_SOURCE=TIM_EXPLORER:*`).
- `INVALID_DISCOVERY` rows are never deleted; the ruling preserves the row with `INVALID_REASON`, `TIM_RULING`, `STATE_UPDATED_AT` and `STATE_SOURCE`. They are Scout quality evidence.

## Scout quality counters
Per run: `GROSS_FOUND`, `CANDIDATES_SUBMITTED`, `PRE_EXCLUSION_ENTRIES`, `NEVER_CONSIDER_EXCLUDED`, `<RULE_ID>_COUNT` for every rule in the Doc (an exclusion can only ever cite an ACTIVE rule, because the writer decides), `ENTERED_MASTER`, `SCOUT_INTAKE_WRITTEN`, `DISCOVERY_LEAD_WRITTEN`, `EXISTING_MATCH`, `WRITE_FAILED`, `NEVER_CONSIDER_REVIEW_NEEDED`. Downstream cohort metrics from the live rows: `VALID_DISTINCT`, `READY`, `APPLIED`, `DECLINED`, `DUPLICATE`, `DEAD_OR_STALE`, `INVALID_DISCOVERY`, `STILL_UNRESOLVED`. Derived: `ADMISSION_RATE = ENTERED_MASTER / GROSS_FOUND`, `VALIDITY_RATE = VALID_DISTINCT / ENTERED_MASTER`, `ACTIONABLE_YIELD = (READY + APPLIED) / ENTERED_MASTER`, `DUPLICATE_RATE`, `INVALID_RATE`, `UNRESOLVED_RATE`, `MEDIAN_TIME_TO_FINAL_DISPOSITION`. A role Tim declines for pay, geography, degree/FLEX, scope, industry preference or compensation stays a valid discovery.
