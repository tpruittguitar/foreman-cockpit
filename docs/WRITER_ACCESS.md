# WRITER ACCESS DIRECTIVE — 2026-10-02

STATUS=ACTIVE · OWNER=Tim Pruitt · APPLIES TO: Grok/Scout, ChatGPT/Forge, Claude/Foreman, any scheduled automation. Verify the live version and action list with `action=ping`; this document is the contract, not a version pin.

Tim's ruling, 2026-10-02: the shared writer credential may be used, stored and written wherever it helps automation. Any earlier text that forbids the passphrase in Drive or prompts is superseded for this credential.

Every canonical change to `V2_CURRENT_POPULATION_MASTER.txt` (Drive `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`) goes through the Authorized State Writer. You have three equivalent ways to reach it. Use whichever your runtime supports, in this order of preference.

## 1. Drive queue (no HTTP, no key)

Save one file into **AI_Coordination/WRITER_QUEUE** (folder `1IVyEKPxqY_7uL9GG9RV9Gu9raEco0AZ7`; results land in `processed` `1kVgPtqqUtxoRyTC72Wb59kInHJMZGV0a` or `failed` `1hMcqUNYe5m6yjHmYkbdd9CcvqOwgEzZ1`). The file is a plain-text or Google Doc file whose content is one JSON write body (see "Write bodies" below). Use a descriptive name, such as `GROK07_2026-10-02_0600ET_intake.json`.

- A trigger claims and applies the queue about every 1 minute. A GET with `action=process_queue` applies it immediately when that endpoint is available.
- A successful request moves to `WRITER_QUEUE/processed`. Anything else moves to `WRITER_QUEUE/failed`. Either way a `RESULT__<name>.json` file appears beside it with the writer's full response and a `terminalStatus`:
  - `SUCCESS`: applied.
  - `FAILED`: nothing in the RESULT applied unless its per-request results say so. This includes `REJECTED_SCHEMA`: the body was malformed and nothing was attempted.
  - `PARTIAL_HOLD`: a mixed batch stopped part-way, either at the write fence (one master write per execution) or at the time budget. `results` shows what ran; `remainder` is the untouched rest, ready to resubmit as its own file. It is never re-run automatically.
  - `HOLD_ABANDONED`: the execution that claimed the file died before finishing, for example at the 6-minute Apps Script limit. The RESULT lists each request ID's receipt-index state. Reconcile those IDs against the receipts and the master before resubmitting; the worker never re-runs an abandoned claim.
  - `HOLD_UNMOVED`: the RESULT was written but the move failed, so the file stays in the queue as `HOLD__<name>` and is never claimed again.
- A file named `PROCESSING__<name>` is being applied. One older than 8 minutes was abandoned, and the next tick finalizes it as `HOLD_ABANDONED`.
- The worker claims new files only in the first 90 seconds of an execution, and a mixed batch starts no request after 4.5 minutes. One claim therefore cannot run into the 6-minute limit.
- A batch made only of rulings is applied as one master write. A batch that mixes actions runs one request at a time, and only its first master write can land in that execution. Keep master writes of different kinds in separate files.
- The Explorer's **WRITER** badge (GET `action=writer_status`) shows the freeze, running claims and their age, queued and held files, unverified writes, the trigger, the last queue results and the deployed Writer PR. It raises an alert strip when something needs attention.
- Every run is also logged in `WRITER_QUEUE_LOG.jsonl` in AI_Coordination.
- Code fences, a BOM and smart quotes are tolerated. Any `key` field is ignored, because Drive access is the authorization.

## 2. HTTP POST

```
POST https://script.google.com/macros/s/AKfycbwShspSkto70NeFWjgTuyIf-W3EDgUmKmoWevE-jZq95pm6SAulrJYHX1HmiPg8tx3i/exec
Content-Type: text/plain
{"key":"<current private writer credential>", ...write body...}
```

Follow the 302 redirect with a GET, which `curl -L` does by default.

## 3. HTTP GET only, for runtimes that can only fetch a URL

```
GET <same URL>?action=submit&key=<current-private-writer-credential>&payload=<URL-encoded JSON write body>
```

Keep GET payloads small, roughly one ruling or 1 to 5 intake records. Use the queue or a POST for anything larger.

## Reads (GET)

