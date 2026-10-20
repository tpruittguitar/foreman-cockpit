// REV-074: the structured runtime stores its snapshot as a head + 250-job shards so a page read never
// parses the whole multi-megabyte snapshot (Cloudflare 503 "Worker exceeded resource limits", 2026-10-19).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function loadHandler() {
  const src = path.join(__dirname, '..', 'functions', 'api', 'structured', '[[path]].js');
  const tmp = path.join(os.tmpdir(), 'structured-shards-' + process.pid + '-' + Date.now() + '.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(src, 'utf8'));
  const mod = await import('file://' + tmp);
  return mod.onRequest;
}

function kv() {
  const m = new Map();
  return { map: m, get: async k => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } };
}

function jobs(n) {
  return Array.from({ length: n }, (_, i) => ({ INV: String(i + 1), PRIMARY_ID: 'V2A-' + (i + 1), COMPANY: 'Acme ' + i, BUCKET: i % 3 ? 'COVERAGE' : 'APPLIED', SOURCE_LINE: (i + 1) + ' | V2A-' + (i + 1) + ' | Acme ' + i + ' | ' + 'x'.repeat(400), SOURCE_INDEX: i }));
}

async function call(onRequest, env, method, p, body) {
  const req = new Request('https://cockpit.test/api/structured' + p, { method, headers: { 'x-writer-key': 'k', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const r = await onRequest({ request: req, env });
  return { status: r.status, j: JSON.parse(await r.text()) };
}

test('sharded snapshot: store, page reads, job lookup, no-snapshot answer', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });   // Writer ping
  try {
    const onRequest = await loadHandler();
    const store = kv();
    const env = { PIPELINE_SNAPSHOT_KV: store };
    store.map.set('snapshot/current', '{"jobs":[]}');   // legacy v1 blob

    let x = await call(onRequest, env, 'GET', '/jobs?limit=250&offset=0');
    assert.strictEqual(x.status, 409);
    assert.strictEqual(x.j.error, 'STRUCTURED_SNAPSHOT_NOT_LOADED');

    const all = jobs(1872);
    x = await call(onRequest, env, 'POST', '/admin/snapshot', { ok: true, meta: { schema: 'pipeline-structured-snapshot-v1', generatedAt: 'g1' }, counts: { jobs: 1872 }, jobs: all });
    assert.strictEqual(x.status, 200);
    assert.ok(!store.map.has('snapshot/current'), 'legacy v1 blob retired');
    const head = JSON.parse(store.map.get('snapshot/v2/head'));
    assert.strictEqual(head.shards, 8);
    assert.strictEqual(head.total, 1872);

    x = await call(onRequest, env, 'GET', '/health');
    assert.strictEqual(x.j.dataAvailable, true);
    assert.strictEqual(x.j.snapshot.jobs, 1872);

    // The Explorer's exact read: 250 at a time until total.
    let got = [];
    for (let off = 0; off < 1872; off += 250) {
      x = await call(onRequest, env, 'GET', '/jobs?limit=250&offset=' + off);
      assert.strictEqual(x.status, 200);
      assert.strictEqual(x.j.total, 1872);
      assert.strictEqual(x.j.meta.generatedAt, 'g1');
      got = got.concat(x.j.jobs);
    }
    assert.deepStrictEqual(got, all);

    // Unaligned and two-shard windows match a plain slice.
    for (const [limit, off] of [[100, 240], [500, 0], [500, 1750], [7, 1870], [250, 5000]]) {
      x = await call(onRequest, env, 'GET', '/jobs?limit=' + limit + '&offset=' + off);
      assert.deepStrictEqual(x.j.jobs, all.slice(off, off + limit), 'window ' + limit + '@' + off);
    }

    x = await call(onRequest, env, 'GET', '/jobs/V2A-1600');
    assert.strictEqual(x.j.job.COMPANY, 'Acme 1599');
    x = await call(onRequest, env, 'GET', '/jobs/V2A-99999');
    assert.strictEqual(x.status, 404);

    x = await call(onRequest, env, 'GET', '/counts');
    assert.strictEqual(x.j.counts.jobs, 1872);

    // A new import replaces the generation and removes the old shards.
    const oldGen = head.gen;
    await call(onRequest, env, 'POST', '/admin/snapshot', { ok: true, meta: { generatedAt: 'g2' }, counts: {}, jobs: all.slice(0, 300) });
    assert.ok(![...store.map.keys()].some(k => k.indexOf('snapshot/v2/' + oldGen + '/') === 0), 'old shards deleted');
    x = await call(onRequest, env, 'GET', '/jobs?limit=250&offset=250');
    assert.strictEqual(x.j.jobs.length, 50);
    assert.strictEqual(x.j.meta.generatedAt, 'g2');
  } finally {
    global.fetch = realFetch;
  }
});
