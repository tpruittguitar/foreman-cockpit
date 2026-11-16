/* Fully 3D characters from Three.js primitives: glossy jelly-blob bots extruded from each bot's sidebar avatar mark,
   with stubby arms and legs and simple expressive 3D faces; President as a minifigure with a 3D chibi head.
   No models, sprites, billboards or textures. Procedural animation only. */
import * as THREE from 'three';
import { avatarFor, shapePoints } from './avatars.js';
import { drawCanLabel } from './draw.js';

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
/* Sleeping Zzz: three Zs that float up, grow and fade out, looping (one small material per Z so each can fade). */
export function makeZzz() {
  const g = new THREE.Group();
  const zg = geo('z', () => { const x = new THREE.ExtrudeGeometry(zShape(), { depth: 0.025, bevelEnabled: false }); x.center(); return x; });
  for (let i = 0; i < 3; i++) { const z = new THREE.Mesh(zg, new THREE.MeshStandardMaterial({ color: 0xcfe3ff, emissive: 0x8fb8ff, emissiveIntensity: 0.6, transparent: true, depthWrite: false })); z.userData.phase = i / 3; g.add(z); }
  return g;
}
export function floatZzz(zzz, t, x0, y0, z0) {
  zzz.children.forEach(z => { const p = (t * 0.3 + z.userData.phase) % 1; z.position.set(x0 + p * 0.22 + Math.sin(p * 6.28) * 0.03, y0 + p * 0.55, z0); z.scale.setScalar(0.45 + p * 0.8); z.material.opacity = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85; });
}
function makeCup() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo('cup', () => new THREE.CylinderGeometry(0.042, 0.034, 0.1, 14)), white()));
  const top = new THREE.Mesh(geo('cupTop', () => new THREE.CylinderGeometry(0.037, 0.037, 0.008, 14)), mat('coffee', () => new THREE.MeshStandardMaterial({ color: 0x4a2a17 })));
  top.position.y = 0.047; g.add(top); return g;
}
/* Energy can, shared by held cans and the instanced cans on desks and in the fridge: one geometry, one canvas texture.
   Cylinder groups: side (black wrap with the green claw "M"), top and bottom (aluminium). */
/* Energy cans: a MIX of two lookalike styles (style 0 = black with a green claw-style mark, style 1 = white with a
   silver claw-style mark). Procedural lookalike marks only, no real brand artwork. One geometry, one texture per style. */
export const canGeometry = () => geo('can', () => new THREE.CylinderGeometry(0.033, 0.033, 0.125, 16));
export const canStyle = seed => { let h = 7; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 2; };
export function canMaterials(style = 0) {
  return mat('canMats' + style, () => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; drawCanLabel(c.getContext('2d'), 256, 128, style);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const alu = mat('alu', () => new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3 }));
    return [new THREE.MeshStandardMaterial({ map: t, metalness: 0.45, roughness: 0.3, emissive: style ? 0x202226 : 0x0d2a08, emissiveIntensity: 0.4 }), alu, alu];
  });
}
function makeCan(style) { const g = new THREE.Group(); g.add(new THREE.Mesh(canGeometry(), canMaterials(style))); return g; }
function makeCue() {
  const m = new THREE.Mesh(geo('cue', () => new THREE.CylinderGeometry(0.009, 0.016, 1.3, 8)), mat('cueWood', () => new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.5 })));
  m.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(m); return g;
}

/* ---------- faces ----------
   Every face keeps all its parts and drives them from a set of expression WEIGHTS (L.exprParams) plus a blink amount, so a
   change of expression eases in (L.blendExpression) instead of snapping, and eyes blink at random (L.createBlinker). */
