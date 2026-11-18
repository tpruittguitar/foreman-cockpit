/* Read-only GitHub API proxy for the office page: the browser calls /api/gh/<path> instead of api.github.com, so every
   visitor shares one edge-cached copy (60 s) and one budget. Only the reads the office makes are allowed (no open proxy).
   An optional GITHUB_TOKEN Pages secret raises the budget from 60 to 5000 requests/hour; without it the proxy still works. */
const OWNER = 'tpruittguitar', REPOS = '(?:foreman-cockpit|forge-coordination|forge-policy)';
const ALLOW = [
  new RegExp('^repos/' + OWNER + '/' + REPOS + '/pulls$'),
  new RegExp('^repos/' + OWNER + '/' + REPOS + '/commits/[0-9a-f]{40}/check-runs$'),
  new RegExp('^repos/' + OWNER + '/forge-coordination/contents/(?:asks/open|control(?:/OFFICE_TRAINING\\.json)?)$')
];
const QUERY = new Set(['state', 'sort', 'direction', 'per_page', 'ref']), TTL = 60, STALE_TTL = 6 * 3600;
const PASS = ['content-type', 'etag', 'last-modified', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
export function ghTarget(path, search) {
  if (!ALLOW.some(r => r.test(path))) return null;
  const q = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(search)) { if (!QUERY.has(k) || !/^[\w.-]{1,40}$/.test(v)) return null; q.set(k, v); }
  q.sort(); const s = q.toString();
  return 'https://api.github.com/' + path + (s ? '?' + s : '');
}
export async function onRequestGet({ request, env, params }) {
  const path = [].concat(params && params.path || []).join('/'), target = ghTarget(path, new URL(request.url).search);
  if (!target) return Response.json({ ok: false, error: 'Path not allowed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const accept = request.headers.get('Accept') === 'application/vnd.github.raw' ? 'application/vnd.github.raw' : 'application/vnd.github+json';
  const cache = globalThis.caches && globalThis.caches.default, key = new Request(target + (target.includes('?') ? '&' : '?') + 'accept=' + encodeURIComponent(accept));
  const staleKey = new Request(key.url + '&stale=1');
  if (cache) { const hit = await cache.match(key); if (hit) { const h = new Response(hit.body, hit); h.headers.set('X-Office-Cache', 'HIT'); return h; } }
  const headers = { Accept: accept, 'User-Agent': 'foreman-cockpit-office', 'X-GitHub-Api-Version': '2022-11-28' };
  if (env && env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + env.GITHUB_TOKEN;
  let up;
  try { up = await fetch(target, { headers, signal: AbortSignal.timeout(10000) }); }
  catch (e) { return Response.json({ ok: false, error: 'GitHub unreachable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
  const out = new Headers();
  for (const h of PASS) { const v = up.headers.get(h); if (v) out.set(h, v); }
  out.set('Cache-Control', up.ok ? 'public, max-age=' + TTL + ', s-maxage=' + TTL : 'no-store');
  out.set('X-Office-Cache', 'MISS');
  if (cache && (up.status === 403 || up.status === 429)) {
    const old = await cache.match(staleKey); /* rate limited: the last good copy (up to 6 h) beats an error */
    if (old) { const h = new Response(old.body, { status: 200, headers: old.headers }); h.headers.set('Cache-Control', 'no-store'); h.headers.set('X-Office-Cache', 'STALE'); return h; }
  }
  const body = await up.arrayBuffer(), res = new Response(body, { status: up.status, headers: out });
  if (cache && up.ok) {
    try { await cache.put(key, res.clone()); const keep = new Headers(out); keep.set('Cache-Control', 'public, max-age=' + STALE_TTL); await cache.put(staleKey, new Response(body, { headers: keep })); } catch (e) { /* cache is best effort */ }
  }
  return res;
}
