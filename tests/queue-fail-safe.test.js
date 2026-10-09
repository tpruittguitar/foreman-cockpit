// Queue fail-safe: every claimed request reaches a visible terminal state, malformed batches are rejected before the master
// is opened, a mixed batch never runs into the 6-minute limit, and an abandoned claim is reported, never re-run.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const A = require('../apps-script/Automation.gs');

// The exact shape of IDENTITY_RESOLVE_PASS2/PASS3 (2026-10-05): ruling fields at the top level, snake_case, no "ruling" object.
const flatRuling = (rid, pid) => ({ action: 'ruling', request_id: rid, actor: 'FORGE', kind: 'ENRICH', primary_id: pid, fields: { IDENTITY_CONFIDENCE: 'HIGH' } });
const nested = (rid, pid) => ({ action: 'ruling', ruling: { primaryId: pid, kind: 'ENRICH', actor: 'CLAUDE', requestId: rid, fields: { CLAUDE_NOTE: 'note for ' + rid } } });

// ---------- shape checks (no Apps Script services exist in this process: touching one would throw) ----------
test('a batch of flat rulings is rejected at once, before the master is opened, naming every malformed index', t => {
  delete global.LockService; delete global.DocumentApp; delete global.DriveApp;
  const r = W.dispatchWrite_({ action: 'batch', requests: [flatRuling('IDRES-P2-1', 'V2I-F01B90E8767D'), flatRuling('IDRES-P2-2', 'V2I-EC39AAAA36F0')] });
  assert.equal(r.ok, false);
  assert.equal(r.mode, 'REJECTED_SCHEMA');
  assert.equal(r.attempted, 0);
  assert.deepEqual(r.results.map(x => x.index), [0, 1]);
  assert.match(r.results[0].error, /must be nested/);
  assert.match(r.results[0].error, /found at top level: primary_id, request_id, kind, fields, actor/);
});

