# Pipeline Explorer / Writer revision log

Tim's rule (2026-10-11): collect Explorer and Writer changes here and ship them together as batched releases. Newest batch first. Each entry names what changed, why, what did not change, and how it was verified.

## Batch 2026-10-25: job-list multi-select and one decision for the selection

Trigger: Tim 2026-10-25 19:27 ET: implement multi-select and group decision making on the job list. The Action Center redesign stays a mockup.

### Changed (`pipeline.html`, `pipeline-list-select.js`)

1. Ctrl or Cmd click toggles a row in the selection. Shift click selects the visible range from the anchor. Shift plus Ctrl adds that range. A plain click still opens the row and only moves the anchor.
2. There is no row checkbox. The NEW cell keeps the pin, new, and changed marks.
3. Selected rows get a `sel` mark. With a selection, one menu applies Decline, Applied, Request research, Pursue, Closed / dead, or Invalid to every selected row through the existing Writer batch. Applied is refused for a row already Rejected by employer. Decline, research, and invalid keep their previous allowed states. Pursue and Closed / dead are refused on Applied and Rejected by employer rows.

### Verified

`node --test tests/list-select.test.js` (5).

### Not changed

Needs you layout, the Action Center, scoring, and the Writer.


## Batch 2026-10-20-D: unsaved rulings resend themselves until the Writer saves them (REV-131)

Trigger: Tim 2026-10-20 23:10–23:16 ET: "how do I resubmit a declined role that failed to write? … shouldn't the system automatically resubmit until it saves to the master" / "agree".

### Found (FACT, Tim's laptop saved decisions vs the Writer, 23:12 ET)

- BLADE, Sr. Director of Operations, declined 22:50 ET; and DAVRON, Plant General Manager, declined 22:52 ET. Both showed `WRITE_FAILED` "Lock timeout" while the archive sweep and the row corrections held the Writer's lock. Neither was in the master.
- Applied Materials, Director of Quality – Photonics, declined 16:20 ET, sat in `SUBMITTING` for 7 h. The Writer had no record of the request (`request_result` found:false).
- The busy-retry tried 4 times over about 98 s and then stopped for good. Nothing ever resumed a "Saving" left behind by a closed page.
- All three were resent with their original requestIds at 23:12 ET and saved (writeIds W-20261021031245293, W-20261021031403124, W-20261021031523789).

### Changed (`pipeline.html`, `pipeline-act-now.js`)

1. **Ruling outbox.** Every Tim ruling the Writer did not confirm is resent with the **same requestId** until it saves:
   - Covered: busy / lock timeout, write fence, writes disabled (stale master), network, result unknown, and a `SUBMITTING` with no request in flight (page closed).
   - Before each resend it asks `request_result`. A write that already landed is marked saved and not sent again; a resend would be answered as a replay anyway.
   - Backoff runs 30 s → 1 → 2 → 5 → 10 min. It also runs when a live master loads, when the app returns to the foreground, and when the device comes online.
   - A real refusal stops it and shows "Decision not saved" with the Writer's reason.
2. **While the outbox is resending**, the decision counts as pending: the role stays out of the default views, and the card offers no second decision.
3. **The status line** keeps the Writer's own error and adds that it will be resent.

### Verified

`npm test` 619/619. `tests/act-now.browser.js` part 5:
- A Decline fenced twice is resent automatically and saved on the third post, all under one requestId.
- A stale "Saving" is checked and resent once.
- One that had landed is not posted again.
- No "not saved" chip appears while the outbox works.
- The outbox state never reaches the wire.

`master-load` and `needs-tim` still pass.

## Batch 2026-10-20-C: Act now + the decision rule + held emails in Needs you (REV-124, Simplify plan PR 1)

Trigger: the Pipeline Explorer simplify plan (PR 1) with Tim's 19:39–19:43 ET rulings. If Tim clicks Applied, it is true. A decided role leaves every default view and can't be decided twice. The saved state comes from the request's own status. A retry reuses the requestId. A held email shows in Needs you with one-tap Same role / Different role.

### Changed

1. `pipeline-act-now.js` (new, pure plus html): the Act now list and the decision rule.
   - **List:** up to 10 roles that are scored, Director-level and up, in the US, not Memphis, and not decided. Shield AI is pinned first, then score, then newest. An estimated salary counts as pay and is labelled "est.".
   - **Cards:** Open posting, Applied, Decline (pay / location / level / fit / other), Later (3 days, on this device). All controls are ≥ 44 px and styled only with v1.5 tokens.
   - **Decided roles** leave at once while the write is pending. They come back only with "Decision not saved · tap to retry", which resends the same request, or with "Changed since your decision", which shows old → new for title, location, remote/onsite, pay, a 10+ point score move, a repost or reopen, a recruiter contact, or application status.
   - A card whose decision didn't save offers only the retry, so a second decision can't be made from it.
2. `pipeline.html`
   - **New view `view-act-now`:** the app opens on it, and an explicit link or `?open=jobs` still opens the job table. The Pipeline nav and section tabs now start with "Act now". The cockpit table layout and the table look are unchanged.
   - **Shared `postRuling_`:** used by the drawer and Act now. Device-only fields (`decisionSnap`, status) stay off the wire.
   - **`passes()`:** hides a role with Tim's ruling from every view except Decided / My rulings / Applied / Declined / Terminal / Interviews / Pinned, and except during search.
   - **New preset "Decided".**
   - **Drawer:** a second deciding ruling shows "Already decided: <decision>, <date>" with a **Change decision** button.
   - **Decision snapshots:** every Tim ruling stores the decision-time values that later changes are measured against.
3. `pipeline-needs-tim.js`: held emails from the Writer's `GET held_emails` become Needs you items with **Same role** (one button per candidate) and **Different role**, which call `resolve_held_email`.
4. `pipeline-navigation.js`: the Pipeline group routes to Act now, with an "Act now" tab first.
5. **Tests:**
   - `tests/act-now.test.js` (6).
   - `tests/act-now.browser.js`: cold load at 390×844, 402×874 and 1440×900; Shield AI first; Memphis excluded; Applied leaves the list and stays out after a reload and in the table; Decided finds it; a refused Decline comes back with the retry and the retry reuses the requestId; a held email resolves with one tap.
   - The table-focused browser tests open with `?open=jobs`.
   - `scoring-20261014.test.js` now matches the shared poster.

### Not changed

Scoring math, the job table, columns, the drawer layout, and the Writer (REV-122 holds the Writer half and needs the Writer deploy).
## Batch 2026-10-20-B: Tim's Applied stands; email confirms the same row; held emails get Same / Different (REV-122)

Trigger: Tim 2026-10-20 19:39–19:43 ET: "If I click applied then it's true... Some roles don't get a replied notification." Email evidence found later should upgrade the same row and never create a second decision. A held email must show in Needs Tim with a one-tap "Same role / Different role".

### Changed (Writer, `apps-script/Code.gs`)

1. **APPLIED ruling:** writes `APP_CONFIRMATION`. It is `TIM_RULING` for Tim's own ruling, which already needs no email and records "Tim direct statement…". It is `EMAIL` when the ruling came from an email upsert.
2. **Later email on a Tim-ruled row:** an APPLIED email that matches a row Tim already marked Applied upgrades that same row: `APP_CONFIRMATION=EMAIL`, `APP_EMAIL_EVIDENCE`, `APP_EMAIL_DATE`, tag `APPLIED_EMAIL_CONFIRMED_<date>`. Tim's `APP_STATUS_EVIDENCE` and `APP_DATE` stay as they are. Rows from before this change count as Tim-ruled when they carry the `TIM_APPLIED_` tag or the "Tim direct statement" evidence.
3. **Near-match hold:** an APPLIED email that matches no row exactly, from an employer where Tim has a role marked Applied with no email yet, is held (`NEAR_TIM_RULED`). It no longer creates a second row.
4. **Held-email store `PIPELINE_HELD_EMAILS.json`:** every upsert HOLD (near match, ambiguous identity, archived match) is recorded once per email upsert key, from both the single and the batch path.
   - `GET held_emails` lists the open holds.
   - `POST resolve_held_email {holdId, choice: SAME|DIFFERENT, primaryId}` replays the held email once. SAME targets the chosen row; on an archived row it restores first, and a second tap attaches the email. DIFFERENT creates the email's own row. Then it closes the hold. Replays answer `ALREADY_RESOLVED`.
   - Not allowed inside a batch.
