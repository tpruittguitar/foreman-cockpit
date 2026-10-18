'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../apps-script/RecoveryTools.gs');
test('validIndex rejects empty, unparseable and malformed text; accepts a real index shape', () => {
  assert.equal(R.validIndex('').reason, 'EMPTY');
  assert.match(R.validIndex('{"requests":').reason, /UNPARSEABLE/);
  assert.equal(R.validIndex('{"requests":{}}').reason, 'MALFORMED');
  const ok = R.validIndex(JSON.stringify({ version: 1, updatedAt: '2026-10-16T01:01:41Z', rotations: [1], requests: { a: { s: 'COMPLETE' }, b: { s: 'PENDING' } }, pending: [{}] }));
  assert.deepEqual(ok, { ok: true, requests: 2, pending: 1, rotations: 1, updatedAt: '2026-10-16T01:01:41Z' });
});
test('candidates skips the head and empty versions, newest first', () => {
  const revs = [{ id: 'a', modifiedTime: '2026-10-16T01:01:11Z', size: '10' }, { id: 'b', modifiedTime: '2026-10-16T01:01:41Z', size: '12' }, { id: 'z', modifiedTime: '2026-10-16T01:02:44Z', size: '0' }];
  assert.deepEqual(R.candidates(revs, 'z').map(r => r.id), ['b', 'a']);
});
