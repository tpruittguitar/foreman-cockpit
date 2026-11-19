// Zach (Tim, Nov 19, 2026): a young visitor in the 3D office who does idle tasks. He is a person, not a bot, and stands at most
// 3/4 of the President's height.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');

function glbBounds(file) {
  const d = fs.readFileSync(file), n = d.readUInt32LE(12), js = JSON.parse(d.subarray(20, 20 + n).toString());
  const a = js.accessors[js.meshes[0].primitives[0].attributes.POSITION];
  return { min: a.min, max: a.max, json: js };
}

test('Zach model is at most 3/4 of the President, feet on the floor, centred', () => {
  const z = glbBounds(path.join(__dirname, '../office/assets/zach.glb')), p = glbBounds(path.join(__dirname, '../office/assets/president.glb'));
  const zh = z.max[1] - z.min[1], ph = p.max[1] - p.min[1];
  assert.ok(Math.abs(z.min[1]) < 1e-4, 'feet at y=0');
  assert.ok(Math.abs(zh - L.ZACH.height) < 0.005, 'baked to L.ZACH.height');
  assert.ok(zh <= 0.75 * ph + 1e-6, `Zach ${zh.toFixed(3)} m vs President ${ph.toFixed(3)} m`);
  assert.ok(L.ZACH.maxHeight <= 0.75 * ph + 1e-6);
  assert.ok(Math.abs((z.max[0] + z.min[0]) / 2) < 0.01 && Math.abs((z.max[2] + z.min[2]) / 2) < 0.01, 'centred in x and z');
  assert.equal(z.json.images.length, 1, 'one color map, like the President');
  assert.ok(fs.statSync(path.join(__dirname, '../office/assets/zach.glb')).size < 2.5e6, 'small enough for the web');
});

test('no idle motion lifts Zach past 3/4 of the President', () => {
  for (const mode of ['walk', ...L.ZACH_TASKS.map(t => t.act)]) for (let t = 0; t < 40; t += 0.05) for (const reduced of [false, true]) {
    const m = L.zachMotion(mode, t, reduced);
    assert.ok(L.ZACH.height * m.sy <= L.ZACH.maxHeight, `${mode} t=${t} body ${L.ZACH.height * m.sy}`);
    assert.ok(Math.abs(m.sxz * Math.sqrt(m.sy) - 1) < 1e-9 || m.sxz === 1, 'squash keeps volume');
  }
});

test('reduced motion stops idle fidgets', () => {
  for (const t of [0.3, 2, 7.9, 8.8]) {
    const m = L.zachMotion('look_around', t, true);
    assert.deepEqual([m.yaw, m.roll, m.pitch, m.y, m.sy].map(v => v + 0), [0, 0, 0, 0, 1]);
  }
});

test('Zach never repeats a task twice in a row and each task has a slot kind and a dwell', () => {
  const rnd = L.makeRng(42); let prev = null;
  for (let i = 0; i < 200; i++) {
    const t = L.zachPick(prev, rnd);
    assert.notEqual(t.act, prev); assert.ok(t.kinds.length); assert.ok(t.dwellS >= 10 && t.dwellS <= 45);
    prev = t.act;
  }
  const seen = new Set(); prev = null; for (let i = 0; i < 300; i++) { prev = L.zachPick(prev, rnd).act; seen.add(prev); }
  assert.equal(seen.size, L.ZACH_TASKS.length, 'every task comes up');
});

test('Zach is not a bot: no roster entry, bot id, avatar or bot character', () => {
  assert.ok(!L.ROSTER.some(r => r.name === 'Zach'));
  assert.ok(!Object.values(L.BOT_ID_NAMES).includes('Zach'));
  const av = fs.readFileSync(path.join(__dirname, '../office/avatars.js'), 'utf8');
  assert.ok(!/['"]Zach['"]/.test(av), 'no avatar or bot id for Zach');
  const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
  assert.ok(!/chars\.set\(\s*['"]?Zach/.test(office) && !/chars\.set\([^)]*zach/i.test(office), 'not added to the bot map');
  assert.match(office, /const zach = makeZach\(L\)/);
});
