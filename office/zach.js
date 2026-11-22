/* Zach: a young visitor who walks about the office doing small idle things (Tim, Nov 19, 2026).
   He is a person, not a bot: no bot_id, desk, status, card, screen, chat or Needs Tim, and no office data moves him.
   Model: Tim's own Tripo model, baked by tools/zach-glb/bake.py into office/assets/zach.glb (metres, feet on y=0, facing +z,
   L.ZACH.height tall, which stays at or under 3/4 of the President's 1.45 m). His original mesh and textures are unchanged; a light runtime skin drives the limbs with the
   President's existing gait while retaining Zach's visitor tasks and whole-body idle motion. */
import * as THREE from 'three';
import { setSkinWeights, walkKneeAngle, walkLimbPose } from './humanoid.js';

const ZACH_GLB = new URL('./assets/zach.glb', import.meta.url).href;

// Joint positions are measured on Zach's own 1 m rest mesh, not the President's taller model.
const ZACH_JOINTS = { shoulderX: 0.132, shoulderY: 0.592, hipX: 0.065, hipY: 0.312, kneeY: 0.154 };
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function zachWeights(x, y) {
  const ax = Math.abs(x), j = ZACH_JOINTS;
  const alongArm = (ax - j.shoulderX) * 0.35 - (y - j.shoulderY) * 0.937;
  const arm = smooth(alongArm, -0.026, 0.043) * smooth(ax, 0.107, 0.153) * smooth(y, 0.267, 0.30);
  const leg = (1 - smooth(y, 0.276, 0.365)) * (1 - arm);
  const shin = leg * (1 - smooth(y, 0.127, 0.193)), thigh = leg - shin;
  const r = 1 - smooth(x, -0.024, 0.024);
  return [1 - arm - leg, x < 0 ? arm : 0, x < 0 ? 0 : arm,
    0, thigh * r, shin * r, thigh * (1 - r), shin * (1 - r)];
}

export function rigZachMesh(geometry, material) {
  setSkinWeights(geometry, zachWeights);
  const j = ZACH_JOINTS, bones = (x, y, z = 0) => {
    const bone = new THREE.Bone(); bone.position.set(x, y, z); return bone;
  };
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const torso = bones(0, j.hipY), hips = bones(0, 0);
  const armR = bones(-j.shoulderX, j.shoulderY - j.hipY), armL = bones(j.shoulderX, j.shoulderY - j.hipY);
  const legR = bones(-j.hipX, j.hipY), legL = bones(j.hipX, j.hipY);
  const kneeR = bones(0, j.kneeY - j.hipY), kneeL = bones(0, j.kneeY - j.hipY);
  armR.rotation.z = -0.34; armL.rotation.z = 0.34;
  torso.add(armR, armL); hips.add(legR, legL); legR.add(kneeR); legL.add(kneeL); mesh.add(torso, hips);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([torso, armR, armL, hips, legR, kneeR, legL, kneeL]), new THREE.Matrix4());
  mesh.frustumCulled = false;
  mesh.userData.limbs = { armR, armL, legR, legL, kneeR, kneeL };
  return mesh;
}

/* Lazy: nothing here runs at import. The Zach switch (office-logic createZachSwitch) calls loadZachMesh only while he is shown,
   so a browser with him hidden never fetches zach.glb. Each call loads afresh (after disposeZachMesh nothing is kept). */
export function loadZachMesh(name) {
  return import('./vendor/three/addons/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(ZACH_GLB))
    .then(gltf => {
      let m = null; gltf.scene.traverse(o => { if (o.isMesh && !m) m = o; });
      if (!m) return null;
      const mat = new THREE.MeshStandardMaterial({ map: m.material.map, roughness: 0.8, metalness: 0 });
      m.material.map = null; m.material.dispose(); // the glTF's own material is never drawn
      const mesh = rigZachMesh(m.geometry, mat); mesh.userData.charName = name; mesh.castShadow = false;
      return mesh;
    });
}

/* Switched off: free everything the model holds on the GPU and in memory. */
export function disposeZachMesh(mesh) {
  if (!mesh) return;
  if (mesh.parent) mesh.parent.remove(mesh);
  const mat = mesh.material, map = mat && mat.map;
  if (mesh.skeleton) mesh.skeleton.dispose();
  if (mesh.geometry) mesh.geometry.dispose();
  if (map) { map.dispose(); if (map.image && typeof map.image.close === 'function') map.image.close(); }
  if (mat) mat.dispose();
}

/* root: floor position and heading. rig: the motion pivot at the feet (bob, waddle, lean, squash). The mesh is attached by the
   switch (attachZachMesh) once loaded, so makeZach itself loads nothing. */
export function makeZach(L) {
  const Z = L.ZACH, root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig); root.name = Z.name;
  return { name: Z.name, root, rig, top: Z.height, radius: Z.radius, pose: 'stand', path: [], task: null, mesh: null, kind: 'visitor' };
}
export function attachZachMesh(z, mesh) { z.rig.add(mesh); z.mesh = mesh; }
export function detachZachMesh(z, mesh) { z.rig.remove(mesh); if (z.mesh === mesh) z.mesh = null; }

/* Apply one frame of motion from office-logic zachMotion: m = { y, roll, pitch, yaw, sy, sxz }. */
export function poseZach(z, m, mode, t, dt, reduced) {
  z.rig.position.y = m.y;
  z.rig.rotation.set(m.pitch, m.yaw, m.roll, 'YXZ');
  z.rig.scale.set(m.sxz, m.sy, m.sxz);
  const limbs = z.mesh?.userData?.limbs;
  if (!limbs) return;
  const walking = mode === 'walk' && !reduced;
  const gait = walking ? walkLimbPose(t, 0) : { armR: 0, armL: 0, hipR: 0, hipL: 0 };
  const blend = Math.min(1, dt * 8);
  for (const side of ['R', 'L']) {
    for (const [name, angle] of [['arm', gait['arm' + side]], ['leg', gait['hip' + side]],
      ['knee', walking ? walkKneeAngle(gait['hip' + side]) : 0]]) {
      const rotation = limbs[name + side].rotation;
      rotation.x += (angle - rotation.x) * blend;
    }
  }
}
