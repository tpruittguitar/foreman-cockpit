# Pipeline Explorer state writer

The Writer uses private Apps Script Script Properties for authentication and fixed Drive targets. Code.gs no longer contains a default passphrase or private target identifiers. This is not a claim that unchanged repository files or history have been sanitized. Configuration must be complete and valid before any HTTP handler or installed trigger runs.

**Deployment is blocked in this draft.** Both `deploy.sh` and `activate_v5.sh` intentionally refuse every invocation, including `--head`, until separately approved configuration migration and verified readback are complete. Uploading HEAD also changes installed-trigger execution, even if the web app deployment stays unchanged. Do not bypass the gate with manual paste-over, direct API calls, or older deployment scripts.

Follow [Private Writer configuration](../docs/WRITER_PRIVATE_CONFIGURATION.md) for the property names, approval boundaries, verification, and rollout dependencies. This change does not migrate settings, rotate credentials, modify scopes, install triggers, or deploy anything. Explicitly saved browser connections are retained; browsers relying on bundled defaults require private setup.

## Tests

Run `npm test` for the full synthetic test suite. It explicitly preloads `tests/helpers/writer-runtime-fixture.cjs`; production has no synthetic defaults. For focused Node tests importing `Code.gs`, run `node --require ./tests/helpers/writer-runtime-fixture.cjs --test tests/<name>.test.js` from the repository root. Isolated VM tests must explicitly provide their own synthetic PropertiesService fixture.

## Receipt-index GitHub migration (REV-010)

The GitHub receipt-index backend uses a separate `GITHUB_WRITER_STATE_TOKEN` Script Property with Contents read/write permission on `tpruittguitar/forge-writer-state`. Follow [the cutover runbook](../docs/RECEIPT_INDEX_GITHUB_CUTOVER.md) only with the required approvals. Do not change this setting as part of the private Writer configuration separation.

## Intake handoff identity and legacy recovery

Email notifications and partial posting details can enter intake with unresolved evidence; successful persistence does not establish research completeness or pursuit eligibility. Supply a stable `requestId` (or `request_id`). For older intake clients, `run.SCOUT_RUN_ID` is the fallback identity. Writer uses the same identity for its durable intent, receipts, and queue recovery, while retaining the source run ID separately.

For an already independently verified legacy intake whose final receipt lacks REQUEST_ID, submit `action=reconcile_intake_receipt` with the original `requestId` (the SCOUT_RUN_ID) and `writeId`. This repairs the index only: it requires an intact independent COMPLETE receipt for the live master, reconciled run accounting, unique current rows, valid master trailers, and no unresolved transactions or conflicting index entry. It records the historical proof and current row presence without claiming current row hashes match the original write or promoting job evidence. It never replays intake. Check `receipt_index` and `writer_status` after repair.

## Policy source (from 2026-10-17)

Canonical Rules and the scoring model live in `tpruittguitar/forge-policy` (`rules/TIM_PIPELINE_RULES_CANONICAL.txt`, `scoring/PIPELINE_SCORING_MODEL.json`). The Writer reads them there by default. Script Properties (Project Settings → Script Properties):

- `GITHUB_POLICY_TOKEN`: fine-grained GitHub token, repository `tpruittguitar/forge-policy` only, permission Contents: Read and write. Needed for saves from the Explorer (Rules, Target Companies, scoring model). Reads work without it.
- `POLICY_SOURCE`: leave unset (GitHub). Set `DRIVE` only to roll back to the superseded Drive Doc and file.

Run `checkPolicySource` from the editor after any change: it reports the live source, whether the token is set, and whether the GitHub rules file is readable.
