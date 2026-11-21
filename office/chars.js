/* Fully 3D characters from Three.js primitives: glossy jelly-blob bots extruded from each bot's sidebar avatar mark,
   with stubby arms and legs and simple expressive 3D faces (Hermes is a white icon tile with artwork instead of eyes). The President is Tim's own textured 3D model (office/assets/president.glb),
   skinned at load time to the same bone handles, so it shares the procedural poses. Procedural animation only. */
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
  for (let i = 0; i < 3; i++) { const z = new THREE.Mesh(zg, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfd8ff, emissiveIntensity: 1.3, transparent: true, depthWrite: false, depthTest: false })); z.renderOrder = 20; z.userData.phase = i / 3; g.add(z); } // bright and drawn on top so a sleeper reads from across the room
  return g;
}
export function floatZzz(zzz, t, x0, y0, z0) {
  zzz.children.forEach(z => { const p = (t * 0.2 + z.userData.phase) % 1; z.position.set(x0 + p * 0.3 + Math.sin(p * 6.28) * 0.04, y0 + p * 2.0, z0); z.scale.setScalar(1.1 + p * 1.6); z.material.opacity = p < 0.1 ? p / 0.1 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4; }); // rise ~2 units, solid until 60% of the climb, then fade
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
/* Warehouse and carried restock case: Monster-green box with a simple label band. Shared geometry, no brand artwork. */
export const caseGeometry = () => geo('case', () => new THREE.BoxGeometry(0.3, 0.2, 0.22));
export const caseBandGeometry = () => geo('caseBand', () => new THREE.BoxGeometry(0.305, 0.048, 0.225));
export const caseBodyMaterial = () => mat('caseBody', () => new THREE.MeshStandardMaterial({ color: 0x1e8c14, roughness: 0.65, emissive: 0x0d2a08, emissiveIntensity: 0.3 }));
export const caseBandMaterial = () => mat('caseBand', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.5 }));
export function makeCase() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(caseGeometry(), caseBodyMaterial()));
  g.add(new THREE.Mesh(caseBandGeometry(), caseBandMaterial()));
  return g;
}
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
  const eye = geo('pSlot', () => new THREE.CapsuleGeometry(1, 2.9, 8, 16)); /* slot eyes: tall narrow capsule, not an oval */
  const eyes = [-1, 1].map(sx => { const e = new THREE.Mesh(eye, eyeM); e.userData.sy = 0.0294 * scale; e.scale.set(0.0245 * scale, e.userData.sy, 0.012); e.position.set(sx * 0.085 * scale, 0.05 * scale, 0); e.rotation.z = tilt || 0; f.add(e); return e; });
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
  f.userData.apply = (p, blink, extra) => {
    const open = (1 - p.lid) * (1 - blink);
    if (f.userData.studio) f.userData.studio(p, blink, extra);
    else eyes.forEach((e, i) => { e.visible = true; e.scale.y = e.userData.sy * Math.max(0.1, open); shines[i].visible = e.visible && open > 0.5; });
    lids.forEach(l => { l.visible = !f.userData.studio && p.lid > 0.05 && p.lid < 0.99; l.scale.set(0.55 * scale, 0.5 * scale * W(p.lid), scale); });
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
  f.userData.eyes = eyes; f.userData.shines = shines; f.userData.brows = brows; f.userData.lids = lids;
  f.userData.apply(window.OfficeLogic.exprParams('happy'), 0);
  return f;
}

/* Studio eyes: a per-eye stadium (slot) geometry in metres, rebuilt from the shared unit capsule when w x h change. The long axis follows the longer side. */
const SLOT_ZR = 0.014; // flattened depth (half thickness), as the old slot eyes
function slotGeometry() {
  const base = new THREE.CapsuleGeometry(1, 1, 8, 16), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(base.attributes.position.array.slice(), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(base.attributes.normal.array.slice(), 3));
  g.setIndex(base.index.clone()); g.userData.base = { pos: base.attributes.position.array, nor: base.attributes.normal.array, idx: base.index.array.slice() }; g.userData.horiz = false; base.dispose();
  return g;
}
function setSlot(g, w, h) {
  const { pos, nor } = g.userData.base, P = g.attributes.position.array, N = g.attributes.normal.array, horiz = w > h, r = Math.min(w, h) / 2, Lh = (Math.max(w, h) - Math.min(w, h)) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    const bx = pos[i], by = pos[i + 1], bz = pos[i + 2], sg = by >= 0 ? 1 : -1, along = sg * Lh + (by - sg * 0.5) * r, across = bx * r;
    P[i] = horiz ? along : across; P[i + 1] = horiz ? across : along; P[i + 2] = bz * SLOT_ZR;
    N[i] = horiz ? nor[i + 1] : nor[i]; N[i + 1] = horiz ? nor[i] : nor[i + 1]; N[i + 2] = nor[i + 2];
  }
  if (g.userData.horiz !== horiz) { /* swapping x and y mirrors the shape: flip the triangle winding so the front faces still face out */
    const ix = g.index.array, bi = g.userData.base.idx; for (let i = 0; i < bi.length; i += 3) { ix[i] = bi[i]; ix[i + 1] = horiz ? bi[i + 2] : bi[i + 1]; ix[i + 2] = horiz ? bi[i + 1] : bi[i + 2]; }
    g.index.needsUpdate = true; g.userData.horiz = horiz;
  }
  g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.computeBoundingSphere();
}

/* ---------- limbs ---------- */
function limb(radius, len, m, key) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(geo(key, () => new THREE.CapsuleGeometry(radius, len, 4, 10)), m);
  mesh.position.y = -(len / 2 + radius) * 0.85; pivot.add(mesh); pivot.userData.len = len + radius * 2; return pivot;
}


