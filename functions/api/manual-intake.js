const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const PREFIX = 'manual-intake/';
const ITEMS_PREFIX = PREFIX + 'items/';
const WORKER_KEY = PREFIX + 'worker/health';
const SNAPSHOT_KEY = 'snapshot/current';
const ACTIVE = ['QUEUED', 'RESEARCHING', 'NEEDS_INFO', 'FAILED'];
const TERMINAL = ['ADDED', 'EXISTING', 'EXCLUDED'];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}
function clean(value, max = 400) {
  return String(value ?? '').trim().slice(0, max);
}
function now() {
  return new Date().toISOString();
}
function normalizeUrl(value) {
  let u;
  try { u = new URL(clean(value, 2000)); }
  catch { throw new Error('Enter a complete job URL beginning with https://'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || !u.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(u.hostname)) throw new Error('Enter a public http or https job link');
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^utm_|^(trk|trackingId|ref|referrer|source|src)$/i.test(k)) u.searchParams.delete(k);
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.searchParams.sort();
  return u.toString().replace(/\/$/, '');
}
async function intakeId(url) {
  const bytes = new TextEncoder().encode(normalizeUrl(url));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24).toUpperCase();
  return 'MI-' + hex;
}
function appliedStatus(value) {
  return ['APPLIED', 'NOT_APPLIED', 'UNSURE'].includes(value) ? value : 'UNSURE';
}
function validDate(value) {
  const v = clean(value, 10);
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) throw new Error('Applied date must be a real YYYY-MM-DD date');
  return v;
}
function key(id) {
  if (!/^MI-[A-F0-9]{24}$/.test(id || '')) throw new Error('Invalid intake ID');
  return ITEMS_PREFIX + id;
}
function publicItem(item) {
  const copy = JSON.parse(JSON.stringify(item));
  if (copy.lease) delete copy.lease.token;
  return copy;
}
function history(item, message, actor) {
  item.history = (item.history || []).concat({ at: now(), actor: clean(actor || 'TIM', 40), message: clean(message, 1000) }).slice(-60);
}
function summary(items) {
  const counts = { TOTAL: items.length, WAITING: 0, RESEARCHING: 0, NEEDS_INFO: 0, IN_MASTER: 0, EXCLUDED: 0, FAILED: 0 };
  for (const x of items) {
    if (ACTIVE.includes(x.status)) counts.WAITING++;
    if (x.status === 'RESEARCHING') counts.RESEARCHING++;
    if (x.status === 'NEEDS_INFO') counts.NEEDS_INFO++;
    if (['ADDED', 'EXISTING'].includes(x.status)) counts.IN_MASTER++;
    if (x.status === 'EXCLUDED') counts.EXCLUDED++;
    if (x.status === 'FAILED') counts.FAILED++;
  }
  return counts;
}
async function getItem(env, id) {
  return await env.PIPELINE_SNAPSHOT_KV.get(key(id), 'json');
}
async function putItem(env, item) {
  item.updatedAt = now();
  await env.PIPELINE_SNAPSHOT_KV.put(key(item.id), JSON.stringify(item));
  return item;
}
async function snapshotRows(env) {
  const snap = await env.PIPELINE_SNAPSHOT_KV.get(SNAPSHOT_KEY, 'json');
  return Array.isArray(snap && snap.jobs) ? snap.jobs : [];
}
function norm(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}
function sourceMatch(item, row) {
  const p = row.payload || row.P || row || {};
  const urls = [p.SOURCE_URL, p.INITIATING_URL, p.INTAKE_SOURCE_URL, p.COMPANY_SOURCE_URL, p.MANUAL_INTAKE_URL, p.SOURCE].filter(Boolean);
  for (const u of urls) {
    try { if (normalizeUrl(u) === normalizeUrl(item.url)) return true; } catch {}
  }
  const r = item.research || {};
  if (!r.identityVerified || !(r.sources || []).length) return false;
  if (norm(r.company) !== norm(row.COMPANY) || norm(r.title) !== norm(row.TITLE)) return false;
  return !r.reqId || !row.REQ || row.REQ === 'UNCAPTURED' || norm(r.reqId) === norm(row.REQ);
}
function requireLease(item, body) {
  if (!item.lease || !item.lease.token || !body.token || item.lease.token !== body.token || Date.parse(item.lease.until) <= Date.now()) throw new Error('Research lease expired or changed; claim the item again');
}
async function list(env) {
  const found = [];
  let cursor;
  do {
    const page = await env.PIPELINE_SNAPSHOT_KV.list({ prefix: ITEMS_PREFIX, cursor });
    cursor = page.cursor;
    for (const k of page.keys || []) {
      const item = await env.PIPELINE_SNAPSHOT_KV.get(k.name, 'json');
      if (item) found.push(item);
    }
  } while (cursor);
  found.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  const rows = found.some(i => i.primaryId) ? await snapshotRows(env) : [];
  const items = found.map(item => {
    const out = publicItem(item);
    const row = rows.find(r => String(r.PRIMARY_ID || r.id || '').trim() === item.primaryId);
    if (row) {
      out.masterBucket = row.BUCKET;
      out.masterStage = row.BUCKET === 'SCOUT_INTAKE' || row.BUCKET === 'DISCOVERY_LEAD' ? 'Awaiting enrichment / verification' : String(row.BUCKET || '').replace(/_/g, ' ').toLowerCase();
    }
    return out;
  });
  return { ok: true, items, counts: summary(items), worker: await env.PIPELINE_SNAPSHOT_KV.get(WORKER_KEY, 'json'), checkedAt: now() };
}
async function handle(env, action, body) {
  if (action === 'list') return await list(env);
  if (action === 'get') {
    const item = await getItem(env, body.id);
    if (!item) throw new Error('Submission not found');
    return { ok: true, item: publicItem(item) };
  }
  if (action === 'submit') {
    const url = normalizeUrl(body.url);
    const id = await intakeId(url);
    const existing = await getItem(env, id);
    const application = appliedStatus(body.applicationStatus);
    const appliedDate = validDate(body.appliedDate);
    const hints = { company: clean(body.company), title: clean(body.title), location: clean(body.location), reqId: clean(body.reqId) };
    const notes = clean(body.notes, 4000);
    if (!existing) {
      const stamp = now();
      const item = { id, url, hints, notes, applicationStatus: application, appliedDate, status: 'QUEUED', phase: 'Waiting for identity research', submittedAt: stamp, updatedAt: stamp, submittedBy: 'TIM', attempts: 0, primaryId: '', history: [{ at: stamp, actor: 'TIM', message: 'Job link submitted for AI research' }] };
      await env.PIPELINE_SNAPSHOT_KV.put(key(id), JSON.stringify(item));
      return { ok: true, item: publicItem(item), duplicate: false };
    }
    if (notes && notes !== existing.notes) existing.notes = clean((existing.notes || '') + '\n' + notes, 6000);
    for (const k of Object.keys(hints)) if (hints[k]) existing.hints[k] = hints[k];
    if (application === 'APPLIED' && existing.applicationStatus !== 'APPLIED') {
      existing.applicationStatus = 'APPLIED';
      existing.appliedDate = appliedDate;
      if (TERMINAL.includes(existing.status)) { existing.status = 'QUEUED'; existing.phase = 'Update application history'; }
    } else if (appliedDate && !existing.appliedDate) existing.appliedDate = appliedDate;
    history(existing, 'Same job link resubmitted; existing queue item retained', 'TIM');
    return { ok: true, item: publicItem(await putItem(env, existing)), duplicate: true };
  }
  if (action === 'worker_ping') {
    const worker = { at: now(), actor: clean(body.actor || 'FORGE', 40), state: clean(body.state || 'CHECKING', 40), note: clean(body.note, 800) };
    await env.PIPELINE_SNAPSHOT_KV.put(WORKER_KEY, JSON.stringify(worker));
    return { ok: true, worker };
  }
  if (action === 'retry') {
    const item = await getItem(env, body.id);
    if (!item) throw new Error('Submission not found');
    if (!['FAILED', 'NEEDS_INFO', 'EXCLUDED'].includes(item.status)) throw new Error('This item is already queued, processing, or in the master');
    item.status = 'QUEUED'; item.phase = 'Waiting for another research pass'; delete item.lease; history(item, 'Research retry requested', 'TIM');
    return { ok: true, item: publicItem(await putItem(env, item)) };
  }
  if (action === 'claim') {
    const item = await getItem(env, body.id);
    if (!item) throw new Error('Submission not found');
    if (!ACTIVE.includes(item.status)) throw new Error('Item already completed');
    if (item.lease && Date.parse(item.lease.until) > Date.now()) throw new Error('Another worker is researching this item');
    item.lease = { token: crypto.randomUUID(), actor: clean(body.actor || 'FORGE', 40), until: new Date(Date.now() + 90 * 60000).toISOString() };
    item.status = 'RESEARCHING'; item.phase = 'Verifying job identity and source'; item.attempts = (item.attempts || 0) + 1; history(item, item.phase, item.lease.actor);
    const saved = await putItem(env, item);
    return { ok: true, token: item.lease.token, item: publicItem(saved) };
  }
  if (action === 'progress') {
    const item = await getItem(env, body.id);
    if (!item) throw new Error('Submission not found');
    requireLease(item, body);
    if (!['RESEARCHING', 'NEEDS_INFO', 'FAILED', 'EXCLUDED'].includes(body.status || 'RESEARCHING')) throw new Error('Use link with master readback to finish admission');
    if (body.status === 'EXCLUDED' && !clean(body.ruleId)) throw new Error('Excluded items need the actual canonical rule ID');
    item.status = body.status || 'RESEARCHING'; item.phase = clean(body.phase || item.phase, 200); item.detail = clean(body.detail, 2500); if (body.ruleId) item.ruleId = clean(body.ruleId, 80);
    if (body.research) {
      const r = body.research;
      item.research = { company: clean(r.company), title: clean(r.title), location: clean(r.location), reqId: clean(r.reqId), identityVerified: r.identityVerified === true, sources: (Array.isArray(r.sources) ? r.sources : []).slice(0, 10).map(s => ({ url: normalizeUrl(s.url), note: clean(s.note, 1000) })), facts: r.facts && typeof r.facts === 'object' ? JSON.parse(JSON.stringify(r.facts)) : {} };
    }
    if (item.status !== 'RESEARCHING') delete item.lease;
    history(item, item.phase + (item.detail ? ': ' + item.detail : ''), body.actor || 'FORGE');
    return { ok: true, item: publicItem(await putItem(env, item)) };
  }
  if (action === 'link') {
    const item = await getItem(env, body.id);
    if (!item) throw new Error('Submission not found');
    requireLease(item, body);
    const rows = await snapshotRows(env);
    const row = rows.find(r => String(r.PRIMARY_ID || r.id || '').trim() === String(body.primaryId || '').trim());
    if (!row) throw new Error('Canonical PRIMARY_ID not found in structured snapshot readback');
    if (!sourceMatch(item, row)) throw new Error('Master identity does not match this submission; verify the exact role before linking');
    if (item.applicationStatus === 'APPLIED' && !['APPLIED', 'REJECTED_BY_EMPLOYER'].includes(row.BUCKET)) throw new Error('Already-applied claim has not been preserved in the master; apply the protected state through the writer first');
    item.primaryId = row.PRIMARY_ID || row.id; item.status = body.existing === true ? 'EXISTING' : 'ADDED'; item.phase = body.existing === true ? 'Linked to existing canonical row' : 'Added through verified writer intake'; item.masterBucket = row.BUCKET; item.detail = clean(body.detail, 2500); delete item.lease; history(item, item.phase + ' · ' + item.primaryId, body.actor || 'FORGE');
    return { ok: true, item: publicItem(await putItem(env, item)), readbackVerified: true };
  }
  throw new Error('Unsupported manual intake action');
}

export async function onRequest(context) {
  try {
    const env = context.env || {};
    if (!env.PIPELINE_SNAPSHOT_KV) return json({ ok: false, error: 'KV_NOT_BOUND' }, 500);
    const url = new URL(context.request.url);
    let body = {};
    if (context.request.method === 'POST') {
      const raw = await context.request.text();
      if (raw.length > 25000) return json({ ok: false, error: 'Request too large' }, 413);
      body = raw ? JSON.parse(raw) : {};
    } else if (context.request.method !== 'GET') return json({ ok: false, error: 'Use GET or POST' }, 405);
    const action = body.action || url.searchParams.get('action') || 'list';
    if (context.request.method === 'GET' && !['list', 'get'].includes(action)) return json({ ok: false, error: 'State changes require POST' }, 405);
    if (action === 'get') body.id = body.id || url.searchParams.get('id');
    return json(await handle(env, action, body));
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e) }, 400);
  }
}
