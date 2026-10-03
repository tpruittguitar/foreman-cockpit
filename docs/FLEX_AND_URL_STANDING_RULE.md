# Standing scoring and row rule — Tim, 2026-10-02

This directive supersedes conflicting FLEX and URL guidance. It introduces no bot or board. The fixed canonical master remains the sole population.

## FLEX

FLEX is degree flexibility, not remote/hybrid work. Raw scope fit means work content, experience, domain, and expertise alignment, on a 0–100 scale.

- HIGH_FLEX: reviewed requirements mention no degree, or explicitly accept experience instead. Modifier +15.
- SOFT_FLEX: degree listed and the same requirements block offers multiple degree-or-experience paths. Modifier +6.
- NO_FLEX: degree required without recorded equivalency. Modifier −10. Still consider pursuing if adjusted fit is 80+ and pay and title rules clear.
- STRICT: explicit strict classification or confirmed single required degree path without equivalency. Modifier −10 for transparent reporting; hold from pursuit regardless of fit unless Tim explicitly overrides with TIM_FLEX_OVERRIDE=YES.
- UNKNOWN: requirements not yet reviewed or missing. No favorable inference; modifier 0 pending research.

Adjusted fit = clamp(raw scope fit + FLEX modifier, 0, 100). Report class, modifier, raw fit, adjusted fit, evidence wording, and pursuit status. Apply pay floor and title rules afterward. Do not silently turn a modeled fit into verified evidence. Store unadjusted evidence in SCOPE_FIT_RAW; do not apply FLEX twice.

NO_FLEX and STRICT definitions overlap in the supplied brief. Do not infer STRICT merely from NO_FLEX; require the explicit classification or single-path confirmation. Existing applied/rejected history stays protected.

## URL provenance

Every new master row must carry a usable HTTP(S) URL. Preserve the exact initiating LinkedIn, Ladders, Indeed, Teal, email click-through, or ATS link in INITIATING_URL. A first-party ATS URL is not an admission gate.

SOURCE_URL is the usable working link. When a company link is found, retain the initiating link and add COMPANY_SOURCE_URL with its confidence/provenance. Unconfirmed company/ATS status must not hide the original link. INITIATING_URL is immutable through normal enrichment.

For existing URL-less rows, search recorded SOURCE, INTAKE_SOURCE_URL, MANUAL_INTAKE_URL, JOB_URL, CANONICAL_URL, REQ, and raw provenance first. Recover the initiating URL from original intake/email evidence when necessary. Never fabricate a URL, delete history, or duplicate the row to fix this defect. New records without a URL are held with SOURCE_URL_REQUIRED, visibly accounted as WRITE_FAILED; existing status updates remain possible.

Beehive Blue Ash and Centennial remain WATCH_ONLY / STRICT per Tim. Do not infer their master IDs from titles. Rows reported as 15, 162, and 244 need identity-confirmed URL recovery; row numbers alone are not stable IDs.
