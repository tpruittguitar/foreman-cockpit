// Readable boards (GUI review 2026-11-18, findings 2 / 4 / 6 / 7): pure helpers in office/office-logic.js.
// Run: node --test tests/office-readability.test.js. EXAMPLE data only.
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const measure = (t, size) => String(t).length * 0.6 * size; // monospace-ish stand-in for canvas measureText

test('layout: Far past 8 m, Detail at 8 m or closer, phones always Far', () => {
  assert.equal(L.boardLayout(19, false), 'far');
  assert.equal(L.boardLayout(8.01, false), 'far');
  assert.equal(L.boardLayout(8, false), 'detail');
  assert.equal(L.boardLayout(6.7, false), 'detail');
  assert.equal(L.boardLayout(3, false), 'detail');
  assert.equal(L.boardLayout(3, true), 'far', 'phone 3D shows only the Far layout');
  assert.equal(L.boardLayout(NaN, false), 'far', 'unknown distance reads as far');
});

test('crossfade steps over BOARD_FADE_S; reduced motion jumps', () => {
  const half = L.BOARD_FADE_S / 2;
  assert.equal(+L.fadeStep(0, 1, half, false).toFixed(6), 0.5);
  assert.equal(L.fadeStep(0.9, 1, half, false), 1, 'clamped at the target');
  assert.equal(+L.fadeStep(1, 0, half, false).toFixed(6), 0.5);
  assert.equal(L.fadeStep(0, 1, 0.001, true), 1, 'prefers-reduced-motion: no animation');
  assert.equal(L.fadeStep(1, 0, 0.016, true), 0);
});

test('board distance is to the nearest point of the face', () => {
  assert.equal(L.boardDistance(0, 0, 6.7, 9.6, 3.9), 6.7);
  assert.equal(L.boardDistance(4, 1, 3, 9.6, 3.9), 3, 'in front of the face: straight-line distance to the plane');
  assert.equal(+L.boardDistance(7.8, 0, 4, 9.6, 3.9).toFixed(3), 5, 'beside the face: to the edge');
});

test('line of sight: faces a board within 30 degrees and 8 m', () => {
  const fwd = { x: 0, y: 0, z: -1 };
  assert.equal(L.facesBoard(fwd, { x: 0, y: 0.8, z: -6.7 }, 6.7), true);
  assert.equal(L.facesBoard(fwd, { x: 6, y: 0, z: -6 }, 6), false, '45 degrees off');
  assert.equal(L.facesBoard(fwd, { x: 0, y: 0, z: -19 }, 19), false, 'too far: Far layout, nothing to clear');
  assert.equal(L.facesBoard(fwd, { x: 0, y: 0, z: 6 }, 6), false, 'behind');
});

test('Far entries: every state is a word, not colour alone', () => {
  const cols = [{ id: 'needs_tim', total: 2 }, { id: 'in_progress', total: 27 }, { id: 'queued', total: 9 }, { id: 'done', total: 5 }];
  assert.deepEqual(L.checksheetFar(cols).map(e => e.label + ' ' + e.value), ['Needs Tim 2', 'In progress 27', 'Queued 9']);
  assert.equal(L.checksheetFar(cols)[0].outline, true, 'Needs Tim has the red outline plus the words');
  assert.deepEqual(L.usageFar([{ name: 'ChatGPT', pct_used: 92 }, { name: 'Claude', pct_used: 9, stale: true }]).map(e => [e.label, e.value, e.word].join(' ')), ['ChatGPT 92% HIGH', 'Claude 9% STALE']);
  assert.equal(L.constraintFar({ sum: null, age: { stale: true } })[0].value, 'STALE');
  assert.equal(L.constraintFar({ sum: { stages: [{ name: 'Enrichment', constraint: true }, { name: 'Intake' }] }, age: { stale: false } })[0].value, 'Enrichment');
  const now = Date.parse('2026-11-18T05:00:00Z');
  const auto = L.parseAutomations({ automations: [{ ai: 'ChatGPT', name: 'EXAMPLE a', result: 'FAIL', last_run_at: '2026-11-18T02:07:00Z', next_run_at: '2026-11-18T05:13:00Z' },
    { ai: 'Grok', name: 'EXAMPLE b', result: 'FAIL' }, { ai: 'Grok', name: 'EXAMPLE c', result: 'FAIL' }] }, now);
  assert.deepEqual(L.automationsFar(auto).map(e => e.valueFirst ? e.value + ' ' + e.label : e.label + ' ' + e.value), ['1 failing', '2 never ran', 'last run 9:07 PM']);
  assert.equal(L.writerFar({ generated_at: '2026-11-18T05:00:00Z', writer: { last_write_age_min: { value: 10, status: 'green', source: 'EXAMPLE' } } }, now)[0].value, 'OK');
  assert.equal(L.writerFar({ generated_at: '2026-11-18T05:00:00Z', writer: { last_write_age_min: { value: 108, status: 'amber', source: 'EXAMPLE' } } }, now)[0].value, 'STALE');
  assert.equal(L.writerFar(null, now)[0].value, 'STALE');
});

