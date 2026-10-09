// Option A (Tim, 2026-10-05): terminal archive + evidence companion. The canonical master keeps every live row and every
// decision-driving field; narrative moves to V2_EVIDENCE_COMPANION.jsonl keyed by PRIMARY_ID; terminal rows move verbatim to
// V2_TERMINAL_ARCHIVE.txt. Docs edits persist only at execution end (and can fail), exactly like production.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const MASTER = '1My9QYVPBblw8c7vFMFxGOAqgTSuH9gS8', DOCMIME = 'application/vnd.google-apps.document';

const row = (n, id, bucket, extra) => n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | ' + bucket + ' | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SCOUT_ACTION; SOURCE_URL=https://example.com/' + n + '; FLEX_CLASS=HIGH_FLEX' + (extra || '');
function masterFixture() {
  const rows = [
    row(1, 'V2F-LIVE00000001', 'SCOUT_INTAKE', '; SCOUT_NOTES=found via target company; FIT_EVIDENCE=Leads plant quality; SCOPE_FIT_RAW=83; FIT_CONF=MED'),
    row(2, 'V2F-LIVE00000002', 'MANUAL_RESEARCH', '; CLAUDE_REVIEW_NOTE=Raw fit ~68; RESEARCH_REQUEST=check pay; SALARY_BASE_EST=180000; SALARY_NOTE=two anchors'),
    row(3, 'V2F-DECL00000003', 'DECLINED_BY_TIM', '; DECLINE_REASON_CODE=PAY_BELOW_FLOOR; SCOUT_NOTES=old note'),
    row(4, 'V2F-APPL00000004', 'APPLIED', '; APP_STATUS_EVIDENCE=Gmail 123; APP_DATE=2026-09-01'),
    row(5, 'V2F-DEAD00000005', 'CLOSED_DEAD', ''),
    row(6, 'V2F-PLAIN0000006', 'DISCOVERY_LEAD', '')];
  const L = ['V2_CURRENT_POPULATION title', 'BUCKET_AUTHORITY note', rows.length ? 'COUNTS: TOTAL=0 UNACCOUNTED=0' : '', 'COLUMNS: INV | PRIMARY_ID', '================================================================'];
  const body = ['=== SCOUT_INTAKE (1) ===', rows[0], '', '=== MANUAL_RESEARCH (1) ===', rows[1], '=== DECLINED_BY_TIM (1) ===', rows[2], '=== APPLIED (1) ===', rows[3], '=== CLOSED_DEAD (1) ===', rows[4], '=== DISCOVERY_LEAD (1) ===', rows[5], 'END V2_CURRENT_POPULATION_MASTER (6 rows)'];
  const all = L.concat(body);
  const counts = W.recomputeCountsLine(all);
  return all.map(l => /^COUNTS:/.test(l) ? counts : l);
}

function world(lines) {
  const f = require('./helpers/writer-world').world(null, {rows:lines});
  return Object.assign(f,{rowOf:f.row,byName:n=>f.files.has(n)?[f.files.get(n)]:[]});
}
const enrich = (rid, pid, fields) => ({ action: 'ruling', ruling: { primaryId: pid, kind: 'ENRICH', actor: 'FORGE', requestId: rid, fields } });
const runToEnd = (w, max) => { let r; for (let i = 0; i < (max || 40); i++) { r = w.post({ action: 'migration', op: 'step' }); if (r.done || (!r.ok && r.mode !== 'WAIT')) return r; } return r; };

test('field split: decision-driving fields stay inline, narrative moves (incl. future *_NOTE / *_ANALYSIS keys)', () => {
  for (const k of ['SCOPE_FIT_RAW', 'FIT_CONF', 'FLEX_CLASS', 'FLEX_MODIFIER', 'FLEX_BASIS', 'SALARY_BASE_EST', 'SALARY_BASIS', 'SALARY_CONF', 'DEGREE_TEXT', 'DEGREE_REQ', 'LIVENESS', 'SOURCE_URL', 'DEGREE_EVIDENCE_URL',
    'PROPOSED_DISPOSITION', 'APP_STATUS_EVIDENCE', 'REJECTION_EVIDENCE', 'TIM_NOTE', 'NOTE', 'RESEARCH_REQUEST', 'DECLINE_REASON_TEXT', 'NEVER_CONSIDER_REASON', 'EVIDENCE_REF', 'ADJUSTED_FIT', 'PURSUIT_STATUS'])
    assert.equal(W.isEvidenceKey_(k), false, k);
  for (const k of ['SCOUT_NOTES', 'FIT_EVIDENCE', 'FIT_BASIS', 'CLAUDE_REVIEW_NOTE', 'SALARY_NOTE', 'LIVENESS_NOTE', 'GROK_FIT_EVIDENCE', 'FORGE_SCOPE_ANALYSIS', 'NEW_THING_NOTE'])
    assert.equal(W.isEvidenceKey_(k), true, k);
  assert.equal(W.EVIDENCE_KEYS.length, 78);
});

