// QA #409: a fresh bot's break counts its walk time inside the 45 s budget, break spots must fit the round trip at the bot's real
// walk speed (else it stretches beside its desk), and the walk target flips back to the seat the moment the break ends.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../office/office-logic.js');

const office = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.js'), 'utf8');
const NOW = Date.parse('2026-11-18T05:30:00Z'), MIN = 60000;
const SEAT = { x: -5.4, z: 0.12 }, STAND = { x: -5.4, z: 0.72 };
const FAR = [{ id: 'fridge1', kind: 'fridge', x: 7.0, z: -8.2 }, { id: 'coffee1', kind: 'coffee', x: 7.05, z: -6.4 }];
const NEAR = FAR.concat([{ id: 'coffeeN', kind: 'coffee', x: -4.0, z: 1.4 }, { id: 'fridgeN', kind: 'fridge', x: -6.6, z: 1.6 }]);

test('breakSpotFits: walk back after the 30 s window must land inside 45 s, and never beyond 3 m', () => {
  assert.equal(L.WORK_BREAK_MAX_S, 45);
  assert.equal(L.breakSpotFits(12, 1.35), false, 'the fridge 12 m away never fits');
  assert.equal(L.breakSpotFits(2, 1.35), true);
  assert.equal(L.breakSpotFits(2.5, 0.18), true, '30 + 13.9 s');
  assert.equal(L.breakSpotFits(3, 0.18), false, '30 + 16.7 s is over 45');
  assert.equal(L.breakSpotFits(1, 0), false);
});

/* Walk one fresh bot through 3-minute windows at real walk speeds: the plan comes from planOffice each tick, the target from
   L.breakSpot (or the desk stand), and the target goes back to the seat the moment the plan is work again. */
function awaySeconds(slots, speed, start) {
  const name = 'President', step = 0.25;
  let pos = { x: SEAT.x, z: SEAT.z }, away = 0;
  for (let t = 0; t < 180; t += step) {
    const at = NOW + (start + t) * 1000, row = { bot: name, status: 'working', last_action_at: new Date(at - 5 * MIN).toISOString() };
    const p = L.planOffice([row], [], at, 'live', { [name]: L.botActivity(row, at, {}) }).plans[name];
    let tgt = SEAT;
    if (p.act === 'coffee' || p.act === 'fridge') tgt = L.breakSpot(p.act, SEAT, slots, speed) || STAND;
    else if (p.act === 'stretch') tgt = STAND;
    else assert.equal(p.act, 'work');
    const dx = tgt.x - pos.x, dz = tgt.z - pos.z, d = Math.hypot(dx, dz), mv = speed * step;
    pos = d <= mv ? { x: tgt.x, z: tgt.z } : { x: pos.x + dx / d * mv, z: pos.z + dz / d * mv };
    if (Math.hypot(pos.x - SEAT.x, pos.z - SEAT.z) > 0.05) away += step;
  }
  return away;
}
test('a fresh bot is away from its seat 45 s or less in any 3 min, at real walk speeds, far or near break spots', () => {
  let sawNear = false;
  for (const speed of [0.18, 0.5, 1.35]) for (const slots of [FAR, NEAR]) for (let start = 0; start < 3 * 3600; start += 431) {
    const a = awaySeconds(slots, speed, start);
    assert.ok(a <= L.WORK_BREAK_MAX_S, `away ${a} s at ${speed} m/s from +${start} s`);
  }
  for (const k of ['coffee', 'fridge']) { assert.equal(L.breakSpot(k, SEAT, FAR, 1.35), null); if (L.breakSpot(k, SEAT, NEAR, 1.35)) sawNear = true; }
  assert.ok(sawNear, 'a near spot is still used when it fits');
});

test('office.js: breaks take L.breakSpot at the real walk speed, and the seat target is never held by the walk cap', () => {
  assert.match(office, /case 'coffee': case 'fridge': if \(p\.brk\) \{ const s = L\.breakSpot\(p\.act, d\.seat, SLOTS, L\.WALK_MPS \* realRate,/);
  assert.match(office, /return \{ key: 'stretch', spot: d\.stand, pose: 'stretch' \}; \}/);
  assert.match(office, /const home = !!dk && Math\.hypot\(g\.spot\.x - dk\.seat\.x, g\.spot\.z - dk\.seat\.z\) < 0\.05;/);
  assert.match(office, /L\.mayStartWalk\(far, needs \|\| c\.forceNap \|\| home \|\| L\.isSessionWalk\(g\), walkingNow, chars\.size\)/);
  assert.match(office, /if \(raw > 0\) realRate \+= \(dt \/ raw - realRate\) \* 0\.05;/);
});
