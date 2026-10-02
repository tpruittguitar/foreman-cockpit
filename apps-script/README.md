# Pipeline Explorer state writer — one-time setup (about 5 minutes)

This script runs in **your** Google account. It reads the canonical master and, when you make a ruling in the Explorer, writes that ruling into the master row in place, recounts, reads it back, and logs a STATE_CHANGE_RECEIPT. It also keeps the Explorer's seen-rows and rulings in a small JSON file next to the master so your phone and laptop agree. It never runs on its own.

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

## After PR #4 merges: what must be copied/deployed by hand (Tim)
Claude Code cannot touch the live Apps Script deployment. The whole of `Code.gs` on `main` after the merge must be pasted over the script in the Apps Script editor (keep your own `PASSPHRASE`), then **Deploy → Manage deployments → pencil → Version: New version → Deploy**. The URL stays the same. On the first request after redeploy, Google will ask you to re-approve Docs and Drive access, because the script now reads a second Doc (`TIM_NEVER_CONSIDER_RULES`). Until this is done the live Explorer keeps working exactly as PR #3 left it: rulings write, but `action=intake`, `action=rules` and `action=runs` do not exist, so the Scout quality and Rules tabs show "not loaded".

Files the script creates beside the master on first use (no action needed): `SCOUT_RUN_METRICS.jsonl` (telemetry). Existing: `PIPELINE_EXPLORER_STATE.json`, `PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS`.

## Automated deploys and AI access (2026-10-02)
Nobody needs to paste code into the editor any more. `apps-script/deploy.sh` sets the live project to exactly this folder's `.gs` files, keeps the live passphrase, publishes a new version and points the existing web app at it, so the URL never changes. It needs a clasp login (`clasp login --no-localhost`) and the Apps Script API switched on at script.google.com/home/usersettings. `apps-script/deploy.sh --head` updates the code without touching the live web app.

`Automation.gs` adds the Drive write queue (AI_Coordination/WRITER_QUEUE, applied every 5 minutes). Run `installAutomation` once from the editor to approve the trigger permission and install the trigger. How the AIs write is described in `docs/WRITER_ACCESS.md`.
