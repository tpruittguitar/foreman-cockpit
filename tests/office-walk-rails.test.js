// Office walk rails: paths never enter furniture boxes (with their approach margin), and walkers never end closer than MIN_SEP.
// Run: node --test tests/office-walk-rails.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const ROOM = { RW: 24, RD: 20, CELL: 0.2, inflate: 0.22 };
const BOXES = [
  { x0: -8, x1: -6, z0: -3.9, z1: -2.7 }, { x0: -4.8, x1: -2.8, z0: -3.9, z1: -2.7 }, { x0: -1.6, x1: 0.4, z0: -3.9, z1: -2.7 }, { x0: -8, x1: -6, z0: -0.3, z1: 0.9 },
  { x0: 10.2, x1: 12, z0: 6.2, z1: 9.2 }, { x0: 8.25, x1: 9.55, z0: -2.8, z1: -0.4 }, { x0: 5, x1: 7, z0: -7, z1: -6 }, { x0: -1.5, x1: 1.5, z0: 4, z1: 5 }
];
const inBox = (p, o) => p.x > o.x0 && p.x < o.x1 && p.z > o.z0 && p.z < o.z1;
const segHits = (a, b, o) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05); for (let k = 0; k <= n; k++) { const t = k / n; if (inBox({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, o)) return true; } return false; };

test('planned paths never enter any furniture box, including to a spot inside the approach margin', () => {
  const nav = L.createNav(Object.assign({ obstacles: BOXES }, ROOM));
  const spots = [{ x: -7, z: -2.4 }, { x: 11.3, z: 5.9 }, { x: 7.65, z: -2 }, { x: 0, z: 5.5 }, { x: -3.8, z: -5 }, { x: 6, z: -5.8 }];
  let n = 0;
  for (const from of spots) for (const to of spots) {
    if (from === to) continue;
    let prev = from; const pts = nav.route(from, to);
    assert.deepEqual([pts[pts.length - 1].x, pts[pts.length - 1].z], [to.x, to.z]);
    for (const p of pts) { for (const o of BOXES) assert.ok(!segHits(prev, p, o), 'path crosses a box'); prev = p; n++; }
  }
  assert.ok(n > 30);
});

function walk(nav, a, b, steps) {
  const pa = { x: a.from.x, z: a.from.z, fixed: false }, pb = { x: b.from.x, z: b.from.z, fixed: false }, pa0 = nav.route(a.from, a.to), pb0 = nav.route(b.from, b.to), paths = [pa0, pb0], pts = [pa, pb];
  let minD = Infinity;
  for (let s = 0; s < steps; s++) {
    pts.forEach((p, i) => { const t = paths[i][0]; if (!t) return; const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz), st = 1.35 / 60; if (d <= st) { p.x = t.x; p.z = t.z; paths[i].shift(); } else { p.x += dx / d * st; p.z += dz / d * st; } });
    L.separateWalkers(pts, L.MIN_SEP * 0.9, (x, z) => nav.free(...nav.toCell(x, z)));
    minD = Math.min(minD, Math.hypot(pa.x - pb.x, pa.z - pb.z));
  }
  return { pts, minD };
}

test('two characters walking head-on never end closer than the minimum spacing and never get pushed into a box', () => {
  for (const obstacles of [[], BOXES]) {
    const nav = L.createNav(Object.assign({ obstacles }, ROOM));
    const r = walk(nav, { from: { x: -4, z: 1.5 }, to: { x: 4, z: 1.5 } }, { from: { x: 4, z: 1.5 }, to: { x: -4, z: 1.5 } }, 60 * 12);
    assert.ok(r.minD >= L.MIN_SEP * 0.9 - 0.01, 'closest approach ' + r.minD);
    assert.ok(Math.hypot(r.pts[0].x - 4, r.pts[0].z - 1.5) < 0.9 && Math.hypot(r.pts[1].x + 4, r.pts[1].z - 1.5) < 0.9, 'both still reach the far side');
    for (const p of r.pts) for (const o of obstacles) assert.ok(!inBox(p, o), 'pushed into a box');
  }
});

test('separation never pushes a character into a box, and fixed (seated) points stay put', () => {
  const nav = L.createNav(Object.assign({ obstacles: [{ x0: 0, x1: 2, z0: 0, z1: 2 }] }, ROOM)), isFree = (x, z) => nav.free(...nav.toCell(x, z));
  const pts = [{ x: -0.5, z: 1, fixed: false }, { x: -0.1, z: 1, fixed: true }];
  for (let i = 0; i < 30; i++) L.separateWalkers(pts, 0.72, isFree);
  assert.equal(pts[1].x, -0.1); assert.ok(isFree(pts[0].x, pts[0].z));
});
