// All-ruling batch replay safety: only a receipt that proves a verified, completed write may skip a request as ALREADY_APPLIED.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
// Each call is its own Apps Script execution (fresh globals), as in production.
const freshExec = b => { W.resetExecution_(); return W.dispatchWrite_(b); };
// Durable verification happens in a LATER execution (separate request / queue tick), never in the write itself.
const verifyLater = () => { W.resetExecution_(); return W.verifyPendingWrites_(); };

// Receipt text exactly as Docs getText() returns it: \r between lines inside a receipt paragraph, \n between paragraphs.
const block = fields => Object.keys(fields).map(k => k + '=' + fields[k]).join('\r') + '\rEND ' + fields.RECEIPT;
const sc = (rid, status, readback, extra) => block(Object.assign({ RECEIPT: 'STATE_CHANGE_RECEIPT', REQUEST_ID: rid, EXECUTED_BY: 'Pipeline Explorer Apps Script (runs as Tim)', TARGET_CANONICAL_ID: 'V2F-AAAA00000001' }, readback === undefined ? {} : { READBACK_VERIFIED: readback }, status === undefined ? {} : { COMPLETION_STATUS: status }, extra || {}, { EXECUTED_AT: '2026-10-04T20:00:00.000Z', CHANGES: '["GROK_NOTE"]' }));
const doc = (...blocks) => '\n' + blocks.join('\n\n') + '\n';

test('parser: COMPLETE + READBACK_VERIFIED=YES counts as applied', t => {
  assert.deepEqual(W.completedReceiptRequestIds_(doc(sc('R-OK', 'COMPLETE', 'YES'))), { 'R-OK': true });
});

test('parser: FAILED, INCOMPLETE, HOLD, NEEDS_RESOLUTION, missing status and unverified readback never count', t => {
  const ids = W.completedReceiptRequestIds_(doc(
    sc('R-FAILED', 'FAILED', 'NO'),
    sc('R-INCOMPLETE', 'INCOMPLETE', 'YES'),
    sc('R-HOLD', 'HOLD', 'YES'),
    sc('R-NR', 'STATE_CHANGE_NEEDS_RESOLUTION', undefined, { REASON: 'master changed during request; retry' }),
    sc('R-NOSTATUS', undefined, 'YES'),
    sc('R-NORB', 'COMPLETE', undefined),
    sc('R-RBNO', 'COMPLETE', 'NO')));
  assert.deepEqual(ids, {});
});

test('parser: a REQUEST_ID only in a failed block, or mentioned in another block, is not applied', t => {
  const ids = W.completedReceiptRequestIds_(doc(
    sc('R-X', 'FAILED', 'NO'),
    sc('R-Y', 'COMPLETE', 'YES', { REASON: 'see REQUEST_ID=R-X', NOTE: 'REQUEST_ID=R-X COMPLETION_STATUS=COMPLETE' })));
  assert.equal(ids['R-X'], undefined);
  assert.equal(ids['R-Y'], true);
});

test('parser: same REQUEST_ID failed earlier and completed later counts as applied', t => {
  assert.equal(W.completedReceiptRequestIds_(doc(sc('R-RETRY', 'FAILED', 'NO'), sc('R-RETRY', 'COMPLETE', 'YES')))['R-RETRY'], true);
});

test('parser: malformed or truncated blocks never count', t => {
  const unterminated = sc('R-TRUNC', 'COMPLETE', 'YES').replace(/\rEND STATE_CHANGE_RECEIPT$/, '');
  const wrongEnd = sc('R-WRONGEND', 'COMPLETE', 'YES').replace(/END STATE_CHANGE_RECEIPT$/, 'END INTAKE_RECEIPT');
  const conflicting = sc('R-CONFLICT', 'COMPLETE', 'YES', { COMPLETION_STATUS_DUP: '' }).replace('COMPLETION_STATUS_DUP=', 'COMPLETION_STATUS=FAILED');
  const noStart = sc('R-NOSTART', 'COMPLETE', 'YES').replace(/^RECEIPT=STATE_CHANGE_RECEIPT\r/, '');
  const ids = W.completedReceiptRequestIds_(doc(unterminated, wrongEnd, conflicting, noStart, sc('', 'COMPLETE', 'YES')));
  assert.deepEqual(ids, {});
});

test('parser: also accepts \\n-separated lines (older or exported receipt text)', t => {
  assert.equal(W.completedReceiptRequestIds_(sc('R-LF', 'COMPLETE', 'YES').replace(/\r/g, '\n'))['R-LF'], true);
});

