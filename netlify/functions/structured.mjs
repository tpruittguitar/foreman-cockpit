import { getStore } from '@netlify/blobs';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const SNAPSHOT_KEY = 'snapshot/current';
const STORE_NAME = 'pipeline-structured-runtime-v1';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearer(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function token(req, url) {
  return req.headers.get('x-structured-token') || bearer(req) || url.searchParams.get('token') || '';
}

function env(name) {
  try {
    if (globalThis.Netlify && globalThis.Netlify.env && typeof globalThis.Netlify.env.get === 'function') return globalThis.Netlify.env.get(name) || '';
  } catch {}
  return process.env[name] || '';
}

function expectedToken() {
  return env('STRUCTURED_READ_TOKEN') || env('PIPELINE_STRUCTURED_TOKEN') || '';
}

function hasReadAccess(req, url) {
  const expected = expectedToken();
  return !!expected && token(req, url) === expected;
}

async function readSnapshot() {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  return await store.get(SNAPSHOT_KEY, { type: 'json' });
}

function route(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/structured/, '').replace(/^\/\.netlify\/functions\/structured/, '') || '/';
  return { url, path };
}

function publicHealth(snapshot) {
  return {
    ok: true,
    service: 'structured-runtime',
    mode: 'token-gated',
    dataAvailable: !!snapshot,
    dataGate: 'token_required',
    auth: expectedToken() ? 'configured' : 'not_configured',
    reason: snapshot ? 'Structured snapshot is loaded; protected endpoints require token.' : 'Structured endpoint is reachable; no structured snapshot has been loaded yet.',
    endpoints: ['/api/structured/health', '/api/structured/counts', '/api/structured/jobs', '/api/structured/jobs/<PRIMARY_ID>'],
  };
}

function locked(snapshot) {
  return response({
    ok: false,
    service: 'structured-runtime',
    error: expectedToken() ? 'STRUCTURED_TOKEN_REQUIRED' : 'STRUCTURED_TOKEN_NOT_CONFIGURED',
    dataAvailable: !!snapshot,
    detail: 'Protected structured endpoints require a personal structured read token. Public health remains harmless.',
  }, 401);
}

function normalizeLimitOffset(url) {
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 250) || 250));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
  return { limit, offset };
}

export default async function handler(req) {
  const { url, path } = route(req);
  if (req.method !== 'GET') return response({ ok: false, error: 'Method not allowed' }, 405);

  const snapshot = await readSnapshot();

  if (path === '/' || path === '/health') return response(publicHealth(snapshot));

  if (!hasReadAccess(req, url)) return locked(snapshot);
  if (!snapshot) return response({ ok: false, service: 'structured-runtime', error: 'STRUCTURED_SNAPSHOT_NOT_LOADED', dataAvailable: false }, 503);

  if (path === '/counts') {
    return response({ ok: true, service: 'structured-runtime', counts: snapshot.counts || {}, meta: snapshot.meta || {} });
  }

  if (path === '/jobs') {
    const { limit, offset } = normalizeLimitOffset(url);
    const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
    return response({ ok: true, service: 'structured-runtime', limit, offset, total: jobs.length, jobs: jobs.slice(offset, offset + limit), meta: snapshot.meta || {} });
  }

  const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch) {
    const id = decodeURIComponent(jobMatch[1]);
    const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
    const job = jobs.find(j => String(j.PRIMARY_ID || j.id || '') === id);
    if (!job) return response({ ok: false, error: 'JOB_NOT_FOUND', id }, 404);
    return response({ ok: true, service: 'structured-runtime', job, meta: snapshot.meta || {} });
  }

  return response({ ok: false, error: 'Not found', path }, 404);
}

export const config = { path: ['/api/structured', '/api/structured/*'] };
