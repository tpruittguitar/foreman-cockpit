# PR70 implementation baseline — October 9, 2026

Branch: codex/pr70-completion. Recovered checkpoint cfa2fd5; original main 19f0bb48032b4efa90fc8823d8c42e0324273218.

Production Explorer independently reports 19f0bb4. Writer ping/status independently report ccd26ae, deployed 2026-10-08T06:44:12Z. No authenticated deployment version, principal or scopes attestation is available. Nine current governing documents fetched through authenticated Writer document_text and saved outside checkout in /workspace/pr70-evidence. Canonical Rules STATUS=ACTIVE, version 4, structured FLEX +30/+20/-10/-30; owner already confirmed +30/+20. Current rules correct the sole master to 1My9QYVPBblw8c7vFMFxGOAqgTSuH9gS8. Older repository master pointers are stale. Preserve the frozen Doc prohibition.

Baseline: 35 test files, 214 reported tests, 17 failures plus queue-test syntax failure. Transaction crash tests already pass; retired Doc migration fixtures and missing helper counters require migration. Manual intake PRIMARY_ID linkage is a real implementation defect.

Release access: Git read verified. No clasp login file or configured outbound identity; Apps Script deployment BLOCKED_AUTHENTICATION. Netlify production read works; release credential scope not yet verified. Read-only Writer status/index captured. No real jobs used as test fixtures.

Implementation proceeds transaction/identity safety, shared scoring, durable operations/coverage, recovery and scheduler controls, state/view consistency, then GUI and integration. Recovery Relay excluded. Original map source is preserved; baseline screenshot available locally, original owner screenshot not independently recoverable. Actual desktop/portrait/landscape screenshots required before visual commit. Explicit GUI approval and release approval required by supplied execution order.

Rollback: keep production Explorer commit 19f0bb4 and existing Writer deployment unchanged until release; authenticated previous Writer version must be captured before deploying. Git merge is not deployment evidence. All real provider integration acceptance remains separately BLOCKED/NOT_TESTED until exercised.


Checkpoint verification, 2026-10-09: 283 automated tests pass, including 120 synthetic transactions with injected delivery failures and a supported HTTP adapter restart test retaining raw Gmail provenance and exact intended row hashes. Browser regression passes with local test-only endpoints; desktop, portrait and both landscape previews have zero page overflow and JavaScript errors. Desktop shows 19 rows; map geometry equals the recovered baseline. Original owner screenshot comparison and physical iOS safe areas are not certified.

| Workstream | Implemented checkpoint | Production acceptance / remaining limitation |
|---|---|---|
| WS1 | Shared V4 FLEX/scoring with authoritative +30/+20; policy controls staged on Scoring; source revision conflict guard | Not deployed; actual multi-agent consistency untested |
| WS2 | Durable precommit intent, independent verification, stable request IDs, mixed intake dispositions, retryable receipt delivery, durable completion obligations | Synthetic endurance passed; production restart acceptance not exercised |
| WS3 | Graphite surfaces, larger table/detail text, map geometry retained; actual preview captured | Visual files remain uncommitted pending mandatory GUI approval |
| WS4 | Portrait and both landscape browser checks; accessible scrolling and navigation | Physical iOS safe areas untested |
| WS5 | Durable email source/pages/body/card evidence model, reviewed counts, obligations, watermark protection, Catch Up REQUESTED/PENDING_MANUAL | No native Gmail scheduler adapter available; historical native coverage has not been imported |
| WS6 | ATS-neutral URL admission; original candidate payload retention; employer/requisition and evidence-backed alias guards | Synthetic collision cases pass; controlled production intake fixture not authorized |
| WS7 | Typed bounded read retries with jitter, operation/build/storage metadata, per-attempt chronology; uncertain writes reconcile original IDs | Google API outage/quota testing remains untested |
| WS8 | Acknowledgement retains unresolved health; historical acknowledgements reopen; verified recovery required; experimental recurrence; Operations recovery view | Native incidents lack integration acceptance; experimental thresholds need real observations |
| Schedules | Revision CAS, desired/native separation, DST previews, paused/freeze protections, staged proposals | UNSUPPORTED native control; no provider schedules changed |
| Workload | Comparable empirical p50/p95 and failure layers; pure admission governor; 48 isolated 5/10/20/30-record benchmarks; automatic mass refresh requires verified production capacity | Production profile unavailable: UNKNOWN and mass refresh blocked; no local timing promoted to production limits |
| Supported transport | Durable HTTP text/plain adapter; original Gmail evidence; COMPLETE receipt plus fresh exact intended-row hashes; reconcile restart without reposting | Local adapter test passes; actual ChatGPT/Gmail end-to-end path remains NOT_TESTED |

Release is blocked by mandatory GUI approval and missing Apps Script OAuth deployment login (~/.clasprc.json). 5150 is configured for Writer access and does not authenticate the Apps Script deployment API. Netlify and Apps Script must be released together after approval and authenticated rollback/version capture. Cross-AI Recovery Relay remains excluded. No current-master job population, protected application history or frozen Doc was altered in these tests. Current Drive improvement document remains the governing proposal; this file is implementation evidence, not a replacement proposal. Drive progress writeback is blocked by unavailable authenticated document-edit capabilities.
