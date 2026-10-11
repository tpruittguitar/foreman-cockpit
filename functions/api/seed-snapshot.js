const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export async function onRequestPost(context) {
  try {
    const store = context.env && context.env.PIPELINE_SNAPSHOT_KV;
    if (!store) return json({ ok: false, error: 'KV_NOT_BOUND' }, 500);
    const body = await context.request.json();
    if (!body || !Array.isArray(body.jobs)) return json({ ok: false, error: 'INVALID_SNAPSHOT' }, 400);
    if (!body.meta) body.meta = {};
    body.meta.storedAt = new Date().toISOString();
    await store.put('snapshot/current', JSON.stringify(body));
    return json({ ok: true, stored: true, jobs: body.jobs.length, counts: body.counts || {}, meta: body.meta });
  } catch (e) {
    return json({ ok: false, error: 'SEED_FAILED', detail: String(e && e.message || e) }, 500);
  }
}

export async function onRequestGet(context) {
  try {
    const store = context.env && context.env.PIPELINE_SNAPSHOT_KV;
    if (!store) return json({ ok: false, error: 'KV_NOT_BOUND' }, 500);
    const raw = await store.get('snapshot/current');
    if (!raw) return json({ ok: true, stored: false, jobs: 0 });
    const body = JSON.parse(raw);
    return json({ ok: true, stored: true, jobs: Array.isArray(body.jobs) ? body.jobs.length : 0, meta: body.meta || {}, counts: body.counts || {} });
  } catch (e) {
    return json({ ok: false, error: 'CHECK_FAILED', detail: String(e && e.message || e) }, 500);
  }
}
