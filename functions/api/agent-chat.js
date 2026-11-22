// Agent chat wall (3D office): the Claude / Hermes / Dot chat that runs on TIMMAY (D:\Hermes\claude-chat\chat.log).
// Everything lives in the PRIVATE repo tpruittguitar/office-mailbox under agent-chat/; nothing is public.
//   TIMMAY (D:\Hermes\claude-chat\office-sync.ps1, gh CLI) writes agent-chat/recent.json {at, lines:[raw log lines]}
//   and moves agent-chat/inbox/*.json into chat.log as "Tim -> <to>" lines.
//   POST /api/agent-chat {unlock: "<code>"}  -> {ok, token, exp}   (the lock button; code checked here, never in the page)
//   GET  /api/agent-chat                     -> {ok, at, lines:[...], queued:n}        X-Agent-Chat-Token required
//   POST /api/agent-chat {to, text}          -> agent-chat/inbox/<ts>-<rand>.json      X-Agent-Chat-Token required
// Secrets (Cloudflare Pages env): AGENT_CHAT_CODE (Tim's unlock code) and OFFICE_MAILBOX_TOKEN (shared with /api/office-chat).
// Wrong codes: global lockout after FAIL_MAX misses in a FAIL_WINDOW (KV when bound, so it holds across IPs and isolates).
// Self-contained on purpose (tests load each function on its own).
const API = 'https://api.github.com/repos/tpruittguitar/office-mailbox/contents/agent-chat/';
export const TO = ['ALL', 'Claude', 'Hermes', 'Dot', 'Grok']; // chat.log names: Claude Duet, Hermes (Local), ChatGPT Dot, Grokbot President
export const MAX_TEXT = 2000, MAX_LINES = 80, RATE_PER_MIN = 30, FAIL_MAX = 5, FAIL_WINDOW = 15 * 60000, TOKEN_MS = 12 * 3600000;
const JSON_H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const out = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_H });
const enc = new TextEncoder();

function sameKey(a, b) { // constant-time compare
  a = String(a || ''); b = String(b || ''); let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0 && a.length > 0;
}
function b64(s) { const bytes = enc.encode(s); let bin = ''; for (const x of bytes) bin += String.fromCharCode(x); return btoa(bin); }
function unb64(s) { const bin = atob(String(s).replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }
async function sign(env, exp) { // token = exp.hmac; changing the code (or the mailbox token) voids every open unlock
  const k = await crypto.subtle.importKey('raw', enc.encode(env.AGENT_CHAT_CODE + '|' + env.OFFICE_MAILBOX_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode('agent-chat:' + exp)));
  return exp + '.' + Array.from(sig, x => x.toString(16).padStart(2, '0')).join('');
}
async function tokenOk(env, tok, now) { const exp = Number(String(tok || '').split('.')[0]); return exp > now && exp - now <= TOKEN_MS && sameKey(tok, await sign(env, exp)); }

const hits = new Map(), mem = { fails: [] }; // per-isolate fallbacks
export function resetCaches() { hits.clear(); mem.fails = []; }
function limited(ip, now) {
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000); arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > RATE_PER_MIN;
}
const failKey = now => 'agent-chat:fails:' + Math.floor(now / FAIL_WINDOW);
async function failCount(env, now) {
  const kv = env.PIPELINE_SNAPSHOT_KV;
  const n = kv ? Number(await kv.get(failKey(now)).catch(() => 0)) || 0 : 0;
  return Math.max(n, mem.fails.filter(t => now - t < FAIL_WINDOW).length);
}
async function addFail(env, now, n) {
  mem.fails = mem.fails.filter(t => now - t < FAIL_WINDOW).concat(now);
  const kv = env.PIPELINE_SNAPSHOT_KV; if (kv) await kv.put(failKey(now), String(n + 1), { expirationTtl: 2 * FAIL_WINDOW / 1000 }).catch(() => {});
}

export async function handle(request, env, fetcher = fetch, now = Date.now()) {
  if (!env || !env.OFFICE_MAILBOX_TOKEN || !env.AGENT_CHAT_CODE) return out(503, { ok: false, error: 'chat lock not set up' });
  if (limited(request.headers.get('CF-Connecting-IP') || 'unknown', now)) return out(429, { ok: false, error: 'too many requests, try again in a minute' });
  let body = null;
  if (request.method === 'POST') { try { body = await request.json(); } catch (e) { return out(400, { ok: false, error: 'body must be JSON' }); } }
  else if (request.method !== 'GET') return out(405, { ok: false, error: 'GET or POST only' });
  if (body && 'unlock' in body) {
    const n = await failCount(env, now);
    if (n >= FAIL_MAX) return out(429, { ok: false, error: 'too many wrong codes, locked for up to 15 minutes' });
    if (!sameKey(String(body.unlock || '').trim(), String(env.AGENT_CHAT_CODE).trim())) { await addFail(env, now, n); return out(401, { ok: false, error: 'wrong code' }); }
    const exp = now + TOKEN_MS; return out(200, { ok: true, token: await sign(env, exp), exp });
  }
  if (!(await tokenOk(env, request.headers.get('X-Agent-Chat-Token'), now))) return out(401, { ok: false, error: 'locked' });
  const h = { Authorization: 'Bearer ' + env.OFFICE_MAILBOX_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'office-agent-chat', 'X-GitHub-Api-Version': '2022-11-28' };
  try {
    if (body) {
      const to = String(body.to || '').trim(), text = String(body.text || '').trim();
      if (!TO.includes(to)) return out(400, { ok: false, error: 'to must be one of ' + TO.join(', ') });
      if (!text) return out(400, { ok: false, error: 'empty message' });
      if (text.length > MAX_TEXT) return out(400, { ok: false, error: 'message over ' + MAX_TEXT + ' characters' });
      const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), x => x.toString(16).padStart(2, '0')).join('');
      const id = new Date(now).toISOString().replace(/[-:.]/g, '') + '-' + rand, msg = { id, at: new Date(now).toISOString(), to, text };
      const r = await fetcher(API + 'inbox/' + id + '.json', { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify({ message: 'agent chat: Tim -> ' + to, content: b64(JSON.stringify(msg)) }) });
      if (!r.ok) throw Error('write ' + r.status);
      return out(200, { ok: true, message: msg });
    }
    const [rr, ri] = await Promise.all([fetcher(API + 'recent.json', { headers: h }), fetcher(API + 'inbox', { headers: h })]);
    let recent = { at: null, lines: [] };
    if (rr.ok) { try { const j = JSON.parse(unb64((await rr.json()).content)); recent = { at: j.at || null, lines: (Array.isArray(j.lines) ? j.lines : []).slice(-MAX_LINES).map(s => String(s).slice(0, 4000)) }; } catch (e) { /* bad file: show nothing */ } }
    else if (rr.status !== 404) throw Error('read ' + rr.status);
    const queued = ri.ok ? (await ri.json()).filter(f => f.type === 'file' && /\.json$/.test(f.name)).length : 0;
    return out(200, { ok: true, at: recent.at, lines: recent.lines, queued });
  } catch (e) { return out(502, { ok: false, error: 'mailbox unavailable' }); }
}
export const onRequestGet = ctx => handle(ctx.request, ctx.env);
export const onRequestPost = ctx => handle(ctx.request, ctx.env);
