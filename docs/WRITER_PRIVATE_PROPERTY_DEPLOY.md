# Private Writer credential deployment preflight

The Writer credential now belongs in the Apps Script project's `WRITER_PASSPHRASE` Script Property, not source code. Preserve its existing value. Setting the property does not by itself deploy code or change the current web-app version.

Before an independently authorized deployment:

1. Read the private property back in the correct Apps Script project and verify that its value exactly matches the existing live Writer credential. Do not log or paste it into repository files or messages. The ordinary Apps Script project REST API does not expose Script Properties, so this check is separate from `deploy.sh`.
2. Supply that same credential privately through the process environment as `WRITER_PASSPHRASE`. Do not put its value in a shell command, CLI argument, or checked-in environment file. A silent interactive shell prompt or authorized secret manager can populate it.
3. Set `WRITER_PRIVATE_PROPERTY_VERIFIED=1` only after the first step. This is an operator attestation, not an automatic API verification of the property. Missing attestation or credential stops deployment.
4. Run `apps-script/deploy.sh` only with separate deployment authorization. `--head` still mutates project source and requires authorization; it does not switch the published web-app version.
5. Clear the credential from the process environment when finished.

On the first migration, preflight compares the supplied credential to the existing live literal without printing either. Ambiguous literal formats and mismatches stop before project mutation. On subsequent deployments, preflight recognizes property-based live source. In both modes, the authenticated live state-merge check is mandatory before `set-content`, even if the older `SKIP_STATE_CHECK` variable is set. That read proves the supplied credential works against the currently deployed version; during the first migration it does **not** prove the new property exists. Independent property readback is therefore required.

Deployment copies repository `.gs` source without inserting a literal credential. It rejects literal passphrase assignments, keeps temporary live source private, and passes the authentication value to the state check through the environment rather than command arguments. It does not create, rotate, or edit the Script Property.

After the separately authorized deployment, verify authenticated access with the unchanged credential and confirm the expected Writer build/version. Keep the previous deployment version available for rollback. Do not delete the private property during rollback. No deployment or property-setting action is performed by this document or its tests.
