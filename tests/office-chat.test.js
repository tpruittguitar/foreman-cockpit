// Office chat relay (functions/api/office-chat.js) with a mocked fetch: never touches the real GitHub.
const test = require('node:test'), assert = require('node:assert/strict');
const BOT = '338fc1b1-fecc-475d-ba9e-acd49bcadcfc';
const ENV = { OFFICE_MAILBOX_TOKEN: 'tok-EXAMPLE', OFFICE_CHAT_KEY: 'key-EXAMPLE' };
const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../functions/api/office-chat.js'), 'utf8');
let mod; const load = async () => (mod = mod || await import('data:text/javascript,' + encodeURIComponent(src))); // ESM Pages Function in a CommonJS repo
const req = (method, opts = {}) => new Request('https://office.example/api/office-chat' + (opts.q || ''), { method, headers: Object.assign({ 'X-Office-Key': 'key-EXAMPLE', 'CF-Connecting-IP': opts.ip || '1.2.3.' + Math.floor(Math.random() * 250) }, opts.headers || {}), body: opts.body ? JSON.stringify(opts.body) : undefined });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64');
function mockFetch(files) {
  const calls = [];
  const f = async (url, o = {}) => {
    calls.push({ url, method: o.method || 'GET', body: o.body, auth: o.headers && o.headers.Authorization });
    if (url.startsWith('https://raw.githubusercontent.com/tpruittguitar/forge-coordination/main/control/OFFICE_STATUS.json')) return Response.json({ bots: [{ bot: 'QA bot', bot_id: BOT }] });
    const m = /^https:\/\/api\.github\.com\/repos\/tpruittguitar\/office-mailbox\/contents\/(.*)$/.exec(url);
    if (!m) return new Response('unexpected ' + url, { status: 500 });
    if (o.method === 'PUT') return Response.json({ content: {} }, { status: 201 });
    const p = m[1];
    if (files[p] && Array.isArray(files[p])) return Response.json(files[p].map(name => ({ type: 'file', name })));
    if (files[p]) return Response.json({ content: b64(files[p]) });
    return new Response('nf', { status: 404 });
  };
  f.calls = calls; return f;
}
test('missing secrets -> 503 "chat relay not configured"', async () => {
  const { handle } = await load();
  const r = await handle(req('GET', { q: '?bot=' + BOT }), {}, mockFetch({}));
  assert.equal(r.status, 503); assert.match((await r.json()).error, /chat relay not configured/);
});
test('wrong key -> 401, and the token never appears in a response', async () => {
  const { handle, resetCaches } = await load(); resetCaches();
  const r = await handle(req('GET', { q: '?bot=' + BOT, headers: { 'X-Office-Key': 'nope' } }), ENV, mockFetch({}));
  assert.equal(r.status, 401); assert.doesNotMatch(await r.text(), /tok-EXAMPLE/);
});
test('bad bot id -> 400 (format and roster)', async () => {
  const { handle, resetCaches } = await load(); resetCaches();
  assert.equal((await handle(req('GET', { q: '?bot=../../etc' }), ENV, mockFetch({}))).status, 400);
  assert.equal((await handle(req('GET', { q: '?bot=00000000-0000-4000-8000-000000000000' }), ENV, mockFetch({}))).status, 400);
  assert.equal((await handle(req('POST', { body: { bot_id: BOT, text: 'x'.repeat(2001) } }), ENV, mockFetch({}))).status, 400);
});
test('good POST writes inbox/<bot_id>/<ts>-<rand>.json in office-mailbox only', async () => {
  const { handle, resetCaches } = await load(); resetCaches();
  const f = mockFetch({});
  const r = await handle(req('POST', { body: { bot_id: BOT, text: 'EXAMPLE hello' } }), ENV, f, Date.parse('2026-11-16T07:00:00Z'));
  assert.equal(r.status, 200);
  const put = f.calls.find(c => c.method === 'PUT');
  assert.match(put.url, new RegExp('^https://api\\.github\\.com/repos/tpruittguitar/office-mailbox/contents/inbox/' + BOT + '/20261116T070000000Z-[0-9a-f]{8}\\.json$'));
  const saved = JSON.parse(Buffer.from(JSON.parse(put.body).content, 'base64').toString());
  assert.deepEqual([saved.from, saved.bot_id, saved.text], ['tim', BOT, 'EXAMPLE hello']);
  assert.equal(put.auth, 'Bearer tok-EXAMPLE');
  assert.ok(f.calls.every(c => !c.url.includes('api.github.com') || c.url.includes('/repos/tpruittguitar/office-mailbox/')));
  assert.doesNotMatch(await r.text(), /tok-EXAMPLE/);
});
test('GET merges inbox messages with their outbox replies, oldest first', async () => {
  const { handle, resetCaches } = await load(); resetCaches();
  const files = {
    ['inbox/' + BOT]: ['a1.json', 'a2.json'], ['outbox/' + BOT]: ['a1.json'],
    ['inbox/' + BOT + '/a1.json']: { id: 'a1', at: '2026-11-16T06:00:00Z', from: 'tim', text: 'EXAMPLE one' },
    ['inbox/' + BOT + '/a2.json']: { id: 'a2', at: '2026-11-16T06:05:00Z', from: 'tim', text: 'EXAMPLE two' },
    ['outbox/' + BOT + '/a1.json']: { id: 'a1', at: '2026-11-16T06:02:00Z', from: 'QA bot', text: 'EXAMPLE reply' }
  };
  const r = await handle(req('GET', { q: '?bot=' + BOT }), ENV, mockFetch(files));
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).messages.map(m => [m.from, m.text]), [['tim', 'EXAMPLE one'], ['QA bot', 'EXAMPLE reply'], ['tim', 'EXAMPLE two']]);
});
test('per-IP rate limit', async () => {
  const { handle, resetCaches, RATE_PER_MIN } = await load(); resetCaches();
  let last; for (let i = 0; i <= RATE_PER_MIN; i++) last = await handle(req('GET', { q: '?bot=' + BOT, ip: '9.9.9.9' }), ENV, mockFetch({}), 1000 + i);
  assert.equal(last.status, 429);
});
