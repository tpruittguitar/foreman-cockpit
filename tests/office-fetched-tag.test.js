// Fetched-at tags (QA on #390): fixed size on every board width, and the Automations tag sits in the header row.
// draw.js is an ES module, so it is loaded from a temp copy marked "type": "module". Run: node --test tests/office-fetched-tag.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
const L = require('../office/office-logic.js');
let D;
test.before(async () => {
  globalThis.window = { OfficeLogic: L };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-draw-'));
  for (const f of ['draw.js', 'avatars.js']) fs.copyFileSync(path.join(__dirname, '../office', f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  D = await import(pathToFileURL(path.join(dir, 'draw.js')).href);
});
function fakeCtx() {
  const texts = [], rects = [];
  const ctx = { font: '', fillStyle: '', textAlign: 'left', texts, rects,
    measureText(t) { const px = Number((/(\d+(?:\.\d+)?)px/.exec(this.font) || [0, 10])[1]); return { width: String(t).length * px * 0.55 }; },
    fillText(t, x, y) { texts.push({ t, x, y, font: this.font }); }, fillRect(x, y, w, h) { rects.push({ x, y, w, h }); } };
  return ctx;
}
const AT = Date.parse('2026-11-18T03:39:43Z');
test('fetched tag font does not depend on the canvas width', () => {
  const fonts = [640, 1024, 2048].map(W => { const c = fakeCtx(); D.drawFetched(c, W, W / 2, AT); return c.texts.find(x => x.t.startsWith('fetched ')).font; });
  assert.equal(new Set(fonts).size, 1, fonts.join(' | '));
  assert.match(fonts[0], new RegExp(' ' + D.FETCHED_PX + 'px '));
});
test('Automations fetched tag sits in the header row beside the title, above the day labels', () => {
  for (const W of [640, 1024]) {
    const s = W / 1024, H = W * 0.61, c = fakeCtx();
    D.drawAutomations(c, W, H, { auto: null, err: '', now: AT, demo: false, fetchedAt: AT });
    const title = c.texts.find(x => x.t === 'AUTOMATIONS'), tag = c.texts.find(x => x.t.startsWith('fetched '));
    assert.ok(tag, 'tag drawn'); assert.equal(tag.y, title.y, 'same baseline as the title');
    assert.ok(tag.x > title.x + 'AUTOMATIONS'.length * 40 * s * 0.55, 'starts after the title');
    assert.ok(tag.y < 70 * s, 'inside the header band, above the day lines at 70 px (scaled)');
    assert.ok(tag.y < H - 46 * s, 'clear of the runs/hour row');
  }
});