test('farLayout fits everything inside the face, labels within the size ratio', () => {
  const cols = [{ id: 'needs_tim', total: 2 }, { id: 'in_progress', total: 27 }, { id: 'queued', total: 9 }];
  for (const [W, H, opts] of [[1024, 416, L.FAR_DESKTOP], [1280, 520, L.FAR_PHONE], [512, 302, L.FAR_DESKTOP], [384, 251, L.FAR_PHONE]]) {
    const lay = L.farLayout(L.checksheetFar(cols), W, H, measure, opts);
    assert.ok(lay.valueSize > 0);
    assert.ok(lay.labelSize >= opts.kMin * lay.valueSize - 1 && lay.labelSize <= opts.kMax * lay.valueSize + 1, 'label ratio');
    for (const r of lay.runs) {
      assert.ok(r.x >= 0 && r.x + measure(r.text, r.size) <= W + 1, `${r.text} fits across (${W}x${H})`);
      assert.ok(r.y - r.size * 0.76 >= -1 && r.y <= H + 1, `${r.text} fits down (${W}x${H})`);
    }
    assert.deepEqual(lay.runs.filter(r => r.role === 'count').map(r => r.text), ['2', '27', '9']);
    assert.equal(lay.boxes.length, 1, 'one outline (Needs Tim)');
  }
  // the checksheet goes label-over-count in columns, kept in the top half of the face (above the desks and bots from the door)
  const cs = L.farLayout(L.checksheetFar(cols), 1024, 416, measure);
  assert.equal(cs.arrangement, 'cols');
  assert.ok(Math.max(...cs.runs.map(r => r.y)) < 416 * 0.6, 'counts sit in the top of the board');
  assert.ok(cs.runs.filter(r => r.role === 'label').every((r, i, a) => i === 0 || r.x >= a[i - 1].x + measure(a[i - 1].text, a[i - 1].size)), 'labels never touch');
  const one = L.farLayout([{ label: 'Writer', value: 'OK', tone: 'working' }], 384, 251, measure);
  assert.equal(one.runs.find(r => r.text === 'OK').role, 'value', 'a word is a value, not a count');
  assert.ok(one.valueSize > 100);
  // words after the value (ChatGPT 92% HIGH) are measured too
  const u = L.farLayout(L.usageFar([{ name: 'ChatGPT', pct_used: 92 }, { name: 'Claude', pct_used: 9 }, { name: 'Grok', pct_used: 8 }]), 512, 302, measure);
  for (const r of u.runs) assert.ok(r.x + measure(r.text, r.size) <= 512 + 1, r.text);
  assert.deepEqual(u.runs.filter(r => r.role === 'word').map(r => r.text), ['HIGH', 'OK', 'OK']);
});

test('farLayout lines: one line per AI, label | count | word, counts aligned, inside the face', () => {
  const rows = L.usageFar([{ name: 'Claude', pct_used: 9 }, { name: 'ChatGPT', pct_used: 92 }, { name: 'Grok', pct_used: 8 }]);
  for (const [W, H] of [[512, 269], [768, 403], [1024, 538]]) {
    const lay = L.farLayout(rows, W, H, measure, { lines: true });
    assert.equal(lay.arrangement, 'lines');
    assert.ok(lay.labelSize >= 0.5625 * lay.valueSize - 1, 'labels >= 18/32 of the count size');
    const lines = [0, 1, 2].map(i => lay.runs.filter(r => r.entry === i));
    assert.deepEqual(lines.map(l => l.map(r => r.text).join(' ')), ['Claude 9% OK', 'ChatGPT 92% HIGH', 'Grok 8% OK']);
    for (const l of lines) assert.equal(new Set(l.map(r => r.y)).size, 1, 'one line (one baseline) per AI');
    const ends = lines.map(l => { const c = l.find(r => r.role === 'count'); return c.x + c.maxW; });
    assert.ok(Math.max(...ends) - Math.min(...ends) < 1, 'counts right-aligned');
    assert.ok(lay.scaleX >= 0.8 && lay.scaleX <= 1, 'condensed no further than 80 %');
    for (const r of lay.runs) {
      assert.ok(r.x >= 0 && r.x + measure(r.text, r.size) * r.scaleX <= W + 1, `${r.text} fits across (${W}x${H})`);
      assert.ok(Math.abs(r.maxW - measure(r.text, r.size) * r.scaleX) < 1, 'drawn at its condensed width');
      assert.ok(r.y - r.size * 0.76 >= -1 && r.y + r.size * 0.2 <= H + 1, `${r.text} fits down (${W}x${H})`);
    }
    assert.ok(lines[1][0].y - lines[0][0].y >= lay.valueSize * 0.94, 'lines do not touch (cap + descender < pitch)');
  }
  assert.deepEqual(L.farLayout(L.usageFar([]), 512, 269, measure, { lines: true }).runs.map(r => r.text), ['AI usage', 'NO DATA']);
});

