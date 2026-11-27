const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('../office/office-logic.js');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'office/office.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'office/office.css'), 'utf8');

test('speech bubbles drop the AMBIENT label', () => {
  assert.equal(js.includes('<span class="amb">ambient</span>'), false);
});

test('bubble CSS wraps to a few lines: wider, no nowrap or ellipsis, white speech style', () => {
  const m = css.match(/\.bubble \{[^}]+\}/);
  assert.ok(m, 'missing .bubble rule');
  const rule = m[0];
  assert.equal(/white-space:\s*nowrap/.test(rule), false);
  assert.equal(/text-overflow:\s*ellipsis/.test(rule), false);
  assert.ok(/white-space:\s*normal/.test(rule));
  assert.match(rule, /max-height:\s*3\.75em; overflow:\s*hidden/);
  assert.ok(/max-width:\s*240px/.test(rule));
  assert.ok(/background:\s*#fff/.test(rule));
});

test('recent speech bubbles drop the RECENT label and do not hard-truncate at 40', () => {
  assert.equal(js.includes('<span class="amb">recent'), false);
  assert.equal(js.includes('truncate(rp.text, 40)'), false);
  assert.ok(js.includes('truncate(rp.text, L.BUBBLE_MAX)'));
});

test('timestamped speech expires after five minutes, independent of refresh', () => {
  const at = '2026-11-27T09:03:00Z', t = Date.parse(at);
  assert.equal(L.bubbleIsFresh(at, t + 299999), true);
  assert.equal(L.bubbleIsFresh(at, t + 300000), false);
  assert.equal(L.bubbleIsFresh(at, Date.parse('2026-11-27T13:08:00Z')), false);
  assert.equal(L.bubbleIsFresh('', t), false);
  assert.match(js, /L\.bubbleIsFresh\(b\.last_action_at, now\)/);
  assert.match(js, /L\.bubbleIsFresh\(convo\.at, now\)/);
});

test('a bubble only fits under a board if its entire height clears the face', () => {
  const boards = [{ x0: 20, y0: 10, x1: 100, y1: 50 }];
  assert.equal(L.bubbleClearsBoards(60, 80, 40, 30, boards), true);
  assert.equal(L.bubbleClearsBoards(60, 80, 40, 31, boards), false);
  assert.equal(L.bubbleClearsBoards(115, 80, 40, 40, boards), false);
  assert.equal(L.bubbleClearsBoards(120, 80, 40, 40, boards), true);
});
