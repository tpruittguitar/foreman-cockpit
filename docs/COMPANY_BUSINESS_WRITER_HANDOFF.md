# Complete company-business Writer connection

Status: prepared and tested; NOT applied to Code.gs, deployed, or activated.

PR #286 merged the pure adapters and trusted runtime helper. Current Code.gs still lacks the business_context route and trusted production intake/ENRICH caller wiring. This patch addresses only that remaining source connection; it does not complete live rollout or submit any dispositions.

## Owner handoff preserving current authentication

The patch is reconciled against main Code.gs Git blob fa6c3497240b1f6e4c2e272325f3cc1ec0bb7278. Unlike the earlier patch, it does not repeat already-merged adapter changes. It contains no credential or passphrase line. Full-file Code.gs publication remains blocked because that file contains an existing credential. No attempt to bypass that boundary has been made.

After checking out this draft branch in your own trusted checkout, run:

```sh
git hash-object apps-script/Code.gs
# Expected: fa6c3497240b1f6e4c2e272325f3cc1ec0bb7278
git apply --check docs/patches/company-business-writer-calls-current-main.patch
git apply docs/patches/company-business-writer-calls-current-main.patch
npm test
git diff --check
```

If the blob differs or apply check fails, stop and reconcile against the new main. Review and commit the Code.gs change yourself on this draft branch. The patch leaves the existing passphrase and authentication behavior unchanged. Do not include credential values in messages, logs or review comments. This is an owner-performed source edit, not permission for the assistant to upload the credential-bearing file.

Alternative: explicitly approve a separate source change to obtain the unchanged passphrase from a named Apps Script property rather than a hardcoded literal. That migration is not performed or included here, and would need configuration planning before deployment. No rotation is assumed.

## Validation and rollout boundaries

928 Node tests passed using fresh-main Code.gs with this patch in the existing adapter test checkout; the passphrase was replaced only in the isolated local test copy with a dummy value. This is not a full fresh-main checkout CI pass. Both single and batch production mutation callers, response propagation, intake context and HTTP route were asserted; reverse patch applicability passed. The existing supplier/discrete-manufacturing/unknown and protected-history flow tests passed. Browser validation, real Apps Script execution and live deployment were not performed.

COMPANY_BUSINESS_EXCLUSIONS_ENABLED stays off by default. Approved policy revision/definition and reviewed employer facts are still required, including a bound bulk-chemical/refining/raw-material rule before those categories can activate. ENRICH emits a proposal only; it does not change bucket/history. Actual dispositions, deployment and activation remain separate authorized steps. Independent provider/resurfacing consumers still require rollout verification.