test('one malformed request rejects the whole batch; valid siblings are not applied', t => {
  const r = W.dispatchWrite_({ action: 'batch', requests: [nested('R-1', 'V2F-AAAA00000001'), { action: 'ruling', ruling: { primary_id: 'V2F-X' } }, { action: 'nope' }] });
  assert.equal(r.mode, 'REJECTED_SCHEMA');
  assert.deepEqual(r.results.map(x => x.index), [1, 2]);
  assert.match(r.results[0].error, /ruling\.primaryId is required \(found primary_id/);
  assert.match(r.results[1].error, /unsupported action in batch: nope/);
});

test('a single flat ruling is rejected without opening the master or writing a receipt', t => {
  const r = W.dispatchWrite_(flatRuling('IDRES-P3-1', 'V2I-E52292921A30'));
  assert.equal(r.mode, 'REJECTED_SCHEMA');
  assert.equal(r.receipt, undefined);
});

test('requestShapeError_ accepts the documented nested ruling and ignores other actions', t => {
  assert.equal(W.requestShapeError_(nested('R-1', 'V2F-AAAA00000001')), '');
  assert.equal(W.requestShapeError_({ action: 'intake', records: [] }), '');
});

// ---------- mixed batches with in-memory services ----------
function rowLine(inv, id) { return inv + ' | ' + id + ' | Acme Corp | Director of Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | REQ-' + inv + ' | Austin, TX | NOTIFICATION_SOURCE=LinkedIn; SOURCE_URL=https://example.com/' + inv; }
function fakeServices(t) {
  return require('./helpers/writer-world').world(t, { rows: [rowLine(1,'V2F-AAAA00000001'),rowLine(2,'V2F-BBBB00000002')] });
}

const mixed = () => ({ action: 'batch', requests: [nested('MIX-1', 'V2F-AAAA00000001'), nested('MIX-2', 'V2F-BBBB00000002'), { action: 'unfreeze_writer', reason: 'x' }] });

test('mixed batch: the second master write is fenced, so the batch ends PARTIAL with the untouched remainder', t => {
  const f = fakeServices(t); W.resetExecution_(); W.setWriteDeadline_(0);
  const r = W.dispatchWrite_(mixed());
  assert.equal(r.mode, 'SERIAL_MIXED_BATCH');
  assert.equal(r.ok, false);
  assert.equal(r.partial, true);
  assert.equal(r.stoppedBy, 'WRITE_FENCE');
  assert.equal(r.attempted, 1);
  assert.deepEqual(r.notAttempted, [1, 2]);
  assert.deepEqual(r.remainder.requests.map(x => x.action), ['ruling', 'unfreeze_writer']);
  assert.equal(r.results[0].ok, true);
  assert.match(f.row('V2F-AAAA00000001'), /CLAUDE_NOTE=note for MIX-1/);
  assert.doesNotMatch(f.row('V2F-BBBB00000002'), /CLAUDE_NOTE/, 'the fenced request was never applied');
  assert.equal(f.saves(), 1);
  assert.equal(A.terminalStatus_(r), 'PARTIAL_HOLD');
});

test('mixed batch fenced on its first request returns the fence itself, so the worker leaves it queued', t => {
  fakeServices(t); W.resetExecution_(); W.setWriteDeadline_(0);
  W.dispatchWrite_(nested('PRIOR', 'V2F-AAAA00000001'));          // this execution has already written the master
  const r = W.dispatchWrite_(mixed());
  assert.equal(r.mode, 'WRITE_FENCE');
});

test('mixed batch: no request starts after the deadline; a deadline before the first keeps it queued', t => {
  const f = fakeServices(t); W.resetExecution_();
  W.setWriteDeadline_(Date.now() - 1);
  const r = W.dispatchWrite_(mixed());
  W.setWriteDeadline_(0);
  assert.equal(r.mode, 'WRITE_FENCE');
  assert.match(r.error, /time budget/);
  assert.equal(f.saves(), 0);
});

// ---------- the worker: processWriterQueue with a fake queue ----------
function queueHarness(opts) {
  opts = opts || {};
  const log = [], created = [], folders = {};
  const iter = list => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
  const mkFolder = id => folders[id] = { id, getId: () => id, files: [], getFiles() { return iter(this.files.slice()); }, createFile(n, c) { created.push({ folder: id, name: n, body: JSON.parse(c) }); return {}; } };
  const queue = mkFolder('queue'), processed = mkFolder('processed'), failed = mkFolder('failed');
  const byId = {};
  function addFile(name, body, ageMs, updatedAgoMs) {
    let n = name, parent = queue, updated = Date.now() - (updatedAgoMs === undefined ? ageMs : updatedAgoMs);
    const f = { getId: () => 'id-' + name, getName: () => n, setName: v => { if (opts.renameThrows && /^IDENT/.test(v)) throw new Error('rename failed'); n = v; updated = Date.now(); },
      getDateCreated: () => new Date(Date.now() - ageMs), getLastUpdated: () => new Date(updated), getMimeType: () => 'text/plain',
      getBlob: () => ({ getDataAsString: () => JSON.stringify(body) }),
      getParents: () => iter([parent]),
      moveTo: p => { if (opts.moveThrows) throw new Error('move failed'); parent.files = parent.files.filter(x => x !== f); parent = p; p.files.push(f); } };
    queue.files.push(f); byId[f.getId()] = f; return f;
  }
  global.LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) };
  global.DriveApp = { getFileById: id => byId[id] };
  global.MimeType = { PLAIN_TEXT: 'text/plain', GOOGLE_DOCS: 'application/vnd.google-apps.document' };
  global.folder_ = () => ({ getFoldersByName: n => iter(n === 'WRITER_QUEUE' ? [queue] : []) });
  queue.getFoldersByName = n => iter(n === 'processed' ? [processed] : n === 'failed' ? [failed] : []);
  global.findOrCreate_ = () => ({ getBlob: () => ({ getDataAsString: () => log.map(e => JSON.stringify(e)).join('\n') }), setContent: v => { log.length = 0; v.split('\n').filter(Boolean).forEach(l => log.push(JSON.parse(l))); } });
  global.verifyNow_ = () => ({ ok: true });
  global.errorStack_ = e => String(e && e.stack || '');
  global.docAccessSummary_ = () => ({ status: 'INITIAL_SUCCESS' });
  global.WRITE_ACTIONS = W.WRITE_ACTIONS;
  global.readIndex_ = () => ({ requests: { 'IDRES-P3-A': { s: 'COMPLETE', at: '2026-10-05T03:00:00Z', w: 'W-1' } } });
  const deadlines = [];
  global.setWriteDeadline_ = t => deadlines.push(t);
  global.dispatchWrite_ = opts.dispatch || (() => ({ ok: true, mode: 'TEST' }));
  return { queue, processed, failed, addFile, log, created, deadlines };
}

