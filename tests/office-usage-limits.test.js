const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../office/office-logic.js');

const at = '2026-11-23T06:46:00Z';
const older = '2026-11-23T06:00:00Z';
const now = Date.parse('2026-11-23T07:00:00Z');
const github = { at, provider: 'GITHUB', meter: 'core_api', remaining: 3412, limit: 5000,
  resetsAt: '2026-11-23T07:36:00Z', status: 'OK', source: 'gh api rate_limit' };
const desktop = { at, provider: 'DESKTOP_COMMANDER', meter: 'remote_calls_monthly',
  leftPct: 18, status: 'OK', source: 'who_am_i remote_calls_left_pct' };
const cloudflare = { at, provider: 'CLOUDFLARE', status: 'OK', source: 'cloudflare api',
  workersRequests: { used: 12345, remaining: 87655, limit: 100000, resetsAt: '2026-11-24T00:00:00Z' },
  pagesBuilds: { used: 4, remaining: 496, limit: 500, resetsAt: '2026-12-01T00:00:00Z' } };
const parse = (...rows) => L.parseReadings(rows.map(r => JSON.stringify(r)).join('\n'));
const empty = [{ name: 'GitHub', leftPct: null, stale: false }, { name: 'Desktop Cmdr', leftPct: null, stale: false }, { name: 'CloudFlare', leftPct: null, stale: false }];

test('usage limits select the newest valid reading per provider regardless of file order', () => {
  const readings = parse(github, { ...github, at: older, remaining: 4500 },
    { ...desktop, at: older, leftPct: 21 }, desktop,
    { ...github, at: '2026-11-23T07:00:00Z', meter: 'search_api' },
    { ...cloudflare, at: older, workersRequests: { used: 1, remaining: 99999, limit: 100000, resetsAt: cloudflare.workersRequests.resetsAt } },
    cloudflare);
  const [gh, dc, cf] = L.usageLimitRows(readings, now);
  assert.equal(gh.remaining, 3412);
  assert.equal(gh.limit, 5000);
  assert.equal(gh.leftPct, 68.24);
  assert.equal(gh.resetsAt, github.resetsAt);
  assert.equal(gh.measured, 'Measured 1:46 AM ET');
  assert.equal(dc.leftPct, 18);
  assert.equal(dc.measured, gh.measured);
  assert.equal(cf.workersRequests.used, 12345);
  assert.equal(cf.workersRequests.remaining, 87655);
  assert.equal(cf.pagesBuilds.used, 4);
  assert.equal(cf.pagesBuilds.remaining, 496);
  assert.equal(cf.measured, gh.measured);
  const cutoff = L.nextCheck(Date.parse(at)) + L.USAGE_GRACE_MIN * 60000;
  assert.ok(L.usageLimitRows(readings, cutoff).every(r => !r.stale));
  assert.equal(L.usageLimitRows(readings, cutoff + 1)[0].stale, true);
});

test('Desktop Commander stays fresh for 26 hours while GitHub and CloudFlare keep their existing cutoff', () => {
  const at = '2026-11-23T01:58:42-05:00';
  const t = Date.parse(at);
  const hour = 60 * 60 * 1000;
  const readings = parse({ ...github, at }, { ...desktop, at }, { ...cloudflare, at });
  const [gh, dc, cf] = L.usageLimitRows(readings, t + 25 * hour);
  assert.equal(dc.leftPct, 18);
  assert.equal(dc.stale, false);
  assert.equal(gh.stale, true);
  assert.equal(cf.stale, true);
  assert.equal(cf.workersRequests.used, 12345);
  assert.equal(L.usageLimitRows(readings, t + 27 * hour)[1].stale, true);
});

test('usage limits leave absent or invalid readings empty and preserve real zeroes', () => {
  assert.deepEqual(L.usageLimitRows(parse(), now), empty);
  assert.deepEqual(L.usageLimitRows(parse({ ...github, remaining: '3412' }, { ...desktop, leftPct: 101 }), now), empty);
  assert.equal(L.usageLimitRows(parse({ ...desktop, leftPct: 0 }), now)[1].leftPct, 0);
  const badCf = L.usageLimitRows(parse({ ...cloudflare, status: 'ERR' }, { ...cloudflare, source: '' },
    { ...cloudflare, workersRequests: { used: 10, remaining: 10, limit: 100000, resetsAt: cloudflare.workersRequests.resetsAt }, pagesBuilds: undefined }), now);
  assert.deepEqual(badCf[2], empty[2]);
  const zeroCf = L.usageLimitRows(parse({
    at, provider: 'CLOUDFLARE', status: 'OK', source: 'cloudflare api',
    workersRequests: { used: 0, remaining: 100000, limit: 100000, resetsAt: '2026-11-24T00:00:00Z' }
  }), now)[2];
  assert.equal(zeroCf.workersRequests.used, 0);
  assert.equal(zeroCf.pagesBuilds, undefined);
  const usedOnly = L.usageLimitRows(parse({
    at, provider: 'CLOUDFLARE', status: 'OK', source: 'cloudflare api',
    workersRequests: { used: 12 }
  }), now)[2];
  assert.equal(usedOnly.workersRequests.used, 12);
  assert.equal(usedOnly.workersRequests.limit, undefined);
});

test('limit readings leave AI usage rows and their status fallback unchanged', () => {
  const claude = { at, provider: 'CLAUDE', meter: 'weekly', usedPct: 71, status: 'OK' };
  const fallback = { as_of: at, services: [{ name: 'Claude', pct_used: 11 }] };
  assert.deepEqual(L.usageRows(parse(claude, github, desktop, cloudflare), now, fallback), L.usageRows(parse(claude), now, fallback));
  assert.deepEqual(L.usageRows(parse(github, desktop, cloudflare), now, fallback), L.usageRows([], now, fallback));
});
