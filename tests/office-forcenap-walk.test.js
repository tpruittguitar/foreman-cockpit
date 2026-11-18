// QA on #392 (Nov 17): forceNap('President','couch') returned the couch spot, but President sat at the desk ~90 s because
// the walk cap (a third of the bots) stayed full of idle trips and forceNap was not exempt. Run: node --test tests/office-forcenap-walk.test.js
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const LAYOUT = require('./fixtures/office-layout.json');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');

test('urgent goals skip a full walk cap; ordinary far walks still wait; short hops always go', () => {
  assert.equal(L.mayStartWalk(true, false, 4, 13), false);
  assert.equal(L.mayStartWalk(true, { id: 'nap7.2' }, 4, 13), true);
  assert.equal(L.mayStartWalk(true, true, 4, 13), true);
  assert.equal(L.mayStartWalk(false, false, 4, 13), true);
  assert.equal(L.mayStartWalk(true, false, 3, 13), true);
});

test('simulated walk: with the cap full all the time, a forced President reaches the couch nap spot well inside 120 s', () => {
  const nav = L.createNav(LAYOUT), desk = LAYOUT.desks.find(d => d.name === 'President').seat;
  const couch = LAYOUT.slots.find(s => s.kind === 'nap' && s.id === 'nap7.2');
  const pos = { x: desk.x, z: desk.z }, forceNap = couch, dt = 1 / 60, total = 13, walkingNow = L.walkCap(total);
  let path = null, t = 0;
  for (; t < 120; t += dt) {
    const far = Math.hypot(couch.x - pos.x, couch.z - pos.z) > 0.4;
    if (!path) { if (L.mayStartWalk(far, forceNap, walkingNow, total)) path = nav.route(pos, couch); else continue; }
    if (!path.length) break;
    const p = path[0], dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz), step = 1.35 * dt;
    if (d <= step) { pos.x = p.x; pos.z = p.z; path.shift(); } else { pos.x += dx / d * step; pos.z += dz / d * step; }
  }
  assert.ok(path, 'started walking on the first frame');
  assert.ok(Math.hypot(pos.x - couch.x, pos.z - couch.z) < 0.01, 'at the couch nap spot, not ' + pos.x.toFixed(2) + ',' + pos.z.toFixed(2));
  assert.ok(t < 30, 'arrived in ' + t.toFixed(1) + ' s');
  assert.equal(L.mayStartWalk(true, null, walkingNow, total), false, 'without forceNap the same frame would wait at the desk');
});

test('office.js passes forceNap as urgent to the walk cap', () => {
  assert.match(office, /if \(!L\.mayStartWalk\(far, needs \|\| c\.forceNap, walkingNow, chars\.size\)\)/);
});
