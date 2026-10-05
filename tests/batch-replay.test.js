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

test('parser: COMPLETE + READBACK_VERIFIED=YES counts as applied', () => {
  assert.deepEqual(W.completedReceiptRequestIds_(doc(sc('R-OK', 'COMPLETE', 'YES'))), { 'R-OK': true });
});

test('parser: FAILED, INCOMPLETE, HOLD, NEEDS_RESOLUTION, missing status and unverified readback never count', () => {
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

test('parser: a REQUEST_ID only in a failed block, or mentioned in another block, is not applied', () => {
  const ids = W.completedReceiptRequestIds_(doc(
    sc('R-X', 'FAILED', 'NO'),
    sc('R-Y', 'COMPLETE', 'YES', { REASON: 'see REQUEST_ID=R-X', NOTE: 'REQUEST_ID=R-X COMPLETION_STATUS=COMPLETE' })));
  assert.equal(ids['R-X'], undefined);
  assert.equal(ids['R-Y'], true);
});

test('parser: same REQUEST_ID failed earlier and completed later counts as applied', () => {
  assert.equal(W.completedReceiptRequestIds_(doc(sc('R-RETRY', 'FAILED', 'NO'), sc('R-RETRY', 'COMPLETE', 'YES')))['R-RETRY'], true);
});

test('parser: malformed or truncated blocks never count', () => {
  const unterminated = sc('R-TRUNC', 'COMPLETE', 'YES').replace(/\rEND STATE_CHANGE_RECEIPT$/, '');
  const wrongEnd = sc('R-WRONGEND', 'COMPLETE', 'YES').replace(/END STATE_CHANGE_RECEIPT$/, 'END INTAKE_RECEIPT');
  const conflicting = sc('R-CONFLICT', 'COMPLETE', 'YES', { COMPLETION_STATUS_DUP: '' }).replace('COMPLETION_STATUS_DUP=', 'COMPLETION_STATUS=FAILED');
  const noStart = sc('R-NOSTART', 'COMPLETE', 'YES').replace(/^RECEIPT=STATE_CHANGE_RECEIPT\r/, '');
  const ids = W.completedReceiptRequestIds_(doc(unterminated, wrongEnd, conflicting, noStart, sc('', 'COMPLETE', 'YES')));
  assert.deepEqual(ids, {});
});

test('parser: also accepts \\n-separated lines (older or exported receipt text)', () => {
  assert.equal(W.completedReceiptRequestIds_(sc('R-LF', 'COMPLETE', 'YES').replace(/\r/g, '\n'))['R-LF'], true);
});

// ---- end-to-end through applyRulingBatchToMaster_ / dispatchWrite_ with in-memory Apps Script services ----
const MASTER = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI';
function rowLine(inv, id) { return inv + ' | ' + id + ' | Acme Corp | Director of Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | REQ-' + inv + ' | Austin, TX | NOTIFICATION_SOURCE=LinkedIn; SOURCE_URL=https://example.com/' + inv; }
function fakeServices(receiptText) {
  const para = t => { let s = t; return { getText: () => s, setText: v => { s = v; } }; };
  const master = ['COUNTS: TOTAL=2 SCOUT_INTAKE=2 UNACCOUNTED=0', rowLine(1, 'V2F-AAAA00000001'), rowLine(2, 'V2F-BBBB00000002'), 'END V2_CURRENT_POPULATION_MASTER (2 rows)'].map(para);
  const receiptParas = receiptText.split('\n').map(para);
  let saves = 0, events = '';
  const masterDoc = { getBody: () => ({ getParagraphs: () => master }), saveAndClose: () => { saves++; } };
  const receiptDoc = { getBody: () => ({ getText: () => receiptParas.map(p => p.getText()).join('\n'), appendParagraph: t => receiptParas.push(para(t)) }), saveAndClose: () => {} };
  const files = {
    PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS: { getId: () => 'RECEIPTS', getMimeType: () => 'application/vnd.google-apps.document' },
    'PIPELINE_EVENT_LOG.jsonl': { getId: () => 'EVENTS', getBlob: () => ({ getDataAsString: () => events }), setContent: v => { events = v; } }
  };
  const iter = list => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
  const folder = { getFilesByName: n => iter(files[n] ? [files[n]] : []), createFile: (n, c) => { if (n === 'PIPELINE_RECEIPT_INDEX.json') { let v = c; return files[n] = { getId: () => 'INDEX', getMimeType: () => 'text/plain', getBlob: () => ({ getDataAsString: () => v }), setContent: x => { v = x; } }; } throw new Error('unexpected createFile ' + n); } };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  global.DriveApp = { getFileById: id => ({ getLastUpdated: () => new Date('2026-10-04T20:00:00Z'), getParents: () => iter([folder]), getId: () => id }) };
  global.DocumentApp = { openById: id => id === MASTER ? masterDoc : receiptDoc };
  global.MimeType = { PLAIN_TEXT: 'text/plain' };
  return { master, row: id => master.map(p => p.getText()).find(l => l.split(' | ')[1] === id), saves: () => saves, receipts: () => receiptParas.map(p => p.getText()).join('\n'), events: () => events };
}
const enrich = (rid, pid) => ({ action: 'ruling', ruling: { primaryId: pid, kind: 'ENRICH', actor: 'CLAUDE', requestId: rid, fields: { CLAUDE_NOTE: 'note for ' + rid } } });

test('batch: a request whose only receipt is FAILED is retried and written', () => {
  const f = fakeServices(doc(sc('FOREMAN-RETRY-1', 'FAILED', 'NO'), sc('FOREMAN-RETRY-2', 'INCOMPLETE', 'YES')));
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

test('batch: a request with a verified COMPLETE receipt is not re-applied', () => {
  const f = fakeServices(doc(sc('FOREMAN-DONE-1', 'FAILED', 'NO'), sc('FOREMAN-DONE-1', 'COMPLETE', 'YES')));
  const before = f.row('V2F-AAAA00000001');
  const r = freshExec({ action: 'batch', requests: [enrich('FOREMAN-DONE-1', 'V2F-AAAA00000001'), enrich('FOREMAN-NEW-2', 'V2F-BBBB00000002')] });
  assert.equal(r.results[0].mode, 'ALREADY_APPLIED');
  assert.equal(r.results[0].ok, true);
  assert.equal(f.row('V2F-AAAA00000001'), before, 'replayed row untouched');
  assert.equal(r.results[1].mode, 'BATCH_RULING');
  assert.match(f.row('V2F-BBBB00000002'), /CLAUDE_NOTE=note for FOREMAN-NEW-2/);
});

test('batch: a request ID that appears only inside another receipt is not skipped', () => {
  const f = fakeServices(doc(sc('OTHER-REQ', 'COMPLETE', 'YES', { REASON: 'supersedes REQUEST_ID=FOREMAN-X-1' })));
  const r = freshExec({ action: 'batch', requests: [enrich('FOREMAN-X-1', 'V2F-AAAA00000001')] });
  assert.equal(r.results[0].mode, 'BATCH_RULING');
  assert.match(f.row('V2F-AAAA00000001'), /CLAUDE_NOTE=note for FOREMAN-X-1/);
});

test('batch: identity still fails closed for an unknown PRIMARY_ID', () => {
  const f = fakeServices(doc());
  const r = freshExec({ action: 'batch', requests: [enrich('FOREMAN-Z-1', 'V2F-NOPE00000000')] });
  assert.equal(r.ok, false);
  assert.match(r.results[0].error, /identity not unique: 0 rows match V2F-NOPE00000000 \(fail closed\)/);
  assert.equal(f.saves(), 0);
});
