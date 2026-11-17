// Office wall dimmer: pure level math. Run: node --test tests/office-dimmer.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');

test('level clamps to 0.25..1.6 and bad input falls back to 1.0', () => {
  assert.equal(L.clampDim(0), 0.25); assert.equal(L.clampDim(-5), 0.25); assert.equal(L.clampDim(9), 1.6); assert.equal(L.clampDim('0.8'), 0.8);
  for (const v of [NaN, undefined, null, 'x', '', Infinity]) assert.equal(L.clampDim(v), 1);
  assert.equal(L.DIM_DEFAULT, 1);
});
test('knob position maps to level and back, ends hit the limits', () => {
  assert.equal(L.dimFromKnob(0), 0.25); assert.equal(L.dimFromKnob(1), 1.6); assert.equal(L.dimFromKnob(-3), 0.25); assert.equal(L.dimFromKnob(7), 1.6);
  for (const t of [0, 0.2, 0.5, 0.75, 1]) assert.ok(Math.abs(L.knobFromDim(L.dimFromKnob(t)) - t) < 1e-9);
  assert.ok(Math.abs(L.dimFromKnob(L.knobFromDim(1)) - 1) < 1e-9);
});
test('keyboard step moves 0.1 and stops at the ends', () => {
  assert.equal(L.dimStep(1, 1), 1.1); assert.equal(L.dimStep(1, -1), 0.9); assert.equal(L.dimStep(1.6, 1), 1.6); assert.equal(L.dimStep(0.25, -1), 0.25); assert.equal(L.dimStep(0.3, -1), 0.25);
});
test('light scaling is linear and 1.0 leaves the original intensity', () => {
  assert.equal(L.dimScale(2.4, 1), 2.4); assert.equal(L.dimScale(2, 0.5), 1); assert.equal(L.dimScale(2, 99), 3.2);
});
test('smoothing approaches the target without overshoot and lands exactly', () => {
  let c = 1; for (let i = 0; i < 400; i++) { const n = L.dimSmooth(c, 0.25, 1 / 60); assert.ok(n <= c && n >= 0.25); c = n; }
  assert.equal(c, 0.25); assert.equal(L.dimSmooth(1, 1, 0.016), 1);
});
