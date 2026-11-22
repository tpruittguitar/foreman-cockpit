/* Welding robot cell for the warehouse (Tim, Nov 22, 2026: "create a welding robot and place it in the factory area with
   movement and sparks when it's working. Same cartoony style as everything else in the environment").
   A chunky, glossy yellow arm with a plain round head (no eyes), beside a bare-metal car shell (body-in-white, before paint) on a
   yellow jig, and a weld cycle: swing over a seam, lay a glowing bead along it with sparks and an arc glow, lift, rest, then do the
   other seam. Tim, Nov 22 review: no eyes, no safety cones, and a metal-frame car to weld on.
   It welds while any bot in the office is working (office data), and makes non-contact inspection sweeps with an amber beacon when the whole office is idle.
   THREE is passed in so the pure parts (cycle timing, arm IK) load in node tests without the import map. */

export const WELD_PHASES = [['approach', 1.2], ['weld', 4.5], ['lift', 1.0], ['pause', 1.8]];
export const WELD_CYCLE_S = WELD_PHASES.reduce((s, p) => s + p[1], 0);
export const ARM = { shoulderY: 0.95, upper: 0.85, fore: 0.8, torch: 0.3, torchAngle: -70 * Math.PI / 180 };
export const SPARKS = { desktop: 64, phone: 28, rate: 100, gravity: -9.8, burstEvery: 0.48, burstFor: 0.17 };
/* robot-local layout: base at the origin, the car shell along z on the +x side, nose at +z. Its near side faces the robot.
   Seams: 0 runs along the near roof rail (roof to side panel), 1 along the near hood edge (hood to fender), sloping down to the nose. */
export const CAR = { x: 1.43, w: 1.36, l: 3.24, near: 0.75 };
export const SEAMS = [{ x: 0.80, z0: -0.5, y0: 1.396, z1: 0.25, y1: 1.402 }, { x: 0.80, z0: 0.95, y0: 0.927, z1: 1.4, y1: 0.867 }];
export const HOME_TIP = { x: 0.6, y: 1.6, z: 0.2 };
/* the striped cell floor, robot-local; the office blocks walking inside it */
export const CELL = { x0: -0.9, x1: 2.45, z0: -1.9, z1: 1.9 };
/* side profile of the shell (u along the car, nose at +u; v up), shared by the drawing and the spark bounce */
const ROOF = [-0.6, 0.35], HOOD = [0.85, 1.6], TRUNK = [-1.6, -1.05];
const hoodY = u => 0.92 - (u - 0.85) * 0.1333;
export function carTopAt(z) { // top surface height under robot-local z, or the floor pan where the glass would be
  if (z >= ROOF[0] && z <= ROOF[1]) return 1.395;
  if (z >= HOOD[0] && z <= HOOD[1]) return hoodY(z) + 0.015;
  if (z >= TRUNK[0] && z <= TRUNK[1]) return 0.895;
  return 0.42;
}

/* Where the cycle is at time t (seconds since the robot started working). */
export function weldPhase(t) {
  const n = Math.floor(Math.max(0, t) / WELD_CYCLE_S), seam = n % 2;
  let r = Math.max(0, t) - n * WELD_CYCLE_S;
  for (const [phase, d] of WELD_PHASES) { if (r < d) return { seam, phase, k: r / d, cycle: n }; r -= d; }
  return { seam, phase: 'pause', k: 1, cycle: n };
}

const smooth = k => k * k * (3 - 2 * k);
const lerp3 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });

/* Torch-tip target for a phase: hover over the seam, weld along it with a small weave, lift away, rest at home. */
export function tipTarget(ph, t) {
  const s = SEAMS[ph.seam], a = { x: s.x, y: s.y0, z: s.z0 }, b = { x: s.x, y: s.y1, z: s.z1 }, up = p => ({ x: p.x - 0.05, y: p.y + 0.28, z: p.z });
  if (ph.phase === 'approach') return ph.k < 0.7 ? lerp3(HOME_TIP, up(a), smooth(ph.k / 0.7)) : lerp3(up(a), a, smooth((ph.k - 0.7) / 0.3));
  if (ph.phase === 'weld') { const p = lerp3(a, b, ph.k); p.x += 0.006 * Math.sin(t * 22); return p; }
  if (ph.phase === 'lift') return ph.k < 0.3 ? lerp3(b, up(b), smooth(ph.k / 0.3)) : lerp3(up(b), HOME_TIP, smooth((ph.k - 0.3) / 0.7));
  return { x: HOME_TIP.x, y: HOME_TIP.y + 0.02 * Math.sin(t * 1.6), z: HOME_TIP.z };
}

