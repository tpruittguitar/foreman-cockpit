# Company-business adapters (draft, disabled by default)

Companion to forge-coordination PR #359. The Writer intake planner, data-only ENRICH mutation result and active worklist builder now accept trusted optional business context. Unknown evidence preserves normal admission and work. Reviewed facts can exclude new intake, produce a disposition proposal after enrichment, and partition active worklists with explicit accounting. Existing canonical identities retain dedupe and protected-state handling. No ENRICH operation changes the bucket merely because the helper proposes exclusion.

`pipeline-business.js` and `apps-script/PipelineBusiness.gs` share the exact evaluator. `partition` is the common ranking/resurfacing adapter; the main Explorer now consumes it for active filters, Act now, mobile Decide, attention and displayed ranking scores. All live/search and history remain accessible. Other independent provider and queue consumers still need rollout verification.

Activation remains off by default. Production callers now load context through businessContext_ only when the existing Apps Script environment explicitly enables COMPANY_BUSINESS_EXCLUSIONS_ENABLED=true after approved deployment. No setting is changed by this PR. The loader requires authenticated GitHub canonical policy and the fixed forge-coordination/reference/EMPLOYER_BUSINESS_CLASSIFICATIONS.json source, exact policy revision, exact rule section/definition and captured-source excerpt digests. Missing/unverified sources disable exclusion and expose review status without blocking intake. No request fields select activation or source. Sources are read once per execution; browser contexts expire after 15 minutes and are never persisted as authority. No raw product keyword classification or extra employer website research is performed.

Remaining rollout requirements:
- Merge the reviewed fact bundle and approved policy binding in the correct sequence, then approve deployment and activation separately. Process-industry scope remains unbound and inactive until canonical policy has its stable identifier.
- Consume ENRICH proposals through existing authorized Writer disposition transactions, exact ID readback, locks and independent receipts. This PR does not submit those dispositions.
- Verify independent workers and all other recommendation/resurfacing consumers use the same source; persist explicit exclusion-pending accounting without silently dropping obligations. Main Explorer coverage is added here, but is not proof about every separate provider path.
- Full current-master/archive dry run, review of suppliers and Tim exceptions, then separately authorized merge/deploy and data action.

Validation: nine new flow tests invoke the actual intake planner, ENRICH mutation and worklist builder. Covered: confirmed exclusion, disabled/missing facts, policy-unbound process categories, discrete molding, malicious candidate context, existing identity, unchanged application history, queue accounting and shared recommendation partition semantics. Existing intake and worklist tests are included. The ranking partition test is a contract test, not a claim that all UI consumers are integrated.

## Latest validation

925 Node tests passed on the final code, including header-status hardening. Trusted-loader tests cover disabled configuration, fixed repository/path, current revision and exact definition, source failure, expiry and browser digest preparation. Read-only dry run over the complete 6,744-row downloaded master using only the four reviewed employers: 11 active disposition proposals and 15 preserved historical matches; no row writes. This is a full master scan against a four-employer sample, not exhaustive industry classification.

A desktop/phone Chromium regression test was added, with production requests blocked. Execution is blocked by the environment: Chromium cannot create its local socket (Operation not permitted), including the authorized escalated attempt. No browser pass or visual verification is claimed.
