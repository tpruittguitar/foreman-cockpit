/* Fully 3D characters from Three.js primitives: glossy jelly-blob bots extruded from each bot's sidebar avatar mark,
   with stubby arms and legs and simple expressive 3D faces; President as a minifigure with a 3D chibi head.
   No models, sprites, billboards or textures. Procedural animation only. */
import * as THREE from 'three';
import { avatarFor, shapePoints } from './avatars.js';

const G = {}; // shared geometries
function geo(key, make) { return G[key] || (G[key] = make()); }
const M = {}; // shared materials
function mat(key, make) { return M[key] || (M[key] = make()); }
const black = () => mat('black', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.25 }));
const white = () => mat('white', () => new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4 }));

function jelly(color, hi) {
  return hi
    ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3, sheenColor: new THREE.Color(0xffffff) })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.02 });
}

/* ---------- markers ---------- */
function roundedTri(r, rad) {
  const s = new THREE.Shape(), v = [0, 1, 2].map(i => new THREE.Vector2(Math.cos(Math.PI / 2 + i * 2.0944) * r, Math.sin(Math.PI / 2 + i * 2.0944) * r));
  for (let i = 0; i < 3; i++) {
    const p = v[(i + 2) % 3], q = v[i], n = v[(i + 1) % 3];
    const a = q.clone().add(p.clone().sub(q).setLength(rad)), b = q.clone().add(n.clone().sub(q).setLength(rad));
    if (i === 0) s.moveTo(a.x, a.y); else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(q.x, q.y, b.x, b.y);
  }
  s.closePath(); return s;
}
export function makeWarn() {
  const g = new THREE.Group();
  const tri = new THREE.Mesh(geo('warnTri', () => { const x = new THREE.ExtrudeGeometry(roundedTri(0.22, 0.05), { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }); x.center(); return x; }),
    mat('warnRed', () => new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff1a1a, emissiveIntensity: 0.9, roughness: 0.35 })));
  const bar = new THREE.Mesh(geo('warnBar', () => new THREE.BoxGeometry(0.035, 0.11, 0.03)), white());
  bar.position.set(0, 0.0, 0.045);
  const dot = new THREE.Mesh(geo('warnDot', () => new THREE.SphereGeometry(0.022, 10, 8)), white());
  dot.position.set(0, -0.085, 0.045);
  const back = bar.clone(); back.position.z = -0.045; const backDot = dot.clone(); backDot.position.z = -0.045;
  g.add(tri, bar, dot, back, backDot);
  g.userData.mat = tri.material;
  return g;
}
export function makeQuestion() {
  const g = new THREE.Group(), m = mat('quest', () => new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffc400, emissiveIntensity: 0.6 }));
  const arc = new THREE.Mesh(geo('qArc', () => new THREE.TorusGeometry(0.06, 0.02, 8, 20, Math.PI * 1.4)), m);
  arc.rotation.z = -0.55; arc.position.y = 0.07;
  const stem = new THREE.Mesh(geo('qStem', () => new THREE.CapsuleGeometry(0.02, 0.03, 3, 8)), m); stem.position.y = -0.02;
  const dot = new THREE.Mesh(geo('qDot', () => new THREE.SphereGeometry(0.025, 10, 8)), m); dot.position.y = -0.1;
  g.add(arc, stem, dot); return g;
}
function zShape() {
  const s = new THREE.Shape(); const w = 0.09, h = 0.1, t = 0.025;
  s.moveTo(-w, h); s.lineTo(w, h); s.lineTo(w, h - t); s.lineTo(-w + t * 1.6, -h + t); s.lineTo(w, -h + t); s.lineTo(w, -h);
  s.lineTo(-w, -h); s.lineTo(-w, -h + t); s.lineTo(w - t * 1.6, h - t); s.lineTo(-w, h - t); s.closePath(); return s;
}
export function makeZzz() {
  const g = new THREE.Group(), m = mat('zzz', () => new THREE.MeshStandardMaterial({ color: 0xcfe3ff, emissive: 0x8fb8ff, emissiveIntensity: 0.6 }));
  const zg = geo('z', () => { const x = new THREE.ExtrudeGeometry(zShape(), { depth: 0.025, bevelEnabled: false }); x.center(); return x; });
  for (let i = 0; i < 3; i++) { const z = new THREE.Mesh(zg, m); z.userData.phase = i / 3; g.add(z); }
  return g;
}
function makeCup() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo('cup', () => new THREE.CylinderGeometry(0.042, 0.034, 0.1, 14)), white()));
  const top = new THREE.Mesh(geo('cupTop', () => new THREE.CylinderGeometry(0.037, 0.037, 0.008, 14)), mat('coffee', () => new THREE.MeshStandardMaterial({ color: 0x4a2a17 })));
  top.position.y = 0.047; g.add(top); return g;
}
function makeCan() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo('can', () => new THREE.CylinderGeometry(0.033, 0.033, 0.125, 14)), mat('canW', () => new THREE.MeshStandardMaterial({ color: 0xf6f6f6, metalness: 0.5, roughness: 0.25 }))));
  const band = new THREE.Mesh(geo('canBand', () => new THREE.CylinderGeometry(0.0345, 0.0345, 0.03, 14)), black()); band.position.y = 0.01; g.add(band);
  const lid = new THREE.Mesh(geo('canLid', () => new THREE.CylinderGeometry(0.03, 0.03, 0.006, 12)), mat('alu', () => new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3 }))); lid.position.y = 0.065; g.add(lid);
  return g;
}
function makeCue() {
  const m = new THREE.Mesh(geo('cue', () => new THREE.CylinderGeometry(0.009, 0.016, 1.3, 8)), mat('cueWood', () => new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.5 })));
  m.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(m); return g;
}

