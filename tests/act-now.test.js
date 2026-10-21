'use strict';
// Simplify plan PR 1 (Tim 2026-10-20 19:39-19:43 ET): Act Now list and the decision rule.
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../pipeline-act-now.js');
const day = n => new Date(Date.parse('2026-10-20T12:00:00Z') - n * 864e5);
const row = (id, o) => Object.assign({ id, PRIMARY_ID: id, COMPANY: 'Acme', TITLE: 'Director of Quality', LOCATION: 'Austin, TX', BUCKET: 'READY_TO_PURSUE', payload: {}, compMid: 200000, dateAdded: day(1) }, o || {});
const ctx = (scores, rulings, extra) => Object.assign({ now: Date.parse('2026-10-20T12:00:00Z'), ruling: r => (rulings || {})[r.id] || null, score: r => scores[r.id] == null ? null : scores[r.id], fitMeasured: r => scores[r.id] != null, snoozes: {} }, extra || {});

test('Act Now: scored Director+ US roles; Shield AI pinned first, then score, then newest; Memphis and non-US out', () => {
  const rows = [row('A'), row('B', { TITLE: 'Plant Manager', dateAdded: day(0) }), row('S', { COMPANY: 'Shield AI', TITLE: 'Director, Manufacturing' }), row('M', { LOCATION: 'Memphis, TN' }),
    row('C', { LOCATION: 'Toronto, Ontario' }), row('L', { TITLE: 'Quality Engineer' }), row('U')];
  const m = A.pick(rows, ctx({ A: 70, B: 70, S: 40, M: 95, C: 90, L: 99 }));
  assert.deepEqual(m.items.map(x => x.r.id), ['S', 'B', 'A']);
  assert.equal(m.counts.unscored, 1);
});

test('decision rule: a decided role leaves Act Now at once (pending counts), and stays out once saved', () => {
  const rows = [row('A'), row('B')], sc = { A: 80, B: 70 };
  const pend = { A: { kind: 'APPLIED', ts: '2026-10-20T12:00:00Z', writeStatus: 'SUBMITTING', decisionSnap: A.snapshot(rows[0], 80) } };
  assert.deepEqual(A.pick(rows, ctx(sc, pend)).items.map(x => x.r.id), ['B']);
  assert.equal(A.rule(rows[0], pend.A, 80).hidden, true);
  const saved = { A: Object.assign({}, pend.A, { writeStatus: 'READBACK_PENDING' }) };
  assert.equal(A.rule(rows[0], saved.A, 80).hidden, true); assert.equal(A.pick(rows, ctx(sc, saved)).counts.decided, 1);
  assert.equal(A.rule(row('X', { BUCKET: 'DECLINED_BY_TIM' }), null, 50).hidden, true, 'the master record counts too');
});

test('a decision that did not save comes back with the retry chip, and no second decision can be made from the card', () => {
  const r = row('A'), ru = { kind: 'DECLINE', ts: '2026-10-20T12:00:00Z', writeStatus: 'RESULT_UNKNOWN', error: 'timeout', requestId: 'PX-1', decisionSnap: A.snapshot(r, 80) };
  const m = A.pick([r], ctx({ A: 80 }, { A: ru }));
  assert.equal(m.items[0].rule.back, 'NOT_SAVED');
  const h = A.html(m, { posting: () => 'https://x.example/1' });
  assert.match(h, /data-an-retry="A"/); assert.doesNotMatch(h, /data-an-applied="A"/, 'only the retry, which resends the same request');
  assert.equal(A.alreadyDecided(r, ru), null);
  assert.equal(A.saveState({ writeStatus: 'WRITE_FAILED', error: 'refused' }), 'NOT_SAVED');
});

test('a material change after the decision brings the role back with old and new values; small moves do not', () => {
  const r = row('A'), snap = A.snapshot(r, 70), ru = { kind: 'DECLINE', ts: '2026-10-19T12:00:00Z', writeStatus: 'VERIFIED', decisionSnap: snap };
  assert.equal(A.rule(row('A', { compMid: 200500 }), ru, 75).hidden, true, 'pay within $1k and score +5: still hidden');
  const pay = A.rule(row('A', { compMid: 240000 }), ru, 70);
  assert.equal(pay.back, 'CHANGED'); assert.deepEqual(pay.changes, [{ field: 'Pay', before: '$200k', after: '$240k' }]);
  assert.deepEqual(A.rule(r, ru, 81).changes.map(c => c.field), ['Score']);
  assert.deepEqual(A.rule(row('A', { TITLE: 'Senior Director of Quality' }), ru, 70).changes.map(c => c.field), ['Title']);
  assert.deepEqual(A.rule(row('A', { payload: { REPOSTED_AT: '2026-10-20' } }), ru, 70).changes.map(c => c.field), ['Posting']);
  const h = A.html(A.pick([row('A', { compMid: 240000 })], ctx({ A: 70 }, { A: ru })), { posting: () => '' });
  assert.match(h, /Changed since your decision: Pay \$200k → \$240k/); assert.match(h, /Your decision: Declined, 2026-10-19/);
});

test('Later hides a role for 3 days on this device; it is not a decision', () => {
  const now = Date.parse('2026-10-20T12:00:00Z'), r = row('A');
  assert.equal(A.pick([r], ctx({ A: 80 }, {}, { snoozes: { A: now - 2 * 864e5 } })).items.length, 0);
  assert.equal(A.pick([r], ctx({ A: 80 }, {}, { snoozes: { A: now - 4 * 864e5 } })).items.length, 1);
  assert.equal(A.pick([r], ctx({ A: 80 }, {}, { snoozes: { A: now - 2 * 864e5 } })).counts.decided, 0);
});

test('second decision is blocked with "Already decided: <decision>, <date>"; cards carry 44 px controls and label estimated pay', () => {
  const r = row('A'), ru = { kind: 'APPLIED', ts: '2026-10-20T12:00:00Z', writeStatus: 'VERIFIED' };
  assert.deepEqual(A.alreadyDecided(r, ru), { kind: 'APPLIED', label: 'Applied', date: '2026-10-20' });
  const h = A.html(A.pick([row('E', { payload: { SALARY_BASIS: 'FORGE-ESTIMATE' } })], ctx({ E: 60 })), { posting: () => 'https://x.example/e' });
  assert.match(h, /\$200k est\./); assert.match(h, /Open posting/); assert.match(h, /data-an-applied="E"/); assert.match(h, /data-an-later="E"/);
  assert.match(A.CSS, /min-height:var\(--pe-target-min\)/); assert.doesNotMatch(A.CSS, /#[0-9a-f]{3,6}\b/i, 'tokens only');
});
