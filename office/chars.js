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

/* Grok Bot studio "clay" finish: a flat colour with a soft radial light from the upper left and a darker rim
   (grokbots.ai/studio BotBlob: gradient centre (-.32,-.4), r 1.55; stops white 62% / white 20% / colour / ink 40%). Baked into vertex colours. */
function clayMat(hi) {
  return hi ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35 })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55 });
}
function clayColors(g, hex, hx, hy) {
  const base = new THREE.Color(hex), white = new THREE.Color(0xffffff), ink = new THREE.Color(0x0a0a0c), pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const u = Math.max(hx, hy) * 1.08, cx = -0.32 * u, cy = 0.4 * u; // svg y is down: the light sits upper left
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.hypot(pos.getX(i) - cx, pos.getY(i) - cy) / (1.55 * u));
    if (t < 0.32) c.copy(base).lerp(white, 0.62 + (0.2 - 0.62) * t / 0.32);
    else if (t < 0.72) c.copy(base).lerp(white, 0.2 * (1 - (t - 0.32) / 0.4));
    else c.copy(base).lerp(ink, 0.4 * (t - 0.72) / 0.28);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
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
  for (let i = 0; i < 3; i++) { const z = new THREE.Mesh(zg, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfd8ff, emissiveIntensity: 1.3, transparent: true, depthWrite: false, depthTest: false })); z.renderOrder = 20; z.userData.phase = i / 3; g.add(z); // bright and drawn on top so a sleeper reads from across the room }
  return g;
}
export function floatZzz(zzz, t, x0, y0, z0) {
  zzz.children.forEach(z => { const p = (t * 0.2 + z.userData.phase) % 1; z.position.set(x0 + p * 0.3 + Math.sin(p * 6.28) * 0.04, y0 + p * 2.0, z0); z.scale.setScalar(1.1 + p * 1.6); z.material.opacity = p < 0.1 ? p / 0.1 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4; // rise ~1.4 units, stay solid until 60% of the way up, then fade });
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
function makeCue() { // axis along the forearm (-y in the arm frame): the grip is at the origin, tip forward, butt 0.25 behind the hand
  const m = new THREE.Mesh(geo('cue', () => new THREE.CylinderGeometry(0.016, 0.009, 1.3, 8)), mat('cueWood', () => new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.5 })));
  m.position.y = -0.4; const g = new THREE.Group(); g.add(m); g.rotation.x = 0.2; return g;
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
  const key = 'body:' + a.shape + ':' + a.rot + ':' + a.color;
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
    g.scale(0.85, 0.85, 0.85); g.computeBoundingBox(); g.computeVertexNormals();
    clayColors(g, a.color, hx * 0.85, hy * 0.85); return g;
  });
  const bb = bodyG.boundingBox, halfH = (bb.max.y - bb.min.y) / 2, halfW = (bb.max.x - bb.min.x) / 2;
  const bodyM = clayMat(hiQuality), limbM = jelly(a.color, hiQuality);
  const root = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  root.add(rig); rig.add(body);
  const legLen = 0.16;
  body.position.y = legLen + halfH - 0.02;
  const mesh = new THREE.Mesh(bodyG, bodyM); body.add(mesh);
  const face = makeFace(bb.max.z - 0.012, 1.0, false, true, 0); face.position.y = 0.02; body.add(face);
  // Grok Bot face: two tall matte oval eyes (no shine, no mouth), set low and close; the face tilts with a tilted body
  { const eyeM = mat('eyeClay', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 1, metalness: 0 }));
    face.userData.eyes.forEach((e, i) => { e.material = eyeM; e.position.set((i ? 1 : -1) * 0.1, -0.02, 0); e.scale.set(0.05, 0.1, 0.03); e.userData.sy = 0.1; face.userData.shines[i].scale.set(0, 0, 0); });
    face.rotation.z = a.rot || 0; }
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
  const c = finish({ name, root, rig, body, armR, armL, legR, legL, face, mats: [bodyM, limbM], colors: [new THREE.Color(0xffffff), new THREE.Color(a.color)], top: legLen + halfH * 2, sitLift: 0.34, kind: 'bot', generic: !!a.generic });
  if (a.prop === 'quill') {
    const q = new THREE.Group(), feather = new THREE.Mesh(geo('quill', () => { const g = new THREE.SphereGeometry(0.05, 10, 8); g.scale(0.35, 1.6, 0.12); return g; }), white());
    feather.position.y = 0.08; const nib = new THREE.Mesh(geo('nib', () => new THREE.ConeGeometry(0.008, 0.05, 6)), black()); nib.rotation.x = Math.PI; nib.position.y = -0.02;
    q.add(feather, nib); q.rotation.z = 0.5; c.armL.add(q); q.position.y = -(c.armL.userData.len || 0.2) * 0.95;
  }
  return c;
}