/* ---------- faces ---------- */
function makeFace(frontZ, scale, eyeDark) {
  const f = new THREE.Group(); f.position.z = frontZ;
  const eyeM = black();
  const eye = geo('eye', () => new THREE.SphereGeometry(1, 14, 10));
  const eyes = [-1, 1].map(sx => { const e = new THREE.Mesh(eye, eyeM); e.scale.set(0.042 * scale, 0.072 * scale, 0.03); e.position.set(sx * 0.085 * scale, 0.05 * scale, 0); f.add(e); return e; });
  const shine = geo('shine', () => new THREE.SphereGeometry(1, 8, 6));
  eyes.forEach(e => { const s = new THREE.Mesh(shine, white()); s.scale.set(0.012 * scale, 0.016 * scale, 0.01); s.position.set(e.position.x + 0.012 * scale, e.position.y + 0.025 * scale, 0.024); f.add(s); });
  const arcG = geo('arc', () => new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI));
  const smile = new THREE.Mesh(arcG, eyeM); smile.rotation.z = Math.PI; smile.position.set(0, -0.05 * scale, 0.005); smile.scale.setScalar(scale);
  const frown = new THREE.Mesh(arcG, eyeM); frown.position.set(0, -0.1 * scale, 0.005); frown.scale.set(scale * 0.8, scale * 0.6, scale);
  const flat = new THREE.Mesh(geo('flat', () => new THREE.CapsuleGeometry(0.011, 0.045, 2, 6)), eyeM); flat.rotation.z = Math.PI / 2 + 0.25; flat.position.set(0.02 * scale, -0.07 * scale, 0.005);
  const oh = new THREE.Mesh(geo('oh', () => new THREE.TorusGeometry(0.022, 0.009, 6, 12)), eyeM); oh.position.set(0, -0.07 * scale, 0.005);
  const browG = geo('brow', () => new THREE.CapsuleGeometry(0.01, 0.055, 2, 6));
  const brows = [-1, 1].map(sx => { const b = new THREE.Mesh(browG, eyeM); b.rotation.z = Math.PI / 2; b.position.set(sx * 0.085 * scale, 0.16 * scale, 0.004); f.add(b); return b; });
  const lids = [-1, 1].map(sx => { const l = new THREE.Mesh(arcG, eyeM); l.scale.set(0.55 * scale, 0.5 * scale, scale); l.rotation.z = Math.PI; l.position.set(sx * 0.085 * scale, 0.05 * scale, 0.004); f.add(l); return l; });
  const drop = new THREE.Mesh(geo('drop', () => new THREE.SphereGeometry(0.025, 10, 8)), mat('drop', () => new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: 0.1, transparent: true, opacity: 0.85 })));
  drop.scale.set(0.8, 1.2, 0.6); drop.position.set(0.2 * scale, 0.12 * scale, -0.01);
  f.add(smile, frown, flat, oh, drop);
  let cur = '';
  f.userData.set = expr => {
    if (expr === cur) return; cur = expr;
    smile.visible = expr === 'happy' || expr === 'neutral';
    smile.scale.y = expr === 'neutral' ? 0.45 * scale : scale;
    frown.visible = expr === 'worried';
    flat.visible = expr === 'puzzled';
    oh.visible = expr === 'sleepy';
    drop.visible = expr === 'worried';
    const sleepy = expr === 'sleepy';
    eyes.forEach(e => (e.visible = !sleepy)); lids.forEach(l => (l.visible = sleepy));
    brows.forEach((b, i) => {
      b.visible = expr === 'worried' || expr === 'puzzled';
      const sx = i ? 1 : -1;
      if (expr === 'worried') { b.rotation.z = Math.PI / 2 - sx * 0.45; b.position.y = 0.155 * scale; }
      else { b.rotation.z = Math.PI / 2 + (i ? -0.2 : 0); b.position.y = (i ? 0.18 : 0.15) * scale; b.visible = expr === 'puzzled' && i === 1 ? true : expr === 'worried'; }
    });
  };
  return f;
}