/* Studio "puffy" body: ONE smooth inflated skin per bot (no extrusion, no slab faces, no stacked lobes).
   The avatar silhouette is the equator (radius r(theta)); each latitude ring shrinks it like a sphere, so the front and back are
   domes and the sides are round. Front-to-back thickness = THICK x the width of the face view (studio samples are ~1:1, never more). */
export const BOT_THICK = 0.765; // Tim (Nov 17): bodies about 15% less bulbous (was 0.9)
export const BOT_FLAT = 2; // front/back dome exponent: 2 = plain ellipsoid. Tim (Nov 17, 2:02 AM): 2.6 made bodies too fat, back to the #349 look
function radialProfile(pts, n) {
  const r = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / n * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t); let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], ex = q[0] - p[0], ey = q[1] - p[1], den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const uu = (dx * p[1] - dy * p[0]) / (dy * ex - dx * ey), t2 = (p[0] + uu * ex) * dx + (p[1] + uu * ey) * dy;
      if (uu >= 0 && uu <= 1 && t2 > best) best = t2;
    }
    r[k] = best || 0.3;
  }
  for (let pass = 0; pass < 6; pass++) { const c = r.slice(); for (let k = 0; k < n; k++) r[k] = (c[(k + n - 1) % n] + 2 * c[k] + c[(k + 1) % n]) / 4; } // round tips and valleys
  return r;
}
/* Claude's starburst, built in the studio language: a smooth-union SDF of a round core and exactly 6 round-capped rays (valleys fused into the
   core by the smooth-min), meshed by marching along rays from the centre (the shape is star-shaped, so each ray hits the skin once). */
function starSDF(rot) {
  const CORE = 0.23, R0 = 0.175, R1 = 0.115, LEN = 0.335, K = 0.11, RR = 0.1, tips = [];
  for (let i = 0; i < 6; i++) { const t = Math.PI / 2 + rot + i * Math.PI / 3; tips.push([Math.cos(t) * LEN, Math.sin(t) * LEN]); }
  const smin = (p, q) => { const h = Math.max(K - Math.abs(p - q), 0) / K; return Math.min(p, q) - h * h * K * 0.25; };
  /* Tim (Nov 17): one chubby cushion, not round tubes poking out. The 2D star outline (core + rays, smooth-union) is inflated as a
     rounded slab: flat-ish front with a gentle dome toward the middle and soft round edges of radius RR. */
  const d2 = (x, y) => {
    let d = Math.hypot(x, y) - CORE;
    for (const [tx, ty] of tips) {
      const l2 = tx * tx + ty * ty, u = Math.max(0, Math.min(1, (x * tx + y * ty) / l2)), dx = x - tx * u, dy = y - ty * u;
      d = smin(d, Math.hypot(dx, dy) - (R0 + (R1 - R0) * u));
    }
    return d;
  };
  /* Tim (Nov 17, 2:09 AM): the dome height follows a smooth Gaussian of the radius, not the star distance, so the middle is round with no apex point. */
  return (x, y, z) => {
    const a = d2(x, y), H = 0.05 + 0.05 * Math.exp(-(x * x + y * y) / 0.045), qx = a + RR, qy = Math.abs(z) - H;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - RR;
  };
}
/* Wide face shapes read as fat from the side, so they are thinner front to back (Tim, Nov 17, 2026). Applies to every bot with that shape. */
const SHAPE_THICK = { clover4: 0.55, pill: 0.5 };
function puffBody(a, hi) {
  const NT = hi ? 160 : 96, NP = hi ? 64 : 40, star = a.shape === 'starburst';
  let ringAt, W, D, hbar, zFront;
  if (star) {
    const f = starSDF(a.rot || 0);
    ringAt = (ph, t) => { const dx = Math.sin(ph) * Math.cos(t), dy = Math.sin(ph) * Math.sin(t), dz = Math.cos(ph); let lo = 0.02, hi2 = 1.2;
      for (let n = 0; n < 28; n++) { const m = (lo + hi2) / 2; if (f(dx * m, dy * m, dz * m) < 0) lo = m; else hi2 = m; } return [dx * lo, dy * lo, dz * lo]; };
    zFront = (x, y) => { let lo = 0, hi2 = 1; for (let n = 0; n < 28; n++) { const m = (lo + hi2) / 2; if (f(x, y, m) < 0) lo = m; else hi2 = m; } return lo; };
    hbar = 0;
  } else {
    const pts = shapePoints(a), prof = radialProfile(pts, NT);
    let wmax = 0, wmin = 0; for (let k = 0; k < NT; k++) { const x = Math.cos(k / NT * Math.PI * 2) * prof[k]; wmax = Math.max(wmax, x); wmin = Math.min(wmin, x); }
    D = (wmax - wmin) * (SHAPE_THICK[a.shape] || BOT_THICK) / 2; // wide shapes get a thinner front-to-back depth
    ringAt = (ph, t) => { const f = t / (Math.PI * 2) * NT, k0 = Math.floor(f) % NT, k1 = (k0 + 1) % NT, sp = Math.sin(ph), cp = Math.cos(ph), r = (prof[k0] + (prof[k1] - prof[k0]) * (f - Math.floor(f))) * Math.pow(Math.abs(sp), 2 / BOT_FLAT); return [Math.cos(t) * r, Math.sin(t) * r, Math.sign(cp) * Math.pow(Math.abs(cp), 2 / BOT_FLAT) * D]; };
    zFront = (x, y) => { const rho = Math.hypot(x, y), th = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2), f = th / (Math.PI * 2) * NT, k0 = Math.floor(f) % NT, k1 = (k0 + 1) % NT, R = prof[k0] + (prof[k1] - prof[k0]) * (f - Math.floor(f));
      return Math.pow(Math.max(0, 1 - Math.min(1, rho / R) ** BOT_FLAT), 1 / BOT_FLAT) * D; };
  }
  const pos = [], idx = [], P0 = ringAt(1e-4, 0), P1 = ringAt(Math.PI - 1e-4, 0);
  pos.push(0, 0, P0[2]);
  for (let j = 1; j < NP; j++) for (let k = 0; k < NT; k++) pos.push(...ringAt(j / NP * Math.PI, k / NT * Math.PI * 2));
  pos.push(0, 0, P1[2]);
  const ring = j => 1 + (j - 1) * NT, last = pos.length / 3 - 1;
  for (let k = 0; k < NT; k++) { const k2 = (k + 1) % NT; idx.push(0, ring(1) + k, ring(1) + k2); idx.push(last, ring(NP - 1) + k2, ring(NP - 1) + k); }
  for (let j = 1; j < NP - 1; j++) for (let k = 0; k < NT; k++) {
    const k2 = (k + 1) % NT, A = ring(j) + k, B = ring(j) + k2, C = ring(j + 1) + k, E = ring(j + 1) + k2;
    idx.push(A, C, B, B, C, E);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeBoundingBox(); const b0 = g.boundingBox, ox = (b0.max.x + b0.min.x) / 2, oy = (b0.max.y + b0.min.y) / 2, SC = star ? 0.82 : 0.95;
  g.translate(-ox, -oy, 0); g.scale(SC, SC, SC); g.computeVertexNormals(); g.computeBoundingBox();
  g.userData.zAt = (x, y) => zFront(x / SC + ox, y / SC + oy) * SC; // front surface height at body-local (x, y)
  clayColors(g, a.color, (b0.max.x - b0.min.x) / 2 * SC, (b0.max.y - b0.min.y) / 2 * SC);
  return g;
}