test('worker: a stale PROCESSING__ claim is finalized as HOLD_ABANDONED with request-ID states, never re-dispatched', t => {
  let dispatched = 0;
  const h = queueHarness({ dispatch: () => { dispatched++; return { ok: true }; } });
  const body = { action: 'batch', requests: [nested('IDRES-P3-A', 'V2I-1'), nested('IDRES-P3-B', 'V2I-2')] };
  h.addFile('PROCESSING__IDENTITY_RESOLVE_PASS3.json', body, 20 * 60000, 9 * 60000);
  const out = A.processWriterQueue();
  assert.equal(dispatched, 0, 'abandoned request is not re-run');
  assert.equal(out.processed, 1);
  const res = h.created[0];
  assert.equal(res.folder, 'failed');
  assert.equal(res.name, 'RESULT__IDENTITY_RESOLVE_PASS3.json');
  assert.equal(res.body.terminalStatus, 'HOLD_ABANDONED');
  assert.deepEqual(res.body.result.requestIds, ['IDRES-P3-A', 'IDRES-P3-B']);
  assert.equal(res.body.result.requestIndexStates['IDRES-P3-A'].s, 'COMPLETE');
  assert.equal(res.body.result.requestIndexStates['IDRES-P3-B'], null);
  assert.equal(h.failed.files[0].getName(), 'IDENTITY_RESOLVE_PASS3.json', 'request file released and moved to failed');
  assert.equal(h.log[0].terminalStatus, 'HOLD_ABANDONED');
});

test('worker: a fresh PROCESSING__ claim (another execution is still running it) is left alone', t => {
  let dispatched = 0;
  const h = queueHarness({ dispatch: () => { dispatched++; return { ok: true }; } });
  h.addFile('PROCESSING__LIVE.json', { action: 'intake', records: [] }, 5 * 60000, 2 * 60000);
  const out = A.processWriterQueue();
  assert.equal(out.processed, 0); assert.equal(dispatched, 0); assert.equal(h.created.length, 0);
});

test('worker: an exception thrown by the writer still produces a FAILED RESULT and moves the request', t => {
  const h = queueHarness({ dispatch: () => { throw new Error('Exceeded maximum execution time'); } });
  h.addFile('IDENT_X.json', { action: 'intake', records: [] }, 60000);
  A.processWriterQueue();
  assert.equal(h.created[0].body.terminalStatus, 'FAILED');
  assert.match(h.created[0].body.result.error, /Exceeded maximum/);
  assert.equal(h.failed.files.length, 1);
  assert.equal(h.queue.files.length, 0);
});

test('worker: a partial batch is finalized as PARTIAL_HOLD with the remainder in the RESULT', t => {
  const h = queueHarness({ dispatch: () => ({ ok: false, mode: 'SERIAL_MIXED_BATCH', partial: true, attempted: 1, notAttempted: [1], stoppedBy: 'WRITE_FENCE', remainder: { action: 'batch', requests: [{}] }, results: [{ ok: true }] }) });
  h.addFile('MIX.json', { action: 'batch', requests: [] }, 60000);
  A.processWriterQueue();
  assert.equal(h.created[0].folder, 'failed');
  assert.equal(h.created[0].body.terminalStatus, 'PARTIAL_HOLD');
  assert.deepEqual(h.log[0].notAttempted, [1]);
});

test('worker: when the move fails the request is renamed HOLD__ and is never claimed again', t => {
  let dispatched = 0;
  const h = queueHarness({ moveThrows: true, dispatch: () => { dispatched++; return { ok: true }; } });
  h.addFile('M.json', { action: 'intake', records: [] }, 60000);
  A.processWriterQueue();
  assert.equal(h.queue.files[0].getName(), 'HOLD__M.json');
  assert.equal(h.log[0].terminalStatus, 'HOLD_UNMOVED');
  A.processWriterQueue();
  assert.equal(dispatched, 1, 'HOLD__ file is not picked up again');
});

