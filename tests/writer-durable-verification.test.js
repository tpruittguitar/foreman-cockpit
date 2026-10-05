// Durable write verification. Models the production failure of 2026-10-05: Google Docs edits are persisted only when an
// execution ends, a re-open inside the same execution returns its own unsaved edits, and the end-of-execution flush can fail.
// COMPLETE may only be recorded by a LATER execution that reads the persisted master.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const MASTER = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI', DOCMIME = 'application/vnd.google-apps.document';

function rowLine(n, id, bucket) { return n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | ' + (bucket || 'SCOUT_INTAKE') + ' | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SOURCE_URL=https://example.com/' + n; }
const A = 'V2F-AAAA00000001', B = 'V2F-BBBB00000002';
function world(opts) {
  opts = opts || {};
  const docs = { [MASTER]: ['COUNTS: TOTAL=2 SCOUT_INTAKE=2 UNACCOUNTED=0', rowLine(1, A), rowLine(2, B), 'END V2_CURRENT_POPULATION_MASTER (2 rows)'], RECEIPTS: (opts.receipts || '').split('\n') };
  const files = {}; let nextId = 1, clock = Date.parse('2026-10-05T12:00:00Z');
  const textFile = (name, content) => { let v = content, n = name; const id = 'T' + (nextId++); const f = { getId: () => id, getMimeType: () => 'text/plain', getName: () => n, setName: x => { delete files[n]; n = x; files[n] = f; }, getBlob: () => ({ getDataAsString: () => v }), setContent: x => { v = x; } }; files[n] = f; return f; };
  const docFile = (name, id) => { let n = name; const f = { getId: () => id, getMimeType: () => DOCMIME, getName: () => n, setName: x => { delete files[n]; n = x; files[n] = f; } }; files[n] = f; return f; };
  docFile('PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS', 'RECEIPTS');
  textFile('PIPELINE_EVENT_LOG.jsonl', '\n');
  const iter = l => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  const folder = { getFilesByName: n => iter(files[n] ? [files[n]] : []), createFile: (n, c) => textFile(n, c) };
  let cache = {}, saved = {}, flushFails = false, masterSaves = 0;
  const open = id => {
    if (!cache[id]) cache[id] = docs[id].slice();
    const work = cache[id];
    const paras = () => work.map((_, i) => ({ getText: () => work[i], setText: v => { work[i] = v; } }));
    return { getBody: () => ({ getParagraphs: paras, getText: () => work.join('\n'), appendParagraph: t => { work.push(t); }, insertParagraph: (at, t) => { work.splice(at, 0, t); } }),
      saveAndClose: () => { saved[id] = true; if (id === MASTER) masterSaves++; } };
  };
  global.Utilities = { sleep() {} };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) };
  global.DriveApp = { getFileById: id => ({ getLastUpdated: () => new Date('2026-10-04T20:00:00Z'), getParents: () => iter([folder]), getId: () => id, getName: () => 'MASTER' }) };
  global.DocumentApp = { openById: id => open(id) };
  global.MimeType = { PLAIN_TEXT: 'text/plain' };
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(clock); } static now() { return clock; } };
  /** Runs fn as one Apps Script execution; at its end the Docs flush persists every opened doc unless told to fail. */
  const exec = (fn, o) => {
    W.resetExecution_(); cache = {}; saved = {}; flushFails = !!(o && o.flushFails);
    try { return fn(); } finally {
      if (!flushFails) Object.keys(cache).forEach(id => { if (saved[id] || id === 'RECEIPTS') docs[id] = cache[id]; });
      cache = {};
    }
  };
  return { exec, docs, files, advance: ms => { clock += ms; }, restore: () => { global.Date = RealDate; }, masterSaves: () => masterSaves,
    row: id => docs[MASTER].find(l => l.split(' | ')[1] === id),
    receipts: () => W.completedReceiptRequestIds_ ? (files.PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS && files.PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS.getMimeType() === 'text/plain' ? files.PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS.getBlob().getDataAsString() : docs.RECEIPTS.join('\n')) : '',
    index: () => files['PIPELINE_RECEIPT_INDEX.json'] ? JSON.parse(files['PIPELINE_RECEIPT_INDEX.json'].getBlob().getDataAsString()) : null,
    events: () => files['PIPELINE_EVENT_LOG.jsonl'].getBlob().getDataAsString().split('\n').filter(Boolean).map(JSON.parse) };
}
const enrich = (rid, pid, val) => ({ action: 'ruling', ruling: { primaryId: pid, kind: 'ENRICH', actor: 'FORGE', requestId: rid, fields: { SCOPE_FIT_RAW: val || '83' } } });
const batch = (...r) => ({ action: 'batch', requests: r });
const done = w => Object.keys(W.completedReceiptRequestIds_(w.receipts())).sort();