`?action=ping&key=<current-private-writer-credential>`, `?action=master&key=<current-private-writer-credential>` (full master text plus modifiedTime), `?action=rules&key=<current-private-writer-credential>`, `?action=runs&key=<current-private-writer-credential>`, `?action=receipts&key=<current-private-writer-credential>`, and `?action=automation&key=<current-private-writer-credential>` (queue status), and `?action=writer_status&key=<current-private-writer-credential>` (monitor snapshot with warnings; `ping` and `writer_status` also report the deployed Writer's commit and PR as `build`).

## Write bodies

| action | use | body |
|---|---|---|
| `intake` | Scout discoveries, creating new SCOUT_INTAKE / DISCOVERY_LEAD rows | `{"action":"intake","run":{"SCOUT_RUN_ID":"…","GROSS_FOUND":N},"records":[{COMPANY,TITLE,LOCATION,REQ_ID,SOURCE_URL,SOURCE_PROVIDER,DISCOVERY_SOURCE,DISCOVERED_AT_ET,IDENTITY_CONFIDENCE,INITIAL_UNKNOWN_FIELDS,…}]}`, per docs/SCOUT_INTAKE_CONTRACT.md |
| `ruling` | change one existing row by exact PRIMARY_ID | `{"action":"ruling","ruling":{"primaryId":"V2S-…","kind":"…","actor":"FORGE","requestId":"…","note":"…","fields":{…}}}`. The fields must be nested inside `ruling` and use camelCase (`primaryId`, `requestId`). A flat or snake_case ruling (`"primary_id"` beside `"action"`) is rejected as `REJECTED_SCHEMA`, and a batch containing one is rejected whole. |
| `upsert_application` | email-confirmed application or rejection (Tim directive 2026-09-29) | `{"action":"upsert_application","event":{"COMPANY":"…","TITLE":"…","STATE":"APPLIED"\|"REJECTED_BY_EMPLOYER","EVENT_DATE":"YYYY-MM-DD","EVIDENCE":"Gmail <id> <sender> \"<subject>\"","REQ_ID":"…","LOCATION":"…","SOURCE_URL":"…","TARGET_PRIMARY_ID":"(optional)"}}` |
| `batch` | up to 25 of the above, applied in order | `{"action":"batch","requests":[…]}` |

The live writer also exposes `data_discovery` (durable requests to research missing fields), `scoring` (read the shared weighted model), `save_scoring_model` (publish a validated model), `document_text` (extract supported Drive document text), and `discovery_requests` (read discovery-request status). Use `ruling` with `kind:"ENRICH"` for salary, URL, FLEX, degree, fit and other row facts; it does not change the bucket. These actions are discoverable from `ping` and must not be treated as unavailable merely because an older copy of this directive omits them.

### Ruling kinds

| kind | effect |
|---|---|
| `ENRICH` | Sets `fields` only. The bucket does not change. Use it for Claude analysis (`CLAUDE_*`, `ANALYSIS_*`, `PROPOSED_*`) and for Forge facts (`SALARY_*`, `FLEX`, `DEGREE_REQ`, `LIVENESS`, …). |
| `APPLY_NOW` with `value:"YES"` | Moves the row to READY_TO_PURSUE. |
| `DECLINE`, with `code` and `note` | Moves the row to DECLINED_BY_TIM, with `DECLINE_REASON_CODE`, `DECLINE_REASON_TEXT` and a `REOPEN_TRIGGER` (override it via `fields`). |
| `MANUAL_RESEARCH`, with `note` | Moves the row to MANUAL_RESEARCH. |
| `DUPLICATE`, with `dupOf:"<survivor PRIMARY_ID>"` | Moves the row to DUPLICATE. |
| `CLOSED_DEAD`, with `note` | Moves the row to CLOSED_DEAD. |
| `INVALID_DISCOVERY`, with `note` | Moves the row to INVALID_DISCOVERY. |
| `APPLIED`, with `eventDate` and `evidence` | Moves the row to APPLIED. |
| `REJECTED_BY_EMPLOYER`, with `eventDate` and `evidence` | Moves the row to REJECTED_BY_EMPLOYER. `evidence` is required. |
| `NOTE`, with `note` | Adds a TIM_NOTE. |
| `IDENTITY`, with `identity`, `evidence`, `evidenceUrl` (and `reconciled` when the row has POSSIBLE_MATCHES) | Corrects the row's identity. The bucket, disposition and Tim fields do not change. Details below. |

**`IDENTITY` in detail:**
- `identity` `{COMPANY?, TITLE?, REQ?, LOCATION?}` rewrites those fixed columns together, all or nothing. Each prior value is kept as `IDENTITY_PRIOR_<KEY>`, and placeholders (`UNKNOWN`, `NOT_STATED`, `-`, `Confidential` and similar) are refused.
- `evidence` (at least 20 characters, saying what the source shows) and `evidenceUrl` (the http(s) page it comes from) are required.
- A payload copy of COMPANY/TITLE/LOCATION/REQ that differs from the corrected column is removed and kept as `IDENTITY_PRIOR_PAYLOAD_<KEY>`.
- `POSSIBLE_MATCHES` is cleared only when `reconciled` names **every** listed row as `"DISTINCT: <evidence>"` or `"DUPLICATE_RESOLVED: <evidence>"`. `DUPLICATE_RESOLVED` is accepted only if that row is already DUPLICATE. The list and the verdicts are kept.
- The corrected identity goes through the intake duplicate matcher against every other live and archived row. An unreconciled match is refused as `HOLD` (`IDENTITY_COLLISION`).
- Provenance is recorded as `IDENTITY_SOURCE` and `IDENTITY_UPDATED_AT`.

`fields` may be added to any kind as `{KEY: value}`. `COMPANY`, `TITLE`, `LOCATION`, `REQ` and `POSSIBLE_MATCHES` are refused in `fields` for every kind: they change only through `IDENTITY`, so a payload copy can never contradict the row. Keys are upper-case. `STATE_SOURCE`, `STATE_UPDATED_AT`, `PRIMARY_ID`, `BUCKET` and `DISPOSITION` are writer-owned and are refused. Empty values are ignored, so nothing is deleted. If you change an intake key such as `SOURCE_URL`, the old value is kept as `INTAKE_SOURCE_URL`.

`actor` sets the `STATE_SOURCE=<ACTOR>:<requestId>` stamp. Use `FORGE`, `CLAUDE` or `GROK`. When `actor` is omitted, the stamp is `TIM_EXPLORER`.

### Guarantees the writer enforces, so you don't have to

- **Identity:** a ruling targets exactly one PRIMARY_ID. Anything else fails closed.
- **Intake:** dedupes by INTAKE_KEY, by employer-bound requisition, by canonical URL, and by employer+title+location. Ambiguity becomes a DISCOVERY_LEAD with POSSIBLE_MATCHES. Replays are no-ops.
- **upsert_application:** with exactly one identity match, it rules that row in place. With no match, it creates one row in APPLIED or REJECTED_BY_EMPLOYER. When the match is ambiguous it returns `mode=HOLD`, writes nothing, and lists the possible matches; resend with `TARGET_PRIMARY_ID`. Replays return `ALREADY_APPLIED`.
- **Protected states:** APPLIED and REJECTED_BY_EMPLOYER can't be declined, pursued, researched, duplicated or closed. APPLIED can't overwrite REJECTED_BY_EMPLOYER unless `force:true` is sent with new-application evidence.
- **Every write:** checks the master's modifiedTime before writing, recounts COUNTS from the row BUCKET values, rewrites END, reads the result back, and writes a receipt to `PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS`.

## What to stop doing

- Don't leave writer-ready changes only in prose MASTER_CHANGE_REQUEST files. Emit the JSON write body into the queue, or POST it, in the same run.
- Do not treat old `MASTER_CHANGE_REQUEST_*`, `EMAIL_UPSERT_REQUEST_*`, TASK_BOARD, FOREMAN_PROTOCOL or amendment files as current instructions. They are historical transport/audit artifacts; current authority is the canonical rules Doc, fixed master and live writer contract.
- Don't report a write as done until the response or RESULT file shows `ok:true`. Report HOLD and failed results as they are.

## Examples (placeholders only; do not apply as written)

```json
{"action":"ruling","ruling":{"primaryId":"V2I-AAAAAAAAAAAA","kind":"DUPLICATE","dupOf":"V2I-BBBBBBBBBBBB","actor":"FORGE","requestId":"MCR_EXAMPLE_E1","note":"same requisition as survivor"}}
```

```json
{"action":"upsert_application","event":{"COMPANY":"Example Corp","TITLE":"Director of Manufacturing","REQ_ID":"R12345","STATE":"REJECTED_BY_EMPLOYER","EVENT_DATE":"2026-10-01","EVIDENCE":"Gmail <message id> <sender domain> \"<subject>\" <timestamp>","actor":"FORGE","requestId":"EMAIL_UPSERT_EXAMPLE"}}
```

```json
{"action":"ruling","ruling":{"primaryId":"V2I-CCCCCCCCCCCC","kind":"ENRICH","actor":"CLAUDE","requestId":"FOREMAN-EXAMPLE","fields":{"CLAUDE_FIT":"HIGH","PROPOSED_BUCKET":"MANUAL_RESEARCH","ANALYSIS_NOTE":"worksite confirmed on first-party req"}}}
```
