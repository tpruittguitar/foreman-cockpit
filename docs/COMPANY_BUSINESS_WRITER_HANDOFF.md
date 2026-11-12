# Company business Writer connection status

PR #287 now connects the trusted company-business context HTTP route and production intake and single/batch ENRICH callers. Responses carry the business decision. The earlier owner-applied patch is superseded by the implemented source changes; do not apply it again.

## Private authentication

The owner approved keeping the existing passphrase unchanged while moving it to the `WRITER_PASSPHRASE` Script Property. `Code.gs` contains only the property lookup, with no hardcoded fallback. Missing or unreadable settings reject authentication. See [private-property deployment preflight](WRITER_PRIVATE_PROPERTY_DEPLOY.md) for continuity checks. No passphrase value belongs in this repository or coordination documents.

The existing deployed version remains unchanged until a separately authorized deployment. Private-property setup and source publication are not proof of live adoption. No merge or deployment is authorized by this status document.

## Validation and rollout

The local suite includes private-property authentication, missing-setting fail-closed, authenticated context routing, production caller wiring and deployment preflight tests, as well as the existing supplier, discrete-manufacturer, unknown and protected-history cases. Check the PR for final test and CI results.

Company-business exclusion remains default-disabled. Reviewed fact provenance and exact current policy bindings are still required, including an approved bulk-chemical/refining/raw-material binding. ENRICH returns a disposition proposal only and does not change history or bucket because of that proposal. Actual dispositions, independent consumer verification, deployment and activation remain separate authorized steps. No live row effects are claimed.
