// Office: bots walk around furniture and never push into it. Real layout (tests/fixtures/office-layout.json, from
// `node tools/office-collision-check.cjs dump`), stuck detection and soft separation.
// Run: node --test tests/office-no-bumping.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const lay = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/office-layout.json'), 'utf8'));
const real = lay.obstacles.filter(o => !o.viewerOnly);
const nav = L.createNav({ RW: lay.RW, RD: lay.RD, CELL: lay.CELL, inflate: lay.inflate, obstacles: lay.obstacles });
const inBox = (o, x, z) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1;
// a leg may only touch a real box that holds one of its own endpoints (a sofa seat, the bike saddle)
function crossing(a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.02);
  for (const o of real) {
    if (inBox(o, a.x, a.z) || inBox(o, b.x, b.z)) continue;
    for (let k = 0; k <= n; k++) { const t = k / n; if (inBox(o, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return o; }
  }
  return null;
}
function checkRoute(from, to, label) {
  const pts = nav.route(from, to); let prev = from;
  assert.ok(pts.length, label + ': a route exists');
  assert.deepEqual([pts[pts.length - 1].x, pts[pts.length - 1].z], [to.x, to.z], label + ': ends at the spot');
  for (const p of pts) { const o = crossing(prev, p); assert.equal(o, null, label + ': leg crosses ' + (o && (o.tag || JSON.stringify(o)))); prev = p; }
  return pts.length;
}

test('layout fixture has the real furniture', () => {
  assert.ok(real.length > 15 && lay.desks.length >= 8 && lay.slots.length > 20);
  assert.ok(real.some(o => o.x0 < -9 && o.x1 > -8 && o.z0 < 7.4 && o.z1 > 7.4), 'conference table present');
});

test('every desk seat reaches every idle, meeting, training and trip spot and back without a leg through furniture', () => {
  const spots = lay.slots.map(s => ({ x: s.x, z: s.z, face: s.face, id: s.id }));
  for (const d of lay.desks) { spots.push(Object.assign({ id: d.name + ':visit' }, d.visit), Object.assign({ id: d.name + ':stand' }, d.stand)); }
  spots.push(Object.assign({ id: 'trainer' }, lay.trainer));
  let legs = 0;
  for (const d of lay.desks) for (const s of spots) {
    legs += checkRoute(d.seat, s, d.name + ' -> ' + s.id);
    legs += checkRoute(s, d.seat, s.id + ' -> ' + d.name);
  }
  assert.ok(legs > 1000);
});

test('spots between every pair of idle spots (including the conference seats) also route cleanly', () => {
  const spots = lay.slots.filter(s => ['conf', 'sit', 'nap', 'bike', 'pool', 'board', 'waterfall', 'coffee', 'fridge'].includes(s.kind));
  for (const a of spots) for (const b of spots) if (a !== b) checkRoute(a, b, a.id + ' -> ' + b.id);
});

test('a bot standing on the far side of a table gets a leg that goes around it, not through it', () => {
  const tbl = real.find(o => o.x0 < -9 && o.x1 > -8 && o.z0 < 7.4 && o.z1 > 7.4), cx = (tbl.x0 + tbl.x1) / 2;
  const north = { x: cx, z: tbl.z0 - 0.1 }, south = { x: cx, z: tbl.z1 + 0.1 }; // both inside the inflated margin, opposite sides
  checkRoute(north, south, 'north -> south'); checkRoute(south, north, 'south -> north');
  const pts = nav.route(north, south); assert.ok(pts.length >= 3, 'detours around the end of the table');
});

test('a spot inside a blocked margin approaches from the side it faces', () => {
  const tbl = real.find(o => o.x0 < -9 && o.x1 > -8 && o.z0 < 7.4 && o.z1 > 7.4), cx = (tbl.x0 + tbl.x1) / 2;
  const spot = { x: cx, z: tbl.z0 + 0.1, face: Math.PI }; // inside the table's north edge, facing +z
  const nav2 = L.createNav({ RW: lay.RW, RD: lay.RD, CELL: lay.CELL, inflate: lay.inflate, obstacles: lay.obstacles });
  const from = { x: cx, z: tbl.z0 - 1.5 }, pts = nav2.route(from, spot);
  assert.ok(pts.length && !pts.slice(0, -1).some(p => inBox(tbl, p.x, p.z)));
});

test('a start inside furniture (sitting on the couch / bike) leaves through free space', () => {
  for (const s of lay.slots.filter(x => x.kind === 'sit' || x.kind === 'nap' || x.kind === 'bike')) for (const d of lay.desks.slice(0, 3)) checkRoute(s, d.seat, s.id + ' start');
});

test('chairs (viewerOnly boxes) are still reachable', () => {
  const confSeat = lay.slots.find(s => s.kind === 'conf');
  assert.ok(lay.obstacles.some(o => o.viewerOnly && inBox(o, confSeat.x, confSeat.z)), 'conference seat is inside a chair box');
  assert.ok(nav.route(lay.desks[0].seat, confSeat).length >= 1);
});

test('walkProgress: steady progress never trips; a stall asks for a re-route, then gives up after two failed re-routes', () => {
  let st = null, t = 0, d = 3;
  for (let k = 0; k < 100; k++) { t += 0.05; d -= 0.07; st = L.walkProgress(st, d, t); assert.equal(st.action, 'ok'); }
  st = null; t = 0; const acts = [];
  for (let k = 0; k < 400; k++) {
    t += 0.05; st = L.walkProgress(st, 2, t);
    if (st.action === 'reroute') { acts.push('reroute'); st = { best: Infinity, since: t, tries: st.tries, action: 'ok' }; }
    if (st.action === 'giveup') { acts.push('giveup'); break; }
  }
  assert.deepEqual(acts, ['reroute', 'reroute', 'giveup']);
});

test('walkProgress: 0.15 m in 1.5 s is the line; reaching a waypoint (state cleared) forgives earlier stalls', () => {
  let st = L.walkProgress(null, 2, 0); st = L.walkProgress(st, 1.9, 1.0); st = L.walkProgress(st, 1.9, 1.49); assert.equal(st.action, 'ok');
  st = L.walkProgress(st, 1.9, 1.51); assert.equal(st.action, 'reroute');
  let s2 = L.walkProgress(null, 2, 0); s2 = L.walkProgress(s2, 1.84, 1.4); assert.equal(s2.action, 'ok'); assert.equal(s2.best, 1.84);
  const fresh = L.walkProgress(null, 5, 10); assert.equal(fresh.tries, 0);
});

test('separateWalkers: walkers and standers get pushed apart, seated bots never move, nobody is pushed into a blocked cell', () => {
  const free = (x, z) => nav.free(...nav.toCell(x, z));
  const pts = [{ x: 0, z: 0 }, { x: 0.2, z: 0 }, { x: 0.1, z: 0.1, fixed: true }];
  const seat = { x: pts[2].x, z: pts[2].z };
  for (let k = 0; k < 20; k++) L.separateWalkers(pts, 0.72, () => true);
  assert.equal(pts[2].x, seat.x); assert.equal(pts[2].z, seat.z);
  assert.ok(Math.hypot(pts[0].x - pts[1].x, pts[0].z - pts[1].z) > 0.5);
  const tbl = real.find(o => o.x0 < -9 && o.x1 > -8 && o.z0 < 7.4 && o.z1 > 7.4), cx = (tbl.x0 + tbl.x1) / 2;
  const a = { x: cx, z: tbl.z0 - 0.5 }, b = { x: cx, z: tbl.z0 - 0.62 };
  assert.ok(free(a.x, a.z) && free(b.x, b.z));
  for (let k = 0; k < 60; k++) { L.separateWalkers([a, b], 0.72, free); assert.ok(!inBox(tbl, a.x, a.z) && !inBox(tbl, b.x, b.z)); assert.ok(free(a.x, a.z) && free(b.x, b.z)); }
});

test('4000 random start/target pairs over the room (inside margins, beside sofas, at the walls): no leg crosses a real box', () => {
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pt = () => ({ x: (r() - 0.5) * 22, z: (r() - 0.5) * 18, face: r() * 6.28 });
  for (let i = 0; i < 4000; i++) { const a = pt(), b = pt(); let prev = a; for (const p of nav.route(a, b)) { assert.equal(crossing(prev, p), null, 'pair ' + i + ' ' + JSON.stringify([a, b])); prev = p; } }
});
