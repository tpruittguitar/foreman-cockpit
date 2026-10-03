// Queue claim lock: overlapping trigger runs must never claim the same request file.
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../apps-script/Automation.gs');

function fakeLock() {
  const lock = { held: false, releases: 0 };
  global.LockService = { getScriptLock: () => ({
    tryLock: () => { if (lock.held) return false; lock.held = true; return true; },
    releaseLock: () => { lock.held = false; lock.releases++; }
  }) };
  return lock;
}
const byId = {};
global.DriveApp = { getFileById: id => byId[id] };
function fakeFile(name, createdMs, updatedMs, parentId) {
  let n = name, updated = updatedMs, parent = parentId || 'queue';
  const f = { getName: () => n, setName: v => { n = v; updated = Date.now(); }, getDateCreated: () => new Date(createdMs), getLastUpdated: () => new Date(updated), getId: () => 'id-' + name,
    getParents: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return { getId: () => parent }; } }; }, moveTo: p => { parent = p; } };
  byId[f.getId()] = f;
  return f;
}
function fakeFolder(files) {
  return { getId: () => 'queue', getFiles: () => { let i = 0; return { hasNext: () => i < files.length, next: () => files[i++] }; } };
}

test('claims the oldest pending file and renames it while holding the lock', () => {
  const lock = fakeLock(), now = Date.now();
  const older = fakeFile('A.json', now - 5000, now - 5000), newer = fakeFile('B.json', now - 1000, now - 1000);
  const c = A.claimNextQueueFile_(fakeFolder([newer, older]));
  assert.equal(c.busy, false);
  assert.equal(c.original, 'A.json');
  assert.equal(older.getName(), 'PROCESSING__A.json');
  assert.equal(newer.getName(), 'B.json');
  assert.equal(lock.held, false, 'lock released after the claim');
  assert.equal(lock.releases, 1);
});

test('a second run cannot claim a file another run already claimed', () => {
  fakeLock();
  const now = Date.now(), only = fakeFile('A.json', now - 5000, now - 5000), folder = fakeFolder([only]);
  const first = A.claimNextQueueFile_(folder), second = A.claimNextQueueFile_(folder);
  assert.equal(first.file, only);
  assert.equal(second.file, null);
  assert.equal(second.busy, false);
});

test('reports busy and renames nothing while another execution holds the lock', () => {
  const lock = fakeLock(); lock.held = true;
  const now = Date.now(), f = fakeFile('A.json', now - 5000, now - 5000);
  const c = A.claimNextQueueFile_(fakeFolder([f]));
  assert.equal(c.busy, true);
  assert.equal(c.file, null);
  assert.equal(f.getName(), 'A.json');
  assert.equal(lock.releases, 0, 'does not release a lock it never acquired');
});

test('stale PROCESSING__ files are reclaimed without a double prefix; fresh ones and RESULT__ files are skipped', () => {
  fakeLock();
  const now = Date.now(), hour = 60 * 60 * 1000;
  const stale = fakeFile('PROCESSING__S.json', now - 2 * hour, now - hour);
  const fresh = fakeFile('PROCESSING__F.json', now - 3 * hour, now - 1000);
  const result = fakeFile('RESULT__X.json', now - 4 * hour, now - 4 * hour);
  const c = A.claimNextQueueFile_(fakeFolder([fresh, result, stale]));
  assert.equal(c.original, 'S.json');
  assert.equal(stale.getName(), 'PROCESSING__S.json');
  assert.equal(fresh.getName(), 'PROCESSING__F.json');
  assert.equal(A.claimNextQueueFile_(fakeFolder([fresh, result, stale])).file, null, 'reclaimed file is fresh again');
});

test('a lagging listing cannot re-claim a file already moved out of the queue or handled this run', () => {
  fakeLock();
  const now = Date.now(), moved = fakeFile('M.json', now - 9000, now - 9000), next = fakeFile('N.json', now - 8000, now - 8000);
  moved.moveTo('processed');                       // listing still shows it with its original name
  const folder = fakeFolder([moved, next]);
  const c = A.claimNextQueueFile_(folder, {});
  assert.equal(c.original, 'N.json');
  assert.equal(moved.getName(), 'M.json', 'moved file untouched');
  next.setName('N.json');                          // processed + renamed back, but still listed in the queue
  assert.equal(A.claimNextQueueFile_(folder, { [next.getId()]: true }).file, null, 'handled file skipped');
});
