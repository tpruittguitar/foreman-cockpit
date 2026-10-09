'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const { world, MASTER } = require('./helpers/writer-world');
const row = '1 | TEST-ONE | Fixture Co | Director Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | TEST-REQ | Austin, TX | SOURCE_URL=https://example.invalid/role';
const write = rid => ({ action: 'ruling', ruling: { primaryId: 'TEST-ONE', kind: 'ENRICH', actor: 'FORGE', requestId: rid, fields: { SCOPE_FIT_RAW: '83' } } });
test('intent failure happens before any master effect', t => {
  const f = world(t, { rows: [row] }); f.fail('PIPELINE_RECEIPT_INDEX.json');
  assert.throws(() => f.post(write('BEFORE')), /Synthetic crash/); assert.equal(f.masterSaves(), 0); assert.equal(f.row('TEST-ONE'), row);
});
test('crash after synchronous master save leaves a durable intent and prevents a second mutation', t => {
  const f = world(t, { rows: [row] }); f.fail(MASTER, 'write', { after: true });
  assert.throws(() => f.post(write('AFTER')), /Synthetic crash/);
  assert.equal(f.index().requests.AFTER.s, 'PENDING'); assert.match(f.row('TEST-ONE'), /SCOPE_FIT_RAW=83/);
  assert.equal(f.run(() => W.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');
  assert.equal(f.post(write('AFTER')).mode, 'ALREADY_APPLIED'); assert.equal(f.masterSaves(), 1);
});
test('master save failure is never retried automatically', t => {
  const f = world(t, { rows: [row] }); f.fail(MASTER, 'write', { message: 'Service error: Drive' });
  assert.throws(() => f.post(write('SAVE')), /Service error/); assert.equal(f.masterSaves(), 0);
  assert.equal(f.index().pending.length, 1); assert.equal(f.index().requests.SAVE.s, 'PENDING');
});
test('receipt append failure after save is recoverable through the precommit intent', t => {
  const f = world(t, { rows: [row] }); f.fail('PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS');
  assert.throws(() => f.post(write('RECEIPT')), /Synthetic crash/);
  assert.equal(f.index().requests.RECEIPT.s, 'PENDING');
  assert.equal(f.run(() => W.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');
  assert.equal(f.index().requests.RECEIPT.s, 'COMPLETE'); assert.equal(f.masterSaves(), 1);
});
test('independent verifier cannot close delivery when the COMPLETE receipt append fails', t => {
  const f = world(t, { rows: [row] }); f.post(write('DELIVERY')); f.fail('PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS');
  assert.throws(() => f.run(() => W.verifyPendingWrites_()), /Synthetic crash/);
  assert.notEqual(f.index().requests.DELIVERY.s, 'COMPLETE'); assert.equal(f.index().pending.length, 1);
  f.run(() => W.verifyPendingWrites_()); assert.equal(f.index().requests.DELIVERY.s, 'COMPLETE');
});
test('changed readback remains fenced instead of permitting replay', t => {
  const f = world(t, { rows: [row] }); f.post(write('CONFLICT'));
  f.files.get(MASTER).content = f.files.get(MASTER).content.replace('SCOPE_FIT_RAW=83', 'SCOPE_FIT_RAW=72');
  f.advance(200000); const v = f.run(() => W.verifyPendingWrites_());
  assert.equal(v.decided[0].decision, 'NEEDS_RESOLUTION'); assert.equal(f.post(write('CONFLICT')).mode, 'WRITE_FENCE'); assert.equal(f.masterSaves(), 1);
});
test('one execution cannot certify its own master write', t => {
  const f = world(t, { rows: [row] });
  f.run(() => { W.dispatchWrite_(write('SAME')); assert.equal(W.verifyPendingWrites_().skipped, 'SAME_EXECUTION_AS_WRITE'); });
});
test('intake run identity is carried into receipts and replay protection', t => {
  const f = world(t, { rows: [row] });
  const req = { action: 'intake', run: { SCOUT_RUN_ID: 'INTAKE-TEST' }, records: [{ COMPANY: 'Other Fixture', TITLE: 'Quality Director', LOCATION: 'Austin, TX', REQ_ID: 'OTHER', SOURCE_URL: 'https://example.invalid/other' }] };
  const r = f.post(req); assert.equal(r.ok, true); assert.equal(f.index().requests['INTAKE-TEST'].s, 'PENDING');
  f.run(() => W.verifyPendingWrites_()); assert.equal(f.index().requests['INTAKE-TEST'].s, 'COMPLETE'); assert.equal(f.masterSaves(), 1);
});
