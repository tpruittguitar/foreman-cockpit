// Batched upsert_application: Tim's standing rule (2026-10-11) that every job he applied to or was rejected from is part
// of the record. Up to 25 events plan against one working copy and commit once; each event keeps single-event rules.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const WT = require('../apps-script/WriterTransactions.gs');
const G = require('./gen_population.js');

const now = '2026-10-11T23:00:00.000Z';
const lines = G.generate(300, 7).split('\n');
const rows = lines.filter(l => /^\d+ \| /.test(l));
const rowsOf = (ls, id) => ls.filter(l => /^\d+ \| /.test(l) && l.split(' | ')[1].trim() === id);
const newJob = (n, state, extra) => Object.assign({ SOURCE_URL: 'https://mail.google.com/mail/u/0/#all/msg' + n, COMPANY: 'Zyxwv Novel Co ' + n, TITLE: 'Director of Manufacturing ' + n, STATE: state, EVENT_DATE: '2026-09-0' + ((n % 9) + 1), EVIDENCE: 'Gmail msg' + n + ' "Thanks for applying"', LOCATION: 'Wichita, KS' }, extra || {});

test('jobs with no master row are inserted as protected rows, in one plan', () => {
  const p = W.planUpsertBatch_(lines, [], [newJob(1, 'APPLIED'), newJob(2, 'REJECTED')], { now });
  assert.equal(p.ok, true);
  assert.deepEqual([p.counts.created, p.counts.updated, p.counts.held, p.counts.written], [2, 0, 0, 2]);
  const made = p.results.map(r => rowsOf(p.work, r.primaryId));
  assert.ok(made.every(m => m.length === 1));
  assert.equal(made[0][0].split(' | ')[4], 'APPLIED');
  assert.equal(made[1][0].split(' | ')[4], 'REJECTED_BY_EMPLOYER');
  assert.ok(made.every(m => /ANTI_RESURRECTION=YES/.test(m[0])), 'history rows cannot resurface as new');
  assert.equal(p.work.length, lines.length + 2);
  // inserted before the END marker, so the trailer stays last
  const endAt = p.work.findIndex(l => /^END V2_CURRENT_POPULATION_MASTER/.test(l));
  assert.ok(endAt < 0 || p.work.slice(endAt + 1).every(l => !/^\d+ \| /.test(l)));
});

test('an application and its later rejection in the same batch land on ONE row', () => {
  const p = W.planUpsertBatch_(lines, [], [newJob(5, 'APPLIED'), newJob(5, 'REJECTED_BY_EMPLOYER', { EVIDENCE: 'Gmail msg5b "update"' })], { now });
  assert.deepEqual([p.counts.created, p.counts.updated], [1, 1]);
  assert.equal(p.results[0].primaryId, p.results[1].primaryId);
  const row = rowsOf(p.work, p.results[0].primaryId);
  assert.equal(row.length, 1);
  assert.equal(row[0].split(' | ')[4], 'REJECTED_BY_EMPLOYER');
  assert.deepEqual(p.touched, [p.results[0].primaryId]);
});

test('an existing row is updated in place by TARGET_PRIMARY_ID', () => {
  const target = rows.find(l => ['READY_TO_PURSUE', 'SCOUT_INTAKE', 'DISCOVERY_LEAD', 'MANUAL_RESEARCH'].includes(l.split(' | ')[4]));
  const pid = target.split(' | ')[1].trim();
  const p = W.planUpsertBatch_(lines, [], [{ TARGET_PRIMARY_ID: pid, STATE: 'REJECTED', EVIDENCE: 'Gmail t1', EVENT_DATE: '2026-10-01' }], { now });
  assert.equal(p.results[0].mode, 'UPDATE');
  assert.equal(rowsOf(p.work, pid)[0].split(' | ')[4], 'REJECTED_BY_EMPLOYER');
  assert.equal(p.work.length, lines.length);
});

