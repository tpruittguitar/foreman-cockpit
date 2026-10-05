// Tim bulk review: canonical decline codes come from DECLINE_RULES; one Writer batch applies ordinary Tim DECLINE semantics.
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../pipeline-rules.js'), W = require('../apps-script/Code.gs');
// Each call is its own Apps Script execution (fresh globals), as in production.
const freshExec = b => { W.resetExecution_(); return W.dispatchWrite_(b); };
// Durable verification happens in a LATER execution (separate request / queue tick), never in the write itself.
const verifyLater = () => { W.resetExecution_(); return W.verifyPendingWrites_(); };

const DECLINE_RULES = 'TIM_PIPELINE_RULES_CANONICAL\nSECTION=DECLINE_RULES\n' +
  '- Every new DECLINED_BY_TIM decision requires DECLINE_REASON_CODE, DECLINE_REASON_TEXT, and REOPEN_TRIGGER.\n' +
  '- Allowed reason codes: PAY_BELOW_FLOOR, GEOGRAPHY_GATE_FAIL, FLEX_STRICT_NO, SCOPE_BELOW_TARGET, FIT_TOO_WEAK, DOMAIN_MISMATCH, LOCATION_NOT_ACCEPTABLE, TIM_EXPLICIT_DECLINE, MULTIPLE_RULE_FAILURES.\n' +
  '- LEGACY_REASON_NEEDS_NORMALIZATION is migration-only and must never be used for a new decision.\nSECTION=NEVER_CONSIDER\nX=1';

test('live-shaped DECLINE_RULES yields all nine allowed codes, including the last one before the period', () => {
  assert.deepEqual(R.declineReasonCodes(DECLINE_RULES), ['PAY_BELOW_FLOOR', 'GEOGRAPHY_GATE_FAIL', 'FLEX_STRICT_NO', 'SCOPE_BELOW_TARGET', 'FIT_TOO_WEAK', 'DOMAIN_MISMATCH', 'LOCATION_NOT_ACCEPTABLE', 'TIM_EXPLICIT_DECLINE', 'MULTIPLE_RULE_FAILURES']);
  assert.equal(R.declineReasonCodes(DECLINE_RULES).includes('LEGACY_REASON_NEEDS_NORMALIZATION'), false);
});

test('missing section or list fails closed with no codes', () => {
  assert.deepEqual(R.declineReasonCodes(''), []);
  assert.deepEqual(R.declineReasonCodes('SECTION=OTHER\n- Allowed reason codes: PAY_BELOW_FLOOR.'), []);
});

const MASTER = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI';
function services(lines) {
  const para = t => { let s = t; return { getText: () => s, setText: v => { s = v; } }; };
  const master = ['COUNTS: TOTAL=' + lines.length, ...lines, 'END V2_CURRENT_POPULATION_MASTER (' + lines.length + ' rows)'].map(para);
  const receipts = []; let events = '', saves = 0;
  const files = { PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS: { getId: () => 'RECEIPTS', getMimeType: () => 'application/vnd.google-apps.document' }, 'PIPELINE_EVENT_LOG.jsonl': { getId: () => 'EVENTS', getBlob: () => ({ getDataAsString: () => events }), setContent: v => { events = v; } } };
  const iter = l => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  const folder = { getFilesByName: n => iter(files[n] ? [files[n]] : []), createFile: (n, c) => { if (n === 'PIPELINE_RECEIPT_INDEX.json') { let v = c; return files[n] = { getId: () => 'INDEX', getMimeType: () => 'text/plain', getBlob: () => ({ getDataAsString: () => v }), setContent: x => { v = x; } }; } throw new Error('unexpected createFile ' + n); } };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  global.DriveApp = { getFileById: id => ({ getLastUpdated: () => new Date('2026-10-04T20:00:00Z'), getParents: () => iter([folder]), getId: () => id }) };
  global.DocumentApp = { openById: id => id === MASTER ? { getBody: () => ({ getParagraphs: () => master }), saveAndClose: () => { saves++; } }
    : { getBody: () => ({ getText: () => (id === 'RECEIPTS' ? receipts.join('\n') : ''), appendParagraph: t => receipts.push(t) }), saveAndClose() {} } };
  global.MimeType = { PLAIN_TEXT: 'text/plain' };
  return { saves: () => saves, receipts: () => receipts.join('\n'), row: id => master.map(p => p.getText()).find(l => l.split(' | ')[1] === id) };
}
const row = (n, bucket, extra) => n + ' | V2F-BULK' + String(n).padStart(8, '0') + ' | Co ' + n + ' | Director of Quality | ' + bucket + ' | OPEN | - | REQ-' + n + ' | Austin, TX | PROPOSED_DISPOSITION=DECLINED_BY_TIM (recommendation only)' + (extra || '');
const pl = line => W.parsePayload(line.split(' | ').slice(9).join(' | ')).payload;
const decline = (n, i) => ({ action: 'ruling', ruling: { primaryId: 'V2F-BULK' + String(n).padStart(8, '0'), kind: 'DECLINE', code: 'PAY_BELOW_FLOOR', note: 'Bulk: posted pay below floor', actor: 'TIM', requestId: 'PX-BULK-1-' + i + '-' + n } });

