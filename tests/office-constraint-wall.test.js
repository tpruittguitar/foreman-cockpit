// Office constraint wall: age/stale tag and reuse of the cockpit's constraint model. Run: node --test tests/office-constraint-wall.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js'), CR = require('../pipeline-control-room.js');

test('measured line is ET and goes stale after 30 minutes, on failure, or with no time', () => {
  const now = Date.parse('2026-11-16T22:00:00Z'), at = m => new Date(now - m * 60000).toISOString();
  const fresh = L.constraintAge(at(5), now); assert.match(fresh.text, /^measured \d{1,2}:\d{2} (AM|PM) ET$/); assert.equal(fresh.stale, false);
  assert.equal(L.constraintAge(at(31), now).stale, true);
  assert.equal(L.constraintAge(at(5), now, true).stale, true);
  assert.equal(L.constraintAge(undefined, now).stale, true);
  assert.equal(L.constraintAge(new Date(now + 60000).toISOString(), now).stale, true);
});
test('wall uses the cockpit summary shape (no second constraint calculation)', () => {
  assert.equal(typeof CR.summary, 'function');
  const d = L.demoConstraint();
  assert.deepEqual(Object.keys(d).sort(), Object.keys(CR.summary(CR.model({}), {})).filter(k => k in d).sort());
  const s = CR.summary(CR.model({}), {});
  assert.equal(s.stages.length, 4); assert.equal(s.waiting.length, 3);
  assert.ok(s.stages.every(x => !x.constraint)); // unknown evidence never marks a constraint
});
