const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('Zach’s unchanged mesh counter-swings arms and legs, and rests with reduced motion', async () => {
  const office = path.join(__dirname, '../office'), scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'zach-rig-'));
  try {
    fs.copyFileSync(path.join(office, 'vendor/three/three.module.min.js'), path.join(scratch, 'three.mjs'));
    for (const name of ['humanoid', 'zach']) {
      const src = fs.readFileSync(path.join(office, name + '.js'), 'utf8')
        .replace("from 'three'", "from './three.mjs'").replace("from './humanoid.js'", "from './humanoid.mjs'");
      fs.writeFileSync(path.join(scratch, name + '.mjs'), src);
    }
    const load = file => import(pathToFileURL(path.join(scratch, file)).href);
    const THREE = await load('three.mjs'), { walkLimbPose, walkKneeAngle } = await load('humanoid.mjs');
    const { rigZachMesh, makeZach, attachZachMesh, poseZach } = await load('zach.mjs');
    const L = require('../office/office-logic.js');

    // Read the position accessor from the shipped asset; the model file itself is unmodified.
    const glb = fs.readFileSync(path.join(office, 'assets/zach.glb')), jsonLen = glb.readUInt32LE(12);
    const asset = JSON.parse(glb.toString('utf8', 20, 20 + jsonLen));
    const a = asset.accessors[asset.meshes[0].primitives[0].attributes.POSITION], view = asset.bufferViews[a.bufferView];
    const start = 28 + jsonLen + (view.byteOffset || 0) + (a.byteOffset || 0), positions = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = glb.readFloatLE(start + i * (view.byteStride || 12) + j * 4);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const z = makeZach(L), mesh = rigZachMesh(g, new THREE.MeshStandardMaterial()); attachZachMesh(z, mesh);
    const samples = [[], [], [], [], []];
    for (let i = 0; i < a.count; i++) {
      const [x, y] = positions.subarray(i * 3, i * 3 + 2);
      if (x < -0.18 && y > 0.30 && y < 0.39) samples[0].push(i);
      if (x > 0.18 && y > 0.30 && y < 0.39) samples[1].push(i);
      if (x < -0.055 && y < 0.055) samples[2].push(i);
      if (x > 0.055 && y < 0.055) samples[3].push(i);
      if (y > 0.78) samples[4].push(i);
    }
    assert.ok(samples.every(s => s.length > 10), 'both hands, both boots and the head exist on the shipped asset');
    const before = i => new THREE.Vector3().fromArray(positions, i * 3);
    const after = i => mesh.applyBoneTransform(i, before(i));
    const body = { y: 0, roll: 0, pitch: 0, yaw: 0, sy: 1, sxz: 1 };
    z.root.updateMatrixWorld(true);
    assert.ok(samples.every(s => s.every(i => after(i).distanceTo(before(i)) < 1e-6)), 'skin keeps the exact rest appearance');

    const t = Math.PI / 18, expected = walkLimbPose(t, 0);
    poseZach(z, body, 'walk', t, 1, false);
    z.root.updateMatrixWorld(true);
    const j = mesh.userData.limbs;
    assert.deepEqual([j.armR.rotation.x, j.armL.rotation.x, j.legR.rotation.x, j.legL.rotation.x],
      [expected.armR, expected.armL, expected.hipR, expected.hipL]);
    assert.equal(j.kneeL.rotation.x, walkKneeAngle(expected.hipL));
    const drift = s => s.reduce((sum, i) => sum + after(i).z - before(i).z, 0) / s.length;
    assert.ok(drift(samples[0]) * drift(samples[1]) < -0.001, 'skin moves the hands in opposing directions');
    assert.ok(drift(samples[2]) * drift(samples[3]) < -0.001, 'skin moves the boots in opposing directions');
    assert.ok(samples[4].every(i => after(i).distanceTo(before(i)) < 1e-6), 'head, hair and face do not deform');

    poseZach(z, body, 'walk', t, 1, true);
    z.root.updateMatrixWorld(true);
    assert.ok(samples.every(s => s.every(i => after(i).distanceTo(before(i)) < 1e-6)), 'reduced motion returns the limbs to rest');
    assert.equal(z.kind, 'visitor');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
