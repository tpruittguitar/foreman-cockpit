/* Zach: a young visitor who walks about the office doing small idle things (Tim, Nov 19, 2026).
   He is a person, not a bot: no bot_id, desk, status, card, screen, chat or Needs Tim, and no office data moves him.
   Model: Tim's own Tripo model, baked by tools/zach-glb/bake.py into office/assets/zach.glb (metres, feet on y=0, facing +z,
   L.ZACH.height tall, which stays at or under 3/4 of the President's 1.45 m). The mesh has no skeleton, so he moves as one piece:
   a waddle and bob when he walks, and a small whole-body motion per idle task (office-logic zachMotion). */
import * as THREE from 'three';

const ZACH_GLB = new URL('./assets/zach.glb', import.meta.url).href;

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
      const mesh = new THREE.Mesh(m.geometry, mat); mesh.userData.charName = name; mesh.castShadow = false;
      return mesh;
    });
}

/* Switched off: free everything the model holds on the GPU and in memory. */
export function disposeZachMesh(mesh) {
  if (!mesh) return;
  if (mesh.parent) mesh.parent.remove(mesh);
  const mat = mesh.material, map = mat && mat.map;
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
export function poseZach(z, m) {
  z.rig.position.y = m.y;
  z.rig.rotation.set(m.pitch, m.yaw, m.roll, 'YXZ');
  z.rig.scale.set(m.sxz, m.sy, m.sxz);
}
