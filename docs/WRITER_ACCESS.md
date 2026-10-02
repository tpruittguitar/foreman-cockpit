# WRITER ACCESS DIRECTIVE — 2026-10-02

STATUS=ACTIVE since 2026-10-02 02:20Z (writer version 4; queue trigger installed and verified) · OWNER=Tim Pruitt · APPLIES TO: Grok/Scout, ChatGPT/Forge, Claude/Foreman, any scheduled automation.

Tim's ruling, 2026-10-02: the shared writer credential may be used, stored and written wherever it helps automation. Any earlier text that forbids the passphrase in Drive or prompts is superseded for this credential.

Every canonical change to `V2_CURRENT_POPULATION_MASTER.txt` (Drive `19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`) goes through the Authorized State Writer. You have three equivalent ways to reach it. Use whichever your runtime supports, in this order of preference.

## 1. Drive queue (no HTTP, no key)

Save one file into **AI_Coordination/WRITER_QUEUE** (folder `1IVyEKPxqY_7uL9GG9RV9Gu9raEco0AZ7`; results land in `processed` `1kVgPtqqUtxoRyTC72Wb59kInHJMZGV0a` or `failed` `1hMcqUNYe5m6yjHmYkbdd9CcvqOwgEzZ1`). The file is a plain-text or Google Doc file whose content is one JSON write body (see "Write bodies" below). Use a descriptive name, such as `GROK07_2026-10-02_0600ET_intake.json`.

- A trigger applies the queue every 5 minutes. A GET with `action=process_queue` applies it immediately.
- A successful request moves to `WRITER_QUEUE/processed`. A failed one moves to `WRITER_QUEUE/failed`. Either way a `RESULT__<name>.json` file appears beside it with the writer's full response.
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

`?action=ping&key=<current-private-writer-credential>`, `?action=master&key=<current-private-writer-credential>` (full master text plus modifiedTime), `?action=rules&key=<current-private-writer-credential>`, `?action=runs&key=<current-private-writer-credential>`, `?action=receipts&key=<current-private-writer-credential>`, and `?action=automation&key=<current-private-writer-credential>` (queue status).

## Write bodies

| action | use | body |
|---|---|---|
| `intake` | Scout discoveries, creating new SCOUT_INTAKE / DISCOVERY_LEAD rows | `{"action":"intake","run":{"SCOUT_RUN_ID":"…","GROSS_FOUND":N},"records":[{COMPANY,TITLE,LOCATION,REQ_ID,SOURCE_URL,SOURCE_PROVIDER,DISCOVERY_SOURCE,DISCOVERED_AT_ET,IDENTITY_CONFIDENCE,INITIAL_UNKNOWN_FIELDS,…}]}`, per docs/SCOUT_INTAKE_CONTRACT.md |
| `ruling` | change one existing row by exact PRIMARY_ID | `{"action":"ruling","ruling":{"primaryId":"V2S-…","kind":"…","actor":"FORGE","requestId":"…","note":"…","fields":{…}}}` |
| `upsert_application` | email-confirmed application or rejection (Tim directive 2026-09-29) | `{"action":"upsert_application","event":{"COMPANY":"…","TITLE":"…","STATE":"APPLIED"\|"REJECTED_BY_EMPLOYER","EVENT_DATE":"YYYY-MM-DD","EVIDENCE":"Gmail <id> <sender> \"<subject>\"","REQ_ID":"…","LOCATION":"…","SOURCE_URL":"…","TARGET_PRIMARY_ID":"(optional)"}}` |
| `batch` | up to 25 of the above, applied in order | `{"action":"batch","requests":[…]}` |

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

`fields` may be added to any kind as `{KEY: value}`. Keys are upper-case. `STATE_SOURCE`, `STATE_UPDATED_AT`, `PRIMARY_ID`, `BUCKET` and `DISPOSITION` are writer-owned and are refused. Empty values are ignored, so nothing is deleted. If you change an intake key such as `SOURCE_URL`, the old value is kept as `INTAKE_SOURCE_URL`.

`actor` sets the `STATE_SOURCE=<ACTOR>:<requestId>` stamp. Use `FORGE`, `CLAUDE` or `GROK`. When `actor` is omitted, the stamp is `TIM_EXPLORER`.

### Guarantees the writer enforces, so you don't have to

- **Identity:** a ruling targets exactly one PRIMARY_ID. Anything else fails closed.
- **Intake:** dedupes by INTAKE_KEY, by employer-bound requisition, by canonical URL, and by employer+title+location. Ambiguity becomes a DISCOVERY_LEAD with POSSIBLE_MATCHES. Replays are no-ops.
- **upsert_application:** with exactly one identity match, it rules that row in place. With no match, it creates one row in APPLIED or REJECTED_BY_EMPLOYER. When the match is ambiguous it returns `mode=HOLD`, writes nothing, and lists the possible matches; resend with `TARGET_PRIMARY_ID`. Replays return `ALREADY_APPLIED`.
- **Protected states:** APPLIED and REJECTED_BY_EMPLOYER can't be declined, pursued, researched, duplicated or closed. APPLIED can't overwrite REJECTED_BY_EMPLOYER unless `force:true` is sent with new-application evidence.
- **Every write:** checks the master's modifiedTime before writing, recounts COUNTS from the row BUCKET values, rewrites END, reads the result back, and writes a receipt to `PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS`.

## What to stop doing

- Don't leave writer-ready changes only in prose MASTER_CHANGE_REQUEST files. Emit the JSON write body into the queue, or POST it, in the same run.
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
