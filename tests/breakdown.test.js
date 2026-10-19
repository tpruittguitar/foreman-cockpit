// Drawer score breakdown: same rule as the approved golden fixture (REV-019, V-16 / C-07); points add up to the ring.
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../pipeline-breakdown.js');
const FX = ['fx-base', 'fx-agency', 'fx-closed', 'fx-applied'].map(n => require('./visual/fixture/' + n + '.json'));
const scOf = r => ({ overall: r.score, confidence: r.coverage, parts: r.parts });

test('reproduces the golden breakdown for the selected job (points, weights, known, Σ 100% KNOWN = 76.0 -> 76)', () => {
  const fx = FX[0], s = fx.rows.find(r => r.id === fx.selectedId), b = P.breakdown(scOf(s));
  assert.deepEqual(b.rows.map(r => [r.key, r.weight, r.known, r.points]), s.breakdown.map(r => [r.key, r.weight, r.known, r.points]));
  assert.equal(b.knownPct, 100); assert.equal(b.sum, 76); assert.equal(b.overall, 76); assert.equal(b.factor.toFixed(3), '1.000');
});

test('every fixture row: points add to the exact sum at 0.1, the ring is that sum rounded, unknown and zero parts carry 0 points', () => {
  let n = 0;
  for (const fx of FX) for (const r of fx.rows) {
    if (typeof r.score !== 'number') continue;
    const b = P.breakdown(scOf(r)); n++;
    assert.ok(Math.abs(b.sum - r.score) <= 0.5 + 1e-9, r.id + ' sum ' + b.sum + ' vs ' + r.score);
    for (const row of b.rows) if (!row.known || row.score === 0 || row.weight === 0) assert.equal(row.points, 0, r.id + ' ' + row.key);
  }
  assert.ok(n >= 150);
});

test('no score -> no breakdown', () => {
  assert.equal(P.breakdown({ overall: null, parts: {} }), null);
  assert.equal(P.breakdown(null), null);
});