/* ---------- President: chibi avatar rebuilt from Tim's six-view turnaround reference (president_ref_views view1..view6) ----------
   Large rounded-square head (wider than tall, flat-ish front, full cheeks and jaw), warm peach skin, small low ears, NO mouth and
   NO nose, small matte black vertical-oval eyes set wide and low, soft pink round blush. Hair: matte near-black, many layered
   leaf/petal locks (pointed strands curling over the forehead, overlapping scales at the crown and back, short above the ears).
   Body: short chibi body, black short-sleeve collared button-up (collar, placket, untucked hem), black trousers and rounded
   shoes, peach arms with mitten-like hands with fingers. Kept: "Tim" on the chest and a round VW-style badge (a plain drawn
   stand-in circle emblem, not the real logo artwork). Smooth procedural meshes only, no polygon limit. */
function shirtTexture() {
  return mat('timShirtTex', () => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 256);
    x.fillStyle = '#f2f2f2'; x.font = "700 78px 'Inter PE', system-ui, sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Tim', 128, 128);
    // VW-style round badge: a simple drawn stand-in emblem (ring, disc and a plain chevron pair), not the real logo
    x.strokeStyle = '#f2f2f2'; x.lineWidth = 12; x.beginPath(); x.arc(384, 128, 56, 0, 7); x.stroke();
    x.fillStyle = '#6f7f99'; x.beginPath(); x.arc(384, 128, 46, 0, 7); x.fill();
    x.strokeStyle = '#f2f2f2'; x.lineWidth = 10; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(358, 106); x.lineTo(384, 138); x.lineTo(410, 106); x.stroke();
    x.beginPath(); x.moveTo(358, 128); x.lineTo(384, 158); x.lineTo(410, 128); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  });
}
/* tube along y with a superellipse cross-section: profile rows [y, rx, rz] (exponent n), closed at both ends */
function superTube(rows, n, seg) {
  const pos = [], idx = [], R = rows.length;
  rows.forEach(([y, rx, rz], i) => {
    for (let k = 0; k < seg; k++) {
      const a = k / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), e = 2 / n;
      pos.push(Math.sign(c) * Math.pow(Math.abs(c), e) * rx, y, Math.sign(s) * Math.pow(Math.abs(s), e) * rz);
    }
  });
  for (let i = 0; i < R - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * seg + k, b = i * seg + (k + 1) % seg, c = (i + 1) * seg + k, d = (i + 1) * seg + (k + 1) % seg;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const cap = (row, up) => { const ci = pos.length / 3; pos.push(0, rows[row][0], 0); for (let k = 0; k < seg; k++) { const a = row * seg + k, b = row * seg + (k + 1) % seg; up ? idx.push(ci, b, a) : idx.push(ci, a, b); } };
  cap(R - 1, true); cap(0, false);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function makePresident(hi) {
  const seg = hi ? 96 : 48;
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0b48a, roughness: 0.62 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.74 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.78 });
  const shoeM = mat('shoe3', () => new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.55 }));
  const trim = mat('shirtTrim3', () => new THREE.MeshStandardMaterial({ color: 0x252528, roughness: 0.7 }));
  const root = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  root.add(rig); rig.add(body);
  const HIP = 0.5; body.position.y = HIP;
  // legs: straight black trousers (pivot at the hip) and rounded black shoes
  const leg = () => { const p = new THREE.Group();
    const m = new THREE.Mesh(geo('pLeg3', () => { const g = new THREE.CapsuleGeometry(0.066, 0.32, 8, 24); g.scale(1, 1, 0.98); return g; }), pants); m.position.y = -0.235; p.add(m);
    const shoe = new THREE.Mesh(geo('pShoe3', () => { const g = new THREE.SphereGeometry(0.083, 28, 18); g.scale(0.98, 0.62, 1.55); return g; }), shoeM); shoe.position.set(0, -0.46, 0.04); p.add(shoe); return p; };
  const legR = leg(), legL = leg(); legR.position.set(-0.092, HIP, 0); legL.position.set(0.092, HIP, 0); rig.add(legR, legL);
  // torso: boxy-round shirt body, flared untucked hem; shoulders sloping to the collar
  const TN = 2.7, rows = [[-0.075, 0.226, 0.142], [-0.066, 0.233, 0.146], [-0.05, 0.224, 0.141], [0.0, 0.21, 0.133], [0.12, 0.2, 0.128], [0.26, 0.205, 0.13], [0.35, 0.205, 0.128], [0.4, 0.178, 0.114], [0.43, 0.12, 0.09], [0.445, 0.07, 0.064]];
  const torso = new THREE.Mesh(geo('pTorso3', () => superTube(rows, TN, seg)), shirt); body.add(torso);
  const frontZ = y => { let r0 = rows[0]; for (let i = 0; i < rows.length - 1; i++) if (y >= rows[i][0] && y <= rows[i + 1][0]) { const t = (y - rows[i][0]) / (rows[i + 1][0] - rows[i][0]); return [rows[i][1] + (rows[i + 1][1] - rows[i][1]) * t, rows[i][2] + (rows[i + 1][2] - rows[i][2]) * t]; } return [rows[rows.length - 1][1], rows[rows.length - 1][2]]; };
  const fz = (x, y) => { const [rx, rz] = frontZ(y); return rz * Math.pow(Math.max(0.0001, 1 - Math.pow(Math.abs(x) / rx, TN)), 1 / TN); };
  // hem band: a soft rolled edge so the shirt reads as untucked over the trousers
  const ringCurve = (rx, rz, n, y, a0, a1, steps) => { const pts = []; for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps, c = Math.cos(a), sn = Math.sin(a), e = 2 / n; pts.push(new THREE.Vector3(Math.sign(c) * Math.pow(Math.abs(c), e) * rx, y, Math.sign(sn) * Math.pow(Math.abs(sn), e) * rz)); } return pts; };
  const hem = new THREE.Mesh(geo('pHem3', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringCurve(0.233, 0.146, TN, -0.066, 0, Math.PI * 2, 120).slice(0, -1), true), 160, 0.011, 10, true)), shirt); body.add(hem);
  // placket + buttons down the centre front, plus a chest print ("Tim" and the round badge)
  const plkG = geo('pPlk3', () => { const g = new THREE.BoxGeometry(0.034, 0.5, 0.008, 1, 20, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) * 0.98 + 0.2; p.setY(i, y); p.setZ(i, p.getZ(i) + fz(0, y) + 0.002); } g.computeVertexNormals(); return g; });
  const placket = new THREE.Mesh(plkG, trim); placket.position.y = 0.0; body.add(placket);
  const btnM = mat('btn3', () => new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.45, metalness: 0.25 }));
  for (let k = 0; k < 5; k++) { const y = 0.05 + k * 0.07, b = new THREE.Mesh(geo('pBtn3', () => new THREE.SphereGeometry(0.0095, 12, 8)), btnM); b.scale.z = 0.5; b.position.set(0, y, fz(0, y) + 0.008); body.add(b); }
  const printG = geo('pPrint3', () => { const w = 0.4, h = 0.2, g = new THREE.PlaneGeometry(w, h, 64, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = 0.275 + p.getY(i); p.setZ(i, fz(x, y) + 0.010); p.setY(i, y); } g.computeVertexNormals(); return g; });
  const print = new THREE.Mesh(printG, shirtTexture()); body.add(print);
  // collar: a stand band round the neck and two pointed flaps lying open on the shoulders
  const band = new THREE.Mesh(geo('pBand3', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringCurve(0.078, 0.066, 2, 0.44, Math.PI * 0.12, Math.PI * 0.88 + Math.PI, 40).map(v => v.clone())), 60, 0.016, 10, false)), shirt); body.add(band);
  const flap = geo('pFlap3', () => { const sh = new THREE.Shape(); sh.moveTo(0, 0.0); sh.quadraticCurveTo(0.06, 0.035, 0.115, 0.012); sh.quadraticCurveTo(0.09, -0.04, 0.03, -0.105); sh.quadraticCurveTo(0.005, -0.06, 0, 0); return new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 3, curveSegments: 10 }); });
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(flap, shirt); f.scale.x = sx; f.position.set(sx * 0.014, 0.445, 0.076); f.rotation.set(-0.62, -sx * 0.22, sx * 0.1); body.add(f); }
  const neck = new THREE.Mesh(geo('pNeck3', () => new THREE.CylinderGeometry(0.052, 0.06, 0.09, 24)), skin); neck.position.y = 0.455; body.add(neck);
  // arms: short black sleeves with a folded cuff, bare peach forearms, mitten hands with four fingers and a thumb
  const hand = () => { const h = new THREE.Group();
    const palm = new THREE.Mesh(geo('pPalm3', () => { const g = new THREE.SphereGeometry(1, 24, 16); g.scale(0.042, 0.052, 0.026); return g; }), skin); h.add(palm);
    const fg = geo('pFing3', () => new THREE.CapsuleGeometry(0.0125, 0.034, 6, 12));
    [[-0.027, 0.04, 0.03, 0.9], [-0.009, 0.05, 0.035, 1.0], [0.009, 0.05, 0.035, 1.0], [0.027, 0.04, 0.03, 0.88]].forEach(([x, y, ln, sc], i) => {
      const f = new THREE.Mesh(fg, skin); f.scale.set(1, sc, 1); f.position.set(x, -y - 0.014, 0.004); f.rotation.set(-0.16, 0, -(x * 2.2)); h.add(f); });
    const th = new THREE.Mesh(fg, skin); th.scale.set(1.1, 0.95, 1.1); th.position.set(0.046, -0.002, 0.008); th.rotation.set(-0.1, 0, 0.9); h.add(th);
    return h; };
  const arm = side => { const p = new THREE.Group();
    const sleeve = new THREE.Mesh(geo('pSleeve3', () => { const g = new THREE.CapsuleGeometry(0.055, 0.07, 8, 24); return g; }), shirt); sleeve.position.y = -0.075; p.add(sleeve);
    const cuff = new THREE.Mesh(geo('pCuff3', () => new THREE.TorusGeometry(0.055, 0.009, 10, 32)), shirt); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.14; p.add(cuff);
    const fore = new THREE.Mesh(geo('pFore3', () => new THREE.CapsuleGeometry(0.037, 0.16, 8, 20)), skin); fore.position.y = -0.255; p.add(fore);
    const h = hand(); h.position.set(0, -0.435, 0); h.rotation.y = side * -(Math.PI / 2 - 0.3); h.scale.set(side * 1.35, 1.35, 1.35); p.add(h);
    p.userData.len = 0.47; p.position.set(side * 0.238, 0.385, 0); p.rotation.z = side * 0.3; return p; };
  const armR = arm(-1), armL = arm(1); body.add(armR, armL);

  /* ---- head ---- */
  const HA = 0.262, HB = 0.236, HC = 0.248, HN = 2.35;                      // half-extents (x, y, z) and squareness exponent
  const deform = (dx, dy, dz, grow) => {                                    // unit direction -> point on the rounded-square head (full jaw and cheeks)
    const r = 1 / Math.pow(Math.pow(Math.abs(dx), HN) + Math.pow(Math.abs(dy), HN) + Math.pow(Math.abs(dz), HN), 1 / HN);
    let x = dx * r * HA, y = dy * r * HB, z = dz * r * HC;
    const jaw = y < 0 ? Math.min(1, -y / HB) : 0, cheek = Math.exp(-Math.pow((y + 0.07) / 0.11, 2));
    x *= 1 + 0.03 * cheek; z *= 1 + 0.015 * cheek;
    if (y < 0) { y *= 0.9; x *= 1 + 0.03 * Math.sin(Math.min(1, jaw * 1.4) * Math.PI); }           // flatter, wider lower face
    if (dz > 0.2) z += 0.018 * Math.exp(-Math.pow((y + 0.2) / 0.06, 2)) * dz;                    // slight chin
    if (y > 0) { x *= 1 - 0.02 * y / HB; }                                                       // smooth dome crown
    if (grow) { const l = Math.hypot(x / HA, y / HB, z / HC) || 1; x += x / HA / l * grow; y += y / HB / l * grow; z += z / HC / l * grow; }
    return [x, y, z];
  };
  const headShape = (g, grow) => { const p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); const [x, y, z] = deform(v.x, v.y, v.z, grow); p.setXYZ(i, x, y, z); } g.computeVertexNormals(); return g; };
  const head = new THREE.Group(); head.position.y = 0.655; head.scale.setScalar(1.0); body.add(head);
  const skull = new THREE.Mesh(geo('pHead5', () => headShape(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)), 0)), skin); head.add(skull);
  for (const sx of [-1, 1]) { const ear = new THREE.Mesh(geo('pEar3', () => new THREE.SphereGeometry(0.056, 28, 18)), skin); ear.scale.set(0.55, 1.25, 0.95); ear.position.set(sx * 0.282, -0.01, -0.01); ear.rotation.z = sx * 0.12; head.add(ear); }
  // hair: matte near-black, a base cap plus many layered leaf locks
  const hairM = [0x1b1b1c, 0x252527, 0x2f2f32, 0x38383b].map((c, i) => mat('hairM' + i, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, metalness: 0, side: THREE.DoubleSide })));
  const hairLine = (x, z) => { const az = Math.atan2(x, z), u = Math.cos(az); return u > 0 ? -0.0 + (0.115 - 0.0) * Math.pow(u, 1.3) : -0.0 + (-0.17 - 0.0) * -u; };
  const capG = grow => { const g = headShape(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.6), 0, Math.PI * 2, 0, Math.PI * 0.62), grow), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const lo = hairLine(p.getX(i), p.getZ(i)); if (p.getY(i) < lo) p.setY(i, lo); } g.computeVertexNormals(); return g; };
  const cap = new THREE.Mesh(geo('pCap3', () => capG(0.012)), hairM[0]); head.add(cap);
  // leaf-shaped lock: root at the origin, tip at -y; lens-shaped section, bent to hug the head and optionally curled sideways
  const leaf = (len, w, th, bend, curl) => geo('leaf3' + [len, w, th, bend, curl].map(v => v.toFixed(3)).join(':'), () => {
    const NA = 14, NR = 14, pos = [], idx = [];
    for (let i = 0; i <= NA; i++) { const a = i / NA, wp = Math.pow(Math.sin(Math.PI * Math.pow(a, 1.35)), 1.1), dist = (1 - a) * len;
      for (let k = 0; k < NR; k++) { const f = k / NR * Math.PI * 2, c = Math.cos(f), s = Math.sin(f);
        pos.push(c * w * wp + curl * dist * dist, -dist, Math.max(s, -0.25) * th * (0.35 + 0.65 * wp) - bend * dist * dist); } }
    for (let i = 0; i < NA; i++) for (let k = 0; k < NR; k++) { const a = i * NR + k, b = i * NR + (k + 1) % NR, c = (i + 1) * NR + k, d = (i + 1) * NR + (k + 1) % NR; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; });
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), Yup = new THREE.Vector3(0, 1, 0), MAT = new THREE.Matrix4();
  // lock rooted at the head surface in direction (azimuth from front, elevation), swept by `ang` about the surface normal
  const lock = (azd, eld, len, w, ang, layer, o = {}) => {
    const az = azd * Math.PI / 180, el = eld * Math.PI / 180, dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
    const [px, py, pz] = deform(dx, dy, dz, 0);
    Z.set(Math.sign(px) * Math.pow(Math.abs(px / HA), HN - 1) / HA, Math.sign(py) * Math.pow(Math.abs(py / HB), HN - 1) / HB, Math.sign(pz) * Math.pow(Math.abs(pz / HC), HN - 1) / HC).normalize();
    Y.copy(Yup).addScaledVector(Z, -Z.dot(Yup));
    if (Y.length() < 0.35) Y.set(-dx, 0, -dz).addScaledVector(Z, Z.dot(X.set(dx, 0, dz)));  // crown: let the lock fall outwards
    Y.normalize(); X.crossVectors(Y, Z).normalize(); Y.crossVectors(Z, X);
    const m = new THREE.Mesh(leaf(len, w, o.th || 0.016, o.bend == null ? 1.9 : o.bend, o.curl || 0), hairM[layer]);
    m.quaternion.setFromRotationMatrix(MAT.makeBasis(X, Y, Z));
    m.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(Z.clone(), ang));
    m.position.set(px, py, pz).addScaledVector(Z, 0.004 + (o.lift || 0)); head.add(m); return m;
  };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // scales: staggered rows over the crown, sides and back; locks shorten towards the hairline so the sides stay short above the ears
  const rowEl = [80, 68, 56, 44, 32, 20, 8, -4, -16];
  rowEl.forEach((eld, ri) => {
    const el = eld * Math.PI / 180, n = Math.max(5, Math.round(Math.PI * 2 * Math.cos(el) * 0.27 / 0.088)), off = (ri % 2) * 0.5;
    for (let k = 0; k < n; k++) {
      const azd = ((k + off) / n * 360 + 540) % 360 - 180, aa = Math.abs(azd);
      if (aa < 62 && eld < 50) continue;                                // front: forehead fringe is placed by hand
      const [px, py, pz] = deform(Math.sin(azd * Math.PI / 180) * Math.cos(el), Math.sin(el), Math.cos(azd * Math.PI / 180) * Math.cos(el), 0), hl = hairLine(px, pz);
      if (py < hl - 0.01) continue;
      const len = Math.min(0.15 + rnd() * 0.04, Math.max(0.05, py - hl + 0.045)), j = (rnd() - 0.5);
      lock(azd + j * 6, eld + (rnd() - 0.5) * 3, len, 0.06 + rnd() * 0.01, (rnd() - 0.5) * 0.26 + (aa < 100 ? -azd / 500 : 0), Math.min(3, 1 + (ri % 3)), { lift: 0.006 + ri * 0.0016, th: 0.02 });
    }
  });
  // fringe: wide locks swept down over the forehead with a few long pointed strands curling at the tips
  [[62, 30, 0.1, 0.06, -0.55, 1], [48, 38, 0.15, 0.065, -0.55, 2], [33, 42, 0.2, 0.05, -0.5, 1, { curl: 0.4 }], [18, 46, 0.23, 0.04, -0.4, 2, { curl: 0.6 }], [4, 48, 0.2, 0.045, -0.3, 1, { curl: 0.55 }],
    [-9, 48, 0.17, 0.06, -0.2, 2], [-23, 46, 0.23, 0.04, 0.0, 1, { curl: -0.5 }], [-38, 42, 0.17, 0.06, 0.2, 2], [-53, 36, 0.13, 0.06, 0.35, 1],
    [40, 54, 0.16, 0.075, -0.5, 3, { lift: 0.012 }], [12, 58, 0.17, 0.075, -0.45, 3, { lift: 0.014 }], [-14, 58, 0.17, 0.075, -0.1, 3, { lift: 0.014 }], [-40, 54, 0.16, 0.07, 0.15, 3, { lift: 0.014 }]]
    .forEach(([azd, eld, len, w, ang, l, o]) => lock(azd, eld, len, w, ang, l, Object.assign({ bend: 1.2, lift: 0.006 }, o)));
  for (let a = -64; a <= 64; a += 9) lock(a + (rnd() - 0.5) * 3, 34 + 10 * Math.cos(a * Math.PI / 130) + (rnd() - 0.5) * 3, 0.15 + 0.05 * rnd() + 0.03 * Math.cos(a * Math.PI / 128), 0.05, -0.38 - a / 260 + (rnd() - 0.5) * 0.3, 2, { bend: 1.0, lift: 0.003 });
  // face: small MATTE vertical black oval eyes, wide apart and low; soft pink blush; no mouth, no nose
  const eyeX = 0.132, eyeY = -0.085, eyeZ = deform(eyeX / HA * 0.9, eyeY / HB, 0.97, 0)[2];
  const frontPt = (x, y) => { // surface z at head-local (x, y): march along +z until outside the deformed head
    let z = 0.0; for (let s = 0; s < 40; s++) { const d = Math.hypot(x, y, z + 0.0001); const [px, py, pz] = deform(x / d, y / d, (z + 0.0001) / d, 0); if (Math.hypot(px, py, pz) <= d + 1e-6) break; z += 0.01; }
    let lo = Math.max(0, z - 0.01), hi = z; for (let s = 0; s < 24; s++) { const m = (lo + hi) / 2, d = Math.hypot(x, y, m + 0.0001); const [px, py, pz] = deform(x / d, y / d, (m + 0.0001) / d, 0); if (Math.hypot(px, py, pz) <= d) hi = m; else lo = m; }
    return hi; };
  const face = makeFace(0, 0.95, false, true, 0); head.add(face);
  const matteEye = mat('eyeMatte3', () => new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1, metalness: 0 }));
  face.userData.eyes.forEach((e, i) => { const sx = i ? 1 : -1, z = frontPt(sx * eyeX, eyeY); e.material = matteEye; e.position.set(sx * eyeX, eyeY, z - 0.002);
    e.scale.set(0.019, 0.05, 0.012); e.userData.sy = 0.05; e.rotation.set(0, 0, 0);
    const n = new THREE.Vector3(sx * eyeX / (HA * HA), eyeY / (HB * HB), z / (HC * HC)).normalize(); e.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); face.userData.shines[i].scale.set(0, 0, 0); });
  face.userData.brows.forEach((b, i) => { b.position.set((i ? 1 : -1) * eyeX, 0.1, frontPt((i ? 1 : -1) * eyeX, 0.1) + 0.004); });
  const blushM = mat('blush5', () => new THREE.MeshStandardMaterial({ color: 0xe3917f, roughness: 0.95, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  for (const sx of [-1, 1]) { const bx = sx * 0.155, by = -0.16, z = frontPt(bx, by), b = new THREE.Mesh(geo('blush5', () => new THREE.SphereGeometry(0.027, 28, 18)), blushM);
    b.scale.set(1.25, 0.9, 0.12); const n = new THREE.Vector3(bx / (HA * HA), by / (HB * HB), z / (HC * HC)).normalize(); b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); b.position.set(bx, by, z - 0.001); head.add(b); }
  return finish({ name: 'President', root, rig, body, armR, armL, legR, legL, face, mats: [shirt, skin], colors: [shirt.color.clone(), skin.color.clone()], top: 1.46, sitLift: -0.02, kind: 'president', head });
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
  hold.add(c.cup, c.can, c.card, c.cue); // the cue is held in the right hand, along the forearm (pool pose angles it down at the ball)
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
      // chair seat top is 0.495, saddle top 0.705: raise by the difference so every body size sits on the saddle
      lift = c.sitLift + 0.21; const s = still ? 0 : Math.sin(t * 6 + ph); legX = -1.0 + s * 0.45; armR.x = -1.1; armL.x = -1.1; lean = 0.25; bob = still ? 0 : 0.01 * Math.abs(s);
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
      armR.x = -1.3; armR.z = c.rest.armR.z * 0.2; armL.x = -1.45; c.cue.position.y = -stroke * 0.18; /* cue slides along the forearm */ lean = 0.18 + 0.1 * stroke; bob = 0; break;
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
