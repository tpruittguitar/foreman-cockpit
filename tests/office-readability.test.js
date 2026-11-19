// Readable boards (GUI review 2026-11-18, findings 2 / 6 / 7): pure helpers in office/office-logic.js.
// Run: node --test tests/office-readability.test.js. EXAMPLE data only.
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');

test('board distance is to the nearest point of the face', () => {
  assert.equal(L.boardDistance(0, 0, 6.7, 9.6, 3.9), 6.7);
  assert.equal(L.boardDistance(4, 1, 3, 9.6, 3.9), 3, 'in front of the face: straight-line distance to the plane');
  assert.equal(+L.boardDistance(7.8, 0, 4, 9.6, 3.9).toFixed(3), 5, 'beside the face: to the edge');
});

test('line of sight: faces a board within 30 degrees and 8 m', () => {
  const fwd = { x: 0, y: 0, z: -1 };
  assert.equal(L.facesBoard(fwd, { x: 0, y: 0.8, z: -6.7 }, 6.7), true);
  assert.equal(L.facesBoard(fwd, { x: 6, y: 0, z: -6 }, 6), false, '45 degrees off');
  assert.equal(L.facesBoard(fwd, { x: 0, y: 0, z: -19 }, 19), false, 'too far: nothing to clear');
  assert.equal(L.facesBoard(fwd, { x: 0, y: 0, z: 6 }, 6), false, 'behind');
});

test('Far overlay helpers are gone (Detail face only)', () => {
  for (const k of ['boardLayout', 'fadeStep', 'checksheetFar', 'usageFar', 'constraintFar', 'automationsFar', 'writerFar', 'farLayout', 'BOARD_FADE_S', 'FAR_DESKTOP', 'FAR_PHONE'])
    assert.equal(L[k], undefined, k);
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
  // the board palette used by the Detail layout
  for (const [fg, bg] of [['#f6f7f9', '#0f1114'], ['#d4d7dc', '#0f1114'], ['#ff6b6b', '#0f1114'], ['#3ddc84', '#0f1114'], ['#6cb6ff', '#0f1114'], ['#ffd23f', '#0f1114'],
    ['#c9ccd2', '#0f1114'], ['#ffffff', '#2a1013'], ['#d9b3b6', '#2a1013'], ['#e3c4c6', '#2a1013'], ['#ff8a8a', '#2a1013'], ['#eef0f3', '#15181c'], ['#c3c7cd', '#0f1114'], ['#9aa0a8', '#0f1114'], ['#ffffff', '#b3161c']])
    assert.ok(L.contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg}: ${L.contrastRatio(fg, bg).toFixed(2)}`);
});
