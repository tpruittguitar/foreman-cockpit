// REV-046 company preference (Tim 2026-10-19 02:43 ET): DREAM tier above P1 on Companies Priority; Shield AI matched on a normalised
// name; priority raises rank only and never overrides a pay hold, FLEX, scope or a hard no.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const S = require('../pipeline-scoring'), P = require('../pipeline-policy'), T = require('../pipeline-target-companies');
const RULES = 'SECTION=TARGET_COMPANIES\nTARGET_COMPANY={"company":"Shield AI","aliases":["ShieldAI","shield.ai","Shield AI Inc."],"priority":"DREAM"}\nTARGET_COMPANY={"company":"Tesla","priority":"P1"}\n';
const list = S.targetCompaniesFromRules(RULES), cfg = S.normalize({ targetCompanies: list });
const cul = co => S.scoreRow({ COMPANY: co, TITLE: 'Director of Manufacturing', LOCATION: 'Dallas, TX', payload: {} }, cfg).parts.culture;

test('tiers: DREAM 100 · P1 90 · P2 80 · P3 70 · WATCH 60 · unlisted 40', () => {
  assert.deepEqual(['Shield AI', 'Tesla', 'Raytheon'].map(c => cul(c).score), [100, 90, 40]);
  assert.equal(cul('Shield AI').basis, 'Target company DREAM · Shield AI');
});

test('Shield AI matches on a normalised name', () => {
  ['Shield AI', 'Shield AI Inc.', 'shield.ai', 'ShieldAI', 'SHIELD AI, INC'].forEach(n => assert.equal(cul(n).score, 100, n));
  assert.equal(cul('Shieldwall Systems').score, 40, 'a different company is not matched');
});

test('separate company boosts: DREAM +10 and P1 +3 on the overall score (Tim 08:5x ET); at weight 5 without them DREAM and P1 tie', () => {
  const row = co => ({ COMPANY: co, TITLE: 'Director of Manufacturing', LOCATION: 'Nashville, TN', payload: { SALARY_BASE_POSTED: '$220,000', SCOPE_FIT_RAW: '80', DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience' } });
  const W = { experience: 35, flex: 30, compensation: 25, geo: 0, ats: 0, title: 5, culture: 5, ownership: 0 };   // published rev 26
  const off = S.normalize({ targetCompanies: list, weights: W, companyBoost: { DREAM: 0, P1: 0 } });
  assert.equal(S.scoreRow(row('Shield AI'), off).overall, S.scoreRow(row('Tesla'), off).overall, 'no boost: DREAM vs P1 is 0.5 point, a tie');
  const on = S.normalize({ targetCompanies: list, weights: W });   // defaults DREAM +10, P1 +3
  const s = c => S.scoreRow(row(c), on);
  assert.deepEqual([s('Shield AI').companyBoost.points, s('Tesla').companyBoost.points, s('Raytheon').companyBoost.points], [10, 3, 0]);
  assert.equal(s('Shield AI').overall, s('Shield AI').companyBoost.weighted + 10);
  assert.ok(s('Shield AI').overall > s('Tesla').overall && s('Tesla').overall > s('Raytheon').overall);
  const tuned = S.normalize({ targetCompanies: list, weights: W, companyBoost: { DREAM: 15, P1: 0 } });
  assert.deepEqual([S.scoreRow(row('Shield AI'), tuned).companyBoost.points, S.scoreRow(row('Tesla'), tuned).companyBoost.points], [15, 0], 'each boost is its own setting');
  const B = require('../pipeline-breakdown'), b = B.breakdown(s('Shield AI'));
  assert.equal(b.rows[b.rows.length - 1].name, 'Company boost · DREAM');
  assert.equal(Math.round(b.sum), s('Shield AI').overall, 'breakdown total still reads to the ring');
});

test('priority never overrides a pay hold, FLEX or a hard no: the decision is the same at every tier', () => {
  const pol = P.normalizeFlexPolicy({});
  ['BELOW_PAY_WORTH_3', 'PASS_PAY_WORTH_80'].forEach(floor => ['Shield AI', 'Raytheon'].forEach(co => {
    const d = S.scoreRow({ COMPANY: co, TITLE: 'Plant Director', LOCATION: 'Chicago, IL', payload: { FLOOR_STATUS: floor, TITLE_RULE_STATUS: 'PASS', SCOPE_FIT_RAW: '85', DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience' } }, Object.assign({}, cfg, { flexPolicy: pol })).assessment.decision;
    assert.equal(d, floor[0] === 'B' ? 'PAY_OR_TITLE_HOLD' : 'PURSUE_CANDIDATE', co + ' ' + floor);
  }));
});

test('Companies registry keeps DREAM, writes it to the rules, and the drawer shows it in words', () => {
  const r = T.normalizeRegistry({ companies: [{ company: 'Shield AI', priority: 'dream' }] });
  assert.equal(r.companies[0].priority, 'DREAM');
  assert.match(T.sectionText(r), /"priority":"DREAM"/);
  assert.match(T.sectionText(r), /DREAM 100, P1 90, P2 80, P3 70, WATCH 60, unlisted or PAUSED 40\) and a separate company boost on the overall score \(DREAM \+10, P1 \+3/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
  assert.match(src, /function companyChip_\(sc\)\{[^\n]*>COMPANY '\+m\[1\]\+' · '\+esc\(m\[2\]\)\+\(bp\?' · \+'\+bp:''\)/);
  assert.match(src, /\+payWorthChip_\(sc\)\+companyChip_\(sc\)/);
});

test('Companies tip and the rules text it writes follow the live company-boost setting, listing only tiers above zero (Tim 08:53 ET)', () => {
  const r = T.normalizeRegistry({ companies: [{ company: 'Shield AI', priority: 'DREAM' }] });
  const rules = b => T.sectionText(r, b).match(/WATCH 60, unlisted or PAUSED 40\)(.*?)\. It never overrides/)[1];
  assert.equal(rules({ DREAM: 10, P1: 3 }), ' and a separate company boost on the overall score (DREAM +10, P1 +3; scoring model companyBoost)');
  assert.equal(rules({ DREAM: 15, P1: 0 }), ' and a separate company boost on the overall score (DREAM +15; scoring model companyBoost)');
  assert.equal(rules({ DREAM: 0, P1: 0 }), '', 'no boost above zero: no boost clause');
  assert.match(T.tipText({ DREAM: 15, P1: 0 }), /Paused 40\) plus a separate boost on the overall score \(Dream \+15\)\. It never/);
  assert.doesNotMatch(T.tipText({ DREAM: 15, P1: 0 }), /P1 \+/);
  assert.match(T.tipText({ DREAM: 0, P1: 0 }), /Paused 40\)\. It never/);
  assert.equal(T.tipText(), T.tipText({ DREAM: 10, P1: 3 }), 'no setting = the model defaults');
  const text = 'STATUS=ACTIVE\nSECTION=CORE\n- keep\nEND TIM_PIPELINE_RULES_CANONICAL';
  assert.match(T.setRules(text, r, { DREAM: 15, P1: 0 }), /\(DREAM \+15; scoring model companyBoost\)/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'pipeline-target-companies.js'), 'utf8');
  assert.doesNotMatch(src, /\+10|\+3\b/, 'no boost numbers typed into the Companies module');
  assert.match(src, /setRules\(j\.text\|\|'',draft,liveBoost\(\)\)/);
  assert.match(src, /esc\(tipText\(liveBoost\(\)\)\)/);
  assert.match(src, /S\.scoringCanonical\|\|S\.scoring/);
});
