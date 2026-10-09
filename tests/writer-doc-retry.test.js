// Transient read-only Drive master/receipt access retries with bounded backoff; canonical saves never retry.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
// Each call is its own Apps Script execution (fresh globals), as in production.
const freshExec = b => { W.resetExecution_(); return W.dispatchWrite_(b); };
// Durable verification happens in a LATER execution (separate request / queue tick), never in the write itself.
const verifyLater = () => { W.resetExecution_(); return W.verifyPendingWrites_(); };
const MASTER = '1My9QYVPBblw8c7vFMFxGOAqgTSuH9gS8';
const INACCESSIBLE = 'The document is inaccessible. Please try again later.';

function rowLine(n, id) { return n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SOURCE_URL=https://example.com/' + n; }
/* fail: { MASTER: [errors for successive master opens], RECEIPTS: [...] } ; each entry null = succeed, string = throw that message */
function services(t, fail, opts={}) {
  const state=require('./helpers/writer-world').world(t,{rows:[rowLine(1,'V2F-AAAA00000001'),rowLine(2,'V2F-BBBB00000002')],receipts:'',rulesText:''});
  const opens={MASTER:0,RECEIPTS:0},sleeps=[];
  function maybeFail(key){const errors=(fail||{})[key]||[],error=errors[opens[key]++];if(error)throw new Error(error)}
  for(const [name,key] of [[MASTER,'MASTER'],['PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS','RECEIPTS']]){
    const file=state.files.get(name),blob=file.getBlob;file.getBlob=()=>{maybeFail(key);return blob()};
  }
  if(opts.concurrentEdit){const file=state.files.get(MASTER),modified=file.getLastUpdated;let n=0;file.getLastUpdated=()=>new Date(+modified()+(n++?300000:0));}
  global.Utilities.sleep=ms=>sleeps.push(ms);
  return {...state,opens,sleeps};
}

const enrich = (rid, pid, extra) => ({ action: 'ruling', ruling: Object.assign({ primaryId: pid, kind: 'ENRICH', actor: 'CLAUDE', requestId: rid, fields: { CLAUDE_NOTE: 'note ' + rid } }, extra || {}) });

test('classification: only transient Docs/Drive service errors are retryable', t => {
  for (const m of [INACCESSIBLE, 'Service error: Docs', 'We\'re sorry, a server error occurred. Please wait a bit and try again.', 'Service unavailable: Docs', 'Internal error encountered.', 'Backend Error'])
    assert.equal(W.isTransientDocError_(new Error(m)), true, m);
  for (const m of ['Lock timeout: another process was holding the lock for too long.', 'identity not unique: 0 rows match X (fail closed)', 'master changed during request; retry',
    'Exception: You do not have permission to access the requested document.', 'No item with the given ID could be found.', 'ENRICH cannot set state', 'Cannot read properties of undefined'])
    assert.equal(W.isTransientDocError_(new Error(m)), false, m);
});

test('withDocRetry_: recovers after transient failures using 1s/2s backoff and records RECOVERED_BY_RETRY', t => {
  const s = services(t);let n = 0;
  const v = W.withDocRetry_('MASTER_READ', () => { if (n++ < 2) throw new Error(INACCESSIBLE); return 'ok'; });
  assert.equal(v, 'ok');assert.equal(n, 3);assert.deepEqual(s.sleeps, [1000, 2000]);
});

test('withDocRetry_: exhausts after 1 initial + 3 retries (1s, 2s, 4s), then throws the original error with the operation', t => {
  const s = services(t);let n = 0;
  assert.throws(() => W.withDocRetry_('MASTER_READ', () => { n++; throw new Error(INACCESSIBLE); }), e => e.message === INACCESSIBLE + ' [MASTER_READ: retry exhausted after 4 attempts]');
  assert.equal(n, 4);assert.deepEqual(s.sleeps, [1000, 2000, 4000]);assert.deepEqual(W.DOC_RETRY_DELAYS_MS, [1000, 2000, 4000]);
});

test('withDocRetry_: a deterministic error is thrown immediately, unchanged, without sleeping', t => {
  const s = services(t);let n = 0;const err = new Error('Exception: You do not have permission to access the requested document.');
  assert.throws(() => W.withDocRetry_('MASTER_READ', () => { n++; throw err; }), e => e === err);
  assert.equal(n, 1);assert.deepEqual(s.sleeps, []);
});

test('batch: transient master-open failures are recovered and the write commits exactly once with telemetry', t => {
  const s = services(t, { MASTER: [INACCESSIBLE, INACCESSIBLE] });
  const r = freshExec({ action: 'batch', requests: [enrich('RETRY-OK-1', 'V2F-AAAA00000001')] });
  assert.equal(r.ok, true);assert.equal(r.mode, 'BATCH_RULING_SINGLE_COMMIT');assert.equal(s.saves(), 1);
  assert.match(s.row('V2F-AAAA00000001'), /CLAUDE_NOTE=note RETRY-OK-1/);
  assert.equal(r.docAccess.status, 'RECOVERED_BY_RETRY');assert.equal(r.docAccess.retries, 2);
  const read = r.docAccess.ops.find(o => o.op === 'MASTER_READ');assert.equal(read.attempts, 3);assert.equal(read.error, INACCESSIBLE);
  assert.equal(r.docAccess.ops.find(o => o.op === 'MASTER_READBACK'), undefined, 'no same-execution readback');
  assert.equal(verifyLater().decided[0].decision, 'COMPLETE');
  assert.deepEqual(Object.keys(W.completedReceiptRequestIds_(s.receipts())), ['RETRY-OK-1']);
});

test('batch: a transient failure on the independent verification read is recovered so the write is verified, not left unreceipted', t => {
  const s = services(t, { MASTER: [null, null, INACCESSIBLE] });
  const r = freshExec({ action: 'batch', requests: [enrich('RB-1', 'V2F-AAAA00000001')] });
  assert.equal(r.ok, true);assert.equal(s.saves(), 1);assert.equal(r.verification, 'PENDING');
  W.resetExecution_(); W.verifyPendingWrites_();
  assert.equal(W.completedReceiptRequestIds_(s.receipts())['RB-1'], true);
});

test('batch: retry exhaustion on the initial master read fails closed with no write and no receipt', t => {
  const s = services(t, { MASTER: [INACCESSIBLE, INACCESSIBLE, INACCESSIBLE, INACCESSIBLE] });
  assert.throws(() => freshExec({ action: 'batch', requests: [enrich('EXH-1', 'V2F-AAAA00000001')] }), /The document is inaccessible\. Please try again later\. \[MASTER_READ: retry exhausted after 4 attempts\]/);
  assert.equal(s.saves(), 0);assert.equal(s.receipts(), '');assert.doesNotMatch(s.row('V2F-AAAA00000001'), /CLAUDE_NOTE/);assert.equal(s.opens.MASTER, 4);
});

test('batch: a transient receipts read is retried; replay protection still sees completed requests', t => {
  const s = services(t, { RECEIPTS: [INACCESSIBLE] });
  const r = freshExec({ action: 'batch', requests: [enrich('RC-1', 'V2F-AAAA00000001')] });
  assert.equal(r.ok, true);assert.equal(r.docAccess.ops.find(o => o.op === 'RECEIPTS_READ').status, 'RECOVERED_BY_RETRY');
  const again = freshExec({ action: 'batch', requests: [enrich('RC-1', 'V2F-AAAA00000001')] });
  assert.equal(again.results[0].mode, 'ALREADY_APPLIED');assert.equal(s.saves(), 1, 'replayed request not re-applied');
});

test('optimistic concurrency conflicts, identity failures and protected-state refusals are never retried', t => {
  let s = services(t, null, { concurrentEdit: true });
  let r = freshExec({ action: 'batch', requests: [enrich('OCC-1', 'V2F-AAAA00000001')] });
  assert.equal(r.mode, 'BATCH_RULING_RETRY');assert.match(r.error, /master changed during request/);assert.equal(s.saves(), 0);assert.deepEqual(s.sleeps, []);
  s = services(t);r = freshExec({ action: 'batch', requests: [enrich('ID-1', 'V2F-NOPE00000000')] });
  assert.equal(r.ok, false);assert.match(r.results[0].error, /identity not unique/);assert.deepEqual(s.sleeps, []);assert.equal(s.opens.MASTER, 1);
  s = services(t);r = freshExec({ action: 'batch', requests: [enrich('BAD-1', 'V2F-AAAA00000001', { fields: { BUCKET: 'APPLIED' } })] });
  assert.equal(r.ok, false);assert.match(r.results[0].error, /cannot (be )?set/);assert.deepEqual(s.sleeps, []);assert.equal(s.saves(), 0);
});

test('single ruling path: transient master open recovered; readback still independent', t => {
  const s = services(t, { MASTER: [INACCESSIBLE] });
  const r = freshExec(enrich('SINGLE-1', 'V2F-BBBB00000002'));
  assert.equal(r.ok, true, r.error);assert.equal(r.docAccess.status, 'RECOVERED_BY_RETRY');assert.equal(s.opens.MASTER, 3, 'initial read (2 attempts) plus fresh precommit check; no same-execution certification');
  assert.equal(r.receipt.READBACK_VERIFIED, 'PENDING');assert.equal(r.verification, 'PENDING');
  assert.equal(verifyLater().decided[0].decision, 'COMPLETE');assert.equal(s.opens.MASTER, 4, 'certifying readback happens in a later execution');
  assert.equal(W.completedReceiptRequestIds_(s.receipts())['SINGLE-1'], true);
});
