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

const WRITER_URL = 'https://script.google.com/macros/s/AKfycbwShspSkto70NeFWjgTuyIf-W3EDgUmKmoWevE-jZq95pm6SAulrJYHX1HmiPg8tx3i/exec';

function writerKey(req, url) {
  return req.headers.get('x-writer-key') || url.searchParams.get('writerKey') || '';
}

async function writerKeyOk(req, url) {
  const key = writerKey(req, url);
  if (!key) return false;
  try {
    const r = await fetch(WRITER_URL + '?action=ping&key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return false;
    const j = await r.json();
    return j && j.ok === true;
  } catch {
    return false;
  }
}

async function hasReadAccess(req, url) {
  const expected = expectedToken();
  if (expected && token(req, url) === expected) return true;
  return writerKeyOk(req, url);
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
    auth: expectedToken() ? 'structured_token_configured' : 'writer_key_supported',
    reason: snapshot ? 'Structured snapshot is loaded; protected endpoints require token.' : 'Structured endpoint is reachable; no structured snapshot has been loaded yet.',
    endpoints: ['/api/structured/health', '/api/structured/counts', '/api/structured/jobs', '/api/structured/jobs/<PRIMARY_ID>'],
  };
}

function locked(snapshot) {
  return response({
    ok: false,
    service: 'structured-runtime',
    error: 'STRUCTURED_AUTH_REQUIRED',
    dataAvailable: !!snapshot,
    detail: 'Protected structured endpoints require either a personal structured read token or the existing Writer key. Public health remains harmless.',
  }, 401);
}

function normalizeLimitOffset(url) {
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 250) || 250));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
  return { limit, offset };
}

export default async function handler(req) {
  const { url, path } = route(req);
  if (!['GET', 'POST'].includes(req.method)) return response({ ok: false, error: 'Method not allowed' }, 405);

  const snapshot = await readSnapshot();

  if (path === '/' || path === '/health') return response(publicHealth(snapshot));

  if (!(await hasReadAccess(req, url))) return locked(snapshot);

  if (path === '/admin/snapshot') {
    if (req.method !== 'POST') return response({ ok: false, error: 'Use POST' }, 405);
    const body = await req.json();
    if (!body || body.ok !== true || !Array.isArray(body.jobs) || !body.counts) return response({ ok: false, error: 'INVALID_STRUCTURED_SNAPSHOT' }, 400);
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    await store.set(SNAPSHOT_KEY, JSON.stringify(body), { metadata: { generatedAt: body.meta?.generatedAt || '', jobs: String(body.jobs.length), schema: body.meta?.schema || '' } });
    return response({ ok: true, service: 'structured-runtime', loaded: true, jobs: body.jobs.length, counts: body.counts || {}, meta: body.meta || {} });
  }

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
