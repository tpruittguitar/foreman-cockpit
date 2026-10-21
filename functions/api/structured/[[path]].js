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

/* REV-075 (2026-10-19): the snapshot is stored as a small head plus 250-job shards.
 * Until REV-075 every request (health, counts, each 250-row page, even the import) read and JSON.parsed the
 * whole multi-megabyte snapshot. At 1,872 jobs that exceeded the Cloudflare Worker CPU limit and Cloudflare
 * answered 503 "Worker exceeded resource limits" as an HTML page (Pipeline Explorer: "Unexpected token '<'").
 * Now reads parse only the small head, and aligned page reads return the stored shard text with no parse. */
const SHARD_SIZE = 250;
const HEAD_KEY = 'snapshot/v2/head';
function shardKey(gen, i) { return 'snapshot/v2/' + gen + '/' + i; }   /* REV-075 v2 layout, read only for a head written before REV-152 */

/* REV-152 (Tim 2026-10-21 15:32 ET "Build 142", renumbered: 142 was taken): the free Workers KV plan allows 1,000 deletes
 * and 1,000 writes a day. Every import wrote a new generation (8 puts) and deleted the old one (8 deletes), and the Explorer
 * imports after every save and on every page load, so on 2026-10-21 deletes ran out ("KV requests are temporarily blocked",
 * reset 00:00 UTC). Now each shard is stored under a name made from its own content: a shard that did not change is not
 * written again (a ruling changes one shard, so an import costs about 2 writes), a content-named key never changes value
 * (no stale-cache or two-writer mix-ups), and nothing is deleted: every shard carries a 2-day expiry, shards still in use
 * are re-written once a day, and shards left behind by a newer import simply expire. Expiry costs no KV operation. */
const SHARD_TTL_S = 2 * 86400;
const SHARD_REFRESH_MS = 86400000;            /* re-put a shard still in use once it is a day old, well inside its 2-day expiry */
const HEAD_UNCHANGED_REFRESH_MS = 15 * 60000; /* an identical import re-writes the head (new timestamps) at most every 15 min */
function contentKey(hash) { return 'snapshot/v3/s/' + hash; }

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

function headShardKey(head, i) { return head.keys ? head.keys[i] : shardKey(head.gen, i); }

async function readHead(env) {
  const store = snapshotStore(env);
  if (!store) return null;
  const raw = await store.get(HEAD_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function readShardText(env, head, i) {
  const raw = await snapshotStore(env).get(headShardKey(head, i));
  if (raw == null) throw new Error('SNAPSHOT_SHARD_MISSING_' + i);
  return raw;
}

async function readAllJobs(env, head) {
  let jobs = [];
  for (let i = 0; i < head.shards; i++) jobs = jobs.concat(JSON.parse(await readShardText(env, head, i)));
  return jobs;
}

/* Returns { stored, mode, written, deleted } — written/deleted count KV operations so the cost of each import is visible. */
async function saveSnapshot(env, snapshot) {
  const store = snapshotStore(env);
  if (!store) return false;
  const jobs = Array.isArray(snapshot.jobs) ? snapshot.jobs : [];
  const previous = await readHead(env).catch(() => null);
  const now = Date.now();
  const prevAt = {};
  if (previous && previous.keys) previous.keys.forEach((k, i) => { prevAt[k] = (previous.putAt && previous.putAt[i]) || 0; });
  const shards = Math.ceil(jobs.length / SHARD_SIZE);
  const keys = [], putAt = [];
  let written = 0, deleted = 0;
  for (let i = 0; i < shards; i++) {
    const text = JSON.stringify(jobs.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE));
    const key = contentKey(await sha(text));
    const seen = prevAt[key];
    if (seen && now - seen < SHARD_REFRESH_MS) { keys.push(key); putAt.push(seen); continue; }
    await store.put(key, text, { expirationTtl: SHARD_TTL_S });
    written++; keys.push(key); putAt.push(now);
  }
  const same = !!(previous && previous.keys && written === 0 && previous.keys.length === keys.length && previous.keys.every((k, i) => k === keys[i]));
  if (same && now - (previous.at || 0) < HEAD_UNCHANGED_REFRESH_MS) return { stored: true, mode: 'UNCHANGED', written: 0, deleted: 0 };
  const head = { v: 3, keys, putAt, at: now, shardSize: SHARD_SIZE, shards, total: jobs.length, meta: snapshot.meta || {}, counts: snapshot.counts || {}, ok: snapshot.ok !== false, v1Retired: true };
  await store.put(HEAD_KEY, JSON.stringify(head));   /* head last: readers switch to the new shard list in one step */
  written++;
  /* One-time clean-up of the pre-REV-152 layout; after that no import deletes anything. */
  if (!previous || !previous.v1Retired) {
    if (previous && previous.gen) for (let i = 0; i < (previous.shards || 0); i++) { try { await store.delete(shardKey(previous.gen, i)); deleted++; } catch {} }
    try { await store.delete(SNAPSHOT_KEY); deleted++; } catch {}   /* retire the single-blob v1 copy so a rollback re-imports instead of serving it stale */
  }
  return { stored: true, mode: same ? 'UNCHANGED_HEAD_REFRESHED' : 'STORED', written, deleted };
}

/* REV-152: a shard can be missing when it expired (no import for 2 days) or has not reached this location yet. Answer
 * NOT_LOADED so the Explorer re-imports once (its existing path) and meanwhile reads the master from the Writer. */
function shardMissing(e) {
  return response({ ok: false, service: 'structured-runtime', error: 'STRUCTURED_SNAPSHOT_NOT_LOADED', detail: String(e && e.message || e) }, 409);
}

function jobsPageResponse(head, rawJobs, limit, offset) {
  const tail = ',"meta":' + JSON.stringify(head.meta || {}) + ',"source":"snapshot"}';
  return new Response('{"ok":true,"service":"structured-runtime","limit":' + limit + ',"offset":' + offset + ',"total":' + head.total + ',"jobs":' + rawJobs + tail, { status: 200, headers: JSON_HEADERS });
}

async function snapshotJobsPage(env, head, limit, offset) {
  const end = Math.min(head.total, offset + limit);
  if (offset >= end) return jobsPageResponse(head, '[]', limit, offset);
  const first = Math.floor(offset / head.shardSize), last = Math.floor((end - 1) / head.shardSize);
  const aligned = offset % head.shardSize === 0 && (end % head.shardSize === 0 || end === head.total);
  if (aligned) {
    const parts = [];
    for (let i = first; i <= last; i++) { const t = (await readShardText(env, head, i)).trim(); if (t.length > 2) parts.push(t.slice(1, -1)); }
    return jobsPageResponse(head, '[' + parts.join(',') + ']', limit, offset);
  }
  let jobs = [];
  for (let i = first; i <= last; i++) jobs = jobs.concat(JSON.parse(await readShardText(env, head, i)));
  const start = offset - first * head.shardSize;
  return jobsPageResponse(head, JSON.stringify(jobs.slice(start, start + (end - offset))), limit, offset);
}

function route(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/structured/, '') || '/';
  return { url, path };
}

