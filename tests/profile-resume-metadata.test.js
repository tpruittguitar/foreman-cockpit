// forge-coordination #306 Writer half: the documents GET returns metadata-only profileResume for an exact file ID.
// The contract below mirrors the ATS gate check in forge-coordination tools/source-trial/preliminary-screen.js.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123', MOD = new Date('2026-11-20T15:00:00Z');
function drive(files, calls) {
  return { getFileById(id) {
    calls.push(id);
    const f = files[id]; if (!f) throw new Error('No item with the given ID could be found');
    return { getId: () => id, getLastUpdated: () => f.modified, isTrashed: () => !!f.trashed,
      getBlob() { throw new Error('content must not be read'); }, moveTo() { throw new Error('no moves'); }, makeCopy() { throw new Error('no copies'); } };
  } };
}
function withDrive(files, fn) { const calls = [], prev = global.DriveApp; global.DriveApp = drive(files, calls); try { return fn(calls); } finally { global.DriveApp = prev; } }
const gateVerified = (d, fileId, now) => { const at = Date.parse(d.checkedAt), v = Date.parse(d.modifiedTime);
  return d.schema === 'forge.profile-resume-metadata.v1' && d.status === 'VERIFIED' && d.source === 'DIRECT_FILE_METADATA' && d.id === fileId && Number.isFinite(v) && Number.isFinite(at) && v <= at + 120000 && at <= now + 120000 && now - at <= 15 * 60000; };

test('a readable file returns VERIFIED metadata the ATS gate accepts, with one metadata lookup and no content read', () => {
  withDrive({ [ID]: { modified: MOD } }, calls => {
    const d = W.profileResumeMetadata_(ID);
    assert.deepEqual(Object.keys(d).sort(), ['checkedAt', 'id', 'modifiedTime', 'schema', 'source', 'status']);
    assert.equal(d.status, 'VERIFIED'); assert.equal(d.id, ID); assert.equal(d.modifiedTime, MOD.toISOString());
    assert.equal(gateVerified(d, ID, Date.now()), true);
    assert.deepEqual(calls, [ID]);
  });
});
test('missing, trashed or malformed IDs are never VERIFIED, so the gate stays UNKNOWN', () => {
  withDrive({ [ID]: { modified: MOD, trashed: true } }, calls => {
    assert.equal(W.profileResumeMetadata_(ID).status, 'UNAVAILABLE');
    assert.equal(W.profileResumeMetadata_('1ZZZZZZZZZZZZZZZZZZZ').status, 'FAILED');
    const bad = W.profileResumeMetadata_('../etc/passwd');
    assert.equal(bad.status, 'INVALID_ID'); assert.equal(bad.modifiedTime, null);
    assert.equal(calls.includes('../etc/passwd'), false, 'malformed IDs never reach Drive');
    for (const id of [ID, '1ZZZZZZZZZZZZZZZZZZZ']) assert.equal(gateVerified(W.profileResumeMetadata_(id), id, Date.now()), false);
  });
});