function makeFace(frontZ, scale, eyeDark, noMouth, tilt) {
  const f = new THREE.Group(); f.position.z = frontZ;
  const eyeM = black();
  const eye = geo('eye', () => new THREE.SphereGeometry(1, 20, 14));
  const eyes = [-1, 1].map(sx => { const e = new THREE.Mesh(eye, eyeM); e.userData.sy = 0.072 * scale; e.scale.set(0.042 * scale, e.userData.sy, 0.03); e.position.set(sx * 0.085 * scale, 0.05 * scale, 0); e.rotation.z = tilt || 0; f.add(e); return e; });
  const shine = geo('shine', () => new THREE.SphereGeometry(1, 8, 6));
  const shines = eyes.map(e => { const s = new THREE.Mesh(shine, white()); s.scale.set(0.012 * scale, 0.016 * scale, 0.01); s.position.set(e.position.x + 0.012 * scale, e.position.y + 0.025 * scale, 0.024); f.add(s); return s; });
  const arcG = geo('arc', () => new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI));
  const smile = new THREE.Mesh(arcG, eyeM); smile.rotation.z = Math.PI; smile.position.set(0, -0.05 * scale, 0.005);
  const frown = new THREE.Mesh(arcG, eyeM); frown.position.set(0, -0.1 * scale, 0.005);
  const flat = new THREE.Mesh(geo('flat', () => new THREE.CapsuleGeometry(0.011, 0.045, 2, 6)), eyeM); flat.rotation.z = Math.PI / 2 + 0.25; flat.position.set(0.02 * scale, -0.07 * scale, 0.005);
  const oh = new THREE.Mesh(geo('oh', () => new THREE.TorusGeometry(0.022, 0.009, 6, 12)), eyeM); oh.position.set(0, -0.07 * scale, 0.005);
  const browG = geo('brow', () => new THREE.CapsuleGeometry(0.01, 0.055, 2, 6));
  const brows = [-1, 1].map(sx => { const b = new THREE.Mesh(browG, eyeM); b.rotation.z = Math.PI / 2; b.position.set(sx * 0.085 * scale, 0.16 * scale, 0.004); f.add(b); return b; });
  const lids = [-1, 1].map(sx => { const l = new THREE.Mesh(arcG, eyeM); l.rotation.z = Math.PI; l.position.set(sx * 0.085 * scale, 0.05 * scale, 0.004); f.add(l); return l; });
  const drop = new THREE.Mesh(geo('drop', () => new THREE.SphereGeometry(0.025, 10, 8)), mat('drop', () => new THREE.MeshStandardMaterial({ color: 0x9fd3ff, roughness: 0.1, transparent: true, opacity: 0.85 })));
  drop.position.set(0.2 * scale, 0.12 * scale, -0.01);
  f.add(smile, frown, flat, oh, drop);
  const W = v => Math.max(0.02, v);
  f.userData.apply = (p, blink) => {
    const open = (1 - p.lid) * (1 - blink);
    eyes.forEach((e, i) => { e.visible = p.lid < 0.6; e.scale.y = e.userData.sy * Math.max(0.1, open); shines[i].visible = e.visible && open > 0.5; });
    lids.forEach(l => { l.visible = p.lid > 0.05; l.scale.set(0.55 * scale, 0.5 * scale * W(p.lid), scale); });
    smile.visible = !noMouth && p.smile > 0.02; smile.scale.set(scale, scale * W(p.smile), scale);
    frown.visible = !noMouth && p.frown > 0.02; frown.scale.set(scale * 0.8, scale * 0.6 * W(p.frown), scale);
    flat.visible = !noMouth && p.flat > 0.02; flat.scale.setScalar(W(p.flat));
    oh.visible = !noMouth && p.oh > 0.02; oh.scale.setScalar(W(p.oh));
    drop.visible = p.drop > 0.02; drop.scale.set(0.8 * W(p.drop), 1.2 * W(p.drop), 0.6 * W(p.drop));
    brows.forEach((b, i) => {
      const sx = i ? 1 : -1, w = p.worry + (i === 1 ? p.puzzle : 0);
      b.visible = w > 0.03; b.scale.set(1, W(Math.min(1, w)), 1);
      b.rotation.z = Math.PI / 2 - sx * 0.45 * p.worry + (i ? -0.2 : 0) * p.puzzle;
      b.position.y = (0.15 + 0.005 * p.worry + (i ? 0.03 : 0) * p.puzzle) * scale;
    });
  };
  f.userData.eyes = eyes; f.userData.shines = shines; f.userData.brows = brows;
  f.userData.apply(window.OfficeLogic.exprParams('happy'), 0);
  return f;
}

/* ---------- limbs ---------- */
function limb(radius, len, m, key) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(geo(key, () => new THREE.CapsuleGeometry(radius, len, 4, 10)), m);
  mesh.position.y = -(len / 2 + radius) * 0.85; pivot.add(mesh); pivot.userData.len = len + radius * 2; return pivot;
}

