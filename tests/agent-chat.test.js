// Agent chat wall relay (functions/api/agent-chat.js) with a mocked fetch: never touches the real GitHub.
const test = require('node:test'), assert = require('node:assert/strict');
const ENV = { OFFICE_MAILBOX_TOKEN: 'tok-EXAMPLE', AGENT_CHAT_CODE: '246810' };
const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../functions/api/agent-chat.js'), 'utf8');
let mod; const load = async () => { mod = mod || await import('data:text/javascript,' + encodeURIComponent(src)); mod.resetCaches(); return mod; };
let ipN = 0;
const req = (method, opts = {}) => new Request('https://office.example/api/agent-chat', { method, headers: Object.assign({ 'CF-Connecting-IP': opts.ip || '9.9.9.' + (++ipN % 250) }, opts.token ? { 'X-Agent-Chat-Token': opts.token } : {}), body: opts.body ? JSON.stringify(opts.body) : undefined });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64');
function mockFetch(files) {
  const calls = [];
  const f = async (url, o = {}) => {
    calls.push({ url, method: o.method || 'GET', body: o.body });
    const m = /^https:\/\/api\.github\.com\/repos\/tpruittguitar\/office-mailbox\/contents\/agent-chat\/(.*)$/.exec(url);
    if (!m) return new Response('unexpected ' + url, { status: 500 });
    if (o.method === 'PUT') return Response.json({ content: {} }, { status: 201 });
    if (files[m[1]] && Array.isArray(files[m[1]])) return Response.json(files[m[1]].map(name => ({ type: 'file', name })));
    if (files[m[1]]) return Response.json({ content: b64(files[m[1]]) });
    return new Response('nf', { status: 404 });
  };
  f.calls = calls; return f;
}
function kv() { const m = new Map(); return { m, get: async k => m.get(k) || null, put: async (k, v) => { m.set(k, v); } }; }
const unlock = async (env, code, now) => (await load()).handle(req('POST', { body: { unlock: code } }), env, mockFetch({}), now);

