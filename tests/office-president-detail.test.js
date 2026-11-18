const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'office', 'chars.js'), 'utf8');
const pres = src.slice(src.indexOf('function makePresident('), src.indexOf('function finish('));

test('makePresident: segment caps raised past the old 48/96 (brief_office7 item 2)', () => {
  const m = pres.match(/const seg = hi \? (\d+) : (\d+);/);
  assert.ok(m, 'seg line found');
  assert.ok(+m[1] > 96 && +m[2] > 48, `seg ${m[1]}/${m[2]}`);
});

test('makePresident: head, hair cap and torso meshes are cached per segment count, so hi and lo never share one', () => {
  for (const k of ['pTorso7', 'pHead6', 'pCap7']) assert.match(pres, new RegExp(`geo\\('${k}:' \\+ seg,`), k);
});

test('makePresident: hair clumps, legs and sleeves carry the finer segment counts', () => {
  const tuft = pres.match(/const g = new THREE\.SphereGeometry\(1, (\d+), (\d+)\), p = g\.attributes\.position, col = \[\];/);
  assert.ok(tuft && +tuft[1] >= 28 && +tuft[2] >= 20, 'hair clump segments');
  assert.match(pres, /new THREE\.CapsuleGeometry\(0\.074, 0\.2, 12, 48\)/);
  assert.match(pres, /new THREE\.CylinderGeometry\(0\.076, 0\.09, 0\.15, 64, 1, true\)/);
});

test('makePresident: reshaped toward the #357 reference: fringe lower and longer on the forehead, pointed back clumps', () => {
  assert.match(pres, /lock\(azd \+ part \* 20, eld - 3, len \* 1\.15, w, sw,/);
  assert.match(pres, /sharp: 0\.8 \+ rnd\(\) \* 0\.2 \}/);
});