/* ---------- jelly bot ---------- */
export function makeBot(name, hiQuality, botId, override) {
  const a = avatarFor(name, botId, override);
  if (a.shape === 'minifig') return makePresident(hiQuality);
  const key = 'body:' + a.shape + ':' + a.rot;
  const bodyG = geo(key, () => {
    const pts = shapePoints(a).map(([x, y]) => new THREE.Vector2(x, y));
    // Tim item 7: rounded 3D bodies, not flat front and back. Thin slab + deep round bevel, then the faces are pushed out
    // into a pillow dome (strongest at the centre, none at the rim) so the front and back are curved too.
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.09, bevelSegments: hiQuality ? 10 : 6, curveSegments: 14 });
    g.center(); g.computeBoundingBox();
    const hb = g.boundingBox, hx = (hb.max.x - hb.min.x) / 2, hy = (hb.max.y - hb.min.y) / 2, pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const nx = pos.getX(i) / hx, ny = pos.getY(i) / hy, r2 = Math.min(1, nx * nx * 0.5 + ny * ny * 0.5 + Math.abs(nx * ny) * 0.0), dome = 0.16 * Math.pow(1 - r2, 0.8);
      pos.setZ(i, pos.getZ(i) + Math.sign(pos.getZ(i)) * dome);
    }
    g.scale(0.85, 0.85, 0.85); g.computeBoundingBox(); g.computeVertexNormals(); return g;
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
  // props: Gauge wears a dial needle on its face-plate top; Edgar (writer) holds a quill
  if (a.prop === 'gauge') {
    const ring = new THREE.Mesh(geo('gRing', () => new THREE.TorusGeometry(0.2, 0.012, 8, 40, Math.PI)), white()); ring.position.set(0, 0.12, bb.max.z - 0.01); body.add(ring);
    const needle = new THREE.Mesh(geo('gNeedle', () => new THREE.BoxGeometry(0.012, 0.17, 0.01)), mat('needle', () => new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x6a5200 })));
    needle.position.set(0.05, 0.19, bb.max.z); needle.rotation.z = -0.6; body.add(needle);
  }
  const c = finish({ name, root, rig, body, armR, armL, legR, legL, face, mats: [bodyM], colors: [new THREE.Color(a.color)], top: legLen + halfH * 2, sitLift: 0.34, kind: 'bot', generic: !!a.generic });
  if (a.prop === 'quill') {
    const q = new THREE.Group(), feather = new THREE.Mesh(geo('quill', () => { const g = new THREE.SphereGeometry(0.05, 10, 8); g.scale(0.35, 1.6, 0.12); return g; }), white());
    feather.position.y = 0.08; const nib = new THREE.Mesh(geo('nib', () => new THREE.ConeGeometry(0.008, 0.05, 6)), black()); nib.rotation.x = Math.PI; nib.position.y = -0.02;
    q.add(feather, nib); q.rotation.z = 0.5; c.armL.add(q); q.position.y = -(c.armL.userData.len || 0.2) * 0.95;
  }
  return c;
}

/* ---------- President: minifigure-style body with stubby arms/legs, smooth 3D chibi head ----------
   Style from refs/president-chibi.png: big round head, soft skin, messy spiky black hair, small ears, tall oval black eyes,
   pink blush, NO mouth. Outfit from refs/tim-portrait-vw.png: black button-up work shirt with collar and buttons, "Tim" on
   the chest (canvas texture) and a PLAIN round badge on the other side (generic circle, no logo or trademark). */