test('a write is only PENDING; the writing execution cannot certify it, even though its own re-read sees the edit', () => {
  const w = world();
  const r = w.exec(() => {
    const res = W.dispatchWrite_(batch(enrich('D-1', A)));
    const same = W.verifyPendingWrites_();                       // what v20/v21 effectively did
    assert.equal(same.skipped, 'SAME_EXECUTION_AS_WRITE');
    assert.match(DocumentApp.openById(MASTER).getBody().getText(), /SCOPE_FIT_RAW=83/, 'cached edit is visible in-execution');
    return res;
  });
  assert.equal(r.ok, true);assert.equal(r.verification, 'PENDING');assert.match(r.writeId, /^W-/);
  assert.deepEqual(done(w), []);assert.equal(w.index().requests['D-1'].s, 'PENDING');
  assert.match(w.receipts(), /COMPLETION_STATUS=PENDING_VERIFICATION/);
  w.restore();
});

test('a persisted write is verified COMPLETE by a later execution; replay then skips the request', () => {
  const w = world();
  w.exec(() => W.dispatchWrite_(batch(enrich('D-2', A), enrich('D-3', B))));
  const v = w.exec(() => W.verifyPendingWrites_());
  assert.equal(v.decided[0].decision, 'COMPLETE');assert.deepEqual(done(w), ['D-2', 'D-3']);
  assert.equal(w.index().requests['D-2'].s, 'COMPLETE');assert.equal(w.index().pending.length, 0);
  assert.match(w.receipts(), /VERIFICATION=POST_EXECUTION_INDEPENDENT/);
  const again = w.exec(() => W.dispatchWrite_(batch(enrich('D-2', A))));
  assert.equal(again.results[0].mode, 'ALREADY_APPLIED');assert.equal(w.masterSaves(), 1);
  w.restore();
});

test('the 2026-10-05 failure: flush fails at execution end -> verifier waits, fences writes, then records FAILED / MASTER_NOT_PERSISTED', () => {
  const w = world(), before = w.row(A);
  const r = w.exec(() => W.dispatchWrite_(batch(enrich('F-1', A))), { flushFails: true });
  assert.equal(r.ok, true, 'the writing execution cannot know');assert.equal(w.row(A), before, 'master never changed');
  assert.equal(w.index().requests['F-1'].s, 'PENDING', 'index is a Drive text write and survives the failed Docs flush');
  w.advance(30000);
  const fenced = w.exec(() => W.dispatchWrite_(batch(enrich('OTHER-1', B))));
  assert.equal(fenced.mode, 'WRITE_FENCE');assert.deepEqual(fenced.pendingWrites, [r.writeId]);assert.equal(w.masterSaves(), 1, 'no write planned on an unverified state');
  w.advance(120000);
  const v = w.exec(() => W.verifyPendingWrites_());
  assert.equal(v.decided[0].decision, 'NOT_PERSISTED');
  assert.equal(w.index().requests['F-1'].s, 'NOT_PERSISTED');assert.deepEqual(done(w), []);
  assert.match(w.receipts(), /COMPLETION_STATUS=FAILED[\s\S]*FINDING=MASTER_NOT_PERSISTED/);
  const retry = w.exec(() => W.dispatchWrite_(batch(enrich('F-1', A))));
  assert.equal(retry.results[0].mode, 'BATCH_RULING', 'a NOT_PERSISTED request may be resubmitted');
  w.restore();
});

