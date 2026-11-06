# Discovery backlog review in Pipeline Explorer

The Waiting for intake view now uses the existing pipeline grid, configured columns and column widths. Candidate identities stay separate from canonical jobs. Unknown score, salary and FLEX values remain blank; detailed job workspace is omitted. Search and sorting cover all loaded candidate pages, with 100 rows per displayed page. Row clicks, checkboxes, keyboard Space/Enter, Shift ranges, select-page and clear-selection support manual batches. Selection survives pagination/search but resets when the source revision changes.

On phones use More → Discovery backlog. Mobile returns to the ordinary phone shell.

## Manual decisions

The user explicitly chooses Decline selected or Remove selected, reviews the confirmation, and submits at most 100 candidates. Remove is a recoverable discovery exclusion, never physical deletion. These controls do not invoke canonical ruling APIs or fabricate PRIMARY_IDs.

`/api/backlog-decisions` authenticates using the configured Writer key. It accepts immutable content-addressed requests into the existing Cloudflare KV binding. The existing coordination observer is responsible for fresh identity/protection checks and committed per-candidate receipts. The companion forge-coordination change must be merged and run before its fresh capability marker enables submission.

The UI persists the exact receipt ID before POST and verifies the local storage readback. An uncertain request is never automatically replayed. Check receipt performs a read only. QUEUED is not removal; candidates remain visible until a later independently verified backlog snapshot excludes them. HELD, STALE and ALREADY_ACCOUNTED outcomes are reported individually. Held/protected candidates cannot be force-removed through this path.

## Verification

- `npm test`
- `npm run check:cloudflare`
- `node tests/backlog-grid.browser.js` (uses synthetic 6,500 candidates, blocks external requests and production Writer traffic)

The browser regression exercises same columns, row/page/keyboard selection, search, view switching, normal mobile navigation and a 65-batch receipt history. It requires a working Chromium sandbox/environment. The local implementation executor cannot launch Chromium (`socket() Operation not permitted`). Independent isolated cloud-browser QA subsequently passed the 6,500-candidate flows, actual mobile entry, bounded 65-batch history, zero browser errors and zero writes. The browser regression uses intercepted public module factories and UI controls, not private application globals. The reproducible script remains a required browser gate in a compatible executor.

No merge, deployment, live job decision, canonical write or schedule change was performed by this implementation.
