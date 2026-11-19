// Root's monitor draws one face at every distance (the mirror when a grab is present, otherwise the terminal).
// Name tags still shrink past TAG_FAR_M. draw.js is loaded from a temp copy marked "type": "module".
// Run: node --test tests/office-root-far-screen.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8'), css = fs.readFileSync(path.join(__dirname, '../office/office.css'), 'utf8');
let D;
test.before(async () => {
  globalThis.window = { OfficeLogic: L };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-draw-'));
  for (const f of ['draw.js', 'avatars.js']) fs.copyFileSync(path.join(__dirname, '../office', f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  D = await import(pathToFileURL(path.join(dir, 'draw.js')).href);
});
function fakeCtx() {
  const texts = [], images = [], noop = () => {};
  return { texts, images, font: '', fillStyle: '', textAlign: 'left', measureText(t) { return { width: String(t).length * 8 }; },
    fillText(t) { texts.push(String(t)); }, drawImage(img) { images.push(img); }, fillRect: noop, beginPath: noop, arc: noop, fill: noop, stroke: noop,
    moveTo: noop, lineTo: noop, closePath: noop, quadraticCurveTo: noop, arcTo: noop, rect: noop, save: noop, restore: noop, clip: noop, strokeRect: noop };
}
const ROOT = { bot: 'Root', bot_id: '70f0889b-ecd4-457b-a69c-304cd2aff540', status: 'idle', task: 'office capture', last_action: 'pushed screens', last_action_at: '2026-11-18T04:00:00Z' };
const NOW = Date.parse('2026-11-18T04:30:00Z');
function rootScreen(image) {
  const ctx = fakeCtx(), mode = L.monitorMode(ROOT, '', { image: !!image });
  D.drawDesk(ctx, 640, 400, { bot: ROOT, now: NOW, items: [], allItems: [], mode, image: image || null, usageRows: [] });
  return { mode, ctx };
}
test('Root draws the same screen with or without a camera distance: the mirror when a grab is present', () => {
  const img = { width: 640, height: 400 };
  const a = rootScreen(img), b = rootScreen(img);
  assert.equal(a.mode, 'mirror'); assert.equal(b.mode, 'mirror');
  assert.equal(a.ctx.images.length, 1); assert.equal(b.ctx.images.length, 1);
  const far = rootScreen(null), near = rootScreen(null);
  assert.equal(far.mode, 'terminal'); assert.equal(near.mode, 'terminal');
  assert.equal(far.ctx.images.length, 0);
  assert.ok(far.ctx.texts.includes('Root')); assert.ok(far.ctx.texts.includes('office capture'));
  assert.deepEqual(far.ctx.texts, near.ctx.texts);
});
test('name tags shrink and drop stale / recent chips past TAG_FAR_M; NEEDS TIM chip stays', () => {
  assert.equal(L.tagFar(L.TAG_FAR_M - 0.1), false); assert.equal(L.tagFar(L.TAG_FAR_M + 0.1), true);
  assert.match(css, /\.tag\.far \{ font-size: 10px;/); assert.match(css, /\.tag\.far \.chip\.stale, \.tag\.far \.chip\.recent \{ display: none; \}/);
  assert.doesNotMatch(css, /\.tag\.far \.chip \{/);
});
test('office.js shows a desk mirror at every distance and still marks far name tags', () => {
  assert.match(office, /image = sc\.show === 'image' && d\.img;/);
  assert.doesNotMatch(office, /mirrorAt/);
  assert.match(office, /c\.tag\.classList\.toggle\('far', L\.tagFar\(dist\)\);/);
});
