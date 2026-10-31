# Writer reads and dashboard readiness

The browser previously fetched Apps Script directly, without a request deadline. A transient network/redirect failure produced an unhelpful `Failed to fetch`. Its structured-data fallback used the same browser transport. Successful structured loads were not saved to the canonical-view cache.

Separately, the operations view could render before canonical rows arrived and keep its initial Unknown counts after the header reported a connected master. Master loading did not notify this view, and the health refresh waited for a full master refresh before repainting. This was observed live on October 31: structured page/import requests and Writer reads returned HTTP 200, the header showed loaded roles, and the operations cards still showed Unknown.

The default Writer's reads now use authenticated `/api/writer-read`, with the existing key in a header. It pins the upstream destination, only allows known read actions, streams large responses without parsing, never publicly caches data, and retries transient reads once. Browser requests have a deadline. Write transport, idempotence and verification rules are unchanged. Custom Writer URLs retain their explicit destination.

Successful structured views are saved to the existing local view cache. Failed reads can show previously loaded counts as stale; stale data never authorizes writes. Canonical data arrival now repaints the dashboard immediately without waiting for health/receipt reads. Active interview form edits are preserved.

Regression checks cover late data arrival during a hung status read, editing preservation, mutation-action rejection, authentication/no-cache behavior and bounded transient retry. Network outages can still occur: the change makes reads recoverable and failures explicit rather than promising uninterrupted upstream service.