test('one 20-row Tim DECLINE batch commits once and writes ordinary Tim decline fields on every row', () => {
  const buckets = ['SCOUT_INTAKE', 'DISCOVERY_LEAD', 'MANUAL_RESEARCH', 'TIM_DECISION_REQUIRED', 'READY_TO_PURSUE'];
  const s = services(Array.from({ length: 20 }, (_, i) => row(i + 1, buckets[i % 5])));
  const r = freshExec({ action: 'batch', requests: Array.from({ length: 20 }, (_, i) => decline(i + 1, i + 1)) });
  assert.equal(r.ok, true); assert.equal(r.mode, 'BATCH_RULING_SINGLE_COMMIT'); assert.equal(r.processed, 20); assert.equal(s.saves(), 1);
  for (let n = 1; n <= 20; n++) {
    const line = s.row('V2F-BULK' + String(n).padStart(8, '0')), c = line.split(' | '), p = pl(line);
    assert.equal(c[4], 'DECLINED_BY_TIM'); assert.equal(c[5], 'RESOLVED/DECLINED_BY_TIM');
    assert.equal(p.TIM_RULING, 'DO_NOT_PURSUE'); assert.equal(p.DECLINE_REASON_CODE, 'PAY_BELOW_FLOOR'); assert.equal(p.DECLINE_REASON_TEXT, 'Bulk: posted pay below floor');
    assert.ok(p.REOPEN_TRIGGER); assert.match(p.TIM_DISPOSITION, /^TIM_PASS_\d{4}-\d{2}-\d{2}_EXPLORER$/);
    assert.equal(p.STATE_SOURCE, 'TIM:PX-BULK-1-' + n + '-' + n); assert.match(p.STATE_UPDATED_AT, /^\d{4}-\d{2}-\d{2}T/);
  }
  assert.equal(Object.keys(W.completedReceiptRequestIds_(s.receipts())).length, 0, 'nothing certified by the writing execution');
  assert.equal(verifyLater().decided[0].decision, 'COMPLETE');
  assert.equal(Object.keys(W.completedReceiptRequestIds_(s.receipts())).length, 20);
  // the same fields as an ordinary single Tim decline
  const single = W.mutateRow(row(99, 'SCOUT_INTAKE'), decline(99, 1).ruling);
  const bulkKeys = Object.keys(pl(s.row('V2F-BULK00000001'))).sort(), singleKeys = Object.keys(pl(single.after)).sort();
  assert.deepEqual(bulkKeys, singleKeys);
});

test('protected applicant rows still fail closed inside a bulk DECLINE batch; eligible rows are unaffected by the refusal', () => {
  const s = services([row(1, 'SCOUT_INTAKE'), row(2, 'APPLIED', '; APP_DATE=2026-10-01; ANTI_RESURRECTION=YES'), row(3, 'REJECTED_BY_EMPLOYER')]);
  const r = freshExec({ action: 'batch', requests: [decline(1, 1), decline(2, 2), decline(3, 3)] });
  assert.equal(r.ok, false);
  assert.match(r.results[1].error, /protected applicant state/); assert.match(r.results[2].error, /protected applicant state/);
  assert.equal(s.row('V2F-BULK00000002').split(' | ')[4], 'APPLIED'); assert.equal(s.row('V2F-BULK00000003').split(' | ')[4], 'REJECTED_BY_EMPLOYER');
  for (const k of ['MANUAL_RESEARCH', 'INVALID_DISCOVERY'])
    assert.match(W.mutateRow(row(4, 'APPLIED'), { kind: k, actor: 'TIM', requestId: 'X', note: 'n' }).error, /protected applicant state/);
});
