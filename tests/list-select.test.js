const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../pipeline-list-select.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');

const ids = ['a', 'b', 'c', 'd', 'e'];

test('ctrl toggles one row and leaves the rest', () => {
  let st = S.apply({ checked: {}, anchor: null }, ids, 'b', { toggle: true });
  assert.deepEqual(Object.keys(st.checked), ['b']);
  assert.equal(st.anchor, 'b');
  st = S.apply(st, ids, 'd', { toggle: true });
  assert.deepEqual(Object.keys(st.checked).sort(), ['b', 'd']);
  st = S.apply(st, ids, 'b', { toggle: true });
  assert.deepEqual(Object.keys(st.checked), ['d']);
  assert.equal(st.anchor, 'b');
});

test('shift selects the visible range from the anchor and replaces the previous selection', () => {
  const st = S.apply({ checked: { a: true, e: true }, anchor: 'b' }, ids, 'd', { shift: true });
  assert.deepEqual(Object.keys(st.checked), ['b', 'c', 'd']);
  assert.equal(st.anchor, 'b');
});

test('shift plus ctrl adds the range', () => {
  const st = S.apply({ checked: { a: true }, anchor: 'c' }, ids, 'e', { shift: true, toggle: true });
  assert.deepEqual(Object.keys(st.checked).sort(), ['a', 'c', 'd', 'e']);
});

test('a checkbox click keeps the other rows and follows the box', () => {
  const on = S.apply({ checked: { a: true }, anchor: 'a' }, ids, 'c', { toggle: true, box: true });
  assert.deepEqual(Object.keys(on.checked).sort(), ['a', 'c']);
  const off = S.apply(on, ids, 'a', { toggle: true, box: false });
  assert.deepEqual(Object.keys(off.checked), ['c']);
});

test('the job list wires ctrl, shift, and one decision menu, with no row checkbox', () => {
  assert.match(html, /<script src="pipeline-list-select\.js"><\/script>/);
  assert.match(html, /PipelineListSelect\.apply/);
  assert.match(html, /decOpt_\('DECLINE','Decline'\)/);
  assert.match(html, /decOpt_\('APPLIED','Applied'\)/);
  assert.match(html, /decOpt_\('MANUAL_RESEARCH','Request research'\)/);
  assert.match(html, /id="bulk-selection"/);
  assert.match(html, /In this selection/);
  assert.match(html, /Send decision/);
  assert.equal(html.includes('Apply to '), false);
  assert.match(html, /kind:spec\.kind,value:spec\.value\|\|''/);
  assert.equal(html.includes('class="row-select"'), false);
});