/* Icon tile (Hermes, Tim Nov 21): a white rounded-square tile, a bevelled extrusion of the avatar outline (one cheap mesh, low poly),
   front at +z. The front artwork is a separate plane laid on the front face, so the back stays plain white. */
const TILE_DEPTH = 0.12, TILE_BEVEL = 0.06; // Tim (Nov 21): edges about 20% rounder (bevel 0.05 -> 0.06, corner radius 0.15 -> 0.18)
function tileBody(a) {
  const s = new THREE.Shape(); shapePoints(a).forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: TILE_DEPTH, curveSegments: 6, bevelEnabled: true, bevelThickness: TILE_BEVEL, bevelSize: TILE_BEVEL * 0.8, bevelSegments: 6 });
  g.center(); g.scale(0.9, 0.9, 0.9); g.computeVertexNormals(); g.computeBoundingBox();
  /* Tim (Nov 21): plain white read too bright and flat. Bake soft shading into vertex colours: an off-white base, lighter toward the
     top, darker toward the bottom and on the rounded sides, so the tile reads as a solid object. */
  const base = new THREE.Color(a.color), hi = new THREE.Color(0xffffff), lo = new THREE.Color(0x8d8f94), c = new THREE.Color(), P = g.attributes.position, N = g.attributes.normal;
  const bx = g.boundingBox, hx = (bx.max.x - bx.min.x) / 2, col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const d = P.getY(i) / hx, side = 1 - Math.abs(N.getZ(i)); // d: -1 bottom .. +1 top
    c.copy(base); if (d > 0) c.lerp(hi, 0.3 * d); else c.lerp(lo, 0.45 * -d);
    c.lerp(lo, 0.42 * side * side);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
/* Matte plastic grain (Tim, Nov 21: stronger grain, then softer and finer so it is not too noticeable): one shared 256 px texture of fine speckle over soft mottling, used as a light
   colour map (multiplies the shading by about 0.82..1) and as the bump and roughness map, so the tile reads as textured plastic from
   normal viewing distance and the light breaks up instead of sliding off as one uniform sheen. */
function grainTex() {
  return mat('tileGrain', () => { const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d'), im = x.createImageData(N, N);
    const C = 24, coarse = Array.from({ length: C * C }, () => Math.random()), at = (i, j) => coarse[((j + C) % C) * C + (i + C) % C];
    const soft = (u, v) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      return (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv; };
    for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
      const v = 255 - 6 * soft(xx / N * C, y / N * C) - 12 * Math.random(), k = (y * N + xx) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = v; im.data[k + 3] = 255;
    }
    x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = THREE.SRGBColorSpace; return t; });
}
function tileMat(a, hiQ) {
  const g = grainTex();
  return hiQ ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, map: g, roughness: 0.7, roughnessMap: g, bumpMap: g, bumpScale: 0.6, clearcoat: 0.12, clearcoatRoughness: 0.6 })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: g, roughness: 0.72, bumpMap: g, bumpScale: 0.6 });
}

const ICON_ART = { hermes: new URL('./assets/hermes-icon.png', import.meta.url).href };
function iconArt(key, size) {
  const m = mat('iconArt:' + key, () => { const t = new THREE.TextureLoader().load(ICON_ART[key]); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }); });
  return new THREE.Mesh(geo('iconPlane:' + size.toFixed(3), () => new THREE.PlaneGeometry(size, size)), m); // single-sided: seen from the front only
}

