// Bike mount (QA #406 follow-up): bots walk to a free point beside the saddle and sit straight on, so no walking body box enters the bike.
// Run: node --test tests/office-bike-mount.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const ROOM = { RW: 24, RD: 20, CELL: 0.2, inflate: 0.42 };
const BIKE = { x0: 8.4, x1: 9.4, z0: -4.42, z1: -3.58 }, POOL = { x0: 7.6, x1: 10.2, z0: -2.8, z1: -0.4 };
const SADDLE = { x: 9.12, z: -4.0, face: -Math.PI / 2 }, MAX_R = 0.42, USAGE_R = 0.3;
const boxGap = (x, z, o) => Math.hypot(Math.max(o.x0 - x, 0, x - o.x1), Math.max(o.z0 - z, 0, z - o.z1));
const navFor = boxes => { const nav = L.createNav(Object.assign({ obstacles: boxes }, ROOM)); return { nav, free: (x, z) => nav.free(...nav.toCell(x, z)) }; };

test('the mount point sits beside the saddle, outside the bike box by the widest body radius', () => {
  const { free } = navFor([BIKE, POOL]);
  const m = L.mountSpot(SADDLE, 0.42, 0.45, free);
  assert.ok(m, 'a mount point exists');
  assert.ok(Math.abs(m.x - SADDLE.x) < 1e-6, 'level with the saddle');
  assert.ok(boxGap(m.x, m.z, BIKE) >= MAX_R, 'clear of the bike box by ' + boxGap(m.x, m.z, BIKE));
  assert.ok(free(m.x, m.z), 'on a walkable cell');
  assert.ok(m.z < BIKE.z0, 'takes the open side, away from the pool table');
});

test('every walk to the mount point keeps a body box clear of the bike, saddle included', () => {
  const { nav, free } = navFor([BIKE, POOL]);
  const m = L.mountSpot(SADDLE, 0.42, 0.45, free);
  let worst = Infinity;
  for (const from of [{ x: 10.4, z: -3.15 }, { x: 7.2, z: -3.15 }, { x: 5, z: -5 }, { x: 11.3, z: -6 }, { x: 0, z: 0 }]) {
    const pts = [from].concat(nav.route(from, m));
    assert.deepEqual(pts[pts.length - 1], { x: m.x, z: m.z }, 'path ends at the mount point');
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
      for (let i = 0; i <= n; i++) worst = Math.min(worst, boxGap(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n, BIKE));
    }
  }
  assert.ok(worst - USAGE_R >= 0, 'walking body clears the bike by ' + (worst - USAGE_R).toFixed(3) + ' m');
});

test('falls back to the other side when one side is blocked', () => {
  const m = L.mountSpot(SADDLE, 0.42, 0.45, (x, z) => z > -3.5);
  assert.ok(m && m.z > BIKE.z1 && boxGap(m.x, m.z, BIKE) >= MAX_R);
  assert.equal(L.mountSpot(SADDLE, 0.42, 0.45, () => false), null);
});
