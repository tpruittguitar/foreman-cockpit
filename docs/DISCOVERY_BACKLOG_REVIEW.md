# Discovery backlog review in Pipeline Explorer

The Waiting for intake view now uses the existing pipeline grid, configured columns and column widths. Candidate identities stay separate from canonical jobs. Unknown score, salary and FLEX values remain blank; detailed job workspace is omitted. Search and sorting cover all loaded candidate pages, with 100 rows per displayed page. Row clicks, checkboxes, keyboard Space/Enter, Shift ranges, select-page and clear-selection support manual batches. Selection survives pagination/search but resets when the source revision changes.

On phones use More → Discovery backlog. Mobile returns to the ordinary phone shell.

## Manual decisions

The user selects cards and chooses Decline selected or Delete from backlog, submitting at most 100 candidates without a second confirmation or fit review. Availability is checked automatically. Delete from backlog is a recoverable discovery-card dismissal, never physical deletion of canonical job records or evidence. These controls do not invoke canonical ruling APIs or fabricate PRIMARY_IDs.

`/api/backlog-decisions` authenticates using the configured Writer key. It accepts immutable content-addressed requests into the existing Cloudflare KV binding. The existing coordination observer applies the selected dismissal and publishes committed per-candidate receipts. Exact-card identity, canonical-record integrity, and active/uncertain Writer fences are retained; ordinary discovery holds do not trigger another fit review. The companion forge-coordination change must be merged and run before its fresh capability marker enables submission.

The UI persists the exact receipt ID before POST and verifies the local storage readback. An uncertain request is never automatically replayed. Check receipt performs a read only. QUEUED is not removal; candidates remain visible until a later independently verified backlog snapshot excludes them. HELD, STALE and ALREADY_ACCOUNTED outcomes are reported individually. Canonical-record links and active/uncertain Writer identities remain protected. Ordinary discovery holds and unresolved cards can be dismissed when their exact snapshot identity is unchanged.

## Verification

- `npm test`
- `npm run check:cloudflare`
- `node tests/backlog-grid.browser.js` (uses synthetic 6,500 candidates, blocks external requests and production Writer traffic)

The browser regression exercises same columns, row/page/keyboard selection, search, view switching, normal mobile navigation and a 65-batch receipt history. It requires a working Chromium sandbox/environment. The local implementation executor cannot launch Chromium (`socket() Operation not permitted`). Independent isolated cloud-browser QA subsequently passed the 6,500-candidate flows, actual mobile entry, bounded 65-batch history, zero browser errors and zero writes. The browser regression uses intercepted public module factories and UI controls, not private application globals. The reproducible script remains a required browser gate in a compatible executor.

No merge, deployment, live job decision, canonical write or schedule change was performed by this implementation.

## Submission failure fix (2026-11-07)

The first version accepted only LinkedIn and URL-hash keys. Published backlog rows also contain Indeed, unresolved-card, and namespaced canonical-reference keys, so selecting any of those rejected the entire batch before queueing. The UI then labeled all errors UNCERTAIN, including explicit pre-queue rejection. Both the endpoint and coordination observer now accept the published identity families. Canonical references receive individual technical holds rather than breaking an otherwise valid batch; accepting a key is not permission to change its canonical record. New requests bind scope DISCOVERY_CARD_DISMISSAL, allowing exact unresolved cards and ordinary discovery holds to be dismissed without another fit review. Active/uncertain Writer operations remain protected. Committed dismissal proof prevents later intake pickup. Old requests and receipt hashes retain their original semantics, and are never upgraded or replayed. The API waits for the companion observer's supported scope marker before accepting scoped requests.

The endpoint certifies NOT_ACCEPTED for one submission attempt only, binding a unique attempt ID plus the exact request/receipt identity and zero queue-write attempts. The browser never reuses a saved request or attempt ID. Only a matching first-attempt proof unlocks a fresh user submission; it does not establish historical request-wide nonacceptance. Network loss, malformed/mismatched responses, and any attempted KV write remain uncertain, with no automatic retry. The UI retains the original submission error and exposes request/receipt IDs for diagnostics. A missing receipt alone never clears a legacy uncertain request. Receipt checks remain read-only.

## Local worksheet entry point (2026-11-07)

The Jobs waiting-queue bar and mobile More menu include **Backlog worksheet**. Both open `backlog-worksheet.html`, a responsive launcher. On a desktop it offers an explicit new-tab link to the existing worksheet at `http://127.0.0.1:51415/`, labeled for TIMMAY. The service must already be running on that computer; the launcher does not start or probe it. On iPhone, Android and iPad desktop-mode Safari the loopback action is hidden and the page explains that secure mobile worksheet access has not been configured. It points to the existing **More → Discovery backlog** workflow as a separate alternative, without claiming the views are identical.

No tunnel, remote worksheet service, authentication, credential, network binding, firewall rule, decision submission or deployment is added. Follow-up mobile worksheet hosting would need its own reviewed, authenticated design and authorization. This entry-point change is a draft until reviewed and merged.

Checks: `npm test`, `npm run check:cloudflare`, and `node tests/backlog-worksheet.browser.js`. The browser regression uses intercepted synthetic data, tests the actual desktop and mobile entry points, repeated navigation, Close/Escape and Back/Forward, and forbids unsolicited loopback requests and writes. It supports `PIPELINE_BROWSER=webkit` where the WebKit runtime is installed; Chromium iPhone emulation alone is not actual Safari verification.