/* ---------- limbs ---------- */
function limb(radius, len, m, key) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(geo(key, () => new THREE.CapsuleGeometry(radius, len, 4, 10)), m);
  mesh.position.y = -(len / 2 + radius) * 0.85; pivot.add(mesh); pivot.userData.len = len + radius * 2; return pivot;
}

/* ---------- jelly bot ---------- */
export function makeBot(name, hiQuality) {
  const a = avatarFor(name);
  if (a.shape === 'minifig') return makePresident(hiQuality);
  const key = 'body:' + a.shape + ':' + a.rot;
  const bodyG = geo(key, () => {
    const pts = shapePoints(a).map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.13, bevelSize: 0.08, bevelSegments: hiQuality ? 6 : 3, curveSegments: 8 });
    g.center(); g.scale(0.85, 0.85, 0.85); g.computeBoundingBox(); g.computeVertexNormals(); return g;
  });
  const bb = bodyG.boundingBox, halfH = (bb.max.y - bb.min.y) / 2, halfW = (bb.max.x - bb.min.x) / 2;
  const bodyM = jelly(a.color, hiQuality);
  const root = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  root.add(rig); rig.add(body);
  const legLen = 0.16;
  body.position.y = legLen + halfH - 0.02;
  const mesh = new THREE.Mesh(bodyG, bodyM); body.add(mesh);
  const face = makeFace(bb.max.z - 0.012, 1.0); face.position.y = 0.02; body.add(face);
  const limbM = bodyM;
  const armR = limb(0.052, 0.1, limbM, 'arm'), armL = limb(0.052, 0.1, limbM, 'arm');
  const ax = Math.min(halfW - 0.05, 0.33);
  armR.position.set(-ax, -0.06, 0.02); armL.position.set(ax, -0.06, 0.02);
  armR.rotation.z = -0.45; armL.rotation.z = 0.45;
  body.add(armR, armL);
  const legR = limb(0.055, 0.07, limbM, 'leg'), legL = limb(0.055, 0.07, limbM, 'leg');
  legR.position.set(-0.11, legLen - 0.01, 0); legL.position.set(0.11, legLen - 0.01, 0);
  rig.add(legR, legL);
  return finish({ name, root, rig, body, armR, armL, legR, legL, face, mats: [bodyM], colors: [new THREE.Color(a.color)], top: legLen + halfH * 2, sitLift: 0.34, kind: 'bot' });
}

