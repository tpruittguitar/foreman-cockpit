// D-3 (REV-053): the Writer merges "reviewed" records exactly like the browser does (union by id, larger t wins, never removed).
const test = require('node:test'), assert = require('node:assert/strict');
const { mergeState_ } = require('../apps-script/stateMerge.js'), R = require('../pipeline-review.js');

const base = () => ({ seen: { J1: 5 }, rulings: { J1: { ts: 'x' } }, incidents: { v: 1, incidents: {} }, updatedAt: '2026-10-19T10:00:00Z' });

test('Writer: reviewed union by job id, larger t wins, ties keep stored, real beats baseline, malformed dropped, never removed', () => {
  const cur = Object.assign(base(), { reviewed: { J1: { s: 50, t: 10 }, J2: { s: 60, t: 20, p: [1, 2, 3, 4, 5, 6, -1, -1], r: 26 } } });
  const inc = { reviewed: { J1: { s: 55, t: 30, bl: 1 }, J2: { s: 99, t: 20 }, J3: { s: 70, t: 5, b: 10 }, J4: { s: 140, t: 9 }, J5: { s: 40 }, J6: 'x' } };
  const out = mergeState_(cur, inc);
  // J1: the incoming record is a baseline, so the stored real review stays even though it is older
  assert.deepEqual(out.reviewed, { J1: { s: 50, t: 10 }, J2: { s: 60, t: 20, p: [1, 2, 3, 4, 5, 6, -1, -1], r: 26 }, J3: { s: 70, t: 5, b: 10 } });
  // an incoming state without "reviewed" (old tab) removes nothing
  assert.deepEqual(mergeState_(out, { seen: {} }).reviewed, out.reviewed);
  // the rest of the REV-017 rules are untouched
  assert.deepEqual(out.rulings, cur.rulings); assert.equal(out.seen.J1, 5);
});

test('Writer and browser agree on every merge', () => {
  const stored = { a: { s: 10, t: 1 }, b: { s: 20, t: 5 }, c: { s: 30, t: 9, p: [9, 9, 9, 9, 9, 9, 9, 9] } };
  const incoming = { a: { s: 11, t: 2 }, b: { s: 21, t: 5 }, c: { s: 31, t: 8 }, d: { s: 40, t: 3, bl: 1 }, e: { s: -1, t: 3 } };
  assert.deepEqual(mergeState_(Object.assign(base(), { reviewed: stored }), { reviewed: incoming }).reviewed, R.merge(stored, incoming).store);
});

test('Writer: a stored state with no "reviewed" yet merges a first batch', () => {
  assert.deepEqual(mergeState_(base(), { reviewed: { J9: { s: 77, t: 123 } } }).reviewed, { J9: { s: 77, t: 123 } });
});

test('Writer: a real review beats a baseline whatever the times, as in the browser', () => {
  const stored = { J1: { s: 50, t: 900, bl: 1 }, J2: { s: 60, t: 10 } }, incoming = { J1: { s: 40, t: 100 }, J2: { s: 70, t: 999, bl: 1 } };
  const out = mergeState_(Object.assign(base(), { reviewed: stored }), { reviewed: incoming }).reviewed;
  assert.deepEqual(out, { J1: { s: 40, t: 100 }, J2: { s: 60, t: 10 } }); assert.deepEqual(out, R.merge(stored, incoming).store);
});
