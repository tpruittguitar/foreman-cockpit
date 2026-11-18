// QA on #395 (Nov 17): Root's monitor was black glass from far away (its mirror is an empty dark desktop drawn at any distance),
// and name tags covered screens. draw.js is loaded from a temp copy marked "type": "module". Run: node --test tests/office-root-far-screen.test.js
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
function rootScreen(dist) {
  const img = { width: 640, height: 400 }, image = L.mirrorAt(dist) && img, ctx = fakeCtx();
  const mode = L.monitorMode(ROOT, '', { image: !!image });
  D.drawDesk(ctx, 640, 400, { bot: ROOT, lod: L.lodFor(dist), now: Date.parse('2026-11-18T04:30:00Z'), items: [], allItems: [], mode, image: image || null, usageRows: [] });
  return { mode, ctx };
}
test('Root draws its name, status and task from far away, like the other monitors; the mirror stays up close', () => {
  for (const dist of [6, 12, 20, 31]) {
    const { mode, ctx } = rootScreen(dist);
    assert.equal(mode, 'terminal', 'at ' + dist + ' m');
    assert.equal(ctx.images.length, 0); assert.ok(ctx.texts.includes('Root')); assert.ok(ctx.texts.includes('office capture'));
  }
  const near = rootScreen(2);
  assert.equal(near.mode, 'mirror'); assert.equal(near.ctx.images.length, 1);
});
test('name tags shrink and drop stale / recent chips past TAG_FAR_M; NEEDS TIM chip stays', () => {
  assert.equal(L.tagFar(L.TAG_FAR_M - 0.1), false); assert.equal(L.tagFar(L.TAG_FAR_M + 0.1), true);
  assert.match(css, /\.tag\.far \{ font-size: 10px;/); assert.match(css, /\.tag\.far \.chip\.stale, \.tag\.far \.chip\.recent \{ display: none; \}/);
  assert.doesNotMatch(css, /\.tag\.far \.chip \{/);
});
test('office.js applies the mirror distance and the far tag class', () => {
  assert.match(office, /image = sc\.show === 'image' && L\.mirrorAt\(dist\) && d\.img;/);
  assert.match(office, /c\.tag\.classList\.toggle\('far', L\.tagFar\(dist\)\);/);
});
