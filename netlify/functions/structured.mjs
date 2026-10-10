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
  const meta = snapshot && snapshot.meta ? snapshot.meta : {};
  return {
    ok: true,
    service: 'structured-runtime',
    mode: 'writer-key',
    dataAvailable: !!snapshot,
    dataGate: 'writer_key_required',
    auth: 'writer_key',
    reason: snapshot ? 'Structured snapshot is loaded.' : 'Structured endpoint is reachable; no structured snapshot has been loaded yet.',
    snapshot: snapshot ? { jobs: Array.isArray(snapshot.jobs) ? snapshot.jobs.length : 0, generatedAt: meta.generatedAt || '', source: meta.source || '', writerFetchedAt: meta.writerFetchedAt || '', schema: meta.schema || '' } : null,
    endpoints: ['/api/structured/health', '/api/structured/counts', '/api/structured/jobs', '/api/structured/jobs/<PRIMARY_ID>'],
  };
}

function locked(snapshot) {
  return response({
    ok: false,
    service: 'structured-runtime',
    error: 'WRITER_KEY_REQUIRED',
    dataAvailable: !!snapshot,
    detail: 'Structured endpoints use the existing Writer key.',
  }, 401);
}

function normalizeLimitOffset(url) {
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 250) || 250));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
  return { limit, offset };
}


function parseMasterText(text) {
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const rows = lines.filter(line => {
    const cells = line.split(' | ');
    return cells.length >= 10 && /^\d+$/.test(cells[0] || '') && /^V2[A-Z]-/.test(cells[1] || '');
  });
  const jobs = rows.map((line, index) => {
    const cells = line.split(' | ');
    return {
      INV: cells[0] || '',
      PRIMARY_ID: cells[1] || '',
      COMPANY: cells[2] || '',
      TITLE: cells[3] || '',
      BUCKET: cells[4] || '',
      DISPOSITION: cells[5] || '',
      TAGS: cells[6] || '',
      REQ: cells[7] || '',
      LOCATION: cells[8] || '',
      SCOUT_ACTION: cells.slice(9).join(' | '),
      SOURCE_LINE: line,
      SOURCE_INDEX: index,
    };
  });
  const buckets = {};
  for (const job of jobs) buckets[job.BUCKET || 'UNKNOWN'] = (buckets[job.BUCKET || 'UNKNOWN'] || 0) + 1;
  return {
    ok: true,
    meta: { schema: 'pipeline-structured-snapshot-v1', source: 'writer-master', generatedAt: new Date().toISOString() },
    counts: { jobs: jobs.length, buckets },
    jobs,
  };
}

async function readWriterMaster(req, url) {
  const key = writerKey(req, url);
  if (!key) throw new Error('WRITER_KEY_REQUIRED');
  const r = await fetch(WRITER_URL + '?action=master&key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('WRITER_MASTER_HTTP_' + r.status);
  const j = await r.json();
  if (!j || j.ok !== true || typeof j.text !== 'string') throw new Error((j && j.error) || 'WRITER_MASTER_UNREADABLE');
  return j;
}

async function saveSnapshot(snapshot) {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  await store.set(SNAPSHOT_KEY, JSON.stringify(snapshot), { metadata: { generatedAt: snapshot.meta?.generatedAt || '', jobs: String(snapshot.jobs.length), schema: snapshot.meta?.schema || '' } });
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
    await saveSnapshot(body);
    return response({ ok: true, service: 'structured-runtime', loaded: true, jobs: body.jobs.length, counts: body.counts || {}, meta: body.meta || {} });
  }

  if (path === '/admin/import-from-writer') {
    if (req.method !== 'POST') return response({ ok: false, error: 'Use POST' }, 405);
    try {
      const master = await readWriterMaster(req, url);
      const built = parseMasterText(master.text);
      built.meta.writerFetchedAt = master.fetchedAt || master.modifiedTime || '';
      built.meta.writerId = master.id || '';
      await saveSnapshot(built);
      return response({ ok: true, service: 'structured-runtime', imported: true, jobs: built.jobs.length, counts: built.counts, meta: built.meta });
    } catch (e) {
      return response({ ok: false, service: 'structured-runtime', error: 'IMPORT_FROM_WRITER_FAILED', detail: String(e && e.message || e) }, 502);
    }
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
