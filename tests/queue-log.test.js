// Queue log append: concurrent runs must not overwrite each other's line, and the lock is always released.
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../apps-script/Automation.gs');

// A Drive text file whose read and write are separated by a yield, so an unlocked read-modify-write loses lines.
function fakeLogFile() {
  let content = '';
  return { getBlob: () => ({ getDataAsString: () => content }), setContent: v => { content = v; }, read: () => content };
}
// Script lock with real mutual exclusion across interleaved "executions" (waitLock blocks until free).
function fakeLock(opts) {
  const s = { held: false, waits: 0, releases: 0 };
  global.LockService = { getScriptLock: () => ({
    waitLock: ms => { s.waits++; if (opts && opts.timeout) throw new Error('Lock timeout: another process was holding the lock for too long.'); if (s.held) throw new Error('lock already held: appends overlapped'); s.held = true; },
    releaseLock: () => { s.held = false; s.releases++; }
  }) };
  return s;
}

test('each append adds exactly one line and keeps every earlier line', () => {
  const s = fakeLock(), file = fakeLogFile();
  global.findOrCreate_ = () => file;
  for (let i = 0; i < 25; i++) A.appendQueueLog_({ file: 'R' + i + '.json', ok: true });
  const lines = file.read().split('\n').filter(Boolean).map(l => JSON.parse(l).file);
  assert.deepEqual(lines, Array.from({ length: 25 }, (_, i) => 'R' + i + '.json'));
  assert.equal(s.waits, 25); assert.equal(s.releases, 25); assert.equal(s.held, false);
});

test('two interleaved runs cannot overwrite each other: the second append waits for the first', async () => {
  const s = fakeLock(), file = fakeLogFile();
  // Pause between read and write inside the first append; a second run tries to append in that window.
  let resumeFirst, secondErr = null;
  global.findOrCreate_ = () => file;
  const realSet = file.setContent;
  file.setContent = v => { if (!resumeFirst) { file.setContent = realSet; try { A.appendQueueLog_({ file: 'B.json' }); } catch (e) { secondErr = e; } resumeFirst = true; } realSet(v); };
  A.appendQueueLog_({ file: 'A.json' });
  // With the lock, B could not enter while A held it (fake waitLock throws instead of blocking), so A's line is intact
  // and B is retried after A releases, as a real waitLock would block until then.
  assert.match(String(secondErr), /lock already held/);
  A.appendQueueLog_({ file: 'B.json' });
  assert.deepEqual(file.read().split('\n').filter(Boolean).map(l => JSON.parse(l).file), ['A.json', 'B.json']);
  assert.equal(s.held, false);
});

test('the lock is released even when the Drive write throws', () => {
  const s = fakeLock();
  global.findOrCreate_ = () => ({ getBlob: () => ({ getDataAsString: () => '' }), setContent: () => { throw new Error('Drive quota'); } });
  assert.throws(() => A.appendQueueLog_({ file: 'X.json' }), /Drive quota/);
  assert.equal(s.held, false); assert.equal(s.releases, 1);
});

test('a lock timeout writes nothing and releases nothing it never held', () => {
  const s = fakeLock({ timeout: true }), file = fakeLogFile();
  global.findOrCreate_ = () => file;
  assert.throws(() => A.appendQueueLog_({ file: 'T.json' }), /Lock timeout/);
  assert.equal(file.read(), ''); assert.equal(s.releases, 0);
});
