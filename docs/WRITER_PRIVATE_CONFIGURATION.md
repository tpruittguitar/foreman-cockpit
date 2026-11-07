# Private Writer configuration separation

Status: source-only draft. DO NOT MERGE OR DEPLOY until configuration migration, private caller configuration, and rollout checks are verified under the required approvals. No property migration, credential rotation, scope change, trigger change, live data change, or deployment has been performed.

## Runtime contract

Code.gs loads one complete Script Properties snapshot at initialization, before any HTTP handler or installed trigger can execute. Missing/unreadable properties, an unsupported configuration version, an empty/placeholder passphrase, invalid IDs, or equal active/frozen master IDs stop initialization with a generic error. There is no embedded credential, literal target fallback, environment fallback, or production test fixture.

Required Script Property names (values intentionally omitted):

- WRITER_CONFIG_VERSION: schema version `1`.
- WRITER_PASSPHRASE.
- WRITER_MASTER_ID.
- WRITER_FROZEN_MASTER_ID.
- WRITER_CANONICAL_RULES_DOC_ID.
- WRITER_DOCS_ROOT_ID.
- WRITER_RESUMES_FOLDER_ID.
- WRITER_COVER_LETTERS_FOLDER_ID.
- WRITER_SUPPORTING_DOCS_FOLDER_ID.
- WRITER_TIM_VOICE_FOLDER_ID.
- WRITER_INTERVIEW_NOTES_FOLDER_ID.

IDs must be 10–200 ASCII letters, digits, underscores, or hyphens. The passphrase must be a nonblank string no longer than 2048 characters and cannot be a placeholder. Validation does not verify ownership or prove a target is the intended canonical file. Authorized migration must preserve exact existing active/frozen master and folder targets and verify them independently. The active and frozen master guards remain enforced.

The manual `checkWriterRuntimeConfiguration` function returns only a schema/version and configured status. It never logs or returns property values. No automatic migrator or property-writing helper is included.

## Security approval and deployment gate

Configuring an existing authentication credential for persistent use requires separate action-time security approval. Source preparation and draft publication do not authorize that step. One sufficiently specific action-time approval may cover the exact migration/security operation; do not ask again for an unchanged approved action. Do not copy values into this repository, chat, issue, PR, CI logs, browser defaults, or a deployment command line.

Both legacy deployment scripts are disabled without a bypass flag. In particular, `--head` is not a safe staging shortcut: installed triggers execute current project HEAD. The Apps Script project-content API does not expose Script Properties, so a source upload or an environment acknowledgement cannot certify migration.

Before any later code upload or deployment:

1. Obtain explicit approval for the exact project, existing credential, private target settings, persistent configuration change, and rollback plan. Use the supported secure credential flow. Do not create credentials, expand scopes, or install access grants as a side effect.
2. Under that approval, migrate the existing settings privately. Preserve the intended targets and frozen-master prohibition. Verify every required property's exact value and the distinct active/frozen targets through an authorized private readback. Do not print or publish the readback.
3. Confirm all existing triggers and their HEAD behavior. Confirm the existing manifest scopes are sufficient without expanding them automatically. Preserve the currently deployed project/version for rollback.
4. Restore a reviewed deployment path only after verified migration and within the authorized release scope. Script/deployment identifiers must come from approved private configuration, not published source. A flag or file claiming migration is done is insufficient verification.
5. Only after approved upload/deployment, verify authenticated and rejected-key behavior, generic configuration errors, installed-trigger health, exact-source metadata freshness, and independent state/readback checks. Report status only, not configuration values.

These steps are a gated plan, not instructions to run now. Missing configuration intentionally disables runtime execution; uploading before migration would interrupt the Writer and triggers.

## Frontend and caller compatibility

pipeline-connection.js contains empty URL/key defaults. Explicitly saved browser settings remain untouched. New browsers and existing browsers that relied on bundled defaults without saving a connection require the user to enter the private connection through the existing setup flow. This change does not automatically save authentication information.

Existing coordination callers including tools/source-trial/run.js and tools/pipeline-observability/process-flow.js previously extracted the public default key; board-discovery/source-trial workflows may also lack private Writer environment settings. They must use an explicitly approved private configuration source before rollout. The Writer impact tool now reads only WRITER_URL / WRITER_KEY environment configuration when live data is requested. Without those values it reports NOT_RUN and performs no live request; that is not an impact pass. Offline `--master`, `--rules`, and `--model` fixtures remain supported. No CI secret is created or configured here. The external coordination tools/relevance-screen/coordinator.cjs also imports pure helpers from Code.gs; it must use a separately reviewed pure-helper module before rollout. Do not supply synthetic Apps Script credentials to production Node callers. The supported intake CLI has been decoupled from Code.gs; its row-proof hash is parity-tested, and the isolated benchmark explicitly loads synthetic fixtures.

## Publication and residual exposure

Review complete changed files, not only diff hunks. Publish only a clean sanitized snapshot commit on remote main. Do not push the local preparation history containing credential-bearing Writer source, even after a later cleanup commit.

Removing current source copies does not erase existing Git history or invalidate an exposed credential. No history rewrite or credential rotation is included. Any rotation, redistribution, saved-setting update, or history remediation requires a separate authorized plan.

Other existing repository files and history may retain prior non-secret target references. This change does not republish those unchanged files or claim repository-wide history sanitization.
