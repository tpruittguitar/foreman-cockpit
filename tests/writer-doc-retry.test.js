// Transient Google Docs access: read-only master/receipt opens retry with bounded backoff; everything else still fails closed.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const MASTER = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI';
const INACCESSIBLE = 'The document is inaccessible. Please try again later.';

function rowLine(n, id) { return n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SOURCE_URL=https://example.com/' + n; }
/* fail: { MASTER: [errors for successive master opens], RECEIPTS: [...] } ; each entry null = succeed, string = throw that message */
function services(fail, opts) {
  opts = opts || {};
  const para = t => { let s = t; return { getText: () => s, setText: v => { s = v; } }; };
  const master = ['COUNTS: TOTAL=2 SCOUT_INTAKE=2 UNACCOUNTED=0', rowLine(1, 'V2F-AAAA00000001'), rowLine(2, 'V2F-BBBB00000002'), 'END V2_CURRENT_POPULATION_MASTER (2 rows)'].map(para);
  const receipts = []; let events = '', saves = 0, mod = 0; const opens = { MASTER: 0, RECEIPTS: 0 }, sleeps = [];
  const files = { PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS: { getId: () => 'RECEIPTS' }, 'PIPELINE_EVENT_LOG.jsonl': { getId: () => 'EVENTS', getBlob: () => ({ getDataAsString: () => events }), setContent: v => { events = v; } } };
  const iter = l => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  const folder = { getFilesByName: n => iter(files[n] ? [files[n]] : []), createFile: n => { throw new Error('unexpected createFile ' + n); } };
  const maybeFail = key => { const q = (fail || {})[key] || []; const e = q[opens[key]++]; if (e) throw new Error(e); };
  global.Utilities = { sleep: ms => sleeps.push(ms) };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  global.DriveApp = { getFileById: id => ({ getLastUpdated: () => { if (id === MASTER && opts.concurrentEdit && mod++ > 0) return new Date('2026-10-04T20:05:00Z'); return new Date('2026-10-04T20:00:00Z'); }, getParents: () => iter([folder]), getId: () => id, getName: () => 'MASTER' }) };
  global.DocumentApp = { openById: id => {
    if (id === MASTER) { maybeFail('MASTER'); return { getBody: () => ({ getParagraphs: () => master, getText: () => master.map(p => p.getText()).join('\n') }), saveAndClose: () => { saves++; } }; }
    if (id === 'RECEIPTS') { maybeFail('RECEIPTS'); return { getBody: () => ({ getText: () => receipts.join('\n'), appendParagraph: t => receipts.push(t) }), saveAndClose() {} }; }
    return { getBody: () => ({ getText: () => '' }), saveAndClose() {} }; } };
  global.MimeType = { PLAIN_TEXT: 'text/plain' };
  return { opens, sleeps, saves: () => saves, receipts: () => receipts.join('\n'), row: id => master.map(p => p.getText()).find(l => l.split(' | ')[1] === id) };
}
const enrich = (rid, pid, extra) => ({ action: 'ruling', ruling: Object.assign({ primaryId: pid, kind: 'ENRICH', actor: 'CLAUDE', requestId: rid, fields: { CLAUDE_NOTE: 'note ' + rid } }, extra || {}) });

test('classification: only transient Docs/Drive service errors are retryable', () => {
  for (const m of [INACCESSIBLE, 'Service error: Docs', 'We\'re sorry, a server error occurred. Please wait a bit and try again.', 'Service unavailable: Docs', 'Internal error encountered.', 'Backend Error'])
    assert.equal(W.isTransientDocError_(new Error(m)), true, m);
  for (const m of ['Lock timeout: another process was holding the lock for too long.', 'identity not unique: 0 rows match X (fail closed)', 'master changed during request; retry',
    'Exception: You do not have permission to access the requested document.', 'No item with the given ID could be found.', 'ENRICH cannot set state', 'Cannot read properties of undefined'])
    assert.equal(W.isTransientDocError_(new Error(m)), false, m);
});

test('withDocRetry_: recovers after transient failures using 1s/2s backoff and records RECOVERED_BY_RETRY', () => {
  const s = services();let n = 0;
  const v = W.withDocRetry_('MASTER_READ', () => { if (n++ < 2) throw new Error(INACCESSIBLE); return 'ok'; });
  assert.equal(v, 'ok');assert.equal(n, 3);assert.deepEqual(s.sleeps, [1000, 2000]);
});

test('withDocRetry_: exhausts after 1 initial + 3 retries (1s, 2s, 4s), then throws the original error with the operation', () => {
  const s = services();let n = 0;
  assert.throws(() => W.withDocRetry_('MASTER_READ', () => { n++; throw new Error(INACCESSIBLE); }), e => e.message === INACCESSIBLE + ' [MASTER_READ: retry exhausted after 4 attempts]');
  assert.equal(n, 4);assert.deepEqual(s.sleeps, [1000, 2000, 4000]);assert.deepEqual(W.DOC_RETRY_DELAYS_MS, [1000, 2000, 4000]);
});

test('withDocRetry_: a deterministic error is thrown immediately, unchanged, without sleeping', () => {
  const s = services();let n = 0;const err = new Error('Exception: You do not have permission to access the requested document.');
  assert.throws(() => W.withDocRetry_('MASTER_READ', () => { n++; throw err; }), e => e === err);
  assert.equal(n, 1);assert.deepEqual(s.sleeps, []);
});

test('batch: transient master-open failures are recovered and the write commits exactly once with telemetry', () => {
  const s = services({ MASTER: [INACCESSIBLE, INACCESSIBLE] });
  const r = W.dispatchWrite_({ action: 'batch', requests: [enrich('RETRY-OK-1', 'V2F-AAAA00000001')] });
  assert.equal(r.ok, true);assert.equal(r.mode, 'BATCH_RULING_SINGLE_COMMIT');assert.equal(s.saves(), 1);
  assert.match(s.row('V2F-AAAA00000001'), /CLAUDE_NOTE=note RETRY-OK-1/);
  assert.equal(r.docAccess.status, 'RECOVERED_BY_RETRY');assert.equal(r.docAccess.retries, 2);
  const read = r.docAccess.ops.find(o => o.op === 'MASTER_READ');assert.equal(read.attempts, 3);assert.equal(read.error, INACCESSIBLE);
  assert.equal(r.docAccess.ops.find(o => o.op === 'MASTER_READBACK').status, 'INITIAL_SUCCESS');
  assert.deepEqual(Object.keys(W.completedReceiptRequestIds_(s.receipts())), ['RETRY-OK-1']);
});

test('batch: a transient readback failure after commit is recovered so the write is verified, not left unreceipted', () => {
  const s = services({ MASTER: [null, INACCESSIBLE] });
  const r = W.dispatchWrite_({ action: 'batch', requests: [enrich('RB-1', 'V2F-AAAA00000001')] });
  assert.equal(r.ok, true);assert.equal(s.saves(), 1);assert.equal(r.docAccess.ops.find(o => o.op === 'MASTER_READBACK').status, 'RECOVERED_BY_RETRY');
  assert.equal(W.completedReceiptRequestIds_(s.receipts())['RB-1'], true);
});

test('batch: retry exhaustion on the initial master read fails closed with no write and no receipt', () => {
  const s = services({ MASTER: [INACCESSIBLE, INACCESSIBLE, INACCESSIBLE, INACCESSIBLE] });
  assert.throws(() => W.dispatchWrite_({ action: 'batch', requests: [enrich('EXH-1', 'V2F-AAAA00000001')] }), /The document is inaccessible\. Please try again later\. \[MASTER_READ: retry exhausted after 4 attempts\]/);
  assert.equal(s.saves(), 0);assert.equal(s.receipts(), '');assert.doesNotMatch(s.row('V2F-AAAA00000001'), /CLAUDE_NOTE/);assert.equal(s.opens.MASTER, 4);
});

test('batch: a transient receipts read is retried; replay protection still sees completed requests', () => {
  const s = services({ RECEIPTS: [INACCESSIBLE] });
  const r = W.dispatchWrite_({ action: 'batch', requests: [enrich('RC-1', 'V2F-AAAA00000001')] });
  assert.equal(r.ok, true);assert.equal(r.docAccess.ops.find(o => o.op === 'RECEIPTS_READ').status, 'RECOVERED_BY_RETRY');
  const again = W.dispatchWrite_({ action: 'batch', requests: [enrich('RC-1', 'V2F-AAAA00000001')] });
  assert.equal(again.results[0].mode, 'ALREADY_APPLIED');assert.equal(s.saves(), 1, 'replayed request not re-applied');
});

test('optimistic concurrency conflicts, identity failures and protected-state refusals are never retried', () => {
  let s = services(null, { concurrentEdit: true });
  let r = W.dispatchWrite_({ action: 'batch', requests: [enrich('OCC-1', 'V2F-AAAA00000001')] });
  assert.equal(r.mode, 'BATCH_RULING_RETRY');assert.match(r.error, /master changed during request/);assert.equal(s.saves(), 0);assert.deepEqual(s.sleeps, []);
  s = services();r = W.dispatchWrite_({ action: 'batch', requests: [enrich('ID-1', 'V2F-NOPE00000000')] });
  assert.equal(r.ok, false);assert.match(r.results[0].error, /identity not unique/);assert.deepEqual(s.sleeps, []);assert.equal(s.opens.MASTER, 1);
  s = services();r = W.dispatchWrite_({ action: 'batch', requests: [enrich('BAD-1', 'V2F-AAAA00000001', { fields: { BUCKET: 'APPLIED' } })] });
  assert.equal(r.ok, false);assert.match(r.results[0].error, /cannot (be )?set/);assert.deepEqual(s.sleeps, []);assert.equal(s.saves(), 0);
});

test('single ruling path: transient master open recovered; readback still independent', () => {
  const s = services({ MASTER: [INACCESSIBLE] });
  const r = W.dispatchWrite_(enrich('SINGLE-1', 'V2F-BBBB00000002'));
  assert.equal(r.ok, true, r.error);assert.equal(r.docAccess.status, 'RECOVERED_BY_RETRY');assert.equal(s.opens.MASTER, 3, 'read (2 attempts) + independent readback');
  assert.equal(r.receipt.READBACK_VERIFIED, 'YES');
});