test('worker: a WRITE_FENCE result releases the claim and leaves the request queued (no RESULT)', t => {
  const h = queueHarness({ dispatch: () => ({ ok: false, mode: 'WRITE_FENCE', error: 'Writer frozen' }) });
  h.addFile('F.json', { action: 'intake', records: [] }, 60000);
  const out = A.processWriterQueue();
  assert.equal(out.deferred.file, 'F.json');
  assert.equal(h.queue.files[0].getName(), 'F.json');
  assert.equal(h.created.length, 0);
});

test('worker: no new file is claimed after the claim cutoff; the deadline is set and always cleared', t => {
  const realNow = Date.now; let t = realNow(), dispatched = 0;
  const h = queueHarness({ dispatch: () => { dispatched++; t += A.QUEUE_CLAIM_CUTOFF_MS + 1000; return { ok: true }; } });
  h.addFile('ONE.json', { action: 'intake', records: [] }, 120000);
  h.addFile('TWO.json', { action: 'intake', records: [] }, 60000);
  Date.now = () => t;
  try { A.processWriterQueue(); } finally { Date.now = realNow; }
  assert.equal(dispatched, 1, 'the second file waits for the next tick');
  assert.equal(h.queue.files.length, 1);
  assert.equal(h.queue.files[0].getName(), 'TWO.json');
  assert.equal(h.deadlines.length, 2);
  assert.ok(h.deadlines[0] > 0); assert.equal(h.deadlines[1], 0);
});

test('requestIdsOf_ finds nested and snake_case IDs once each', t => {
  assert.deepEqual(A.requestIdsOf_({ requests: [nested('A', 'P'), flatRuling('B', 'Q'), nested('A', 'P')] }), ['A', 'B']);
  assert.deepEqual(A.requestIdsOf_(null), []);
});

// ---------- writer monitor warnings (pure) ----------
test('monitor: a freeze with no running migration is critical; during a LIVE migration step it is a warning', t => {
  const now = Date.parse('2026-10-05T04:00:00Z'), at = '2026-10-05T03:55:00Z';
  const base = { freeze: { frozen: true, reason: 'r', by: 'CLAUDE', at }, queue: {}, triggerInstalled: true };
  const unexpected = A.writerWarnings_(Object.assign({ migration: { mode: 'LIVE', status: 'CUTOVER_COMPLETE' } }, base), now);
  assert.equal(unexpected[0].code, 'FROZEN_UNEXPECTED'); assert.equal(unexpected[0].level, 'critical');
  const migrating = A.writerWarnings_(Object.assign({ migration: { mode: 'LIVE', status: 'IN_PROGRESS' } }, base), now);
  assert.equal(migrating[0].code, 'FROZEN_FOR_MIGRATION'); assert.equal(migrating[0].level, 'warn');
  const longMigration = A.writerWarnings_(Object.assign({}, base, { migration: { mode: 'LIVE', status: 'IN_PROGRESS' }, freeze: Object.assign({}, base.freeze, { at: '2026-10-05T03:00:00Z' }) }), now);
  assert.equal(longMigration[0].level, 'critical');
});

test('monitor: long and abandoned claims, backlog, missing trigger, unverified writes and recent holds', t => {
  const now = Date.parse('2026-10-05T04:00:00Z');
  const w = A.writerWarnings_({
    queue: { pending: 2, oldestPendingAt: '2026-10-05T03:40:00Z', hold: ['HOLD__X.json'], processing: [{ file: 'A.json', ageMs: 5 * 60000 }, { file: 'B.json', ageMs: 9 * 60000 }] },
    triggerInstalled: false,
    unverified: { count: 1, oldestWrittenAt: '2026-10-05T03:30:00Z' },
    recentRuns: [{ file: 'P2.json', terminalStatus: 'HOLD_ABANDONED', finishedAt: '2026-10-05T03:50:00Z' }, { file: 'OK.json', terminalStatus: 'SUCCESS', finishedAt: '2026-10-05T03:51:00Z' }],
    errors: ['queue: boom']
  }, now);
  const by = Object.fromEntries(w.map(x => [x.code, x.level]));
  assert.deepEqual(by, { CLAIM_RUNNING_LONG: 'warn', CLAIM_ABANDONED: 'critical', QUEUE_HOLD: 'warn', QUEUE_BACKLOG: 'warn', TRIGGER_MISSING: 'critical', WRITE_UNVERIFIED: 'critical', HOLD_ABANDONED: 'warn', STATUS_PART_UNAVAILABLE: 'warn' });
});

