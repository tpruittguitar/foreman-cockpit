// REV-039 PAY WORTH backfill (Tim 2026-10-19 02:31 ET): the Refresh plan sends live jobs with a salary figure whose stored PAY_WORTH,
// Writer-derived FLOOR_STATUS or PURSUIT_STATUS differ from the current scoring, or whose city has not been looked up, through the
// same receipt-verified ENRICH batches; the Writer re-derives and looks the city up. The plan must match what the real Writer writes.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const D = require('../pipeline-derived-refresh'), S = require('../pipeline-scoring'), P = require('../pipeline-policy'), R = require('../pipeline-rules'), W = require('../apps-script/Code.gs');
const live = fs.readFileSync(path.join(__dirname, 'settings-stick.test.js'), 'utf8').match(/const LIVE=('(?:[^'\\]|\\.)*');/)[1];
const RULES = R.flexPolicy(eval(live));
const MODEL = { geo: { power: 2, controlPoints: [{ name: 'Cleveland, TN', lat: 35.1595, lon: -84.8766, score: 100 }, { name: 'Nashville, TN', lat: 36.1627, lon: -86.7816, score: 90 },
  { name: 'Memphis, TN', lat: 35.1495, lon: -90.049, score: 10 }, { name: 'Chicago, IL', lat: 41.8781, lon: -87.6298, score: 0 }] } };
const policy = Object.assign({}, P.normalizeFlexPolicy(RULES), { _SCORING_MODEL: S.normalize(MODEL) });
const DEG = 'Bachelor degree preferred or equivalent experience';
const row = (id, loc, payload, bucket) => ({ id, PRIMARY_ID: id, BUCKET: bucket || 'MANUAL_RESEARCH', COMPANY: 'Co ' + id, TITLE: 'Plant Director', LOCATION: loc, payload });
const line = (id, loc, payload, bucket) => ['1', id, 'Co ' + id, 'Plant Director', bucket || 'MANUAL_RESEARCH', 'RESOLVED/NEEDS_RESOLUTION', 'SRC', 'LI-1', loc, Object.keys(payload).map(k => k + '=' + payload[k]).join('; ')].join(' | ');

test('a live job with pay and no stored PAY_WORTH is planned; the ENRICH repeats a value the row already holds', () => {
  const p = D.payPlan([row('A', 'Nashville, TN', { SALARY_BASE_EST: '$190,000', DEGREE_TEXT: DEG, LATITUDE: '36.16', LONGITUDE: '-86.78' }),
    row('B', 'Nashville, TN', { SALARY_BASE_EST: '$190,000', FLEX_CLASS: 'HIGH_FLEX', LATITUDE: '36.16', LONGITUDE: '-86.78' }),
    row('C', 'Nashville, TN', { DEGREE_TEXT: DEG }), row('D', 'Nashville, TN', { SALARY_BASE_EST: '$190,000' }, 'APPLIED')], MODEL, RULES);
  assert.deepEqual(p.stale.map(s => s.primaryId), ['A', 'B'], 'no figure and terminal buckets are out of scope');
  const r = D.requests(p.stale, 'T');
  assert.deepEqual(r[0].ruling.fields, { SALARY_BASE_EST: '$190,000' });
  assert.deepEqual(r[1].ruling.fields, { FLEX_CLASS: 'HIGH_FLEX' });
  r.forEach((x, i) => { assert.equal(x.ruling.kind, 'ENRICH'); assert.equal(x.ruling.requestId, 'PX-PAYWORTH-' + p.payId + '-' + p.stale[i].primaryId); });
  assert.deepEqual(D.requests(p.stale, 'T').map(x => x.ruling.requestId), r.map(x => x.ruling.requestId), 'ids reproducible: a rerun cannot double-write');
});

test('city lookup: one-site US cities without coordinates or a lookup result are planned; remote, multi-site, non-US and NOT_FOUND are not', () => {
  const base = { SALARY_BASE_EST: '$190,000', PAY_WORTH: '84', FLOOR_STATUS: 'PASS_PAY_WORTH_84', FLOOR_BASIS: 'WRITER_DERIVED · x' };
  const n = loc => D.needsLookup(row('Z', loc, base));
  assert.deepEqual(['Bartlett, TN', 'Remote', 'Portland, OR / Phoenix, AZ', 'Cardiff, Wales, United Kingdom'].map(n), [true, false, false, false]);
  assert.equal(D.needsLookup(row('Z', 'Bartlett, TN', Object.assign({ GEOCODE_STATUS: 'NOT_FOUND' }, base))), false);
  assert.equal(D.needsLookup(row('Z', 'Bartlett, TN', Object.assign({ LATITUDE: '35.2', LONGITUDE: '-89.8' }, base))), false);
});

