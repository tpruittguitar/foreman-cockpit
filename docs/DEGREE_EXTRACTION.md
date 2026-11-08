# Degree evidence extraction

`apps-script/PipelineQualification.gs` is byte-identical to
`forge-coordination/tools/enrich-ats-pay/qualification.js`; the degree-extraction
JSON fixtures are mirrored in both repositories. Keep both copies synchronized.

`PipelineAts.degreeFromText` now uses that parser instead of returning the first
sentence. It keeps a degree requirement with its adjacent explicit
experience/substitution alternative, preserves governing preferred headings, and
does not mistake an equivalent field or an unrelated experience bullet for a
substitute. Mixed credential scope is left unresolved rather than guessed.

`fieldsFor` preserves the complete block in ATS_DEGREE_TEXT and, for a missing
canonical degree only, DEGREE_TEXT. The former 400-character prefix clip is removed.
Blocks over the shared 1,200-character limit are omitted, never truncated into a
hard-degree claim. Existing canonical degree values are not silently overwritten.
The Writer still determines FLEX and scoring under the existing policy. Its
mirrored Writer/Explorer parser recognizes explicit experience substitution for
the degree as equivalence, while rejecting negated substitutions and substitutions
for unrelated certifications.

The regression suite exercises shared fixtures through extraction and FLEX, a
late alternative beyond the old 400/500-character limits, existing-field
protection, oversized input, and Apps Script global loading without CommonJS.

This is a source change only. It does not deploy Apps Script, change schedules,
modify the master, or replay requests. Historical records require source-bound,
individually verified repair, not a blanket re-score. The companion coordination
PR documents the limited historical cache sample and independent degree parser-version
invalidation, including compatibility with the successful-posting cache in PR #312.
