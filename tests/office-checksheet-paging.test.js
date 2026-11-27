// Checksheet board per-column paging (item 18): L.columnPage in office/office-logic.js.
// Run: node --test tests/office-checksheet-paging.test.js. Items are EXAMPLE data only.
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const ex = (n, tag) => Array.from({ length: n }, (_, i) => ({ id: (tag || 'ex') + '-' + i, title: 'EXAMPLE ' + i }));
const ids = r => r.items.map(i => i.id);

test('single-page column keeps the same items after one and several ticks', () => {
  const needsTim = ex(2, 'nt');
  const first = L.columnPage(needsTim, 5, 0);
  assert.deepEqual([first.page, first.pages], [0, 1]);
  assert.deepEqual(ids(first), ['nt-0', 'nt-1']);
  for (const tick of [1, 2, 3, 7, 12, 999]) {
    const r = L.columnPage(needsTim, 5, tick);
    assert.deepEqual(ids(r), ['nt-0', 'nt-1'], 'tick ' + tick);
    assert.deepEqual([r.page, r.pages], [0, 1]);
  }
  // exactly full still one page
  assert.deepEqual(ids(L.columnPage(ex(5), 5, 3)), ids(L.columnPage(ex(5), 5, 0)));
});

test('3-page column cycles through all pages and wraps', () => {
  const col = ex(7, 'q'); // 3 + 3 + 1
  const seen = [0, 1, 2, 3, 4].map(t => L.columnPage(col, 3, t));
  assert.deepEqual(seen.map(r => r.pages), [3, 3, 3, 3, 3]);
  assert.deepEqual(seen.map(r => r.page), [0, 1, 2, 0, 1]);
  assert.deepEqual(ids(seen[0]), ['q-0', 'q-1', 'q-2']);
  assert.deepEqual(ids(seen[1]), ['q-3', 'q-4', 'q-5']);
  assert.deepEqual(ids(seen[2]), ['q-6']);
  assert.deepEqual(ids(seen[3]), ids(seen[0]), 'wraps back to page 1');
  const all = seen.slice(0, 3).flatMap(ids);
  assert.deepEqual(all, ids({ items: col }), 'every item shown exactly once per cycle');
  assert.equal(L.columnPage(col, 3, 4.9).page, 1, 'fractional tick is floored');
});

test('columns with different lengths page independently on the same tick', () => {
  const cols = { needs_tim: ex(2, 'nt'), review: ex(4, 'rv'), p1: ex(9, 'p1') }, per = 3;
  for (let tick = 0; tick < 7; tick++) {
    const nt = L.columnPage(cols.needs_tim, per, tick), rv = L.columnPage(cols.review, per, tick), p1 = L.columnPage(cols.p1, per, tick);
    assert.deepEqual(ids(nt), ['nt-0', 'nt-1'], 'short column never blanks (tick ' + tick + ')');
    assert.equal(rv.page, tick % 2); assert.equal(rv.pages, 2);
    assert.equal(p1.page, tick % 3); assert.equal(p1.pages, 3);
    assert.ok(rv.items.length > 0 && p1.items.length > 0);
  }
  assert.deepEqual(ids(L.columnPage(cols.review, per, 1)), ['rv-3']);
  assert.deepEqual(ids(L.columnPage(cols.p1, per, 1)), ['p1-3', 'p1-4', 'p1-5']);
});

test('empty column stays empty without errors', () => {
  for (const items of [[], null, undefined]) {
    for (const tick of [0, 1, 5]) assert.deepEqual(L.columnPage(items, 4, tick), { items: [], page: 0, pages: 1 });
  }
  assert.deepEqual(L.columnPage(ex(2), 0, 1).pages, 2, 'perPage < 1 is treated as 1');
  assert.deepEqual(L.columnPage(ex(2), 3, undefined).page, 0);
});

test('wall Detail layout shows exactly 6 card rows per column and pages the rest', () => {
  const draw = require('fs').readFileSync(require('path').join(__dirname, '../office/draw.js'), 'utf8');
  assert.match(draw, /cardH = 92 \* s, fit = 6;/, 'drawBoard always shows 6 rows (Tim 6:16 PM; #475 showed 5)');
  assert.match(draw, /gap = Math\.max\(2 \* s, \(H - top - headH - 44 \* s\) \/ fit - cardH\)/, 'the gap shrinks so 6 rows fit');
  for (const [W, H] of [[2048, 832], [1280, 520]]) { // desktop and LOW (phone) board canvases
    const s = W / 2048, avail = H - (86 + 46 + 18) * s - 48 * s - 44 * s, gap = avail / 6 - 92 * s;
    assert.ok(gap >= 2 * s, W + 'x' + H + ': 6 rows of 92 px cards fit with a gap of at least 2 px');
  }
  assert.match(draw, /L\.columnPage\(c\.cards,\s*fit,\s*o\.page/, 'drawBoard pages via L.columnPage');
  assert.match(draw, /'p '\s*\+\s*\(pg\.page\s*\+\s*1\)\s*\+\s*'\/'\s*\+\s*pg\.pages/, 'p N/M page label');
  const board = draw.slice(draw.indexOf('export function drawBoard('), draw.indexOf('export function drawUsage('));
  assert.doesNotMatch(board, /columnWindow|o\.scroll|SHARE\s*=/, 'checksheet keeps paged columns; Agent Chat scrolls independently');
  const col = ex(20, 'ip');
  assert.equal(L.columnPage(col, 6, 0).items.length, 6);
  assert.equal(L.columnPage(col, 6, 0).pages, 4);
  assert.deepEqual(ids(L.columnPage(col, 6, 1)), ['ip-6', 'ip-7', 'ip-8', 'ip-9', 'ip-10', 'ip-11']);
  assert.equal(L.columnPage(col, 9, 0).items.length, 9, 'without the 6-row cap a tall board would show 9');
});

test('checksheet faces omit redundant cost metadata but retain ordinary notes', () => {
  const item = { note: 'Cost: ~0 pts (est.), pool Shared. Owner: Cursor' };
  assert.equal(L.cardFaceNote(item), '');
  assert.match(item.note, /Owner: Cursor/, 'the detail view still has the original note');
  assert.equal(L.cardFaceNote({ note: 'Waiting for review' }), 'Waiting for review');
  const fs = require('fs'), path = require('path');
  const draw = fs.readFileSync(path.join(__dirname, '../office/draw.js'), 'utf8');
  assert.match(draw, /note = L\.cardFaceNote\(it\)/);
  assert.match(draw, /if \(titleLines.length > 1\) ctx.fillText/);
  const html = fs.readFileSync(path.join(__dirname, '../office.html'), 'utf8');
  assert.match(html, /id="needs-btn"[^>]*>⚠ Needs Tim <b id="needs-n" hidden>0<\/b>/);
});
