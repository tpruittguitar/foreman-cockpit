# Tim weighted job-rating model

This is the shared scoring contract for Pipeline Explorer and every research or writing agent. Read it before evaluating a role, estimating fit, researching missing data, or drafting a cover letter.

## Enforcement and conflict resolution

This file is the governing scoring file. It supersedes older project rubrics, factor lists, `FLEX=LADDER` terminology, statements that scores may exceed 100, and any regional compensation gate that is not explicitly identified as a separate current pipeline rule. Do not combine two rubrics or silently average them. If this file cannot be opened, use the inline scoring block in the Claude project instructions; do not invent weights. If the inline block and this file disagree, stop and report the conflict rather than choosing a convenient rule.

The weighted rating is an assessment, not an automatic application decision. A hard business rule such as an explicit Tim decline, a dead posting, or a `STRICT` degree gate must be reported separately as a gate or risk. It must not be hidden inside an unexplained score adjustment.

## Authority and version

- Model ID: `TIM_WEIGHTED_JOB_RATING`
- Current default version: `2026-10-14.1` (2026-10-14: title folded into experience, culture fed by the Target Companies list, compensation curve anchored on target, fit anchors added)
- The published model in `PIPELINE_SCORING_MODEL.json` (read through the Writer `scoring` action) is canonical when it exists.
- A browser-local or agent-local model is a what-if draft only. Do not describe a local draft as Tim's current model.
- Never write a score into the canonical master unless the requested writer action explicitly permits it. Preserve the evidence fields that support each score.
- The Writer enforces this: an ENRICH, ruling or upsert that sets `OVERALL_RATING`, `EXPERIENCE_FIT`, `GEO_SCORE`, `NET_COMP_SCORE`, `RATING_CONFIDENCE` or `FLEX_RATING_IMPACT` is rejected with `SCORE_OUTPUT_FIELD` and nothing is written. The Explorer calculates these from the published model, so a stored copy could only drift. Submit the evidence instead: `FLEX_CLASS` or the degree evidence, `SCOPE_FIT_RAW`, salary evidence, location, and the evidence inputs `TITLE_SCORE`, `ATS_MATCH_SCORE`, `CULTURE_SCORE`, `OWNERSHIP_SCORE`. The Writer itself derives `FLEX_MODIFIER`, `ADJUSTED_FIT` and `PURSUIT_STATUS` from the canonical FLEX policy whenever FLEX or fit evidence is written, so a value an agent supplies for them is replaced.

## Current weights (100 points)

| Component | Weight | What it measures |
|---|---:|---|
| Experience / content fit | 40 | Match to Tim's manufacturing, operations, quality, launch, tooling, automation, and leadership experience |
| Degree FLEX | 30 | How much the degree requirement can be satisfied by experience or alternate paths |
| Compensation | 15 | Net value after salary floor, target, ceiling, and configurable state/cost factors |
| Geography | 10 | Distance-weighted preference from the configured location control points |
| Company culture / preference | 5 | Explicit culture evidence when recorded; otherwise the employer's tier on Tim's Target Companies list |
| ATS / resume match | 0 | Optional diagnostic; shown but does not affect the current total |
| Title / scope | 0 | Level and title alignment; folded into experience because the title heuristic scored nearly every target role 85–90 |
| Ownership / control | 0 | Decision authority, accountability, and ability to own outcomes |

These are the code defaults. The published model (Scoring screen) governs when it exists.

Weights must total exactly 100. The Pipeline Scoring page is the place to adjust them and publish a new version.

## FLEX rules

FLEX is a weighted score input, not an automatic rejection, except `STRICT`.

