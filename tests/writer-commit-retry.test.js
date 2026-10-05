// Master commit: a transient "document is inaccessible" during setText/saveAndClose is retried only when an independent fresh read
// proves nothing landed; a commit that landed despite the error is not re-applied; partial or concurrent states fail closed.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const MASTER = '19y5xtspYk3ze_E2uRMcUsK3CNh3tbtCILz-us8YtpDI';
const INACCESSIBLE = 'The document is inaccessible. Please try again later.';

function rowLine(n, id) { return n + ' | ' + id + ' | Acme ' + n + ' | Director of Quality | SCOUT_INTAKE | ANALYSIS_PENDING | - | REQ-' + n + ' | Austin, TX | SOURCE_URL=https://example.com/' + n; }
/* Docs-like master: each open gets its own working copy; setText edits the copy; saveAndClose persists it.
 * fail.SET[i] / fail.SAVE[i]: the i-th setText / save call throws that message. A SAVE entry {msg, landed:true} persists, then throws.
 * hooks.afterFailure(persisted) runs once after the first injected failure (simulates another writer). */
function services(fail, hooks) {
  fail = fail || {}; hooks = hooks || {};
  let persisted = ['COUNTS: TOTAL=2 SCOUT_INTAKE=2 UNACCOUNTED=0', rowLine(1, 'V2F-AAAA00000001'), rowLine(2, 'V2F-BBBB00000002'), 'END V2_CURRENT_POPULATION_MASTER (2 rows)'];
  const receipts = []; let events = '', sets = 0, saveCalls = 0, saves = 0, opens = 0, failed = false, getTextAfterSet = 0; const sleeps = [];
  const files = { PIPELINE_EXPLORER_STATE_CHANGE_RECEIPTS: { getId: () => 'RECEIPTS' }, 'PIPELINE_EVENT_LOG.jsonl': { getId: () => 'EVENTS', getBlob: () => ({ getDataAsString: () => events }), setContent: v => { events = v; } } };
  const iter = l => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  const folder = { getFilesByName: n => iter(files[n] ? [files[n]] : []), createFile: n => { throw new Error('unexpected createFile ' + n); } };
  const onFail = () => { if (!failed) { failed = true; if (hooks.afterFailure) persisted = hooks.afterFailure(persisted.slice()); } };
  const openMaster = () => {
    opens++; const work = persisted.slice(); let dirty = false;
    const paras = work.map((_, i) => ({ getText: () => { if (dirty) getTextAfterSet++; return work[i]; }, setText: v => { const e = (fail.SET || [])[sets++]; if (e) { onFail(); throw new Error(e); } dirty = true; work[i] = v; } }));
    return { getBody: () => ({ getParagraphs: () => paras, getText: () => work.join('\n') }),
      saveAndClose: () => { const e = (fail.SAVE || [])[saveCalls++]; if (e) { if (e.landed) { persisted = work.slice(); saves++; } onFail(); throw new Error(e.msg || e); } persisted = work.slice(); saves++; } };
  };
  global.Utilities = { sleep: ms => sleeps.push(ms) };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  global.DriveApp = { getFileById: id => ({ getLastUpdated: () => new Date('2026-10-04T20:00:00Z'), getParents: () => iter([folder]), getId: () => id, getName: () => 'MASTER' }) };
  global.DocumentApp = { openById: id => {
    if (id === MASTER) return openMaster();
    if (id === 'RECEIPTS') return { getBody: () => ({ getText: () => receipts.join('\n'), appendParagraph: t => receipts.push(t) }), saveAndClose() {} };
    return { getBody: () => ({ getText: () => '' }), saveAndClose() {} }; } };
  global.MimeType = { PLAIN_TEXT: 'text/plain' };
  return { sleeps, saves: () => saves, opens: () => opens, getTextAfterSet: () => getTextAfterSet, receipts: () => receipts.join('\n'), lines: () => persisted.slice(),
    row: id => persisted.find(l => l.split(' | ')[1] === id) };
}
const enrich = (rid, pid) => ({ action: 'ruling', ruling: { primaryId: pid, kind: 'ENRICH', actor: 'FORGE', requestId: rid, fields: { SCOPE_FIT_RAW: '83', FIT_CONF: 'MED' } } });
const batch = (...reqs) => W.dispatchWrite_({ action: 'batch', requests: reqs });
const commitOp = r => r.docAccess.ops.find(o => o.op === 'MASTER_COMMIT');

test('batch: a transient save failure that did not land is verified unchanged, retried once, and committed exactly once', () => {
  const s = services({ SAVE: [INACCESSIBLE] });
  const r = batch(enrich('C-1', 'V2F-AAAA00000001'), enrich('C-2', 'V2F-BBBB00000002'));
  assert.equal(r.ok, true, JSON.stringify(r));assert.equal(s.saves(), 1);assert.deepEqual(s.sleeps, [2000]);
  assert.match(s.row('V2F-AAAA00000001'), /SCOPE_FIT_RAW=83/);assert.match(s.row('V2F-BBBB00000002'), /SCOPE_FIT_RAW=83/);
  const c = commitOp(r);assert.equal(c.status, 'RECOVERED_BY_RETRY');assert.equal(c.attempts, 2);assert.match(c.error, /inaccessible.*\(MASTER_SAVE\)/);assert.ok(c.stack, 'failure stack recorded');
  assert.ok(r.docAccess.ops.some(o => o.op === 'MASTER_COMMIT_VERIFY'), 'not-landed decision came from a fresh read');
  assert.deepEqual(Object.keys(W.completedReceiptRequestIds_(s.receipts())).sort(), ['C-1', 'C-2']);
});