/* ---------- President: minifigure body, 3D chibi head modeled on the avatar ---------- */
function makePresident(hi) {
  const skin = new THREE.MeshStandardMaterial({ color: 0xf5d2b0, roughness: 0.55 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.6 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x3a3a3d, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a1f1a, roughness: 0.55 });
  const root = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  root.add(rig); rig.add(body);
  // legs (pivot at hip)
  const leg = () => { const p = new THREE.Group(); const m = new THREE.Mesh(geo('pLeg', () => new THREE.BoxGeometry(0.13, 0.32, 0.16)), pants); m.position.y = -0.16; p.add(m);
    const shoe = new THREE.Mesh(geo('pShoe', () => new THREE.BoxGeometry(0.135, 0.05, 0.19)), mat('shoe', () => new THREE.MeshStandardMaterial({ color: 0xe8e8e8 }))); shoe.position.set(0, -0.31, 0.02); p.add(shoe); return p; };
  const legR = leg(), legL = leg(); legR.position.set(-0.075, 0.36, 0); legL.position.set(0.075, 0.36, 0); rig.add(legR, legL);
  const hips = new THREE.Mesh(geo('pHips', () => new THREE.BoxGeometry(0.3, 0.07, 0.17)), pants); hips.position.y = 0.38; rig.add(hips);
  body.position.y = 0.41;
  // torso: tapered 4-sided cylinder = minifig trapezoid
  const torso = new THREE.Mesh(geo('pTorso', () => { const g = new THREE.CylinderGeometry(0.15, 0.2, 0.34, 4, 1); g.rotateY(Math.PI / 4); g.scale(1.05, 1, 0.62); return g; }), jacket);
  torso.position.y = 0.17; body.add(torso);
  const zip = new THREE.Mesh(geo('pZip', () => new THREE.BoxGeometry(0.008, 0.3, 0.01)), mat('zip', () => new THREE.MeshStandardMaterial({ color: 0x55565a, metalness: 0.6 }))); zip.position.set(0, 0.17, 0.095); body.add(zip);
  // popped collar
  const collar = new THREE.Mesh(geo('pCollar', () => new THREE.CylinderGeometry(0.105, 0.125, 0.11, 16, 1, true)), new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.6, side: THREE.DoubleSide }));
  collar.position.y = 0.37; body.add(collar);
  const neck = new THREE.Mesh(geo('pNeck', () => new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12)), skin); neck.position.y = 0.37; body.add(neck);
  // arms + C hands
  const arm = side => { const p = new THREE.Group(); const m = new THREE.Mesh(geo('pArm', () => new THREE.CylinderGeometry(0.045, 0.05, 0.26, 10)), jacket); m.position.y = -0.12; p.add(m);
    const hand = new THREE.Mesh(geo('pHand', () => new THREE.TorusGeometry(0.035, 0.018, 8, 14, Math.PI * 1.5)), skin); hand.position.y = -0.27; hand.rotation.y = Math.PI / 2; p.add(hand); p.userData.len = 0.3; p.position.set(side * 0.2, 0.31, 0); p.rotation.z = side * 0.12; return p; };
  const armR = arm(-1), armL = arm(1); body.add(armR, armL);
  // chibi head
  const head = new THREE.Group(); head.position.y = 0.6; body.add(head);
  const skull = new THREE.Mesh(geo('pHead', () => new THREE.SphereGeometry(0.21, hi ? 28 : 18, hi ? 20 : 14)), skin); skull.scale.set(1.08, 1, 0.98); head.add(skull);
  const cap = new THREE.Mesh(geo('pHair', () => new THREE.SphereGeometry(0.228, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)), hair); cap.scale.set(1.08, 1, 1.0); cap.rotation.x = -0.25; cap.position.y = 0.01; head.add(cap);
  const spikeG = geo('pSpike', () => new THREE.ConeGeometry(0.05, 0.16, 6));
  const spikes = [[0, 0.2, 0.12, -0.9, 0], [-0.1, 0.19, 0.12, -0.8, 0.5], [0.1, 0.19, 0.12, -0.8, -0.5], [-0.18, 0.12, 0.1, -0.5, 1.0], [0.18, 0.12, 0.1, -0.5, -1.0],
    [0, 0.24, -0.02, 0.1, 0], [-0.12, 0.22, -0.08, 0.5, 0.6], [0.12, 0.22, -0.08, 0.5, -0.6], [-0.2, 0.06, -0.06, 0.3, 1.4], [0.2, 0.06, -0.06, 0.3, -1.4], [0, 0.12, -0.2, 1.3, 0], [-0.06, 0.14, 0.17, -1.3, 0.3], [0.07, 0.13, 0.17, -1.35, -0.25]];
  for (const [x, y, z, rx, rz] of spikes) { const s = new THREE.Mesh(spikeG, hair); s.position.set(x, y, z); s.rotation.set(rx, 0, rz); head.add(s); }
  const face = makeFace(0.2, 1.25); face.position.y = -0.03; head.add(face);
  const blushM = mat('blush', () => new THREE.MeshStandardMaterial({ color: 0xff9aa2, roughness: 0.8 }));
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(geo('blush', () => new THREE.SphereGeometry(0.03, 10, 8)), blushM); b.scale.set(1.2, 0.6, 0.35); b.position.set(sx * 0.13, -0.07, 0.185); head.add(b); }
  return finish({ name: 'President', root, rig, body, armR, armL, legR, legL, face, mats: [jacket, skin], colors: [jacket.color.clone(), skin.color.clone()], top: 1.25, sitLift: 0.09, kind: 'president', head });
}