/* ---------- jelly bot ---------- */
export function makeBot(name, hiQuality, botId, override) {
  const a = avatarFor(name, botId, override);
  if (a.shape === 'minifig') return makePresident();
  const key = 'body:' + a.shape + ':' + a.rot + ':' + a.color;
  const bodyG = geo(key, () => a.icon ? tileBody(a) : puffBody(a, hiQuality));
  const bb = bodyG.boundingBox, halfH = (bb.max.y - bb.min.y) / 2, halfW = (bb.max.x - bb.min.x) / 2;
  const bodyM = a.icon ? tileMat(a, hiQuality) : clayMat(hiQuality), limbM = a.icon ? new THREE.MeshStandardMaterial({ color: a.color, map: grainTex(), roughness: 0.72, bumpMap: grainTex(), bumpScale: 0.6 }) : jelly(a.color, hiQuality);
  const root = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  root.add(rig); rig.add(body);
  const legLen = 0.16;
  body.position.y = legLen + halfH - 0.02;
  const mesh = new THREE.Mesh(bodyG, bodyM); body.add(mesh);
  const face = makeFace(bb.max.z - 0.012, 1.0, false, true, 0);
  face.userData.frontZ = bb.max.z; face.position.y = 0.02; body.add(face);
  // Grok Bot face: two tall matte slot eyes (no shine, no mouth), set low and close; the face tilts with a tilted body
  /* a.face (Hermes): its own eye colour, the eye pair tilted by face.rot instead of the body rot, shifted dx/dy, each eye leaning by tilt */
  if (!a.icon) { const fc = a.face || {}, eyeHex = fc.color || '#0b0b0e', eyeM = mat('eyeClay' + eyeHex, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(eyeHex), roughness: 1, metalness: 0 }));
    const rot = fc.rot ?? (a.rot || 0), EDX = fc.dx || 0, ETILT = fc.tilt || 0, cr = Math.cos(rot), sr = Math.sin(rot), zAt = bodyG.userData.zAt, fz = bb.max.z - 0.012, H = 0.004, ZV = new THREE.Vector3(0, 0, 1);
    const EY = -0.02 + (fc.dy || 0), tmpQ = new THREE.Quaternion(), qz = new THREE.Quaternion();
    /* sit each eye ON the curved skin: sample the surface where the eye really lands (the face is rotated by rot and lifted 0.02), then
       tilt it to the surface normal so neither end sinks into the body (Tim, Nov 17: Usage's eyes vanished into its slope) */
    const placeEye = (e, ex, ey, tilt) => {
      const bx = ex * cr - ey * sr, by = ex * sr + ey * cr + 0.02, z = zAt(bx, by);
      const gx = (zAt(bx + H, by) - zAt(bx - H, by)) / (2 * H), gy = (zAt(bx, by + H) - zAt(bx, by - H)) / (2 * H);
      const nb = new THREE.Vector3(-gx, -gy, 1).normalize(), n = new THREE.Vector3(nb.x * cr + nb.y * sr, -nb.x * sr + nb.y * cr, nb.z);
      e.position.set(ex, ey, z - fz).addScaledVector(n, 0.006); e.quaternion.setFromUnitVectors(ZV, n);
      if (tilt) e.quaternion.multiply(qz.setFromAxisAngle(ZV, tilt));
    };
    face.userData.eyes.forEach((e, i) => { e.material = eyeM; e.geometry = slotGeometry(); setSlot(e.geometry, 0.068, 0.2); placeEye(e, (i ? 1 : -1) * 0.1 + EDX, EY, ETILT);
      e.scale.set(1, 1, 1); e.userData.sy = 1; face.userData.shines[i].scale.set(0, 0, 0); });
    face.userData.brows.forEach((br, i) => { const ex = (i ? 1 : -1) * 0.085 + EDX, ey = 0.15, bx = ex * cr - ey * sr, by = ex * sr + ey * cr + 0.02; br.position.z = zAt(bx, by) - fz + 0.008; });
    /* studio faces: p = blended expression weights (office-logic EXPR); extra = {yaw, pitch, roll (deg), wink 0..1, eyeScale} from the idle motions.
       Per eye: a stadium (slot) of the studio w x h, tilted by the studio tilt, shifted by the gaze, re-seated on the surface when it moved. */
    const L = window.OfficeLogic;
    face.userData.studio = (p, blink, extra) => {
      const x = extra || {}, g = L.gazeShift(p, x), key = [g.x, g.y, g.roll, g.spread, p.e0w, p.e0h, p.e0t, p.e1w, p.e1h, p.e1t, x.eyeScale].map(v => Math.round((v || 0) * 5000)).join(',');
      face.userData.eyes.forEach((e, i) => {
        const w = p[i ? 'e1w' : 'e0w'] * (x.eyeScale || 1), h = p[i ? 'e1h' : 'e0h'] * (x.eyeScale || 1), tilt = p[i ? 'e1t' : 'e0t'], sz = L.slotSize(w, h);
        const open = Math.max(0.06, Math.min(p[i ? 'e1o' : 'e0o'], 1 - 0.92 * p.lid) * (1 - blink) * (i === 1 ? 1 - 0.93 * (x.wink || 0) : 1));
        if (face.userData.slotKey !== key) {
          const sx = (i ? 1 : -1) * 0.1 * g.spread, cx = sx * Math.cos(g.roll), cy = sx * Math.sin(g.roll);
          placeEye(e, cx + g.x + EDX, EY + cy + g.y, ETILT - tilt * Math.PI / 180 - g.roll);
          setSlot(e.geometry, sz.w, sz.h);
        }
        e.scale.set(1, open, 1); e.visible = true;
      });
      face.userData.slotKey = key;
    };
    face.rotation.z = rot; }
  if (a.icon) { // the artwork is the face: no slot eyes, brows or mouth on an icon tile
    face.userData.studio = () => {}; face.visible = false;
    const art = iconArt(a.icon, (bb.max.x - bb.min.x) - TILE_BEVEL * 2.4); art.position.z = bb.max.z + 0.002; body.add(art);
  }
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
  const c = finish({ name, root, rig, body, armR, armL, legR, legL, face, mats: [bodyM, limbM], colors: [new THREE.Color(0xffffff), new THREE.Color(a.color)], top: legLen + halfH * 2, sitLift: 0.34, radius: Math.min(0.42, Math.max(0.2, halfW * 0.9)), halfW, halfD: (bb.max.z - bb.min.z) / 2, kind: 'bot', generic: !!a.generic });
  if (a.prop === 'quill') {
    const q = new THREE.Group(), feather = new THREE.Mesh(geo('quill', () => { const g = new THREE.SphereGeometry(0.05, 10, 8); g.scale(0.35, 1.6, 0.12); return g; }), white());
    feather.position.y = 0.08; const nib = new THREE.Mesh(geo('nib', () => new THREE.ConeGeometry(0.008, 0.05, 6)), black()); nib.rotation.x = Math.PI; nib.position.y = -0.02;
    q.add(feather, nib); q.rotation.z = 0.5; c.armL.add(q); q.position.y = -(c.armL.userData.len || 0.2) * 0.95;
  }
  return c;
}

