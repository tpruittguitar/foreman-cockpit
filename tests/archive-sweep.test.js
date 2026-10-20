'use strict';
// REV-117 (Tim 2026-10-20 18:26 ET): rows that turn terminal after the Oct 5 cutover keep moving to V2_TERMINAL_ARCHIVE.
// Archive append + readback first, then one verified master write whose intent permits exactly those deletions.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs'), T = require('../apps-script/WriterTransactions.gs'), Loader = require('../pipeline-loader.js');
const { world } = require('./helpers/writer-world');
const row = (n, id, bucket, extra) => n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | ' + bucket + ' | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SCOUT_ACTION; SOURCE_URL=https://example.com/' + n + '; FLEX_CLASS=HIGH_FLEX' + (extra || '');
const OLD = '2026-09-20T00:00:00.000Z', NOW = '2026-10-09T03:00:00.000Z';
function source() {
  const rows = [
    row(1, 'V2F-REJ000000001', 'SCOUT_INTAKE', '; SCOUT_NOTES=found via target company; SCOPE_FIT_RAW=83'),
    row(2, 'V2F-DEC000000002', 'MANUAL_RESEARCH', '; RESEARCH_REQUEST=check pay'),
    row(3, 'V2F-OLD000000003', 'DECLINED_BY_TIM', '; DECLINE_REASON_CODE=PAY_BELOW_FLOOR'),
    row(4, 'V2F-APP000000004', 'APPLIED', '; APP_DATE=2026-09-01'),
    row(5, 'V2F-LIVE00000005', 'SCOUT_INTAKE', ''),
    row(6, 'V2F-DEAD00000006', 'DISCOVERY_LEAD', '')];
  const all = ['V2_CURRENT_POPULATION title', 'COUNTS: TOTAL=0 UNACCOUNTED=0', '=== SCOUT_INTAKE (2) ===', rows[0], rows[4], '=== MANUAL_RESEARCH (1) ===', rows[1],
    '=== DECLINED_BY_TIM (1) ===', rows[2], '=== APPLIED (1) ===', rows[3], '=== DISCOVERY_LEAD (1) ===', rows[5], 'END V2_CURRENT_POPULATION_MASTER (6 rows)'];
  const counts = W.recomputeCountsLine(all); return all.map(l => /^COUNTS:/.test(l) ? counts : l);
}
/** Cut over on Oct 5 (row 3 archived), then rows close in the live master: 1 and 6 long enough ago, 2 just now. */
function liveWorld(t) {
  const p = W.planMasterMigration_(source(), { at: '2026-10-05T00:00:00Z', archiveId: 'A', companionId: 'C' });
  const closed = p.target.map(l => {
    if (/ \| V2F-REJ000000001 \| /.test(l)) return l.replace(' | SCOUT_INTAKE | ', ' | REJECTED_BY_EMPLOYER | ') + '; STATE_UPDATED_AT=' + OLD;
    if (/ \| V2F-DEC000000002 \| /.test(l)) return l.replace(' | MANUAL_RESEARCH | ', ' | DECLINED_BY_TIM | ') + '; STATE_UPDATED_AT=' + NOW;
    if (/ \| V2F-DEAD00000006 \| /.test(l)) return l.replace(' | DISCOVERY_LEAD | ', ' | CLOSED_DEAD | ');
    return l;
  });
  const counts = W.recomputeCountsLine(closed), w = world(t, { rows: closed.map(l => /^COUNTS:/.test(l) ? counts : l) });
  const folder = global.DriveApp.getRootFolder();
  const a = folder.createFile('V2_TERMINAL_ARCHIVE.txt', p.archive.join('\n') + '\n'), c = folder.createFile('V2_EVIDENCE_COMPANION.jsonl', p.records.map(JSON.stringify).join('\n'));
  folder.createFile('PIPELINE_MIGRATION_STATE.json', JSON.stringify({ mode: 'LIVE', status: 'CUTOVER_COMPLETE', archiveId: a.getId(), companionId: c.getId() }));
  return w;
}
const pids = lines => lines.filter(l => /^\d+ \| /.test(l)).map(l => l.split(' | ')[1]);

