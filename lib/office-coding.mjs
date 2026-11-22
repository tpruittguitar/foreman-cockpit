import { validRoute } from './office-route.mjs';
// Prerequisite service. No production auth, store or execution adapter is installed.
// All dependencies are server-owned; never construct them from a request or chat log.
export const PROVIDERS = Object.freeze(['Claude', 'Hermes', 'Dot', 'Grok']);
const ID = /^[a-zA-Z0-9_-]{16,80}$/;
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
const disconnected = provider => ({ provider, connected: false, status: 'not_connected', label: 'Not connected' });
const keyFor = (p, b) => JSON.stringify([p.tenant, p.owner, b.provider, b.conversationId, b.requestId]);
function validScope(s) {
  return s && /^[\w-]+\/[\w.-]+$/.test(s.repository) && s.base === 'main' &&
    /^office-coding\/[a-zA-Z0-9_-]{16,80}$/.test(s.branch) && ID.test(s.sessionId);
}
export function createCodingService({ authenticate = async () => null, origin, adapters = {}, store } = {}) {
  return async function handle(request) {
    if (!['GET', 'POST'].includes(request.method)) return reply(405, { error: 'Method not allowed' });
    // authenticate must validate a server session (HttpOnly cookie), not chat unlock,
    // claimed roles, forwarded identity headers, log authors or a browser PAT.
    let principal;
    try { principal = await authenticate(request); } catch { /* fail closed */ }
    if (!principal || principal.role !== 'owner' || !ID.test(principal.owner) || !ID.test(principal.tenant)) return reply(401, { error: 'Owner sign-in required', status: 'not_connected' });
    const url = new URL(request.url);
    if (!origin || url.origin !== origin || (request.method === 'POST' && (request.headers.get('Origin') !== origin || request.headers.get('Sec-Fetch-Site') !== 'same-origin'))) return reply(403, { error: 'Same-origin owner request required' });
    const capabilities = PROVIDERS.map(provider => {
      const grants = Object.entries(principal.sessions?.[provider] || {}).filter(([id, scope]) => ID.test(id) && validScope(scope));
      if (!store || !Object.hasOwn(adapters, provider) || !adapters[provider] || grants.length !== 1) return disconnected(provider);
      return { provider, connected: true, conversationId: grants[0][0] };
    });
    if (request.method === 'GET' && !url.search) return reply(200, { providers: capabilities });
    let b;
    try {
      if (request.method === 'POST') {
        if (request.headers.get('Content-Type') !== 'application/json') return reply(415, { error: 'JSON required' });
        const raw = await request.text(); if (raw.length > 12000) return reply(413, { error: 'Request too large' });
        b = JSON.parse(raw);
      } else b = Object.fromEntries(url.searchParams);
    } catch { return reply(400, { error: 'Invalid request' }); }
    const allowed = request.method === 'POST' ? ['provider', 'conversationId', 'requestId', 'intent', 'text'] : ['provider', 'conversationId', 'requestId'];
    if (!b || Object.keys(b).some(k => !allowed.includes(k)) || !PROVIDERS.includes(b.provider) || !ID.test(b.conversationId) || !ID.test(b.requestId) ||
      (request.method === 'POST' && (b.intent !== 'owner_coding_request' || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 2000))) return reply(400, { error: 'Explicit coding request for one provider required' });
    // Resolve the grant from authenticated server state, never from client repo/branch fields.
    const grant = principal.sessions?.[b.provider]?.[b.conversationId];
    const adapter = Object.hasOwn(adapters, b.provider) ? adapters[b.provider] : null;
    if (!validScope(grant) || !adapter || !store) return reply(503, disconnected(b.provider));
    const key = keyFor(principal, b);
    const binding = { tenant: principal.tenant, owner: principal.owner, provider: b.provider, conversationId: b.conversationId,
      requestId: b.requestId, sessionId: grant.sessionId, repository: grant.repository, base: grant.base, branch: grant.branch };
    const project = job => ({ provider: b.provider, conversationId: b.conversationId, requestId: b.requestId,
      status: job.status, ...(job.draftUrl ? { draftUrl: job.draftUrl } : {}), ...(job.approach?{approach:job.approach}:{}), ...(job.outcome?{outcome:job.outcome}:{}) });
    try {
      if (request.method === 'POST') {
        const job = { ...binding, text: b.text.trim(), status: 'submitting', policy: { draftOnly: true, merge: false, deploy: false, expandAccess: false } };
        // Atomic put-if-absent is mandatory. Store implementation must serialize by key;
        // a timeout is indeterminate, not permission to retry the external dispatch.
        const admission = await store.claim(key, job);
        if (!admission.created) {
          const old = admission.job;
          if (!old || Object.keys(binding).some(k => old[k] !== binding[k]) || old.text !== job.text) return reply(409, { error: 'Request ID already used' });
          return reply(200, project(old));
        }
        try {
          // Adapter must enforce this scope with existing permissions, not prompt text.
          await adapter.submit(structuredClone(job));
          await store.update(key, { status: 'queued' });
          return reply(202, project({ status: 'queued' }));
        } catch {
          await store.update(key, { status: 'unknown' });
          return reply(202, project({ status: 'unknown' }));
        }
      }
      const job = await store.get(key);
      if (!job || Object.keys(binding).some(k => job[k] !== binding[k])) return reply(404, { error: 'Request not found' });
      if (['submitting', 'unknown', 'completed', 'finished', 'failed'].includes(job.status)) return reply(200, project(job));
      const event = await adapter.status(structuredClone(binding));
      if (!event || Object.keys(binding).some(k => event[k] !== binding[k]) || !['queued', 'running', 'awaiting_approval', 'awaiting_review', 'unknown', 'completed', 'finished', 'failed'].includes(event.status)) return reply(502, { error: 'Invalid coding status' });
      // Finished means the adapter independently verified a draft PR for this exact scope.
      // Never render arbitrary links, raw provider text, logs, tokens or transcripts.
      for(const field of ['approach','outcome'])if(event[field] && !validRoute(event[field]))return reply(502,{error:'Invalid route presentation'});
      if(event.status==='finished' && (!event.outcome || event.outcome.route==='draft_pr'))return reply(502,{error:'Typed outcome required'});
      let draftUrl;
      if (event.status === 'completed') {
        const pr = event.pullRequest;
        const expected = 'https://github.com/' + grant.repository + '/pull/';
        if (!pr || pr.draft !== true || pr.head !== grant.branch || pr.base !== grant.base ||
          typeof pr.url !== 'string' || !pr.url.startsWith(expected) || !/^[1-9][0-9]*$/.test(pr.url.slice(expected.length))) return reply(502, { error: 'Verified draft PR required' });
        draftUrl = pr.url;
      }
      const next = { status: event.status, ...(event.approach?{approach:event.approach}:{}), ...(event.outcome?{outcome:event.outcome}:{}), ...(draftUrl ? { draftUrl } : {}) };
      await store.update(key, next);
      return reply(200, project(next));
    } catch { return reply(503, { error: 'Coding service unavailable; do not resend with a new request ID', status: 'unknown' }); }
  };
}
