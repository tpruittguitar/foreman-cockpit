// Office chat relay (3D office, item 17). Tim types in a bot's popup -> a JSON file in the PRIVATE repo
// tpruittguitar/office-mailbox; the bot reads its inbox on its next turn (tools/office-mail.sh) and writes a reply.
//   POST /api/office-chat  {bot_id, text}   -> inbox/<bot_id>/<ts>-<rand>.json  {id, at, from:"tim", bot_id, text}
//   GET  /api/office-chat?bot=<bot_id>      -> {messages:[...]} last 20 inbox messages + their outbox/<bot_id>/<msg id>.json replies
// Secrets: env.OFFICE_MAILBOX_TOKEN (fine-grained PAT, Contents read/write on office-mailbox only) and env.OFFICE_CHAT_KEY
// (the X-Office-Key Tim enters once in the page). Neither is ever logged or returned. Missing -> 503 "chat relay not configured".
export const MAILBOX_REPO = 'tpruittguitar/office-mailbox'; // hard-coded: the relay never touches any other repo
const API = 'https://api.github.com/repos/' + MAILBOX_REPO + '/contents/';
const STATUS_URL = 'https://raw.githubusercontent.com/tpruittguitar/forge-coordination/main/control/OFFICE_STATUS.json';
export const MAX_TEXT = 2000, LIST_MAX = 20, RATE_PER_MIN = 10;
const JSON_H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_H });
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sameKey(a, b) { // constant-time compare
  a = String(a || ''); b = String(b || ''); let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0 && a.length > 0;
}
function b64(s) { const bytes = new TextEncoder().encode(s); let bin = ''; for (const x of bytes) bin += String.fromCharCode(x); return btoa(bin); }
function unb64(s) { const bin = atob(String(s).replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }

let roster = { at: 0, ids: null };
export function resetCaches() { roster = { at: 0, ids: null }; hits.clear(); }
async function rosterIds(fetcher, now) {
  if (roster.ids && now - roster.at < 5 * 60000) return roster.ids;
  const r = await fetcher(STATUS_URL + '?t=' + Math.floor(now / 60000));
  if (!r.ok) return roster.ids || new Set();
  const j = await r.json();
  roster = { at: now, ids: new Set((Array.isArray(j.bots) ? j.bots : []).map(b => String(b.bot_id || b.id || '').trim()).filter(Boolean)) };
  return roster.ids;
}
const hits = new Map(); // per-IP, per-isolate, best effort
function limited(ip, now) {
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000); arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE_PER_MIN;
}
function gh(env, fetcher) {
  const h = { Authorization: 'Bearer ' + env.OFFICE_MAILBOX_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'office-chat-relay', 'X-GitHub-Api-Version': '2022-11-28' };
  return {
    list: async dir => { const r = await fetcher(API + dir, { headers: h }); if (r.status === 404) return []; if (!r.ok) throw Error('list ' + r.status); return (await r.json()).filter(f => f.type === 'file' && /\.json$/.test(f.name)); },
    read: async p => { const r = await fetcher(API + p, { headers: h }); if (!r.ok) return null; const j = await r.json(); try { return JSON.parse(unb64(j.content)); } catch (e) { return null; } },
    put: async (p, obj, msg) => { const r = await fetcher(API + p, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify({ message: msg, content: b64(JSON.stringify(obj, null, 1)) }) }); if (!r.ok) throw Error('write ' + r.status); }
  };
}
export async function handle(request, env, fetcher = fetch, now = Date.now()) {
  if (!env || !env.OFFICE_MAILBOX_TOKEN || !env.OFFICE_CHAT_KEY) return out(503, { ok: false, error: 'chat relay not configured' });
  if (!sameKey(request.headers.get('X-Office-Key'), env.OFFICE_CHAT_KEY)) return out(401, { ok: false, error: 'wrong office key' });
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (limited(ip, now)) return out(429, { ok: false, error: 'too many requests, try again in a minute' });
  const url = new URL(request.url), api = gh(env, fetcher);
  let botId, text = '';
  if (request.method === 'POST') {
    let body; try { body = await request.json(); } catch (e) { return out(400, { ok: false, error: 'body must be JSON' }); }
    botId = String(body && body.bot_id || '').trim(); text = String(body && body.text || '').trim();
    if (!text) return out(400, { ok: false, error: 'empty message' });
    if (text.length > MAX_TEXT) return out(400, { ok: false, error: 'message over ' + MAX_TEXT + ' characters' });
  } else if (request.method === 'GET') botId = String(url.searchParams.get('bot') || '').trim();
  else return out(405, { ok: false, error: 'GET or POST only' });
  if (!ID_RE.test(botId) || !(await rosterIds(fetcher, now)).has(botId)) return out(400, { ok: false, error: 'unknown bot_id' });
  try {
    if (request.method === 'POST') {
      const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), x => x.toString(16).padStart(2, '0')).join('');
      const id = new Date(now).toISOString().replace(/[-:.]/g, '') + '-' + rand;
      const msg = { id, at: new Date(now).toISOString(), from: 'tim', bot_id: botId, text };
      await api.put('inbox/' + botId + '/' + id + '.json', msg, 'office chat: message for ' + botId);
      return out(200, { ok: true, message: msg });
    }
    const inbox = (await api.list('inbox/' + botId)).sort((a, b) => a.name.localeCompare(b.name)).slice(-LIST_MAX);
    const replies = new Set((await api.list('outbox/' + botId)).map(f => f.name));
    const messages = [];
    for (const f of inbox) {
      const m = await api.read('inbox/' + botId + '/' + f.name); if (!m) continue;
      messages.push({ id: m.id, at: m.at, from: 'tim', text: String(m.text || '') });
      if (replies.has(m.id + '.json')) { const r = await api.read('outbox/' + botId + '/' + m.id + '.json'); if (r) messages.push({ id: m.id, at: r.at, from: String(r.from || 'bot'), text: String(r.text || ''), reply_to: m.id }); }
    }
    return out(200, { ok: true, messages });
  } catch (e) { return out(502, { ok: false, error: 'mailbox unavailable' }); }
}
export const onRequestGet = ctx => handle(ctx.request, ctx.env);
export const onRequestPost = ctx => handle(ctx.request, ctx.env);
