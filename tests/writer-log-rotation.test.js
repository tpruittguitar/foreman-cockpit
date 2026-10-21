// REV-134: the event log and receipt log rotate once they pass LOG_ROTATE_BYTES, so a write no longer reads and rewrites
// tens of MB. History stays readable (archive registry + readEvents_ fallback) and replay protection moves to the index
// before the receipt log moves.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const { world } = require('./helpers/writer-world');

function rowLine(n, id) { return n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SOURCE_URL=https://example.com/' + n; }
const A = 'V2F-AAAA00000001', B = 'V2F-BBBB00000002';
const EV = 'PIPELINE_EVENT_LOG.jsonl', RC = 'PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS', REG = 'PIPELINE_LOG_ARCHIVES.json';
const decline = (rid, pid) => ({ action: 'ruling', ruling: { primaryId: pid, kind: 'DECLINE', code: 'FIT', actor: 'TIM', requestId: rid } });
const receiptBlock = (rid, status, extra = '') => 'RECEIPT=STATE_CHANGE_RECEIPT\nREQUEST_ID=' + rid + '\nCOMPLETION_STATUS=' + status + '\nREADBACK_VERIFIED=' + (status === 'COMPLETE' ? 'YES' : 'PENDING') + extra + '\nEND STATE_CHANGE_RECEIPT';
const correction = rid => 'RECEIPT=RECEIPT_CORRECTION\nREQUEST_ID=' + rid + '\nCORRECTION=FALSE_COMPLETE\nCOMPLETION_STATUS=CORRECTION\nEND RECEIPT_CORRECTION';
const mk = (t, receipts) => world(t, { clock: '2026-10-21T05:00:00Z', rows: [rowLine(1, A), rowLine(2, B)], receipts: receipts || '' });
const archives = w => JSON.parse(w.text(REG) || '{"events":[],"receipts":[]}');

test('below the threshold nothing rotates; dryRun changes nothing', t => {
  const w = mk(t);
  const r = w.post({ action: 'rotate_logs' });
  assert.equal(r.ok, true); assert.equal(r.events.mode, 'BELOW_THRESHOLD'); assert.equal(r.receipts.mode, 'BELOW_THRESHOLD');
  const d = w.post({ action: 'rotate_logs', force: true, dryRun: true });
  assert.equal(d.events.mode, 'DRY_RUN'); assert.equal(d.receipts.mode, 'DRY_RUN');
  assert.equal(w.files.has(REG), false, 'no registry written'); assert.ok(w.files.has(EV) && w.files.has(RC));
  assert.equal(w.post({ action: 'batch', requests: [{ action: 'rotate_logs' }] }).mode, 'REJECTED_SCHEMA', 'not batchable');
});

test('event log: archived under a new name with the same file, fresh active log, events still readable and undo still works', t => {
  const w = mk(t);
  const wr = w.post(decline('R-1', A)); assert.equal(wr.ok, true);
  w.advance(200000); w.run(() => W.verifyPendingWrites_());
  assert.equal(w.index().requests['R-1'].s, 'COMPLETE');
  const oldId = w.files.get(EV).getId();
  const r = w.post({ action: 'rotate_logs', force: true });
  assert.equal(r.events.mode, 'ROTATED'); assert.equal(r.events.archiveId, oldId);
  assert.notEqual(w.files.get(EV).getId(), oldId, 'a new active log');
  assert.ok(w.text(EV).length < 2000, 'active log is small: ' + w.text(EV).length);
  assert.match(w.files.get(r.events.archiveName).content, /"type":"TIM_RULING"/, 'archive keeps the history (same file, renamed)');
  assert.deepEqual(archives(w).events.map(a => a.id), [oldId]);
  const ev = w.run(() => W.readEvents_(A, 200));
  assert.ok(ev.some(e => e.type === 'TIM_RULING' && e.requestId === 'R-1'), 'readEvents_ falls back to the archive');
  w.advance(200000);
  const u = w.post({ action: 'undo_ruling', undo: { primaryId: A } });
  assert.equal(u.ok, true, 'undo finds the ruling in the archive: ' + u.error);
});

test('receipt log: completed requests are indexed before the log moves; replay still refuses them; corrected ones stay out', t => {
  const legacy = [receiptBlock('LEG-1', 'COMPLETE'), receiptBlock('LEG-2', 'COMPLETE'), correction('LEG-2'), receiptBlock('LEG-3', 'PENDING_VERIFICATION')].join('\n\n') + '\n';
  const w = mk(t, legacy);
  const oldId = w.files.get(RC).getId();
  const r = w.post({ action: 'rotate_logs', force: true });
  assert.equal(r.receipts.mode, 'ROTATED'); assert.equal(r.receipts.archiveId, oldId);
  const idx = w.index();
  assert.equal(idx.requests['LEG-1'].s, 'COMPLETE'); assert.equal(idx.requests['LEG-1'].src, 'ROTATED_RECEIPTS');
  assert.equal(idx.requests['LEG-2'], undefined, 'a FALSE_COMPLETE correction keeps it out');
  assert.equal(idx.requests['LEG-3'], undefined, 'pending is not complete');
  assert.equal(idx.rotations.slice(-1)[0].kind, 'TEXT_LOG');
  assert.match(w.receipts(), /^RECEIPT=RECEIPT_LOG_ROTATION/); assert.doesNotMatch(w.receipts(), /LEG-1/);
  assert.deepEqual(archives(w).receipts.map(a => a.id), [oldId]);
  const again = w.post({ action: 'batch', requests: [decline('LEG-1', A).ruling].map(ru => ({ action: 'ruling', ruling: ru })) });
  assert.equal(again.results[0].mode, 'ALREADY_APPLIED', 'replay protection survives rotation');
  assert.match(w.run(() => W.readReceiptsWithArchives_()), /REQUEST_ID=LEG-1/, 'legacy proofs can still read the archive');
});

test('writes after rotation append to the small active logs and verify normally', t => {
  const w = mk(t, receiptBlock('LEG-9', 'COMPLETE') + '\n');
  w.post({ action: 'rotate_logs', force: true });
  const evBefore = w.text(EV).length;
  const wr = w.post({ action: 'batch', requests: [decline('N-1', A), decline('N-2', B)] });
  assert.equal(wr.ok, true);
  w.advance(200000); const v = w.run(() => W.verifyPendingWrites_());
  assert.equal(v.decided[0].decision, 'COMPLETE');
  assert.ok(w.text(EV).length > evBefore); assert.match(w.receipts(), /REQUEST_ID=N-1/);
  assert.equal(w.index().requests['N-2'].s, 'COMPLETE');
});

test('the queue-tick check rotates only a log over the threshold', t => {
  const w = mk(t);
  assert.equal(w.run(() => W.maybeRotateLogs_()).skipped, true);
  w.files.get(EV).content += JSON.stringify({ type: 'PAD', ts: '2026-10-01T00:00:00Z', pad: 'x'.repeat(W.LOG_ROTATE_BYTES) }) + '\n';
  const r = w.run(() => W.maybeRotateLogs_());
  assert.equal(r.events.mode, 'ROTATED'); assert.equal(r.receipts.mode, 'BELOW_THRESHOLD');
});

test('a busy Writer answers at once and rotates nothing', t => {
  const w = mk(t);
  const prior = global.LockService;
  global.LockService = { getScriptLock: () => ({ tryLock: () => false, waitLock() { throw new Error('Lock timeout'); }, releaseLock() {} }) };
  try { const r = w.run(() => W.rotateLogs_({ force: true })); assert.equal(r.busy, true); assert.equal(r.ok, false); }
  finally { global.LockService = prior; }
  assert.equal(w.files.has(REG), false);
});
