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

test('floor tag shows the card chip only while working and never a training chip', () => {
  assert.match(src, /task = !fr && !needs && sc && sc\.busy && sc\.task \? sc\.task : ''/);
  assert.match(src, /<span class="chip job" title="\$\{esc\(task\)\}">/);
  const tag = src.slice(src.indexOf('function updateLabels'), src.indexOf('c.tagBox = null'));
  assert.doesNotMatch(tag, /chip learned/);
});
