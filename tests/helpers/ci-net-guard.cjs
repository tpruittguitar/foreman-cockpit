/* CI-only guard (browser-tests-compare workflow, 2026-11-02): no test may reach the production Writer (Google Apps Script).
   Loaded with NODE_OPTIONS=--require before every browser test, on both the PR branch and the base branch.
   - Node: http/https/fetch to an Apps Script host throws.
   - Chromium: every browser launched resolves Apps Script hosts to nothing, and every context aborts requests to them.
   Every blocked attempt is appended to $NET_GUARD_LOG so the run summary can show it. Other hosts are untouched. */
const fs = require('fs'), http = require('http'), https = require('https'), Module = require('module');
const LOG = process.env.NET_GUARD_LOG || '';
const BLOCKED = /(^|\.)script\.google\.com$|(^|\.)script\.googleusercontent\.com$|(^|\.)googleusercontent\.com$|(^|\.)script\.googleapis\.com$/i;
const note = (how, host) => { if (LOG) try { fs.appendFileSync(LOG, 'BLOCKED ' + how + ' ' + host + ' (' + (process.argv[1] || '') + ')\n'); } catch (e) {} };
function hostOf(a) { try { if (typeof a === 'string' || a instanceof URL) return new URL(a).hostname; return a && (a.hostname || String(a.host || '').replace(/:\d+$/, '')); } catch (e) { return ''; } }
for (const m of [http, https]) for (const k of ['request', 'get']) {
  const o = m[k];
  m[k] = function (a, ...r) { const h = hostOf(a); if (h && BLOCKED.test(h)) { note('node ' + k, h); throw new Error('ci-net-guard: blocked ' + h); } return o.call(this, a, ...r); };
}
if (globalThis.fetch) {
  const f = globalThis.fetch;
  globalThis.fetch = (u, ...r) => { const h = hostOf(u && typeof u === 'object' && u.url ? u.url : u); if (h && BLOCKED.test(h)) { note('node fetch', h); return Promise.reject(new Error('ci-net-guard: blocked ' + h)); } return f(u, ...r); };
}
const RULES = 'MAP script.google.com ~NOTFOUND, MAP *.script.google.com ~NOTFOUND, MAP *.googleusercontent.com ~NOTFOUND, MAP script.googleapis.com ~NOTFOUND';
const orig = Module.prototype.require;
Module.prototype.require = function (id) {
  const x = orig.apply(this, arguments);
  if (/(^|\/)playwright$/.test(id) && x && x.chromium && !x.chromium.__ciGuard) {
    const launch = x.chromium.launch.bind(x.chromium);
    x.chromium.launch = async (o = {}) => {
      const b = await launch({ ...o, args: [...(o.args || []), '--host-resolver-rules=' + RULES] }), nc = b.newContext.bind(b), np = b.newPage.bind(b);
      const guard = async c => { await c.route(u => BLOCKED.test(u.hostname), r => { note('browser', new URL(r.request().url()).hostname); return r.abort(); }); return c; };
      b.newContext = async o2 => guard(await nc(o2));
      b.newPage = async o2 => { const p = await np(o2); await guard(p.context()); return p; };
      return b;
    };
    x.chromium.__ciGuard = true;
  }
  return x;
};