/* ---------- President: Tim's own 3D model (office/assets/president.glb) ----------
   Baked from Tim's textured mesh (tools/president-glb/bake.py): metres, feet on the floor, 1.45 m tall (the old President's height),
   smooth welded normals, JPEG texture with the painted eyes taken out so the live slot eyes below can blink and close for sleep.
   The mesh is skinned here to a small skeleton whose bones ARE the usual character handles (body, armR/armL, legR/legL and knees),
   so every pose in animate() (sit, type, desk sleep, nap, walk, bike, stretch, coffee ...) moves Tim's mesh; typeHands() still puts
   the fingertips on the keys. Shirt print: the name "Tim" on the wearer's LEFT chest and a round VW-style badge stand-in on the right
   chest (drawn here: ring, disc, a V over a W; not the real logo artwork), as a decal cut from the chest triangles so it follows the
   shirt surface. Loaded once; c.ready resolves when the mesh is attached (the rig, eyes and poses work before that). */
const PRES_GLB = new URL('./assets/president.glb', import.meta.url).href;
export const PRES_RIG = { top: 1.45, hip: 0.41, sitLift: 0.15, shoulder: [0.27, 0.855, 0], armRest: 0.427, armTip: 0.438, legHip: [0.113, 0.41, -0.03], knee: 0.2,
  eyes: [[-0.0567, 1.109, 0.3198, -0.1, -0.025, 0.995], [0.0632, 1.1067, 0.319, 0.308, -0.017, 0.951]], eyeW: 0.04, eyeH: 0.09,
  print: { x0: -0.2, x1: 0.2, y0: 0.62, y1: 0.86, name: [0.095, 0.765], badge: [-0.095, 0.765, 0.042] } }; // print: chest decal window (m); name on +x = wearer's left