test('no code set -> 503, and nothing is read', async () => {
  const f = mockFetch({}); const r = await (await load()).handle(req('GET'), { OFFICE_MAILBOX_TOKEN: 'x' }, f);
  assert.equal(r.status, 503); assert.equal(f.calls.length, 0);
});
test('locked: GET and POST without a valid token -> 401 and no mailbox access', async () => {
  const { handle } = await load(), f = mockFetch({ 'recent.json': { lines: ['secret'] } });
  for (const r of [await handle(req('GET'), ENV, f), await handle(req('GET', { token: '9999999999999.abc' }), ENV, f), await handle(req('POST', { body: { to: 'ALL', text: 'hi' } }), ENV, f)]) {
    assert.equal(r.status, 401); assert.doesNotMatch(await r.text(), /secret|tok-EXAMPLE/);
  }
  assert.equal(f.calls.length, 0);
});
test('right code -> token; token reads recent.json and the inbox count', async () => {
  const now = Date.parse('2026-11-22T02:00:00Z'), env = Object.assign({ PIPELINE_SNAPSHOT_KV: kv() }, ENV);
  const u = await (await unlock(env, '246810', now)).json(); assert.ok(u.ok && u.token && u.exp > now);
  const f = mockFetch({ 'recent.json': { at: 'x', lines: ['[2026-11-21 19:40:00 ET] Tim -> ALL: hi'] }, inbox: ['a.json', 'b.json'] });
  const r = await mod.handle(req('GET', { token: u.token }), env, f, now + 1000), j = await r.json();
  assert.equal(r.status, 200); assert.deepEqual(j.lines, ['[2026-11-21 19:40:00 ET] Tim -> ALL: hi']); assert.equal(j.queued, 2);
  assert.ok(f.calls.every(c => c.url.startsWith('https://api.github.com/repos/tpruittguitar/office-mailbox/contents/agent-chat/')));
  assert.equal((await mod.handle(req('GET', { token: u.token }), env, f, u.exp + 1)).status, 401, 'expired token');
  assert.equal((await mod.handle(req('GET', { token: u.token }), Object.assign({}, env, { AGENT_CHAT_CODE: '13579' }), f, now + 1000)).status, 401, 'new code voids old tokens');
});
test('POST writes agent-chat/inbox/<id>.json with to + text; bad recipient or long text -> 400', async () => {
  const now = Date.parse('2026-11-22T02:00:00Z'), env = Object.assign({}, ENV), tok = (await (await unlock(env, '246810', now)).json()).token;
  const f = mockFetch({});
  const r = await mod.handle(req('POST', { token: tok, body: { to: 'Hermes', text: ' hello ' } }), env, f, now);
  assert.equal(r.status, 200); const put = f.calls.find(c => c.method === 'PUT');
  assert.match(put.url, /agent-chat\/inbox\/20261122T020000000Z-[0-9a-f]{8}\.json$/);
  const msg = JSON.parse(Buffer.from(JSON.parse(put.body).content, 'base64').toString()); assert.equal(msg.to, 'Hermes'); assert.equal(msg.text, 'hello');
  assert.equal((await mod.handle(req('POST', { token: tok, body: { to: '../x', text: 'a' } }), env, f, now)).status, 400);
  assert.equal((await mod.handle(req('POST', { token: tok, body: { to: 'ALL', text: 'x'.repeat(2001) } }), env, f, now)).status, 400);
});
test('wrong codes: global lockout after 5 misses, even with the right code and from new IPs', async () => {
  const now = Date.parse('2026-11-22T02:00:00Z'), env = Object.assign({ PIPELINE_SNAPSHOT_KV: kv() }, ENV); await load();
  for (let i = 0; i < 5; i++) assert.equal((await mod.handle(req('POST', { body: { unlock: '000' + i } }), env, mockFetch({}), now + i)).status, 401);
  const r = await mod.handle(req('POST', { body: { unlock: '246810' } }), env, mockFetch({}), now + 10);
  assert.equal(r.status, 429);
  mod.resetCaches(); // a fresh isolate still sees the KV count
  assert.equal((await mod.handle(req('POST', { body: { unlock: '246810' } }), env, mockFetch({}), now + 20)).status, 429);
  assert.equal((await mod.handle(req('POST', { body: { unlock: '246810' } }), env, mockFetch({}), now + 31 * 60000)).status, 200, 'opens again after the window');
});
test('parseAgentChat reads chat.log lines and names the agents', () => {
  const L = require('../office/office-logic.js');
  const m = L.parseAgentChat(['[2026-11-21 19:40:00 ET] Dot -> Tim: a // b', 'garbage', '[2026-11-21 19:41:00 ET] Tim -> Grok: hi']);
  assert.equal(m.length, 2); assert.equal(m[0].text, 'a\nb'); assert.equal(L.agentName(m[0].from), 'ChatGPT Dot'); assert.equal(L.agentName(m[1].to), 'Grokbot President');
});
test('POST with files: each file goes to agent-chat/files/<id>/<name> before the inbox message lists it', async () => {
  const now = Date.parse('2026-11-22T02:00:00Z'), env = Object.assign({}, ENV), tok = (await (await unlock(env, '246810', now)).json()).token;
  const f = mockFetch({}), png = Buffer.from('fake-png').toString('base64');
  const r = await mod.handle(req('POST', { token: tok, body: { to: 'Claude', text: '', files: [{ name: '..\\evil name?.png', type: 'image/png', data: 'data:image/png;base64,' + png }, { name: '', type: 'image/png', data: png }] } }), env, f, now);
  assert.equal(r.status, 200);
  const puts = f.calls.filter(c => c.method === 'PUT'); assert.equal(puts.length, 3);
  assert.match(puts[0].url, /agent-chat\/files\/20261122T020000000Z-[0-9a-f]{8}\/evil_name_.png$/); assert.equal(JSON.parse(puts[0].body).content, png);
  assert.match(puts[1].url, /\/pasted-2\.png$/); assert.match(puts[2].url, /agent-chat\/inbox\//);
  const msg = JSON.parse(Buffer.from(JSON.parse(puts[2].body).content, 'base64').toString());
  assert.deepEqual(msg.files.map(x => x.name), ['evil_name_.png', 'pasted-2.png']); assert.equal(msg.files[0].size, 8);
  assert.ok(msg.files.every(x => x.path.startsWith('agent-chat/files/' + msg.id + '/') && !('data' in x)));
});
test('POST files: limits and bad data -> 400 and nothing written', async () => {
  const now = Date.parse('2026-11-22T02:00:00Z'), env = Object.assign({}, ENV), tok = (await (await unlock(env, '246810', now)).json()).token, f = mockFetch({});
  const big = 'A'.repeat(Math.ceil(8 * 1024 * 1024 / 3) * 4 + 8);
  for (const files of [[{ name: 'a', data: 'not base64!' }], [{ name: 'a', data: big }], Array(5).fill({ name: 'a', data: 'QQ==' })])
    assert.equal((await mod.handle(req('POST', { token: tok, body: { to: 'ALL', text: 'x', files } }), env, f, now)).status, 400);
  assert.equal(f.calls.length, 0);
});
test('parseAgentChat turns "[attached: path]" into file names on the message', () => {
  const L = require('../office/office-logic.js');
  const [m] = L.parseAgentChat(['[2026-11-21 19:40:00 ET] Tim -> Claude: look // [attached: D:\\Hermes\\claude-chat\\attachments\\x\\shot.png]']);
  assert.equal(m.text, 'look'); assert.deepEqual(m.files, ['shot.png']);
});
