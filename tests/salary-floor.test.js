// SALARY RULE (Tim 2026-10-19 01:34 ET; Grok W1 / W2 / W9): an estimated salary is real pay for the floor check and decisions.
// Hold on pay only when the floor check is BELOW; PAY UNKNOWN / no floor status only with no posted pay and no estimate.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const S = require('../pipeline-scoring'), P = require('../pipeline-policy'), R = require('../pipeline-rules'), W = require('../apps-script/Code.gs');
const live = fs.readFileSync(path.join(__dirname, 'settings-stick.test.js'), 'utf8').match(/const LIVE=('(?:[^'\\]|\\.)*');/)[1];
const policy = Object.assign({}, P.normalizeFlexPolicy(R.flexPolicy(eval(live))), { _SCORING_MODEL: S.defaults() });
const fl = (LOCATION, payload) => S.floorStatus({ LOCATION, payload });

test('floor check uses COMPENSATION_GEOGRAPHY: bands, rings, Florida, Chicago metro + NW Indiana', () => {
  const est = v => ({ SALARY_BASE_EST: v, SALARY_BASIS: 'EMPLOYER_COMPARABLE_ESTIMATE', SALARY_CONF: 'LOW' });
  assert.equal(fl('Huntsville, AL', est('$185,000')).status, 'PASS_RING_0_150_180K');
  assert.equal(fl('Nashville, TN', est('$185,000')).status, 'BELOW_RING_151_250_190K');
  assert.equal(fl('Austin, TX', est('$205,000')).status, 'PASS_RING_251PLUS_200K');
  assert.equal(fl('Detroit, MI', est('$290,000')).status, 'BELOW_BAND2_300K');
  assert.equal(fl('Aurora, IL', est('$310,000')).status, 'PASS_BAND2_300K', 'Chicago metro is Band 2');
  assert.equal(fl('Gary, IN', est('$290,000')).status, 'BELOW_BAND2_300K', 'NW Indiana is Band 2');
  assert.equal(fl('Pensacola, FL', est('$205,000')).status, 'BELOW_FL_210K');
  assert.equal(fl('San Francisco, CA', est('$350,000')).status, 'BELOW_BAND1_400K');
  assert.equal(fl('Manteno, IL', est('$205,000')).status, 'PASS_ANY_RING_200K', 'downstate IL is the normal ring; city not located -> bracket');
  assert.equal(fl('Tullahoma, TN', est('$185,000')).status, 'CHECK_RING_180K_200K', 'between the ring floors with no precise location');
  assert.equal(fl('Remote', est('$170,000')).status, 'BELOW_ANY_RING_180K');
  assert.equal(fl('Chattanooga, TN', { SALARY_BASE_EST: '$185,000', DRIVE_MILES_HOME: '200' }).status, 'BELOW_RING_151_250_190K', 'recorded driving miles win');
});

test('an estimate and a posted figure give the same floor status; no figure gives none', () => {
  assert.equal(fl('Huntsville, AL', { SALARY_BASE_EST: '$200,000' }).status, fl('Huntsville, AL', { SALARY_BASE_POSTED: '$200,000' }).status);
  assert.equal(fl('Huntsville, AL', { SALARY_MIDPOINT: '$200,000' }).status, 'PASS_RING_0_150_180K', 'Forge estimate lane midpoint counts');
  assert.equal(fl('Huntsville, AL', {}).status, null);
});

test('an agent-written FLOOR_STATUS stands; the Writer refreshes only its own', () => {
  const a = fl('Huntsville, AL', { SALARY_BASE_EST: '$170,000', FLOOR_STATUS: 'CLEARS_HUNTSVILLE_180K' });
  assert.deepEqual([a.status, a.derived], ['CLEARS_HUNTSVILLE_180K', false]);
  const w = fl('Huntsville, AL', { SALARY_BASE_EST: '$170,000', FLOOR_STATUS: 'PASS_RING_0_150_180K', FLOOR_BASIS: 'WRITER_DERIVED · old' });
  assert.deepEqual([w.status, w.derived], ['BELOW_RING_0_150_180K', true]);
});