test('monitor: recovered PARTIAL_HOLD stays in history but no longer raises an active warning', t => {
  const now = Date.parse('2026-10-05T07:00:00Z');
  const w = A.writerWarnings_({
    queue: { pending: 0, processing: [], hold: [] }, triggerInstalled: true, unverified: { count: 0 },
    recentRuns: [
      { file: 'OLD.json', terminalStatus: 'PARTIAL_HOLD', finishedAt: '2026-10-05T06:30:00Z', recovered: true },
      { file: 'LIVE.json', terminalStatus: 'PARTIAL_HOLD', finishedAt: '2026-10-05T06:40:00Z', recovered: false }
    ], errors: []
  }, now);
  assert.equal(w.length, 1);
  assert.equal(w[0].code, 'PARTIAL_HOLD');
  assert.match(w[0].message, /LIVE\.json/);
});

test('monitor: FAILED runs in the last 24 h raise one notice, never a warn, and older ones are ignored', t => {
  const now = Date.parse('2026-10-06T07:00:00Z');
  const base = { queue: { pending: 0, processing: [], hold: [] }, triggerInstalled: true, unverified: { count: 0 }, recentRuns: [], recentHolds: [], errors: [] };
  const w = A.writerWarnings_(Object.assign({}, base, { recentFailed: [
    { file: 'NEW.json', terminalStatus: 'FAILED', finishedAt: '2026-10-06T06:50:00Z', error: 'NEVER_CONSIDER NC-001 HIGH' },
    { file: 'MID.json', terminalStatus: 'FAILED', finishedAt: '2026-10-06T01:00:00Z', error: '' },
    { file: 'OLD.json', terminalStatus: 'FAILED', finishedAt: '2026-10-04T01:00:00Z', error: '' }
  ] }), now);
  assert.equal(w.length, 1);
  assert.equal(w[0].code, 'FAILED');
  assert.equal(w[0].level, 'notice');
  assert.match(w[0].message, /^2 request\(s\) FAILED/);
  assert.match(w[0].message, /NEW\.json.*NC-001/);
  assert.equal(A.writerWarnings_(Object.assign({}, base, { recentFailed: [] }), now).length, 0);
  assert.equal(A.writerWarnings_(base, now).length, 0, 'older status shapes without recentFailed raise nothing');
});

// The live GROK_RECON_20261005_0223ET shapes: request IDs sit under event.requestId / ruling.requestId.
const upsert = rid => ({ action: 'upsert_application', event: { COMPANY: 'Co', STATE: 'APPLIED', requestId: rid } });
const dupRuling = rid => ({ action: 'ruling', ruling: { primaryId: 'V2I-X', kind: 'DUPLICATE', requestId: rid } });
const ORIGINAL = { action: 'batch', requests: [upsert('PWC'), upsert('EATON'), upsert('ORACLE'), dupRuling('BEEHIVE')] };
const R2 = { action: 'batch', requests: [upsert('EATON-R2'), upsert('ORACLE'), dupRuling('BEEHIVE')] };
// Live receipt index, 2026-10-05: the original EATON request was never written (lock timeout); it was re-sent as EATON-R2.
const LIVE_STATES = { PWC: { s: 'COMPLETE' }, 'EATON-R2': { s: 'COMPLETE' }, ORACLE: { s: 'COMPLETE' }, BEEHIVE: { s: 'COMPLETE' } };

test('recovery: a partial batch is recovered only when every one of its own request IDs is COMPLETE', t => {
  assert.equal(A.partialHoldRecovered_(R2, LIVE_STATES), true);
  assert.equal(A.partialHoldRecovered_(ORIGINAL, LIVE_STATES), false, 'EATON was completed under a different ID; the original is not proven recovered');
  assert.equal(A.partialHoldRecovered_(ORIGINAL, Object.assign({ EATON: { s: 'COMPLETE' } }, LIVE_STATES)), true);
  assert.equal(A.partialHoldRecovered_(R2, Object.assign({}, LIVE_STATES, { ORACLE: { s: 'FALSE_COMPLETE' } })), false);
  assert.equal(A.partialHoldRecovered_({ action: 'batch', requests: [upsert('PWC'), { action: 'upsert_application', event: { COMPANY: 'No ID' } }] }, LIVE_STATES), false, 'a request without an ID cannot be proven applied');
  assert.equal(A.partialHoldRecovered_({ action: 'batch', requests: [] }, LIVE_STATES), false);
});

