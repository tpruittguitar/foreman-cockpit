// REV-152 (Tim 2026-10-21 15:32 ET): Cloudflare's free Workers KV plan allows 1,000 writes and 1,000 deletes a day.
// On 2026-10-21 every import wrote 8 shards and deleted 8, and deletes ran out. Shards are now named by their content,
// an unchanged shard is not re-written, nothing is deleted after a one-time clean-up, and shards expire on their own.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

async function loadHandler() {
  const src = path.join(__dirname, '..', 'functions', 'api', 'structured', '[[path]].js');
  const tmp = path.join(os.tmpdir(), 'structured-kv-' + process.pid + '-' + Date.now() + Math.random() + '.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(src, 'utf8'));
  return (await import('file://' + tmp)).onRequest;
}

function kv() {
  const m = new Map(), ops = { put: 0, delete: 0, ttl: [] };
  return {
    map: m, ops,
    get: async k => (m.has(k) ? m.get(k) : null),
    put: async (k, v, o) => { ops.put++; if (k !== 'snapshot/v2/head') ops.ttl.push(o && o.expirationTtl); m.set(k, v); },
    delete: async k => { ops.delete++; m.delete(k); },
    reset() { ops.put = 0; ops.delete = 0; ops.ttl = []; },
  };
}

function jobs(n, tag = '') {
  return Array.from({ length: n }, (_, i) => ({ INV: String(i + 1), PRIMARY_ID: 'V2A-' + (i + 1), COMPANY: 'Acme ' + i + tag, SOURCE_LINE: 'x'.repeat(200), SOURCE_INDEX: i }));
}

async function call(onRequest, env, method, p, body) {
  const req = new Request('https://cockpit.test/api/structured' + p, { method, headers: { 'x-writer-key': 'k', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const r = await onRequest({ request: req, env });
  return { status: r.status, j: JSON.parse(await r.text()) };
}

async function readAll(onRequest, env, total) {
  let got = [];
  for (let off = 0; off < total; off += 250) got = got.concat((await call(onRequest, env, 'GET', '/jobs?limit=250&offset=' + off)).j.jobs);
  return got;
}

test('REV-152: KV cost per import — one-time clean-up, then unchanged = 0 ops, one changed job = 2 writes, never a delete', async () => {
  const realFetch = global.fetch, realNow = Date.now;
  let now = Date.parse('2026-10-21T20:00:00Z');
  Date.now = () => now;
  global.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  try {
    const onRequest = await loadHandler();
    const store = kv(), env = { PIPELINE_SNAPSHOT_KV: store };
    // The live layout before REV-152: a v2 head with a random generation, 7 shards, and the v1 blob.
    const old = jobs(1658);
    store.map.set('snapshot/current', '{"jobs":[]}');
    for (let i = 0; i < 7; i++) store.map.set('snapshot/v2/oldgen/' + i, JSON.stringify(old.slice(i * 250, (i + 1) * 250)));
    store.map.set('snapshot/v2/head', JSON.stringify({ gen: 'oldgen', shardSize: 250, shards: 7, total: 1658, meta: { generatedAt: 'g0' }, counts: {}, ok: true }));
    assert.deepStrictEqual(await readAll(onRequest, env, 1658), old, 'a pre-REV-152 head still reads');

    let x = await call(onRequest, env, 'POST', '/admin/snapshot', { ok: true, meta: { generatedAt: 'g1' }, counts: { jobs: 1658 }, jobs: old });
    assert.strictEqual(x.j.stored, true);
    assert.strictEqual(x.j.kv.mode, 'STORED');
    assert.strictEqual(store.ops.put, 8, '7 shards + head');
    assert.strictEqual(store.ops.delete, 8, 'one-time clean-up: 7 old shards + the v1 blob');
    assert.ok(store.ops.ttl.every(t => t === 172800), 'every shard expires on its own (2 days)');
    assert.ok(![...store.map.keys()].some(k => k.startsWith('snapshot/v2/oldgen/')) && !store.map.has('snapshot/current'));
    assert.deepStrictEqual(await readAll(onRequest, env, 1658), old);

    store.reset(); now += 60000;
    x = await call(onRequest, env, 'POST', '/admin/snapshot', { ok: true, meta: { generatedAt: 'g2' }, counts: { jobs: 1658 }, jobs: old });
    assert.strictEqual(x.j.kv.mode, 'UNCHANGED');
    assert.deepStrictEqual([store.ops.put, store.ops.delete], [0, 0], 'identical import within 15 min costs nothing');

    store.reset(); now += 60000;
    const ruled = old.map(j => ({ ...j })); ruled[600].COMPANY = 'Acme 600 DECLINED_BY_TIM';
    x = await call(onRequest, env, 'POST', '/admin/snapshot', { ok: true, meta: { generatedAt: 'g3' }, counts: { jobs: 1658 }, jobs: ruled });
    assert.strictEqual(x.j.kv.mode, 'STORED');
    assert.deepStrictEqual([store.ops.put, store.ops.delete], [2, 0], 'one changed job: its shard + head, nothing deleted');
    assert.deepStrictEqual(await readAll(onRequest, env, 1658), ruled);
    assert.strictEqual((await call(onRequest, env, 'GET', '/jobs/V2A-601')).j.job.COMPANY, 'Acme 600 DECLINED_BY_TIM');
    assert.strictEqual((await call(onRequest, env, 'GET', '/jobs?limit=250&offset=0')).j.meta.generatedAt, 'g3');

    store.reset(); now += 16 * 60000;
    x = await call(onRequest, env, 'POST', '/admin/snapshot', { ok: true, meta: { generatedAt: 'g4' }, counts: { jobs: 1658 }, jobs: ruled });
    assert.strictEqual(x.j.kv.mode, 'UNCHANGED_HEAD_REFRESHED');
    assert.deepStrictEqual([store.ops.put, store.ops.delete], [1, 0], 'identical after 15 min: head only (new timestamps)');

    store.reset(); now += 25 * 3600000;
    x = await call(onRequest, env, 'POST', '/admin/snapshot', { ok: true, meta: {}, counts: {}, jobs: ruled });
    assert.deepStrictEqual([store.ops.put, store.ops.delete], [8, 0], 'shards in use are re-put once a day, before their 2-day expiry');
    assert.ok(store.ops.ttl.every(t => t === 172800));

    store.reset(); now += 60000;
    x = await call(onRequest, env, 'POST', '/admin/snapshot', { ok: true, meta: {}, counts: {}, jobs: ruled.slice(0, 300) });
    assert.deepStrictEqual([store.ops.put, store.ops.delete], [2, 0], 'shard 0 unchanged; new 50-job shard 1 + head');
    x = await call(onRequest, env, 'GET', '/jobs?limit=250&offset=250');
    assert.strictEqual(x.j.total, 300); assert.strictEqual(x.j.jobs.length, 50);
  } finally { global.fetch = realFetch; Date.now = realNow; }
});

test('REV-152: a missing (expired) shard answers NOT_LOADED so the Explorer re-imports', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  try {
    const onRequest = await loadHandler();
    const store = kv(), env = { PIPELINE_SNAPSHOT_KV: store };
    await call(onRequest, env, 'POST', '/admin/snapshot', { ok: true, meta: {}, counts: {}, jobs: jobs(600) });
    const head = JSON.parse(store.map.get('snapshot/v2/head'));
    store.map.delete(head.keys[1]);   // what expiry does after 2 days with no import
    let x = await call(onRequest, env, 'GET', '/jobs?limit=250&offset=250');
    assert.strictEqual(x.status, 409); assert.strictEqual(x.j.error, 'STRUCTURED_SNAPSHOT_NOT_LOADED');
    x = await call(onRequest, env, 'GET', '/jobs/V2A-599');
    assert.strictEqual(x.status, 409);
    x = await call(onRequest, env, 'GET', '/jobs?limit=250&offset=0');
    assert.strictEqual(x.status, 200, 'shards still present read normally');
  } finally { global.fetch = realFetch; }
});

/* The Explorer's gate, run from pipeline.html's own source with fake timers. */
function gate(t) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
  const a = html.indexOf('var STRUCT_SYNC_='), b = html.indexOf('function reloadAfterWrite_(){');
  assert.ok(a > 0 && b > a);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-21T20:00:00Z') });
  const imports = [];
  const ctx = { setTimeout, Date, Promise, Math,
    importStructuredFromWriter_: () => new Promise(res => { const i = { at: Date.now(), done: res }; imports.push(i); }) };
  vm.createContext(ctx); vm.runInContext(html.slice(a, b), ctx);
  return { ctx, imports };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('REV-152 gate: first save rebuilds at once; saves inside the minute share one trailing rebuild; never two at once', async t => {
  const { ctx, imports } = gate(t);
  const done = [];
  ctx.structuredSync_('/api/structured').then(() => done.push('a'));
  assert.strictEqual(imports.length, 1, 'leading rebuild is immediate');
  t.mock.timers.tick(5000); ctx.structuredSync_('/api/structured').then(() => done.push('b'));
  t.mock.timers.tick(5000); ctx.structuredSync_('/api/structured').then(() => done.push('c'));
  assert.strictEqual(ctx.structuredSyncDeferred_(), true);
  imports[0].done(); await flush();
  assert.deepStrictEqual(done, ['a']);
  t.mock.timers.tick(49000); await flush();
  assert.strictEqual(imports.length, 1, 'nothing before the minute is up');
  t.mock.timers.tick(1000); await flush();
  assert.strictEqual(imports.length, 2, 'one trailing rebuild for both saves');
  assert.strictEqual(imports[1].at - imports[0].at, 60000);
  imports[1].done(); await flush();
  assert.deepStrictEqual(done, ['a', 'b', 'c'], 'both saves resolve after the trailing rebuild');
  t.mock.timers.tick(60000); await flush();
  assert.strictEqual(ctx.structuredSyncDeferred_(), false);
  ctx.structuredSync_('/api/structured'); assert.strictEqual(imports.length, 3, 'quiet minute: immediate again');
});

test('REV-152 gate: a save during the trailing rebuild gets its own later rebuild (its change may not be in the first)', async t => {
  const { ctx, imports } = gate(t);
  ctx.structuredSync_('/api/structured');
  t.mock.timers.tick(1000); ctx.structuredSync_('/api/structured');
  imports[0].done(); t.mock.timers.tick(59000); await flush();
  assert.strictEqual(imports.length, 2);
  let late = false;
  ctx.structuredSync_('/api/structured').then(() => { late = true; });   // while rebuild 2 is running
  imports[1].done(); await flush();
  assert.strictEqual(late, false, 'not satisfied by the rebuild that was already running');
  t.mock.timers.tick(60000); await flush();
  assert.strictEqual(imports.length, 3);
  imports[2].done(); await flush();
  assert.strictEqual(late, true);
});

test('REV-152 gate: a failed rebuild still frees the gate; the page-load sync and saves share it', async t => {
  const { ctx, imports } = gate(t);
  let err = null;
  ctx.structuredSync_('/api/structured').catch(e => { err = e; });
  imports[0].done(Promise.reject(new Error('IMPORT_FROM_WRITER_FAILED'))); await flush();
  assert.ok(err && /IMPORT_FROM_WRITER_FAILED/.test(err.message));
  assert.strictEqual(ctx.STRUCT_SYNC_.running, null);
  const html = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
  assert.match(html, /!S\.structuredSyncing&&!structuredSyncDeferred_\(\)&&Date\.now\(\)-\(S\.structuredSyncedAt\|\|0\)>60000\)\{S\.structuredSyncing=true;structuredSync_\(base\)/);
  assert.match(html, /function reloadAfterWrite_\(\)\{if\(S\.structuredBase&&S\.cfg\.key\)\{if\(structuredSyncDeferred_\(\)\)try\{render\(\)\}catch\(e\)\{\}return structuredSync_/);
});
