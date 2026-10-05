// Option A (Tim, 2026-10-05): terminal archive + evidence companion. The canonical master keeps every live row and every
// decision-driving field; narrative moves to V2_EVIDENCE_COMPANION.jsonl keyed by PRIMARY_ID; terminal rows move verbatim to
// V2_TERMINAL_ARCHIVE.txt. Docs edits persist only at execution end (and can fail), exactly like production.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const MASTER = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI', DOCMIME = 'application/vnd.google-apps.document';

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
  const docs = { [MASTER]: lines.slice() }, names = { [MASTER]: 'V2_CURRENT_POPULATION_MASTER.txt' }, texts = {}, files = {}; let next = 1, clock = Date.parse('2026-10-05T12:00:00Z');
  const byName = n => Object.values(files).filter(f => f.getName() === n);
  const textFile = (name, content) => { let v = content, n = name; const id = 'T' + (next++); const f = { getId: () => id, getMimeType: () => 'text/plain', getName: () => n, setName: x => { n = x; }, getBlob: () => ({ getDataAsString: () => v }), setContent: x => { v = x; }, getLastUpdated: () => new Date(clock), getParents: () => iter([folder]) }; files[id] = f; return f; };
  const docFile = id => ({ getId: () => id, getMimeType: () => DOCMIME, getName: () => names[id], setName: x => { names[id] = x; }, getLastUpdated: () => new Date('2026-10-04T20:00:00Z'), getParents: () => iter([folder]),
    makeCopy: (name) => { const nid = 'DOC' + (next++); docs[nid] = docs[id].slice(); names[nid] = name; files[nid] = docFile(nid); return files[nid]; } });
  const iter = l => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  const folder = { getId: () => 'FOLDER', getFilesByName: n => iter(byName(n)), createFile: (n, c) => textFile(n, c) };
  files[MASTER] = docFile(MASTER);
  textFile('PIPELINE_EVENT_LOG.jsonl', '\n');
  textFile('PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS', 'RECEIPT=RECEIPT_LOG_ROTATION\nEND RECEIPT_LOG_ROTATION\n');
  let cache = {}, saved = {}, saves = 0;
  const open = id => {
    if (!cache[id]) cache[id] = docs[id].slice();
    const work = cache[id];
    const paras = () => work.map((_, i) => { const p = { getText: () => work[work.indexOf(p._t) >= 0 ? work.indexOf(p._t) : i], setText: v => { const k = work.indexOf(p._t); work[k] = v; p._t = v; }, removeFromParent: () => { const k = work.indexOf(p._t); work.splice(k, 1); } }; p._t = work[i]; return p; });
    return { getBody: () => ({ getParagraphs: paras, getText: () => work.join('\n'), insertParagraph: (at, t) => { work.splice(at, 0, t); } }), saveAndClose: () => { saved[id] = true; saves++; } };
  };
  const crypto = require('crypto');
  global.Utilities = { sleep() {}, DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, str) => Array.from(crypto.createHash('sha256').update(String(str), 'utf8').digest()).map(x => x > 127 ? x - 256 : x),
    formatDate: () => '2026-10-05 08:00 ET' };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) };
  global.DriveApp = { getFileById: id => files[id] || (() => { throw new Error('no file ' + id); })(), getRootFolder: () => folder };
  global.DocumentApp = { openById: id => { if (!docs[id]) throw new Error('no doc ' + id); return open(id); } };
  global.MimeType = { PLAIN_TEXT: 'text/plain' };
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(clock); } static now() { return clock; } };
  const exec = (fn, o) => {
    W.resetExecution_(); cache = {}; saved = {};
    try { return fn(); } finally { if (!(o && o.flushFails)) Object.keys(cache).forEach(id => { if (saved[id]) docs[id] = cache[id]; }); cache = {}; }
  };
  const post = (body, o) => exec(() => W.dispatchWrite_(body), o);
  const text = n => (byName(n)[0] || { getBlob: () => ({ getDataAsString: () => '' }) }).getBlob().getDataAsString();
  return { exec, post, docs, files, byName, text, advance: ms => { clock += ms; }, restore: () => { global.Date = RealDate; }, saves: () => saves,
    master: () => docs[MASTER], rowOf: (id, d) => (d || docs[MASTER]).find(l => l.split(' | ')[1] === id) };
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