- `HIGH_FLEX`: no degree requirement is stated, or the posting explicitly accepts equivalent experience/non-degree experience as a substitute. No degree gate is imposed. Default modifier `+15`; FLEX component score `80`.
- `SOFT_FLEX`: a degree is listed and an experience-equivalency path is also provided or clearly considered, but the degree remains the normal or preferred path. Default modifier `+6`; FLEX component score `62`.
- `NO_FLEX`: a degree is required and no experience-equivalency path is provided. Default modifier `-10`; FLEX component score `30`. Still pursue when adjusted fit is about 80+ and pay/title are clear.
- `STRICT`: a specific degree is required through one exclusive path, with no meaningful equivalency. FLEX component score `0`; hold unless Tim explicitly overrides.
- If the posting does not mention a degree, do not invent a degree gate. If the text is insufficient to determine whether experience is accepted, use `UNKNOWN`.
Always report the FLEX class, modifier, raw fit, adjusted fit, and evidence wording.

## Experience fit anchors (`SCOPE_FIT_RAW`)

Experience fit carries the largest weight, so use the full 0–100 range. Anchor every rating to these levels and state the anchor in the basis text:

| Score | Meaning |
|---:|---|
| 95–100 | Tim has done this exact job: same function, level, plant-floor scope and industry type (for example plant-wide quality, torque/fastening or launch leadership at an OEM or tier-1 greenfield). |
| 85–94 | Same function and level; the industry or product differs, and his experience transfers directly. |
| 70–84 | Strong overlap on most duties; one material gap such as a new domain, a larger P&L, or a function he has supported without owning. |
| 50–69 | Partial overlap; several duties sit outside his record. |
| 30–49 | Adjacent role; the title matches and the work content mostly does not. |
| 0–29 | Different function. |

When the employer is hidden behind a recruiter, rate only what the posting text supports, and cap the rating at 84 until the client and scope are known.

## Company culture / preference

1. Explicit `CULTURE_SCORE` evidence on the row wins.
2. Otherwise the employer is matched (name or alias) against `SECTION=TARGET_COMPANIES` in the canonical rules: P1 100, P2 90, P3 75, WATCH 60.
3. A named employer that is not on the list, or is PAUSED, scores 40.
4. A recruiter posting with a hidden, confidential or stealth client is `UNKNOWN`, because the real employer may be on the list.

Target Companies stay in the canonical rules. They are never copied into the published scoring model.

## Compensation curve

The salary midpoint is multiplied by the state factor, then scored on a two-segment line: 0 at or below the floor, 50 at the target, 100 at or above the ceiling. With the current settings ($160k / $220k / $320k): $190k scores 25, $220k scores 50, $270k scores 75.

A posting that states only a ceiling ("up to $350k") is a ceiling. Record `SALARY_LABEL=ESTIMATED` for any low end or midpoint derived from it, and give the basis.

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

For every evaluated role, return in your run report (or, if you need to keep it with the row, store under your own prefix such as `CLAUDE_SCORE_GEO` or `GROK_ADJUSTED_FIT`, never under the canonical score names above):

- overall rating, band, confidence, and model version;
- experience/content, FLEX, compensation, geography, ATS, title, culture, and ownership scores;
- FLEX class/modifier and exact degree evidence;
- salary type/value/basis and posting URL(s);
- missing fields and the next research action.

For cover letters, use the same model version and explicitly connect the letter's claims to the role's experience/content evidence. Do not let a cover letter invent salary, location, FLEX, culture, or ownership evidence.

## Changing the model: review, publish, restore

Weights, salary anchors, location points and keywords change only through the Scoring screen, in three steps:

1. **Edit** a local draft. Nothing is shared and the ratings you see do not change.
2. **Review & publish** shows what you changed in plain words and the effect on the ranked jobs: how many move up and down, the average rating change, band changes, the top 10 before and after, and the largest rank moves. Nothing is saved until you press Publish. Publish is disabled when no setting differs from the published model.
3. **Publish** validates the weights (total 100), saves the model as the next revision, and reads the saved file back to verify it. Every viewer and every agent that reads the `scoring` action then uses it. No job row is rewritten. The System panel shows the live revision, version, time and author.

To undo, press **Restore revision N**: it loads the previous revision's settings and sends them through the same review, and publishing creates a new revision with the old settings. The Writer also keeps the previous model in the scoring history line for each publish.