test('plan: terminal rows archived verbatim, live narrative split losslessly, counts reconciled, contract line added', () => {
  const src = masterFixture(), p = W.planMasterMigration_(src, { at: '2026-10-05T00:00:00Z', archiveId: 'A', companionId: 'C' });
  assert.equal(p.reconciliation.ok, true, JSON.stringify(p.reconciliation.problems));
  assert.equal(p.reconciliation.sourceRows, 6);assert.equal(p.reconciliation.liveRows, 4);assert.equal(p.reconciliation.archivedRows, 2);
  assert.deepEqual(p.archive, [src[11], src[15]], 'DECLINED and CLOSED_DEAD rows, byte-identical');
  const r1 = p.target.find(l => l.split(' | ')[1] === 'V2F-LIVE00000001');
  assert.match(r1, /SCOPE_FIT_RAW=83; FIT_CONF=MED; EVIDENCE_REF=EVC1:1$/);assert.doesNotMatch(r1, /SCOUT_NOTES|FIT_EVIDENCE/);
  assert.equal(p.target.find(l => l.split(' | ')[1] === 'V2F-APPL00000004'), src[13], 'APPLIED stays live and untouched');
  assert.equal(p.target.find(l => l.split(' | ')[1] === 'V2F-PLAIN0000006'), src[17], 'rows without narrative are untouched');
  assert.match(p.counts, /TOTAL=4 .*UNACCOUNTED=0/);assert.match(p.end, /\(4 rows\)/);
  assert.ok(p.target.indexOf(p.contract) >= 0 && p.target.indexOf(p.contract) < p.target.findIndex(l => /^COUNTS:/.test(l)));
  assert.deepEqual(p.records.map(r => r.pid), ['V2F-LIVE00000001', 'V2F-LIVE00000002']);
});

test('plan fails closed on a duplicate live PRIMARY_ID (companion keys must be unique)', () => {
  const src = masterFixture(); src.splice(13, 0, row(9, 'V2F-LIVE00000001', 'SCOUT_INTAKE', '; SCOUT_NOTES=dup'));
  const p = W.planMasterMigration_(src, {});
  assert.equal(p.reconciliation.ok, false);assert.ok(p.reconciliation.problems.some(x => /not unique among live rows/.test(x)));
});

test('companion chain: newer records override, off-chain (unpersisted) records are ignored, broken chains never resolve', () => {
  const recs = [{ pid: 'P', v: 1, base: 0, f: { A: '1', B: '1' } }, { pid: 'P', v: 2, base: 1, f: { B: '2' } }, { pid: 'P', v: 3, base: 2, f: { B: 'orphan' } }, { pid: 'Q', v: 2, base: 1, f: { A: 'x' } }];
  assert.deepEqual(W.resolveEvidence_(recs, 'P', 2), { A: '1', B: '2' }, 'master points at v2: v3 (a write that never persisted) is ignored');
  assert.deepEqual(W.resolveEvidence_(recs, 'P', 3), { A: '1', B: 'orphan' });
  assert.equal(W.resolveEvidence_(recs, 'Q', 2), null);
  assert.throws(() => W.parseCompanion_('{"type":"HEADER"}\n{bad'), /fail closed/);
});

test('hydrated view reproduces every source row exactly and the original COUNTS line', () => {
  const src = masterFixture(), p = W.planMasterMigration_(src, {}), h = W.hydrateLines_(p.target, p.archive, p.records);
  const P = l => { const c = l.split(' | '); const m = W.parsePayload(c.slice(9).join(' | ')).payload; delete m.EVIDENCE_REF; delete m.ARCHIVE_STATE; return { f: c.slice(0, 9).join(' | '), m }; };
  const srcRows = src.filter(l => /^\d+ \| /.test(l)), hRows = h.filter(l => /^\d+ \| /.test(l));
  assert.equal(hRows.length, srcRows.length);
  for (const s of srcRows) { const k = s.split(' | ')[1], hh = hRows.find(l => l.split(' | ')[1] === k); assert.deepEqual(P(hh), P(s), k); }
  assert.equal(h.find(l => /^COUNTS:/.test(l)), src.find(l => /^COUNTS:/.test(l)));
  assert.ok(h.some(l => l === '=== DECLINED_BY_TIM (1) ==='), 'archived rows sit under their own bucket heading');
});

