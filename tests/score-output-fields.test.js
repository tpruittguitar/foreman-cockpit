// Governance: agents submit evidence, never calculated scores. The Explorer derives OVERALL_RATING, GEO_SCORE, NET_COMP_SCORE,
// EXPERIENCE_FIT, RATING_CONFIDENCE and FLEX_RATING_IMPACT from the published scoring model; the master never stores them.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const W = require('../apps-script/Code.gs'), P = require('../pipeline-parser.js'), G = require('./gen_population.js');

const TS = '2026-10-06T22:00:00.000Z';
const row = '293 | V2F-BBD6E922F6C8 | Ladders | Head of Product Quality | MANUAL_RESEARCH | RESOLVED/NEEDS_RESOLUTION | TIM_RESEARCH_2026-10-03 | LI-4467365988 | Remote, US | RESEARCH_OK; NOTIFICATION_SOURCE=LinkedIn; DATE_ADDED=2026-10-03';
const payload = line => W.parsePayload(line.split(' | ').slice(9).join(' | ')).payload;
const enrich = fields => W.mutateRow(row, { kind: 'ENRICH', ts: TS, actor: 'grok', requestId: 'GROK-RESCORE-1', fields });

test('ENRICH of a calculated score is rejected, names every offending field, and leaves the row untouched', () => {
  const r = enrich({ OVERALL_RATING: '88', GEO_SCORE: '70', NET_COMP_SCORE: '60', EXPERIENCE_FIT: '90', RATING_CONFIDENCE: '80', FLEX_RATING_IMPACT: '12', GROK_SALARY: 'POSTED $200k' });
  assert.equal(r.ok, false);
  assert.match(r.error, /^SCORE_OUTPUT_FIELD: /);
  for (const k of ['OVERALL_RATING', 'GEO_SCORE', 'NET_COMP_SCORE', 'EXPERIENCE_FIT', 'RATING_CONFIDENCE', 'FLEX_RATING_IMPACT']) assert.match(r.error, new RegExp(k));
  assert.doesNotMatch(r.error, /GROK_SALARY/, 'evidence fields in the same request are not blamed');
  assert.match(r.error, /submit the evidence fields instead/);
  assert.equal(r.after, undefined, 'nothing is written when any calculated score is present');
});

test('the check is case-insensitive and applies to a single field', () => {
  const r = enrich({ overall_rating: '88' });
  assert.equal(r.ok, false);
  assert.match(r.error, /OVERALL_RATING is a calculated score/);
});

test('evidence inputs the scorer reads, and agent-prefixed opinions, remain writable', () => {
  const r = enrich({ TITLE_SCORE: '85', ATS_MATCH_SCORE: '72', CULTURE_SCORE: '60', OWNERSHIP_SCORE: '55', SCOPE_FIT_RAW: '78', LEVEL_FIT: '80', CLAUDE_SCORE_GEO: '90', GROK_ADJUSTED_FIT: '99', CLAUDE_FIT: 'HIGH' });
  assert.equal(r.ok, true, r.error);
  const p = payload(r.after);
  assert.equal(p.TITLE_SCORE, '85'); assert.equal(p.ATS_MATCH_SCORE, '72'); assert.equal(p.SCOPE_FIT_RAW, '78'); assert.equal(p.CLAUDE_SCORE_GEO, '90');
});

test('Writer-derived FLEX_MODIFIER, ADJUSTED_FIT and PURSUIT_STATUS keep their existing behavior: the Writer overwrites an agent-supplied value from policy', () => {
  const r = enrich({ FLEX_CLASS: 'HIGH_FLEX', FLEX_MODIFIER: '99', SCOPE_FIT_RAW: '70', ADJUSTED_FIT: '1' });
  assert.equal(r.ok, true, r.error);
  const p = payload(r.after);
  assert.notEqual(p.FLEX_MODIFIER, '99', 'the Writer derives the modifier from the canonical policy');
  assert.equal(p.ADJUSTED_FIT, String(Math.min(100, 70 + Number(p.FLEX_MODIFIER))), 'adjusted fit = raw fit + derived modifier, clamped');
});

test('intake accepts only a fixed set of fact keys, so a calculated score sent with a new job is ignored: the job still enters and the score never reaches the master', () => {
  const master = G.generate(580, 7), lines0 = master.split('\n');
  const rules = W.parseRulesText(fs.readFileSync(path.join(__dirname, 'fixtures', 'TIM_NEVER_CONSIDER_RULES.sample.txt'), 'utf8'));
  const ctx = { run: { SCOUT_RUN_ID: 'RUN-SCORE-1', GROSS_FOUND: 1 }, now: '2026-10-06T22:00:00.000Z', nowET: '2026-10-06 18:00 ET' };
  const plan = W.planIntake(lines0, [{ COMPANY: 'Nova Forge Robotics', TITLE: 'Director of Manufacturing', LOCATION: 'Huntsville, AL', REQ_ID: 'GH-9999999001', SOURCE_URL: 'https://job-boards.greenhouse.io/novaforge/jobs/9999999001', OVERALL_RATING: '91', GEO_SCORE: '70' }], rules, ctx);
  assert.equal(plan.ok, true);
  assert.equal(plan.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  assert.equal(plan.newLines.length, 1);
  assert(!/OVERALL_RATING|GEO_SCORE/.test(plan.newLines.join('\n')), 'no calculated score reaches the master');
});
