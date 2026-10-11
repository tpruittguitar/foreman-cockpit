const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const SNAPSHOT_KEY = 'snapshot/current';
const WRITER_URL = 'https://script.google.com/macros/s/AKfycbwShspSkto70NeFWjgTuyIf-W3EDgUmKmoWevE-jZq95pm6SAulrJYHX1HmiPg8tx3i/exec';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

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

function snapshotStore(env) {
  return env && env.PIPELINE_SNAPSHOT_KV ? env.PIPELINE_SNAPSHOT_KV : null;
}

async function readSnapshot(env) {
  const store = snapshotStore(env);
  if (!store) return null;
  const raw = await store.get(SNAPSHOT_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function saveSnapshot(env, snapshot) {
  const store = snapshotStore(env);
  if (!store) return false;
  await store.put(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return true;
}

function route(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/structured/, '') || '/';
  return { url, path };
}

function publicHealth(snapshot) {
  const meta = snapshot && snapshot.meta ? snapshot.meta : {};
  return {
    ok: true,
    service: 'structured-runtime',
    platform: 'cloudflare-pages',
    mode: 'snapshot-read',
    dataAvailable: !!snapshot,
    dataGate: snapshot ? 'public_snapshot_read' : 'writer_key_required_for_live_fallback',
    auth: snapshot ? 'none_for_snapshot_reads' : 'writer_key_for_live_fallback',
    reason: snapshot ? 'Structured snapshot is loaded.' : 'Structured endpoint is reachable; no structured snapshot has been loaded yet.',
    snapshot: snapshot ? {
      jobs: Array.isArray(snapshot.jobs) ? snapshot.jobs.length : 0,
      generatedAt: meta.generatedAt || '',
      source: meta.source || '',
      writerFetchedAt: meta.writerFetchedAt || '',
      schema: meta.schema || '',
    } : null,
    endpoints: ['/api/structured/health', '/api/structured/counts', '/api/structured/jobs', '/api/structured/jobs/<PRIMARY_ID>'],
  };
}

function locked(snapshot) {
  return response({
    ok: false,
    service: 'structured-runtime',
    error: 'WRITER_KEY_REQUIRED',
    dataAvailable: !!snapshot,
    detail: snapshot ? 'Snapshot reads are public read-only. Live Writer fallback still requires authorization.' : 'No structured snapshot is loaded; live Writer fallback requires authorization.',
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

export async function onRequest(context) {
  const req = context.request;
  const { url, path } = route(req);
  if (!['GET', 'POST'].includes(req.method)) return response({ ok: false, error: 'Method not allowed' }, 405);

  let snapshot = null;
  try {
    snapshot = await readSnapshot(context.env);
  } catch (e) {
    snapshot = null;
  }

  if (path === '/' || path === '/health') return response(publicHealth(snapshot));

  async function currentSnapshot() {
    if (snapshot) return snapshot;
    if (!(await writerKeyOk(req, url))) throw Object.assign(new Error('WRITER_KEY_REQUIRED'), { locked: true });
    const master = await readWriterMaster(req, url);
    const built = parseMasterText(master.text);
    built.meta.writerFetchedAt = master.fetchedAt || master.modifiedTime || '';
    built.meta.writerId = master.id || '';
    return built;
  }

  const readOnlyPath = path === '/counts' || path === '/jobs' || /^\/jobs\/[^/]+$/.test(path);
  if (!readOnlyPath && !(await writerKeyOk(req, url))) return locked(snapshot);

  if (path === '/admin/snapshot') {
    if (req.method !== 'POST') return response({ ok: false, error: 'Use POST' }, 405);
    try {
      const snapshot = await req.json();
      if (!snapshot || !Array.isArray(snapshot.jobs)) return response({ ok: false, error: 'INVALID_SNAPSHOT', detail: 'Snapshot must include jobs array.' }, 400);
      if (!snapshot.meta) snapshot.meta = {};
      snapshot.meta.storedAt = new Date().toISOString();
      const stored = await saveSnapshot(context.env, snapshot);
      return response({ ok: true, service: 'structured-runtime', imported: true, stored, jobs: snapshot.jobs.length, counts: snapshot.counts || {}, meta: snapshot.meta });
    } catch (e) {
      return response({ ok: false, service: 'structured-runtime', error: 'SNAPSHOT_UPLOAD_FAILED', detail: String(e && e.message || e) }, 502);
    }
  }

  if (path === '/admin/import-from-writer') {
    if (req.method !== 'POST') return response({ ok: false, error: 'Use POST' }, 405);
    try {
      const master = await readWriterMaster(req, url);
      const built = parseMasterText(master.text);
      built.meta.writerFetchedAt = master.fetchedAt || master.modifiedTime || '';
      built.meta.writerId = master.id || '';
      const stored = await saveSnapshot(context.env, built);
      return response({ ok: true, service: 'structured-runtime', imported: true, stored, jobs: built.jobs.length, counts: built.counts, meta: built.meta });
    } catch (e) {
      return response({ ok: false, service: 'structured-runtime', error: 'IMPORT_FROM_WRITER_FAILED', detail: String(e && e.message || e) }, 502);
    }
  }

  if (path === '/counts') {
    let current;
    try { current = await currentSnapshot(); } catch (e) { if (e && e.locked) return locked(snapshot); throw e; }
    return response({ ok: true, service: 'structured-runtime', counts: current.counts || {}, meta: current.meta || {}, source: snapshot ? 'snapshot' : 'writer-live' });
  }

  if (path === '/jobs') {
    let current;
    try { current = await currentSnapshot(); } catch (e) { if (e && e.locked) return locked(snapshot); throw e; }
    const { limit, offset } = normalizeLimitOffset(url);
    const jobs = Array.isArray(current.jobs) ? current.jobs : [];
    return response({ ok: true, service: 'structured-runtime', limit, offset, total: jobs.length, jobs: jobs.slice(offset, offset + limit), meta: current.meta || {}, source: snapshot ? 'snapshot' : 'writer-live' });
  }

  const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch) {
    let current;
    try { current = await currentSnapshot(); } catch (e) { if (e && e.locked) return locked(snapshot); throw e; }
    const id = decodeURIComponent(jobMatch[1]);
    const jobs = Array.isArray(current.jobs) ? current.jobs : [];
    const job = jobs.find(j => String(j.PRIMARY_ID || j.id || '') === id);
    if (!job) return response({ ok: false, error: 'JOB_NOT_FOUND', id }, 404);
    return response({ ok: true, service: 'structured-runtime', job, meta: current.meta || {}, source: snapshot ? 'snapshot' : 'writer-live' });
  }

  return response({ ok: false, error: 'Not found', path }, 404);
}