test('retired Doc migration cannot create copies, replay old chunks or mutate the text master', () => {
  const w=world(masterFixture()),before=w.master();
  for(const op of ['prepare','step','verify'])assert.equal(w.post({action:'migration',op}).mode,'RETIRED_MIGRATION');
  assert.deepEqual(w.master(),before);assert.equal(w.masterSaves(),0);w.restore();
});

test('freeze protects text master writes independently of retired migration', () => {
  const w=world(masterFixture());w.post({action:'freeze_writer',reason:'maintenance'});
  assert.equal(w.post(enrich('FROZEN','V2F-LIVE00000001',{SCOPE_FIT_RAW:'90'})).mode,'WRITE_FENCE');
  assert.equal(w.masterSaves(),0);w.restore();
});

/** A world already cut over (LIVE) and unfrozen. */
function cutWorld() {
  const p=W.planMasterMigration_(masterFixture(),{at:'2026-10-05T00:00:00Z',archiveId:'ARCHIVE',companionId:'COMPANION'}),w=world(p.target);
  const folder=global.DriveApp.getRootFolder();
  const archive=folder.createFile('V2_TERMINAL_ARCHIVE.txt',p.archive.join('\n'));
  const companion=folder.createFile('V2_EVIDENCE_COMPANION.jsonl',p.records.map(JSON.stringify).join('\n'));
  folder.createFile('PIPELINE_MIGRATION_STATE.json',JSON.stringify({mode:'LIVE',status:'CUTOVER_COMPLETE',archiveId:archive.getId(),companionId:companion.getId()}));
  return w;
}

