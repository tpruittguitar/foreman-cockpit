# Writer work across sources

Authorized by Tim on October 28, 2026: "can we also represent the witer work in the pipeline charts visually? add it to the GUI".

System > Dashboard now separates durable master work from file-queue traffic. The new panel reads `/api/writer-activity`, which aggregates the public canonical `forge-writer-state/PIPELINE_RECEIPT_INDEX.json` without a Writer credential, exposing only aggregate counts. It makes no Writer or master changes.

* Today uses the America/New_York calendar day. Tiles show insert operations, update operations, completed physical writes and distinct job IDs touched.
* The hourly chart covers the last 24 hours and counts a write only when all its observed receipt aliases are COMPLETE. Aliases share `w` (the Writer write ID) and count once. Repeated row-change items within a batch also count once; later updates to the same job are separate operations.
* The source chart shows recorded row changes by request-provenance family, including GitHub pay and automatic intake. Unknown/mixed provenance stays Other work. This does not infer transport for unknown IDs.
* Missing write IDs, missing row metadata and conflicting receipt states are explicit coverage gaps. Legacy migrated receipts are excluded from the timeline because their timestamp can be a migration time. The index is current receipt state, not an immutable event history.
* The existing section is renamed File-queue activity. Its queue log omits direct API work; the new receipt totals and queue totals must not be summed.
* Fetch/schema errors render unavailable or mark a previous snapshot as stale, never a fabricated zero. The read endpoint caches aggregates for at most one minute and never returns raw request IDs, row IDs, hashes or credentials.

The October 28 read-only audit reproduced three new inserts and 74 update operations across 21 writes that Eastern day; last 24 hours contained 23 writes, three inserts and 82 updates, including seven GitHub pay updates. Counts naturally change with activity/time. Low new intake also has a separate safety latch described in forge-coordination's coordinated-schedules document; this chart does not clear it.

Tests cover batch alias/item deduplication, new-vs-update counting, repeated updates, incomplete/conflicting/future/legacy receipts, Eastern midnight/DST, partial hourly windows, coverage failures, and the fixed-source read-only endpoint. Production uses the existing Cloudflare Pages Git integration; no Apps Script deployment is required.