function publicHealth(snapshot) {   /* snapshot = head */
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
      jobs: snapshot.total || 0,
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

  let snapshot = null;   /* the small head only; job shards are read per request */
  try {
    snapshot = await readHead(context.env);
  } catch (e) {
    snapshot = null;
  }

  if (path === '/' || path === '/health') return response(publicHealth(snapshot));

  async function currentSnapshot() {
    if (snapshot) return { meta: snapshot.meta, counts: snapshot.counts, jobs: await readAllJobs(context.env, snapshot) };
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
      const kv = await saveSnapshot(context.env, snapshot);
      return response({ ok: true, service: 'structured-runtime', imported: true, stored: !!(kv && kv.stored), kv, jobs: snapshot.jobs.length, counts: snapshot.counts || {}, meta: snapshot.meta });
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
      const kv = await saveSnapshot(context.env, built);
      return response({ ok: true, service: 'structured-runtime', imported: true, stored: !!(kv && kv.stored), kv, jobs: built.jobs.length, counts: built.counts, meta: built.meta });
    } catch (e) {
      return response({ ok: false, service: 'structured-runtime', error: 'IMPORT_FROM_WRITER_FAILED', detail: String(e && e.message || e) }, 502);
    }
  }

  if (path === '/counts') {
    if (snapshot) return response({ ok: true, service: 'structured-runtime', counts: snapshot.counts || {}, meta: snapshot.meta || {}, source: 'snapshot' });
    let current;
    try { current = await currentSnapshot(); } catch (e) { if (e && e.locked) return locked(snapshot); throw e; }
    return response({ ok: true, service: 'structured-runtime', counts: current.counts || {}, meta: current.meta || {}, source: snapshot ? 'snapshot' : 'writer-live' });
  }

  if (path === '/jobs') {
    const { limit, offset } = normalizeLimitOffset(url);
    if (snapshot) {
      try { return await snapshotJobsPage(context.env, snapshot, limit, offset); }
      catch (e) { if (!/SNAPSHOT_SHARD_MISSING/.test(String(e && e.message))) throw e; return shardMissing(e); }
    }
    /* No snapshot: say so (the Explorer then imports once) rather than parse the live master on every page. */
    return response({ ok: false, service: 'structured-runtime', error: 'STRUCTURED_SNAPSHOT_NOT_LOADED', detail: 'No structured snapshot is stored; POST /api/structured/admin/import-from-writer first.' }, 409);
  }

  const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch && snapshot) {
    const id = decodeURIComponent(jobMatch[1]);
    const needle = JSON.stringify(id);
    for (let i = 0; i < snapshot.shards; i++) {
      let raw;
      try { raw = await readShardText(context.env, snapshot, i); } catch (e) { if (!/SNAPSHOT_SHARD_MISSING/.test(String(e && e.message))) throw e; return shardMissing(e); }
      if (raw.indexOf(needle) < 0) continue;
      const job = JSON.parse(raw).find(j => String(j.PRIMARY_ID || j.id || '') === id);
      if (job) return response({ ok: true, service: 'structured-runtime', job, meta: snapshot.meta || {}, source: 'snapshot' });
    }
    return response({ ok: false, error: 'JOB_NOT_FOUND', id }, 404);
  }
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