test('plan is read-only: old terminal rows planned, recently closed rows wait for minAgeDays', t => {
  const w = liveWorld(t), before = w.master().join('\n');
  const r = w.post({ action: 'archive_sweep', op: 'plan' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.sample.map(x => x.primaryId).sort(), ['V2F-DEAD00000006', 'V2F-REJ000000001']);
  assert.equal(r.summary.skipped.young, 1); assert.equal(r.summary.minAgeDays, 7);
  assert.equal(w.masterSaves(), 0); assert.equal(w.master().join('\n'), before);
});

test('apply: archive first (narrative merged back), then a verified master write; dedupe, fail-closed rulings and the hydrated view all hold', t => {
  const w = liveWorld(t);
  const r = w.post({ action: 'archive_sweep', op: 'apply', requestId: 'SWEEP-1' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.moved, 2); assert.equal(r.archiveAppended, 2);
  const m = w.master();
  assert.deepEqual(pids(m).sort(), ['V2F-APP000000004', 'V2F-DEC000000002', 'V2F-LIVE00000005']);
  assert.match(m.find(l => /^COUNTS:/.test(l)), /TOTAL=3 /); assert.ok(m.includes('END V2_CURRENT_POPULATION_MASTER (3 rows)'));
  assert.ok(m.includes('=== SCOUT_INTAKE (1) ==='), 'heading shows the rows left under it');
  const arch = w.text('V2_TERMINAL_ARCHIVE.txt'), rej = arch.split('\n').find(l => / \| V2F-REJ000000001 \| /.test(l));
  assert.match(rej, /SCOUT_NOTES=found via target company/, 'companion narrative merged back'); assert.doesNotMatch(rej, /EVIDENCE_REF=/);
  assert.match(arch, /^SWEEP\|SWEEP-1\|/m);
  assert.equal(w.exec(() => W.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');
  assert.equal(w.index().requests['SWEEP-1'].s, 'COMPLETE');
  const hyd = w.exec(() => W.readMasterHydrated_('')).text.split('\n');
  assert.match(hyd.find(l => / \| V2F-REJ000000001 \| /.test(l)), /ARCHIVE_STATE=ARCHIVED_TERMINAL/);
  const ru = w.post({ action: 'batch', requests: [{ action: 'ruling', ruling: { primaryId: 'V2F-REJ000000001', kind: 'ENRICH', actor: 'FORGE', requestId: 'R-1', fields: { SCOPE_FIT_RAW: '70' } } }] });
  assert.equal(ru.results[0].mode, 'ARCHIVED_ROW');
  const intake = w.post({ action: 'intake', run: { SCOUT_RUN_ID: 'RUN-S' }, records: [{ COMPANY: 'Acme 6', TITLE: 'Director of Quality', LOCATION: 'Austin, TX', REQ_ID: 'REQ-6', SOURCE_URL: 'https://example.com/6' }] });
  assert.equal(intake.results[0].result, 'EXISTING_MATCH', JSON.stringify(intake.results));
  assert.equal(w.post({ action: 'archive_sweep', op: 'apply', requestId: 'SWEEP-1' }).ok, true, 'nothing left to move: no replay');
});

test('archive appended but the master save failed: the row reads as live, and the next sweep finishes it without a second copy', t => {
  const w = liveWorld(t); w.fail('1My9QYVPBblw8c7vFMFxGOAqgTSuH9gS8', 'write', { message: 'Service error: Drive' });
  assert.throws(() => w.post({ action: 'archive_sweep', op: 'apply', requestId: 'SWEEP-F' }), /Service error/);
  assert.equal(pids(w.master()).length, 5, 'master unchanged');
  w.advance(200000); w.exec(() => W.verifyPendingWrites_());
  const r = w.post({ action: 'archive_sweep', op: 'apply', requestId: 'SWEEP-G' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.archiveAppended, 0); assert.equal(r.moved, 2);
  assert.equal(w.text('V2_TERMINAL_ARCHIVE.txt').split('\n').filter(l => / \| V2F-REJ000000001 \| /.test(l)).length, 1);
});

test('restore then close again: the row is swept back in and visible in the archive (Writer and app parse the same way)', t => {
  const w = liveWorld(t);
  w.post({ action: 'archive_sweep', op: 'apply', requestId: 'SWEEP-1' }); w.exec(() => W.verifyPendingWrites_());
  assert.equal(w.post({ action: 'restore_archived', primaryId: 'V2F-DEAD00000006', actor: 'TIM' }).ok, true); w.exec(() => W.verifyPendingWrites_());
  const visible = text => pids(W.parseArchive_(text)).filter(p => p === 'V2F-DEAD00000006').length;
  assert.equal(visible(w.text('V2_TERMINAL_ARCHIVE.txt')), 0, 'restored row hidden');
  const r = w.post({ action: 'archive_sweep', op: 'apply', requestId: 'SWEEP-2' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.moved, 1);
  const arch = w.text('V2_TERMINAL_ARCHIVE.txt');
  assert.equal(visible(arch), 1); assert.equal(pids(Loader.parseArchive_(arch)).filter(p => p === 'V2F-DEAD00000006').length, 1);
  assert.equal(W.parseArchive_(arch).length, Loader.parseArchive_(arch).length);
});

test('transactions: only archive_sweep may remove rows, and only the rows it names', () => {
  const h = s => 'h' + s.length, b = ['COUNTS: TOTAL=2', '1 | P-1 | a', '2 | P-2 | b', 'END V2_CURRENT_POPULATION_MASTER (2 rows)'], a = ['COUNTS: TOTAL=1', '2 | P-2 | b', 'END V2_CURRENT_POPULATION_MASTER (1 rows)'];
  assert.throws(() => T.intent(b, a, { action: 'ruling', requestId: 'X' }, NOW, h, 'M', 'B'), /TRANSACTION_DELETE_FORBIDDEN: P-1/);
  assert.throws(() => T.intent(b, a, { action: 'archive_sweep', requestId: 'X', archiveMove: { 'P-9': true } }, NOW, h, 'M', 'B'), /TRANSACTION_DELETE_FORBIDDEN: P-1/);
  const ok = T.intent(b, a, { action: 'archive_sweep', requestId: 'X', archiveMove: { 'P-1': true } }, NOW, h, 'M', 'B');
  assert.deepEqual(ok.items.map(x => [x.pid, x.op, x.a]), [['P-1', 'ARCHIVE_MOVE', '']]);
  assert.equal(W.classifyPendingWrite_(Object.assign({}, ok, { counts: W.textHash_('COUNTS: TOTAL=1'), end: '', afterHash: '' }), a, Date.parse(NOW), 0).decision, 'COMPLETE');
});

test('archive_sweep is not allowed inside a batch', t => {
  const w = liveWorld(t);
  const r = w.post({ action: 'batch', requests: [{ action: 'archive_sweep', op: 'apply' }] });
  assert.equal(r.mode, 'REJECTED_SCHEMA');
});
