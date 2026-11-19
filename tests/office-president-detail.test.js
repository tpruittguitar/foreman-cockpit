// President = Tim's own 3D model (office/assets/president.glb), skinned to the shared pose handles, with "Tim" and a drawn badge on the shirt.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'office', 'chars.js'), 'utf8');
const pres = src.slice(src.indexOf('/* ---------- President:'), src.indexOf('function finish('));
const RIG = Function('return ' + src.match(/export const PRES_RIG = (\{[\s\S]*?\}\s*\}\s*);/)[1])();
const glbPath = path.join(root, 'office', 'assets', 'president.glb');

function readGlb(file) {
  const b = fs.readFileSync(file), jl = b.readUInt32LE(12);
  return { size: b.length, magic: b.toString('ascii', 0, 4), json: JSON.parse(b.toString('utf8', 20, 20 + jl)) };
}

test('president.glb is committed, small, and a plain textured mesh (JPEG texture, normals, 16-bit indices)', () => {
  const g = readGlb(glbPath);
  assert.equal(g.magic, 'glTF');
  assert.ok(g.size < 1.5 * 1024 * 1024, 'under 1.5 MB: ' + g.size);
  const prim = g.json.meshes[0].primitives[0];
  for (const a of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.ok(a in prim.attributes, a);
  assert.equal(g.json.accessors[prim.indices].componentType, 5123);
  assert.equal(g.json.images[0].mimeType, 'image/jpeg');
  const pos = g.json.accessors[prim.attributes.POSITION];
  assert.ok(Math.abs(pos.max[1] - RIG.top) < 0.005 && Math.abs(pos.min[1]) < 0.005, 'feet on the floor, President height');
});

test('makePresident loads the GLB with the vendored three.js GLTFLoader and skins it to the pose handles', () => {
  assert.match(src, /new URL\('\.\/assets\/president\.glb', import\.meta\.url\)/);
  assert.match(pres, /import\('\.\/vendor\/three\/addons\/GLTFLoader\.js'\)/);
  assert.ok(fs.existsSync(path.join(root, 'office/vendor/three/addons/GLTFLoader.js')));
  assert.ok(fs.existsSync(path.join(root, 'office/vendor/three/utils/BufferGeometryUtils.js')));
  assert.match(pres, /new THREE\.Skeleton\(\[body, armR, armL, hips, legR, kneeR, legL, kneeL\]\)/);
  assert.match(pres, /new THREE\.SkinnedMesh\(a\.geometry, skinM\)/);
  assert.match(pres, /legR\.userData\.knee = kneeR/);
  assert.equal(RIG.top, 1.45);
});

test('shirt print: "Tim" on the wearer\'s LEFT chest (+x), the drawn VW-style badge on the right, no logo image file', () => {
  assert.ok(RIG.print.name[0] > 0.05, 'name on +x (wearer\'s left; the model faces +z)');
  assert.ok(RIG.print.badge[0] < -0.05, 'badge on the other side');
  assert.match(pres, /x\.fillText\('Tim',/);
  assert.match(pres, /\/\/ V\n/); assert.match(pres, /\/\/ W\n/);
  assert.doesNotMatch(pres, /new Image\(|\.svg|\.png/);
});

test('live slot eyes replace the painted ones, so blinking and sleepy closed eyes still work', () => {
  assert.match(pres, /const face = makeFace\(0, 1, false, true, 0\)/);
  assert.equal(RIG.eyes.length, 2);
  assert.match(src, /f\.userData\.lids = lids;/);
});