// ---- end-to-end through applyRulingBatchToMaster_ / dispatchWrite_ with in-memory Apps Script services ----
function rowLine(inv, id) { return inv + ' | ' + id + ' | Acme Corp | Director of Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | REQ-' + inv + ' | Austin, TX | NOTIFICATION_SOURCE=LinkedIn; SOURCE_URL=https://example.com/' + inv; }
function fakeServices(t, receiptText) {
  return require('./helpers/writer-world').world(t, { rows: [rowLine(1, 'V2F-AAAA00000001'), rowLine(2, 'V2F-BBBB00000002')], receipts: receiptText });
}

const enrich = (rid, pid) => ({ action: 'ruling', ruling: { primaryId: pid, kind: 'ENRICH', actor: 'CLAUDE', requestId: rid, fields: { CLAUDE_NOTE: 'note for ' + rid } } });

test('batch: a request whose only receipt is FAILED is retried and written', t => {
  const f = fakeServices(t, doc(sc('FOREMAN-RETRY-1', 'FAILED', 'NO'), sc('FOREMAN-RETRY-2', 'INCOMPLETE', 'YES')));
  const r = freshExec({ action: 'batch', requests: [enrich('FOREMAN-RETRY-1', 'V2F-AAAA00000001'), enrich('FOREMAN-RETRY-2', 'V2F-BBBB00000002')] });
  assert.equal(r.mode, 'BATCH_RULING_SINGLE_COMMIT');
  assert.equal(r.ok, true);
  assert.deepEqual(r.results.map(x => x.mode), ['BATCH_RULING', 'BATCH_RULING']);
  assert.match(f.row('V2F-AAAA00000001'), /CLAUDE_NOTE=note for FOREMAN-RETRY-1/);
  assert.match(f.row('V2F-BBBB00000002'), /CLAUDE_NOTE=note for FOREMAN-RETRY-2/);
  assert.equal(f.saves(), 1, 'one master commit for the whole batch');
  assert.equal(r.verification, 'PENDING');
  assert.deepEqual(Object.keys(W.completedReceiptRequestIds_(f.receipts())), [], 'the writing execution certifies nothing');
  assert.equal(f.events().trim().split('\n').length, 2, 'per-row events written');
  const v = verifyLater();
  assert.equal(v.decided[0].decision, 'COMPLETE');
  assert.equal(Object.keys(W.completedReceiptRequestIds_(f.receipts())).sort().join(), 'FOREMAN-RETRY-1,FOREMAN-RETRY-2', 'per-row COMPLETE receipts written by the verifier');
});

test('batch: a request with a verified COMPLETE receipt is not re-applied', t => {
  const f = fakeServices(t, doc(sc('FOREMAN-DONE-1', 'FAILED', 'NO'), sc('FOREMAN-DONE-1', 'COMPLETE', 'YES')));
  const before = f.row('V2F-AAAA00000001');
  const r = freshExec({ action: 'batch', requests: [enrich('FOREMAN-DONE-1', 'V2F-AAAA00000001'), enrich('FOREMAN-NEW-2', 'V2F-BBBB00000002')] });
  assert.equal(r.results[0].mode, 'ALREADY_APPLIED');
  assert.equal(r.results[0].ok, true);
  assert.equal(f.row('V2F-AAAA00000001'), before, 'replayed row untouched');
  assert.equal(r.results[1].mode, 'BATCH_RULING');
  assert.match(f.row('V2F-BBBB00000002'), /CLAUDE_NOTE=note for FOREMAN-NEW-2/);
});

test('batch: a request ID that appears only inside another receipt is not skipped', t => {
  const f = fakeServices(t, doc(sc('OTHER-REQ', 'COMPLETE', 'YES', { REASON: 'supersedes REQUEST_ID=FOREMAN-X-1' })));
  const r = freshExec({ action: 'batch', requests: [enrich('FOREMAN-X-1', 'V2F-AAAA00000001')] });
  assert.equal(r.results[0].mode, 'BATCH_RULING');
  assert.match(f.row('V2F-AAAA00000001'), /CLAUDE_NOTE=note for FOREMAN-X-1/);
});

test('batch: identity still fails closed for an unknown PRIMARY_ID', t => {
  const f = fakeServices(t, doc());
  const r = freshExec({ action: 'batch', requests: [enrich('FOREMAN-Z-1', 'V2F-NOPE00000000')] });
  assert.equal(r.ok, false);
  assert.match(r.results[0].error, /identity not unique: 0 rows match V2F-NOPE00000000 \(fail closed\)/);
  assert.equal(f.saves(), 0);
});
