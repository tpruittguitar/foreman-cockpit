// Office GitHub reads via the cached Pages function functions/api/gh/[[path]].js. Mocked fetch and cache only; no
// production calls. Run: node --test tests/office-gh-proxy.test.js
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../functions/api/gh/[[path]].js'), 'utf8');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
function load(fetch, cache) {
  const c = { fetch, URL, URLSearchParams, Request, Response, Headers, AbortSignal, encodeURIComponent, Set, RegExp };
  c.globalThis = c; if (cache) c.caches = { default: cache };
  vm.createContext(c);
  vm.runInContext(source.replace(/export (async )?function/g, '$1function') + ';this.h=onRequestGet;this.t=ghTarget;', c);
  return c;
}
function memCache() { const m = new Map(); return { m, match: async k => { const r = m.get(k.url); return r ? r.clone() : undefined; }, put: async (k, r) => { m.set(k.url, r); } }; }
const call = (c, p, env) => { const u = new URL('https://cockpit.test/api/gh/' + p); return c.h({ request: new Request(u), env: env || {}, params: { path: u.pathname.slice(8).split('/') } }); };
const PULLS = 'repos/tpruittguitar/foreman-cockpit/pulls?state=all&sort=updated&direction=desc&per_page=50';

test('allowlist: only the office reads pass; other paths, repos, owners and query keys are refused before upstream', async () => {
  let calls = 0; const c = load(async () => { calls++; return new Response('[]'); });
  for (const p of ['users/tpruittguitar', 'repos/someone/foreman-cockpit/pulls', 'repos/tpruittguitar/other/pulls', 'repos/tpruittguitar/forge-coordination/contents/control/SECRET.json',
    'repos/tpruittguitar/foreman-cockpit/commits/abc/check-runs', 'repos/tpruittguitar/forge-coordination/actions/workflows/other.yml/runs', 'repos/tpruittguitar/foreman-cockpit/actions/workflows/automations-status.yml/runs', 'repos/tpruittguitar/foreman-cockpit/pulls?access_token=x', 'repos/tpruittguitar/foreman-cockpit/issues'])
    assert.equal((await call(c, p)).status, 403, p);
  assert.equal(calls, 0);
  for (const p of [PULLS, 'repos/tpruittguitar/forge-policy/commits/' + 'a'.repeat(40) + '/check-runs?per_page=50', 'repos/tpruittguitar/forge-coordination/contents/asks/open', 'repos/tpruittguitar/forge-coordination/contents/control?ref=main', 'repos/tpruittguitar/forge-coordination/contents/control/OFFICE_TRAINING.json?ref=main', 'repos/tpruittguitar/forge-coordination/actions/workflows/automations-status.yml/runs?status=success&per_page=1'])
    assert.equal((await call(c, p)).status, 200, p);
});
test('upstream status, body and rate-limit headers pass through; success is edge-cached 60 s and served from cache', async () => {
  const seen = [], cache = memCache();
  const c = load(async (u, o) => { seen.push([u, o.headers]); return new Response('[{"n":1}]', { status: 200, headers: { 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '59', ETag: '"e"' } }); }, cache);
  const r1 = await call(c, PULLS);
  assert.equal(r1.status, 200); assert.equal(await r1.text(), '[{"n":1}]');
  assert.match(r1.headers.get('Cache-Control'), /s-maxage=60/); assert.equal(r1.headers.get('X-RateLimit-Remaining'), '59'); assert.equal(r1.headers.get('X-Office-Cache'), 'MISS');
  assert.equal(seen[0][0], 'https://api.github.com/repos/tpruittguitar/foreman-cockpit/pulls?direction=desc&per_page=50&sort=updated&state=all');
  assert.equal(seen[0][1].Authorization, undefined, 'works with no token');
  const r2 = await call(c, PULLS); assert.equal(r2.headers.get('X-Office-Cache'), 'HIT'); assert.equal(await r2.text(), '[{"n":1}]'); assert.equal(seen.length, 1, 'second read from the edge cache');
});
test('rate limited upstream serves the last good copy marked STALE instead of an error', async () => {
  const cache = memCache(); let n = 0;
  const c = load(async () => (n++ ? new Response('{"message":"rate"}', { status: 403 }) : new Response('[{"n":1}]', { status: 200 })), cache);
  assert.equal((await call(c, PULLS)).status, 200);
  for (const k of [...cache.m.keys()]) if (!k.includes('stale=1')) cache.m.delete(k);
  const r = await call(c, PULLS); assert.equal(r.status, 200); assert.equal(r.headers.get('X-Office-Cache'), 'STALE'); assert.equal(await r.text(), '[{"n":1}]');
});
test('errors pass through uncached; optional GITHUB_TOKEN is sent only from the server', async () => {
  const cache = memCache(); let auth;
  const c = load(async (u, o) => { auth = o.headers.Authorization; return new Response('{"message":"rate limited"}', { status: 403, headers: { 'X-RateLimit-Remaining': '0' } }); }, cache);
  const r = await call(c, 'repos/tpruittguitar/forge-coordination/contents/asks/open', { GITHUB_TOKEN: 'tok' });
  assert.equal(r.status, 403); assert.equal(r.headers.get('Cache-Control'), 'no-store'); assert.equal(r.headers.get('X-RateLimit-Remaining'), '0');
  assert.equal(auth, 'Bearer tok'); assert.equal(cache.m.size, 0);
  const down = load(async () => { throw new Error('net'); }); assert.equal((await call(down, PULLS)).status, 502);
});
test('office.js reads GitHub only through /api/gh and holds no token', () => {
  assert.doesNotMatch(office.replace(/\/\/[^\n]*/g, ''), /https:\/\/api\.github\.com/);
  assert.match(office, /const GH_API = '\/api\/gh\/';/);
  for (const u of ['${GH_API}repos/${OWNER}/${repo}/pulls?', '${GH_API}repos/${OWNER}/${repo}/commits/${sha}/check-runs', '${GH_API}repos/${OWNER}/forge-coordination/contents/asks/open']) assert.ok(office.includes(u), u);
  assert.match(office, /createJsonSource\(\{ apiUrl: API_FILE\(TRAIN_PATH\), rawUrl: RAW_FILE\(TRAIN_PATH\), gate, fetch: fetchFn \}\)/);
  assert.doesNotMatch(office, /GITHUB_TOKEN|Authorization/);
});