/* Idle checks stay on the robot side of the car and above its work surface.
   A separate clock drives the gentle sweep without advancing the work cycle. */
function idleTip(t) {
  const a = t * Math.PI * 2 / 8;
  return lerp3(HOME_TIP, {
    x: 0.57 + 0.055 * Math.sin(a - 0.6),
    y: 1.69 + 0.10 * Math.sin(a * 2 - 0.5),
    z: 0.12 + 0.25 * Math.sin(a)
  }, smooth(Math.min(1, t / 1.4)));
}

/* A scheduled weld is not contact: the moving nozzle must actually arrive over the visible steel. */
export function weldContact(ph, tip) {
  if (ph.phase !== 'weld') return false;
  const seam = SEAMS[ph.seam];
  return tip.z >= seam.z0 - 0.012 && tip.z <= seam.z1 + 0.012 &&
    Math.abs(tip.x - seam.x) < 0.018 && Math.abs(tip.y - carTopAt(tip.z)) < 0.020;
}

/* Two-link IK, elbow up, torch held at a fixed downward tilt. Returns base yaw and absolute link angles in the arm plane. */
export function solveArm(tip) {
  const yaw = Math.atan2(-tip.z, tip.x), r = Math.hypot(tip.x, tip.z), ta = ARM.torchAngle;
  const wr = r - ARM.torch * Math.cos(ta), wy = tip.y - ARM.torch * Math.sin(ta);
  const dx = wr, dy = wy - ARM.shoulderY, L1 = ARM.upper, L2 = ARM.fore;
  const d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, Math.hypot(dx, dy)));
  const a1 = Math.atan2(dy, dx) + Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
  const ex = L1 * Math.cos(a1), ey = ARM.shoulderY + L1 * Math.sin(a1), a2 = Math.atan2(wy - ey, wr - ex);
  return { yaw, a1, a2, a3: ta };
}
/* Forward kinematics (robot-local), the inverse of solveArm: used by the tests. */
export function armTip(j) {
  const r = ARM.upper * Math.cos(j.a1) + ARM.fore * Math.cos(j.a2) + ARM.torch * Math.cos(j.a3);
  const y = ARM.shoulderY + ARM.upper * Math.sin(j.a1) + ARM.fore * Math.sin(j.a2) + ARM.torch * Math.sin(j.a3);
  return { x: r * Math.cos(j.yaw), y, z: -r * Math.sin(j.yaw) };
}

/* The work clock winds down to its pause when activity stops; idle pose checks use a separate clock. */
export function advanceClock(t, dt, working) {
  const ph = weldPhase(t);
  if (working || ph.phase !== 'pause') return t + dt;
  return t; // idle and at rest: hold
}

