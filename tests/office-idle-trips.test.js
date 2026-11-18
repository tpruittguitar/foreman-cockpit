// Office idle trips (Tim: characters get up, walk around furniture to idle spots, idle there, then walk back and sit).
// Pure logic only: L.tripScheduleAt (schedule), L.createNav (pathing), L.planOffice (plan integration). Run: node --test tests/office-idle-trips.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const NAMES = ['President', 'QA', 'HR', 'Cursor', 'Claude', 'ChatGPT', 'Root', 'Usage', 'Edgar', 'Comp', 'Gauge', 'Sniffer', 'GUI', 'Archive'];
const T0 = Date.parse('2026-11-16T14:00:00Z');

test('trip schedule is deterministic', () => {
  for (let s = 0; s < 600; s += 7) assert.deepEqual(L.tripScheduleAt(NAMES, T0 + s * 1000), L.tripScheduleAt(NAMES, T0 + s * 1000));
});
test('spots are never double-booked and never more than a third of the office is away', () => {
  const cap = L.walkCap(NAMES.length); let most = 0, anyTrip = false;
  for (let s = 0; s < 3 * 3600; s += 2) {
    const r = L.tripScheduleAt(NAMES, T0 + s * 1000), spots = Object.values(r).map(t => t.spot);
    assert.equal(new Set(spots).size, spots.length, 'double-booked spot at +' + s + 's: ' + spots.join());
    assert.ok(spots.every(sp => L.TRIP_SPOTS.includes(sp)));
    assert.ok(spots.length <= cap, spots.length + ' away, cap ' + cap);
    most = Math.max(most, spots.length); if (spots.length) anyTrip = true;
  }
  assert.ok(anyTrip && most >= 2, 'trips do happen, several can overlap');
});
test('a trip keeps the same spot for its whole window, then the bot is home again (back at the desk)', () => {
  for (const n of NAMES) {
    let cur = null, started = 0;
    for (let s = 0; s < 3600; s++) {
      const t = L.tripScheduleAt(NAMES, T0 + s * 1000)[n];
      if (t && cur && t.since === cur.since) assert.equal(t.spot, cur.spot, n + ' changes spot mid-trip');
      if (t) { if (!cur || t.since !== cur.since) started++; cur = t; assert.ok(t.into >= 0 && t.into < L.TRIP_AWAY_S); } else cur = null;
    }
    assert.ok(started >= 2, n + ' made ' + started + ' trips in an hour');
  }
});
test('not everyone leaves at once: bots start their trips at staggered times', () => {
  const starts = new Set(NAMES.map(n => L.tripScheduleAt([n], T0, { cap: 99 })[n] ? 1 : 0));
  const offsets = NAMES.map(n => { for (let s = 0; s < 400; s++) { const a = L.tripScheduleAt([n], T0 + s * 1000, { cap: 99 })[n]; if (a && a.into === 0) return s; } return -1; });
  assert.ok(new Set(offsets).size >= 10, 'start offsets differ: ' + offsets.join());
  assert.ok(starts.size >= 1);
});
test('planOffice sends working bots on trips and brings them back to work', () => {
  const bots = NAMES.map(n => ({ bot: n, status: 'working' })), fresh = Object.fromEntries(NAMES.map(n => [n, { stale: false }]));
  let trips = 0, home = 0;
  for (let s = 0; s < 1800; s += 3) {
    const p = L.planOffice(bots, [], T0 + s * 1000, 'live', fresh).plans, away = NAMES.filter(n => p[n].act === 'trip');
    trips += away.length; home += NAMES.filter(n => p[n].act === 'work').length;
    assert.equal(new Set(away.map(n => p[n].spot)).size, away.length, 'one bot per spot');
    assert.ok(away.length <= L.walkCap(NAMES.length));
  }
  assert.ok(trips > 0 && home > trips, 'trips happen and bots are mostly at their desks');
});
test('stale (quiet) bots live the idle rotation instead of sitting (games3); waving bots never trip', () => {
  const bots = NAMES.map(n => ({ bot: n, status: n === 'Root' ? 'needs_tim' : 'working' })), fresh = Object.fromEntries(NAMES.map(n => [n, { stale: n === 'QA' }]));
  let qa = 0;
  for (let s = 0; s < 3600; s += 3) { const p = L.planOffice(bots, [], T0 + s * 1000, 'live', fresh).plans; if (L.IDLE_ACTS.includes(p.QA.act) && !p.QA.brk) qa++; assert.notEqual(p.Root.act, 'trip'); assert.ok(!p.Root.trip); }
  assert.ok(qa > 0);
});