test('checksheet Detail: auto-paging via columnPage, at most 6 rows per column', () => {
  assert.equal(typeof L.columnPage, 'function');
  assert.equal(L.columnWindow, undefined, 'scroll window helper removed with the #426 Detail layout');
  assert.equal(L.scrollColumn, undefined);
  assert.equal(L.nextColumnPage, undefined);
  const cards = Array.from({ length: 27 }, (_, i) => ({ id: 'ip-' + i }));
  const ids = r => r.items.map(i => i.id);
  const p0 = L.columnPage(cards, 6, 0), p1 = L.columnPage(cards, 6, 1), p4 = L.columnPage(cards, 6, 4);
  assert.deepEqual([p0.items.length, p0.pages, p0.page], [6, 5, 0]);
  assert.deepEqual(ids(p1), ['ip-6', 'ip-7', 'ip-8', 'ip-9', 'ip-10', 'ip-11']);
  assert.deepEqual(ids(p4), ['ip-24', 'ip-25', 'ip-26']);
  assert.deepEqual(ids(L.columnPage(cards, 6, 5)), ids(p0), 'tick wraps');
  for (let t = 0; t < 5; t++) assert.ok(L.columnPage(cards, 6, t).items.length <= 6);
});

test('phone labels: on collision the lower-priority label hides', () => {
  const b = (x, y, prio) => ({ x, y, w: 60, h: 18, prio });
  assert.deepEqual(L.labelVisibility([b(100, 100, 0), b(110, 105, 3)]), [false, true], 'needs-Tim label wins');
  assert.deepEqual(L.labelVisibility([b(100, 100, 1), b(110, 105, 1)]), [true, false], 'tie: the earlier one stays');
  assert.deepEqual(L.labelVisibility([b(100, 100, 0), b(300, 100, 0)]), [true, true], 'apart: both shown');
  assert.deepEqual(L.labelVisibility([b(100, 100, 2), b(150, 100, 1), b(200, 100, 0)]), [true, false, true], 'a hidden label does not block a third');
  assert.ok(L.labelPrio(true, 'idle') > L.labelPrio(false, 'waiting_tim') && L.labelPrio(false, 'waiting_tim') > L.labelPrio(false, 'working') && L.labelPrio(false, 'working') > L.labelPrio(false, 'idle'));
});

test('phone HUD: hidden while moving, back after 2 s still', () => {
  assert.equal(L.hudHidden(null, 1000), false);
  assert.equal(L.hudHidden(1000, 1000), true);
  assert.equal(L.hudHidden(1000, 2999), true);
  assert.equal(L.hudHidden(1000, 3000), false);
});

test('contrast: WCAG ratio and the size threshold', () => {
  assert.equal(+L.contrastRatio('#ffffff', '#000000').toFixed(2), 21);
  assert.equal(+L.contrastRatio('#777', '#777').toFixed(2), 1);
  assert.equal(L.contrastRatio('rgb(255,255,255)', '#000'), L.contrastRatio('#fff', 'rgba(0,0,0,1)'));
  assert.equal(L.contrastRatio('red', '#000'), null, 'named colours are not parsed');
  assert.equal(L.minContrast(13), 4.5); assert.equal(L.minContrast(24), 3);
  assert.ok(L.contrastRatio('#ffffff', '#ff4b4b') < 4.5, 'white on the alert red fails small text (was the FAIL badge)');
  assert.ok(L.contrastRatio('#0f1114', '#ff4b4b') >= 4.5, 'dark text on the alert red passes');
  // the board palette used by the Far and Detail layouts
  for (const [fg, bg] of [['#f6f7f9', '#0f1114'], ['#d4d7dc', '#0f1114'], ['#ff6b6b', '#0f1114'], ['#3ddc84', '#0f1114'], ['#6cb6ff', '#0f1114'], ['#ffd23f', '#0f1114'],
    ['#c9ccd2', '#0f1114'], ['#ffffff', '#2a1013'], ['#d9b3b6', '#2a1013'], ['#e3c4c6', '#2a1013'], ['#ff8a8a', '#2a1013'], ['#eef0f3', '#15181c'], ['#c3c7cd', '#0f1114'], ['#9aa0a8', '#0f1114'], ['#ffffff', '#b3161c']])
    assert.ok(L.contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg}: ${L.contrastRatio(fg, bg).toFixed(2)}`);
});
