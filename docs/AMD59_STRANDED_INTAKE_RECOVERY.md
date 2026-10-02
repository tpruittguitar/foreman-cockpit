# AMD59 stranded-intake recovery worker — one-time use

This branch adds `apps-script/Amd59RecoveryWorker.gs`.

## Why this exists

The live Pipeline Explorer writer is correctly protected by a passphrase compiled into Apps Script and stored in Pipeline Explorer browser localStorage. ChatGPT/Claude/Grok scheduled runtimes do not have access to that browser-local secret, so they cannot authenticate to the writer endpoint unattended.

This worker avoids weakening authentication. It runs **inside the existing Apps Script project as Tim**, calls the already-tested internal `applyIntakeToMaster_()` function directly, and never reads, prints, moves, or changes `PASSPHRASE`.

## Exact scope

It processes only the 38 stranded intake records in:

`MASTER_CHANGE_REQUEST_AMD59_STRANDED_INTAKE_RECOVERY_2026-10-01.txt`

Drive ID:

`1CvCnuEiZAg2tR1A-9R29DK8jyc8L8rUb`

Breakdown:
- E1: 15
- E2: 16
- E3: 7

It deliberately does **not** process:
- U-01 Blue Origin application-history upsert
- U-02 HII 30330 application-history upsert
- U-03 Shield AI R6147 application-history upsert
- U-04 Baltimore Aircoil/Amsted history-only upsert
- H-01 Oatey unbound hold

Those remain separate because the current writer has no generic email-upsert action and this recovery must not force APPLIED state through Scout intake.

## Validation already performed

The parser was run against the actual 51 KB Drive request and returned exactly:
- E1=15
- E2=16
- E3=7
- total=38
- unique IDs=38
- missing COMPANY/TITLE=0

The five never-consider proposals were also identified correctly:
- E1-13 Stryker NC-002
- E1-14 Stryker NC-002
- E1-15 Nulixir NC-003
- E3-06 Neurona Therapeutics NC-001
- E3-07 Kyowa Kirin NC-001

## How to run

This is intentionally a one-time internal Apps Script function.

1. Open the existing Apps Script project used by Pipeline Explorer.
2. Add a new script file named `Amd59RecoveryWorker.gs`.
3. Paste the file from this branch into it.
4. Save.
5. From the function selector, choose:
   `recoverAmd59StrandedIntake20261001`
6. Click **Run**.
7. Approve permissions only if Google asks.
8. Do not run it a second time unless the first run fails before completion. The underlying writer is idempotent, but the receipt should be reviewed first.

## Expected result

The worker:
- reads the recovery transport file from Drive;
- hard-stops unless parse counts are exactly 15 + 16 + 7;
- replays E1 and E2 with their original run IDs;
- uses `RECOVERY-AMD59-20261001-E3` for E3 and does not fabricate the missing original run ID;
- routes every candidate through the existing intake writer and never-consider adjudicator;
- fresh-reads the master afterward;
- writes a nonempty plain-text receipt into `AI_Coordination`.

A successful receipt name begins:

`MASTER_CHANGE_APPLIED_AMD59_STRANDED_INTAKE_RECOVERY_`

A failure receipt begins:

`MASTER_WRITER_FAILURE_AMD59_STRANDED_INTAKE_RECOVERY_`

## Important

Do not replace your live `PASSPHRASE` with the repository's `CHANGE-ME` placeholder.

Do not wire this recovery function to a recurring trigger.

The architectural follow-up should be a generic server-side authenticated queue consumer, but that is separate from this one-time recovery.

## Deployment-path assessment — 2026-10-02 (Claude Code, cloud session)

Checked, in order, whether an authenticated automated Apps Script path existed from the cloud session:

1. Local checkout of `main`: present and byte-identical to PR #7 (`Amd59RecoveryWorker.gs` SHA `6267eae`).
2. `clasp`: not installed; no `~/.clasprc.json`; `gcloud` has no credentialed account.
3. `.clasp.json` / script ID / deployment linkage in the repo: none. The live project is identifiable by title only via Drive metadata: **Pipeline Explorer Writer** (script ID `1vsVq0tFs_EvKSxahpCR8TNCaXkkZ-iObA9b_wd7GJGkcmNcgNc_1gLGr`, modified 2026-10-01 01:02 UTC). The older "Untitled project" (2026-08-10) is not the writer.
4. Drive connector (runs as Tim): read-only for existing content plus create-new-file. It cannot add a file to an Apps Script project and cannot run a function.
5. Establishing `clasp` would need Tim to enable the Apps Script API in his user settings and to paste an OAuth code/redirect URL into chat (a secret in chat, not allowed), and `clasp run` additionally needs a standard GCP project plus an **API Executable** deployment (a new deployment, not allowed for this recovery).

Result: **no automated path; the worker was not pushed and `recoverAmd59StrandedIntake20261001` was not run (RUN_COUNT=0).**

Independent pre-execution validation performed against the real Drive request (`1CvCnuEiZAg2tR1A-9R29DK8jyc8L8rUb`, 51,294 bytes, SHA-256 `6c56cecf…45ca2`) using the parser functions from the merged worker under Node:
E1=15, E2=16, E3=7, total=38, unique=38, missing COMPANY/TITLE=0; never-consider candidates E1-13, E1-14, E1-15, E3-06, E3-07; U-01..U-04 and H-01 sections present and untouched by the parser.

Master baseline before any recovery (`19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI`, modified 2026-10-01T05:29:21.969Z):
`COUNTS: TOTAL=569 … SCOUT_INTAKE=0 DISCOVERY_LEAD=2`, `END V2_CURRENT_POPULATION_MASTER (569 rows)`, 569 data rows, 3 pre-existing repeated PRIMARY_IDs (V2L-SKYWAYS INV469/510, V2S-KAPTA-DIR-MFG-RADAR INV419/507, V2S-VULCAN-DIR-MFG-ENG INV420/508, each a DUPLICATE row self-pointing at the surviving row; predates this recovery and is the no-new-duplicates baseline), 0 rows carrying the E1/E2 run IDs or `RECOVERY-AMD59-20261001-E3`. No `MASTER_CHANGE_APPLIED_` or `MASTER_WRITER_FAILURE_` AMD59 receipt exists in AI_Coordination.

The only remaining execution path is the manual "How to run" above, performed by Tim inside the existing project.

## Execution — 2026-10-02 (Authorized State Writer HTTP path)

On Tim's authorization the recovery was executed through the existing writer deployment's `action=intake` POST, not through `Amd59RecoveryWorker.gs` (which remains undeployed). Same envelopes and run IDs as the worker: E1 `GROK07-20261001-0612ET-07089bfe`, E2 `GROK07-20261001-1707ET-07089bfe`, E3 `RECOVERY-AMD59-20261001-E3` (original E3 run ID recorded as NOT PROVIDED; original return Drive ID preserved in run metadata). Each envelope was sent once.

| Envelope | Intake | Lead | Existing | Never-consider | Failed | Status |
|---|---|---|---|---|---|---|
| E1 | 8 | 4 | 1 | 2 (NC-002) | 0 | COMPLETE |
| E2 | 5 | 10 | 1 | 0 | 0 | COMPLETE |
| E3 | 3 | 1 | 3 | 0 | 0 | COMPLETE |

Master 569 → 600 rows. Independent Drive readback: header COUNTS equal actual row buckets, END marker matches, 0 pre-existing rows altered, 31 new rows each present once with intake metadata, no new repeated PRIMARY_IDs, no rows for the deferred U-01..U-04 or H-01. Receipt: `MASTER_CHANGE_APPLIED_AMD59_STRANDED_INTAKE_RECOVERY_2026-10-01_214542.txt` (Drive `1nEJzgET3_AEg7wX7fYPcvUcJM1McK2co`).

Open defect found: GET requests to the live writer (`action=ping`, `action=master`) fail with `ReferenceError: req is not defined (line 37, file Code)`. POST is unaffected. The live Code.gs differs from `main` at that line and needs correcting in the Apps Script editor.