let presAsset = null;
export function loadPresidentAsset() {
  return presAsset || (presAsset = import('./vendor/three/addons/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(PRES_GLB))
    .then(gltf => { let m = null; gltf.scene.traverse(o => { if (o.isMesh && !m) m = o; }); presSkin(m.geometry); return { geometry: m.geometry, map: m.material.map, print: presPrint(m.geometry) }; }));
}
const sstep = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/* bone order: 0 body, 1 armR (-x), 2 armL (+x), 3 hips, 4 legR, 5 kneeR, 6 legL, 7 kneeL */
function presWeights(x, y) {
  const R = PRES_RIG, ax = Math.abs(x), dx = 0.4138, dy = -0.9104; // unit vector shoulder -> hand in the rest A-pose
  const t = (ax - R.shoulder[0]) * dx + (y - R.shoulder[1]) * dy;
  const arm = sstep(t, -0.045, 0.035) * sstep(ax, 0.165, 0.215) * sstep(y, 0.36, 0.42);
  const leg = (1 - sstep(y, 0.37, 0.47)) * (1 - arm), shin = leg * (1 - sstep(y, 0.17, 0.26)), thigh = leg - shin, r = 1 - sstep(x, -0.04, 0.04);
  const w = [1 - arm - leg, x < 0 ? arm : 0, x < 0 ? 0 : arm, 0, thigh * r, shin * r, thigh * (1 - r), shin * (1 - r)];
  return w;
}
function presSkin(g) {
  const p = g.attributes.position, n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = presWeights(p.getX(i), p.getY(i)), top = w.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, 4), s = top.reduce((a, b) => a + b[0], 0) || 1;
    top.forEach(([v, k], j) => { si[i * 4 + j] = k; sw[i * 4 + j] = v / s; });
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}
/* chest decal: the body-only front triangles inside the print window, lifted 4 mm along the normal, planar UVs onto the print canvas */
function presPrint(g) {
  const P = PRES_RIG.print, p = g.attributes.position, nm = g.attributes.normal, idx = g.index, out = [], uv = [], A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  for (let f = 0; f < idx.count; f += 3) {
    const ia = idx.getX(f), ib = idx.getX(f + 1), ic = idx.getX(f + 2);
    A.fromBufferAttribute(p, ia); B.fromBufferAttribute(p, ib); C.fromBufferAttribute(p, ic);
    const cx = (A.x + B.x + C.x) / 3, cy = (A.y + B.y + C.y) / 3;
    if (cx < P.x0 - 0.02 || cx > P.x1 + 0.02 || cy < P.y0 - 0.02 || cy > P.y1 + 0.02) continue;
    N.subVectors(B, A).cross(C.clone().sub(A)).normalize(); if (N.z < 0.25) continue;
    if ([ia, ib, ic].some(i => presWeights(p.getX(i), p.getY(i))[0] < 0.999)) continue;
    for (const i of [ia, ib, ic]) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      out.push(x + nm.getX(i) * 0.004, y + nm.getY(i) * 0.004 - PRES_RIG.hip, z + nm.getZ(i) * 0.004);
      uv.push((x - P.x0) / (P.x1 - P.x0), (y - P.y0) / (P.y1 - P.y0));
    }
  }
  const d = new THREE.BufferGeometry(); d.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); d.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); d.computeVertexNormals();
  return d;
}
/* the print canvas: "Tim" on the wearer's left chest (+x), the drawn VW-style badge on the right chest (-x) */
function drawShirtPrint(x, W, H) {
  const P = PRES_RIG.print, k = W / (P.x1 - P.x0), px = v => (v - P.x0) * k, py = v => (P.y1 - v) * k;
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#f4f4f2'; x.font = "800 150px 'Inter PE', 'Inter', 'Helvetica Neue', Arial, sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('Tim', px(P.name[0]), py(P.name[1]));
  const [bx, by, br] = P.badge, cx = px(bx), cy = py(by), R = br * k;
  x.fillStyle = '#1f3f7a'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#f4f4f2'; x.lineWidth = R * 0.13; x.beginPath(); x.arc(cx, cy, R * 0.93, 0, Math.PI * 2); x.stroke();
  x.save(); x.beginPath(); x.arc(cx, cy, R * 0.86, 0, Math.PI * 2); x.clip();
  x.lineWidth = R * 0.14; x.lineJoin = 'miter'; x.lineCap = 'butt';
  x.beginPath(); x.moveTo(cx - R * 0.46, cy - R * 0.86); x.lineTo(cx, cy + R * 0.12); x.lineTo(cx + R * 0.46, cy - R * 0.86); x.stroke(); // V
  x.beginPath(); x.moveTo(cx - R * 0.92, cy - R * 0.3); x.lineTo(cx - R * 0.44, cy + R * 0.8); x.lineTo(cx, cy + R * 0.02); x.lineTo(cx + R * 0.44, cy + R * 0.8); x.lineTo(cx + R * 0.92, cy - R * 0.3); x.stroke(); // W
  x.restore();
}
function shirtPrintMaterial() {
  return mat('timShirtPrint', () => {
    const P = PRES_RIG.print, W = 1024, H = Math.round(W * (P.y1 - P.y0) / (P.x1 - P.x0)), c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const draw = () => { drawShirtPrint(x, W, H); t.needsUpdate = true; }; draw();
    if (document.fonts && document.fonts.load) document.fonts.load("800 150px 'Inter PE'").then(draw, () => {});
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  });
}
function makePresident() {
  const R = PRES_RIG, bone = (x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); return b; };
  const root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig);
  const body = bone(0, R.hip, 0), hips = bone(0, 0, 0); rig.add(body, hips);
  const [sx, sy, sz] = R.shoulder, armR = bone(-sx, sy - R.hip, sz), armL = bone(sx, sy - R.hip, sz);
  armR.rotation.z = -R.armRest; armL.rotation.z = R.armRest; body.add(armR, armL);
  for (const a of [armR, armL]) { a.userData.len = R.armTip; a.userData.tip = R.armTip; /* shoulder to fingertip, for typeHands() */ }
  const [lx, ly, lz] = R.legHip, legR = bone(-lx, ly, lz), legL = bone(lx, ly, lz), kneeR = bone(0, -R.knee, 0), kneeL = bone(0, -R.knee, 0);
  legR.add(kneeR); legL.add(kneeL); legR.userData.knee = kneeR; legL.userData.knee = kneeL; hips.add(legR, legL);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([body, armR, armL, hips, legR, kneeR, legL, kneeL]); // bind (inverse) matrices from this rest pose, root at the origin
  const skinM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
  // face: the live slot eyes sit where Tim's painted eyes were (blink, sleepy = closed); no mouth, as on the model
  const head = new THREE.Group(); head.position.set(0, 1.15 - R.hip, 0.05); body.add(head); head.visible = false;
  const face = makeFace(0, 1, false, true, 0); head.add(face);
  const matteEye = mat('eyeMatte4', () => new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1, metalness: 0 })), Zf = new THREE.Vector3(0, 0, 1);
  face.userData.eyes.forEach((e, i) => { const [ex, ey, ez, nx, ny, nz] = R.eyes[i], n = new THREE.Vector3(nx, ny, nz);
    e.material = matteEye; e.geometry = geo('pSlot', () => new THREE.CapsuleGeometry(1, 2.9, 8, 16));
    e.position.set(ex, ey, ez).sub(head.position).sub(new THREE.Vector3(0, R.hip, 0)).addScaledVector(n, -0.004);
    e.userData.sy = R.eyeH / 4.9; e.scale.set(R.eyeW / 2, e.userData.sy, 0.012); e.quaternion.setFromUnitVectors(Zf, n);
    face.userData.shines[i].scale.set(0, 0, 0); });
  face.userData.brows.forEach((b, i) => { b.position.copy(face.userData.eyes[i].position).add(new THREE.Vector3(0, 0.072, 0.004)); });
  face.userData.lids.forEach((l, i) => { l.position.copy(face.userData.eyes[i].position).add(new THREE.Vector3(0, 0, 0.012)); });
  const c = finish({ name: 'President', root, rig, body, armR, armL, legR, legL, face, mats: [skinM], colors: [skinM.color.clone()], top: R.top, sitLift: R.sitLift, radius: 0.27, halfW: 0.27, halfD: 0.2, kind: 'president', head });
  c.hips = hips;
  c.ready = loadPresidentAsset().then(a => {
    skinM.map = a.map; skinM.needsUpdate = true;
    const mesh = new THREE.SkinnedMesh(a.geometry, skinM); mesh.bind(skeleton, new THREE.Matrix4()); mesh.frustumCulled = false; mesh.userData.charName = c.name; rig.add(mesh);
    const print = new THREE.Mesh(a.print, shirtPrintMaterial()); print.userData.charName = c.name; body.add(print);
    head.visible = true; c.mesh = mesh; return c;
  }).catch(e => { console.warn('President model failed to load', e); return c; });
  return c;
}

