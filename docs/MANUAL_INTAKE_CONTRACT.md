# Manual job intake

Tim may submit a public job URL in Pipeline Explorer → Manual Intake, with optional identity hints, notes and an already-applied claim. URL drafts are held in shared persistent storage until AI establishes company and title. This queue is a submission log, not an alternate job master. Only the fixed canonical master determines job state.

## Admission and processing

1. QUEUED: URL saved; optional hints are unverified user research leads.
2. RESEARCHING: one worker holds a 90-minute lease; source identity, requisition and evidence are researched using current ACTIVE canonical rules.
3. NEEDS_INFO / FAILED: keep the submission and specific missing information or error. Tim may add details and retry.
4. ADDED / EXISTING: finish only after the existing writer admits/deduplicates the role and a fresh master readback confirms the exact PRIMARY_ID and identity. Applied claims must already be preserved as APPLIED or REJECTED_BY_EMPLOYER.
5. The canonical row continues through normal Claude analysis and Forge verification. The intake table shows its current master stage separately from admission status.

Missing pay, degree/FLEX, scope, or exact requisition ID does not prevent a plausible identified role from entering SCOUT_INTAKE or DISCOVERY_LEAD. Never silently drop submissions. Exclusion needs the actual active canonical rule ID and evidence. Preserve existing protected states and application history. User notes are leads to verify, not verified facts.

Application dates are optional. For a new APPLIED ruling with no date known, override the writer's default using `ruling.fields.APP_DATE = "UNKNOWN (Tim self-report; date not supplied)"` in the same ruling; retain any existing known date. Never pretend submission time was application time.

## Shared API

`/api/manual-intake`, GET for `list` / `get`, POST JSON for mutations. Authenticate with the existing writer key in `x-writer-key` (body/query key supported for worker compatibility). Authentication is checked against the live writer. Browser storage contains no authoritative queue data.

- `submit`: url, optional company/title/location/reqId/notes, applicationStatus APPLIED/NOT_APPLIED/UNSURE, optional appliedDate YYYY-MM-DD. Canonicalized URL yields a stable MI-ID; tracking-only variations update the same record.
- `claim`: id, actor. Returns private lease token separately. Concurrent claims are refused.
- `progress`: id, token, status RESEARCHING/NEEDS_INFO/FAILED/EXCLUDED, phase/detail; optional research {company,title,location,reqId,identityVerified,sources:[{url,note}],facts}. EXCLUDED requires ruleId.
- `link`: id, token, primaryId, optional existing boolean/detail. Performs fresh canonical readback; cannot finish from a worker assertion alone.
- `retry`: id; explicitly requeues NEEDS_INFO/FAILED/EXCLUDED.
- `worker_ping`: actor/state/note. Actual worker check time is displayed in the app.

Per-record compare-and-swap protects concurrent updates. Counts are calculated from actual records. Stable URL IDs and writer INTAKE_KEY avoid duplicate admissions. Leases are never exposed through list/get. The existing Writer v9 remains the sole canonical write route, with its Drive queue failover. Netlify storage does not write the master.

No real master changes are made by regression tests. Local API tests cover concurrency, duplicate URLs, leases, application-date preservation, retry/history and verified linking; browser tests use a mock writer and queue.
