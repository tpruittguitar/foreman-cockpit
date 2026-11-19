// Zach show / hide switch (Tim, Nov 19, 2026): remembered per browser, default shown, and never loads zach.glb while hidden.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');

function memStore(init) { const m = new Map(Object.entries(init || {})); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; }
function rig(store, opts = {}) {
  const log = [], meshes = [];
  const io = {
    store,
    load: () => { const mesh = { id: meshes.length + 1, disposed: false }; meshes.push(mesh); log.push('load'); return opts.fail ? Promise.reject(new Error('404')) : (opts.delay ? opts.delay.then(() => mesh) : Promise.resolve(mesh)); },
    attach: m => log.push('attach ' + m.id), detach: m => log.push('detach ' + m.id), dispose: m => { m.disposed = true; log.push('dispose ' + m.id); },
    onChange: on => log.push('change ' + on)
  };
  return { sw: L.createZachSwitch(io), log, meshes };
}
const tick = () => new Promise(r => setImmediate(r));

test('setting: default shown; only a stored 0 hides; saved per browser under office.zach', () => {
  assert.equal(L.ZACH_KEY, 'office.zach');
  assert.equal(L.readZachShown(memStore()), true, 'nothing stored: shown (current behaviour)');
  assert.equal(L.readZachShown(memStore({ 'office.zach': '0' })), false);
  assert.equal(L.readZachShown(memStore({ 'office.zach': '1' })), true);
  for (const v of ['', 'x', 'true', 'null']) assert.equal(L.readZachShown(memStore({ 'office.zach': v })), true);
  assert.equal(L.readZachShown(null), true, 'no storage: shown');
  assert.equal(L.readZachShown({ getItem() { throw new Error('denied'); } }), true, 'storage throws: shown');
  const s = memStore(); L.saveZachShown(s, false); assert.equal(s.m.get('office.zach'), '0'); L.saveZachShown(s, true); assert.equal(s.m.get('office.zach'), '1');
  assert.doesNotThrow(() => L.saveZachShown({ setItem() { throw new Error('quota'); } }, false), 'private mode never throws');
});

test('hidden: the model is never loaded, attached or fetched', async () => {
  const { sw, log } = rig(memStore({ 'office.zach': '0' }));
  await sw.ready(); await tick();
  assert.equal(sw.on, false); assert.equal(sw.loaded, false); assert.deepEqual(log, []);
});

test('toggle persists; switching on loads lazily once, switching off detaches and disposes', async () => {
  const store = memStore({ 'office.zach': '0' }), { sw, log, meshes } = rig(store);
  sw.toggle(); assert.equal(store.m.get('office.zach'), '1');
  await sw.ready(); await tick();
  assert.deepEqual(log, ['change true', 'load', 'attach 1']); assert.equal(sw.loaded, true);
  sw.set(true); await tick(); assert.equal(log.filter(x => x === 'load').length, 1, 'no second load while shown');
  sw.toggle(); assert.equal(store.m.get('office.zach'), '0');
  assert.deepEqual(log.slice(3), ['detach 1', 'dispose 1', 'change false']); assert.ok(meshes[0].disposed); assert.equal(sw.loaded, false);
  // a fresh switch in the same browser starts hidden and loads nothing
  const again = rig(store); await again.sw.ready(); await tick(); assert.deepEqual(again.log, []);
});

test('default (nothing stored) loads him at start, like before the switch', async () => {
  const { sw, log } = rig(memStore()); await sw.ready(); await tick();
  assert.deepEqual(log, ['load', 'attach 1']);
});

test('switched off while still loading: the late model is disposed, never attached', async () => {
  let go; const delay = new Promise(r => { go = r; });
  const { sw, log, meshes } = rig(memStore(), { delay });
  await tick(); assert.equal(sw.loading, true);
  sw.set(false); go(); await tick(); await tick();
  assert.ok(!log.some(x => x.startsWith('attach')), 'not attached'); assert.ok(meshes[0].disposed);
});

test('off and on again during a load attaches the one in-flight model (no double load)', async () => {
  let go; const delay = new Promise(r => { go = r; });
  const { sw, log } = rig(memStore(), { delay });
  await tick(); sw.set(false); sw.set(true); go(); await tick(); await tick();
  assert.equal(log.filter(x => x === 'load').length, 1); assert.ok(log.includes('attach 1'));
});

test('a failed load is not retried in a loop; off then on tries again', async () => {
  const { sw, log } = rig(memStore(), { fail: true });
  const warn = console.warn; console.warn = () => {};
  try {
    await tick(); await tick(); sw.set(true); await tick();
    assert.equal(log.filter(x => x === 'load').length, 1);
    sw.set(false); sw.set(true); await tick(); await tick();
    assert.equal(log.filter(x => x === 'load').length, 2);
  } finally { console.warn = warn; }
});

test('office wiring: zach.js loads nothing at import; office.js gates load, walking, separation and tag on the switch', () => {
  const zj = fs.readFileSync(path.join(__dirname, '../office/zach.js'), 'utf8'), oj = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../office.html'), 'utf8');
  assert.ok(!/loadAsync\(ZACH_GLB\)[\s\S]*export function makeZach[\s\S]*loadZach/.test(zj), 'makeZach does not load');
  const mk = zj.slice(zj.indexOf('export function makeZach'), zj.indexOf('export function attachZachMesh'));
  assert.ok(!/load/i.test(mk), 'makeZach body calls no loader');
  assert.match(zj, /geometry\.dispose\(\)/); assert.match(zj, /map\.dispose\(\)/); assert.match(zj, /mat\.dispose\(\)/);
  assert.equal((oj.match(/loadZachMesh\(/g) || []).length, 1, 'office.js calls the loader only from the switch');
  assert.match(oj, /load: \(\) => loadZachMesh\(L\.ZACH\.name\)/);
  assert.match(oj, /if \(zachSw\.on\) updateZach\(dt\)/);
  assert.match(oj, /if \(zachSw\.on\) \{ \/\* Zach: a plain name tag/);
  assert.match(oj, /zachSw\.on \? \[\.\.\.chars\.values\(\), zach\]/);
  assert.match(html, /<button id="zach-btn"[^>]*aria-pressed="true"/);
});