/* ---------- pathing around furniture ---------- */
const ROOM = { RW: 24, RD: 20, CELL: 0.2, inflate: 0.22 };
const OBST = [ // desk rows, a pool table, the waterfall wall, a couch, a bike: boxes like office.js block()
  { x0: -8, x1: -6, z0: -3.9, z1: -2.7 }, { x0: -4.8, x1: -2.8, z0: -3.9, z1: -2.7 }, { x0: -1.6, x1: 0.4, z0: -3.9, z1: -2.7 }, { x0: -8, x1: -6, z0: -0.3, z1: 0.9 },
  { x0: -4.8, x1: -2.8, z0: -0.3, z1: 0.9 }, { x0: 8.25, x1: 9.55, z0: -2.8, z1: -0.4 }, { x0: 11, x1: 12, z0: 0.8, z1: 3 }, { x0: 8.65, x1: 9.75, z0: 1.1, z1: 1.5 }, { x0: 5, x1: 7, z0: -7, z1: -6 },
  { x0: 2, x1: 3, z0: 2, z1: 5, viewerOnly: true }
];
const inBox = (p, o, pad) => p.x > o.x0 - pad && p.x < o.x1 + pad && p.z > o.z0 - pad && p.z < o.z1 + pad;
function segHits(a, b, o) { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05); for (let k = 0; k <= n; k++) { const t = k / n; if (inBox({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, o, 0)) return true; } return false; }
test('paths go around every solid obstacle box, stay inside the walls and end at the target', () => {
  const nav = L.createNav(Object.assign({ obstacles: OBST }, ROOM)), solid = OBST.filter(o => !o.viewerOnly);
  const pairs = [[{ x: -7, z: 1.6 }, { x: 10.35, z: 1.9 }], [{ x: -3.8, z: -2.2 }, { x: 10.1, z: -1.1 }], [{ x: -7, z: -4.6 }, { x: 10.1, z: 1.3 }], [{ x: 6, z: 5 }, { x: -7, z: -2 }], [{ x: -3.8, z: 1.6 }, { x: -3.8, z: -5 }]];
  for (const [from, to] of pairs) {
    const pts = nav.route(from, to); assert.ok(pts.length >= 1);
    const last = pts[pts.length - 1]; assert.deepEqual([last.x, last.z], [to.x, to.z]);
    let prev = from;
    for (const p of pts) {
      assert.ok(Math.abs(p.x) < 12 && Math.abs(p.z) < 10, 'inside the room');
      for (const o of solid) assert.ok(!segHits(prev, p, o), 'segment ' + JSON.stringify(prev) + '->' + JSON.stringify(p) + ' crosses a box');
      prev = p;
    }
  }
});
test('a path detours around a wall of furniture instead of cutting through it', () => {
  const nav = L.createNav(Object.assign({ obstacles: [{ x0: -1, x1: 1, z0: -6, z1: 6 }] }, ROOM)), pts = nav.route({ x: -4, z: 0 }, { x: 4, z: 0 });
  assert.ok(pts.length >= 2 && pts.some(p => Math.abs(p.z) > 6), 'goes round the end of the wall');
  let len = 0, prev = { x: -4, z: 0 }; for (const p of pts) { len += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
  assert.ok(len > 8.5);
});
test('viewer-only boxes do not block walking; blocked cells report as not free', () => {
  const nav = L.createNav(Object.assign({ obstacles: OBST }, ROOM));
  const [vi, vj] = nav.toCell(2.5, 3.5), [bi, bj] = nav.toCell(-7, -3.3);
  assert.ok(nav.free(vi, vj)); assert.ok(!nav.free(bi, bj));
});
test('every idle spot kind keeps a walkable approach in the real room layout (route never ends inside a box)', () => {
  const nav = L.createNav(Object.assign({ obstacles: OBST }, ROOM));
  for (const to of [{ x: 9.62, z: 1.3 }, { x: 7.65, z: -2 }, { x: 10.35, z: 1.9 }, { x: -2, z: -9.5 }]) {
    const pts = nav.route({ x: -3.8, z: 0.12 }, to), end = nav.nearestFree(...nav.toCell(to.x, to.z));
    assert.ok(nav.free(...end)); assert.ok(pts.length >= 1);
  }
});
