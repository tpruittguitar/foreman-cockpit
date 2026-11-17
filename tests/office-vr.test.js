// Office WebXR (Meta Quest): teleport clamp, VR quality presets, and a guard that desktop settings are untouched.
// Run: node --test tests/office-vr.test.js
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const L = require('../office/office-logic.js');
const room = { w: 24, d: 20, wall: 0.35 };

test('teleport target is clamped inside the walls with a margin', () => {
  const t = L.teleportTarget({ x: 99, z: -99 }, room, null);
  assert.equal(t.x, 12 - 0.35 - 0.5); assert.equal(t.z, -(10 - 0.35 - 0.5));
  assert.deepEqual(L.teleportTarget({ x: 1, z: 2 }, room, null), { x: 1, z: 2 });
});
test('teleport target is range limited from the current position and rejects bad input', () => {
  const t = L.teleportTarget({ x: 10, z: 0 }, room, { x: 0, z: 0 }, 5); assert.ok(Math.abs(t.x - 5) < 1e-9 && Math.abs(t.z) < 1e-9);
  for (const h of [null, undefined, { x: NaN, z: 0 }, { x: 0, z: Infinity }]) assert.equal(L.teleportTarget(h, room, null), null);
  assert.equal(L.teleportTarget({ x: 0, z: 0 }, null, null), null);
});
test('rig position puts the head, not the rig origin, on the target', () => {
  assert.deepEqual(L.teleportRigPos({ x: 3, z: 4 }, { x: 0.5, z: -0.25 }), { x: 2.5, z: 4.25 });
  assert.deepEqual(L.teleportRigPos({ x: 3, z: 4 }, null), { x: 3, z: 4 });
});
test('VR preset lowers cost and targets 72 fps; desktop preset is the unchanged look', () => {
  const v = L.qualityFor(true), d = L.qualityFor(false);
  assert.equal(v.targetFps, 72); assert.equal(v.shadows, false); assert.ok(v.framebufferScale < 1); assert.equal(v.labels, false); assert.equal(v.css3d, false); assert.equal(v.maxAlertLights, 0);
  assert.deepEqual(d, { vr: false, shadows: false, labels: true, css3d: true, deskDrawMs: 120, hoverMs: 90, maxAlertLights: 2, framebufferScale: 1, foveation: 0, targetFps: 0 });
  assert.ok(Object.isFrozen(d) && Object.isFrozen(v));
});
test('frame rate pick: nearest supported at/above 72, else highest', () => {
  assert.equal(L.pickFrameRate([60, 72, 90, 120], 72), 72); assert.equal(L.pickFrameRate([60, 90], 72), 90); assert.equal(L.pickFrameRate([30, 60], 72), 60); assert.equal(L.pickFrameRate(null, 72), 72);
});
test('desktop settings untouched: original renderer/effects lines remain and VR trims are gated on isPresenting', () => {
  const js = fs.readFileSync(__dirname + '/../office/office.js', 'utf8');
  for (const line of [
    "new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance', alpha: true })",
    "Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2, 2880 / Math.max(innerWidth, innerHeight))",
    "renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45 * 0.9;",
    "renderer.shadowMap.enabled = false;",
    "renderer.setClearColor(0x0e1013, 0);",
  ]) assert.ok(js.includes(line), 'missing: ' + line);
  assert.ok(js.includes("const XR = renderer.xr.isPresenting, Q = L.qualityFor(XR)"));
  assert.ok(!/setPixelRatio\([^)]*xr/i.test(js));
});
test('office.html has exactly one vr-btn, hidden until WebXR support is detected, no longer a placeholder', () => {
  const html = fs.readFileSync(__dirname + '/../office.html', 'utf8');
  assert.equal((html.match(/id="vr-btn"/g) || []).length, 1);
  assert.match(html, /id="vr-btn"[^>]*\bhidden\b/); assert.ok(!/coming soon/i.test(html));
});
