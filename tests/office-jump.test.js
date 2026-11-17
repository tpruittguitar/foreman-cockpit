// Office desktop walk viewer: Space-to-jump helper (pure ballistic arc + eye-height settle).
// Run: node --test tests/office-jump.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const F = L.EYE_HEIGHT, DT = 1 / 60;
const fresh = () => ({ y: F, vy: 0, air: false });
function run(state, frames, wants) {
  const ys = []; let s = state;
  for (let i = 0; i < frames; i++) { s = L.jumpStep(s, DT, wants ? wants(i) : false, F); ys.push(s.y); }
  return { s, ys };
}

test('a press launches an arc that rises then lands exactly at the floor height', () => {
  const { s, ys } = run(fresh(), 120, i => i === 0);
  assert.ok(Math.max(...ys) > F + 0.3, 'rises visibly');
  assert.ok(Math.max(...ys) < F + 0.7, 'stays a modest hop');
  assert.equal(s.y, F);
  assert.equal(s.vy, 0);
  assert.equal(s.air, false);
});

test('apex is about v^2 / 2g above the floor', () => {
  const { ys } = run(fresh(), 120, i => i === 0);
  const apex = L.JUMP_V * L.JUMP_V / (2 * L.GRAVITY);
  assert.ok(Math.abs(Math.max(...ys) - F - apex) < 0.03);
});

test('no double jump while airborne: presses mid-air do not extend the arc', () => {
  const single = run(fresh(), 200, i => i === 0).ys;
  const spam = run(fresh(), 200, () => true).ys;
  const landSingle = single.findIndex((y, i) => i > 3 && y === F), landSpam = spam.findIndex((y, i) => i > 3 && y === F);
  assert.ok(landSingle > 0);
  assert.equal(landSpam, landSingle, 'the first landing is at the same frame');
});

test('landing frame clamps to the floor even with a huge dt', () => {
  let s = L.jumpStep(fresh(), DT, true, F);
  s = L.jumpStep(s, 5, false, F);
  assert.equal(s.y, F); assert.equal(s.air, false);
});

test('a new jump is possible after landing', () => {
  let { s } = run(fresh(), 120, i => i === 0);
  assert.equal(s.air, false);
  s = L.jumpStep(s, DT, true, F);
  assert.equal(s.air, true); assert.ok(s.y > F);
});

test('grounded and not pressing: stays exactly at the floor', () => {
  const { s } = run(fresh(), 30);
  assert.deepEqual(s, fresh());
});

test('composes with the eye-height settle: from a raised desk-hop height it eases down and snaps to the floor', () => {
  const { s, ys } = run({ y: F + 0.4, vy: 0, air: false }, 120);
  assert.equal(s.y, F);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] <= ys[i - 1] + 1e-12, 'monotonic descent');
});

test('jumping from a raised height lands on the eye height, not the old height', () => {
  const { s } = run({ y: F + 0.2, vy: 0, air: false }, 150, i => i === 0);
  assert.equal(s.y, F); assert.equal(s.air, false);
});

test('landing with the default floor uses EYE_HEIGHT', () => {
  let s = L.jumpStep({ y: L.EYE_HEIGHT, vy: 0, air: false }, DT, true);
  for (let i = 0; i < 200; i++) s = L.jumpStep(s, DT, false);
  assert.equal(s.y, L.EYE_HEIGHT);
});