function finish(c) {
  const r = c.armR, l = c.armL;
  c.rest = { armR: r.rotation.clone(), armL: l.rotation.clone() };
  const hold = new THREE.Group(); hold.position.y = -(r.userData.len || 0.2) * 0.95; r.add(hold);
  c.cup = makeCup(); c.can = makeCan(); c.cue = makeCue();
  c.cup.visible = c.can.visible = c.cue.visible = false;
  hold.add(c.cup, c.can); c.body.add(c.cue); c.cue.position.set(-0.05, 0.05, 0.35);
  c.warn = makeWarn(); c.warn.position.y = c.top + 0.32; c.warn.visible = false; c.root.add(c.warn);
  c.quest = makeQuestion(); c.quest.position.y = c.top + 0.25; c.quest.visible = false; c.root.add(c.quest);
  c.zzz = makeZzz(); c.zzz.visible = false; c.root.add(c.zzz);
  c.grey = new THREE.Color(0x6d6f73);
  c.setFrozen = on => c.mats.forEach((m, i) => m.color.copy(on ? c.grey : c.colors[i]));
  c.setExpression = e => c.face.userData.set(e);
  c.setExpression('happy');
  c.root.traverse(o => { if (o.isMesh) o.userData.charName = c.name; });
  return c;
}