test('a bad or ambiguous event holds only itself; the rest still commit', () => {
  const amb = rows.map(l => l.split(' | ')).find(a => rows.filter(l => { const b = l.split(' | '); return W.normEmployer(b[2]) === W.normEmployer(a[2]) && W.normTitle(b[3]) === W.normTitle(a[3]); }).length > 1);
  const events = [newJob(7, 'APPLIED'), { COMPANY: 'A', TITLE: 'B', STATE: 'APPLIED' }, 'not an object', newJob(8, 'APPLIED', { SOURCE_URL: '' })];
  if (amb) events.push({ COMPANY: amb[2], TITLE: amb[3], STATE: 'APPLIED', EVIDENCE: 'Gmail amb' });
  const p = W.planUpsertBatch_(lines, [], events, { now });
  assert.equal(p.ok, true);
  assert.equal(p.counts.created, 1);
  assert.equal(p.results[1].mode, 'INVALID');           // no evidence
  assert.equal(p.results[2].mode, 'INVALID');           // not an object
  assert.equal(p.results[3].mode, 'HOLD');              // a new row needs a source link
  assert.match(p.results[3].error, /SOURCE_URL_REQUIRED/);
  if (amb) { assert.equal(p.results[4].mode, 'HOLD'); assert.ok(p.results[4].possibleMatches.length > 1); }
  assert.equal(p.counts.held, events.length - 1);
});

test('replaying a batch writes nothing (UPSERT_KEY idempotence)', () => {
  const first = W.planUpsertBatch_(lines, [], [newJob(11, 'APPLIED'), newJob(12, 'REJECTED')], { now });
  const again = W.planUpsertBatch_(first.work, [], [newJob(11, 'APPLIED'), newJob(12, 'REJECTED')], { now });
  assert.deepEqual([again.counts.alreadyRecorded, again.counts.written], [2, 0]);
  assert.deepEqual(again.work, first.work);
});

test('a match against an archived terminal row is held, never silently re-created', () => {
  const live = lines.filter(l => !/ \| Zyxwv Archived Co \| /.test(l));
  const archivedRow = '9999 | V2X-ARCHIVED00001 | Zyxwv Archived Co | Director of Manufacturing | REJECTED_BY_EMPLOYER | RESOLVED/REJECTED_BY_EMPLOYER | - | R-1 | Wichita, KS | - | ANTI_RESURRECTION=YES';
  const p = W.planUpsertBatch_(live, [archivedRow], [{ TARGET_PRIMARY_ID: 'V2X-ARCHIVED00001', STATE: 'REJECTED_BY_EMPLOYER', EVIDENCE: 'Gmail arch' }], { now });
  assert.equal(p.results[0].mode, 'HOLD');
  assert.match(p.results[0].error, /ARCHIVED_MATCH/);
  assert.equal(p.counts.written, 0);
  // and a rejected row is never silently regressed to APPLIED by later evidence
  const back = W.planUpsertBatch_(live, [archivedRow], [{ TARGET_PRIMARY_ID: 'V2X-ARCHIVED00001', STATE: 'APPLIED', EVIDENCE: 'Gmail arch2' }], { now });
  assert.equal(back.results[0].ok, false);
  assert.match(back.results[0].error, /would regress/);
  assert.equal(back.counts.written, 0);
});

test('batch size is bounded and empty batches are rejected', () => {
  assert.equal(W.planUpsertBatch_(lines, [], [], { now }).mode, 'REJECTED_SCHEMA');
  assert.equal(W.planUpsertBatch_(lines, [], undefined, { now }).mode, 'REJECTED_SCHEMA');
  const big = Array.from({ length: W.UPSERT_BATCH_MAX + 1 }, (_, i) => newJob(100 + i, 'APPLIED'));
  assert.match(W.planUpsertBatch_(lines, [], big, { now }).error, /at most 25/);
});

test('the transaction records every event request ID, so a replayed batch is refused at commit', () => {
  const ids = WT.requestIds({ action: 'upsert_application', events: [{ requestId: 'G-1' }, { requestId: 'G-2' }, {}] });
  assert.deepEqual(ids, ['G-1', 'G-2']);
  assert.deepEqual(WT.requestIds({ action: 'upsert_application', event: { requestId: 'S-1' } }), ['S-1']);
});

test('dispatch routes events[] to the batch path and a single event to the old path', () => {
  const src = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  assert.ok(src.includes("if (a === 'upsert_application') { if (Array.isArray(req.events)) return applyUpsertBatchToMaster_(req); return applyUpsertToMaster_(req.event || req); }"));
});
