# Receipt index to GitHub — REV-010

The receipt index moves to `tpruittguitar/forge-writer-state/PIPELINE_RECEIPT_INDEX.json`. The master, queue, freeze and receipt logs remain on Drive. GitHub becomes the index authority only after the guarded cutover below. Deploying this code by itself keeps the source on Drive.

## Implementation

`ReceiptIndexStore.gs` reads the Contents API with `Accept: application/vnd.github.raw`, including files above 1 MB. It calculates the Git blob SHA from the exact UTF-8 response bytes, including any trailing newline. Each caller carries that revision on its parsed index object; every PUT includes that SHA. HTTP 409/422 throws `REVISION_CONFLICT`. There is no write retry, SHA refresh to bypass a conflict, anonymous read, cached raw CDN read or automatic Drive fallback.

`saveMasterLines_` still persists the intent in the active index and freshly reads it back **before** attempting any master write. Missing, empty, unparseable or malformed GitHub state blocks processing. A lost PUT response may have persisted an intent; the next execution must reconcile that state rather than resubmit blindly.

On GitHub writes, older COMPLETE records lose only their bulky `items` arrays. The newest 100 retain them. All request IDs, completion states, timestamps, write IDs, snapshot hashes, reconciliation evidence, corrections and unresolved transactions remain. Git history preserves earlier full snapshots; removing whole COMPLETE entries would break replay protection after receipt-log rotation. Compaction runs only on GitHub writes and does not rewrite the Drive source.

## Prepare

1. Tim merges the Writer PR, then Tim or Claude deploys using `apps-script/deploy.sh`. Confirm `ping` reports the deployed build and lists `migrate_receipt_index`. ChatGPT's cloud workspace does not have Tim's clasp deployment login.
2. In Apps Script → Project Settings → Script Properties, set `GITHUB_WRITER_STATE_TOKEN` to a fine-grained GitHub token with **Contents: Read and write** on **forge-writer-state**. This is separate from `GITHUB_POLICY_TOKEN`; do not put either token in source, URLs or receipts. Leave `RECEIPT_INDEX_SOURCE` unset (`DRIVE`) until migration switches it.
3. Inspect `writer_status` and `receipt_index`. Independently resolve any pending transaction through the normal verification flow before freezing. Pause if the live index is unreadable; recover it before attempting migration. Never seed an empty substitute.

The public repo initially contains a validated review seed (5,232 requests, zero pending, original snapshot updated 2026-10-18 02:57:50 UTC). It is **not active state** and may be older than Drive. The migration always reads Drive again under lock.

## Cut over

Use the existing authorized key-protected Writer transport. Keep the credential out of logs. Action parameters below omit the key intentionally.

1. Submit the normal `freeze_writer` action with actor `TIM` and reason `REV-010 receipt index cutover`. Confirm `writer_status.freeze.frozen=true`.
2. GET `action=migrate_receipt_index&dryRun=1`. Record the returned `sourceHash` and request count. If there are pending transactions, stop, unfreeze to reconcile them through Writer, and repeat preparation.
3. Obtain the current destination **file blob SHA**, not its commit SHA:

   ```sh
   gh api repos/tpruittguitar/forge-writer-state/contents/PIPELINE_RECEIPT_INDEX.json --jq .sha
   ```

4. GET `action=migrate_receipt_index&dryRun=0&expectedSourceHash=<sourceHash>&expectedGithubSha=<blob-sha>`. Without `dryRun=0`, this action is read-only. It requires the maintenance freeze, exact source hash, zero pending transactions and expected destination revision. It writes the current Drive snapshot to GitHub, compacts old detail, reads it back exactly, then sets `RECEIPT_INDEX_SOURCE=GITHUB` as its last step. It does not unfreeze automatically.
5. Require `mode=MIGRATED`, then call `receipt_index` in a new execution. Confirm `source=GITHUB`, location, request/status counts, empty pending list and returned blob SHA. Spot-check original COMPLETE and FALSE_COMPLETE request IDs through `request_result`; compare current exact rows if assessing a job write. A migration result does not verify any new job updates.
6. Unfreeze through the existing `unfreeze_writer` action. Confirm live `writer_status` is readable, has no freeze and has no unresolved writes. Observe the next ordinary authorized write through intent, later-execution COMPLETE and exact-row readback. Do not invent a production mutation solely to test migration.
7. Record the actual deployed build, migration result, source/destination hashes, readbacks and remaining obligations in a new coordination receipt. Request the corresponding CONTROL/ENTRY update through the repository's create-only edit-request workflow; until cutover is verified, those authorities correctly still name Drive. The old Drive file is retained as evidence and must not be treated as a live fallback after cutover.

## Failures and recovery

- Conflict: stop and inspect both authorities. Do not retry automatically. Repeat dry run and deliberately approve the current destination revision only after reconciling who changed it.
- Missing token, HTTP failure or invalid GitHub state: fail closed. Repair access or restore an intact GitHub version with review and SHA protection. No fallback to an older Drive index.
- Seed PUT succeeded but readback/source switch failed: the Writer stays frozen; inspect both the current property and GitHub file. If still on Drive, repeat the migration with fresh hashes after checking the persisted seed. `ALREADY_MIGRATED` means the source is already GitHub; independently verify it rather than reseeding.
- After any GitHub-authoritative write, the old Drive index is stale. Never simply set `RECEIPT_INDEX_SOURCE=DRIVE`. Any rollback requires a freeze, an exact verified copy of the **current** authoritative GitHub index into Drive, pending-state reconciliation and a separately reviewed source switch. No automatic rollback endpoint is provided.
- `restore_receipt_index` repairs only the Drive source and is disabled through HTTP when GitHub is active.

The deployment operator owns cutover and live verification. A merged PR and seeded repo alone do not establish migration completion.
