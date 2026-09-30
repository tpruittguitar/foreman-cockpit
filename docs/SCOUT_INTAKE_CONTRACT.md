# Scout intake contract (canonical master, single population)

**Status:** proposed in the scout-intake PR; not live until Tim merges and redeploys the Apps Script. Nothing in this document changes any node's schedule.

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
    "NEVER_CONSIDER_EXCLUDED": [ { "EMPLOYER": "Acme Pharma", "RULE_ID": "NC-PHARMA", "REASON": "pharmaceutical manufacturer" } ],
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
      "PAY_POSTED": "", "DEGREE_TEXT": "", "FLEX_HINT": "", "REPORTING_LEVEL": "", "POSTING_DATE": "", "REMOTE_HYBRID": "", "SCOUT_NOTES": ""
    }
  ]
}
```

`COMPANY` and `TITLE` are required. Everything else may be empty. `EMPLOYER_DOMAIN_HINT` is the employer's **primary business** (used only for never-consider rules; never the job title). Batch limit 200 records.

## Response
```json
{ "ok": true,
  "receipt": { "RECEIPT": "INTAKE_RECEIPT", "SCOUT_RUN_ID": "...", "RECORDS_RECEIVED": 23, "CREATED": 18, "EXISTING_MATCH": 3, "REPLAY": 0, "DISCOVERY_LEAD_AMBIGUOUS": 1, "EXCLUDED_NEVER_CONSIDER": 1, "INVALID_INPUT": 0, "NEW_PRIMARY_IDS": ["V2I-..."], "COUNTS_UPDATED": "YES", "END_UPDATED": "YES", "READBACK_VERIFIED": "YES", "COMPLETION_STATUS": "COMPLETE" },
  "results": [ { "INTAKE_KEY": "IK-...", "result": "CREATED|EXISTING_MATCH|REPLAY|EXCLUDED_NEVER_CONSIDER|INVALID_INPUT", "PRIMARY_ID": "V2I-...", "INV": 563, "BUCKET": "SCOUT_INTAKE", "matchedBy": "", "detail": "" } ],
  "counts": "COUNTS: TOTAL=... SCOUT_INTAKE=... UNACCOUNTED=0",
  "endLine": "END V2_CURRENT_POPULATION_MASTER (N rows)" }
```
`COMPLETION_STATUS=COMPLETE` is only returned when every inserted line and the COUNTS line were read back from the Doc. Otherwise `FAILED` and Scout should retry once; a retry is safe because the endpoint is idempotent.

## Writer behavior (Amendment 58 contract)
1. Script lock; read the fixed master (ID `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`) and its modifiedTime.
2. Sanitize every field (newlines, `; `, ` | ` neutralized; non-http URLs dropped; length capped).
3. Never-consider rules (`TIM_NEVER_CONSIDER_RULES.json` beside the master) are applied to the employer's primary business / employer list. Excluded records are **not** written; they are returned as `EXCLUDED_NEVER_CONSIDER` with the rule id and logged in `SCOUT_RUN_METRICS.jsonl`.
4. Dedupe, in order: `INTAKE_KEY` (replay) → exact employer requisition ID → canonical source URL (LinkedIn job id, Indeed jk, or host+path; search/list URLs ignored) → normalized employer + title + location. One match → `EXISTING_MATCH` with the existing PRIMARY_ID, no new row, existing row untouched. More than one candidate, or employer+title match at a different location → **fail closed on merge**: a `DISCOVERY_LEAD` is created with `IDENTITY_CONFIDENCE=LOW` and `POSSIBLE_MATCHES=<ids>`, asserting no identity.
5. New record: next INV = max existing INV + 1; PRIMARY_ID = `V2I-` + 12 hex of SHA-256(intake key, INV, time), collision-checked; one row appended before the END marker under a `=== SCOUT_INTAKE (0) ===` / `=== DISCOVERY_LEAD (0) ===` heading (headings are presentation only; row BUCKET is authoritative). Bucket is `SCOUT_INTAKE` or `DISCOVERY_LEAD` only; any other proposed bucket is ignored.
6. Re-check modifiedTime immediately before writing; abort if the master changed.
7. Recount `COUNTS:` from row BUCKET values and rewrite `END V2_CURRENT_POPULATION_MASTER (N rows)`.
8. Read back every inserted line and the COUNTS line; emit `INTAKE_RECEIPT` to `PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS`; append the run record to `SCOUT_RUN_METRICS.jsonl`.

## Row shape written
`INV | PRIMARY_ID | COMPANY | TITLE | SCOUT_INTAKE | INTAKE/AWAITING_ANALYSIS | SCOUT_INTAKE_<date>; RUN_<id> | <REQ_ID or UNCAPTURED> | <LOCATION or NOT_STATED> | SCOUT_INTAKE_PENDING (Claude analysis, then Forge verification); INTAKE_KEY=…; SCOUT_RUN_ID=…; DISCOVERED_AT_ET=…; DISCOVERY_SOURCE=…; SOURCE_URL=…; SOURCE_PROVIDER=…; REQ_ID=…; IDENTITY_CONFIDENCE=…; INITIAL_UNKNOWN_FIELDS=…; [POSSIBLE_MATCHES=…]; [PAY_POSTED=…; …]; DATE_ADDED=…; NOTIFICATION_SOURCE=…; STATE_SOURCE=SCOUT_INTAKE:<run>; STATE_UPDATED_AT=…`

## Idempotency
`INTAKE_KEY` is stored on the row. Re-sending a batch returns `REPLAY` for every record already present and creates nothing. When Scout omits `INTAKE_KEY`, it is derived from `SCOUT_RUN_ID` + normalized identity + req + URL, so the same run re-sent is still a no-op.

## What intake never does
Modify, overwrite or reclassify any existing row. Create `READY_TO_PURSUE`, `APPLIED`, `REJECTED_BY_EMPLOYER`, `DECLINED_BY_TIM`, `CLOSED_DEAD`, `DUPLICATE`, `INVALID_DISCOVERY` or any bucket other than the two intake buckets. Delete anything. Touch any file other than the master, the receipts Doc, the run-metrics file and the rules file beside it.

## Downstream expectations (no schedule changes)
- Claude analysis reads `SCOUT_INTAKE` rows and writes proposed enrichment as `CLAUDE_*` / `ANALYSIS_*` / `PROPOSED_*` keys through its own writer path or a STATE_CHANGE_REQUEST; it does not change BUCKET.
- Forge verification writes canonical facts and moves the row to `READY_TO_PURSUE`, `MANUAL_RESEARCH`, `DECLINED_BY_TIM` (rule-based), `DUPLICATE`, `CLOSED_DEAD` or `INVALID_DISCOVERY` through the Authorized State Writer.
- Tim dispositions in the Explorer are canonical immediately (`STATE_SOURCE=TIM_EXPLORER:*`).
- `INVALID_DISCOVERY` rows are never deleted; they are Scout quality evidence.
