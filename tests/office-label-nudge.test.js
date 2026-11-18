// Card 544b368: office name labels never overlap ('UsageQA' and Claude/Cursor touching from the door view). A label whose
// screen box overlaps an earlier label's box moves up one label height, repeated until clear, with a small cap.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.js'), 'utf8');
const box = (x, y, w = 70, h = 24) => ({ x, y, w, h });
const overlap = (a, ay, b, by, pad = 0) => Math.abs(a.x - b.x) * 2 < a.w + b.w + 2 * pad && ay - a.h < by + pad && by - b.h < ay + pad;

test('overlapping labels: the later one moves up one label height', () => {
  const ys = L.nudgeLabels([box(100, 200), box(140, 200)]);
  assert.deepEqual(ys, [200, 200 - 24 - L.LABEL_PAD_PX]);
});
test('touching labels (Claude / Cursor) get a small gap too; far-apart labels stay put', () => {
  assert.deepEqual(L.nudgeLabels([box(100, 200), box(171, 200)]), [200, 200 - 24 - L.LABEL_PAD_PX], 'one px apart counts as touching');
  assert.deepEqual(L.nudgeLabels([box(100, 200), box(300, 200), box(100, 120)]), [200, 200, 120]);
});
test('repeats until clear: a third label stacks above two', () => {
  const b = [box(100, 200), box(110, 200), box(120, 200)], ys = L.nudgeLabels(b);
  assert.deepEqual(ys, [200, 200 - 27, 200 - 54]);
  for (let i = 0; i < b.length; i++) for (let j = 0; j < i; j++) assert.ok(!overlap(b[i], ys[i], b[j], ys[j], 1), i + ' vs ' + j);
});
test('the nudge is capped', () => {
  const b = Array.from({ length: 10 }, () => box(100, 200)), ys = L.nudgeLabels(b);
  assert.equal(Math.min(...ys), 200 - L.LABEL_NUDGE_CAP * (24 + L.LABEL_PAD_PX));
});
test('updateLabels places every shown name tag through nudgeLabels', () => {
  assert.match(office, /const ys = L\.nudgeLabels\(shown\);/);
  assert.match(office, /t\.c\.tag\.style\.transform = `translate\(-50%,-100%\) translate\(\$\{t\.x\}px,\$\{ys\[i\]\}px\)`/);
  assert.doesNotMatch(office, /if \(vis\) c\.tag\.style\.transform/);
});