export function makeWeldRobot(THREE, opts = {}) {
  const low = !!opts.low, maxSparks = low ? SPARKS.phone : SPARKS.desktop, hasDoc = typeof document !== 'undefined';
  const root = new THREE.Group(); root.name = 'weld-robot';
  const M = {
    body: new THREE.MeshPhysicalMaterial({ color: 0xffb21f, roughness: 0.28, clearcoat: low ? 0 : 0.8, clearcoatRoughness: 0.15 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8b939d, roughness: 0.4, metalness: 0.7 }),
    bare: new THREE.MeshStandardMaterial({ color: 0xc3cad2, roughness: 0.34, metalness: 0.45 }), // unpainted body steel
    copper: new THREE.MeshStandardMaterial({ color: 0xd9894a, roughness: 0.3, metalness: 0.8 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.25 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.6, emissive: 0x6a4a00, emissiveIntensity: 0.4 }),
    mat: new THREE.MeshStandardMaterial({ color: 0x45494f, roughness: 0.95 }),
    beacon: new THREE.MeshStandardMaterial({ color: 0x3ddc84, emissive: 0x3ddc84, emissiveIntensity: 1.6, roughness: 0.3 })
  };
  const add = (geo, mat, x, y, z, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  /* ---- cell floor: dark mat, yellow safety border ---- */
  const cw = CELL.x1 - CELL.x0, cd = CELL.z1 - CELL.z0, cx = (CELL.x0 + CELL.x1) / 2;
  add(new THREE.BoxGeometry(cw, 0.012, cd), M.mat, cx, 0.006, 0);
  for (const z of [CELL.z0, CELL.z1]) add(new THREE.BoxGeometry(cw, 0.016, 0.12), M.stripe, cx, 0.008, z);
  for (const x of [CELL.x0, CELL.x1]) add(new THREE.BoxGeometry(0.12, 0.016, cd), M.stripe, x, 0.008, 0);

  /* ---- car shell: bare steel body-in-white on a yellow jig ---- */
  const W = CAR.w, cxC = CAR.x, prof = new THREE.Shape();
  prof.moveTo(-1.6, 0.42); prof.lineTo(-1.6, 0.86); prof.lineTo(-1.05, 0.90); prof.lineTo(-0.6, 1.36); prof.lineTo(0.35, 1.38);
  prof.lineTo(0.85, 0.92); prof.lineTo(1.6, 0.82); prof.lineTo(1.62, 0.45); prof.lineTo(1.45, 0.36); prof.lineTo(1.41, 0.36);
  prof.absarc(1.05, 0.36, 0.36, 0, Math.PI, false); prof.lineTo(-0.64, 0.36); prof.absarc(-1.0, 0.36, 0.36, 0, Math.PI, false);
  prof.lineTo(-1.5, 0.36); prof.closePath();
  for (const pts of [[[0.08, 0.95], [0.70, 0.95], [0.30, 1.31], [0.08, 1.31]], [[-0.08, 0.95], [-0.08, 1.31], [-0.52, 1.31], [-0.78, 0.95]]])
    prof.holes.push(new THREE.Path(pts.map(([u, v]) => new THREE.Vector2(u, v)))); // door window openings leave the A, B and C pillars
  const sideG = new THREE.ExtrudeGeometry(prof, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: low ? 1 : 2, curveSegments: low ? 8 : 14 });
  sideG.rotateY(-Math.PI / 2); // profile u -> z, extrusion -> -x
  const nearX = CAR.near + 0.02, farX = cxC + W / 2 - 0.02, inner0 = nearX + 0.02, inner1 = farX - 0.06, iw = inner1 - inner0, icx = (inner0 + inner1) / 2;
  add(sideG, M.bare, nearX, 0, 0); add(sideG, M.bare, farX, 0, 0);
  add(new THREE.BoxGeometry(iw, 0.05, ROOF[1] - ROOF[0] + 0.06), M.bare, icx, 1.37, (ROOF[0] + ROOF[1]) / 2);
  const panel = (u0, u1, y0, y1, th) => { const len = Math.hypot(u1 - u0, y1 - y0), m = add(new THREE.BoxGeometry(iw, th, len), M.bare, icx, (y0 + y1) / 2 - th / 2, (u0 + u1) / 2); m.rotation.x = -Math.atan2(y1 - y0, u1 - u0); return m; };
  panel(HOOD[0], HOOD[1], hoodY(HOOD[0]) + 0.015, hoodY(HOOD[1]) + 0.015, 0.04);  // hood
  panel(TRUNK[0], TRUNK[1], 0.88, 0.91, 0.04);                                         // trunk lid
  add(new THREE.BoxGeometry(iw, 0.04, 3.0), M.bare, icx, 0.4, 0);                       // floor pan
  add(new THREE.BoxGeometry(iw, 0.37, 0.05), M.bare, icx, 0.635, 1.6);                  // nose panel
  add(new THREE.BoxGeometry(iw, 0.44, 0.05), M.bare, icx, 0.64, -1.6);                  // tail panel
  for (const u of [0.85, -1.05]) add(new THREE.BoxGeometry(iw, 0.05, 0.08), M.bare, icx, 0.89, u); // cowl and rear window sill
  for (const x of [nearX - 0.065, farX + 0.025]) for (const u of [0.86, 0.0, -0.76]) // door cut lines
    add(new THREE.BoxGeometry(0.012, 0.5, 0.018), M.joint, x, 0.66, u);
  for (const dx of [-0.42, 0.42]) add(new THREE.BoxGeometry(0.12, 0.1, 3.0), M.joint, cxC + dx, 0.06, 0); // jig rails
  for (const dx of [-0.42, 0.42]) for (const u of [-1.15, 1.2]) { add(new THREE.BoxGeometry(0.16, 0.26, 0.16), M.body, cxC + dx, 0.24, u); add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), M.joint, cxC + dx, 0.39, u); }
  const beads = SEAMS.map(s => { // weld bead: grows along the seam, glows hot, then cools
    const g = new THREE.CapsuleGeometry(0.014, 1, 3, 8); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
    const m = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.4, metalness: 0.6, emissive: 0xff6a10, emissiveIntensity: 0 });
    const mesh = add(g, m, s.x, s.y0, s.z0); mesh.rotation.x = -Math.atan2(s.y1 - s.y0, s.z1 - s.z0); mesh.scale.set(1, 1, 1e-3); mesh.visible = false;
    return { mesh, m, len: Math.hypot(s.z1 - s.z0, s.y1 - s.y0), heat: 0 };
  });

  /* ---- robot ---- */
  add(new THREE.CylinderGeometry(0.5, 0.55, 0.08, 28), M.joint, 0, 0.04, 0);
  const pedestal = add(new THREE.CylinderGeometry(0.34, 0.42, 0.46, 28), M.body, 0, 0.31, 0);
  if (hasDoc) { // black and yellow hazard band round the pedestal
    const c = document.createElement('canvas'); c.width = 256; c.height = 32; const x = c.getContext('2d');
    x.fillStyle = '#ffc21a'; x.fillRect(0, 0, 256, 32); x.fillStyle = '#16181b';
    for (let k = -2; k < 18; k++) { x.beginPath(); x.moveTo(k * 16, 32); x.lineTo(k * 16 + 8, 32); x.lineTo(k * 16 + 24, 0); x.lineTo(k * 16 + 16, 0); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
    add(new THREE.CylinderGeometry(0.398, 0.413, 0.09, 28, 1, true), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), 0, 0.2, 0);
  }
  pedestal.userData.part = 'pedestal';
  const turn = new THREE.Group(); turn.position.y = 0.54; root.add(turn); // yaws to face the work
  add(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 28), M.joint, 0, 0.0, 0, turn);
  const head = add(new THREE.SphereGeometry(0.3, 28, 20), M.body, 0, 0.2, 0, turn); head.scale.set(1, 0.85, 0.95);
  const beaconMesh = add(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 16), M.beacon, -0.18, 0.47, 0, turn);
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 16), M.joint, -0.18, 0.415, 0, turn);
  const shoulder = new THREE.Group(); shoulder.position.y = ARM.shoulderY - 0.54; turn.add(shoulder);
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.34, 20), M.joint, 0, 0, 0, shoulder).rotation.x = Math.PI / 2;
  const capsAlongX = (r, len) => { const g = new THREE.CapsuleGeometry(r, len, 6, 16); g.rotateZ(-Math.PI / 2); return g; };
  add(capsAlongX(0.11, ARM.upper - 0.2), M.body, ARM.upper / 2, 0, 0, shoulder);
  const elbow = new THREE.Group(); elbow.position.x = ARM.upper; shoulder.add(elbow);
  add(new THREE.SphereGeometry(0.13, 20, 14), M.joint, 0, 0, 0, elbow);
  add(capsAlongX(0.085, ARM.fore - 0.18), M.body, ARM.fore / 2, 0, 0, elbow);
  const wrist = new THREE.Group(); wrist.position.x = ARM.fore; elbow.add(wrist);
  add(new THREE.SphereGeometry(0.085, 16, 12), M.joint, 0, 0, 0, wrist);
  const torchBody = add(new THREE.CylinderGeometry(0.035, 0.045, ARM.torch - 0.08, 12), M.joint, (ARM.torch - 0.08) / 2 + 0.02, 0, 0, wrist); torchBody.rotation.z = -Math.PI / 2;
  const nozzle = add(new THREE.CylinderGeometry(0.018, 0.034, 0.08, 12), M.copper, ARM.torch - 0.04, 0, 0, wrist); nozzle.rotation.z = -Math.PI / 2;
  const tip = new THREE.Object3D(); tip.name = 'weld-tip'; tip.position.x = ARM.torch; wrist.add(tip);

  /* ---- arc glow at the tip (two additive sprites), and one flickering light on desktop ---- */
  const glowTex = (() => {
    if (!hasDoc) return null;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(200,230,255,0.9)'); g.addColorStop(0.6, 'rgba(120,170,255,0.25)'); g.addColorStop(1, 'rgba(80,120,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const spriteMat = (color, op) => new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const arc = new THREE.Sprite(spriteMat(0xdff0ff, 1)), halo = new THREE.Sprite(spriteMat(0xffa040, 0.55));
  arc.visible = halo.visible = false; root.add(arc, halo);
  const light = opts.light === false ? null : new THREE.PointLight(0xcfe2ff, 0, 5, 1.6);
  if (light) root.add(light);

  /* ---- sparks: one pooled Points object, additive, round dots; dead sparks sit at alpha 0 (black) ---- */
  const pos = new Float32Array(maxSparks * 3), col = new Float32Array(maxSparks * 3), vel = new Float32Array(maxSparks * 3), life = new Float32Array(maxSparks), age = new Float32Array(maxSparks);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(CAR.x, 1, 0), 3.5);
  const dotTex = (() => { if (!hasDoc) return null; const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); return t; })();
  const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: low ? 0.075 : 0.06, map: dotTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true }));
  sparks.name = 'weld-sparks'; sparks.visible = false; root.add(sparks);
  let alive = 0, emitAcc = 0;

  const J = solveArm(HOME_TIP), cur = Object.assign({}, J);
  let t = WELD_CYCLE_S - WELD_PHASES[3][1], seed = 1, wasVisible = true, idleTime = 0; // starts at rest, so it begins with an approach
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tipLocal = new THREE.Vector3(), mid = new THREE.Vector3(), sphere = new THREE.Sphere(), frustum = new THREE.Frustum(), pv = new THREE.Matrix4();

  function pose(j) { turn.rotation.y = j.yaw; shoulder.rotation.z = j.a1; elbow.rotation.z = j.a2 - j.a1; wrist.rotation.z = j.a3 - j.a2; }
  function spawn(at) {
    let i = -1; for (let k = 0; k < maxSparks; k++) if (age[k] >= life[k]) { i = k; break; }
    if (i < 0) return;
    const a = rnd() * Math.PI * 2, up = 0.8 + rnd() * 1.8, out = 0.6 + rnd() * 1.6;
    pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
    vel[i * 3] = Math.cos(a) * out - 0.6; vel[i * 3 + 1] = up; vel[i * 3 + 2] = Math.sin(a) * out; // a little bias out, away from the body side
    age[i] = 0; life[i] = 0.09 + rnd() * 0.14;
    col[i * 3] = 1; col[i * 3 + 1] = 0.66; col[i * 3 + 2] = 0.22; alive++;
  }
  function stepSparks(dt, emitting, at) {
    alive = 0;
    for (let i = 0; i < maxSparks; i++) {
      if (age[i] >= life[i]) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      age[i] += dt; alive++;
      vel[i * 3 + 1] += SPARKS.gravity * dt;
      let x = pos[i * 3] + vel[i * 3] * dt, y = pos[i * 3 + 1] + vel[i * 3 + 1] * dt, z = pos[i * 3 + 2] + vel[i * 3 + 2] * dt;
      const onCar = x > CAR.near && x < CAR.x + CAR.w / 2 && Math.abs(z) < CAR.l / 2, floor = onCar ? carTopAt(z) : 0.015;
      if (y < floor && vel[i * 3 + 1] < 0) { y = floor; vel[i * 3 + 1] *= -0.3; vel[i * 3] *= 0.5; vel[i * 3 + 2] *= 0.5; }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const k = Math.min(1, age[i] / life[i]), fade = 1 - k * k; // yellow -> orange -> gone
      col[i * 3] = fade; col[i * 3 + 1] = (0.66 - 0.36 * k) * fade; col[i * 3 + 2] = (0.22 - 0.2 * k) * fade;
    }
    if (emitting) { emitAcc += dt * SPARKS.rate * (low ? 0.5 : 1); while (emitAcc >= 1) { spawn(at); emitAcc -= 1; } } else emitAcc = 0;
    sparks.visible = alive > 0;
    sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true;
  }

  /* dt in seconds; working: any bot in the office is working; reduced: prefers-reduced-motion; camera: skip the sim off screen */
  function update(dt, s = {}) {
    const working = !!s.working, reduced = !!s.reduced;
    t = advanceClock(t, dt, working);
    idleTime = working ? 0 : idleTime + (reduced ? 0 : Math.min(dt, 0.05));
    if (s.camera) { // off screen or far away: keep the clock, skip the posing and the particles
      root.updateWorldMatrix(true, false); sphere.set(mid.set(CAR.x / 2, 1, 0).applyMatrix4(root.matrixWorld), 4);
      pv.multiplyMatrices(s.camera.projectionMatrix, s.camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
      const vis = frustum.intersectsSphere(sphere) && sphere.center.distanceTo(s.camera.position) < 45;
      if (!vis) { if (wasVisible) { arc.visible = halo.visible = false; if (light) light.intensity = 0; age.fill(9); stepSparks(0, false); } wasVisible = false; return { visible: false }; }
      wasVisible = true;
    }
    const ph = weldPhase(t), parked = !working && ph.phase === 'pause';
    if (working || !reduced) {
      const want = solveArm(working ? tipTarget(ph, t) : idleTip(idleTime));
      const f = 1 - Math.exp(-dt * (working && ph.phase === 'weld' ? 18 : 7));
      for (const k of ['yaw', 'a1', 'a2', 'a3']) cur[k] += (want[k] - cur[k]) * f;
    }
    pose(cur);
    tip.updateWorldMatrix(true, false); tipLocal.setFromMatrixPosition(tip.matrixWorld); root.worldToLocal(tipLocal);
    const welding = working && weldContact(ph, tipLocal);
    const burst = welding && !reduced && (ph.k * WELD_PHASES[1][1]) % SPARKS.burstEvery < SPARKS.burstFor;
    // beads: reset when its part comes round again, grow while welding, then cool
    beads.forEach((b, i) => {
      if (ph.seam === i && ph.phase === 'approach' && ph.k < 0.1) { b.mesh.visible = false; b.heat = 0; }
      if (ph.seam === i && welding) { b.mesh.visible = true; b.mesh.scale.z = Math.max(1e-3, b.len * ph.k); b.heat = 1; }
      else b.heat = Math.max(0, b.heat - dt / 5);
      b.m.emissiveIntensity = 2.4 * b.heat * b.heat;
    });
    const flick = burst ? 0.65 + 0.35 * Math.sin(t * 53) * Math.sin(t * 31 + 1) : 0;
    arc.visible = halo.visible = burst;
    if (burst) { arc.position.copy(tipLocal); halo.position.copy(tipLocal); arc.scale.setScalar(0.2 + 0.12 * flick); halo.scale.setScalar(0.5 + 0.25 * flick); }
    if (light) { light.position.set(tipLocal.x - 0.1, tipLocal.y + 0.15, tipLocal.z); light.intensity = burst ? 4 + 3 * flick : 0; }
    if (!welding || reduced) age.set(life); // no lingering sparks after the tip leaves the part
    stepSparks(Math.min(dt, 0.05), burst, tipLocal);
    // beacon green while the office works, amber when parked
    M.beacon.color.setHex(working ? 0x3ddc84 : 0xffb020); M.beacon.emissive.setHex(working ? 0x3ddc84 : 0xffb020);
    M.beacon.emissiveIntensity = working ? 1.2 + 0.6 * Math.max(0, Math.sin(t * 6)) : 0.9;
    return { visible: true, phase: ph.phase, seam: ph.seam, welding, parked, sparks: alive };
  }
  pose(cur);
  return { group: root, update, maxSparks, cell: CELL, state: () => ({ t, phase: weldPhase(t), sparks: alive }) };
}
