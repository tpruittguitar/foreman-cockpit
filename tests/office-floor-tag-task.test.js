/* GUI office review Nov 18 #1: floor tags show the bot's current card (task file line), not training chips. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../office/office-logic.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.js'), 'utf8');

test('screens index carries the task line without the "Task:" prefix', () => {
  const at = '2026-11-18T13:44:20Z';
  const s = L.parseScreensIndex({ screens: { a1: { at, busy: true, activeAt: at, task: 'Task: P3 office floor tags (b16837c)' }, b2: { at, busy: false } } }).screens;
  assert.equal(s.a1.task, 'P3 office floor tags (b16837c)');
  assert.equal(s.b2.task, '');
});

test('floor tags carry no chips: name plus neutral card title or a plain word (card 653d851)', () => {
  const tag = src.slice(src.indexOf('function updateLabels'), src.indexOf('const ys = L.nudgeLabels'));
  assert.doesNotMatch(tag, /class="chip/);
  assert.match(tag, /needs \? 'NEEDS TIM' : task \?/);
  assert.match(tag, /<span class="tsub\$\{needs \? ' alert' : ''\}">/);
  assert.doesNotMatch(src, /flyEl|\bfly\.sk\b/);
});

test('labelOverlaps hides any tag still overlapping after the nudge; the first listed wins', () => {
  const box = (x, y) => ({ x, y, w: 70, h: 24 });
  assert.deepEqual(L.labelOverlaps([box(100, 200), box(300, 200)], [200, 200]), [false, false]);
  assert.deepEqual(L.labelOverlaps([box(100, 200), box(110, 200), box(120, 200)], [200, 200, 173]), [false, true, false]);
  assert.match(src, /shown\.sort\(\(a, b\) => b\.needs - a\.needs\);\n    const ys = L\.nudgeLabels\(shown\);/);
});

test('training whiteboard is dark and the constraint waiting figure fits its gutter', () => {
  const draw = fs.readFileSync(path.join(__dirname, '..', 'office', 'draw.js'), 'utf8');
  assert.match(draw, /ctx\.fillStyle = '#16191e'; ctx\.fillRect\(0, 0, W, H\);   \/\* GUI office review Nov 18 #3/);
  assert.match(draw, /if \(sk && sk\.counter\) \{/);
  assert.match(draw, /const cw = 176 \* s, qw = 94 \* s/);
  assert.match(draw, /shrink\(ctx, qt, 800, 34 \* s, qw - 16 \* s\)/);
});
