# Product context

`reference/COMPANY_SITE_PRODUCTS.json` in forge-coordination is the shared factual reference. It groups products by employer and location, with facility name, official/public source URLs, confirmed status and verification date. It is not a second job population. Unknown sites form a deduplicated research worklist.

The same pure `pipeline-products.js` matcher is used by the details panel and the programmed enrichment worker. Only a unique confirmed employer/location match less than 180 days old can fill a blank Product. Company suffixes and state names normalize; different cities, state-only locations and ambiguous matches do not. Existing master Product evidence wins. Sources identify company/location output, not an assertion that the job is assigned to that particular product line.

The details panel shows Product beneath the rating, with facility, source and as-of date. A live reference lookup can supply context before a Writer update has propagated, including protected historical jobs. Missing evidence is visibly Not yet researched; product context does not introduce another readiness gate.

The existing pay/enrichment worker copies confirmed facts through ENRICH with PRODUCT, PRODUCT_SCOPE, PRODUCT_SITE, PRODUCT_SOURCE, PRODUCT_ASOF and PRODUCT_REFERENCE. It preserves the fresh-row guards, does not overwrite already known products or alter job state, and retains unknown company/location groups for one-time research. No AI call is needed for matching, propagation, counters or maintenance scheduling. AI is reserved for interpreting new uncertain sources.
