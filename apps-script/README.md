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

**Also in this script (scout-intake PR):** `action=intake` for Scout discoveries (see `docs/SCOUT_INTAKE_CONTRACT.md`), `action=rules` / `rules_save` for `TIM_NEVER_CONSIDER_RULES.json`, and `action=runs` for `SCOUT_RUN_METRICS.jsonl`. After updating the script, redeploy: **Deploy → Manage deployments → pencil → Version: New version → Deploy**. The URL stays the same.

**What it writes.** Only the row you ruled on, plus the `COUNTS:` line. Notes go into a `TIM_NOTE=` payload key. "Do not pursue" and "Decline" set `BUCKET=DECLINED_BY_TIM` with `DECLINE_REASON_CODE`, `DECLINE_REASON_TEXT`, `REOPEN_TRIGGER`, `TIM_DISPOSITION`. "Pursue" sets `BUCKET=READY_TO_PURSUE` with `TIM_RULING=PURSUE`. "I applied" sets `BUCKET=APPLIED` with `APP_DATE` and `ANTI_RESURRECTION=YES`. Every write adds `STATE_SOURCE=TIM_EXPLORER:<request id>` and `STATE_UPDATED_AT`. Rows already APPLIED or REJECTED_BY_EMPLOYER cannot be declined or set to pursue (protected applicant state, Amendment 58). Section headings are left where they are; the master's own rule says row BUCKET is authoritative.