/* ---------- procedural animation: one pose per frame ---------- */
const lerp = (a, b, k) => a + (b - a) * k;
export function animate(c, pose, t, dt, opts) {
  const k = Math.min(1, dt * 8), still = opts.reduced;
  const ph = c.phase || 0;
  let armR = { x: 0, z: c.rest.armR.z }, armL = { x: 0, z: c.rest.armL.z }, legX = 0, lift = 0, bob = 0, lieZ = 0, lieY = 0;
  c.cup.visible = (pose === 'coffee' && opts.holding);
  c.can.visible = (pose === 'fridge' && opts.holding);
  c.cue.visible = pose === 'pool';
  c.zzz.visible = pose === 'nap';
  const sideR = 1;
  switch (pose) {
    case 'walk': {
      const s = Math.sin(t * 9 + ph); legX = s * 0.6; armR.x = -s * 0.5; armL.x = s * 0.5; bob = Math.abs(Math.cos(t * 9 + ph)) * 0.03; break;
    }
    case 'sit': case 'type': {
      lift = c.sitLift; legX = -1.45;
      if (pose === 'type' && !still) { armR.x = -1.15 + 0.2 * Math.sin(t * 15 + ph); armL.x = -1.15 + 0.2 * Math.sin(t * 15 + ph + Math.PI); bob = 0.012 * Math.sin(t * 4 + ph); }
      else { armR.x = -1.0; armL.x = -1.0; }
      break;
    }
    case 'wave': {
      armR.z = -(2.55 + (still ? 0 : 0.35 * Math.sin(t * 9 + ph))) * sideR; armR.x = 0;
      bob = still ? 0 : Math.abs(Math.sin(t * 4.5 + ph)) * 0.025; break;
    }
    case 'pool': {
      const stroke = still ? 0 : Math.max(0, Math.sin(t * 1.6 + ph)) ** 3;
      armR.x = -1.3; armL.x = -1.45; c.cue.position.z = 0.35 + stroke * 0.18; c.cue.position.y = 0.0; bob = 0; break;
    }
    case 'nap': {
      lieZ = Math.PI / 2; lieY = c.kind === 'president' ? 0.75 : 0.88; legX = -0.2;
      const br = still ? 1 : 1 + 0.035 * Math.sin(t * 1.4 + ph); c.body.scale.set(br, br, br);
      c.zzz.children.forEach((z, i) => { const p = ((t * 0.25 + z.userData.phase) % 1); z.position.set(0.15 + p * 0.2, c.top * 0.6 + p * 0.5, 0); z.scale.setScalar(0.5 + p); });
      break;
    }
    case 'coffee': case 'fridge': {
      if (!opts.holding) { armR.x = -1.4; } // reaching
      else { const sip = still ? 0 : Math.max(0, Math.sin(t * 0.9 + ph)) ** 6; armR.x = -0.6 - sip * 1.4; armR.z = c.rest.armR.z - sip * 0.5; }
      break;
    }
    case 'board': armR.x = -2.4; armR.z = c.rest.armR.z; break;
    case 'talk': if (!still) { armR.x = -0.5 + 0.35 * Math.sin(t * 3 + ph); armL.x = -0.3 + 0.2 * Math.sin(t * 2.3 + ph); } bob = still ? 0 : 0.01 * Math.sin(t * 6); break;
    case 'frozen': break;
    default: if (!still) bob = 0.008 * Math.sin(t * 2 + ph); // stand / loiter
  }
  if (pose !== 'nap' && c.body.scale.x !== 1) c.body.scale.set(1, 1, 1);
  c.armR.rotation.x = lerp(c.armR.rotation.x, armR.x, k); c.armR.rotation.z = lerp(c.armR.rotation.z, armR.z, k);
  c.armL.rotation.x = lerp(c.armL.rotation.x, armL.x, k); c.armL.rotation.z = lerp(c.armL.rotation.z, armL.z, k);
  c.legR.rotation.x = lerp(c.legR.rotation.x, pose === 'walk' ? legX : legX, k);
  c.legL.rotation.x = lerp(c.legL.rotation.x, pose === 'walk' ? -legX : legX, k);
  c.rig.position.y = lerp(c.rig.position.y, lift + bob + lieY, k);
  c.rig.rotation.z = lerp(c.rig.rotation.z, lieZ, Math.min(1, dt * 4));
  c.rig.rotation.x = 0;
}