function shirtTexture() {
  return mat('timShirtTex', () => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
    x.clearRect(0, 0, 256, 128);
    x.fillStyle = '#f2f2f2'; x.font = "700 40px 'Inter PE', system-ui, sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Tim', 64, 64);
    x.strokeStyle = '#f2f2f2'; x.lineWidth = 7; x.beginPath(); x.arc(192, 64, 30, 0, 7); x.stroke(); // plain round badge
    x.fillStyle = '#9aa0a8'; x.beginPath(); x.arc(192, 64, 22, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, depthWrite: false });
  });
}
function makePresident(hi) {
  const seg = hi ? 64 : 32;
  const skin = new THREE.MeshStandardMaterial({ color: 0xf3c29c, roughness: 0.62 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.72 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c2d31, roughness: 0.75 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1d1b1a, roughness: 0.5 });
  const root = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  root.add(rig); rig.add(body);
  // stubby legs (pivot at hip) with rounded shoes
  const leg = () => { const p = new THREE.Group(); const m = new THREE.Mesh(geo('pLeg2', () => new THREE.CapsuleGeometry(0.068, 0.16, 6, 16)), pants); m.position.y = -0.13; p.add(m);
    const shoe = new THREE.Mesh(geo('pShoe2', () => { const g = new THREE.SphereGeometry(0.08, 16, 10); g.scale(0.95, 0.5, 1.35); return g; }), mat('shoe2', () => new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.5 }))); shoe.position.set(0, -0.27, 0.03); p.add(shoe); return p; };
  const legR = leg(), legL = leg(); legR.position.set(-0.08, 0.34, 0); legL.position.set(0.08, 0.34, 0); rig.add(legR, legL);
  body.position.y = 0.36;
  // rounded torso: a smooth tapered cylinder, a little deeper at the chest
  const torso = new THREE.Mesh(geo('pTorso2', () => { const g = new THREE.CylinderGeometry(0.16, 0.2, 0.36, seg, 1); g.scale(1.05, 1, 0.7); return g; }), shirt);
  torso.position.y = 0.18; body.add(torso);
  const shoulders = new THREE.Mesh(geo('pSh', () => { const g = new THREE.SphereGeometry(0.168, seg, 12, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1.05, 0.35, 0.7); return g; }), shirt);
  shoulders.position.y = 0.36; body.add(shoulders);
  // placket + buttons, chest print ("Tim" and the plain badge)
  const placket = new THREE.Mesh(geo('pPlk', () => new THREE.BoxGeometry(0.022, 0.32, 0.006)), mat('plk', () => new THREE.MeshStandardMaterial({ color: 0x29292d, roughness: 0.7 })));
  placket.position.set(0, 0.17, 0.142); placket.rotation.x = -0.11; body.add(placket);
  const btnM = mat('btn', () => new THREE.MeshStandardMaterial({ color: 0x55565c, roughness: 0.4, metalness: 0.3 }));
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(geo('pBtn', () => new THREE.SphereGeometry(0.009, 8, 6)), btnM); b.position.set(0, 0.06 + k * 0.075, 0.137 + k * 0.008); body.add(b); }
  const print = new THREE.Mesh(geo('pPrint', () => new THREE.PlaneGeometry(0.28, 0.14)), shirtTexture()); print.position.set(0, 0.255, 0.142); print.rotation.x = -0.11; body.add(print);
  // collar: two pointed flaps either side of the neck
  const flap = geo('pFlap', () => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.085, 0.02); sh.lineTo(0.02, -0.075); sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 2 }); });
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(flap, shirt); f.scale.x = -sx; f.position.set(sx * 0.012, 0.395, 0.105); f.rotation.x = -0.35; body.add(f); }
  const neck = new THREE.Mesh(geo('pNeck2', () => new THREE.CylinderGeometry(0.055, 0.06, 0.07, 16)), skin); neck.position.y = 0.4; body.add(neck);
  // stubby arms in black sleeves with round hands
  const arm = side => { const p = new THREE.Group(); const m = new THREE.Mesh(geo('pArm2', () => new THREE.CapsuleGeometry(0.052, 0.12, 6, 16)), shirt); m.position.y = -0.1; p.add(m);
    const hand = new THREE.Mesh(geo('pHand2', () => new THREE.SphereGeometry(0.048, 16, 12)), skin); hand.position.y = -0.22; p.add(hand); p.userData.len = 0.26; p.position.set(side * 0.215, 0.33, 0); p.rotation.z = side * 0.18; return p; };
  const armR = arm(-1), armL = arm(1); body.add(armR, armL);
  // big round smooth head
  const head = new THREE.Group(); head.position.y = 0.69; body.add(head);
  const skull = new THREE.Mesh(geo('pHead3', () => new THREE.SphereGeometry(0.25, seg, Math.round(seg * 0.75))), skin); skull.scale.set(1.06, 0.98, 0.96); head.add(skull);
  for (const sx of [-1, 1]) { const ear = new THREE.Mesh(geo('pEar', () => new THREE.SphereGeometry(0.05, 24, 16)), skin); ear.scale.set(0.55, 1, 0.8); ear.position.set(sx * 0.262, -0.02, -0.01); head.add(ear); }
  // Tim item 6 (ref: president_head_ref_1116.png): bigger chibi head, higher polygon count (64x48 skull, bendable 14x8 hair strands),
  // messy black hair with a swept, curled fringe over the forehead and lighter grey tips, tall slanted oval eyes, wide blush, no mouth.
  const hair2 = mat('hair2', () => new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.55 }));
  const strandG = (len, w, bend) => geo('strand' + len + ':' + w + ':' + bend, () => { const g = new THREE.ConeGeometry(w, len, 14, 8); g.translate(0, len / 2, 0); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getY(i) / len; p.setX(i, p.getX(i) + bend * u * u); p.setZ(i, p.getZ(i) * 0.6); } g.computeVertexNormals(); return g; });
  head.scale.setScalar(1.1);
  const cap = new THREE.Mesh(geo('pHair3', () => new THREE.SphereGeometry(0.262, seg, 32, 0, Math.PI * 2, 0, Math.PI * 0.52)), hair); cap.scale.set(1.07, 1.02, 1.0); cap.rotation.x = 0.28; cap.position.set(0, 0.08, -0.03); head.add(cap);
  const back = new THREE.Mesh(geo('pHairB3', () => new THREE.SphereGeometry(0.26, seg, 24, Math.PI, Math.PI, Math.PI * 0.3, Math.PI * 0.42)), hair); back.rotation.x = 0.2; back.scale.set(1.08, 1, 1.02); head.add(back);
  // [x, y, z, rotX, rotZ, len, width, bend, light?]: crown / sides / back tufts
  const tufts = [[0, 0.23, 0.04, -0.5, 0.1, 0.17, 0.08, 0.04], [-0.1, 0.22, 0.05, -0.55, 0.6, 0.17, 0.075, -0.05, 1], [0.12, 0.21, 0.05, -0.55, -0.6, 0.17, 0.075, 0.05],
    [-0.2, 0.14, 0.03, -0.2, 1.15, 0.16, 0.07, -0.05, 1], [0.2, 0.14, 0.03, -0.2, -1.15, 0.16, 0.07, 0.05], [0.04, 0.25, -0.05, 0.25, -0.25, 0.16, 0.08, 0.05, 1],
    [-0.14, 0.23, -0.1, 0.6, 0.6, 0.16, 0.075, -0.04], [0.14, 0.23, -0.1, 0.6, -0.5, 0.16, 0.075, 0.04, 1], [-0.23, 0.04, -0.07, 0.4, 1.6, 0.15, 0.07, -0.04],
    [0.23, 0.04, -0.07, 0.4, -1.6, 0.15, 0.07, 0.04, 1], [0, 0.12, -0.24, 1.5, 0, 0.16, 0.08, 0.03], [-0.1, 0.1, -0.23, 1.35, 0.4, 0.14, 0.07, -0.03, 1], [0.1, 0.1, -0.23, 1.35, -0.4, 0.14, 0.07, 0.03]];
  tufts.forEach(([x, y, z, rx, rz, len, w, bend, lt], k) => { const sp = new THREE.Mesh(strandG(len, w, bend), lt ? hair2 : hair); sp.position.set(x, y, z); sp.rotation.set(rx, k * 0.4, rz); head.add(sp); });
  // swept fringe: long curled strands over the forehead (the curve in the reference), slightly right of centre
  const fringe = [[-0.13, 0.205, 0.17, -1.2, 0.5, 0.2, 0.05, -0.07], [-0.04, 0.215, 0.18, -1.3, 0.1, 0.22, 0.05, 0.06, 1], [0.04, 0.215, 0.18, -1.3, -0.15, 0.25, 0.05, 0.08],
    [0.12, 0.205, 0.17, -1.2, -0.5, 0.22, 0.05, 0.07, 1], [0.19, 0.17, 0.14, -1.0, -0.9, 0.2, 0.05, 0.06], [-0.19, 0.17, 0.14, -1.0, 0.9, 0.18, 0.05, -0.06, 1]];
  fringe.forEach(([x, y, z, rx, rz, len, w, bend, lt]) => { const sp = new THREE.Mesh(strandG(len, w, bend), lt ? hair2 : hair); sp.position.set(x, y, z); sp.rotation.set(rx, 0, rz); head.add(sp); });
  // face: tall slanted oval eyes (closer together than the bots'), big pink blush, no mouth
  const face = makeFace(0.238, 0.95, false, true, -0.2); face.position.y = -0.02; head.add(face);
  face.userData.eyes.forEach((e, i) => { const sx = i ? 1 : -1; e.position.x = sx * 0.1; e.position.y = 0.04; e.scale.x = 0.037 * 0.95 * 1.1; e.userData.sy = 0.072 * 0.95 * 0.95; e.scale.y = e.userData.sy; face.userData.shines[i].position.set(sx * 0.1 + 0.011, 0.066, 0.024); });
  face.userData.brows.forEach((b, i) => (b.position.x = (i ? 1 : -1) * 0.1));
  const blushM = mat('blush3', () => new THREE.MeshStandardMaterial({ color: 0xe9a58d, roughness: 0.9, transparent: true, opacity: 0.8 }));
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(geo('blush3', () => new THREE.SphereGeometry(0.035, 20, 12)), blushM); b.scale.set(1.7, 0.85, 0.25); b.rotation.z = sx * 0.12; b.position.set(sx * 0.14, -0.1, 0.216); head.add(b); }
  return finish({ name: 'President', root, rig, body, armR, armL, legR, legL, face, mats: [shirt, skin], colors: [shirt.color.clone(), skin.color.clone()], top: 1.36, sitLift: 0.1, kind: 'president', head });
}