test('batch: a transient setText failure mid-commit is retried on a fresh handle after verifying nothing landed', () => {
  const s = services({ SET: [null, INACCESSIBLE] });
  const r = batch(enrich('S-1', 'V2F-AAAA00000001'), enrich('S-2', 'V2F-BBBB00000002'));
  assert.equal(r.ok, true, JSON.stringify(r));assert.equal(s.saves(), 1);assert.match(commitOp(r).error, /\(MASTER_SET_TEXT\)/);
  assert.match(s.lines()[0], /^COUNTS:/);assert.equal(s.lines().length, 4);
});

test('batch: a save that landed despite the error is NOT re-applied; readback and receipts proceed normally', () => {
  const s = services({ SAVE: [{ msg: INACCESSIBLE, landed: true }] });
  const r = batch(enrich('L-1', 'V2F-AAAA00000001'));
  assert.equal(r.ok, true, JSON.stringify(r));assert.equal(s.saves(), 1, 'exactly one persisted save');assert.deepEqual(s.sleeps, []);
  const c = commitOp(r);assert.equal(c.landedOnError, true);assert.equal(c.attempts, 1);
  assert.equal(W.completedReceiptRequestIds_(s.receipts())['L-1'], true);
});

test('batch: another writer changing the master after a failed commit fails closed: no retry, no write, no receipt', () => {
  const s = services({ SAVE: [INACCESSIBLE] }, { afterFailure: p => { p[2] = p[2] + '; TIM_NOTE=concurrent'; return p; } });
  assert.throws(() => batch(enrich('X-1', 'V2F-AAAA00000001')), /MASTER_COMMIT: master matches neither the planned snapshot nor the intended result/);
  assert.equal(s.saves(), 0);assert.doesNotMatch(s.row('V2F-AAAA00000001'), /SCOPE_FIT_RAW/);assert.match(s.row('V2F-BBBB00000002'), /TIM_NOTE=concurrent/);
  assert.equal(s.receipts(), '');assert.deepEqual(s.sleeps, []);
});

test('batch: persistent commit failure exhausts after 3 attempts with the master verified unchanged and no receipt', () => {
  const s = services({ SAVE: [INACCESSIBLE, INACCESSIBLE, INACCESSIBLE] });
  assert.throws(() => batch(enrich('E-1', 'V2F-AAAA00000001')), e => e.message === INACCESSIBLE + ' [MASTER_COMMIT: retry exhausted after 3 attempts; master verified unchanged]');
  assert.equal(s.saves(), 0);assert.deepEqual(s.sleeps, W.COMMIT_RETRY_DELAYS_MS);assert.deepEqual(W.COMMIT_RETRY_DELAYS_MS, [2000, 5000]);
  assert.equal(s.receipts(), '');assert.doesNotMatch(s.row('V2F-AAAA00000001'), /SCOPE_FIT_RAW/);
});

test('batch: a deterministic commit error is thrown unchanged without sleeping or re-reading', () => {
  const s = services({ SAVE: ['Exception: You do not have permission to access the requested document.'] });
  assert.throws(() => batch(enrich('D-1', 'V2F-AAAA00000001')), /You do not have permission/);
  assert.deepEqual(s.sleeps, []);assert.equal(s.saves(), 0);assert.equal(s.receipts(), '');
});

test('commit no longer scans every paragraph after editing; COUNTS/END come from the snapshot and match a full recompute', () => {
  const s = services();
  const r = batch(enrich('N-1', 'V2F-AAAA00000001'));
  assert.equal(r.ok, true);assert.equal(s.getTextAfterSet(), 0, 'no getText on the edited handle');
  assert.equal(s.lines()[0], W.recomputeCountsLine(s.lines()));assert.equal(commitOp(r).status, 'INITIAL_SUCCESS');
});

test('single ruling: transient save failure is verified and retried; readback still independent and receipt COMPLETE', () => {
  const s = services({ SAVE: [INACCESSIBLE] });
  const r = W.dispatchWrite_(enrich('ONE-1', 'V2F-BBBB00000002'));
  assert.equal(r.ok, true, JSON.stringify(r));assert.equal(r.receipt.READBACK_VERIFIED, 'YES');assert.equal(r.receipt.COMPLETION_STATUS, 'COMPLETE');
  assert.equal(s.saves(), 1);assert.equal(commitOp(r).status, 'RECOVERED_BY_RETRY');assert.equal(s.getTextAfterSet(), 0);
});

test('errorStack_ keeps the leading frames so a failure names its exact line', () => {
  const e = new Error(INACCESSIBLE);e.stack = 'Error: ' + INACCESSIBLE + '\n    at commitMaster_ (Code:389:23)\n    at applyRulingBatchToMaster_ (Code:187:5)';
  assert.equal(W.errorStack_(e), 'Error: ' + INACCESSIBLE + ' | at commitMaster_ (Code:389:23) | at applyRulingBatchToMaster_ (Code:187:5)');
  assert.equal(W.errorStack_('plain'), '');
});