function finish(c) {
  const r = c.armR, l = c.armL;
  c.rest = { armR: r.rotation.clone(), armL: l.rotation.clone() };
  const hold = new THREE.Group(); hold.position.y = -(r.userData.len || 0.2) * 0.95; r.add(hold);
  c.cup = makeCup(); c.can = makeCan(canStyle(c.name)); c.cue = makeCue();
  c.card = new THREE.Mesh(geo('heldCard', () => new THREE.BoxGeometry(0.12, 0.09, 0.006)), mat('cardM', () => new THREE.MeshStandardMaterial({ color: 0xeef3ff, emissive: 0x334466, emissiveIntensity: 0.4 }))); c.card.visible = false;
  c.box = makeCase();
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
  c.bodyY0 = c.body.position.y; c.halfH = (c.top - 0.16) / 2; c.fidgetNow = null; c.breath = 1;
  c.updateFace = (dt, t, reduced) => { // blend towards the target expression, then blink; studio look + move idles drift the gaze and fidget (call once per frame)
    c.expr = L.blendExpression(c.expr, c.exprTarget, dt, 9);
    const fp = reduced ? null : L.fidgetPose(L.fidgetAt(t, c.name)), w = reduced ? null : L.gazeWander(t, L.hash(c.name) % 97, c.exprTarget === 'sleepy' ? 0.3 : 1);
    c.fidgetNow = fp; c.breath = w ? w.breath : 1;
    c.face.userData.apply(c.expr, c.blinkRng ? L.blinkAmount(c.blinker, t, c.blinkRng) : 0, fp ? { yaw: (w ? w.yaw : 0) + fp.yaw, pitch: (w ? w.pitch : 0) + fp.pitch, roll: (w ? w.roll : 0) + fp.roll, wink: fp.wink, eyeScale: fp.eyeScale } : w ? { yaw: w.yaw, pitch: w.pitch, roll: w.roll } : null);
  };
  c.face.userData.apply(c.expr, 0);
  c.root.traverse(o => { if (o.isMesh) o.userData.charName = c.name; });
  return c;
}

