// SALARY RULE (Tim 2026-10-19 01:34 ET; Grok W1 / W2 / W9): an estimated salary is real pay for the floor check and decisions.
// Hold on pay only when the floor check is BELOW; PAY UNKNOWN / no floor status only with no posted pay and no estimate.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const S = require('../pipeline-scoring'), P = require('../pipeline-policy'), R = require('../pipeline-rules'), W = require('../apps-script/Code.gs');
const live = fs.readFileSync(path.join(__dirname, 'settings-stick.test.js'), 'utf8').match(/const LIVE=('(?:[^'\\]|\\.)*');/)[1];
const policy = Object.assign({}, P.normalizeFlexPolicy(R.flexPolicy(eval(live))), { _SCORING_MODEL: S.defaults() });
// PAY WORTH (Tim 02:14 / 02:17 ET; NEED range B $180k-$300k, hold < 15, pass >= 50): Tim's geo map sets the pay a place needs.
const MAP = S.normalize({ geo: { power: 2, controlPoints: [
  { name: 'Cleveland, TN', lat: 35.1595, lon: -84.8766, score: 100 }, { name: 'Nashville, TN', lat: 36.1627, lon: -86.7816, score: 90 },
  { name: 'Memphis, TN', lat: 35.1495, lon: -90.049, score: 10 }, { name: 'Austin, TX', lat: 30.2672, lon: -97.7431, score: 50 },
  { name: 'Chicago, IL', lat: 41.8781, lon: -87.6298, score: 0 }, { name: 'New York, NY', lat: 40.7128, lon: -74.006, score: 0 },
  { name: 'Phoenix, AZ', lat: 33.4484, lon: -112.074, score: 60 }, { name: 'Portland, OR', lat: 45.5152, lon: -122.6784, score: 20 } ] } });
const fl = (LOCATION, payload, cfg) => S.floorStatus({ LOCATION, payload }, cfg || MAP);
const pw = (LOCATION, payload, cfg) => S.payWorth({ LOCATION, payload }, cfg || MAP);


test('PAY_WORTH: geo map score sets the pay a place needs (180k at 100 -> 300k at 0); smooth curve, no cliff', () => {
  const need = loc => pw(loc, { SALARY_BASE_POSTED: '$200,000' }).best.need;
  assert.equal(need('Cleveland, TN'), 180000);
  assert.equal(need('Nashville, TN'), 192000);
  assert.equal(need('Austin, TX'), 240000);
  assert.equal(need('Chicago, IL'), 300000);
  const curve = r => S.payWorth({ LOCATION: 'Cleveland, TN', payload: { SALARY_BASE_POSTED: String(180000 * r) } }, MAP).score;
  assert.deepEqual([0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2].map(curve), [5, 14, 35, 64, 85, 95, 98]);
  for (let p = 100000; p < 400000; p += 1000) assert.ok(curve((p + 1000) / 180000) - curve(p / 180000) <= 2, 'no cliff at ' + p);
});

test('PAY_WORTH: Tim adjusts it on the geo map, no code change', () => {
  const before = pw('Austin, TX', { SALARY_BASE_POSTED: '$200,000' }).score;
  const map2 = S.normalize({ geo: { power: 2, controlPoints: MAP.geo.controlPoints.map(p => p.name === 'Austin, TX' ? Object.assign({}, p, { score: 90 }) : p) } });
  const after = pw('Austin, TX', { SALARY_BASE_POSTED: '$200,000' }, map2);
  assert.ok(after.score > before, 'raising Austin on the map raises its pay worth');
  assert.equal(after.best.need, 192000);
  const tuned = S.normalize(Object.assign({}, MAP, { payWorth: { low: 170000, high: 320000 } }));
  assert.equal(pw('Chicago, IL', { SALARY_BASE_POSTED: '$100,000' }, tuned).best.need, 320000, 'range is a model setting');
});

test('PAY_WORTH: posted and estimated pay score the same; no figure gives none', () => {
  assert.equal(pw('Nashville, TN', { SALARY_BASE_EST: '$185,000', SALARY_CONF: 'LOW' }).score, pw('Nashville, TN', { SALARY_BASE_POSTED: '$185,000' }).score);
  assert.equal(pw('Nashville, TN', { SALARY_MIDPOINT: '$185,000' }).score, 79);
  assert.equal(pw('Nashville, TN', {}), null);
  assert.equal(fl('Nashville, TN', {}).status, null);
});

