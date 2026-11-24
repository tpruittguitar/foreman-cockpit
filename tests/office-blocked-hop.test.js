'use strict';
// cs-31de0ce8: task-file blocked state -> hop + caution sign; working/idle do not.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../office/office-logic.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('blockedCue maps task-file state to hop and sign', () => {
  assert.deepEqual(L.blockedCue({ blocked: true, state: 'blocked' }), { hop: true, sign: true, pose: 'wave' });
  assert.deepEqual(L.blockedCue({ working: true, state: 'working' }), { hop: false, sign: false, pose: null });
  assert.deepEqual(L.blockedCue({ state: 'idle' }), { hop: false, sign: false, pose: null });
  assert.deepEqual(L.blockedCue({}), { hop: false, sign: false, pose: null });
  assert.deepEqual(L.blockedCue(null), { hop: false, sign: false, pose: null });
  assert.deepEqual(L.blockedCue({ working: true, state: 'blocked' }), { hop: true, sign: true, pose: 'wave' }, 'blocked wins, same order as floorTag');
});

test('blockedHopOffset is 0 when reduced and a varying hop otherwise', () => {
  assert.equal(L.blockedHopOffset(1, 2, true), 0);
  const a = L.blockedHopOffset(1, 2, false);
  const b = L.blockedHopOffset(1.25, 2, false);
  assert.ok(a > 0 && a <= 0.16, a);
  assert.ok(b >= 0 && b <= 0.16, b);
  assert.notEqual(a, b);
});

test('planOffice: blocked freshness waves; working and idle do not', () => {
  const bots = [{ bot: 'Gauge', status: 'idle' }, { bot: 'QA', status: 'working' }, { bot: 'GUI', status: 'idle' }];
  const fresh = { Gauge: { blocked: true, state: 'blocked' }, QA: { working: true, state: 'working' }, GUI: { state: 'idle' } };
  const plan = L.planOffice(bots, [], Date.now(), 'live', fresh);
  assert.equal(plan.plans.Gauge.act, 'wave');
  assert.notEqual(plan.plans.QA.act, 'wave');
  assert.notEqual(plan.plans.GUI.act, 'wave');
  assert.notEqual(plan.plans.Gauge.act, 'work');
});

test('office.js drives hop and sign from blockedCue / S.fresh, not needsSet', () => {
  const office = read('office/office.js');
  const chars = read('office/chars.js');
  assert.match(office, /const cue = L\.blockedCue\(S\.fresh && S\.fresh\[c\.name\]\)/);
  assert.match(office, /if \(cue\.hop\) \{ book\.release\(c\.name\); return \{ key: 'stand', spot: d\.stand, pose: cue\.pose \}/);
  assert.doesNotMatch(office, /if \(needsTim\) \{ book\.release\(c\.name\); return \{ key: 'stand', spot: d\.stand, pose: 'wave' \}/);
  assert.match(office, /if \(cue\.sign\) \{[^}]*c\.warn\.visible = true/);
  assert.match(office, /else if \(c\.warn\.visible\) \{ c\.warn\.visible = false; c\.warn\.scale\.setScalar\(1\); \}/);
  assert.doesNotMatch(office, /c\.warn\.userData\.mat\.emissiveIntensity/);
  const wave = chars.slice(chars.indexOf("case 'wave':"), chars.indexOf("case 'pool':"));
  assert.match(wave, /blockedHopOffset/);
  assert.doesNotMatch(wave, /\* 0\.012/);
  assert.equal((read('office/office-logic.js').match(/function blockedCue/g) || []).length, 1);
  assert.equal((read('office/office-logic.js').match(/function blockedHopOffset/g) || []).length, 1);
});
