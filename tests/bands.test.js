// Percentile bands: same population, cut and rank rules as the approved golden fixtures (REV-019, Grok Bot V-19 / V-20).
const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../pipeline-bands.js');
const FX = ['fx-base', 'fx-agency', 'fx-closed', 'fx-applied'].map(n => [n, require('./visual/fixture/' + n + '.json')]);

// Fixture rows carry their golden band; NONE = outside the population (closed posting / applied), so eligible = band !== 'NONE'.
const itemsOf = fx => fx.rows.map(r => ({ id: r.id, score: r.score, hold: r.band === 'HOLD', eligible: r.band !== 'NONE' }));

for (const [name, fx] of FX) {
  test(name + ': reproduces the golden bands, cut-points and ranks (minN 40); HOLD and NONE rows get no rank', () => {
    const res = B.compute(itemsOf(fx), { minN: 40 });
    assert.equal(res.on, true);
    assert.equal(res.n, fx.bands.n);
    assert.deepEqual(res.cuts, fx.bands.cuts);
    for (const r of fx.rows) {
      const got = res.byId[r.id];
      assert.equal(got.band, r.band, r.id + ' band');
      if (r.band === 'HOLD' || r.band === 'NONE') assert.equal(got.rankNo, null, r.id + ' has no rank');
      else assert.equal(got.rankNo, r.rankNo, r.id + ' rank');
    }
  });
}

test('golden base: JOB-0412 is #1 and the header line matches V-20', () => {
  const fx = FX[0][1], res = B.compute(itemsOf(fx), { minN: 40 });
  assert.equal(res.byId[fx.selectedId].rankNo, 1);
  assert.equal(B.summary(res, 24, '23:41'), 'BANDS = PERCENTILE · N 48 ELIGIBLE OPEN · P90 72 · P65 61 · P20 51 · REV 24 · AS OF 23:41');
  assert.equal(B.summary(res, null, null), 'BANDS = PERCENTILE · N 48 ELIGIBLE OPEN · P90 72 · P65 61 · P20 51 · REV — · AS OF —');
});

test('below minN the bands are off and no row gets a rank', () => {
  const res = B.compute(itemsOf(FX[0][1]).slice(0, 10), { minN: 40 });
  assert.equal(res.on, false);
  assert.equal(res.cuts, null);
  assert.ok(Object.values(res.byId).every(v => (v.band === 'NONE' || v.band === 'HOLD') && v.rankNo == null));
  assert.match(B.summary(res, 24, '21:58'), /^BANDS OFF · N \d+ ELIGIBLE OPEN < 40 · REV 24 · AS OF 21:58$/);
});

test('a score equal to a cut goes to the higher band; ties share the better rank', () => {
  // 20 x 50 then 20 x 70: n 40; P90 = sorted[36] = 70, P65 = sorted[26] = 70, P20 = sorted[8] = 50.
  const pop = Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, score: i < 20 ? 50 : 70, eligible: true }));
  const res = B.compute(pop, {});
  assert.deepEqual(res.cuts, { top: 70, upper: 70, low: 50 });
  assert.equal(res.byId.p25.band, 'TOP');
  assert.equal(res.byId.p0.band, 'MID');
  assert.equal(res.byId.p25.rankNo, 1);
  assert.equal(res.byId.p0.rankNo, 21);
});

test('itemsFromRows: terminal and APPLIED rows are ineligible, STRICT HOLD is hold, unscored is null; key covers every input', () => {
  const rows = [
    { id: 'a', BUCKET: 'TIM_DECISION_REQUIRED' }, { id: 'b', BUCKET: 'APPLIED' }, { id: 'c', BUCKET: 'CLOSED_DEAD' },
    { id: 'd', BUCKET: 'MANUAL_RESEARCH' }, { id: 'e', BUCKET: 'READY_TO_PURSUE' }
  ];
  const scores = { a: { overall: 70, band: 'STRONG' }, b: { overall: 80 }, c: { overall: 60 }, d: { overall: 40, band: 'STRICT HOLD' }, e: { overall: null } };
  const out = B.itemsFromRows(rows, r => scores[r.id], r => r.BUCKET === 'CLOSED_DEAD');
  assert.deepEqual(out.items, [
    { id: 'a', score: 70, hold: false, eligible: true }, { id: 'b', score: 80, hold: false, eligible: false },
    { id: 'c', score: 60, hold: false, eligible: false }, { id: 'd', score: 40, hold: true, eligible: true },
    { id: 'e', score: null, hold: false, eligible: true }
  ]);
  scores.a.overall = 71;
  assert.notEqual(B.itemsFromRows(rows, r => scores[r.id], r => r.BUCKET === 'CLOSED_DEAD').key, out.key, 'a score change changes the key');
  assert.notEqual(B.itemsFromRows(rows, r => scores[r.id], () => false).key, B.itemsFromRows(rows, r => scores[r.id], r => r.BUCKET === 'CLOSED_DEAD').key, 'an eligibility change changes the key');
});

test('every band has a distinct glyph and label (no colour-only state, L-1); STRICT HOLD is ⊘, not the Hold decision icon', () => {
  const g = Object.values(B.GLYPH), l = Object.values(B.LABEL);
  assert.equal(new Set(g).size, g.length);
  assert.equal(new Set(l).size, l.length);
  assert.equal(B.GLYPH.HOLD, '⊘');
});

test('F-6 shares: largest remainder makes TOP/UPPER/MID/LOW add up to 100 over the whole population (golden emptyDrawer)', () => {
  assert.deepEqual(B.shares({ TOP: 1, UPPER: 2, MID: 5, LOW: 3 }, 11), { TOP: 9, UPPER: 18, MID: 46, LOW: 27 });   // was 9/18/45/27 = 99
  for (const [name, fx] of FX) {
    const res = B.compute(itemsOf(fx), { minN: 40 }), cnt = {};
    Object.values(res.byId).forEach(v => { cnt[v.band] = (cnt[v.band] || 0) + 1; });
    const s = B.shares(cnt, res.n);
    assert.equal(s.TOP + s.UPPER + s.MID + s.LOW, 100, name + ' adds up to 100');
  }
  const part = B.shares({ TOP: 1, UPPER: 1, MID: 1, LOW: 0 }, 10);   // a filtered view: shares add up to the rounded 30%, LOW gets no tenth
  assert.deepEqual(part, { TOP: 10, UPPER: 10, MID: 10, LOW: 0 });
  assert.deepEqual(B.shares({}, 0), { TOP: null, UPPER: null, MID: null, LOW: null });
});