test('PAY_WORTH status: PASS >= 50, hold only < 15 with no remote or relocation upside, else CHECK', () => {
  assert.equal(fl('Nashville, TN', { SALARY_BASE_POSTED: '$185,000' }).status, 'PASS_PAY_WORTH_79');
  assert.equal(fl('Chicago, IL', { SALARY_BASE_POSTED: '$165,000' }).status, 'BELOW_PAY_WORTH_3');
  assert.equal(fl('Chicago, IL', { SALARY_BASE_POSTED: '$165,000', RELOCATION_ASSISTANCE: 'Yes, full package' }).status, 'CHECK_PAY_WORTH_3');
  assert.equal(fl('Chicago, IL', { SALARY_BASE_POSTED: '$165,000', RELOCATION_ASSISTANCE: 'No' }).status, 'BELOW_PAY_WORTH_3');
  assert.equal(fl('Chicago, IL', { SALARY_BASE_POSTED: '$165,000', SCOUT_NOTES: 'Relocation assistance available' }).status, 'CHECK_PAY_WORTH_3');
  assert.equal(fl('Austin, TX', { SALARY_BASE_POSTED: '$200,000' }).status, 'CHECK_PAY_WORTH_44', '$200k / $240k = 0.83');
  assert.equal(fl('Massachusetts, United States (Remote)', { SALARY_BASE_POSTED: '$170,000' }).status, 'PASS_PAY_WORTH_75', 'remote = home need: $170k / $180k');
  assert.equal(fl('Cardiff, Wales, United Kingdom', { SALARY_BASE_POSTED: '$110,000' }).status, 'CHECK_NON_US');
});

test('PAY_WORTH sites: real city wins over state centre; several sites scored at the best, disagreement = CHECK_MULTI_SITE', () => {
  assert.equal(pw('Memphis, TN', { SALARY_BASE_POSTED: '$172,500' }).best.geo, 10, 'Memphis is the map point, not mid-Tennessee');
  assert.equal(pw('Memphis, TN', { SALARY_BASE_POSTED: '$172,500', LATITUDE: '36.16', LONGITUDE: '-86.78' }).best.geo, 90, 'recorded coordinates win');
  const m = pw('Portland, OR / Phoenix, AZ', { SALARY_BASE_POSTED: '$225,000' });
  assert.equal(m.score, Math.max.apply(null, m.sites.map(s => s.score)));
  assert.equal(fl('Portland, OR / Phoenix, AZ', { SALARY_BASE_POSTED: '$225,000' }).status, 'CHECK_MULTI_SITE');
  assert.deepEqual(pw('Kennesaw or Buckhead (Atlanta), GA', { SALARY_BASE_POSTED: '$182,500' }).sites.map(x => x.site), ['Kennesaw, GA', 'Buckhead (Atlanta), GA'], '" or" is a word, not Oregon');
  assert.equal(pw('Washington DC-Baltimore Area', { SALARY_BASE_POSTED: '$155,000' }).sites[0].pointHow, 'state centre');
  assert.notEqual(pw('Washington DC-Baltimore Area', { SALARY_BASE_POSTED: '$155,000' }).best.area, 'Seattle');
  const P2 = require('../pipeline-policy.js');
  ['CHECK_MULTI_SITE', 'CHECK_NON_US', 'CHECK_PAY_WORTH_3'].forEach(f => assert.notEqual(P2.assess({ FLOOR_STATUS: f, TITLE_RULE_STATUS: 'PASS' }, 90).decision, 'PAY_OR_TITLE_HOLD'));
});

test('PAY_WORTH ignores the browser geocode cache, so viewer and Writer agree', () => {
  const store = { 'px.geoCache': JSON.stringify({ 'tullahoma, tn': { lat: 35.36, lon: -86.21, state: 'TN' } }) };
  global.localStorage = { getItem: k => store[k] || null };
  try { assert.equal(pw('Tullahoma, TN', { SALARY_BASE_POSTED: '$185,000' }).sites[0].pointHow, 'state centre'); }
  finally { delete global.localStorage; }
});

test('an agent-written FLOOR_STATUS stands; the Writer refreshes only its own', () => {
  const a = fl('Nashville, TN', { SALARY_BASE_EST: '$170,000', FLOOR_STATUS: 'CLEARS_NASHVILLE' });
  assert.deepEqual([a.status, a.derived], ['CLEARS_NASHVILLE', false]);
  const w = fl('Chicago, IL', { SALARY_BASE_EST: '$170,000', FLOOR_STATUS: 'PASS_RING_0_150_180K', FLOOR_BASIS: 'WRITER_DERIVED · old' });
  assert.deepEqual([w.status, w.derived], ['BELOW_PAY_WORTH_3', true]);
});