5. **Tests:** `tests/held-emails.test.js` (6), plus the governed write-action list. Full `npm test` passes 612/612.

### Not changed

Exact-match email updates, email replay (`ALREADY_APPLIED`), the rejected-row regression guard, and the Explorer. The Needs Tim card and the Act Now Applied button ship in the next PR. Needs a Writer deploy.

## Batch 2026-10-20-A: terminal rows keep moving to the archive (REV-117)

Trigger: Tim 2026-10-20 18:26 ET: "Dead and closed and no longer available can be a separate file right? ... the system needs to verify against it in several scenarios."

### Found (FACT, live Writer reads 2026-10-20 ~18:35 ET)

- `V2_TERMINAL_ARCHIVE.txt` has been live since the Oct 5 cutover (`MIG-20261005020622`, `CUTOVER_COMPLETE`) and holds 522 rows. Intake and upsert dedupe already check it, rulings on archived rows fail closed, and `restore_archived` exists.
- Nothing moved rows into it after the cutover. The master went from 306 rows / 668 KB to **1,923 rows / 4.7 MB**, and a master GET took 4.6 s.
- 343 terminal rows (716 KB) sit in the master: 194 REJECTED_BY_EMPLOYER, 91 DECLINED_BY_TIM, 30 DUPLICATE, 26 CLOSED_DEAD and 2 INVALID_DISCOVERY. INVALID_DISCOVERY is not an archive bucket and stays put.

### Changed

1. `apps-script/Code.gs`: new write action `archive_sweep`.
   - It covers rows in a terminal bucket (`ARCHIVE_BUCKETS`) whose `STATE_UPDATED_AT` is older than `minAgeDays` (default 7, floor 3) and whose PRIMARY_ID is unique. At most 150 rows per execution.
   - `op=plan` is read-only.
   - `op=apply` first appends the rows to the archive, with their companion narrative merged back so archived rows stay self-contained, and reads the archive back. Only then does it make one master write, which goes through the normal durable-intent and independent-verification path. Section headings that lost rows show their new count, and COUNTS/END are recomputed.
   - A row is never missing from both files. If the master save fails, the row reads as live, and the next sweep removes it without appending a second copy.
   - `archive_sweep` is not allowed inside a batch.
2. `apps-script/WriterTransactions.gs`: a write intent may remove rows only when the request is `archive_sweep` and names those rows (`ARCHIVE_MOVE` items). Every other removal still throws `TRANSACTION_DELETE_FORBIDDEN`.
3. `parseArchive_` in both the Writer and `pipeline-loader.js`: a `RESTORED|pid|inv|` marker now hides only the archive lines written before it, so a restored row that closes again is visible again after the next sweep. A key archived twice keeps its newest line.
4. Tests: `tests/archive-sweep.test.js` (6) and the governed write-action list in `tests/automation.test.js`.

### Not changed

Which buckets are archived, dedupe, the fail-closed rulings on archived rows, `restore_archived`, and the app's archive loading. No row moves until Tim (or Claude, with Tim's go) runs `op=apply` after this Writer build is deployed.

### Verified

`node --test tests/archive-sweep.test.js tests/automation.test.js` pass. Full `npm test`: 606 tests, 606 pass.

## Batch 2026-10-19-F — structured runtime read path stops exceeding the Cloudflare CPU limit (REV-075)

Trigger: Tim's 2026-10-19 21:10 ET screenshot — CRITICAL `FETCH FAILED · NO DATA`, "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON", first failure 21:07 ET, no cached copy.

### Root cause (FACT, reproduced)

