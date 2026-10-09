// Durable verification against the current synchronous text-master contract. Retains a simulated acknowledged-but-lost
// save regression for the historical false-completion failure, plus independent execution/replay and rotation checks.
// COMPLETE may only be recorded by a LATER execution that reads the persisted master.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const MASTER = '1My9QYVPBblw8c7vFMFxGOAqgTSuH9gS8', DOCMIME = 'application/vnd.google-apps.document';

function rowLine(n, id, bucket) { return n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | ' + (bucket || 'SCOUT_INTAKE') + ' | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SOURCE_URL=https://example.com/' + n; }
const A = 'V2F-AAAA00000001', B = 'V2F-BBBB00000002';
function world(t, opts = {}) {
  const state = require('./helpers/writer-world').world(t, { clock: '2026-10-05T12:00:00Z', rows: [rowLine(1,A),rowLine(2,B)], receipts:opts.receipts || '', legacyReceiptDoc:opts.legacyReceiptDoc });
  let ignoredSaves=0;
  const exec=(fn, options={})=>{
    const master=state.files.get(MASTER), save=master.setContent;
    if(options.flushFails)master.setContent=()=>{ignoredSaves++};
    try{return state.run(fn)}finally{master.setContent=save}
  };
  return {...state,exec,masterSaves:()=>state.masterSaves()+ignoredSaves,files:new Proxy({}, {get:(_,name)=>state.files.get(name)}),events:()=>state.logs('PIPELINE_EVENT_LOG.jsonl')};
}

const enrich = (rid, pid, val) => ({ action: 'ruling', ruling: { primaryId: pid, kind: 'ENRICH', actor: 'FORGE', requestId: rid, fields: { SCOPE_FIT_RAW: val || '83' } } });
const batch = (...r) => ({ action: 'batch', requests: r });
const done = w => Object.keys(W.completedReceiptRequestIds_(w.receipts())).sort();

test('a write is only PENDING; the writing execution cannot certify it, even though its own re-read sees the edit', t => {
  const w = world(t);
  const r = w.exec(() => {
    const res = W.dispatchWrite_(batch(enrich('D-1', A)));
    const same = W.verifyPendingWrites_();                       // what v20/v21 effectively did
    assert.equal(same.skipped, 'SAME_EXECUTION_AS_WRITE');
    assert.match(DriveApp.getFileById(MASTER).getBlob().getDataAsString(), /SCOPE_FIT_RAW=83/, 'the synchronous save is visible but same-execution certification is still forbidden');
    return res;
  });
  assert.equal(r.ok, true);assert.equal(r.verification, 'PENDING');assert.match(r.writeId, /^W-/);
  assert.deepEqual(done(w), []);assert.equal(w.index().requests['D-1'].s, 'PENDING');
  assert.match(w.receipts(), /COMPLETION_STATUS=PENDING_VERIFICATION/);
  w.restore();
});

test('a persisted write is verified COMPLETE by a later execution; replay then skips the request', t => {
  const w = world(t);
  w.exec(() => W.dispatchWrite_(batch(enrich('D-2', A), enrich('D-3', B))));
  const v = w.exec(() => W.verifyPendingWrites_());
  assert.equal(v.decided[0].decision, 'COMPLETE');assert.deepEqual(done(w), ['D-2', 'D-3']);
  assert.equal(w.index().requests['D-2'].s, 'COMPLETE');assert.equal(w.index().pending.length, 0);
  assert.match(w.receipts(), /VERIFICATION=POST_EXECUTION_INDEPENDENT/);
  const again = w.exec(() => W.dispatchWrite_(batch(enrich('D-2', A))));
  assert.equal(again.results[0].mode, 'ALREADY_APPLIED');assert.equal(w.masterSaves(), 1);
  w.restore();
});

test('an acknowledged save with no persisted effect is fenced, then records FAILED / MASTER_NOT_PERSISTED', t => {
  const w = world(t), before = w.row(A);
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

test('one master write per execution: a second write in the same execution (queue loop) is fenced, not applied', t => {
  const w = world(t);
  w.exec(() => {
    assert.equal(W.dispatchWrite_(batch(enrich('Q-1', A))).ok, true);
    const second = W.dispatchWrite_(batch(enrich('Q-2', B)));
    assert.equal(second.mode, 'WRITE_FENCE');assert.match(second.error, /already wrote the master/);
  });
  assert.equal(w.masterSaves(), 1);assert.doesNotMatch(w.row(B), /SCOPE_FIT_RAW/);
  w.restore();
});

test('a row changed by someone else before verification is NEEDS_RESOLUTION, never COMPLETE', t => {
  const w = world(t);
  w.exec(() => W.dispatchWrite_(batch(enrich('C-1', A))), { flushFails: true });
  const master=DriveApp.getFileById(MASTER);master.content=master.content.replace(w.row(A),w.row(A)+'; TIM_NOTE=edited by hand');
  w.advance(200000);
  const v = w.exec(() => W.verifyPendingWrites_());
  assert.equal(v.decided[0].decision, 'NEEDS_RESOLUTION');assert.equal(w.index().requests['C-1'].s, 'NEEDS_RESOLUTION');assert.deepEqual(done(w), []);
  w.restore();
});

test('single ruling and upsert follow the same contract', t => {
  const w = world(t);
  const r = w.exec(() => W.dispatchWrite_(enrich('S-1', B, '70')));
  assert.equal(r.verification, 'PENDING');assert.equal(r.receipt.COMPLETION_STATUS, 'PENDING_VERIFICATION');
  assert.equal(w.exec(() => W.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');assert.deepEqual(done(w), ['S-1']);
  w.restore();
});

test('receipt corrections: a proven-false COMPLETE is superseded by an appended correction; a true one is refused', t => {
  const legacy = ['', 'RECEIPT=STATE_CHANGE_RECEIPT', 'REQUEST_ID=FALSE-1', 'TARGET_CANONICAL_ID=' + A, 'READBACK_VERIFIED=YES', 'COMPLETION_STATUS=COMPLETE', 'END STATE_CHANGE_RECEIPT', '',
    'RECEIPT=STATE_CHANGE_RECEIPT', 'REQUEST_ID=TRUE-1', 'TARGET_CANONICAL_ID=' + B, 'READBACK_VERIFIED=YES', 'COMPLETION_STATUS=COMPLETE', 'END STATE_CHANGE_RECEIPT'].join('\n');
  const w = world(t, { receipts: legacy }), aBefore = w.row(A), bNow = w.row(B);
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

test('rotation: completed IDs move into the index, the oversized doc is archived by rename, new receipts go to a text log', t => {
  const legacy = Array.from({ length: 30 }, (_, i) => ['RECEIPT=STATE_CHANGE_RECEIPT', 'REQUEST_ID=L-' + i, 'READBACK_VERIFIED=' + (i % 3 ? 'YES' : 'NO'), 'COMPLETION_STATUS=' + (i % 3 ? 'COMPLETE' : 'FAILED'), 'END STATE_CHANGE_RECEIPT', ''].join('\n')).join('\n');
  const w = world(t, { receipts: legacy, legacyReceiptDoc:true });
  const r = w.exec(() => W.dispatchWrite_({ action: 'rotate_receipts', actor: 'CLAUDE' }));
  assert.equal(r.mode, 'ROTATED');assert.equal(r.rotation.completeIds, 20);
  assert.ok(w.files['PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS__ARCHIVE_2026-10-05'], 'archive keeps the original doc (renamed, same ID)');
  assert.equal(w.files['PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS__ARCHIVE_2026-10-05'].getId(), 'TEST-RECEIPTS');
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

test('an unreadable index fails closed instead of disabling replay protection', t => {
  const w = world(t);
  w.exec(() => W.dispatchWrite_(batch(enrich('I-1', A))));
  w.files['PIPELINE_RECEIPT_INDEX.json'].setContent('{not json');
  assert.throws(() => w.exec(() => W.dispatchWrite_(batch(enrich('I-2', B)))), /receipt index unreadable \(fail closed\)/);
  w.restore();
});

test('classifyPendingWrite_: duplicate PRIMARY_IDs are never treated as persisted', t => {
  const p = { writtenAt: '2026-10-05T00:00:00Z', counts: W.textHash_('COUNTS: X'), items: [{ pid: A, op: 'REPLACE', b: W.textHash_('old'), a: W.textHash_(rowLine(1, A)) }] };
  const v = W.classifyPendingWrite_(p, ['COUNTS: X', rowLine(1, A), rowLine(1, A)], Date.parse('2026-10-05T01:00:00Z'), 120000);
  assert.equal(v.decision, 'NEEDS_RESOLUTION');assert.equal(v.items[0].state, 'AMBIGUOUS');
});