// Run writerStatus_ against a fake queue log, fake Drive files and the live receipt states; restores globals afterwards.
const ago = min => new Date(Date.now() - min * 60000).toISOString();
const queueFile = (id, body) => ({ getId: () => id, getMimeType: () => 'application/json', getBlob: () => ({ getDataAsString: () => JSON.stringify(body) }) });
function writerStatusWith(logEntries, files) {
  const saved = { DriveApp: global.DriveApp, MimeType: global.MimeType, findOrCreate_: global.findOrCreate_, readIndex_: global.readIndex_ };
  try {
    global.MimeType = { GOOGLE_DOCS: 'application/vnd.google-apps.document' };
    global.DriveApp = { getFileById: id => files[id] || (() => { throw new Error('No item with the given ID could be found'); })() };
    global.findOrCreate_ = () => ({ getBlob: () => ({ getDataAsString: () => logEntries.map(e => JSON.stringify(e)).join('\n') }) });
    global.readIndex_ = () => ({ requests: LIVE_STATES, pending: [] });
    return A.writerStatus_();
  } finally {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete global[k]; else global[k] = saved[k]; }
  }
}
const healthy = s => Object.assign({}, s, { queue: { pending: 0, processing: [], hold: [] }, triggerInstalled: true, unverified: { count: 0 }, errors: [] });
const successes = (n, fromMin) => Array.from({ length: n }, (_, i) => ({ file: 'OK_' + i + '.json', fileId: 'OK' + i, ok: true, terminalStatus: 'SUCCESS', finishedAt: ago(fromMin - i) }));

test('monitor: writer_status reads the exact logged file by ID and fails closed when it cannot', t => {
  // Same file name for the original and a decoy: only the logged fileId decides which body is read.
  const files = { 'ID-R2': queueFile('ID-R2', R2), 'ID-ORIG': queueFile('ID-ORIG', ORIGINAL) };
  const r2At = ago(30);
  const s = writerStatusWith([
    { file: 'GONE.json', fileId: 'ID-GONE', terminalStatus: 'PARTIAL_HOLD', finishedAt: ago(50) },
    { file: 'NOID.json', terminalStatus: 'PARTIAL_HOLD', finishedAt: ago(40) },
    { file: 'GROK.json', fileId: 'ID-ORIG', terminalStatus: 'PARTIAL_HOLD', finishedAt: ago(32) },
    { file: 'GROK.json', fileId: 'ID-R2', terminalStatus: 'PARTIAL_HOLD', finishedAt: r2At }
  ], files);
  const runs = Object.fromEntries(s.recentRuns.map(r => [r.fileId || r.file, r]));
  assert.equal(runs['ID-R2'].recovered, true);
  assert.equal(runs['ID-ORIG'].recovered, false);
  assert.equal(runs['NOID.json'].recovered, false);
  assert.equal(runs['ID-GONE'].recovered, false);
  assert.match(runs['ID-GONE'].recoveryError, /No item/);
  assert.ok(!s.errors.some(e => /^recentRuns/.test(e)), 'one unreadable file does not take down recent runs');
  assert.equal(s.recentRuns.length, 4, 'every PARTIAL_HOLD stays in history');
  const w = A.writerWarnings_(healthy(s), Date.now());
  assert.deepEqual(w.map(x => x.code), ['PARTIAL_HOLD', 'PARTIAL_HOLD', 'PARTIAL_HOLD']);
  assert.ok(!w.some(x => x.message.includes(r2At)), 'the recovered R2 hold raises no active warning');
});

