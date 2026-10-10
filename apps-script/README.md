# Pipeline Explorer state writer — one-time setup (about 5 minutes)

This script runs in **your** Google account. It reads the canonical master and, when an approved Explorer or AI request arrives, writes the requested change into the master row in place, recounts, reads it back, and logs a receipt. It also supports Scout intake, data-discovery requests, scoring-model saves, document-text reads and the Drive queue. The queue trigger is the only unattended execution path; direct requests are handled immediately when the runtime can reach the web app.

1. Open https://script.google.com and click **New project**.
2. Delete the placeholder code, paste the full contents of `Code.gs` from this folder.
3. Near the top, change `PASSPHRASE = 'CHANGE-ME'` to a passphrase of your own. Click the save icon.
4. Click **Deploy** (top right) → **New deployment** → gear icon → **Web app**.
   - Description: anything.
   - Execute as: **Me**.
   - Who has access: **Anyone**.
   - Click **Deploy**. Approve the permissions prompt (Drive and Docs access for your own account).
5. Copy the **Web app URL** (ends in `/exec`).
6. Open the Explorer, click the **⚙** button, paste the URL and your passphrase, click **Test**, then **Save**.

That is all. With the script configured, the page reads the master through it (the Doc no longer needs to be shared by link), your rulings go straight into the master, and your seen-state syncs across devices.

**To change the script later:** edit `Code.gs` in the Apps Script editor, then **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. The URL stays the same.

**Also in this script (scout-intake PR):** `action=intake` for Scout discoveries (see `docs/SCOUT_INTAKE_CONTRACT.md`), `action=rules` (reads the canonical Doc `TIM_NEVER_CONSIDER_RULES` in AI_Coordination by fixed ID, read-only) and `action=runs` (`SCOUT_RUN_METRICS.jsonl` beside the master). After updating the script, redeploy: **Deploy → Manage deployments → pencil → Version: New version → Deploy**. The URL stays the same. The first run after redeploy will ask you to approve Docs access again.

**What it writes.** Only the row you ruled on, plus the `COUNTS:` line. Notes go into a `TIM_NOTE=` payload key. "Do not pursue" and "Decline" set `BUCKET=DECLINED_BY_TIM` with `DECLINE_REASON_CODE`, `DECLINE_REASON_TEXT`, `REOPEN_TRIGGER`, `TIM_DISPOSITION`. "Pursue" sets `BUCKET=READY_TO_PURSUE` with `TIM_RULING=PURSUE`. "I applied" sets `BUCKET=APPLIED` with `APP_DATE` and `ANTI_RESURRECTION=YES`. Every write adds `STATE_SOURCE=TIM_EXPLORER:<request id>` and `STATE_UPDATED_AT`. Rows already APPLIED or REJECTED_BY_EMPLOYER cannot be declined or set to pursue (protected applicant state, Amendment 58). Section headings are left where they are; the master's own rule says row BUCKET is authoritative.

## Historical manual deployment note
The old paste-over instructions below are retained only as history. When `apps-script/deploy.sh` and clasp access are available, use that script so the existing web-app URL and passphrase are preserved. Do not infer live capabilities from this historical section; call `action=ping` and use the returned action list.

Files the script creates beside the master on first use (no action needed): `SCOUT_RUN_METRICS.jsonl` (telemetry). Existing: `PIPELINE_EXPLORER_STATE.json`, `PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS`.

## Automated deploys and AI access (2026-10-02)
Nobody needs to paste code into the editor any more. `apps-script/deploy.sh` sets the live project to exactly this folder's `.gs` files, keeps the live passphrase, publishes a new version and points the existing web app at it, so the URL never changes. It needs a clasp login (`clasp login --no-localhost`) and the Apps Script API switched on at script.google.com/home/usersettings. `apps-script/deploy.sh --head` updates the code without touching the live web app.

`Automation.gs` adds the Drive write queue (AI_Coordination/WRITER_QUEUE, claimed by a one-minute trigger). Run `installAutomation` once from the editor to approve the trigger permission and install the trigger. Queue files are transport only, never a second population. How the AIs write is described in `docs/WRITER_ACCESS.md`.

## Intake handoff identity and legacy recovery

Email notifications and partial posting details can enter intake with unresolved evidence; successful persistence does not establish research completeness or pursuit eligibility. Supply a stable `requestId` (or `request_id`). For older intake clients, `run.SCOUT_RUN_ID` is the fallback identity. Writer uses the same identity for its durable intent, receipts, and queue recovery, while retaining the source run ID separately.

For an already independently verified legacy intake whose final receipt lacks REQUEST_ID, submit `action=reconcile_intake_receipt` with the original `requestId` (the SCOUT_RUN_ID) and `writeId`. This repairs the index only: it requires an intact independent COMPLETE receipt for the live master, reconciled run accounting, unique current rows, valid master trailers, and no unresolved transactions or conflicting index entry. It records the historical proof and current row presence without claiming current row hashes match the original write or promoting job evidence. It never replays intake. Check `receipt_index` and `writer_status` after repair.