test('the pay plan matches what the real Writer writes for every case, and a second plan after the write is empty', () => {
  global.Maps = { newGeocoder: () => ({ setRegion: () => ({ geocode: loc => /Bartlett/.test(loc) ? { status: 'OK', results: [{ geometry: { location: { lat: 35.2045, lng: -89.8739 } }, address_components: [{ types: ['country'], short_name: 'US' }] }] } : { status: 'ZERO_RESULTS', results: [] } }) }) };
  global.Utilities = { formatDate: () => '2026-10-19' };
  try {
    const cases = [['Nashville, TN', { SALARY_BASE_EST: '$190,000', DEGREE_TEXT: DEG, TITLE_RULE_STATUS: 'PASS', SCOPE_FIT_RAW: '85', LATITUDE: '36.16', LONGITUDE: '-86.78' }],
      ['Chicago, IL', { SALARY_BASE_POSTED: '$165,000', FLEX_CLASS: 'HIGH_FLEX', SCOPE_FIT_RAW: '80', LATITUDE: '41.88', LONGITUDE: '-87.63', PURSUIT_STATUS: 'NEEDS_EVIDENCE' }],
      ['Bartlett, TN', { SALARY_MIDPOINT: '$172,500', DEGREE_TEXT: DEG, SCOPE_FIT_RAW: '75' }],
      ['Nowhere Junction, TN', { SALARY_BASE_EST: '$185,000', DEGREE_TEXT: DEG }],
      ['Memphis, TN', { SALARY_BASE_EST: '$150,000', DEGREE_TEXT: DEG, FLOOR_STATUS: 'CLEARS_MEMPHIS', LATITUDE: '35.15', LONGITUDE: '-90.05' }]];
    cases.forEach(([loc, payload], i) => {
      const id = 'V2F-P' + i, p = D.payPlan([row(id, loc, payload)], MODEL, RULES);
      assert.equal(p.stale.length, 1, 'case ' + i + ' planned');
      const res = W.mutateRow(line(id, loc, payload), D.requests(p.stale, 'T')[0].ruling, policy); assert.equal(res.ok, true, res.error);
      const after = W.parsePayload(res.after.split(' | ').slice(9).join(' | ')).payload;
      assert.equal(res.after.split(' | ')[4], 'MANUAL_RESEARCH', 'bucket unchanged');
      const lookup = p.stale[0].changes.some(c => c.field === 'LATITUDE / LONGITUDE');   // values after a lookup depend on the found point
      if (!lookup) p.stale[0].changes.forEach(c => assert(D.same(after[c.field], c.after), 'case ' + i + ' ' + c.field + ': predicted ' + c.after + ', Writer wrote ' + after[c.field]));
      if (lookup) assert.ok(after.LATITUDE || after.GEOCODE_STATUS === 'NOT_FOUND', 'case ' + i + ' city looked up or marked');
      const again = D.payPlan([row(id, loc, after)], MODEL, RULES);
      assert.equal(again.stale.length, 0, 'case ' + i + ': after the Writer writes, the row is up to date: ' + JSON.stringify(again.stale[0] && again.stale[0].changes));
      if (i === 2) assert.match(after.PAY_WORTH_BASIS, /\(geo 10\)/, 'Bartlett scored at its real point near Memphis');
      if (i === 3) assert.equal(after.GEOCODE_STATUS, 'NOT_FOUND', 'a definite miss is recorded once');
      if (i === 4) assert.equal(after.FLOOR_STATUS, 'CLEARS_MEMPHIS', 'agent floor value stands');
    });
  } finally { delete global.Maps; delete global.Utilities; }
});

test('full plan: a row stale on FLEX and pay is sent once (its FLEX ENRICH re-derives pay too); no published model = FLEX only', () => {
  const V3 = { HIGH_FLEX_MODIFIER: 30, SOFT_FLEX_MODIFIER: 20, NO_FLEX_MODIFIER: -15, STRICT_MODIFIER: -30, NOT_STATED_CLASS: 'HIGH_FLEX', EQUIVALENCY_CLASS: 'SOFT_FLEX', HARD_DEGREE_CLASS: 'NO_FLEX', SINGLE_PATH_CLASS: 'STRICT', FRESH_DEGREE_OVERRIDES_STALE_CLASS: 'YES' };
  const rows = [row('A', 'Nashville, TN', { FLEX_CLASS: 'SOFT_FLEX', FLEX_MODIFIER: '6', SCOPE_FIT_RAW: '70', ADJUSTED_FIT: '76', SALARY_BASE_EST: '$190,000', LATITUDE: '36.16', LONGITUDE: '-86.78' }),
    row('B', 'Nashville, TN', { SALARY_BASE_EST: '$190,000', LATITUDE: '36.16', LONGITUDE: '-86.78' })];
  const f = D.fullPlan(rows, V3, MODEL);
  assert.deepEqual(f.stale.map(s => s.primaryId + ':' + (s.kind || 'FLEX')), ['A:FLEX', 'B:PAY']);
  assert.deepEqual([f.flexStale, f.payStale], [1, 1]);
  assert.deepEqual(D.fullPlan(rows, V3, null).stale.map(s => s.primaryId), ['A']);
});

test('Refresh panel uses the full plan with the published scoring model', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
  assert.match(src, /PipelineDerivedRefresh\.fullPlan\(PipelineParser\.parse\(v\.text\)\.rows,pol,S\.scoringCanonical\|\|null\)/);
  assert.match(src, /PipelineDerivedRefresh\.fullPlan\(S\.rows,pol,S\.scoringCanonical\|\|null\)/);
});