/* ---------- procedural animation: one pose per frame ---------- */
const lerp = (a, b, k) => a + (b - a) * k;
export const SEAT_TOP = 0.495; // chair seat top (office.js: seat box centre 0.46 + half thickness 0.035)
function setLegs(c, hipR, hipL, k, mode) {
  const f = mode === 1 ? 0.8 : 1;
  c.legR.rotation.x = lerp(c.legR.rotation.x, hipR * f, k); c.legL.rotation.x = lerp(c.legL.rotation.x, hipL * f, k);
  const kn = c.legR.userData.knee; if (!kn) return;
  const kr = h => mode === 1 ? -h * f : mode === 2 ? -h * 0.9 + 0.1 : Math.max(0, -h) * 0.5 + 0.08;
  kn.rotation.x = lerp(kn.rotation.x, kr(hipR), k); c.legL.userData.knee.rotation.x = lerp(c.legL.userData.knee.rotation.x, kr(hipL), k);
}
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
  const perched = !!opts.perch && c.kind === 'bot'; // short bots stand ON the desk chair seat instead of sitting (the President keeps the seated pose)
  let lean = 0, turnY = 0;
  // eager to work: an occasional quick glance (towards the desk / monitor) while standing about
  const glance = still ? 0 : Math.max(0, Math.sin(t * 0.7 + ph * 3) - 0.85) / 0.15;
  if (c.body) c.body.position.z = 0; // President typing leans in (z 0.23); every other pose resets
  switch (pose) {
    case 'walk': {
      const s = Math.sin(t * 9 + ph); legX = s * 0.6; armR.x = -s * 0.5; armL.x = s * 0.5; bob = Math.abs(Math.cos(t * 9 + ph)) * 0.03; if (opts.box) { armR.x = armL.x = -1.25; armR.z = c.rest.armR.z * 0.3; armL.z = c.rest.armL.z * 0.3; } break;
    }
    case 'bike': { // exercise bike: seated, pedalling
      // chair seat top is 0.495, saddle top 0.705: raise by the difference so every body size sits on the saddle
      lift = c.sitLift + 0.21; const s = still ? 0 : Math.sin(t * 6 + ph) * (c.kind === 'president' ? 0.4 : 1), base = c.kind === 'president' ? -1.15 : -1.0; legX = base + s * 0.45; armR.x = -1.1; armL.x = -1.1; lean = 0.25; bob = still ? 0 : 0.01 * Math.abs(s);
      setLegs(c, legX, base - s * 0.45, k, 2); legX = null; break;
    }
    case 'lounge': { lift = c.sitLift - 0.04; legX = -1.4; armR.x = -0.5; armL.x = -0.4; lean = -0.12; if (!still) bob = 0.006 * Math.sin(t * 1.2 + ph); turnY = 0.4 * glance; break; }
    case 'sit': case 'type': case 'game': case 'meet': {
      lift = c.sitLift; legX = -1.45;
      if (perched) { lift = SEAT_TOP; legX = 0; }
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
      if (pose === 'type' && c.kind === 'president') { // humanoid typing: arms reach so the hands rest on the keys (keyboard top 0.7975); the jelly bots keep their arms
        const tap = still ? 0 : 0.05 * Math.sin(t * 15 + ph) * (Math.sin(t * 1.3 + ph) > -0.45 ? 1 : 0);
        c.body.position.z = 0.23; armR.x = -1.72 + tap; armL.x = -1.72 - tap; armR.z = c.rest.armR.z; armL.z = c.rest.armL.z; lean = Math.min(lean, 0.06);
      }
      break;
    }
    case 'deskSleep': {
      lift = c.sitLift; legX = -1.45; armR.x = -1.55; armL.x = -1.55; lean = 0.62;
      if (perched) { lift = SEAT_TOP; legX = 0; lean = 0.5; }
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
      lieZ = Math.PI / 2; lieY = window.OfficeLogic.napFit(c, opts.nap).lieY; legX = -0.2;
      if (c.kind === 'president') { armR.z = c.rest.armR.z * 0.15; armL.z = c.rest.armL.z * 0.15; } // Tim's A-pose arms tuck in so the lower one stays out of the couch
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
    case 'talk': if (opts.chair && c.kind === 'bot') lift = SEAT_TOP; if (!still) { armR.x = (opts.can ? -0.9 : -0.5) + 0.35 * Math.sin(t * 3 + ph); armL.x = -0.3 + 0.2 * Math.sin(t * 2.3 + ph); } bob = still ? 0 : 0.01 * Math.sin(t * 6); turnY = 0.5 * glance; break;
    case 'frozen': break;
    default: if (!still) bob = 0.008 * Math.sin(t * 2 + ph) + 0.012 * Math.max(0, Math.sin(t * 3.1 + ph)); // stand / loiter: bouncing on its toes
      turnY = 0.6 * glance; if (opts.can) armR.x = -0.8;
  }
  /* studio "move" fidgets (hop, squash, sway, spin) only while standing about, and only for the jelly bots (the President is a rigid minifig) */
  const fz = !still && c.kind === 'bot' && (pose === 'stand' || pose === 'talk') ? c.fidgetNow : null;
  if (fz) { bob += fz.hop; lean += fz.tilt; }
  c.body.rotation.x = lerp(c.body.rotation.x, lean, Math.min(1, dt * 5));
  c.turnBase = lerp(c.turnBase || 0, turnY, Math.min(1, dt * 5));
  c.body.rotation.y = c.turnBase + (fz ? fz.turn : 0);
  if (pose !== 'nap') {
    const sy = fz ? fz.sy : 1, sxz = fz ? fz.sxz : 1;
    if (c.body.scale.y !== sy || c.body.scale.x !== sxz) c.body.scale.set(sxz, sy, sxz);
    if (c.kind === 'bot') c.body.position.y = c.bodyY0 + c.halfH * (sy - 1);
  }
  c.armR.rotation.x = lerp(c.armR.rotation.x, armR.x, k); c.armR.rotation.z = lerp(c.armR.rotation.z, armR.z, k);
  c.armL.rotation.x = lerp(c.armL.rotation.x, armL.x, k); c.armL.rotation.z = lerp(c.armL.rotation.z, armL.z, k);
  if (legX !== null) {
    setLegs(c, legX, pose === 'walk' ? -legX : legX, k, legX <= -1.3 ? 1 : 0);
  }
  c.rig.position.y = lerp(c.rig.position.y, lift + bob + lieY, k);
  c.rig.rotation.z = lerp(c.rig.rotation.z, lieZ, Math.min(1, dt * 4));
  c.rig.rotation.x = 0;
  if (c.hips) c.hips.position.z = c.body.position.z; // President: the legs come along when the body slides in to type
  if (pose === 'type' && c.kind === 'president' && c.armR.userData.tip) typeHands(c, still ? 0 : 0.012 * Math.sin(t * 15 + ph) * (Math.sin(t * 1.3 + ph) > -0.45 ? 1 : 0));
}
/* Straight-arm reach for the President at the desk: each fingertip lands ON the keyboard top (desk seat: keys 0.525..0.675 m ahead of the root,
   top 0.7975 m), whatever the arm length; the typing tap slides the fingertip along the keys instead of lifting it off (QA #430). */
export const KEYS = { top: 0.7975, near: 0.535, far: 0.665, x: 0.1 };
const _sv = new THREE.Vector3(), _tv = new THREE.Vector3();
function typeHands(c, tap) {
  c.root.updateMatrixWorld(true);
  const shoulder = a => c.root.worldToLocal(a.parent.localToWorld(_sv.copy(a.position)));
  const sh = shoulder(c.armR), L = c.armR.userData.tip, dy = KEYS.top - sh.y, dx = KEYS.x - Math.abs(sh.x), reach = Math.sqrt(Math.max(0, L * L - dx * dx - dy * dy));
  const fit = sh.z + reach < KEYS.near ? KEYS.near - sh.z - reach : sh.z + reach > KEYS.far ? KEYS.far - sh.z - reach : 0; /* lean in or sit back so the straight arm ends on the keys */
  if (fit) { c.body.position.z += fit; if (c.hips) c.hips.position.z = c.body.position.z; c.root.updateMatrixWorld(true); }
  for (const [a, sx] of [[c.armR, -1], [c.armL, 1]]) {
    const s = shoulder(a), h = L * L - (sx * KEYS.x - s.x) ** 2 - (KEYS.top - s.y) ** 2;
    const z = Math.min(KEYS.far, Math.max(KEYS.near, s.z + Math.sqrt(Math.max(0, h)))) + sx * tap;
    a.parent.worldToLocal(c.root.localToWorld(_tv.set(sx * KEYS.x, KEYS.top, z))).sub(a.position).normalize();
    a.rotation.set(Math.atan2(-_tv.z, -_tv.y), 0, Math.asin(Math.max(-1, Math.min(1, _tv.x))));
  }
}