function finish(c) {
  const r = c.armR, l = c.armL;
  c.rest = { armR: r.rotation.clone(), armL: l.rotation.clone() };
  const hold = new THREE.Group(); hold.position.y = -(r.userData.len || 0.2) * 0.95; r.add(hold);
  c.cup = makeCup(); c.can = makeCan(canStyle(c.name)); c.cue = makeCue();
  c.card = new THREE.Mesh(geo('heldCard', () => new THREE.BoxGeometry(0.12, 0.09, 0.006)), mat('cardM', () => new THREE.MeshStandardMaterial({ color: 0xeef3ff, emissive: 0x334466, emissiveIntensity: 0.4 }))); c.card.visible = false;
  c.box = new THREE.Group(); // item 10: restock box carried to the fridge (plain cardboard, no artwork)
  { const bm = mat('cardboard', () => new THREE.MeshStandardMaterial({ color: 0xb98b56, roughness: 0.8 })), tape = mat('tape', () => new THREE.MeshStandardMaterial({ color: 0xd9c08f, roughness: 0.6 }));
    c.box.add(new THREE.Mesh(geo('boxB', () => new THREE.BoxGeometry(0.3, 0.2, 0.22)), bm)); const t = new THREE.Mesh(geo('boxT', () => new THREE.BoxGeometry(0.06, 0.205, 0.225)), tape); c.box.add(t); }
  c.box.visible = false; c.body.add(c.box); c.box.position.set(0, 0.08, 0.3);
  c.cup.visible = c.can.visible = c.cue.visible = false;
  hold.add(c.cup, c.can, c.card); c.body.add(c.cue); c.cue.position.set(-0.05, 0.05, 0.35);
  c.warn = makeWarn(); c.warn.position.y = c.top + 0.32; c.warn.visible = false; c.root.add(c.warn);
  c.quest = makeQuestion(); c.quest.position.y = c.top + 0.25; c.quest.visible = false; c.root.add(c.quest); // never shown for idle / stale bots (Tim, item 3)
  c.zzz = makeZzz(); c.zzz.visible = false; c.root.add(c.zzz);
  c.grey = new THREE.Color(0x6d6f73);
  c.setFrozen = on => c.mats.forEach((m, i) => m.color.copy(on ? c.grey : c.colors[i]));
  const L = window.OfficeLogic, rng = L.makeRng(L.hash('blink:' + c.name));
  c.expr = L.exprParams('happy'); c.exprTarget = 'happy'; c.blinker = L.createBlinker(rng, 0); c.blinkRng = rng;
  c.setExpression = e => { c.exprTarget = e; };
  c.updateFace = (dt, t) => { // blend towards the target expression, then blink (call once per frame)
    c.expr = L.blendExpression(c.expr, c.exprTarget, dt, 9);
    c.face.userData.apply(c.expr, c.blinkRng ? L.blinkAmount(c.blinker, t, c.blinkRng) : 0);
  };
  c.face.userData.apply(c.expr, 0);
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
  c.can.visible = (pose === 'fridge' && opts.holding) || (!!opts.can && ['talk', 'stand', 'walk'].includes(pose));
  c.cue.visible = pose === 'pool';
  c.box.visible = !!opts.box && (pose === 'walk' || pose === 'restock');
  c.zzz.visible = pose === 'nap' || pose === 'deskSleep';
  c.card.visible = !!opts.carry;
  const sideR = 1;
  let lean = 0, turnY = 0;
  // eager to work: an occasional quick glance (towards the desk / monitor) while standing about
  const glance = still ? 0 : Math.max(0, Math.sin(t * 0.7 + ph * 3) - 0.85) / 0.15;
  switch (pose) {
    case 'walk': {
      const s = Math.sin(t * 9 + ph); legX = s * 0.6; armR.x = -s * 0.5; armL.x = s * 0.5; bob = Math.abs(Math.cos(t * 9 + ph)) * 0.03; if (opts.box) { armR.x = armL.x = -1.25; armR.z = c.rest.armR.z * 0.3; armL.z = c.rest.armL.z * 0.3; } break;
    }
    case 'bike': { // exercise bike: seated, pedalling
      lift = c.sitLift + 0.12; const s = still ? 0 : Math.sin(t * 6 + ph); legX = -1.0 + s * 0.45; armR.x = -1.1; armL.x = -1.1; lean = 0.25; bob = still ? 0 : 0.01 * Math.abs(s);
      c.legR.rotation.x = lerp(c.legR.rotation.x, legX, k); c.legL.rotation.x = lerp(c.legL.rotation.x, -1.0 - s * 0.45, k); legX = null; break;
    }
    case 'lounge': { lift = c.sitLift - 0.04; legX = -1.4; armR.x = -0.5; armL.x = -0.4; lean = -0.12; if (!still) bob = 0.006 * Math.sin(t * 1.2 + ph); turnY = 0.4 * glance; break; }
    case 'sit': case 'type': case 'game': case 'meet': {
      lift = c.sitLift; legX = -1.45;
      if (pose === 'type' && !still) {
        // typing bursts with short pauses to read the monitor; leaning in
        const burst = Math.sin(t * 1.3 + ph) > -0.45 ? 1 : 0;
        armR.x = -1.15 + 0.2 * burst * Math.sin(t * 15 + ph); armL.x = -1.15 + 0.2 * burst * Math.sin(t * 15 + ph + Math.PI);
        bob = 0.012 * Math.sin(t * 4 + ph) * burst; lean = burst ? 0.14 + 0.03 * Math.sin(t * 2.1 + ph) : 0.04;
        turnY = 0.12 * Math.sin(t * 0.55 + ph) * (1 - burst * 0.6); // head/torso moves while reading and typing
      } else if (pose === 'game' && !still) {
        armR.x = -1.2 + 0.12 * Math.sin(t * 22 + ph); armL.x = -1.2 + 0.12 * Math.sin(t * 19 + ph); lean = 0.2; bob = 0.01 * Math.sin(t * 7);
        turnY = 0.06 * Math.sin(t * 2.2 + ph);
      } else if (pose === 'meet' && !still) { armR.x = -0.9 + 0.25 * Math.max(0, Math.sin(t * 2 + ph)); armL.x = -1.0; lean = 0.1; turnY = 0.35 * Math.sin(t * 0.4 + ph); }
      else { armR.x = -1.0; armL.x = -1.0; lean = pose === 'type' ? 0.12 : 0.06; }
      break;
    }
    case 'deskSleep': {
      lift = c.sitLift; legX = -1.45; armR.x = -1.55; armL.x = -1.55; lean = 0.62;
      if (!still) bob = 0.006 * Math.sin(t * 1.4 + ph);
      floatZzz(c.zzz, t, 0.12, c.top + 0.1, 0.25);
      break;
    }
    case 'wave': {
      // needs Tim: stands at its own desk waving both arms, looping
      // (Tim, item 9) ONE arm waves high to get Tim's attention, the other rests
      const w = still ? 0 : Math.sin(t * 9 + ph);
      armR.z = -(2.6 + 0.4 * w) * sideR; armR.x = 0;
      bob = still ? 0 : Math.abs(Math.sin(t * 4.5 + ph)) * 0.012; break;
    }
    case 'pool': {
      const stroke = still ? 0 : opts.stroke != null ? opts.stroke : Math.max(0, Math.sin(t * 1.6 + ph)) ** 3; // opts.stroke: L.poolShot (-0.6 pull back .. 1 strike)
      armR.x = -1.3; armL.x = -1.45; c.cue.position.z = 0.35 + stroke * 0.18; c.cue.position.y = 0.0; lean = 0.18 + 0.1 * stroke; bob = 0; break;
    }
    case 'nap': {
      lieZ = Math.PI / 2; lieY = c.kind === 'president' ? 0.75 : 0.88; legX = -0.2;
      const br = still ? 1 : 1 + 0.035 * Math.sin(t * 1.4 + ph); c.body.scale.set(br, br, br);
      floatZzz(c.zzz, t, 0.15, c.top * 0.6, 0);
      break;
    }
    case 'coffee': case 'fridge': {
      if (!opts.holding) { armR.x = -1.4; } // reaching
      else { const sip = still ? 0 : Math.max(0, Math.sin(t * 0.9 + ph)) ** 6; armR.x = -0.6 - sip * 1.4; armR.z = c.rest.armR.z - sip * 0.5; }
      break;
    }
    case 'stretch': { // short stretch at the desk: both arms up, lean back, slow sway
      const sw = still ? 0 : Math.sin(t * 2 + ph); armR.x = -2.9 + 0.08 * sw; armL.x = -2.9 - 0.08 * sw; armR.z = c.rest.armR.z * 0.3; armL.z = c.rest.armL.z * 0.3; lean = -0.2; bob = still ? 0 : 0.01 * Math.abs(sw); break;
    }
    case 'restock': { armR.x = -1.25; armL.x = -1.25; armR.z = c.rest.armR.z * 0.3; armL.z = c.rest.armL.z * 0.3; if (!still && opts.holding) bob = 0.01 * Math.sin(t * 5); break; }
    case 'board': armR.x = -2.4; armR.z = c.rest.armR.z; break;
    case 'talk': if (!still) { armR.x = (opts.can ? -0.9 : -0.5) + 0.35 * Math.sin(t * 3 + ph); armL.x = -0.3 + 0.2 * Math.sin(t * 2.3 + ph); } bob = still ? 0 : 0.01 * Math.sin(t * 6); turnY = 0.5 * glance; break;
    case 'frozen': break;
    default: if (!still) bob = 0.008 * Math.sin(t * 2 + ph) + 0.012 * Math.max(0, Math.sin(t * 3.1 + ph)); // stand / loiter: bouncing on its toes
      turnY = 0.6 * glance; if (opts.can) armR.x = -0.8;
  }
  c.body.rotation.x = lerp(c.body.rotation.x, lean, Math.min(1, dt * 5));
  c.body.rotation.y = lerp(c.body.rotation.y, turnY, Math.min(1, dt * 5));
  if (pose !== 'nap' && c.body.scale.x !== 1) c.body.scale.set(1, 1, 1);
  c.armR.rotation.x = lerp(c.armR.rotation.x, armR.x, k); c.armR.rotation.z = lerp(c.armR.rotation.z, armR.z, k);
  c.armL.rotation.x = lerp(c.armL.rotation.x, armL.x, k); c.armL.rotation.z = lerp(c.armL.rotation.z, armL.z, k);
  if (legX !== null) {
    c.legR.rotation.x = lerp(c.legR.rotation.x, legX, k);
    c.legL.rotation.x = lerp(c.legL.rotation.x, pose === 'walk' ? -legX : legX, k);
  }
  c.rig.position.y = lerp(c.rig.position.y, lift + bob + lieY, k);
  c.rig.rotation.z = lerp(c.rig.rotation.z, lieZ, Math.min(1, dt * 4));
  c.rig.rotation.x = 0;
}
