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
    const p = { x: s.x, y: s.y0 + (s.y1 - s.y0) * k, z: s.z0 + (s.z1 - s.z0) * k }, q = W.armTip(W.solveArm(p));
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

test('only the real torch contact on visible steel produces short, pooled bursts', async () => {
  const [W, THREE] = await load();
  for (const low of [false, true]) {
    const r = W.makeWeldRobot(THREE, { low, light: !low });
    r.group.position.set(21, 0, -8); r.group.scale.setScalar(1.25); // as placed in the Office
    const tip = r.group.getObjectByName('weld-tip'), points = r.group.getObjectByName('weld-sparks');
    const shell = r.group.children.filter(mesh => mesh.material?.color?.getHex() === 0xc3cad2);
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), origin = new THREE.Vector3(), spot = new THREE.Vector3();
    const touched = new Set(), sparked = new Set(), bornAtTip = new Set(); let most = 0, quietWeld = false;
    assert.equal(points.geometry.attributes.position.count, low ? W.SPARKS.phone : W.SPARKS.desktop);
    assert.equal(r.update(1 / 30, { working: false }).sparks, 0, 'parks while idle');
    for (let k = 0; k < 600; k++) {
      const state = r.update(1 / 30, { working: true });
      if (!state.welding) { assert.equal(state.sparks, 0, 'no particles away from the work'); continue; }
      touched.add(state.seam);
      tip.getWorldPosition(spot); r.group.updateMatrixWorld(true);
      ray.set(origin.copy(spot).addScaledVector(down, -0.3), down);
      const hit = ray.intersectObjects(shell, false)[0];
      assert.ok(hit && Math.abs(hit.point.y - spot.y) < 0.028, 'torch reaches actual shell mesh at each contact');
      if (state.sparks) {
        sparked.add(state.seam);
        const pos = points.geometry.attributes.position, color = points.geometry.attributes.color;
        for (let i = 0; i < pos.count; i++) if (color.getX(i) === 1) {
          const born = r.group.localToWorld(new THREE.Vector3().fromBufferAttribute(pos, i));
          assert.ok(born.distanceTo(spot) < 1e-6, 'new particles start at the physical tip');
          bornAtTip.add(state.seam);
        }
      }
      else if (k > 90) quietWeld = true;
      most = Math.max(most, state.sparks);
    }
    assert.equal(touched.size, 2); assert.equal(sparked.size, 2); assert.equal(bornAtTip.size, 2);
    assert.ok(quietWeld, 'visible pauses between bursts while in contact');
    assert.ok(most > 5 && most <= r.maxSparks);
    for (let k = 0; k < 240; k++) {
      if (!r.update(1 / 30, { working: true }).sparks) continue;
      assert.equal(r.update(1 / 30, { working: true, reduced: true }).sparks, 0, 'reduced motion clears an active burst');
      break;
    }
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

test('Tim\'s Nov 22 review: no eyes, no safety cones, and it welds a bare-metal car shell', async () => {
  const src = fs.readFileSync(path.join(__dirname, '../office/weld-robot.js'), 'utf8');
  assert.doesNotMatch(src, /eyeG|shineG|of eyes/, 'no eye or shine meshes and no squint');
  assert.doesNotMatch(src, /bollard|TABLE\./, 'no corner cones and no welding table');
  const [W] = await load();
  for (const s of W.SEAMS) { // both seams sit on the shell's near side, at its top surface
    assert.ok(Math.abs(s.x - W.CAR.near) < 0.1, 'seam on the near side');
    for (const k of [0, 0.5, 1]) { const z = s.z0 + (s.z1 - s.z0) * k, y = s.y0 + (s.y1 - s.y0) * k; assert.ok(Math.abs(y - W.carTopAt(z)) < 0.03, 'seam on the body top at z=' + z); }
  }
  const c = W.CELL; assert.ok(c.x1 > W.CAR.x + W.CAR.w / 2 && c.z1 > W.CAR.l / 2 && c.z0 < -W.CAR.l / 2, 'the car sits inside the blocked cell');
});