test('PASS regex is anchored: UNCLEAR is not a pass', () => {
  const base = { DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience', TITLE_RULE_STATUS: 'PASS', SCOPE_FIT_RAW: '85' };
  assert.equal(P.assess(Object.assign({}, base, { FLOOR_STATUS: 'UNCLEAR' }), 85, policy).decision, 'CHECK_PAY_AND_TITLE');
  assert.equal(P.assess(Object.assign({}, base, { FLOOR_STATUS: 'CLEARS_251PLUS_200K' }), 85, policy).decision, 'PURSUE_CANDIDATE');
  assert.equal(P.assess(Object.assign({}, base, { FLOOR_STATUS: 'BELOW_RING_0_150_180K' }), 85, policy).decision, 'PAY_OR_TITLE_HOLD');
});

test('decision and score: estimated pay counts the same as posted; PAY_WORTH is the compensation part', () => {
  const row = pay => ({ COMPANY: 'Acme', TITLE: 'Plant Director', LOCATION: 'Nashville, TN', payload: Object.assign({ DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience', TITLE_RULE_STATUS: 'PASS', SCOPE_FIT_RAW: '85' }, pay) });
  const cfg = Object.assign({}, MAP, { flexPolicy: policy });
  const e = S.scoreRow(row({ SALARY_BASE_EST: '$190,000', SALARY_CONF: 'LOW' }), cfg), p = S.scoreRow(row({ SALARY_BASE_POSTED: '$190,000' }), cfg);
  assert.equal(e.assessment.decision, 'PURSUE_CANDIDATE');
  assert.deepEqual([e.overall, e.parts.compensation.score, e.payWorth.score], [p.overall, p.parts.compensation.score, p.payWorth.score]);
  assert.equal(S.scoreRow(row({ SALARY_BASE_EST: '$120,000' }), cfg).assessment.decision, 'PAY_OR_TITLE_HOLD');
  assert.equal(S.scoreRow(row({ SALARY_BASE_EST: '$160,000' }), cfg).assessment.decision, 'CHECK_PAY_AND_TITLE', 'below need but not clearly low: keeps moving');
  assert.equal(S.scoreRow(row({}), cfg).assessment.decision, 'CHECK_PAY_AND_TITLE');
});

test('Writer: writes PAY_WORTH, FLOOR_STATUS + FLOOR_BASIS it derived; agents cannot set PAY_WORTH; an agent floor value is left alone', () => {
  const pol = Object.assign({}, policy, { _SCORING_MODEL: MAP });
  const run = Pl => { const out = Object.assign({}, Pl); W.deriveWriterScores_(['', '', 'Acme', 'Plant Director', 'READY_TO_PURSUE', '', '', '', 'Nashville, TN'], Pl, (k, v) => { out[k] = v; }, pol); return out; };
  const d = run({ SALARY_BASE_EST: '$190,000', DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience', TITLE_RULE_STATUS: 'PASS', SCOPE_FIT_RAW: '85' });
  assert.equal(d.PAY_WORTH, '83');
  assert.equal(d.FLOOR_STATUS, 'PASS_PAY_WORTH_83');
  assert.match(d.FLOOR_BASIS, /^WRITER_DERIVED · PAY_WORTH 83 · base mid \$190,000 from SALARY_BASE_EST vs need \$192k at Nashville, TN \(geo 90\)/);
  assert.equal(d.PURSUIT_STATUS, 'PURSUE_CANDIDATE');
  const a = run({ SALARY_BASE_EST: '$190,000', FLOOR_STATUS: 'CLEARS_NASHVILLE', DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience' });
  assert.equal(a.FLOOR_STATUS, 'CLEARS_NASHVILLE');
  assert.equal(a.PAY_WORTH, '83', 'score still uses pay worth');
  const none = run({ DEGREE_TEXT: 'Bachelor degree preferred or equivalent experience' });
  assert.equal(none.FLOOR_STATUS, undefined);
  assert.equal(none.PAY_WORTH, undefined);
  const set = W.applyFields_({ PAY_WORTH: '99' }, {}, {}, () => {}, pol);
  assert.equal(set.ok, false, 'PAY_WORTH is Writer-owned');
});

test('Writer geocodes a one-site US city once and records LATITUDE / LONGITUDE; never replaces recorded ones', () => {
  const calls = [];
  global.Maps = { newGeocoder: () => ({ setRegion: () => ({ geocode: loc => { calls.push(loc); return { status: 'OK', results: [{ geometry: { location: { lat: 35.149534, lng: -90.04898 } }, address_components: [{ types: ['country'], short_name: 'US' }] }] }; } }) }) };
  global.Utilities = { formatDate: () => '2026-10-19' };
  try {
    const pol = Object.assign({}, policy, { _SCORING_MODEL: MAP });
    const run = (loc, Pl) => { const out = Object.assign({}, Pl); W.deriveWriterScores_(['', '', 'Acme', 'Plant Director', 'READY_TO_PURSUE', '', '', '', loc], Pl, (k, v) => { out[k] = v; }, pol); return out; };
    const m = run('Bartlett, TN', { SALARY_BASE_POSTED: '$172,500' });
    assert.deepEqual([m.LATITUDE, m.LONGITUDE, m.GEOCODE_SOURCE, m.GEOCODE_ASOF], ['35.14953', '-90.04898', 'WRITER_APPS_SCRIPT_MAPS', '2026-10-19']);
    assert.match(m.PAY_WORTH_BASIS, /\(geo 10\)/, 'scored at the looked-up point');
    run('Nashville, TN', { SALARY_BASE_POSTED: '$1', LATITUDE: '36.1', LONGITUDE: '-86.7' });
    run('Remote', { SALARY_BASE_POSTED: '$1' }); run('Portland, OR / Phoenix, AZ', { SALARY_BASE_POSTED: '$1' });
    assert.deepEqual(calls, ['Bartlett, TN'], 'no lookup for recorded, remote or multi-site rows');
  } finally { delete global.Maps; delete global.Utilities; }
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