test('one master write per execution: a second write in the same execution (queue loop) is fenced, not applied', () => {
  const w = world();
  w.exec(() => {
    assert.equal(W.dispatchWrite_(batch(enrich('Q-1', A))).ok, true);
    const second = W.dispatchWrite_(batch(enrich('Q-2', B)));
    assert.equal(second.mode, 'WRITE_FENCE');assert.match(second.error, /already wrote the master/);
  });
  assert.equal(w.masterSaves(), 1);assert.doesNotMatch(w.row(B), /SCOPE_FIT_RAW/);
  w.restore();
});

test('a row changed by someone else before verification is NEEDS_RESOLUTION, never COMPLETE', () => {
  const w = world();
  w.exec(() => W.dispatchWrite_(batch(enrich('C-1', A))), { flushFails: true });
  w.docs[MASTER][1] = w.docs[MASTER][1] + '; TIM_NOTE=edited by hand';
  w.advance(200000);
  const v = w.exec(() => W.verifyPendingWrites_());
  assert.equal(v.decided[0].decision, 'NEEDS_RESOLUTION');assert.equal(w.index().requests['C-1'].s, 'NEEDS_RESOLUTION');assert.deepEqual(done(w), []);
  w.restore();
});

test('single ruling and upsert follow the same contract', () => {
  const w = world();
  const r = w.exec(() => W.dispatchWrite_(enrich('S-1', B, '70')));
  assert.equal(r.verification, 'PENDING');assert.equal(r.receipt.COMPLETION_STATUS, 'PENDING_VERIFICATION');
  assert.equal(w.exec(() => W.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');assert.deepEqual(done(w), ['S-1']);
  w.restore();
});

test('receipt corrections: a proven-false COMPLETE is superseded by an appended correction; a true one is refused', () => {
  const legacy = ['', 'RECEIPT=STATE_CHANGE_RECEIPT', 'REQUEST_ID=FALSE-1', 'TARGET_CANONICAL_ID=' + A, 'READBACK_VERIFIED=YES', 'COMPLETION_STATUS=COMPLETE', 'END STATE_CHANGE_RECEIPT', '',
    'RECEIPT=STATE_CHANGE_RECEIPT', 'REQUEST_ID=TRUE-1', 'TARGET_CANONICAL_ID=' + B, 'READBACK_VERIFIED=YES', 'COMPLETION_STATUS=COMPLETE', 'END STATE_CHANGE_RECEIPT'].join('\n');
  const w = world({ receipts: legacy }), aBefore = w.row(A), bNow = w.row(B);
  w.files['PIPELINE_EVENT_LOG.jsonl'].setContent([
    JSON.stringify({ type: 'TIM_RULING', primaryId: A, requestId: 'FALSE-1', ts: '2026-10-05T01:07:23Z', before: aBefore, after: aBefore + '; SCOPE_FIT_RAW=83', verified: true }),
    JSON.stringify({ type: 'TIM_RULING', primaryId: B, requestId: 'TRUE-1', ts: '2026-10-05T00:27:50Z', before: 'x', after: bNow, verified: true })].join('\n') + '\n');
  assert.deepEqual(done(w), ['FALSE-1', 'TRUE-1']);
  const r = w.exec(() => W.dispatchWrite_({ action: 'correct_receipts', actor: 'CLAUDE', reason: 'v21 proof batch', corrections: [{ requestId: 'FALSE-1', correction: 'FALSE_COMPLETE' }, { requestId: 'TRUE-1', correction: 'FALSE_COMPLETE' }, { requestId: 'NOPE', correction: 'FALSE_COMPLETE' }] }));
  assert.equal(r.results[0].ok, true);assert.equal(r.results[0].finding, 'MASTER_NOT_PERSISTED');
  assert.match(r.results[1].error, /master contains the receipted result/);assert.match(r.results[2].error, /no COMPLETE receipt/);
  assert.deepEqual(done(w), ['TRUE-1'], 'correction removes only the false one');
  assert.match(w.receipts(), /RECEIPT=RECEIPT_CORRECTION[\s\S]*CORRECTION=FALSE_COMPLETE[\s\S]*FINDING=MASTER_NOT_PERSISTED[\s\S]*DISPOSITION=SUPERSEDED/);
  assert.match(w.receipts(), /REQUEST_ID=FALSE-1\nTARGET_CANONICAL_ID/, 'original block kept unchanged');
  assert.equal(w.index().requests['FALSE-1'].s, 'FALSE_COMPLETE');
  w.restore();
});

test('rotation: completed IDs move into the index, the oversized doc is archived by rename, new receipts go to a text log', () => {
  const legacy = Array.from({ length: 30 }, (_, i) => ['RECEIPT=STATE_CHANGE_RECEIPT', 'REQUEST_ID=L-' + i, 'READBACK_VERIFIED=' + (i % 3 ? 'YES' : 'NO'), 'COMPLETION_STATUS=' + (i % 3 ? 'COMPLETE' : 'FAILED'), 'END STATE_CHANGE_RECEIPT', ''].join('\n')).join('\n');
  const w = world({ receipts: legacy });
  const r = w.exec(() => W.dispatchWrite_({ action: 'rotate_receipts', actor: 'CLAUDE' }));
  assert.equal(r.mode, 'ROTATED');assert.equal(r.rotation.completeIds, 20);
  assert.ok(w.files['PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS__ARCHIVE_2026-10-05'], 'archive keeps the original doc (renamed, same ID)');
  assert.equal(w.files['PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS__ARCHIVE_2026-10-05'].getId(), 'RECEIPTS');
  assert.equal(w.files.PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS.getMimeType(), 'text/plain');
  assert.match(w.receipts(), /^RECEIPT=RECEIPT_LOG_ROTATION/);
  assert.equal(w.exec(() => W.replayState_()).done['L-1'], true, 'legacy completions still block replay');
  assert.equal(w.exec(() => W.replayState_()).done['L-0'], undefined, 'legacy failures may still be retried');
  assert.equal(w.exec(() => W.dispatchWrite_({ action: 'rotate_receipts' })).mode, 'ALREADY_ROTATED');
  w.exec(() => W.dispatchWrite_(batch(enrich('N-1', A))));
  w.exec(() => W.verifyPendingWrites_());
  assert.match(w.receipts(), /REQUEST_ID=N-1[\s\S]*COMPLETION_STATUS=COMPLETE/);assert.deepEqual(done(w), ['N-1']);
  w.restore();
});

test('an unreadable index fails closed instead of disabling replay protection', () => {
  const w = world();
  w.files.PIPELINE_RECEIPT_INDEX = null;
  w.exec(() => W.dispatchWrite_(batch(enrich('I-1', A))));
  w.files['PIPELINE_RECEIPT_INDEX.json'].setContent('{not json');
  assert.throws(() => w.exec(() => W.dispatchWrite_(batch(enrich('I-2', B)))), /receipt index unreadable \(fail closed\)/);
  w.restore();
});

test('classifyPendingWrite_: duplicate PRIMARY_IDs are never treated as persisted', () => {
  const p = { writtenAt: '2026-10-05T00:00:00Z', counts: W.textHash_('COUNTS: X'), items: [{ pid: A, op: 'REPLACE', b: W.textHash_('old'), a: W.textHash_(rowLine(1, A)) }] };
  const v = W.classifyPendingWrite_(p, ['COUNTS: X', rowLine(1, A), rowLine(1, A)], Date.parse('2026-10-05T01:00:00Z'), 120000);
  assert.equal(v.decision, 'NEEDS_RESOLUTION');assert.equal(v.items[0].state, 'AMBIGUOUS');
});
