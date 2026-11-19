'use strict';
// Decision rule kept for the job list and the drawer after the Act Now tab was removed.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const A = require('../pipeline-act-now.js');
const day = n => new Date(Date.parse('2026-10-20T12:00:00Z') - n * 864e5);
const row = (id, o) => Object.assign({ id, PRIMARY_ID: id, COMPANY: 'Acme', TITLE: 'Director of Quality', LOCATION: 'Austin, TX', BUCKET: 'READY_TO_PURSUE', payload: {}, compMid: 200000, dateAdded: day(1) }, o || {});

test('decision rule: a pending or saved decision hides the role, including a decision recorded on the master', () => {
  const r = row('A');
  const pend = { kind: 'APPLIED', ts: '2026-10-20T12:00:00Z', writeStatus: 'SUBMITTING', decisionSnap: A.snapshot(r, 80) };
  assert.equal(A.rule(r, pend, 80).hidden, true);
  const saved = Object.assign({}, pend, { writeStatus: 'READBACK_PENDING' });
  assert.equal(A.rule(r, saved, 80).hidden, true);
  assert.equal(A.rule(row('X', { BUCKET: 'DECLINED_BY_TIM' }), null, 50).hidden, true, 'the master record counts too');
});

test('a decision that did not save comes back, and a second decision is not treated as already saved', () => {
  const r = row('A'), ru = { kind: 'DECLINE', ts: '2026-10-20T12:00:00Z', writeStatus: 'RESULT_UNKNOWN', error: 'timeout', requestId: 'PX-1', decisionSnap: A.snapshot(r, 80) };
  assert.equal(A.rule(r, ru, 80).back, 'NOT_SAVED');
  assert.equal(A.alreadyDecided(r, ru), null);
  assert.equal(A.saveState({ writeStatus: 'WRITE_FAILED', error: 'refused' }), 'NOT_SAVED');
});

test('a material change after the decision brings the role back; small moves do not', () => {
  const r = row('A'), snap = A.snapshot(r, 70), ru = { kind: 'DECLINE', ts: '2026-10-19T12:00:00Z', writeStatus: 'VERIFIED', decisionSnap: snap };
  assert.equal(A.rule(row('A', { compMid: 200500 }), ru, 75).hidden, true, 'pay within $1k and score +5: still hidden');
  const pay = A.rule(row('A', { compMid: 240000 }), ru, 70);
  assert.equal(pay.back, 'CHANGED'); assert.deepEqual(pay.changes, [{ field: 'Pay', before: '$200k', after: '$240k' }]);
  assert.deepEqual(A.rule(r, ru, 81).changes.map(c => c.field), ['Score']);
  assert.deepEqual(A.rule(row('A', { TITLE: 'Senior Director of Quality' }), ru, 70).changes.map(c => c.field), ['Title']);
  assert.deepEqual(A.rule(row('A', { payload: { REPOSTED_AT: '2026-10-20' } }), ru, 70).changes.map(c => c.field), ['Posting']);
});

test('second decision is blocked with "Already decided: <decision>, <date>"', () => {
  const r = row('A'), ru = { kind: 'APPLIED', ts: '2026-10-20T12:00:00Z', writeStatus: 'VERIFIED' };
  assert.deepEqual(A.alreadyDecided(r, ru), { kind: 'APPLIED', label: 'Applied', date: '2026-10-20' });
});

test('REV-131: a ruling the outbox is still resending counts as pending, never as not saved', () => {
  assert.equal(A.saveState({ writeStatus: 'WRITE_FAILED', error: 'Lock timeout', outbox: { auto: true, tries: 1 } }), 'PENDING');
  assert.equal(A.saveState({ writeStatus: 'WRITE_FAILED', error: 'row is protected', outbox: { auto: false } }), 'NOT_SAVED');
  const r = row('A'), ru = { kind: 'DECLINE', ts: '2026-10-20T12:00:00Z', writeStatus: 'RESULT_UNKNOWN', outbox: { auto: true }, requestId: 'PX-1' };
  assert.equal(A.rule(r, ru, 80).hidden, true);
});

test('a SUPERSEDED ruling is ignored and the row follows the master bucket', () => {
  const html = fs.readFileSync(path.join(__dirname, '../pipeline.html'), 'utf8');
  const src = html.match(/function ruling\(r\)\{[^}]*\}/);
  assert.ok(src, 'ruling() is in pipeline.html');
  const box = { S: { rulings: { A: { kind: 'DECLINE', ts: '2026-10-15T03:47:41Z', writeStatus: 'SUPERSEDED', error: 'Superseded: master APPLIED kept', actor: 'TIM' } } } };
  vm.createContext(box); vm.runInContext(src[0], box);
  const r = row('A', { BUCKET: 'APPLIED', payload: { APP_DATE: '2026-10-20' } });
  assert.equal(box.ruling(r), null);
  const d = A.decision(r, box.ruling(r));
  assert.equal(d.kind, 'APPLIED'); assert.equal(d.master, true); assert.equal(d.state, 'SAVED');
  const rule = A.rule(r, box.ruling(r), 80);
  assert.equal(rule.decided, true); assert.equal(rule.hidden, true); assert.equal(rule.back, undefined);
});
