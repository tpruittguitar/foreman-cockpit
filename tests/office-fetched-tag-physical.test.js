// QA on #394 (Nov 17): a fixed 18 px fetched tag came out 6.1-8.4 cm tall across boards. px = 0.07 * canvasWidth / boardWidthMetres
// keeps it the same physical size on every board. Run: node --test tests/office-fetched-tag-physical.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
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
  return { font: '', fillStyle: '', textAlign: 'left', texts, rects,
    measureText(t) { const px = Number((/(\d+(?:\.\d+)?)px/.exec(this.font) || [0, 10])[1]); return { width: String(t).length * px * 0.55 }; },
    fillText(t, x, y) { texts.push({ t, x, y, font: this.font }); }, fillRect(x, y, w, h) { rects.push({ x, y, w, h }); } };
}
const BW = Number(/const BW = ([\d.]+)/.exec(office)[1]);
const BOARDS = [...office.matchAll(/makeBoard\('(\w+)', (BW|[\d.]+), (?:BH|[\d.]+), .*?LOW \? (\d+) : (\d+), LOW \? \d+ : (\d+)\)/g)]
  .map(m => ({ id: m[1], m: m[2] === 'BW' ? BW : Number(m[2]), low: Number(m[3]), hi: Number(m[4]), h: Number(m[5]) }));
const AT = Date.parse('2026-11-18T03:39:43Z');
const pxOf = c => Number(/(\d+(?:\.\d+)?)px/.exec(c.texts.find(x => x.t.startsWith('fetched ')).font)[1]);

test('fetched tag text is 7 cm tall on every board, at both canvas resolutions', () => {
  assert.deepEqual(BOARDS.map(b => b.id).sort(), ['autos', 'constraint', 'project', 'schedule', 'usage', 'whiteboard', 'writer']);
  const cm = [];
  for (const b of BOARDS) for (const W of [b.low, b.hi]) {
    const c = fakeCtx();
    if (b.id === 'autos') D.drawAutomations(c, W, Math.round(W * b.h / b.hi), { auto: null, err: '', now: AT, demo: false, fetchedAt: AT, boardM: b.m });
    else if (b.id === 'schedule') D.drawTrainingSchedule(c, W, Math.round(W * b.h / b.hi), { rows: [], fetchedAt: AT, boardM: b.m });
    else D.drawFetched(c, W, Math.round(W * b.h / b.hi), AT, null, null, b.m);
    cm.push(+(pxOf(c) * b.m / W * 100).toFixed(6));
  }
  assert.equal(new Set(cm).size, 1, cm.join(' '));
  assert.equal(cm[0], 7);
});
test('box and padding scale with the font; no board width falls back to FETCHED_PX', () => {
  const a = fakeCtx(), b = fakeCtx();
  D.drawFetched(a, 1024, 600, AT, null, null, 2.6); D.drawFetched(b, 1024, 600, AT, null, null, 5.2);
  assert.ok(Math.abs(a.rects[0].h / b.rects[0].h - 2) < 1e-9);
  const n = fakeCtx(); D.drawFetched(n, 1024, 600, AT); assert.equal(pxOf(n), D.FETCHED_PX);
});
test('office.js passes each board width to its fetched tag', () => {
  for (const id of ['project', 'usage', 'writer', 'constraint']) assert.match(office, new RegExp('drawFetched\\(\\w+\\.ctx, \\w+\\.c\\.width, \\w+\\.c\\.height, [^;]*, null, null, ' + id + '\\.w\\)'));
  assert.match(office, /fetchedAt: S\.fetched\.automations, boardM: autos\.w \}/);
  assert.match(office, /fetchedAt: S\.fetched\.training, boardM: schedule\.w \}/);
});
