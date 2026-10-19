// Percentile bands: same population, cut and rank rules as the approved golden fixture (REV-019, Grok Bot V-19 / V-20).
const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../pipeline-bands.js');
const fx = require('./visual/fixture/fx-base.json');

const items = fx.rows.map(r => ({ id: r.id, score: r.score, hold: r.band === 'HOLD', eligible: true }));

test('reproduces the golden fixture bands, cut-points and ranks (minN 40)', () => {
  const res = B.compute(items, { minN: 40 });
  assert.equal(res.on, true);
  assert.equal(res.n, fx.bands.n);
  assert.deepEqual(res.cuts, fx.bands.cuts);
  for (const r of fx.rows) {
    assert.equal(res.byId[r.id].band, r.band, r.id + ' band');
    if (r.rankNo != null) assert.equal(res.byId[r.id].rankNo, r.rankNo, r.id + ' rank');
  }
  assert.equal(res.byId[fx.selectedId].rankNo, 1);
  assert.equal(B.summary(res, 24, '23:41'), 'BANDS = PERCENTILE · N 48 ELIGIBLE OPEN · P90 72 · P65 61 · P20 51 · REV 24 · AS OF 23:41');
});

test('below minN the bands are off and no row gets a rank', () => {
  const res = B.compute(items.slice(0, 10), { minN: 40 });
  assert.equal(res.on, false);
  assert.equal(res.cuts, null);
  assert.ok(Object.values(res.byId).every(v => (v.band === 'NONE' || v.band === 'HOLD') && v.rankNo == null));
  assert.match(B.summary(res), /^BANDS OFF · N \d+ ELIGIBLE OPEN < 40$/);
});

test('ineligible (applied / terminal) and unscored rows are outside the population', () => {
  const pop = Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, score: 40 + i, eligible: true }));
  const res = B.compute(pop.concat([{ id: 'applied', score: 99, eligible: false }, { id: 'noscore', score: null, eligible: true }]), {});
  assert.equal(res.n, 40);
  assert.equal(res.byId.applied.band, 'NONE');
  assert.equal(res.byId.noscore.band, 'NONE');
  assert.equal(res.byId.p39.rankNo, 1);
});

test('a score equal to a cut goes to the higher band; ties share the better rank', () => {
  const pop = Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, score: i < 20 ? 50 : 70, eligible: true }));
  const res = B.compute(pop, {});
  assert.equal(res.byId.p0.band, res.cuts.low <= 50 ? (50 >= res.cuts.upper ? 'UPPER' : 'MID') : 'LOW');
  assert.equal(res.byId.p25.rankNo, 1);
  assert.equal(res.byId.p0.rankNo, 21);
});

test('every band has a distinct glyph and label (no colour-only state, L-1)', () => {
  const g = Object.values(B.GLYPH), l = Object.values(B.LABEL);
  assert.equal(new Set(g).size, g.length);
  assert.equal(new Set(l).size, l.length);
});