test('monitor: an unresolved PARTIAL_HOLD keeps warning behind more than eight newer runs until its 24 hours expire', t => {
  const files = { 'ID-ORIG': queueFile('ID-ORIG', ORIGINAL) };
  const holdAt = ago(23 * 60);
  const s = writerStatusWith([{ file: 'GROK.json', fileId: 'ID-ORIG', terminalStatus: 'PARTIAL_HOLD', finishedAt: holdAt }].concat(successes(12, 600)), files);
  assert.ok(!s.recentRuns.some(r => r.terminalStatus === 'PARTIAL_HOLD'), 'the hold is older than the last eight runs');
  assert.equal(s.recentHolds.length, 1);
  assert.equal(s.recentHolds[0].recovered, false, 'strict rule: EATON-R2 does not satisfy EATON');
  const w = A.writerWarnings_(healthy(s), Date.now());
  assert.deepEqual(w.map(x => x.code), ['PARTIAL_HOLD']);
  assert.ok(w[0].message.includes(holdAt));
  // Past 24 hours the same hold ages out of the window: no warning, nothing deleted from the log.
  const old = writerStatusWith([{ file: 'GROK.json', fileId: 'ID-ORIG', terminalStatus: 'PARTIAL_HOLD', finishedAt: ago(24 * 60 + 1) }].concat(successes(12, 600)), files);
  assert.equal(old.recentHolds.length, 0);
  assert.deepEqual(A.writerWarnings_(healthy(old), Date.now()), []);
});

test('monitor: a recovered PARTIAL_HOLD more than eight runs back stays in history without an active warning', t => {
  const files = { 'ID-R2': queueFile('ID-R2', R2) };
  const s = writerStatusWith([{ file: 'GROK_R2.json', fileId: 'ID-R2', terminalStatus: 'PARTIAL_HOLD', finishedAt: ago(120) }].concat(successes(10, 100)), files);
  assert.equal(s.recentHolds.length, 1);
  assert.equal(s.recentHolds[0].recovered, true);
  assert.deepEqual(A.writerWarnings_(healthy(s), Date.now()), []);
});

test('monitor: HOLD_ABANDONED and HOLD_UNMOVED behind newer runs still warn; recovery applies only to PARTIAL_HOLD', t => {
  const s = writerStatusWith([
    { file: 'A.json', fileId: 'ID-A', terminalStatus: 'HOLD_ABANDONED', finishedAt: ago(300) },
    { file: 'U.json', fileId: 'ID-U', terminalStatus: 'HOLD_UNMOVED', finishedAt: ago(290) }
  ].concat(successes(9, 200)), { 'ID-A': queueFile('ID-A', R2), 'ID-U': queueFile('ID-U', R2) });
  assert.deepEqual(A.writerWarnings_(healthy(s), Date.now()).map(x => x.code).sort(), ['HOLD_ABANDONED', 'HOLD_UNMOVED']);
});

test('monitor: when the receipt index cannot be read, every recent hold still warns', t => {
  const saved = global.readIndex_;
  const files = { 'ID-R2': queueFile('ID-R2', R2) };
  const log = [{ file: 'GROK_R2.json', fileId: 'ID-R2', terminalStatus: 'PARTIAL_HOLD', finishedAt: ago(120) }].concat(successes(9, 100));
  const savedG = { DriveApp: global.DriveApp, MimeType: global.MimeType, findOrCreate_: global.findOrCreate_ };
  try {
    global.MimeType = { GOOGLE_DOCS: 'x' };
    global.DriveApp = { getFileById: id => files[id] };
    global.findOrCreate_ = () => ({ getBlob: () => ({ getDataAsString: () => log.map(e => JSON.stringify(e)).join('\n') }) });
    global.readIndex_ = () => { throw new Error('index unavailable'); };
    const s = A.writerStatus_();
    const codes = A.writerWarnings_(Object.assign({}, s, { queue: { pending: 0, processing: [], hold: [] }, triggerInstalled: true, unverified: { count: 0 } }), Date.now()).map(x => x.code);
    assert.ok(codes.includes('PARTIAL_HOLD'), 'an unproven recovery never hides the hold');
    assert.ok(codes.includes('STATUS_PART_UNAVAILABLE'));
  } finally {
    global.readIndex_ = saved; for (const k of Object.keys(savedG)) { if (savedG[k] === undefined) delete global[k]; else global[k] = savedG[k]; }
    if (saved === undefined) delete global.readIndex_;
  }
});

test('monitor: an idle, healthy writer has no warnings', t => {
  assert.deepEqual(A.writerWarnings_({ freeze: null, queue: { pending: 0, processing: [], hold: [] }, triggerInstalled: true, unverified: { count: 0 }, recentRuns: [{ file: 'X', terminalStatus: 'SUCCESS', finishedAt: '2026-10-05T03:59:00Z' }], errors: [] }, Date.parse('2026-10-05T04:00:00Z')), []);
});