test('rehearsal on a copy: chunked, one write per execution, each chunk verified by the next; the canonical master is untouched', () => {
  const w = world(masterFixture()), before = w.master().slice();
  const prep = w.post({ action: 'migration', op: 'prepare', mode: 'REHEARSAL', removeChunk: 1, rewriteChunk: 1 });
  assert.equal(prep.ok, true, JSON.stringify(prep));assert.notEqual(prep.state.targetDocId, MASTER);
  const fin = runToEnd(w);
  assert.equal(fin.ok, true, JSON.stringify(fin));assert.equal(fin.state.status, 'REHEARSAL_COMPLETE');assert.equal(fin.state.final.matchesPlan, true);
  assert.deepEqual(w.master(), before, 'canonical master byte-identical');
  const copy = w.docs[prep.state.targetDocId];
  assert.equal(copy.filter(l => /^\d+ \| /.test(l)).length, 4);assert.match(copy.find(l => /^COUNTS:/.test(l)), /TOTAL=4 .*UNACCOUNTED=0/);
  const hyd = w.exec(() => W.readMasterHydrated_(prep.state.targetDocId));
  assert.equal(hyd.hydrated, true);assert.match(hyd.text, /SCOUT_NOTES=found via target company/);assert.match(hyd.text, /V2F-DECL00000003.*ARCHIVE_STATE=ARCHIVED_TERMINAL/);
  w.restore();
});

test('a chunk whose flush fails is detected by the next execution, waits, then is re-applied; nothing is double-applied', () => {
  const w = world(masterFixture());
  w.post({ action: 'migration', op: 'prepare', mode: 'REHEARSAL', removeChunk: 1, rewriteChunk: 2 });
  const first = w.post({ action: 'migration', op: 'step' }, { flushFails: true });
  assert.equal(first.applied, 0);
  w.advance(10000);
  assert.equal(w.post({ action: 'migration', op: 'step' }).mode, 'WAIT');
  w.advance(200000);
  const fin = runToEnd(w);
  assert.equal(fin.state.status, 'REHEARSAL_COMPLETE', JSON.stringify(fin));assert.equal(fin.state.final.matchesPlan, true);
  w.restore();
});

test('live cutover requires the freeze; frozen writes stay queued (WRITE_FENCE frozen)', () => {
  const w = world(masterFixture());
  assert.match(w.post({ action: 'migration', op: 'prepare', mode: 'LIVE' }).error, /freeze the Writer first/);
  w.post({ action: 'freeze_writer', reason: 'cutover', actor: 'CLAUDE' });
  const blocked = w.post({ action: 'batch', requests: [enrich('Z-1', 'V2F-LIVE00000001', { SCOPE_FIT_RAW: '90' })] });
  assert.equal(blocked.mode, 'WRITE_FENCE');assert.equal(blocked.frozen, true);
  const prep = w.post({ action: 'migration', op: 'prepare', mode: 'LIVE' });
  assert.equal(prep.ok, true, JSON.stringify(prep));assert.equal(prep.state.targetDocId, MASTER);
  assert.ok(prep.state.rollback.docCopyId && prep.state.rollback.textSnapshotId && prep.state.rollback.companionInitialId && prep.state.rollback.archiveInitialId, 'immutable rollback copies');
  assert.deepEqual(w.docs[prep.state.rollback.docCopyId], masterFixture(), 'rollback Doc copy is the pre-migration master');
  assert.equal(runToEnd(w).state.status, 'CUTOVER_COMPLETE');
  assert.equal(w.master().filter(l => /^\d+ \| /.test(l)).length, 4);
  w.restore();
});

/** A world already cut over (LIVE) and unfrozen. */
function cutWorld() {
  const w = world(masterFixture());
  w.post({ action: 'freeze_writer', reason: 'cutover' });
  w.post({ action: 'migration', op: 'prepare', mode: 'LIVE' });
  runToEnd(w);
  w.post({ action: 'unfreeze_writer' });
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

test('mid-migration (frozen, partly migrated) the hydrated view is still complete and exact', () => {
  const w = world(masterFixture());
  w.post({ action: 'freeze_writer', reason: 'cutover' });
  w.post({ action: 'migration', op: 'prepare', mode: 'LIVE', removeChunk: 1, rewriteChunk: 1 });
  w.post({ action: 'migration', op: 'step' }); w.post({ action: 'migration', op: 'step' }); w.post({ action: 'migration', op: 'step' });
  assert.equal(w.master().filter(l => /^\d+ \| /.test(l)).length, 4, 'both terminal rows already removed');
  const h = w.exec(() => W.readMasterHydrated_('')), rows = h.text.split('\n').filter(l => /^\d+ \| /.test(l));
  assert.equal(h.hydrated, true);assert.equal(rows.length, 6);assert.match(h.text, /COUNTS: TOTAL=6 /);
  assert.equal(rows.filter(l => /SCOUT_NOTES=found via target company/.test(l)).length, 1, 'no duplicated evidence whether or not a row is rewritten yet');
  w.restore();
});
