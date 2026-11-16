// President chat feed: a 404 means "not published yet" (quiet, slower polling), never an error. EXAMPLE data only.
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const NOW = Date.parse('2026-11-16T15:00:00Z'), MIN = 60000;
const DIR = 'https://api.github.com/repos/x/forge-coordination/contents/control?ref=main';
const RAW = 'https://raw.githubusercontent.com/x/forge-coordination/main/control/PRESIDENT_CHAT_FEED.jsonl';
const FEED = JSON.stringify({ at: '2026-11-16T14:59:00Z', from: 'Tim', text: 'EXAMPLE hello' }) + '\n';
const res = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, text: async () => body || '', json: async () => JSON.parse(body || 'null') });
function harness(routes, gateOpen = true) {
  const calls = [];
  const fetch = async (url) => { calls.push(url); const k = url.startsWith(DIR) ? 'dir' : 'raw'; const h = routes[k]; return typeof h === 'function' ? h() : h; };
  const gate = { open: () => gateOpen, note() {} };
  return { calls, src: L.createChatFeed({ fetch, gate, dirUrl: DIR, rawUrl: RAW, name: 'PRESIDENT_CHAT_FEED.jsonl' }) };
}
function quietConsole(fn) {
  const orig = { error: console.error, warn: console.warn, log: console.log }, said = [];
  for (const k of Object.keys(orig)) console[k] = (...a) => said.push([k, a]);
  return fn().finally(() => Object.assign(console, orig)).then(v => ({ v, said }));
}

test('404 status maps to "not published", other failures to "unavailable"', () => {
  assert.deepEqual(L.chatFeedFromResponse(404, ''), { chat: null, err: L.CHAT_NOT_PUBLISHED, published: false });
  assert.equal(L.chatFeedFromResponse(500, '').err, L.CHAT_UNAVAILABLE);
  const ok = L.chatFeedFromResponse(200, FEED); assert.equal(ok.err, ''); assert.equal(ok.chat.length, 1);
});
test('not listed in control/: no raw fetch (no network 404), "not published", no console output, slower re-check', async () => {
  const h = harness({ dir: res(200, JSON.stringify([{ name: 'OFFICE_STATUS.json' }])), raw: res(404) });
  const { v, said } = await quietConsole(() => h.src.get(NOW));
  assert.deepEqual(v, { chat: null, err: 'Chat not published yet', published: false });
  assert.deepEqual(said, []);
  assert.deepEqual(h.calls, [DIR]);
  await h.src.get(NOW + MIN); // normal 60 s poll: backed off, no request
  assert.equal(h.calls.length, 1);
  await h.src.get(NOW + L.CHAT_PROBE_MS);
  assert.equal(h.calls.length, 2);
});
test('raw 404 (gate closed, raw fallback) -> "not published", quiet, backs off', async () => {
  const h = harness({ raw: res(404) }, false);
  const { v, said } = await quietConsole(() => h.src.get(NOW));
  assert.equal(v.err, L.CHAT_NOT_PUBLISHED); assert.equal(v.chat, null); assert.deepEqual(said, []);
  await h.src.get(NOW + 2 * MIN); assert.equal(h.calls.length, 1);
});
test('once listed, feed is read at the normal rate; a later 404 returns to "not published"', async () => {
  let raw = res(200, FEED);
  const h = harness({ dir: res(200, JSON.stringify([{ name: 'PRESIDENT_CHAT_FEED.jsonl' }])), raw: () => raw });
  let v = await h.src.get(NOW);
  assert.equal(v.err, ''); assert.equal(v.chat[0].text, 'EXAMPLE hello'); assert.deepEqual(h.calls, [DIR, RAW + '?t=' + Math.floor(NOW / MIN)]);
  v = await h.src.get(NOW + MIN); assert.equal(h.calls.length, 3); assert.ok(h.calls[2].startsWith(RAW)); // no second directory check
  raw = res(404);
  v = await h.src.get(NOW + 2 * MIN); assert.equal(v.err, L.CHAT_NOT_PUBLISHED); assert.equal(v.chat, null);
});
test('network error / 500 -> "unavailable", retried at the normal rate, never throws', async () => {
  const h = harness({ dir: () => { throw new TypeError('offline'); }, raw: res(500) });
  const { v, said } = await quietConsole(() => h.src.get(NOW));
  assert.equal(v.err, L.CHAT_UNAVAILABLE); assert.deepEqual(said, []);
  await h.src.get(NOW + MIN); assert.equal(h.calls.length, 2);
});
