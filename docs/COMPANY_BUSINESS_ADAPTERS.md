# Company-business adapters (draft, disabled by default)

Companion to forge-coordination PR #359. The Writer intake planner, data-only ENRICH mutation result and active worklist builder now accept trusted optional business context. Unknown evidence preserves normal admission and work. Reviewed facts can exclude new intake, produce a disposition proposal after enrichment, and partition active worklists with explicit accounting. Existing canonical identities retain dedupe and protected-state handling. No ENRICH operation changes the bucket merely because the helper proposes exclusion.

`pipeline-business.js` and `apps-script/PipelineBusiness.gs` share the exact evaluator. `partition` is the common ranking/resurfacing adapter; existing ranking UI consumers are not yet connected. Do not describe this draft as complete rollout.

Activation is deliberately absent: no production caller supplies enabled business context. Input context must be loaded from the controlled reviewed employer reference and current canonical rules, never from request/candidate fields. Source digests are provenance bindings, not proof that arbitrary caller data is genuine. No raw product keyword classification is performed, and no extra network research is performed.

Remaining rollout requirements:
- Trusted runtime reader validating shared facts and current canonical policy, including global healthcare ruling and approved process-industry scope. Do not activate categories by listing their names in code.
- Thread the validated context through production callers. Include known facts on every request, not only new enrichment facts.
- Consume ENRICH proposals through existing authorized Writer disposition transactions, exact ID readback, locks and independent receipts. This PR does not submit those dispositions.
- Connect every recommendation/ranking/resurfacing consumer to partition, and persist explicit exclusion-pending accounting without silently dropping obligations.
- Full current-master/archive dry run, review of suppliers and Tim exceptions, then separately authorized merge/deploy and data action.

Validation: nine new flow tests invoke the actual intake planner, ENRICH mutation and worklist builder. Covered: confirmed exclusion, disabled/missing facts, policy-unbound process categories, discrete molding, malicious candidate context, existing identity, unchanged application history, queue accounting and shared recommendation partition semantics. Existing intake and worklist tests are included. The ranking partition test is a contract test, not a claim that all UI consumers are integrated.
