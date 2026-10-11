// Number + graphic helpers: graphics carry their own text and never replace the number.
const test = require('node:test'), assert = require('node:assert/strict');
const V = require('../pipeline-miniviz.js');

test('dailyCounts buckets dates into the last N days, oldest first, ignoring unknown and out-of-window dates', () => {
  const now = Date.parse('2026-10-11T18:00:00Z');
  const d = V.dailyCounts([new Date('2026-10-11T01:00:00Z'), '2026-10-10T23:00:00Z', '2026-10-10T01:00:00Z', null, 'junk', '2026-09-01T00:00:00Z'], 3, now);
  assert.deepEqual(d, [0, 2, 1]);
});

test('spark draws a titled SVG; empty and all-zero series stay valid', () => {
  const s = V.spark([0, 2, 5, 1], { title: '8 added' });
  assert.match(s, /^<svg class="mini-spark"/); assert.match(s, /<title>8 added<\/title>/); assert.match(s, /<polyline points="/);
  assert.match(V.spark([], { title: 'none' }), /<title>none<\/title>/);
  assert.doesNotMatch(V.spark([0, 0, 0]), /NaN/);
});

test('share and progress clamp to 0..100% and state the exact fraction in text', () => {
  assert.match(V.share(3, 12), /title="3 of 12 \(25%\)"/); assert.match(V.share(3, 12), /width:25\.0%/);
  assert.match(V.share(5, 0), /width:0\.0%/);
  assert.match(V.progress(15, 10), /width:100\.0%/);
  assert.match(V.progress(1, 4, { title: '1 of 4 resolved' }), /aria-label="1 of 4 resolved"/);
});

test('titles are escaped', () => {
  assert.doesNotMatch(V.spark([1], { title: '<img onerror=1>' }), /<img/);
  assert.doesNotMatch(V.share(1, 2, { title: '"><script>' }), /<script>/);
});
