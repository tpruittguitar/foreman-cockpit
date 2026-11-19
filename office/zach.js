/* Zach: a young visitor who walks about the office doing small idle things (Tim, Nov 19, 2026).
   He is a person, not a bot: no bot_id, desk, status, card, screen, chat or Needs Tim, and no office data moves him.
   Model: Tim's own Tripo model, baked by tools/zach-glb/bake.py into office/assets/zach.glb (metres, feet on y=0, facing +z,
   L.ZACH.height tall, which stays at or under 3/4 of the President's 1.45 m). The mesh has no skeleton, so he moves as one piece:
   a waddle and bob when he walks, and a small whole-body motion per idle task (office-logic zachMotion). */
import * as THREE from 'three';

const ZACH_GLB = new URL('./assets/zach.glb', import.meta.url).href;
let asset = null;
function loadZachAsset() {
  return asset || (asset = import('./vendor/three/addons/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(ZACH_GLB))
    .then(gltf => { let m = null; gltf.scene.traverse(o => { if (o.isMesh && !m) m = o; }); return m; }));
}

/* root: floor position and heading. rig: the motion pivot at the feet (bob, waddle, lean, squash). */
export function makeZach(L) {
  const Z = L.ZACH, root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig); root.name = Z.name;
  const z = { name: Z.name, root, rig, top: Z.height, radius: Z.radius, pose: 'stand', path: [], task: null, mesh: null, kind: 'visitor' };
  z.ready = loadZachAsset().then(m => {
    const mat = new THREE.MeshStandardMaterial({ map: m.material.map, roughness: 0.8, metalness: 0 });
    const mesh = new THREE.Mesh(m.geometry, mat); mesh.userData.charName = Z.name; mesh.castShadow = false;
    rig.add(mesh); z.mesh = mesh; return z;
  }).catch(e => { console.warn('Zach model failed to load', e); return z; });
  return z;
}

/* Apply one frame of motion from office-logic zachMotion: m = { y, roll, pitch, yaw, sy, sxz }. */
export function poseZach(z, m) {
  z.rig.position.y = m.y;
  z.rig.rotation.set(m.pitch, m.yaw, m.roll, 'YXZ');
  z.rig.scale.set(m.sxz, m.sy, m.sxz);
}
