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

test('floor tags carry no chips: name · working|idle|blocked · title (cs-ffe2ed7d)', () => {
  const tag = src.slice(src.indexOf('function updateLabels'), src.indexOf('const ys = L.nudgeLabels'));
  assert.doesNotMatch(tag, /class="chip/);
  assert.match(tag, /L\.floorTag\(/);
  assert.match(tag, /name · working\|idle\|blocked · title/);
  assert.match(tag, /floor\.state === 'blocked' \? ' alert'/);
  assert.doesNotMatch(src, /flyEl|\bfly\.sk\b/);
  const idle = L.floorTag('GUI', { working: false, state: 'idle', task: 'idle' });
  assert.equal(idle.text, 'GUI · idle');
  const work = L.floorTag('QA', { working: true, state: 'working', task: 'QA proofs: 66 queued' });
  assert.equal(work.sub, 'working · QA proofs: 66 queued');
  assert.equal(work.text, 'QA · ' + work.sub);
  const long = L.floorTag('QA', { working: true, state: 'working', task: 'QA proofs: 66 queued, waiting on natural runs (next gate 12:40 PM ET)' });
  assert.ok(long.sub.startsWith('working · QA proofs:'), long.sub);
  assert.ok(long.sub.endsWith('…') && long.sub.length <= 'working · '.length + 40, long.sub);
  const blocked = L.floorTag('Gauge', { blocked: true, state: 'blocked', task: 'blocked: card-pickup webhook needs Tim to copy URL/key into gauge.env' });
  assert.equal(blocked.state, 'blocked');
  assert.match(blocked.sub, /^blocked · card-pickup webhook/);
  assert.doesNotMatch(blocked.sub, /offline/);
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
