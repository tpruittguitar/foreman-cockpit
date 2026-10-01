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
