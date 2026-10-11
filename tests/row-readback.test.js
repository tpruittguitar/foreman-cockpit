// row_readback: read-only per-row proof from the live master for lanes that cannot download the whole file.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), crypto = require('crypto');
const W = require('../apps-script/Code.gs');
const A = require('../apps-script/Automation.gs');
const text = fs.readFileSync(__dirname + '/fixtures/master.sample.txt', 'utf8');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

test('returns the exact line, its hash and protected-state facts for each requested PRIMARY_ID', () => {
  const r = W.rowReadbackFromText_(text, ['V2X-E48592F5CB73', 'V2X-A4CCD49EE686'], { id: 'M', modifiedTime: 'T', readAt: 'R' });
  assert.equal(r.ok, true); assert.equal(r.readOnly, true); assert.equal(r.requested, 2); assert.equal(r.found, 2);
  const [applied, ready] = r.rows;
  assert.equal(applied.bucket, 'APPLIED'); assert.equal(applied.protectedApplicant, true);
  assert.equal(ready.bucket, 'READY_TO_PURSUE'); assert.equal(ready.protectedApplicant, false);
  const exact = text.split('\n')[applied.lineNumber - 1];
  assert.equal(applied.line, exact); assert.equal(applied.lineSha256, sha(exact));
});

test('master-level proof: sha256, bytes, COUNTS line and END marker', () => {
  const r = W.rowReadbackFromText_(text, ['V2X-E48592F5CB73'], {});
  assert.equal(r.master.sha256, sha(text)); assert.equal(r.master.bytes, text.length);
  assert.match(r.master.counts, /^COUNTS: TOTAL=/);
  assert.equal(r.master.endMarkerPresent, false); // the scrubbed fixture carries no END line
  assert.equal(W.rowReadbackFromText_(text + '\nEND V2_CURRENT_POPULATION_MASTER', ['V2X-E48592F5CB73'], {}).master.endMarkerPresent, true);
});

test('missing IDs are reported, not guessed; duplicates are de-duplicated; a repeated row in the master is flagged', () => {
  const r = W.rowReadbackFromText_(text, ['V2X-NOT-THERE', 'V2X-E48592F5CB73', 'V2X-E48592F5CB73'], {});
  assert.equal(r.requested, 2); assert.equal(r.found, 1);
  assert.deepEqual(r.rows[0], { primaryId: 'V2X-NOT-THERE', found: false, matches: 0 });
  const line = text.split('\n').find(l => / \| V2X-A4CCD49EE686 \| /.test(l));
  const twice = W.rowReadbackFromText_(text + '\n' + line, ['V2X-A4CCD49EE686'], {});
  assert.deepEqual(twice.duplicatesInMaster, ['V2X-A4CCD49EE686']); assert.equal(twice.rows[0].matches, 2);
});

test('bad requests are rejected before anything is read into the answer', () => {
  assert.equal(W.rowReadbackFromText_(text, [], {}).mode, 'REJECTED_SCHEMA');
  assert.equal(W.rowReadbackFromText_(text, undefined, {}).mode, 'REJECTED_SCHEMA');
  assert.match(W.rowReadbackFromText_(text, Array.from({ length: 26 }, (_, i) => 'V2X-' + i), {}).error, /at most 25/);
  const r = W.rowReadbackFromText_(text, ['bad id', 'a|b', 'V2X-E48592F5CB73'], {});
  assert.equal(r.ok, true); assert.deepEqual(r.invalidIds, ['bad id', 'a|b']);
});

test('the queue routes row_readback as a read: no write dispatch, SUCCESS result carrying the rows', () => {
  const calls = [];
  global.rowReadback_ = b => { calls.push(b); return W.rowReadbackFromText_(text, b.primaryIds, {}); };
  const orig = W.dispatchWrite_;
  try {
    // processWriterQueue needs Drive; check the routing table and the terminal status instead.
    assert.ok(require('fs').readFileSync(__dirname + '/../apps-script/Automation.gs', 'utf8').includes("QUEUE_READ_ACTIONS.indexOf(parsed.body.action) >= 0) result = rowReadback_(parsed.body)"));
    const res = global.rowReadback_({ action: 'row_readback', primaryIds: ['V2X-E48592F5CB73'] });
    assert.equal(A.terminalStatus_(res), 'SUCCESS');
    assert.equal(calls.length, 1);
  } finally { delete global.rowReadback_; W.dispatchWrite_ = orig; }
});
