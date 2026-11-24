'use strict';
// cs-a10d93a2 (Tim 2026-11-24 16:06 ET): delete_rows erases named rows from the live master; APPLIED, interview and archive rows stay.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs'), T = require('../apps-script/WriterTransactions.gs');
const { world } = require('./helpers/writer-world');
const row = (n, id, bucket, extra) => n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | ' + bucket + ' | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SCOUT_ACTION; SOURCE_URL=https://example.com/' + n + (extra || '');
function rows() {
  return [
    row(1, 'V2F-DEL000000001', 'SCOUT_INTAKE'),
    row(2, 'V2F-APP000000002', 'APPLIED', '; APP_DATE=2026-09-01'),
    row(3, 'V2F-INT000000003', 'READY_TO_PURSUE', '; INTERVIEW_STATUS=RECRUITER_SCREEN'),
    row(4, 'V2F-NOTE00000004', 'TIM_DECISION_REQUIRED'),
    row(5, 'V2F-DEC000000005', 'DECLINED_BY_TIM'),
    row(6, 'V2F-KEEP00000006', 'SCOUT_INTAKE')];
}
const pids = lines => lines.filter(l => /^\d+ \| /.test(l)).map(l => l.split(' | ')[1]);
function liveWorld(t) {
  const w = world(t, { rows: rows() });
  w.files.get('PIPELINE_EVENT_LOG.jsonl').content = JSON.stringify({ type: 'INTERVIEW_NOTE', primaryId: 'V2F-NOTE00000004', ts: '2026-10-01T00:00:00Z' }) + '\n';
  return w;
}

test('delete_rows: a deletable row is deleted; APPLIED, interview, archive rows skipped; unknown id notFound', t => {
  const w = liveWorld(t);
  const r = w.post({ action: 'delete_rows', primaryIds: ['V2F-DEL000000001', 'V2F-APP000000002', 'V2F-INT000000003', 'V2F-NOTE00000004', 'V2F-DEC000000005', 'V2F-NOPE00000099'], reason: 'never got a complete evaluation', requestId: 'DEL-1' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.deleted, 1); assert.deepEqual(r.deletedIds, ['V2F-DEL000000001']);
  assert.deepEqual(r.skipped.map(s => [s.primaryId, s.reason]), [['V2F-APP000000002', 'APPLIED'], ['V2F-INT000000003', 'INTERVIEW'], ['V2F-NOTE00000004', 'INTERVIEW'], ['V2F-DEC000000005', 'ARCHIVE']]);
  assert.deepEqual(r.notFound, ['V2F-NOPE00000099']);
  const m = w.master();
  assert.deepEqual(pids(m), ['V2F-APP000000002', 'V2F-INT000000003', 'V2F-NOTE00000004', 'V2F-DEC000000005', 'V2F-KEEP00000006']);
  assert.match(m.find(l => /^COUNTS:/.test(l)), /TOTAL=5 /); assert.ok(m.includes('END V2_CURRENT_POPULATION_MASTER (5 rows)'));
  assert.match(w.receipts(), /^REASON=never got a complete evaluation$/m);
  assert.equal(w.exec(() => W.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');
  assert.equal(w.index().requests['DEL-1'].s, 'COMPLETE');
});

test('delete_rows: a 1-row test id is deleted and the rediscovered job can re-enter intake (no re-import block)', t => {
  const w = liveWorld(t);
  const r = w.post({ action: 'delete_rows', primaryIds: ['V2F-KEEP00000006'], reason: 'test', requestId: 'DEL-2' });
  assert.equal(r.deleted, 1, JSON.stringify(r)); assert.ok(!pids(w.master()).includes('V2F-KEEP00000006'));
  w.exec(() => W.verifyPendingWrites_());
  const intake = w.post({ action: 'intake', run: { SCOUT_RUN_ID: 'RUN-R' }, records: [{ COMPANY: 'Acme 6', TITLE: 'Director of Quality', LOCATION: 'Austin, TX', REQ_ID: 'REQ-6', SOURCE_URL: 'https://example.com/6' }] });
  assert.equal(intake.results[0].result, 'SCOUT_INTAKE_WRITTEN', JSON.stringify(intake.results));
});

test('delete_rows: only protected or unknown ids writes nothing; empty list is a no-op readback; shape is checked', t => {
  const w = liveWorld(t);
  const r = w.post({ action: 'delete_rows', primaryIds: ['V2F-APP000000002', 'V2F-NOPE00000099'], reason: 'x' });
  assert.equal(r.ok, true); assert.equal(r.deleted, 0); assert.equal(w.masterSaves(), 0);
  const e = w.post({ action: 'delete_rows', primaryIds: [], reason: 'readback' });
  assert.equal(e.ok, true); assert.equal(e.deleted, 0); assert.equal(w.masterSaves(), 0);
  assert.equal(w.post({ action: 'delete_rows', primaryIds: 'V2F-DEL000000001', reason: 'x' }).ok, false);
  assert.equal(w.post({ action: 'delete_rows', primaryIds: ['V2F-DEL000000001'] }).ok, false);
  assert.equal(w.post({ action: 'batch', requests: [{ action: 'delete_rows', primaryIds: ['V2F-DEL000000001'], reason: 'x' }] }).mode, 'REJECTED_SCHEMA');
  assert.equal(w.masterSaves(), 0);
});

test('transactions: delete_rows may remove only the rows it names', () => {
  const h = s => 'h' + s.length, NOW = '2026-10-09T03:00:00.000Z', b = ['COUNTS: TOTAL=2', '1 | P-1 | a', '2 | P-2 | b', 'END V2_CURRENT_POPULATION_MASTER (2 rows)'], a = ['COUNTS: TOTAL=1', '2 | P-2 | b', 'END V2_CURRENT_POPULATION_MASTER (1 rows)'];
  assert.throws(() => T.intent(b, a, { action: 'delete_rows', requestId: 'X', deleteRows: { 'P-9': true } }, NOW, h, 'M', 'B'), /TRANSACTION_DELETE_FORBIDDEN: P-1/);
  assert.throws(() => T.intent(b, a, { action: 'ruling', requestId: 'X', deleteRows: { 'P-1': true } }, NOW, h, 'M', 'B'), /TRANSACTION_DELETE_FORBIDDEN: P-1/);
  const ok = T.intent(b, a, { action: 'delete_rows', requestId: 'X', deleteRows: { 'P-1': true } }, NOW, h, 'M', 'B');
  assert.deepEqual(ok.items.map(x => [x.pid, x.op, x.a]), [['P-1', 'DELETE', '']]);
});
