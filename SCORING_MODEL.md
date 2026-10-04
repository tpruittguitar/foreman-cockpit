# Tim weighted job-rating model

This is the shared scoring contract for Pipeline Explorer and every research or writing agent. Read it before evaluating a role, estimating fit, researching missing data, or drafting a cover letter.

## Enforcement and conflict resolution

This file is the governing scoring file. It supersedes older project rubrics, factor lists, `FLEX=LADDER` terminology, statements that scores may exceed 100, and any regional compensation gate that is not explicitly identified as a separate current pipeline rule. Do not combine two rubrics or silently average them. If this file cannot be opened, use the inline scoring block in the Claude project instructions; do not invent weights. If the inline block and this file disagree, stop and report the conflict rather than choosing a convenient rule.

The weighted rating is an assessment, not an automatic application decision. A hard business rule such as an explicit Tim decline, a dead posting, or a `STRICT` degree gate must be reported separately as a gate or risk. It must not be hidden inside an unexplained score adjustment.

## Authority and version

- Model ID: `TIM_WEIGHTED_JOB_RATING`
- Current default version: `2026-10-04.1`
- The published model in `PIPELINE_SCORING_MODEL.json` (read through the Writer `scoring` action) is canonical when it exists.
- A browser-local or agent-local model is a what-if draft only. Do not describe a local draft as Tim's current model.
- Never write a score into the canonical master unless the requested writer action explicitly permits it. Preserve the evidence fields that support each score.

## Current weights (100 points)

| Component | Weight | What it measures |
|---|---:|---|
| Experience / content fit | 25 | Match to Tim's manufacturing, operations, quality, launch, tooling, automation, and leadership experience |
| Degree FLEX | 23 | How much the degree requirement can be satisfied by experience or alternate paths |
| Compensation | 20 | Net value after salary floor, target, ceiling, and configurable state/cost factors |
| Geography | 23 | Distance-weighted preference from the configured location control points |
| ATS / resume match | 0 | Optional diagnostic; shown but does not affect the current total |
| Title / scope | 5 | Level, ownership, scope, and title alignment |
| Company culture | 2 | Evidence of operating style, values, and environment fit |
| Ownership / control | 2 | Decision authority, accountability, and ability to own outcomes |

Weights must total exactly 100. The Pipeline Scoring page is the place to adjust them and publish a new version.

## FLEX rules

FLEX is a weighted score input, not an automatic rejection, except `STRICT`.

- `HIGH_FLEX`: no degree requirement is stated, or the posting explicitly accepts equivalent experience/non-degree experience as a substitute. No degree gate is imposed. Default modifier `+15`; FLEX component score `80`.
- `SOFT_FLEX`: a degree is listed and an experience-equivalency path is also provided or clearly considered, but the degree remains the normal or preferred path. Default modifier `+6`; FLEX component score `62`.
- `NO_FLEX`: a degree is required and no experience-equivalency path is provided. Default modifier `-10`; FLEX component score `30`. Still pursue when adjusted fit is about 80+ and pay/title are clear.
- `STRICT`: a specific degree is required through one exclusive path, with no meaningful equivalency. FLEX component score `0`; hold unless Tim explicitly overrides.
- If the posting does not mention a degree, do not invent a degree gate. If the text is insufficient to determine whether experience is accepted, use `UNKNOWN`.
Always report the FLEX class, modifier, raw fit, adjusted fit, and evidence wording.

## Component evidence rules

1. Keep raw component scores separate from the overall rating. `UNKNOWN` is not the same as zero.
2. Salary must be labeled `POSTED`, `ESTIMATED`, or `UNKNOWN`, with the source or estimate basis and date.
3. Preserve a usable initiating URL (LinkedIn, job board, email click-through, aggregator, or ATS). Add the company/ATS URL when found; never discard the initiating link.
4. Geography uses the configured heat map/control points. Use the posting location, not a stale cached geocode or an inferred headquarters location. If the city/state conflicts with the URL, record the conflict for review.
5. Experience / content fit should explain the matched work content and domain evidence, not just title similarity.
6. ATS is a transparent proxy unless a real ATS result is supplied. The current weight is zero, but the diagnostic should still be calculated when role text and a selected resume exist.
7. Culture and ownership may remain `UNKNOWN` until there is evidence; do not use neutral placeholders as if they were researched facts.

## Formula

For the known components:

```text
weighted_mean = sum(component_score × component_weight) / sum(known_component_weights)
confidence = sum(known_component_weights) / 100
overall = weighted_mean × (0.70 + 0.30 × confidence)
```

The Pipeline app reports the FLEX effect as the difference between the calculated rating and the same rating with FLEX treated as neutral (50). A `STRICT` role is shown as `STRICT HOLD` unless Tim overrides it.

## Agent output minimum

For every evaluated role, return or store:

- overall rating, band, confidence, and model version;
- experience/content, FLEX, compensation, geography, ATS, title, culture, and ownership scores;
- FLEX class/modifier and exact degree evidence;
- salary type/value/basis and posting URL(s);
- missing fields and the next research action.

For cover letters, use the same model version and explicitly connect the letter's claims to the role's experience/content evidence. Do not let a cover letter invent salary, location, FLEX, culture, or ownership evidence.
