'use strict';
// REV-135: V2_EVIDENCE_COMPANION.jsonl lost every record written 2026-10-05..14 (oldest surviving: 2026-10-15T00:35Z), so
// rows whose chain points into that window no longer resolve. Repair appends one new head record per broken row (Oct 5
// pre-split snapshot + surviving records + a recovery note), then one verified master write moves EVIDENCE_REF.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const { world } = require('./helpers/writer-world');
const row = (n, id, bucket, extra) => n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | ' + bucket + ' | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SCOUT_ACTION; SOURCE_URL=https://example.com/' + n + '; FLEX_CLASS=HIGH_FLEX' + (extra || '');
const REJ = 'V2F-REJ000000001', LIVE = 'V2F-LIVE00000005', NEW = 'V2F-NEW000000007', OK = 'V2F-OK0000000008';
function frame(rows) { const all = ['V2_CURRENT_POPULATION title', 'COUNTS: TOTAL=0 UNACCOUNTED=0', '=== SCOUT_INTAKE (' + rows.length + ') ===', ...rows, 'END V2_CURRENT_POPULATION_MASTER (' + rows.length + ' rows)']; const c = W.recomputeCountsLine(all); return all.map(l => /^COUNTS:/.test(l) ? c : l); }
const preSplit = frame([row(1, REJ, 'SCOUT_INTAKE', '; SCOUT_NOTES=found via target company; SCOPE_FIT_RAW=83'), row(5, LIVE, 'SCOUT_INTAKE', ''), row(8, OK, 'SCOUT_INTAKE', '; SCOUT_NOTES=ok row')]);
const live = frame([
  row(1, REJ, 'SCOUT_INTAKE', '; SCOPE_FIT_RAW=83; EVIDENCE_REF=EVC1:1'),                    // its chain pointed into the lost window
  row(5, LIVE, 'SCOUT_INTAKE', ''),
  row(7, NEW, 'SCOUT_INTAKE', '; EVIDENCE_REF=EVC1:2'),                                       // created after the split, every record lost
  row(8, OK, 'SCOUT_INTAKE', '; EVIDENCE_REF=EVC1:1')]);                                      // a chain that still resolves
const companion = [{ pid: REJ, v: 1, base: 1, ts: '2026-10-15T00:35:19Z', src: 'EXPLORER:X', f: { CLAUDE_ENRICH_NOTE: 'later note' } },
  { pid: OK, v: 1, base: 0, ts: '2026-10-16T00:00:00Z', src: 'INTAKE:Y', f: { SCOUT_NOTES: 'ok row' } }];
function liveWorld(t, opts = {}) {
  const w = world(t, { rows: live });
  const folder = global.DriveApp.getRootFolder(), snapText = preSplit.join('\n');
  const snap = folder.createFile('V2_MASTER_PRE_MIGRATION_X.txt', snapText), c = folder.createFile('V2_EVIDENCE_COMPANION.jsonl', companion.map(JSON.stringify).join('\n') + '\n');
  const a = folder.createFile('V2_TERMINAL_ARCHIVE.txt', '');
  folder.createFile('PIPELINE_MIGRATION_STATE.json', JSON.stringify({ mode: 'LIVE', status: 'CUTOVER_COMPLETE', archiveId: a.getId(), companionId: c.getId(),
    rollback: { textSnapshotId: snap.getId(), textSnapshotHash: opts.badHash ? 'x:1' : W.textHash_(snapText) } }));
  return { w, cid: c.getId() };
}
const recs = (w, cid) => w.text(cid).split('\n').filter(Boolean).map(JSON.parse);
const ref = (w, pid) => (w.row(pid).match(/EVIDENCE_REF=EVC1:(\d+)/) || [])[1];

test('plan is read-only and finds only the rows whose chain no longer resolves', t => {
  const { w, cid } = liveWorld(t), before = w.master().join('\n'), cBefore = w.text(cid);
  const r = w.post({ action: 'evidence_repair', op: 'plan' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.sample.map(x => x.primaryId).sort(), [NEW, REJ]);
  assert.deepEqual(r.summary.counts, { broken: 2, withOct5: 1, withoutOct5: 1, survivingRecords: 1, emptyRebuild: 1 });
  assert.equal(w.masterSaves(), 0); assert.equal(w.master().join('\n'), before); assert.equal(w.text(cid), cBefore);
  assert.equal(w.post({ action: 'batch', requests: [{ action: 'evidence_repair' }] }).mode, 'REJECTED_SCHEMA');
});

test('apply: append-only new head records, one verified master write, chains resolve, archive sweep can then hydrate', t => {
  const { w, cid } = liveWorld(t), cBefore = w.text(cid);
  const r = w.post({ action: 'evidence_repair', op: 'apply', requestId: 'EVR-1' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.repaired, 2);
  assert.ok(w.text(cid).startsWith(cBefore.trimEnd()), 'existing records untouched');
  const all = recs(w, cid), head = all.find(x => x.pid === REJ && x.src === 'EVIDENCE_REPAIR:EVR-1');
  assert.equal(head.v, 2); assert.equal(head.base, 0);
  assert.equal(head.f.SCOUT_NOTES, 'found via target company', 'Oct 5 snapshot evidence');
  assert.equal(head.f.CLAUDE_ENRICH_NOTE, 'later note', 'surviving record overlaid');
  assert.match(head.f.EVIDENCE_RECOVERY_NOTE, /2026-10-05\.\.2026-10-14 was lost/);
  assert.equal(ref(w, REJ), '2'); assert.equal(ref(w, OK), '1', 'a resolving chain is left alone');
  assert.equal(ref(w, NEW), '1'); assert.match(all.find(x => x.pid === NEW).f.EVIDENCE_RECOVERY_NOTE, /no 2026-10-05 snapshot row/);
  const stripped = l => l.replace(/; EVIDENCE_REF=EVC1:\d+/, '');
  assert.equal(stripped(w.row(REJ)), stripped(live.find(l => l.includes(REJ))), 'only EVIDENCE_REF changed');
  assert.equal(w.exec(() => W.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');
  assert.equal(w.index().requests['EVR-1'].s, 'COMPLETE');
  const after = w.post({ action: 'evidence_repair', op: 'plan' });
  assert.equal(after.summary.repairs, 0, 'nothing left broken');
  const ev = W.resolveEvidence_(recs(w, cid), REJ, 2); assert.equal(ev.SCOUT_NOTES, 'found via target company');
});

test('a snapshot that does not match the migration record is refused; nothing written', t => {
  const { w, cid } = liveWorld(t, { badHash: true }), cBefore = w.text(cid);
  const r = w.post({ action: 'evidence_repair', op: 'apply' });
  assert.equal(r.ok, false); assert.match(r.error, /snapshot hash/);
  assert.equal(w.masterSaves(), 0); assert.equal(w.text(cid), cBefore);
});
