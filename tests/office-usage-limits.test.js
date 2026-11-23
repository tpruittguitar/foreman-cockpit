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
const parse = (...rows) => L.parseReadings(rows.map(r => JSON.stringify(r)).join('\n'));

test('usage limits select the newest valid reading per provider regardless of file order', () => {
  const readings = parse(github, { ...github, at: older, remaining: 4500 },
    { ...desktop, at: older, leftPct: 21 }, desktop,
    { ...github, at: '2026-11-23T07:00:00Z', meter: 'search_api' });
  const [gh, dc] = L.usageLimitRows(readings, now);
  assert.equal(gh.remaining, 3412);
  assert.equal(gh.limit, 5000);
  assert.equal(gh.leftPct, 68.24);
  assert.equal(gh.resetsAt, github.resetsAt);
  assert.equal(gh.measured, 'Measured 1:46 AM ET');
  assert.equal(dc.leftPct, 18);
  assert.equal(dc.measured, gh.measured);
  const cutoff = L.nextCheck(Date.parse(at)) + L.USAGE_GRACE_MIN * 60000;
  assert.ok(L.usageLimitRows(readings, cutoff).every(r => !r.stale));
  assert.equal(L.usageLimitRows(readings, cutoff + 1)[0].stale, true);
});

test('Desktop Commander stays fresh for 26 hours while GitHub keeps its existing cutoff', () => {
  const at = '2026-11-23T01:58:42-05:00';
  const t = Date.parse(at);
  const hour = 60 * 60 * 1000;
  const readings = parse({ ...github, at }, { ...desktop, at });
  const [gh, dc] = L.usageLimitRows(readings, t + 25 * hour);
  assert.equal(dc.leftPct, 18);
  assert.equal(dc.stale, false);
  assert.equal(gh.stale, true);
  assert.equal(L.usageLimitRows(readings, t + 27 * hour)[1].stale, true);
});

test('usage limits leave absent or invalid readings empty and preserve real zeroes', () => {
  const empty = [{ name: 'GitHub', leftPct: null }, { name: 'Desktop Commander', leftPct: null }];
  assert.deepEqual(L.usageLimitRows(parse(), now), empty);
  assert.deepEqual(L.usageLimitRows(parse({ ...github, remaining: '3412' }, { ...desktop, leftPct: 101 }), now), empty);
  assert.equal(L.usageLimitRows(parse({ ...desktop, leftPct: 0 }), now)[1].leftPct, 0);
});

test('limit readings leave AI usage rows and their status fallback unchanged', () => {
  const claude = { at, provider: 'CLAUDE', meter: 'weekly', usedPct: 71, status: 'OK' };
  const fallback = { as_of: at, services: [{ name: 'Claude', pct_used: 11 }] };
  assert.deepEqual(L.usageRows(parse(claude, github, desktop), now, fallback), L.usageRows(parse(claude), now, fallback));
  assert.deepEqual(L.usageRows(parse(github, desktop), now, fallback), L.usageRows([], now, fallback));
});