- 28 of 32 live `GET /api/structured/jobs?limit=250` reads at 21:20 ET returned HTTP 503, Cloudflare HTML page "Worker exceeded resource limits". The Explorer called `r.json()` on that HTML page.
- Every structured request (health, counts, each of the 8 pages, the import) read `snapshot/current` from KV and `JSON.parse`d the whole snapshot. The 21:07 ET import stored 1,872 jobs. Bench with the same handler and 1,872 realistic rows (9.2 MB): 15 ms median / 21 ms p90 CPU per page read, above the 10 ms Workers Free limit (INFERENCE: this account is on the free CPU limit; the 503 title is Cloudflare's CPU-limit page).
- Not caused by the Track M UI merges; the Writer, master and Apps Script were unaffected. `?src=writer` loaded LIVE at 21:15 ET.

### Changed

1. `functions/api/structured/[[path]].js`: snapshot stored as `snapshot/v2/head` (meta, counts, total) plus 250-job shards under a generation key; head written last, previous generation's shards deleted, v1 `snapshot/current` retired. Health and counts read only the head. An aligned page read returns the stored shard text with no parse (bench: 3.5 ms median / 4.8 ms p90). Unaligned windows parse only the shards they touch. `/jobs/<id>` scans shard text and parses one shard. `/jobs` with no snapshot answers 409 `STRUCTURED_SNAPSHOT_NOT_LOADED` (the Explorer already imports once on that error) instead of parsing the live master for every page.
2. `pipeline.html`: `fetchJsonRetry_` reads text, names the real failure ("HTTP 503 · Worker exceeded resource limits"), retries 5xx/non-JSON twice (0.6 s, 1.5 s). If the stored copy still cannot be read and the Writer is configured, the Explorer reads the canonical master from the Writer (the `?src=writer` path) instead of stopping on FETCH FAILED. `?noFallback=1` disables the fallback for diagnosis. The Writer branch of `load()` is now `loadWriter_()`, unchanged in content.
3. `tests/structured-shards.test.js`: store, 8-page read equals the full set, unaligned and two-shard windows equal a plain slice, job lookup, 404, counts, generation replacement deletes old shards, legacy blob retired, 409 when empty.

### Not changed

Writer / Apps Script, canonical master, receipts, scoring, Track M UI, KV binding, the job record shape returned to clients.

### Verification

`npm test`: 592 pass, 0 fail. `npm run check:cloudflare` passes. Live check after deploy: see REV-075 in forge-coordination `control/CHANGE_REGISTER.txt`.

### Residual risk

The import (`/admin/import-from-writer`) still parses the Writer master JSON and serializes 1,872 jobs in one invocation; it can itself exceed the CPU limit as the population grows. It is called after loads and writes; a failure there leaves the previous snapshot in place and the Explorer falls back to the Writer. Rollback to the previous build makes the old code find no v1 blob, so it imports a fresh one rather than serving stale data.

## Batch 2026-10-17-E — receipt index to GitHub (REV-010, cutover pending)

Trigger: Tim approved moving the receipt index to GitHub on 2026-10-17; he created the public `forge-writer-state` repo after merging PR #117. The Drive index had previously been saved empty, blocking Writer writes until recovery.

### Changed

1. `ReceiptIndexStore.gs` adds fresh raw Contents API reads (including files above 1 MB), exact UTF-8 Git blob SHA calculation, conditional PUTs and validation. HTTP 409/422 is `REVISION_CONFLICT`; failures neither retry a write nor fall back to Drive. A checkpoint cannot erase existing request IDs. The durable-intent-before-master order is unchanged.
2. Older COMPLETE entries lose only bulky row `items`; the newest 100 retain details. Every request identity, state, timestamp, write ID, snapshot hash and correction remains, as do pending transactions and their evidence. This preserves replay protection after receipt-log rotation.
3. `migrate_receipt_index` defaults to dry run. Actual cutover requires a readable maintenance freeze, Writer lock, zero pending transactions, matching fresh Drive hash and expected GitHub file SHA. It re-reads Drive, seeds GitHub, verifies the exact result, then switches the Script Property. Deployment by itself keeps Drive active. HTTP Drive recovery is disabled once GitHub is active. `receipt_index` reports source, location and GitHub blob SHA.
4. The dedicated Script Property `GITHUB_WRITER_STATE_TOKEN` needs Contents read/write on `forge-writer-state`. The runbook documents deployment, guarded cutover, readback, unfreeze and failure recovery. No token or deployment credential is committed.

### Review seed (separate state repo)

`forge-writer-state` commit `1518b90` preserves the complete 4,243,526-byte Drive snapshot (updated 2026-10-18 02:57:50 UTC; 5,232 requests, zero pending). Commit `92f5069` compacts it to 943,131 bytes with the same identities and states. This is an inactive review seed: actual cutover must use a new locked Drive read.

### Verification and deployment

`npm test`: 479 pass, 0 fail, including 13 backend/transaction/migration tests. All `.gs` files pass `node --check`; `git diff --check` passes. A real GitHub raw API read of the original 4.24 MB seed returned all 5,232 requests, and its computed blob SHA exactly matched GitHub metadata.

Tim merges; Tim or Claude deploys and sets the dedicated token before following `docs/RECEIPT_INDEX_GITHUB_CUTOVER.md`. Production has not been frozen or switched during implementation. Master, queue and receipt-log storage remain on Drive. Control/ENTRY still name the live Drive index and must be updated only after verified cutover.

## Batch 2026-10-17-D — FLEX refresh waits for Writer verification before recounting

Trigger: Claude's 2026-10-17 23:00 ET handoff reports a false no-progress stop with 54 outstanding rows while Writer verification was still pending; the rows finished minutes later.

### Changed

1. `pipeline.html`: after each pass, poll a fresh `writer_status` every five seconds until `unverified.count` is explicitly zero, then read the canonical master and evaluate remaining work. Missing, invalid, failed or frozen status pauses the refresh. Pending verification has a five-minute wait limit; Stop also ends the wait. Neither timeout nor cancellation submits another batch or claims completion.
2. Subsequent passes use the plan from that fresh master read, so older page state cannot trigger a false no-progress stop. The three-pass limit and genuine no-progress stop remain in place.
3. `tests/flex-refresh-verification.test.js` executes the actual Explorer orchestration with controlled Writer responses, delayed verification and time. Covers the wait/read order, stale page state, real no-progress, timeout, invalid/unavailable/frozen status, network failure and Stop.

### Scope and verification

Explorer only; no Writer deployment or production data change. `npm test`: 466 pass, 0 fail. Inline JavaScript passes `node --check`; `git diff --check` passes. The separate receipt-index migration (REV-010) remains blocked: authenticated GitHub lookup of `tpruittguitar/forge-writer-state` returned 404 at handoff continuation.

## Batch 2026-10-17-C — FLEX refresh runs in batches of 25

Trigger: Tim, 2026-10-17 22:18 ET ("why are the batch sizes just one each?"), approved 22:23 ET ("approve batch fix").

### Changed
1. `pipeline.html` `refreshAdmission_`: with no measured capacity profile (the normal case; nothing ever supplies one) the refresh used one row per batch, so each row cost a full master read/write plus a separate verification run. It now uses `PipelineDerivedRefresh.CHUNK` (25) rows per batch. Evidence: the Writer applies an all-ruling batch in one master commit (max 50), and the 2026-10-12 bulk re-score ran 241 rows in batches of 50, every batch SUCCESS. Each batch is still receipt-verified, followed by a fresh master read, with the no-progress stop.
2. `pipeline.html`: the pass check and the stopped/paused report count remaining rows from the master view the verifying load returned (`viewPlan_`). A concurrent background load could leave `S.rows` on an older read, which is why the stopped report said 67 while the status line said 57.
3. `tests/flex-safe-drain-ui.test.js` updated.

### Verification
`npm test`: 460 pass, 0 fail. Inline scripts pass `node --check`. `tests/derived-refresh.browser.js` times out in this sandbox both before and after the change (pre-existing, environment).

## Batch 2026-10-17-B — restore the empty receipt index from its own version history

Trigger: `PIPELINE_RECEIPT_INDEX.json` was saved as 0 bytes at 2026-10-16 01:02:44Z; every Writer write has failed closed since (`receipt index unreadable`). The Drive web UI greys out Download on every old version, and the connector cannot fetch revisions.

### Changed
1. `apps-script/RecoveryTools.gs` (new): `restoreReceiptIndex_` lists the index's Drive revisions with the script's own token, takes the newest earlier version that parses as a valid index (or a named `revisionId`), writes a backup copy `PIPELINE_RECEIPT_INDEX_RESTORE_SOURCE_<time>.json` beside it, writes the live index, reads it back and compares. It refuses when the live index already parses. `dryRun=1` reports without writing. Logs a `RECEIPT_INDEX_RESTORED` event.
2. `apps-script/Code.gs`: GET action `restore_receipt_index` (key-protected).
3. `tests/recovery-tools.test.js`: index validation and version ordering.

### Not changed
Master, queue, receipts and every write path.

### Verification
`npm test`: 459 pass, 0 fail.

## Batch 2026-10-17-A — policy lives on GitHub (Stage 3 cutover)

Trigger: Tim, 2026-10-17 18:11 ET: "Move it all over to GitHub. Add and correct the code and lists. And update the app and ai coordination accordingly."

### Changed

1. **Policy source default is GitHub** (`apps-script/Code.gs`, `policyConfig_`). With no Script Property the Writer now reads and saves canonical Rules (`rules/TIM_PIPELINE_RULES_CANONICAL.txt`, including Never-Consider, FLEX and the Target Companies registry) and the scoring model (`scoring/PIPELINE_SCORING_MODEL.json`) in `tpruittguitar/forge-policy`. `POLICY_SOURCE=DRIVE` is the rollback to the superseded Drive Doc and file. Saves still need `GITHUB_POLICY_TOKEN`; reads without it use raw.githubusercontent.com (public repo).
2. **Automation alignment accepts the GitHub Rules identity** (`pipeline-alignment.js`, `apps-script/PipelineAlignment.gs`, byte-identical). Preflight compared the Rules id with the Drive Doc ID only, so a GitHub read would have reported PAUSED_CONFLICT. It now accepts the Drive ID or `tpruittguitar/forge-policy/rules/TIM_PIPELINE_RULES_CANONICAL.txt`. The native prompt text is unchanged, so enrolled prompts do not drift.
3. **Target Companies screen names where the list is stored** (`pipeline-target-companies.js`): "Stored in canonical Rules on GitHub (…)" or "on Drive (superseded source)".
4. **Tests**: `tests/policy-source-github.test.js` (GitHub default; Drive rollback), `tests/alignment.test.js` (GitHub Rules identity passes, any other identity conflicts), `tests/helpers/writer-world.js` (synthetic world pins `POLICY_SOURCE=DRIVE` because it models policy in a Drive Doc).

### Data moved (forge-policy, not this repo)

- forge-policy `fa98995`: rules, scoring model and Writer access directive copied from Drive (MANIFEST.txt has Drive IDs and sha256).
- forge-policy `35ffebb`: Target Companies adds AEVEX (P1) and Path Robotics (P1); 42 → 44 companies.

### Not changed

- Master, WRITER_QUEUE, freeze, receipt index and every other Writer data file stay on Drive (Stage 4 is a separate plan).
- Scoring logic, FLEX logic, Never-Consider logic, intake, state rules.

### Verification

- `npm test`: 457 pass, 0 fail.
- The Writer's Never-Consider parser on the GitHub rules file: status ACTIVE, 4 rules, 4 active (same as the Drive export). The Explorer's Target Companies parser: 44 companies, save round-trip unchanged.

### Deploy

- Explorer: Cloudflare Pages deploys from `main`.
- Writer: `apps-script/deploy.sh` (clasp login as Tim). Until the Writer is redeployed, setting Script Property `POLICY_SOURCE=GITHUB` on the live Writer (v62+) gives the same policy source; item 2 needs the redeploy.

## Batch 2026-10-15-C — scoring page says the model is shared

Trigger: Grok's Pipeline Explorer proposal v1.4 read the scoring page as "local to this browser" and built "100% = 70 local + 30 shared FLEX" on it. Tim, 2026-10-15 03:35 ET: "yes correct it".

### Changed

1. **Scoring page copy** (`pipeline.html`). Heading "Scoring model · derived viewer assessment" and the text "ranks the current rows on this browser" were written before PRs #113/#114. Since then every Update button publishes a numbered revision of the shared model. Heading is now "Scoring model · shared by every viewer and agent"; the text says each Update publishes a revision, every viewer and agent scores from it, and edits apply only on Update.
2. **Weights total is visibly honest** (`pipeline.html`). The FLEX weight input moves into the FLEX card, which left seven visible fields summing to 70 under "Total weight: 100 / 100". A read-only "flex (set in FLEX card)" row now stays in the weights grid and mirrors the FLEX value, so the visible rows add to the total. Weights heading reads "shared · total must equal 100 (FLEX included)".
3. **Fit & Score heading** "derived viewer model" → "shared scoring model".
4. **Settings shell** (`pipeline-navigation.js`). Chip "PRESENTATION ONLY" → "SHORTCUTS"; the Live scoring card says weight, salary, geo and FLEX updates publish revisions of the shared model.

### Not changed

- No scoring logic, published model, Writer code, rules or master rows. Copy and one read-only display row only.

### Verification

- `npm test`: 455 pass, 0 fail (452 + 3 in `tests/scoring-scope-copy.test.js`).
- Rendered locally in Chromium with a stubbed Writer: heading, FLEX mirror row (30), total 100, chip SHORTCUTS; no page errors.

## Batch 2026-10-15-B — Applied jobs show their evidence; Trane posting title

Trigger: Tim, 2026-10-15 03:15 ET ("the system should have already checked my email to settle those two"). Futura and Trane already carried APP_DATE and APP_STATUS_EVIDENCE (Gmail message IDs) in the master; the stale copy and the decision panel kept that out of view, so Tim declined two jobs he had applied to.

### Changed
1. `pipeline.html`: the decision panel shows "You applied <date>" with the evidence text whenever a row is APPLIED/REJECTED_BY_EMPLOYER or carries APP_DATE/APP_STATUS_EVIDENCE.
2. `pipeline.html`: saving DECLINE, CLOSED_DEAD, INVALID_DISCOVERY, DUPLICATE, MANUAL_RESEARCH or pursue on an APPLIED or REJECTED_BY_EMPLOYER row stops before the Writer with that evidence (the Writer refuses these anyway as protected states).
3. `pipeline.html`: a recorded `POSTING_TITLE` is shown in place of the canonical TITLE (display only; writes use PRIMARY_ID).

### Data action
Trane V2I-644955A351E3 (Tim approved 03:16 ET): ENRICH `POSTING_TITLE=VP, Enterprise Quality` with its source. The Writer refuses IDENTITY corrections on APPLIED rows; relaxing that guard was declined, so the canonical TITLE column still reads "Global Enterprise Quality Leader".

### Verification
`npm test` 452 pass. Master readback shows POSTING_TITLE on the Trane row; stored copy rebuilt (1,628 rows).

## Batch 2026-10-15-A — Decisions land and show as confirmed

Trigger: Tim, 2026-10-15 02:50 ET ("too many decisions are not getting recorded... master not confirming and write failed").

### Findings (22 decisions on Tim's device)
- The default view reads a stored copy of the master (Cloudflare KV). It was rebuilt only by the manual "seed structured runtime" button and was last built 2026-10-11 00:57 UTC: 749 rows against 1,623 in the Writer master. Readback compared decisions against that stale copy.
- 14 decisions had landed in the Writer master. The readback rule also failed them on side details: it required a decline reason code on CLOSED_DEAD (the Writer stores that code only for declines), compared notes byte-for-byte though the Writer flattens line breaks, '; ' and ' | ', and failed a state change when another lane later rewrote TIM_NOTE.
- 6 never landed: 5 Writer lock timeouts (the Writer waits 30 s for its script lock, which AI lanes hold) and 1 status-display exception after the drawer closed.
- Reynolds: Tim declined it on 2026-10-11 and set it to MANUAL_RESEARCH from the Explorer on 2026-10-13 (receipt PX-20261013165501-53D18C, probably another device); this device still held the older decline. Futura (APPLIED by Tim 2026-10-11, declined 2026-10-15) and Trane (declined 2026-10-11, APPLIED in the master with no Explorer receipt) sit in APPLIED, a protected state the Writer will not decline.

### Changed
1. `pipeline.html`: `gsPostRetryBusy_` retries ruling and bulk writes refused for a lock timeout (8/15/30/45 s); the Writer refuses before touching the master, so a retry cannot double-apply.
2. `pipeline.html`: the default view rebuilds its stored copy from the Writer in the background (at most once a minute) and before every post-write readback (`reloadAfterWrite_`).
3. `pipeline-trust.js`: a decision is confirmed by its state (plus reason code for declines); notes compare after the Writer's own cleaning; only a NOTE ruling is judged by note text.
4. Status messages no longer throw when the drawer has closed.

### Data actions (Tim's own recorded decisions)
Stored copy rebuilt from the Writer master (1,623 rows). Each failed decision was checked against the receipts for a later Tim decision before resubmitting. Resubmitted: QinetiQ decline, GKN Aerospace applied, Branch Technology closed, Goodwin decline. Reynolds was resubmitted in error before that check and restored to MANUAL_RESEARCH with `undo_ruling`; the device's stale entry is marked SUPERSEDED. Result: 18 of 22 decisions confirmed; Futura, Trane (APPLIED conflicts) and Siemens (already CLOSED_DEAD) await Tim.

### Verification
`npm test` 450 pass. New rule run against Tim's 22 decisions and the fresh copy: 14 confirmed; the rest are the items above.

## Batch 2026-10-14-D — Job selection lag after batch C

Trigger: Tim, 2026-10-14 22:12 ET ("a lot of lag now when i select a different job").

### Cause
Batch C made the default view load the canonical rules. `scoringCfg_()` parses the full rules text (FLEX policy and Target Companies) and `scoreFor_` rebuilt the config and its fingerprint on every call, which is every row and score column on every render. Measured on production: 32.4 s per job click.

### Changed
`pipeline.html`: the config and fingerprint are built once and reused until the scoring model object, the rules text or the published revision changes, or any code path resets the score cache.

### Verification
`npm test` 448 pass (new regression check). Preview with live data: 0.6–0.8 s per job click (3 clicks), down from 32.4 s.

## Batch 2026-10-14-C — Default view loads the published scoring model and canonical rules

Trigger: publishing revision 21 on 2026-10-14 21:35 ET. On the default data source (structured runtime) the Scoring screen showed "No published model yet" while the Writer held revision 20.

### Cause
`load()` returns early into `loadStructuredRuntime_` for the default source, and the published-model and canonical-rules reads lived only on the Writer path. On the default view every device scored with its own local draft or the code defaults, published changes never reached it, and FLEX policy and Target Companies were absent from scoring.

### Changed
`pipeline.html`: new `loadScoringGovernance_()` reads the published scoring model and the canonical rules, re-renders when they arrive, and runs on both data sources. The Writer path calls it in place of its inline reads.

### Not changed
Writer, master, scoring math, local-draft precedence (a device with an unpublished local draft keeps it until Load published or Publish).

### Also in this batch (Tim, 2026-10-14 21:52–21:56 ET)
- **FLEX modifiers reverting:** a modifier outside -100..100 (Tim entered HIGH_FLEX 200) was silently replaced with the code default on read. Both parsers (`pipeline-rules.js`, `pipeline-policy.js` + byte-identical `PipelinePolicy.gs`) now clamp to ±100, and the FLEX panel refuses an out-of-range value with a plain message. Readback now checks every policy key against what was entered.
- **One Update button per scoring section:** "Update weights & salary", "Update geo scores", "Update FLEX weight", "Update FLEX policy". Each saves to the shared Writer model (or canonical rules), reads it back, compares it to what was entered, and shows a stepped progress bar ending green "Updated and confirmed · revision N · time" or red "Not updated · reason". The device-only save buttons are gone; map edits still persist on the device until Update (settings-stick rule, 2026-10-12). A revision conflict retries once against the live revision.
- **Model tester:** "Test on one job…" opens a popup: pick a job, move every weight, the salary floor/target/ceiling and geo power, and see the job's rating, band, component table and rank among open roles change live against the published model. "Save as ruling model & update list" publishes through the same update path and re-ranks the list.

### Verification
`npm test` 446 pass (new regression checks). Inline scripts parse. Revision 21 (weights 40/30/15/10/culture 5, version 2026-10-14.1) was published through the Writer path and read back from the Writer.

## Batch 2026-10-14-B — Scoring model 2026-10-14.1 and Open roles default view

Trigger: Tim, 2026-10-14 20:13–20:49 ET. FPC of Brighton held the top score for days despite weight changes; Tim asked for the suggested scoring changes as the new default, Applied/closed jobs hidden by default, and the Target Companies list fed into the culture score.

Diagnosis: scores were recalculating. FPC led on every input (stored fit 92, comp 97 from a midpoint built on an estimated low end under a "up to $350k" ceiling, HIGH_FLEX, title 90), so no reweighting could move it. FPC is APPLIED.

### Changed
1. `pipeline-scoring.js` (and byte-identical `apps-script/PipelineScoring.gs`): model version `2026-10-14.1`; default weights experience 40, flex 30, comp 15, geo 10, culture 5, title/ats/ownership 0.
2. Compensation: two-segment line, 0 at floor, 50 at target, 100 at ceiling. The salary target setting was previously ignored.
3. Culture: explicit `CULTURE_SCORE` first; otherwise the Target Companies tier from the canonical rules (P1 100, P2 90, P3 75, WATCH 60; unlisted or PAUSED 40; hidden-client recruiter rows UNKNOWN). The viewer (`scoringCfg_`) and the Writer (`readFlexPolicy_`, `deriveWriterScores_`) both read the list with `PipelineScoring.targetCompaniesFromRules`. The list is stripped from the published model.
4. `pipeline.html`: new `OPEN` preset "Open roles" (nonterminal, not APPLIED) is the default; a saved "All live" view moves to it once (`px.openDefaultV1`). "All live", "Applied" and the terminal history views are unchanged.
5. Target Companies policy line and screen tip now say priority also sets the culture score.
6. `SCORING_MODEL.md`: weights, fit anchors for `SCOPE_FIT_RAW`, culture rule, comp curve, ceiling-only salary rule.

### Not changed
Master rows, FLEX policy, gates, Writer intake rules. FPC's stored fit and salary evidence are unchanged (separate correction).

### Verification
`npm test` 442 pass (new `tests/scoring-20261014.test.js`; two tests updated for the new defaults). Inline scripts parse. Branch code run against the live 578 open roles: spread ±11.2 → ±11.7, top 76; 74 open roles match a target company.

### Limits
The Writer's Apps Script copy needs a Writer deploy before Writer-stamped `OVERALL_RATING` values use the new curve and culture rule; the Explorer calculates live and does not depend on it. Removing title weight lets Manager-level titles rank beside Director/VP titles when the other inputs match.

## Batch 2026-10-14-A — AI usage panel shows new readings promptly

Trigger: Tim, 2026-10-14 00:10 ET ("change it now... its important to know so i can balance work load"). The System panel kept showing the 21:17 ET reading after the 00:04 ET reading was pushed.

### Changed
1. `pipeline-ai-usage.js` `load`: reads the GitHub contents API (`application/vnd.github.raw`, 60 s cache) first, falls back to raw.githubusercontent.com on refusal or network error. Raw caches 5 minutes and ignores query strings (verified: `?cb=<ms>` returned `x-cache: HIT`, `source-age: 234`), so the old cache-buster never worked.
2. `pipeline.html`: opening the System panel or pressing Refresh now always re-reads the readings file; otherwise the hold is 2 minutes (was 10). The AI usage section now prints when the file was checked and the time of the newest reading.

### Verification
`npm test` 436 pass (new: API-first and raw-fallback load test). Inline page scripts parse. API endpoint returns the current file with `Access-Control-Allow-Origin: *`.

### Limits
Unauthenticated GitHub API allows 60 calls per hour per IP; the panel uses at most 30. Above that it falls back to raw (up to 5 minutes stale).

## Batch 2026-10-13-I — ZipRecruiter redirect links are not identity

Trigger: ChatGPT's first weekly ZipRecruiter pass (FORGE-ZIPR-CHATGPT-20261013-1740ET-B01, 12 records): 1 written, 11 `WRITE_FAILED` with `IDENTITY_CONFLICT: SOURCE_URL_IDENTITY_CONFLICT`. Every ZipRecruiter link is `ziprecruiter.com/job-redirect?match_token=...`; `canonUrl` dropped the query, so all ZipRecruiter roles shared one identity with the first row written (Red Frog Solutions, V2I-2D41E91681F5).

### Changed
`canonUrl` (Code.gs) returns no identity for ZipRecruiter redirect paths (`/job-redirect`, `/jobs/redirect`, `/clk`), the same treatment as Indeed sponsored-click links. Dedupe falls back to employer + title + location. ZipRecruiter company job pages keep their identity.

### Not changed
Other URL identities, intake rules, the 11 failed records (resubmitted separately after deploy).

### Verification
`npm test`: 435 pass, 0 fail (2 new checks in `tests/canon-url.test.js`).

## Batch 2026-10-13-H — TinyFish posting date in bold layout

Trigger: dry run after deploying batch G (Writer v62, 2026-10-13 18:00 ET): TinyFish sometimes returns Workday fields as `**posted on**:   Posted N Days Ago`; the posting-date pattern now reads both layouts. Liveness, pay and degree were unaffected. Verification: `npm test` 435 pass (1 new).

## Batch 2026-10-13-G — Writer reads Workday through TinyFish

Trigger: Tim, 2026-10-13 17:46 ET, "Yes" to the Writer calling TinyFish's free Fetch API. Evidence: Workday answers 403 to requests from Google's servers (73 of 929 active rows, first ATS batch 2026-10-13); Claude's TinyFish test the same evening rendered Workday job and search pages in full (Blue Origin R67034, Entegris REQ-13635 with pay $220,000-$280,000).

### Changed
1. **`apps-script/PipelineAts.gs` TinyFish fallback.** When a Workday row's CXS call fails and the script property `TINYFISH_API_KEY` is set, the Writer reads the public job page through `POST https://api.fetch.tinyfish.ai` (rendered on TinyFish's servers). A stored URL without the requisition token (`_R12345`, `_REQ-12345`, `_JR12345`) is resolved through the site's own search page (`?q=` with up to three title words): one unique title match (location breaks ties) is fetched; several matches with no way to tell them apart are never guessed (`AMBIGUOUS_SEARCH`).
2. **Fields.** Same ENRICH fields as the checker, plus `ATS_CHECK_VIA=TINYFISH`, `ATS_CXS_RESULT` (the original Workday answer), `LIVENESS_METHOD=TINYFISH_FETCH:WORKDAY`, `ATS_POSTED_NOTE` for "Posted 30+ Days Ago" (no invented date). `ATS_POSTING_URL` holds the full job link and is now read first, so later checks go straight to it.
3. **Limits.** 6 Workday rows per run (three sequential TinyFish rounds of up to 35 s each fit after the 90 s claim cutoff, under the 6-minute limit), 300 URLs per UTC day (TinyFish's free allowance is 1,000; beyond it the wallet is charged). Rows over a limit are deferred unwritten, so they stay due. A TinyFish outage defers the rows instead of recording a failure.

### Safety rules in code
- CLOSED only when a URL carrying the requisition token shows Workday's "page you are looking for doesn't exist" page or a 404. The same page on a token-less URL, absence from search, a block or an unreadable page never closes a row.
- Title check as before; "Similar Jobs" text is excluded from pay and degree reading.
- The API key lives only in script properties; it is never logged, returned or written to a file.

### Not changed
Other providers, the queue, scoring, Writer authority. Without `TINYFISH_API_KEY` the checker behaves exactly as batch E.

### Verification
`npm test`: 434 pass, 0 fail (7 new in `tests/ats-tinyfish.test.js`, built on page text captured from TinyFish on 2026-10-13). The Apps Script glue (UrlFetchApp to TinyFish) is not unit-tested; first live check is `GET action=ats_check&dry=1` after deploy with the key set.

## Batch 2026-10-13-F — AI usage panel and PC keep-alive

Trigger: Tim, 2026-10-13 15:49-15:54 ET: a bar chart in the app with the estimated shutdown day, updated automatically, plus a PC script that keeps the machine and Chrome available for it ("B now").

### Changed
1. **`pipeline-ai-usage.js` (new) + System panel section "AI usage".** One bar per provider meter (Claude weekly/session, ChatGPT weekly/5-hour, Grok weekly/bot) with the exact percent, reset time and projected run-out. Projection: measured rate between the newest reading and one at least 2 h older in the same reset window; with one reading, the average since the window started. Text status beside every bar (OUT, RUNS OUT BEFORE RESET, LASTS TO RESET, NEED 2 READINGS, NO READING, RESET PASSED), colour only as a second channel (UI doctrine v1.1 Accessibility Floor). Reads `usage/AI_USAGE_READINGS.jsonl` from the public forge-coordination repo (raw GitHub, CORS open), at most every 10 minutes while the System panel refreshes.
2. **`tools/forge-pc-keepalive.ps1` + `tools/install-forge-pc-keepalive.ps1` (new).** Hidden logon task on Tim's PC: keeps it awake on AC power only (SetThreadExecutionState; power settings untouched), restarts the Claude desktop app if closed on AC, opens Chrome minimized only around the usage-reader times. `-Uninstall` removes it.

### Not changed
Writer, master, scoring, lanes.

### Verification
`npm test`: 427 pass, 0 fail (4 new in `tests/ai-usage.test.js`). Browser render not run here (no Playwright); check the System panel after deploy.

## Batch 2026-10-13-E — Writer ATS liveness checker

Trigger: Tim, 2026-10-13 14:47 ET, "Implement everything else" (items 1, 2, 4 and 5 of the verification integration plan; item 3, JobSpy, deferred). Evidence: Claude's 9-row test against the live master the same afternoon; first-party ATS APIs were conclusive on 5 of 6 rows.

### Changed
1. **New `apps-script/PipelineAts.gs`.** Detects a row's ATS from its stored URLs (Workday, Greenhouse, Lever, Ashby, Oracle HCM with a CX_n site, SmartRecruiters, BambooHR), builds the public API URL from the stored URL only (no invented hosts or slugs), reads the answer and turns it into ENRICH fields. `runAtsCheck_` fetches with `UrlFetchApp.fetchAll` (10 at a time, one Ashby board call per board) and queues ONE batch file `ATSCHK_<stamp>.json` of up to 25 ENRICH rulings (actor `WRITER_ATS`). Every write goes through the normal queue, receipts and three-proof verification.
2. **Queue tick** (`Automation.gs`): runs the checker at most every 30 minutes on a quick, non-busy tick, and never while an earlier ATSCHK file is still queued.
3. **GET `action=ats_check`** (`Code.gs`): run now; `&dry=1` returns the plan and queue body without writing.
4. **Posting-validation worklist** (`PipelineWorklists.gs`): rows with a checker-supported URL are left to the checker unless `ATS_CHECK_RESULT` is not LIVE/CLOSED. The AI lane gets only the residue.

### Safety rules in code
- CLOSED only on positive evidence: per-posting 404/410 from Workday, Greenhouse or Lever (`CLOSED_EMPLOYER_404`); Workday `posted=false`/`canApply=false` or Oracle end date in the past (`CLOSED_EMPLOYER_ATS`). Any error, block, unreadable body, title mismatch, board absence or untested-provider miss writes only `ATS_*` fields and leaves `LIVENESS` alone.
- Title check: the ATS title must share at least half the row title's significant words, else `TITLE_MISMATCH` and no stamp.
- Pay: one structured annual USD range, or exactly one plausible range in the text; malformed (Entegris `$330,00.00`) and tiered ranges are skipped. `DEGREE_TEXT` is written only when the row has no posting-based degree evidence; otherwise the line goes to `ATS_DEGREE_TEXT` only.
- Never writes BUCKET, DISPOSITION, POSTING_STATE, application or TIM_* fields. Protected and anti-resurrection rows are never selected.

### Not changed
- No master row changes on deploy. The first checker batch runs on the first quick tick after deploy.
- Lane ownership, scoring, FLEX rules, intake and identity matching.

### Verification
- `npm test`: 423 pass, 0 fail (412 before + 11 in `tests/ats-checker.test.js`, built from the real API bodies seen on 2026-10-13: Entegris and Blue Origin Workday, Vulcan Greenhouse, Palantir Lever, Ramp Ashby, KIK Oracle, fly.io BambooHR).
- Not run: live fetch from Apps Script (the build workspace cannot reach ATS hosts). After deploy, run `action=ats_check&dry=1` and check the plan before the first real batch lands.

### Deploy note
Writer only. `UrlFetchApp` is already authorised (REV-005). New file `PipelineAts.gs` is pushed by `deploy.sh` with the other `*.gs` files.

## Batch 2026-10-13-D — Writer clears held queue files by itself

Trigger: Tim, 2026-10-13 12:44 ET, on the QUEUE_HOLD warning for `HOLD__FORGE_GOFER_CLAUDE_20261012_TIM_03_hitachi_R0109990_applied.json`: "I don't want to do an exception action. I'd like trivial non problems to be processed programmatically."

Facts: the request ran 2026-10-12 01:40 UTC, SUCCESS, CREATE `V2E-89E2C036440E` (Hitachi Energy, R0109990, APPLIED). Its RESULT is in `processed`. Only the move of the request file out of the queue failed, so `finalizeClaim_` renamed it HOLD__. Row readback 2026-10-13 13:56 UTC found the row APPLIED and protected.

### Changed (`apps-script/Automation.gs`)
- New `reconcileHolds_`, run on each quick, non-busy queue tick (up to 10 held files). A HOLD__ file whose RESULT__ exists in `processed` or `failed` is renamed back and moved into that folder, which is where `finalizeClaim_` meant to put it. Each move is appended to `WRITER_HOLD_RECONCILE_LOG.jsonl`; the tick summary carries `holds`.
- A HOLD__ with no RESULT, or whose move fails again, stays held under its HOLD__ name, so the QUEUE_HOLD warning keeps reporting real anomalies.

### Not changed
Nothing is re-run. No master read or write. Queue log, incident rules and warnings unchanged. Claim, finalize and repair paths unchanged.

### Verification
`npm test` 412 pass, 0 fail. New `tests/hold-reconcile.test.js` (5): SUCCESS result moves to processed; failed result to failed; no RESULT stays held; second move failure restores HOLD__; pending and RESULT files untouched.

### Deploy note
Writer change. Deploy with `apps-script/deploy.sh`. The current Hitachi hold clears on the first quick tick after deploy.

## Batch 2026-10-13-C — System dashboard counted finished obligations as open backlog

Trigger: Tim, 2026-10-13 12:35 ET, phone screenshot of System > Dashboard: "Processing backlog by stage" showed Writer / verification 514 and Qualification 33 (sum 547) while the state mix showed 452 verified complete, 51 existing verified, 2 excluded verified, 42 needs resolution, and the Writer header read idle with queue 0.

### Root cause
`pipeline-operations-ui.js` had its own `isDone` regex anchored to `VERIFIED|COMPLETE|DONE|RESOLVED|WRITE_VERIFIED|VERIFIED_MASTER`. No real obligation state matches it (the real final states are `VERIFIED_COMPLETE`, `EXCLUDED_VERIFIED`, `EXISTING_VERIFIED`, `CANCELED_VERIFIED`), so every obligation counted as open. This inflated "Processing backlog by stage", "Open work by lane", the Writer-blocked count and the dashboard's next-action text. "Obligation state mix" and "Resolved vs open" use `PipelineOperations.summary` and were already correct.

### Changed (`pipeline-operations-ui.js`)
- `isDone` now calls `PipelineOperations.complete` (final state plus independent proof), the same test `summary()` uses. Fallback when that module is absent: the four final state names.
- `create()` exposes `metrics` (the existing `dashboardMetrics`) for tests.

### Not changed
Obligation data, Writer, scoring, master, the stage classifier, chart rendering. The company filter chip still does not scope System dashboard charts (they are global; separate item, not addressed here).

### Verification
`npm test` 407 pass, 0 fail. New `tests/ops-dashboard-done.test.js` (2 tests) fails against the old logic (open 11 vs expected 3) and passes with the fix. Expected live effect: the Writer bar drops from 514 to the count of obligations still in non-final states (or final without proof); this equals summary's open count.

## Batch 2026-10-13-B — intake dedupe: ATS job id and state names

Trigger: Claude 07:15 ET check. Grok web intake FORGE-WEB-GROK-20261013-0315ET inserted three Anduril VP Production rows (V2I-7506B47A8EAD, V2I-1F7FCDC7D808, V2I-121F69D9A93E) that already exist in the archive as DECLINED_BY_TIM (V2S-ANDURIL-VPPROD-MS-5199174007, V2S-ANDURIL-VPPROD-FRON-5218932007, V2L-ANDURIL-VPCONNECTEDWARFARE-5173257007). Intake carried Anduril's internal req (12461, 13466, 11414); the archived rows carry GH-<Greenhouse job id>; locations read "Costa Mesa, California, United States" against "Costa Mesa, CA". No match path fired.

### Changed (`apps-script/Code.gs`)
1. `atsJobIds`: Greenhouse job id (`greenhouse.io/<board>/jobs/<id>`, `gh_jid`) and Workday R-number from URLs. Indexed per row from the REQ cell and every URL field.
2. `matchExisting`: REQ_ID also matches a row's ATS ids; new `ATS_JOB_ID` path matches the intake URL's job id against a row's requisition or ATS ids. Same-employer only.
3. `normLocation`: full US state names map to postal codes.

### Not changed
Match order, conflict and ambiguity handling, employer compatibility, protected states.

### Verification
`npm test` 405 pass (5 new in `tests/ats-job-id-dedupe.test.js`, built from the live Anduril and Blue Origin rows, including a cross-employer negative case).

## Batch 2026-10-13-A2 — worklist selectors match live master keys (fix to A)

Trigger: first live build of batch A (Writer v57, 2026-10-13 00:54 ET) listed 862 of 1,408 rows as needing strategic analysis. A scan of the live master showed strategic fit stored as SCOPE_FIT_RAW / FIT_CONF / FIT_ASOF / ANALYSIS_BY, salary as SALARY_BASE_LOW/HIGH/MIDPOINT and PAY_POSTED, and DEGREE_TEXT="not stated in alert" on most intake rows.

### Changed
- Strategic: a row is done when `PipelineEvidence.fit` reads a fit value (the Explorer's own FIT_KEYS) or ANALYSIS_BY/ANALYSIS_ASOF/STRATEGIC_ASOF is set. Live count 862 -> 18.
- Feasibility: SALARY missing when `PipelineEvidence.salary` finds no midpoint; DEGREE missing when DEGREE_REQ is absent and DEGREE_TEXT is absent or alert-derived. FLEX dropped from NEED (the Writer derives FLEX_CLASS from DEGREE_TEXT). Live count 821 -> 452.
- Posting validation unchanged (337).

### Verification
- `npm test` 400 pass. Counts above from the live master read at 00:54 ET on Tim's machine.

## Batch 2026-10-13-A — lane worklists built by the Writer

Trigger: Tim, 2026-10-13 00:29 ET ("Implement 1-5"): Grok at 80% of weekly usage; Grok runs spent most of their budget reading and parsing the 3 MB master, and FORGE-ENRICH-STRATEGIC-GROK-20261013-0224ET hard-blocked because the master truncates in Grok's reader. Control: forge-coordination CONTROL 2026-10-13.2, GROK EFFICIENCY AMENDMENT.

### Changed

1. **New `apps-script/PipelineWorklists.gs`.** Pure builder (`build`, `render`) plus `refreshWorklists_`. Writes three small plain-text files in AI_Coordination, overwritten in place (IDs never change): `WORKLIST_FORGE_ENRICH_STRATEGIC.txt` 1nGzvaRZufMkXD0dIAqcrMeAWZEUzoPu8, `WORKLIST_FORGE_ENRICH_FEASIBILITY.txt` 1B0IxEim2QUxvZ8swiZKwbSMB-1dkY9O1, `WORKLIST_FORGE_POSTING_VALIDATION.txt` 1KyBWb2RTVMoDEkdYGCHuXMAAqCShdQl0. Each lists up to 40 rows (about 10 KB) with eligibility rule, counts and master stamp.
2. **Queue tick hook** (`Automation.gs`). `processWriterQueue` calls `refreshWorklists_(false)` after the claim loop, at most every 30 minutes, only when the tick was quick and not busy. Errors are caught and reported in the tick summary; the queue path is unaffected.
3. **GET `action=refresh_worklists`** (`Code.gs`) forces a rebuild; added to the `ping` action list.

### Not changed

- No master writes. Eligibility rules are read-only selectors; protected buckets, ANTI_RESURRECTION and DO_NOT_REWORK rows never appear. Writer actions, scoring, FLEX policy unchanged.

### Verification

- `npm test`: 399 pass, 0 fail (4 new in `tests/worklists.test.js`: payload parsing of space-joined keys, lane selection and exclusions, attempt cooldown ordering, render size cap on the scrubbed fixture).

### Deploy note

Writer deploy with `apps-script/deploy.sh`. After deploy, call `action=refresh_worklists` once (or wait for the next quick queue tick) and check that the three files show `GENERATED_AT_UTC`.

## Batch 2026-10-12-C — REV-006 preferred-only degree is SOFT_FLEX

Trigger: Tim, 2026-10-12 16:56 ET, answering two questions raised by the batch B scan of the live master (1) a degree named only in preferred wording → SOFT_FLEX; (2) a stated degree with no experience alternative and no word "required" → NO_FLEX (confirms batch B behavior).

### Changed

1. **Preferred-only degree → SOFT_FLEX** (`pipeline-policy.js` = `apps-script/PipelinePolicy.gs`). Batch B left such rows UNKNOWN (11 rows that were HIGH/SOFT would have fallen back to NEEDS_EVIDENCE). A degree stated outside the preferred clause stays hard (`Bachelor's … Preferred: MBA` → NO_FLEX). A recorded STRICT hold is not released by preferred-only wording.

### Not changed

- Rulings (a), (b), (c), Tim locks, modifiers and scoring weights. No master row changes on deploy; rows reclassify on their next write carrying DEGREE_TEXT.

### Verification

- `npm test`: 395 pass, 0 fail. `tim-lock-v4` expectation for bare "Degree preferred" changed UNKNOWN → SOFT_FLEX per this ruling. New cases in `tests/flex-rulings-20261012.test.js`.
- Scan of the 1,295-row master against old and new code: 309 rows change class in total (batches B + C), none to UNKNOWN. List sent to Tim as CSV.

### Deploy note

Writer-only change in effect (Explorer shares `pipeline-policy.js`). Deploy with `apps-script/deploy.sh`.

## Batch 2026-10-12-B — FLEX rulings, refresh waits for queue, decision tabs, GitHub policy switch

Items REV-001, REV-002, REV-004 and REV-005 from `control/PIPELINE_EXPLORER_REVISION_LOG.txt` in `tpruittguitar/forge-coordination`. REV-003 (gofer drains the held queue) is an operations task with no code and is not in this release.

### Changed

1. **REV-004 FLEX derivation per Tim's rulings of 2026-10-12 12:55 ET** (`pipeline-policy.js` = `apps-script/PipelinePolicy.gs`). (a) "Bachelor's ... preferred, or equivalent education and experience" → HIGH_FLEX (was UNKNOWN). (b) Hard engineering degree or tiered BS/MS/PhD with no experience alternative → NO_FLEX (was SOFT_FLEX). (c) "B.S. in <field> or an equivalent technical field" → NO_FLEX (was HIGH_FLEX): "equivalent" followed by field/discipline/major/degree no longer counts as an experience alternative. Degree abbreviations (BS, BSEE, MS, MBA, M.Eng …) are recognised; "MS Office/Excel" is not. A degree mention with "preferred / a plus / desired / ideally" and no hard wording is no longer treated as a hard requirement.
2. **REV-001 Refresh review waits for the queue** (`pipeline.html`). Queue checks show ⏳ while the Writer queue still has items, the panel says "Ready when the queue clears (N waiting, M unverified)", and every Writer status poll repaints an open review.
3. **REV-002 Decision tabs and whole-queue tile** (`pipeline.html`, `pipeline-navigation.js`). Pipeline menu gains Review queue, Decline candidates and My rulings. The "Needs decision" tile counts the whole NEEDS_TIM queue and opens it.
4. **REV-005 Policy source switch** (`apps-script/Code.gs`). Rules and scoring model reads and saves go through one switch. Drive stays the default. With Script Property `POLICY_SOURCE=GITHUB` they use `tpruittguitar/forge-policy` (`rules/TIM_PIPELINE_RULES_CANONICAL.txt`, `scoring/PIPELINE_SCORING_MODEL.json`; overridable by property). Saves need `GITHUB_POLICY_TOKEN`, pass the file's blob SHA (a concurrent change is a `REVISION_CONFLICT`, never an overwrite), commit with a `TIM ...` message so the unreviewed-push alarm stays quiet, verify by readback, and still write the Drive history and event log. A failed GitHub read takes the same degraded path a failed Drive read takes today; it never silently falls back to Drive. New editor function `checkPolicySource()` reports the live source.

### Not changed

- No master row, published scoring model or Rules text is changed by deploying. Rows reclassify under REV-004 only on their next write that carries DEGREE_TEXT; the refresh re-derives modifiers from stored FLEX_CLASS and does not reclassify.
- Drive remains the policy source until Tim sets `POLICY_SOURCE=GITHUB`. `pipeline-alignment.js` still names the Drive Rules ID for automation contracts; that changes with CONTROL at policy cutover.
- STRICT holds, `TIM_FLEX_CLASS` locks, modifiers and scoring weights are unchanged.

### Verification

- `npm test`: 393 pass, 0 fail. New: `tests/flex-rulings-20261012.test.js` (rulings a–c, edges, Writer copy identical), `tests/policy-source-github.test.js` (7 cases: Drive default with no network call, token and raw reads, no Drive fallback, rules save with conflict and label, scoring publish with revision check, concurrent-change conflict). One `tim-lock-v4` expectation changed to NO_FLEX per ruling (b).
- Browser suites not run (no Playwright in the build environment). `tests/derived-refresh.browser.js` was updated for the ⏳ text and should be run before deploy.

### Deploy note

Writer and Explorer deploy together. The Writer now references `UrlFetchApp`, so Apps Script will ask for the external-request permission: after `deploy.sh`, open the script editor and run `checkPolicySource` once to authorise it. If the live `appsscript.json` lists `oauthScopes` explicitly, add `https://www.googleapis.com/auth/script.external_request` first.

## Batch 2026-10-12-A — settings stick (FLEX, map/geo, scoring publish)

Trigger: Tim, 2026-10-12 03:12 ET: "My scoring and flex keeps getting reset" / "And my map geo changes". Diagnosis on Drive: `AI_REASON_DIAGNOSIS_Scoring_FLEX_Geo_Resets_2026-10-12.txt` (1R-JM_cJLMR3K4rVWH1JR6Z6_Db9_dyte).

### Changed

1. **FLEX class settings stick under V4** (`pipeline-rules.js`, `pipeline-policy.js` = `apps-script/PipelinePolicy.gs`). The V4 lock supplied hard-coded class mappings that overrode what Tim saved. V4 now supplies defaults only; a saved `NOT_STATED_CLASS`, `EQUIVALENCY_CLASS`, `HARD_DEGREE_CLASS`, `SINGLE_PATH_CLASS` or `FRESH_DEGREE_OVERRIDES_STALE_CLASS` wins. V4 classification now uses those mappings.
2. **V4 description text follows the saved numbers** (`pipeline-rules.js`). The V4 prose was static (+15/+6/-10) while the live keys are +90/+30/-60/-100. Prose is now generated from the keys. The one-click FLEX/URL update in the Rules editor always regenerates it.
3. **Tim's row FLEX choice is locked** (`apps-script/Code.gs`, policy module). An actor-TIM ruling that sets `FLEX`/`FLEX_CLASS`/`FLEX_HINT` records `TIM_FLEX_CLASS` + `TIM_FLEX_SET_AT`. That class outranks text re-derivation and survives unrelated writes from any lane. Tim choosing UNKNOWN releases it. Agents cannot write `TIM_FLEX_CLASS` (added to `FIELD_DENY`).
4. **Placeholder degree text is unresearched** (policy module). Text such as "not stated in email alert excerpt", "UNKNOWN (... not extracted ...)", "feasibility to capture" now classifies as UNKNOWN per Rules V4 ("Blank/unresearched requirements remain UNKNOWN"). A recorded STRICT hold still survives.
5. **"No degree required" / "degree is not required"** now classify as the not-stated class. They were classified as a hard degree requirement because the word "required" matched.
6. **Map edits survive reload** (`pipeline.html`). Add, remove, edit and geocode of a control point now mark the local draft as edited, so loading the published model no longer discards them. Reset asks for confirmation.
7. **Stale scoring publishes are rejected** (`apps-script/Code.gs`, `pipeline.html`). The Explorer sends `baseRevision`; the Writer rejects a publish edited from an older revision (or with no base revision once a model exists) with `REVISION_CONFLICT`. The Explorer keeps the draft, refreshes the published model and asks Tim to review again.
8. **Exact duplicate map points** (same name and coordinates) are removed on review and publish. Rev 20 has Seattle, WA twice.

### Not changed

- No row in the master, no published scoring model and no Rules text is modified by this release. The live Rules' saved class keys equal the old V4 forced values, so scores do not move on deploy. Rows change only on their next write, and only where a placeholder or "no degree required" text was misclassified.
- STRICT hold / `TIM_FLEX_OVERRIDE` semantics, modifiers, ownership, identity and protected application states are unchanged.

### Verification

- `npm test`: 381 pass, 0 fail (371 existing + 10 in `tests/settings-stick.test.js`, one or more per defect, using the live +90/+30/-60/-100 policy).
- Browser suites (`*.browser.js`) were not run: Playwright is not installed in the build environment. `tests/scoring-publish.browser.js` mocks `save_scoring_model` and should be run before deploy.

### Deploy note

Writer and Explorer must deploy together. An old cached Explorer tab will get `REVISION_CONFLICT` on publish until it reloads; that is intended.