test('PASS regex is anchored: UNCLEAR is not a pass', () => {
  const base = { DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience', TITLE_RULE_STATUS: 'PASS', SCOPE_FIT_RAW: '85' };
  assert.equal(P.assess(Object.assign({}, base, { FLOOR_STATUS: 'UNCLEAR' }), 85, policy).decision, 'CHECK_PAY_AND_TITLE');
  assert.equal(P.assess(Object.assign({}, base, { FLOOR_STATUS: 'CLEARS_251PLUS_200K' }), 85, policy).decision, 'PURSUE_CANDIDATE');
  assert.equal(P.assess(Object.assign({}, base, { FLOOR_STATUS: 'BELOW_RING_0_150_180K' }), 85, policy).decision, 'PAY_OR_TITLE_HOLD');
});

test('decision: estimated pay above the floor -> PURSUE_CANDIDATE, below -> PAY_OR_TITLE_HOLD, same as posted', () => {
  const row = pay => ({ COMPANY: 'Acme', TITLE: 'Plant Director', LOCATION: 'Huntsville, AL', payload: Object.assign({ DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience', TITLE_RULE_STATUS: 'PASS', SCOPE_FIT_RAW: '85' }, pay) });
  const cfg = Object.assign({}, S.defaults(), { flexPolicy: policy });
  assert.equal(S.scoreRow(row({ SALARY_BASE_EST: '$210,000-$230,000', SALARY_CONF: 'LOW' }), cfg).assessment.decision, 'PURSUE_CANDIDATE');
  assert.equal(S.scoreRow(row({ SALARY_BASE_POSTED: '$210,000-$230,000' }), cfg).assessment.decision, 'PURSUE_CANDIDATE');
  assert.equal(S.scoreRow(row({ SALARY_BASE_EST: '$150,000', SALARY_CONF: 'LOW' }), cfg).assessment.decision, 'PAY_OR_TITLE_HOLD');
  assert.equal(S.scoreRow(row({}), cfg).assessment.decision, 'CHECK_PAY_AND_TITLE', 'no figure: the floor check cannot pass');
});

test('Writer: deriveWriterScores_ writes FLOOR_STATUS + FLOOR_BASIS it derived; an agent value is left alone', () => {
  const run = Pl => { const out = Object.assign({}, Pl); W.deriveWriterScores_(['', '', 'Acme', 'Plant Director', 'READY_TO_PURSUE', '', '', '', 'Huntsville, AL'], Pl, (k, v) => { out[k] = v; }, policy); return out; };
  const d = run({ SALARY_BASE_EST: '$210,000', DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience', TITLE_RULE_STATUS: 'PASS', SCOPE_FIT_RAW: '85' });
  assert.equal(d.FLOOR_STATUS, 'PASS_RING_0_150_180K');
  assert.match(d.FLOOR_BASIS, /^WRITER_DERIVED · base mid \$210,000 from SALARY_BASE_EST/);
  assert.equal(d.PURSUIT_STATUS, 'PURSUE_CANDIDATE');
  const a = run({ SALARY_BASE_EST: '$210,000', FLOOR_STATUS: 'CLEARS_HUNTSVILLE_180K', DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience' });
  assert.equal(a.FLOOR_STATUS, 'CLEARS_HUNTSVILLE_180K', 'agent value untouched');
  assert.equal(a.FLOOR_BASIS, undefined);
  const none = run({ DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience' });
  assert.equal(none.FLOOR_STATUS, undefined, 'no figure, no Writer floor status');
});

test('Writer intake (W1) keeps the estimate and its basis', () => {
  const out = W.sanitizeRecord({ COMPANY: 'Acme', TITLE: 'Plant Director', SALARY_BASE_EST: '$74K-$116K', SALARY_BASIS: 'THIRD_PARTY_ESTIMATE', SALARY_CONF: 'LOW', SALARY_SOURCE: 'Glassdoor estimate (email)', SALARY_ASOF: '2026-10-17', SALARY_BASE_LOW: '$74,000', SALARY_BASE_HIGH: '$116,000', SALARY_MIDPOINT: '$95,000' });
  for (const k of ['SALARY_BASE_EST', 'SALARY_BASIS', 'SALARY_CONF', 'SALARY_SOURCE', 'SALARY_ASOF', 'SALARY_BASE_LOW', 'SALARY_BASE_HIGH', 'SALARY_MIDPOINT']) assert.ok(out[k], k + ' kept');
});

test('data discovery (W9): SALARY is not a default research field when the row already has a figure', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
  assert.match(src, /hasPay=row\.payload&&PipelineEvidence\.salary\(row\.payload\)\.mid!=null/);
  assert.match(src, /\(hasPay\?\['SOURCE_URL','FLEX'\]:\['SALARY','SOURCE_URL','FLEX'\]\)/);
});

test('floor parse: DC is not Washington state, Greater Chicago is Band 2, " or " is a word, multi-site and non-US rows', () => {
  const st = (loc, pay) => S.floorStatus({ LOCATION: loc, payload: { SALARY_BASE_POSTED: pay } }).status;
  assert.equal(st('Washington DC-Baltimore Area', 155000), 'BELOW_ANY_RING_180K');        // not BAND1 via "Washington"
  assert.equal(st('Greater Chicago Area', 310000), 'PASS_BAND2_300K');
  assert.equal(st('Kennesaw or Buckhead (Atlanta), GA', 182500), 'CHECK_RING_180K_200K'); // " or" is not Oregon
  assert.equal(st('Hillsboro, OR / Phoenix, AZ', 210830), 'CHECK_MULTI_SITE');            // sites disagree: not averaged
  assert.equal(st('Hillsboro, OR / Phoenix, AZ', 410000), 'PASS_BAND1_400K');             // same outcome at every site
  assert.equal(st('Farmington Hills, MI / Berea, KY', 175000), 'BELOW_BAND2_300K');
  assert.equal(st('Cardiff, Wales, United Kingdom', 110000), 'CHECK_NON_US');
  assert.equal(st('Massachusetts, United States (Remote)', 325000), 'BELOW_BAND1_400K');
  const P = require('../pipeline-policy.js');
  ['CHECK_MULTI_SITE', 'CHECK_NON_US'].forEach(f => assert.notEqual(P.assess({ FLOOR_STATUS: f, TITLE_RULE_STATUS: 'PASS' }, 90).decision, 'PAY_OR_TITLE_HOLD'));
});

test('floor check ignores the browser geocode cache, so viewer and Writer agree', () => {
  const store = { 'px.geoCache': JSON.stringify({ 'memphis, tn': { lat: 35.15, lon: -90.05, state: 'TN' } }) };
  global.localStorage = { getItem: k => store[k] || null };
  try { assert.equal(S.floorStatus({ LOCATION: 'Memphis, TN', payload: { SALARY_BASE_POSTED: 185000 } }).status, 'CHECK_RING_180K_200K'); }
  finally { delete global.localStorage; }
});
