// Welding robot cell in the warehouse (Tim, Nov 22, 2026): moves along a weld path, throws sparks and an arc glow while the
// office is working, parks when it is idle, and stays light on phones.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');
// the repo is CommonJS, so the browser ES modules are imported from .mjs copies in a temp folder
const os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weld-'));
const asMjs = (rel, name) => { const to = path.join(tmp, name); fs.copyFileSync(path.join(__dirname, '..', rel), to); return pathToFileURL(to).href; };
let mods; const load = () => mods || (mods = Promise.all([import(asMjs('office/weld-robot.js', 'weld-robot.mjs')), import(asMjs('office/vendor/three/three.module.min.js', 'three.mjs'))]));

test('the cycle approaches, welds, lifts, rests, and alternates parts', async () => {
  const [W] = await load();
  const seen = [];
  for (let t = 0; t < W.WELD_CYCLE_S * 2; t += 0.1) { const p = W.weldPhase(t); if (!seen.length || seen[seen.length - 1] !== p.phase + p.seam) seen.push(p.phase + p.seam); }
  assert.deepEqual(seen, ['approach0', 'weld0', 'lift0', 'pause0', 'approach1', 'weld1', 'lift1', 'pause1']);
});

test('the arm IK puts the torch tip on every point of both seams and at home', async () => {
  const [W] = await load();
  for (const s of W.SEAMS) for (let k = 0; k <= 1; k += 0.1) {
    const p = { x: s.x, y: s.y, z: s.z0 + (s.z1 - s.z0) * k }, q = W.armTip(W.solveArm(p));
    assert.ok(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 1e-6, `seam point ${JSON.stringify(p)} reached`);
  }
  for (let t = 0; t < W.WELD_CYCLE_S * 2; t += 0.05) { const p = W.tipTarget(W.weldPhase(t), t), q = W.armTip(W.solveArm(p));
    assert.ok(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 1e-6, 'every path point is within reach at t=' + t); }
});

test('it parks when the office is idle and finishes the part it is on first', async () => {
  const [W] = await load();
  const restAt = W.WELD_CYCLE_S - 0.5; assert.equal(W.weldPhase(restAt).phase, 'pause');
  assert.equal(W.advanceClock(restAt, 0.1, false), restAt, 'idle at rest: holds');
  assert.ok(W.advanceClock(restAt, 0.1, true) > restAt, 'working: runs');
  const mid = 2.0; assert.equal(W.weldPhase(mid).phase, 'weld');
  let t = mid; for (let k = 0; k < 200; k++) t = W.advanceClock(t, 0.05, false);
  assert.equal(W.weldPhase(t).phase, 'pause', 'idle mid-weld: completes the part, then rests');
});

test('builds headless, sparks fly while welding and stay within the pool, none on reduced motion', async () => {
  const [W, THREE] = await load();
  for (const low of [false, true]) {
    const r = W.makeWeldRobot(THREE, { low, light: !low }); let most = 0, welded = false;
    assert.equal(r.maxSparks, low ? W.SPARKS.phone : W.SPARKS.desktop);
    for (let k = 0; k < 400; k++) { const s = r.update(1 / 30, { working: true }); most = Math.max(most, s.sparks); welded = welded || s.welding; }
    assert.ok(welded, 'it welds'); assert.ok(most > 5 && most <= r.maxSparks, 'sparks ' + most);
    const calm = W.makeWeldRobot(THREE, { low }); let any = 0;
    for (let k = 0; k < 400; k++) any = Math.max(any, calm.update(1 / 30, { working: true, reduced: true }).sparks);
    assert.equal(any, 0, 'reduced motion: no sparks');
  }
});

test('the cell sits in the warehouse, clear of the glass doors, the walkway to the docks and the case shelf', async () => {
  const src = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
  assert.match(src, /WELD_POS = \{ x: WH\.x0 \+ 9, z: -8 \}, WELD_SCALE = 1\.25/);
  assert.match(src, /weldBot\.update\(dt, \{ working: Object\.values\(S\.fresh/);
  // warehouse x 12..48, z -27..27; doors at x 12, z 0.1..3.1; shelf at x 12.4, z 13.2; the cell is CELL scaled 1.25 about WELD_POS
  const [W] = await load(), k = 1.25, c = { x0: 21 + k * W.CELL.x0, x1: 21 + k * W.CELL.x1, z0: -8 + k * W.CELL.z0, z1: -8 + k * W.CELL.z1 };
  assert.ok(c.x0 > 12 + 3 && c.x1 < 48 - 3 && c.z0 > -27 + 1, 'inside the warehouse, off the walls and the dock lane');
  assert.ok(c.z1 < 0.1 - 3, 'at least 3 m clear of the door-to-dock walkway');
  assert.ok(c.z1 < 13.2 - 1.25 - 3, 'nowhere near the case shelf');
});