test('after cutover, new narrative is routed to the companion (master cannot regrow); verification still decides COMPLETE', () => {
  const w = cutWorld();
  const r = w.post({ action: 'batch', requests: [enrich('E-1', 'V2F-LIVE00000001', { SCOPE_FIT_RAW: '88', FIT_CONF: 'HIGH', FIT_EVIDENCE: 'New evidence text' })] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const live = w.rowOf('V2F-LIVE00000001');
  assert.match(live, /SCOPE_FIT_RAW=88/);assert.match(live, /FIT_CONF=HIGH/);assert.doesNotMatch(live, /New evidence text/);assert.match(live, /EVIDENCE_REF=EVC1:2/);
  const st = w.exec(() => W.verifyPendingWrites_());assert.equal(st.decided[0].decision, 'COMPLETE');
  const hyd = w.exec(() => W.readMasterHydrated_(''));
  const h = hyd.text.split('\n').find(l => l.split(' | ')[1] === 'V2F-LIVE00000001');
  assert.match(h, /FIT_EVIDENCE=New evidence text/, 'newest evidence wins');assert.match(h, /SCOUT_NOTES=found via target company/, 'older evidence kept');
  w.restore();
});

test('archive is still dedupe history: an intake of an archived declined job is EXISTING_MATCH, not a new row', () => {
  const w = cutWorld(), n0 = w.master().filter(l => /^\d+ \| /.test(l)).length;
  const r = w.post({ action: 'intake', run: { SCOUT_RUN_ID: 'RUN-X' }, records: [{ COMPANY: 'Acme 3', TITLE: 'Director of Quality', LOCATION: 'Austin, TX', REQ_ID: 'REQ-3', SOURCE_URL: 'https://example.com/3' }] });
  assert.equal(r.results[0].result, 'EXISTING_MATCH', JSON.stringify(r.results));assert.equal(r.results[0].PRIMARY_ID, 'V2F-DECL00000003');
  assert.equal(w.master().filter(l => /^\d+ \| /.test(l)).length, n0);
  w.restore();
});

test('rulings on archived rows fail closed; restore_archived moves the row back (verified) and rulings work again', () => {
  const w = cutWorld();
  const r = w.post({ action: 'batch', requests: [enrich('R-1', 'V2F-DECL00000003', { SCOPE_FIT_RAW: '70' })] });
  assert.equal(r.results[0].mode, 'ARCHIVED_ROW');
  const rs = w.post({ action: 'restore_archived', primaryId: 'V2F-DECL00000003', actor: 'TIM' });
  assert.equal(rs.ok, true, JSON.stringify(rs));
  const back = w.rowOf('V2F-DECL00000003');assert.ok(back, 'restored');assert.doesNotMatch(back, /SCOUT_NOTES=/, 'its narrative routed to the companion');
  assert.equal(w.exec(() => W.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');
  assert.match(w.text('V2_TERMINAL_ARCHIVE.txt'), /RESTORED\|V2F-DECL00000003\|3\|/);
  assert.equal(w.post({ action: 'batch', requests: [enrich('R-2', 'V2F-DECL00000003', { SCOPE_FIT_RAW: '70' })] }).results[0].mode, 'BATCH_RULING');
  w.restore();
});

test('upsert matching an archived row holds instead of creating a duplicate', () => {
  const w = cutWorld();
  const r = w.post({ action: 'upsert_application', event: { COMPANY: 'Acme 5', TITLE: 'Director of Quality', LOCATION: 'Austin, TX', REQ_ID: 'REQ-5', STATE: 'REJECTED_BY_EMPLOYER', EVIDENCE: 'Gmail 99', SOURCE_URL: 'https://example.com/5' } });
  assert.equal(r.ok, false);assert.equal(r.mode, 'HOLD');assert.match(r.error, /ARCHIVED_MATCH/);
  w.restore();
});

test('Scout run telemetry: PENDING at write, then the verifier\'s verdict (COMPLETE or FAILED/MASTER_NOT_PERSISTED)', () => {
  const recs = [
    { SCOUT_RUN_ID: 'R1', WRITE_ID: 'W1', WRITE_STATUS: 'PENDING', RESULTS: [{ result: 'SCOUT_INTAKE_WRITTEN', WRITE_STATUS: 'PENDING' }, { result: 'EXISTING_MATCH', WRITE_STATUS: 'NOT_WRITTEN' }] },
    { SCOUT_RUN_ID: 'R2', WRITE_ID: 'W2', WRITE_STATUS: 'PENDING', RESULTS: [{ result: 'SCOUT_INTAKE_WRITTEN', WRITE_STATUS: 'PENDING' }] },
    { RECORD_TYPE: 'WRITE_VERIFICATION', SCOUT_RUN_ID: 'R1', WRITE_ID: 'W1', WRITE_STATUS: 'COMPLETE', VERIFIED_AT: 't' },
    { RECORD_TYPE: 'WRITE_VERIFICATION', SCOUT_RUN_ID: 'R2', WRITE_ID: 'W2', WRITE_STATUS: 'FAILED/MASTER_NOT_PERSISTED', VERIFIED_AT: 't' }];
  const f = W.foldRunVerifications_(recs);
  assert.equal(f.length, 2);
  assert.equal(f[0].WRITE_STATUS, 'COMPLETE');assert.deepEqual(f[0].RESULTS.map(r => r.WRITE_STATUS), ['COMPLETE', 'NOT_WRITTEN']);
  assert.equal(f[1].WRITE_STATUS, 'FAILED/MASTER_NOT_PERSISTED');assert.equal(f[1].WRITE_VERIFIED, 'NO');
});

test('Scout run telemetry end to end: intake records PENDING; the next execution\'s verifier folds in COMPLETE', () => {
  const w = cutWorld();
  const r = w.post({ action: 'intake', run: { SCOUT_RUN_ID: 'RUN-TEL' }, records: [{ COMPANY: 'Newco', TITLE: 'Plant Manager', LOCATION: 'Austin, TX', REQ_ID: 'REQ-77777', SOURCE_URL: 'https://example.com/77777', SCOUT_NOTES: 'target company hit' }] });
  assert.equal(r.verification, 'PENDING');assert.equal(r.WRITE_VERIFIED, false);
  let runs = w.exec(() => W.readRuns_()), run = runs.find(x => x.SCOUT_RUN_ID === 'RUN-TEL');
  assert.equal(run.WRITE_STATUS, 'PENDING');assert.equal(run.RESULTS[0].WRITE_STATUS, 'PENDING');
  const newRow = w.master().find(l => / \| Newco \| /.test(l));assert.doesNotMatch(newRow, /SCOUT_NOTES/, 'intake narrative routed to the companion');assert.match(newRow, /EVIDENCE_REF=EVC1:1/);
  w.exec(() => W.verifyPendingWrites_());
  run = w.exec(() => W.readRuns_()).find(x => x.SCOUT_RUN_ID === 'RUN-TEL');
  assert.equal(run.WRITE_STATUS, 'COMPLETE');assert.equal(run.RESULTS[0].WRITE_STATUS, 'COMPLETE');
  w.restore();
});

test('archive and companion reads fail closed when metadata is invalid; no canonical write', () => {
  const w=cutWorld();w.files.get('PIPELINE_MIGRATION_STATE.json').content='{invalid';
  assert.throws(()=>w.post(enrich('INVALID-META','V2F-LIVE00000001',{FIT_EVIDENCE:'Preserve source'})),/migration state unreadable/);
  assert.equal(w.masterSaves(),0);w.restore();
});
