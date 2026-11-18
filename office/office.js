/* 3D office viewer (read-only). Data: control/OFFICE_STATUS.json, open PRs and asks/open from public GitHub repos,
   polled every 60 s straight from the browser (all three repos are public; no proxy, no token, no new secret).
   ?demo=1 example data · ?tv=1 10-foot UI · ?view=3d|flat. Three.js r170 is vendored in office/vendor/three. */
import * as THREE from 'three';
import { makeBot, animate, canGeometry, canMaterials, canStyle } from './chars.js';
import { drawDesk, drawBoard, drawUsage, drawNeeds, drawSign, drawPlaque, drawWhiteboard, drawAutomations, drawWriterHealth, WRITER_METRICS, drawTown, drawPipelineWall, drawConstraintWall } from './draw.js';
import { shortTag, idFor } from './avatars.js';
import { CSS3DRenderer, CSS3DObject } from './vendor/three/addons/CSS3DRenderer.js';
const PIPELINE_URL = 'https://foreman-cockpit.pages.dev/pipeline'; // item 8: live Pipeline Explorer on the wall
const TAG_MAX_PX = 240; // full bot name unless the label would be wider than this (or 30% of the screen)

const L = window.OfficeLogic;
const Q = new URLSearchParams(location.search);
const DEMO = Q.get('demo') === '1', TV = Q.get('tv') === '1';
const SEED = Q.has('seed') ? Number(Q.get('seed')) >>> 0 : (Math.random() * 4294967296) >>> 0; // seedable idle rotation (?seed=N)
const OWNER = 'tpruittguitar';
const STATUS_PATH = 'control/OFFICE_STATUS.json', AUTO_PATH = 'control/AUTOMATIONS_STATUS.json', TRAIN_PATH = L.TRAINING_PATH;
const API_FILE = p => `https://api.github.com/repos/${OWNER}/forge-coordination/contents/${p}?ref=main`;
const RAW_FILE = p => `https://raw.githubusercontent.com/${OWNER}/forge-coordination/main/${p}`;
const PR_REPOS = ['foreman-cockpit', 'forge-coordination', 'forge-policy'];
const ASKS_URL = `https://api.github.com/repos/${OWNER}/forge-coordination/contents/asks/open`;
const READINGS_URL = RAW_FILE('usage/AI_USAGE_READINGS.jsonl');
const CHAT_FEED_URL = RAW_FILE('control/PRESIDENT_CHAT_FEED.jsonl');
/* Desk screen mirrors: one downscaled JPEG per bot plus index.json. NOTE: the publisher is not live yet, so every
   monitor shows its text fallback until tpruittguitar/office-screens exists. */
const SCREENS_BASE = 'https://raw.githubusercontent.com/tpruittguitar/office-screens/main/';
const RELAY_URL = '/api/office-chat'; // Cloudflare Pages Function (functions/api/office-chat.js)
const POLL_MS = 60000, SLOW_MS = 5 * 60000;
const coarse = matchMedia('(pointer: coarse)').matches;
const touch = coarse; // touch UI (joystick, drag-look); mouse/keyboard stay on desktops
const touchEvents = 'ontouchstart' in window;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const LOW = L.isPhoneLike({ coarse, width: innerWidth }) && !TV; // lower quality on phones
const NO_APP = TV || /Android|iPhone|iPad|Mobile|SmartTV|Tizen|Web0S|AFT|CrKey|BRAVIA/i.test(navigator.userAgent); // phone / TV user agents
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const T = window.__office = { mode: 'loading', frames: 0, webgl: null, ready: false, errors: [], state: '', lastPoll: 0 };
if (TV) document.documentElement.classList.add('tv');

/* ============================== data ============================== */
const S = {
  raw: null, parsed: null, fetchOk: false, everOk: false, state: 'failed', error: '', source: '',
  pulls: [], pullsErr: '', pullsAt: 0, prStates: new Map(), prTimes: new Map(), fresh: {}, asks: [], asksErr: '', asksAt: 0, checkCache: new Map(),
  readings: [], cons: { health: null, activity: null, err: '', tried: 0, at: 0 }, readingsAt: 0, readingsErr: '', screens: { screens: {} }, chat: null, chatErr: '', training: [], auto: null, autoErr: '',
  glow: new Set(), demoStep: 0, work: null, needsSet: new Set(), restocker: null, invite: null, hrFree: false
};
// Revision badge: build-info.json is baked in at deploy time; missing/bad file shows "build unknown".
let buildInfo, onBuildInfo = null; // buildInfo === undefined until the fetch settles; the wall plate repaints from it
fetch('build-info.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(info => {
  buildInfo = info; if (onBuildInfo) onBuildInfo();
  const line = L.buildBadge(info), el = document.getElementById('build-badge');
  if (el) el.textContent = line;
  console.info(line);
});
const gate = L.createGate(); // one GitHub API budget shared by status, PR list and asks
const fetchFn = (u, o) => fetch(u, o);
const statusSrc = L.createJsonSource({ apiUrl: API_FILE(STATUS_PATH), rawUrl: RAW_FILE(STATUS_PATH), gate, fetch: fetchFn });
const autoSrc = L.createJsonSource({ apiUrl: API_FILE(AUTO_PATH), rawUrl: RAW_FILE(AUTO_PATH), gate, fetch: fetchFn });
const trainSrc = L.createJsonSource({ apiUrl: API_FILE(TRAIN_PATH), rawUrl: RAW_FILE(TRAIN_PATH), gate, fetch: fetchFn });
const chatSrc = L.createChatFeed({ dirUrl: API_FILE('control'), rawUrl: CHAT_FEED_URL, name: 'PRESIDENT_CHAT_FEED.jsonl', gate, fetch: fetchFn });
async function api(url) {
  if (!gate.open(Date.now())) { const e = new Error('GitHub rate limit: waiting for reset'); e.status = 403; throw e; }
  const r = await fetch(url, { cache: 'no-cache', headers: { Accept: 'application/vnd.github+json' } });
  gate.note(r, Date.now());
  if (!r.ok) { const e = new Error(r.status === 403 || r.status === 429 ? 'GitHub rate limit reached' : 'HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
async function rawText(url) { const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / POLL_MS), { cache: 'no-cache' }); if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; } return r.text(); }
/* PR states: one list call per repo (state=all), cached PR_CACHE_MS; check-runs only for open, non-draft PRs (cached by sha). */
async function loadPulls() {
  const out = [], states = new Map(), times = new Map();
  for (const repo of PR_REPOS) {
    const list = await api(`https://api.github.com/repos/${OWNER}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=50`);
    L.prStates(OWNER, repo, list).forEach((v, k) => states.set(k, v));
    L.prTimes(OWNER, repo, list).forEach((v, k) => times.set(k, v));
    for (const p of list.filter(p => p.state === 'open')) {
      const sha = p.head && p.head.sha;
      let checks = S.checkCache.get(sha);
      if (!checks && !p.draft) {
        try { const cr = await api(`https://api.github.com/repos/${OWNER}/${repo}/commits/${sha}/check-runs?per_page=50`); checks = L.checkState(cr.check_runs); }
        catch (e) { checks = 'unknown'; }
        if (checks === 'passing' || checks === 'failing') S.checkCache.set(sha, checks);
      }
      out.push(L.summarizePull(repo, p, checks || (p.draft ? 'draft' : 'unknown')));
    }
  }
  return { out, states, times };
}
function slowLoads(now) {
  if (now - S.pullsAt >= L.PR_CACHE_MS || S.pullsErr) {
    S.pullsAt = now;
    loadPulls().then(r => { S.pulls = r.out; S.prStates = r.states; S.prTimes = r.times; S.pullsErr = ''; }, e => { S.pullsErr = e.message; }).then(refreshAll);
  }
  if (now - S.asksAt >= SLOW_MS) {
    S.asksAt = now;
    api(ASKS_URL).then(a => { S.asks = a.filter(f => f.type === 'file' && /\.json$/i.test(f.name)).map(f => f.name); S.asksErr = ''; },
      e => { S.asksErr = e.status === 404 ? 'asks/open not found' : e.message; }).then(refreshAll);
  }
  if (!DEMO && now - S.cons.tried >= SLOW_MS) { S.cons.tried = now; loadConstraint(now); }
  if (now - S.readingsAt >= SLOW_MS) {
    S.readingsAt = now;
    rawText(READINGS_URL).then(t => { S.readings = L.parseReadings(t); S.readingsErr = ''; }, e => { S.readingsErr = e.message; }).then(refreshAll);
  }
  fetch(SCREENS_BASE + 'index.json?t=' + Math.floor(now / POLL_MS), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => { S.screens = L.parseScreensIndex(j); }, () => { S.screens = { screens: {} }; }).then(refreshAll);
  /* missing or 404 OFFICE_TRAINING.json = no sessions, not an error */
  trainSrc.get(now).then(r => { S.training = r.ok ? L.parseTraining(r.data, L.ROSTER.map(x => x.name)).sessions : []; refreshAll(); });
  chatSrc.get(now).then(r => { S.chat = r.chat; S.chatErr = r.err; refreshAll(); }); // 404 = not published yet: quiet, slower
  autoSrc.get(now).then(r => { if (r.ok) { S.auto = L.parseAutomations(r.data, Date.now()); S.autoErr = ''; } else S.autoErr = r.status === 404 ? 'AUTOMATIONS_STATUS.json not published yet' : r.error; refreshAll(); });
}
/* Constraint wall: the cockpit's own model + summary (pipeline-control-room.js) over its own feeds, refreshed with the other slow loads. */
function loadConstraint(now) {
  const get = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  Promise.allSettled([get('/api/pipeline-health'), get('/api/writer-activity')]).then(([h, a]) => {
    if (h.status !== 'fulfilled') { S.cons.err = h.reason && h.reason.message || 'failed'; return; }
    Object.assign(S.cons, { health: h.value, activity: a.status === 'fulfilled' ? a.value : null, activityErr: a.status === 'fulfilled' ? '' : (a.reason && a.reason.message || 'failed'), err: '', at: Date.now() });
  }).then(refreshAll);
}
function constraintView(now) {
  const c = S.cons, CR = window.PipelineControlRoom;
  if (DEMO) return { sum: L.demoConstraint(), age: L.constraintAge(new Date(now - 4 * 60000).toISOString(), now), demo: true };
  if (!c.health || !CR) return { sum: null, err: c.err, age: null };
  let sum = null;
  try { sum = CR.summary(CR.model({ health: c.health, activity: c.activity, activityError: c.activityErr, now }), {}); } catch (e) { return { sum: null, err: e.message, age: null }; }
  const flow = c.health.processFlow;
  return { sum, age: L.constraintAge(flow && flow.at, now, !!c.err || now - c.at > 2 * SLOW_MS), err: c.err };
}
async function poll() {
  const now = Date.now();
  if (DEMO) {
    S.raw = S.demoStep === 0 ? L.demoStatus(now) : L.demoNextStatus(S.raw, now);
    S.demoStep++; S.fetchOk = true; S.pulls = L.DEMO_PULLS; S.asks = ['EXAMPLE-ASK-1.json', 'EXAMPLE-ASK-2.json']; S.pullsErr = S.asksErr = ''; S.source = 'demo';
    S.prStates = new Map([['example/repo#1', 'merged']]); S.chat = L.parseChatFeed(DEMO_CHAT(now)); S.auto = L.parseAutomations(L.demoAutomations ? L.demoAutomations(now) : null, now);
  } else {
    const r = await statusSrc.get(now);
    if (r.ok) { S.raw = r.data; S.fetchOk = true; S.error = ''; S.source = r.source; }
    else { S.fetchOk = false; S.error = r.status === 404 ? 'control/OFFICE_STATUS.json not found on forge-coordination main' : 'OFFICE_STATUS.json could not be loaded (' + r.error + ')'; }
    slowLoads(now);
  }
  const parsed = S.raw ? L.parseStatus(S.raw) : null;
  if (S.fetchOk && parsed && parsed.ok) {
    if (S.parsed) for (const p of L.diffItems(S.parsed.items, parsed.items)) queuePickup(p);
    workDiff(parsed);
    S.parsed = parsed; S.everOk = true;
  } else if (S.fetchOk && parsed && !parsed.ok) { S.fetchOk = false; S.error = parsed.error; }
  T.lastPoll = Date.now();
  refreshAll();
}
const DEMO_CHAT = now => [['Tim', 'EXAMPLE: is the office PR green?', 9], ['President', 'EXAMPLE: checks running, merging on green', 8], ['Tim', 'EXAMPLE: thanks, ping me at tim@example.com', 3], ['President', 'EXAMPLE: will do', 1]]
  .map(([from, text, m]) => JSON.stringify({ at: new Date(now - m * 60000).toISOString(), from, text })).join('\n');
/* Board card life: diff each poll's work cards against the last snapshot (memory + localStorage, so a reload never replays). */
const WORK_KEY = 'office.work.v1';
function workDiff(parsed) {
  const next = L.allWork(parsed.bots).map(w => ({ id: w.id, poster: w.poster, ownerName: w.ownerName }));
  let prev = S.work;
  if (!prev && !DEMO) { try { prev = JSON.parse(localStorage.getItem(WORK_KEY) || 'null'); } catch (e) { prev = null; } }
  const first = !S.work;
  const evs = first && !prev ? [] : L.diffWork(prev, next);
  S.work = next; if (!DEMO) try { localStorage.setItem(WORK_KEY, JSON.stringify(next)); } catch (e) { /* private mode */ }
  if (first && !DEMO) return; // first load: no animations
  for (const e of evs) queuePickup({ bot: e.bot, itemId: 'w:' + e.id, reason: e.kind });
}
function queuePickup(p) {
  const c = chars.get(p.bot);
  if (!c) { pendingPickups.push(p); return; }
  if (L.JOB_ASSIGN_REASONS.includes(p.reason)) { if (!(c.job && c.job.itemId === p.itemId) && !c.jobs.some(x => x.itemId === p.itemId)) c.jobs.push(p); } // item 12: assigned -> board, desk, board
  else if (!c.pickups.some(x => x.itemId === p.itemId)) c.pickups.push(p);
}
const pendingPickups = [];
function bots() { if (!S.parsed) return []; const now = Date.now(); return S.parsed.bots.map(b => L.liveStatus(b, idFor(b.bot, b.bot_id), S.screens, S.auto, now)); } /* idle rows with live proof of work show as working (Tim, Nov 17) */
/* checksheet items + every bot's work cards, with live PR state applied */
function items() {
  if (!S.parsed) return [];
  const work = L.allWork(S.parsed.bots).map(w => ({ id: 'w:' + w.id, title: L.workLabel(w.poster) + ': ' + w.title, priority: 'P2', status: /done|closed|resolved/i.test(w.status) ? 'done' : 'in_progress',
    owner: w.ownerName, ownerKnown: true, link: w.link, updated_at: w.at, project: 'Job pipeline', pr: null, question: '', note: w.status, source: 'work', prState: '', work: w }));
  return L.applyPrStates(S.parsed.items.concat(work), S.prStates);
}
/* item 19a: a bot whose automation is running (bots[].routine, or a running row for its AI on AUTOMATIONS_STATUS) shows it */
function withRoutine(b) {
  if (!b || b.routine || !S.auto) return b;
  const r = S.auto.rows.find(x => x.running && x.ai === b.bot);
  return r ? Object.assign({}, b, { routine: { name: r.name, started_at: r.started_at } }) : b;
}
/* item 16b: freshest real signal for a bot (row times + PR / Actions / terminal-screen times the page already read) */
const signalCtx = () => ({ items: items(), prTimes: S.prTimes, screens: S.screens, auto: S.auto });
function freshOf(b, now, ctx) { return L.freshness(b, now || Date.now(), L.botSignals(b, ctx || signalCtx())); }
function staleChip(b, now) { const f = b && !L.statusStyle(b.status).alert ? freshOf(b, now) : null; return f && f.stale ? ` <span class="st stale">? ${esc(f.label)}</span>` : ''; }
function botByName(n) { return withRoutine(bots().find(b => b.bot === n)); }
function alertBots() { return bots().filter(b => L.statusStyle(b.status).alert); }
function botTarget(b) { return L.needsTarget({ link: b.link, bot: b.bot, bot_id: idFor(b.bot, b.bot_id), items: items() }); }
/* Needs Tim board rows: only current asks (L.needsList), then "?" rows that always explain themselves. */
function needsData() {
  return L.needsList({ bots: bots(), entries: S.parsed ? S.parsed.needsTim : [], prStates: S.prStates, pulls: DEMO ? [] : S.pulls, now: Date.now(), demo: DEMO });
}
function needsEntries() {
  const d = needsData(), e = [];
  for (const n of d.needs) {
    const known = n.bot && botByName(n.bot);
    e.push({ glyph: '⚠', tone: 'alert', text: n.text, bot: n.kind === 'bot' ? n.bot : '', owner: n.bot, link: n.link,
      target: L.needsTarget({ link: n.link, bot: n.bot, bot_id: n.bot_id || (known ? idFor(known.bot, known.bot_id) : idFor(n.bot)), items: items() }) });
  }
  if (S.asks.length) e.push({ glyph: '?', tone: 'stale', text: S.asks.length + ' open asks in forge-coordination (asks/open)', link: `https://github.com/${OWNER}/forge-coordination/tree/main/asks/open` });
  if (S.pullsErr) e.push({ glyph: '?', tone: 'stale', text: 'PR fetch failed (' + S.pullsErr + '): PR-linked asks may not have cleared yet' });
  if (S.asksErr) e.push({ glyph: '?', tone: 'stale', text: 'Open asks fetch failed (' + S.asksErr + ')' });
  return e;
}
function needsCount() { return needsData().needs.length; }

function refreshAll() {
  const now = Date.now();
  S.state = L.dataState(S.parsed, S.fetchOk, now);
  T.state = S.state;
  const asof = $('asof');
  asof.className = 'asof ' + S.state;
  const age = S.parsed ? L.dataAge(S.parsed.updatedAt, now) : null;
  asof.textContent = S.state === 'failed' ? (S.everOk ? '⚠ Data feed down · last data ' + L.hhmm(S.parsed.updatedAt) : '⚠ No office data')
    : (S.state === 'stale' ? '? ' : '') + age.text + (S.state === 'stale' ? ' (stale: over ' + L.STALE_MIN + ' min old)' : '') + (S.source === 'raw' ? ' · via raw (API rate limit)' : '');
  asof.title = S.state === 'stale' ? 'OFFICE_STATUS.json updated_at is more than ' + L.STALE_MIN + ' minutes old' : '';
  $('demo-badge').hidden = !DEMO;
  const banner = $('banner');
  if (S.state === 'failed') { banner.hidden = false; banner.textContent = '⚠ Office data unavailable: ' + (S.error || 'no data') + '. Bots are greyed out where they stand.'; }
  else banner.hidden = true;
  const n = needsCount(); $('needs-n').textContent = n; $('needs-btn').classList.toggle('zero', !n);
  renderFlat();
  if (world) world.refresh();
}

/* ============================== flat view (phones) ============================== */
/* One Needs Tim row: a link to its target (PR, else chat) or, with neither known, the owning bot's name and no link. */
function targetAttrs(href) { return `href="${esc(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''}`; }
function needsRowHTML(e) {
  const t = e.target || { href: '', kind: 'none', label: '' };
  const inner = `<span class="glyph st ${e.tone}">${e.glyph}</span><span>${esc(e.text)}${t.href ? ` <span class="kind">${t.kind === 'pr' ? '↗ PR' : t.kind === 'chat' ? '↗ chat' : '↗'}</span>` : ''}</span>`;
  if (t.href) return `<a class="needlink" data-kind="${t.kind}" ${targetAttrs(t.href)}>${inner}</a>`;
  return `<span class="needlink nolink">${inner}${t.label ? `<span class="meta">${esc(t.label)} · no PR or chat link known</span>` : ''}</span>`;
}
function stWord(b) { const st = L.statusStyle(b.status); return `<span class="st ${st.alert ? 'alert' : st.status}">${st.glyph} ${st.word}</span>`; }
function renderFlat() {
  if ($('flat').hidden) return;
  const now = Date.now(), h = [];
  const ne = needsEntries();
  h.push(`<section class="needs"><h2>⚠ Needs Tim (${needsCount()})</h2>`);
  if (!ne.length) h.push('<div class="row">Nothing needs Tim right now ✓</div>');
  for (const e of ne) h.push(`<div class="row">${needsRowHTML(e)}</div>`);
  h.push('</section>');
  h.push('<section><h2>Project board</h2>');
  for (const r of L.buildBoard(items(), { max: 99 })) {
    if (!r.total) continue;
    h.push(`<div class="col"><b>${esc(r.project)}</b>`);
    for (const c of L.COLUMNS) {
      const cell = r.cols[c.id]; if (!cell.total) continue;
      h.push(`<h3>${esc(c.label)} (${cell.total})</h3>`);
      for (const it of cell.cards) { const w = L.statusWord(it), pb = L.priorityBadge(it.priority);
        h.push(`<div class="row"><button class="rowbtn" data-item="${esc(it.id)}"><span class="pbadge ${pb.loud ? 'loud' : ''}">${esc(pb.text)}</span><span>${esc(L.cardTitle(it))}<div class="meta">${esc(it.owner)} · <span class="st ${w.tone}">${w.glyph} ${w.word}</span></div></span></button></div>`); }
    }
    h.push('</div>');
  }
  h.push('</section><section><h2>Bots</h2>');
  for (const b of bots()) h.push(`<div class="row"><button class="rowbtn" data-bot="${esc(b.bot)}"><span>${esc(b.bot)} ${stWord(b)}${staleChip(b, now)}<div class="meta">${esc(b.task || '—')}</div><div class="meta">${esc(b.last_action)} · ${L.relTime(b.last_action_at, now)}</div></span></button></div>`);
  if (!bots().length) h.push('<div class="row">No bot data</div>');
  h.push('</section><section><h2>AI usage</h2>');
  h.push(usageListHTML() + '</section>');
  $('flat-body').innerHTML = h.join('');
}
$('flat-body').addEventListener('click', e => {
  const b = e.target.closest('[data-bot]'), it = e.target.closest('[data-item]');
  if (b) openBot(b.dataset.bot); else if (it) openItem(it.dataset.item);
});

/* ============================== overlay panel ============================== */
let panelOpen = false, panelReturn = null, chatPoll = null;
function showPanel(html) {
  $('panel-body').innerHTML = html; $('panel').hidden = false; $('panel').classList.remove('wide'); panelOpen = true;
  if (chatPoll) { clearInterval(chatPoll); chatPoll = null; }
  const f = $('panel').querySelector('a,button.linkbtn,textarea') || $('panel-close'); f.focus({ preventScroll: true });
}
function closePanel() { $('panel').hidden = true; panelOpen = false; if (chatPoll) { clearInterval(chatPoll); chatPoll = null; } if (panelReturn) { panelReturn.focus(); panelReturn = null; } }
$('panel-close').onclick = closePanel;
$('panel').addEventListener('click', e => {
  if (e.target === $('panel')) closePanel();
  const b = e.target.closest('[data-bot]'), it = e.target.closest('[data-item]'), go = e.target.closest('[data-go]'), sc = e.target.closest('[data-screen]');
  const tab = e.target.closest('[data-tab]'), dn = e.target.closest('[data-done]'), ch = e.target.closest('[data-chat]'), key = e.target.closest('[data-chatkey]');
  if (tab) { boardTab = tab.dataset.tab; openBoard(); world && world.dirty(); }
  else if (dn) { doneOpen = !doneOpen; openBoard(); world && world.dirty(); }
  else if (ch) { e.preventDefault(); openChatApp(ch.dataset.chat); }
  else if (key) { e.preventDefault(); if (askRelayKey()) { const t = $('chat-thread'); if (t && t.dataset.bot) refreshThread(t.dataset.bot); } }
  else if (sc) openScreen(sc.dataset.screen);
  else if (go) { e.preventDefault(); closePanel(); world && world.goToBot(go.dataset.go); }
  else if (b) openBot(b.dataset.bot); else if (it) openItem(it.dataset.item);
});
function linkHTML(href, label) { return `<a class="open" href="${esc(href)}" ${/^https?:/.test(href) ? 'target="_blank" rel="noopener"' : ''}>${esc(label)}</a>`; }

/* ---------- toast + Grok Bot app links ---------- */
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4500); }
/* Open grokbot://; if the page never loses focus within ~1.5 s (no app), or on phone/TV, say so instead of failing silently. */
function openChatApp(id, name, after) {
  const b = bots().find(x => x.bot_id === id || x.bot === id) || { bot: name || id, bot_id: id };
  const href = L.chatLink(b.bot_id || idFor(b.bot)); const who = b.bot;
  const fail = 'Open in the Grok Bot app to chat with ' + who;
  if (!href) return toast(fail);
  if (NO_APP) { toast(after || fail); }
  let left = false; const mark = () => { left = true; };
  addEventListener('blur', mark, { once: true }); document.addEventListener('visibilitychange', mark, { once: true });
  try { location.href = href; } catch (e) { /* unknown scheme */ }
  setTimeout(() => { removeEventListener('blur', mark); document.removeEventListener('visibilitychange', mark); if (!left && !NO_APP) toast(after ? after + ' · ' + fail : fail); }, 1500);
  if (after && !NO_APP) toast(after);
}

/* ---------- chat relay (functions/api/office-chat.js) ---------- */
const KEY_STORE = 'office.chatKey';
let pendingKey = ''; // typed but not yet proven by a successful relay call
const relayKey = () => { if (pendingKey) return pendingKey; try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } };
const saveKey = k => { try { localStorage.setItem(KEY_STORE, k); } catch (e) { /* private mode: kept for this page only */ } };
const dropKey = () => { pendingKey = ''; try { localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ } };
// asked once: the key is saved in this browser (localStorage, every bot, every reload) after the relay accepts it
function askRelayKey(why) { const k = prompt((why ? why + '\n' : '') + 'Office chat key (asked once, then kept in this browser):', ''); if (k == null || !k.trim()) return false; pendingKey = k.trim(); relayDown = false; return true; }
let relayDown = DEMO; // demo never posts anywhere
async function relay(method, botId, text) {
  if (relayDown || !relayKey()) return { ok: false, status: 0 };
  const r = await fetch(RELAY_URL + (method === 'GET' ? '?bot=' + encodeURIComponent(botId) : ''), { method, headers: { 'X-Office-Key': relayKey(), 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ bot_id: botId, text }) : undefined })
    .catch(() => ({ ok: false, status: 0 }));
  if (r.status === 503 || r.status === 404) relayDown = true;
  if (r.ok && pendingKey) { saveKey(pendingKey); pendingKey = ''; toast('Chat key saved in this browser'); }
  if (r.status === 401) dropKey();
  return { ok: r.ok, status: r.status, json: r.ok && r.json ? await r.json().catch(() => null) : null };
}
function threadHTML(list) {
  if (!list || !list.length) return '<p class="fallback">No messages yet.</p>';
  return list.map(m => `<div class="msg ${m.from === 'tim' || m.from === 'Tim' ? 'me' : 'bot'}"><b>${esc(m.from === 'tim' ? 'Tim' : m.from)}</b> <span class="meta">${L.etClock(Date.parse(m.at))} ET</span><div>${esc(m.text)}</div></div>`).join('');
}
async function refreshThread(botId) {
  const el = $('chat-thread'); if (!el) return;
  const r = await relay('GET', botId);
  if (r.ok && r.json) el.innerHTML = threadHTML(r.json.messages);
  else if (relayDown || !relayKey()) el.innerHTML = '<p class="fallback">' + (relayKey() ? 'Chat relay not configured: Send copies the message for Open chat.' : 'Replies show here once the office chat key is set (<a href="#" data-chatkey="1">set key</a>).') + '</p>';
}
async function sendChat(b) {
  const ta = $('chat-text'), text = (ta.value || '').trim(); if (!text) return ta.focus();
  if (text.length > 2000) return toast('Messages are limited to 2000 characters');
  const id = idFor(b.bot, b.bot_id);
  let r = await relay('POST', id, text);
  if (!relayDown && (r.status === 401 || !relayKey()) && askRelayKey(r.status === 401 ? 'That chat key was not accepted.' : '')) r = await relay('POST', id, text);
  if (r.ok) { ta.value = ''; toast('Sent to ' + b.bot + "'s mailbox; the reply shows here"); return refreshThread(id); }
  try { await navigator.clipboard.writeText(text); } catch (e) { /* clipboard blocked: the text stays in the box */ }
  openChatApp(id, b.bot, "Message copied, paste it in " + b.bot + "'s chat");
}
function chatBoxHTML(b) {
  const id = idFor(b.bot, b.bot_id), href = L.chatLink(id);
  return `<section class="chatbox" aria-label="Chat with ${esc(b.bot)}"><h3>Chat with ${esc(b.bot)}</h3><div id="chat-thread" class="thread" data-bot="${esc(id)}"></div>
    <textarea id="chat-text" maxlength="2000" rows="2" placeholder="Message ${esc(b.bot)}…"></textarea>
    <div class="chatrow"><button type="button" class="linkbtn" id="chat-send">Send</button>
    ${href ? `<a class="open" id="chat-open" href="${esc(href)}" data-chat="${esc(id)}">Open chat</a>` : '<span class="fallback">no bot id known</span>'}</div></section>`;
}
function openBot(name) {
  const b = botByName(name);
  if (!b) return showPanel(`<h2 id="panel-title">${esc(name)}</h2><p>No data for this bot${S.state === 'failed' ? ' (office data unavailable)' : ''}.</p>`);
  const st = L.statusStyle(b.status), now = Date.now(), tg = botTarget(b), mine = L.sortItems(items().filter(i => i.owner === b.bot && L.columnFor(i) !== 'done'));
  const meet = (S.parsed ? S.parsed.meetings : []).find(m => m.members.includes(b.bot));
  const wait = st.alert ? L.waitingMinutes(b.last_action_at, now) : null;
  const why = [b.why, S.state === 'stale' ? 'office data is ' + L.dataAge(S.parsed.updatedAt, now).text + ' (stale)' : ''].filter(Boolean);
  const rp = L.replayFor(b, now);
  showPanel(`<h2 id="panel-title">${esc(b.bot)} ${stWord(b)}${staleChip(b, now)}</h2>
    ${st.alert ? `<div class="q">${esc(b.question)}${wait != null ? `<div class="fallback">waiting ${wait} min</div>` : ''}</div>` : ''}
    ${why.length ? `<p class="why">? ${esc(why.join(' · '))}</p>` : ''}
    ${chatBoxHTML(b)}
    <dl><dt>Status</dt><dd>${st.glyph} ${st.word}${b.rawStatus && b.rawStatus !== b.status ? ' (' + esc(b.rawStatus) + ')' : ''}</dd>
    <dt>Task</dt><dd>${esc(b.task || '—')}</dd>
    <dt>Last action</dt><dd>${esc(b.last_action || '—')} · ${L.relTime(b.last_action_at, now)}${rp ? ' · <span class="chip">recent · ' + rp.min + 'm ago</span>' : ''}</dd>
    ${meet ? `<dt>Meeting</dt><dd>${esc(meet.title)}${meet.started_at ? ' · since ' + L.hhmm(meet.started_at) : ''}</dd>` : ''}</dl>
    ${tg.kind === 'pr' ? linkHTML(tg.href, 'Open PR for ' + b.bot) : ''}
    ${linkHTML(L.fallbackLink(idFor(b.bot, b.bot_id)), '💬 Chat with ' + b.bot)}
    <button class="linkbtn" type="button" data-screen="${esc(b.bot)}">View screen</button>
    ${mine.length ? '<h3>Cards</h3><ul>' + mine.slice(0, 12).map(i => `<li><button class="linkbtn" data-item="${esc(i.id)}">${esc(L.cardTitle(i))}</button> · ${L.statusWord(i).word}</li>`).join('') + '</ul>' : ''}
    ${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
  $('chat-send').onclick = () => sendChat(b);
  const id = idFor(b.bot, b.bot_id); refreshThread(id); chatPoll = setInterval(() => refreshThread(id), 30000);
}
function openItem(id) {
  const it = items().find(i => i.id === id); if (!it) return;
  const w = L.statusWord(it), pb = L.priorityBadge(it.priority), col = L.COLUMNS.find(c => c.id === L.columnFor(it)).label;
  showPanel(`<h2 id="panel-title">${esc(L.cardTitle(it))}</h2>
    <dl><dt>Priority</dt><dd><span class="pbadge ${pb.loud ? 'loud' : ''}">${esc(it.priority)}</span></dd>
    <dt>Status</dt><dd><span class="st ${w.tone}">${w.glyph} ${w.word}</span> (${esc(it.status)}${it.prState ? ', PR ' + esc(it.prState) : ''}) · column ${esc(col)}</dd>
    ${w.why ? `<dt>?</dt><dd class="why">${esc(w.why)}</dd>` : ''}
    ${it.question ? `<dt>Question</dt><dd>${esc(it.question)}</dd>` : ''}${it.note ? `<dt>Note</dt><dd>${esc(it.note)}</dd>` : ''}
    <dt>Owner</dt><dd>${it.owner ? `<button class="linkbtn" data-bot="${esc(it.owner)}">${esc(it.owner)}</button>${it.ownerKnown ? '' : ' (not a known bot)'}` : '—'}${it.owner && botByName(it.owner) ? ` · <a href="#" data-go="${esc(it.owner)}">desk</a>` : ''}</dd>
    <dt>Project</dt><dd>${esc(it.project)}</dd><dt>Updated</dt><dd>${it.updated_at ? L.etClock(Date.parse(it.updated_at)) + ' ET · ' + L.relTime(it.updated_at, Date.now()) : '—'}</dd><dt>ID</dt><dd>${esc(it.id)}</dd></dl>
    ${L.safeLink(it.link) ? linkHTML(it.link, 'Open link') + `<div class="fallback">${esc(it.link)}</div>` : '<p class="fallback">No link on this card.</p>'}
    ${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
}
function openNeeds() {
  const ne = needsEntries(), d = needsData();
  showPanel(`<h2 id="panel-title">⚠ Needs Tim</h2><ul>${ne.length ? ne.map(e => `<li>${needsRowHTML(e)}${e.bot ? ` · <button class="linkbtn" data-bot="${esc(e.bot)}">details</button> · <button class="linkbtn" data-go="${esc(e.bot)}">go to desk</button>` : ''}</li>`).join('') : '<li>Nothing needs Tim right now ✓</li>'}</ul>
    <h3>Review / merge queue</h3><p class="fallback">Open PRs are never Needs Tim: President merges on green.</p><ul>${S.pullsErr ? `<li class="src-down">? PR fetch failed: ${esc(S.pullsErr)}</li>` : d.review.length ? d.review.map(p => `<li>${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.text)}</a>` : esc(p.text)}${p.draft ? ' · draft' : ''}${p.checks ? ' · checks ' + esc(p.checks) : ''}</li>`).join('') : '<li>None open</li>'}</ul>
    <h3>Open asks</h3><ul>${S.asksErr ? `<li class="src-down">? Open asks fetch failed: ${esc(S.asksErr)}</li>` : S.asks.length ? S.asks.map(a => `<li><a href="https://github.com/${OWNER}/forge-coordination/blob/main/asks/open/${encodeURIComponent(a)}" target="_blank" rel="noopener">${esc(a)}</a></li>`).join('') : '<li>None</li>'}</ul>
    ${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
}
/* Whole Forge checksheet: project tabs (from the data), 4 columns, Done collapsed by default, full scrollable list. */
let boardTab = 'All', doneOpen = false;
function openBoard() {
  const tabs = L.projectTabs(items()); if (!tabs.includes(boardTab)) boardTab = 'All';
  const cols = L.boardView(items(), { tab: boardTab, doneOpen });
  showPanel(`<h2 id="panel-title">Forge checksheet</h2>
    <div class="tabs" role="tablist">${tabs.map(t => `<button class="tab${t === boardTab ? ' on' : ''}" role="tab" aria-selected="${t === boardTab}" data-tab="${esc(t)}">${esc(t)} (${t === 'All' ? items().length : items().filter(i => i.project === t).length})</button>`).join('')}</div>
    <div class="cols">${cols.map(c => `<section class="bcol ${c.id}"><h3>${c.id === 'needs_tim' ? '⚠ ' : ''}${esc(c.label)} (${c.total})${c.id === 'done' ? ` <button class="linkbtn" data-done="1">${c.collapsed ? 'show' : 'hide'}</button>` : ''}</h3>
      ${c.cards.map(i => { const w = L.statusWord(i), pb = L.priorityBadge(i.priority); return `<div class="bcard"><button class="linkbtn" data-item="${esc(i.id)}"><span class="pbadge ${pb.loud ? 'loud' : ''}">${esc(pb.text)}</span> ${esc(L.cardTitle(i))}</button>
        <div class="meta">${esc(i.owner || '—')} · <span class="st ${w.tone}" ${w.why ? `title="${esc(w.why)}"` : ''}>${w.glyph} ${w.word}</span>${i.updated_at ? ' · ' + L.etClock(Date.parse(i.updated_at)) + ' ET' : ''}${i.owner && botByName(i.owner) ? ` · <a href="#" data-go="${esc(i.owner)}">desk</a>` : ''}</div>
        ${i.note ? `<div class="meta note">${esc(i.note)}</div>` : ''}${w.why ? `<div class="meta why">? ${esc(w.why)}</div>` : ''}</div>`; }).join('') || (c.collapsed ? '<p class="fallback">collapsed</p>' : '<p class="fallback">none</p>')}</section>`).join('')}</div>
    ${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
  $('panel').classList.add('wide');
}
function usageListHTML() {
  const rows = L.usageRows(S.readings, Date.now(), S.parsed ? S.parsed.usage : null);
  if (!rows.length) return '<p class="fallback">Waiting for the first usage reading (usage/AI_USAGE_READINGS.jsonl)…</p>';
  return '<ul class="usage">' + rows.map(r => { const w = L.usageWord(r.pct_used); return `<li><b>${esc(r.name)}</b> <span class="st ${w.tone}">${w.glyph} ${w.word}</span> · ${r.pct_used == null ? 'reading failed' : Math.round(r.pct_used) + '% used'}${r.stale ? ' · <span class="st stale">? stale</span>' : ''}
    <div class="ubar"><i style="width:${Math.round(r.pct_used || 0)}%" class="${w.tone}"></i></div><div class="meta">${esc(r.label)} · ${esc(r.measured)} · <span class="countdown">${esc(r.next)}</span>${r.resets_at ? ' · resets ' + esc(new Date(r.resets_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + ' ET' : ''}</div></li>`; }).join('') + '</ul>'
    + `<p class="fallback">Source: ${esc(rows[0].source)}${rows[0].source === 'OFFICE_STATUS.json' ? ' (fallback: readings file unavailable)' : ' (forge-coordination usage/AI_USAGE_READINGS.jsonl)'} · checks at ${L.USAGE_CHECK_SCHEDULE_ET.join(', ')} ET</p>`;
}
function openUsage() { showPanel(`<h2 id="panel-title">AI usage</h2>${usageListHTML()}`); $('panel').classList.add('wide'); if (location.hash !== '#usage') history.replaceState(null, '', '#usage'); }
addEventListener('hashchange', () => { if (location.hash === '#usage') openUsage(); });
function openConvo(name) {
  const lines = L.recentConversations(S.parsed ? S.parsed.conversations : [], Date.now()).filter(c => c.from === name);
  const rb = botByName(name), rp = rb ? L.replayFor(rb, Date.now()) : null; // a bubble only shows a one-line cut; the full text lives here
  if (!lines.length && rp) return showPanel(`<h2 id="panel-title">${esc(name)} · recent</h2><p>${esc(rp.text)}</p><p class="fallback">${rp.min}m ago</p>`);
  if (!lines.length) return showPanel(`<h2 id="panel-title">${esc(name)} is chatting</h2><p>Ambient idle chatter: decoration while the bot is idle. It is not from OFFICE_STATUS.json and is not a real conversation.</p>`);
  showPanel(`<h2 id="panel-title">${esc(name)} is talking</h2><ul>${lines.map(c => `<li><b>${esc(c.from)} → ${esc(c.to)}</b> · ${L.relTime(c.at, Date.now())}<br>${esc(c.text || 'talking with ' + c.to)}</li>`).join('')}</ul>`);
}
function openHref(href, name) {
  if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
  else if (/^grokbot:/i.test(href)) openChatApp(decodeURIComponent((/id=([^&]+)/.exec(href) || [])[1] || ''), name);
}
function openNeedsEntry(i) {
  const e = needsEntries()[i]; if (!e) return openNeeds();
  if (e.target && e.target.href) return openHref(e.target.href, e.owner);
  if (e.link && /^https?:/i.test(e.link)) return openHref(e.link);
  const who = e.bot || e.owner;
  if (!who) return openNeeds();
  showPanel(`<h2 id="panel-title">${esc(who)}</h2><p>${esc(e.text)}</p><p class="fallback">No PR or Grok Bot chat link is known for ${esc(who)}.</p>${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
}
/* Screen click: go right to the live thing (screen_url, President's checksheet, Usage Budget's chart), else the mirror popup. */
function clickScreen(name, half) {
  const b = botByName(name) || { bot: name };
  if (half === 'left' && (b.bot === 'President' || b.bot_id === L.PRESIDENT_ID)) return openChatApp(idFor(b.bot, b.bot_id), b.bot);
  const t = L.screenTarget(b);
  if (t.kind === 'url') return window.open(t.href, '_blank', 'noopener');
  if (t.kind === 'usage') return openUsage();
  openScreen(name);
}
/* Screen popup: the mirrored screen large (or its text fallback). */
function openScreen(name) {
  const b = botByName(name) || { bot: name, bot_id: '', status: 'idle', task: '', last_action: '', last_action_at: '', screen: null };
  const now = Date.now(), id = idFor(b.bot, b.bot_id), sc = L.screenState(S.screens, id, now);
  const act = world ? world.activity(name) : '', mode = L.monitorMode(b, act, { image: sc.show === 'image' });
  let body = '';
  const mirror = sc.show === 'image' ? `<figure class="mirror"><img alt="${esc(b.bot)}'s screen" crossorigin="anonymous" src="${esc(SCREENS_BASE + encodeURIComponent(id) + '.jpg?t=' + Math.floor(now / 60000))}"><figcaption>${esc(sc.why)}</figcaption></figure>` : '';
  if (mode === 'president') {
    const chat = S.chat && S.chat.length ? '<div class="pchat">' + S.chat.map(m => `<div class="msg ${m.from === 'Tim' ? 'me' : 'bot'}"><b>${esc(m.from)}</b> <span class="meta">${L.etClock(Date.parse(m.at))} ET</span><div></div></div>`).join('') + '</div>' : `<p class="fallback">${esc(S.chatErr || 'No chat messages yet')}</p>`;
    body = `<div class="split"><section><h3>Tim ↔ President</h3>${chat}</section><section><h3>Screen</h3>${mirror || `<p class="fallback">${esc(sc.why)}</p>` + checksheetHTML()}</section></div>`;
  } else if (mode === 'mirror') body = mirror;
  else if (mode === 'usage') body = `<p class="fallback">${esc(sc.why)} · showing the usage chart</p>` + usageListHTML();
  else if (mode === 'audit') {
    const a = b.audit, stale = L.auditStale(a, now);
    body = `<h3>Mini audit</h3><p>Last audit ${a.last_at ? L.etClock(Date.parse(a.last_at)) + ' ET (' + L.waitingMinutes(a.last_at, now) + 'm ago)' : 'time unknown'}${stale ? ' · <span class="st stale">? stale (over ' + L.AUDIT_STALE_H + ' h)</span>' : ''}</p><ul>${a.checks.map(c => `<li class="audit ${c.value}">${c.value === 'ok' ? '<span class="st working">✓ ok</span>' : c.value === 'flag' ? '<span class="st alert">⚠ flag</span>' : '<span class="st idle">? unknown</span>'} ${esc(c.label)}</li>`).join('')}</ul><p>Findings sent to President: ${a.findings_sent == null ? '?' : a.findings_sent}</p>`;
  } else if (mode === 'routine') body = `<p class="st working">▶ ${esc(b.routine.name)} running${b.routine.started_at ? ' · started ' + L.etClock(Date.parse(b.routine.started_at)) + ' ET' : ''}</p>`;
  else {
    body += `<p class="fallback">${esc(sc.why)} · showing ${esc(b.bot)}'s status text instead</p>`;
    if (mode === 'replay') { const r = L.replayFor(b, now); body += `<p><span class="chip">recent · ${r.min}m ago</span> ${esc(r.text)}</p>`; }
    if (b.screen) body += `<div class="screenpop"><div class="sp-title">${esc(b.screen.title || 'Screen')}${b.screen.updated_at ? `<span>${L.relTime(b.screen.updated_at, now)}</span>` : ''}</div><pre></pre></div>`;
    else body += `<div class="screenpop"><div class="sp-title">terminal</div><pre></pre></div>`;
  }
  showPanel(`<h2 id="panel-title">${esc(b.bot)}'s screen</h2>${body}<button class="linkbtn" type="button" data-bot="${esc(b.bot)}">About ${esc(b.bot)}</button>${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
  // plain text only: chat lines and terminal text are set with textContent, never innerHTML
  const pre = $('panel').querySelector('.screenpop pre');
  if (pre) pre.textContent = b.screen ? b.screen.lines.join('\n') : (b.task || '(no task)') + '\n' + (b.last_action || '(no last action)') + ' · ' + L.relTime(b.last_action_at, now);
  $('panel').querySelectorAll('.pchat .msg > div').forEach((d, k) => { d.textContent = S.chat[k].text; });
  $('panel').classList.add('wide');
}
/* Automations: full 3-day timeline (horizontal scroll) + row list + Writer health. */
function openAutomations() {
  const a = S.auto, now = Date.now();
  if (!a) return showPanel(`<h2 id="panel-title">Automations</h2><p class="fallback">${esc(S.autoErr || 'Waiting for control/AUTOMATIONS_STATUS.json')}</p>`);
  const day0 = L.etDayStart(now) - 86400000, PX = 24, X = t => Math.round((t - day0) / 3600000 * PX), bad = L.writerOverlaps(a.runs), ais = [...new Set(a.runs.map(r => r.ai).concat(a.rows.map(r => r.ai)))];
  const lanes = ais.map(ai => `<div class="lane"><b>${esc(ai)}</b><div class="track">${a.runs.filter(r => r.ai === ai).map(r => `<i class="run ${r.result}${bad.has(r) ? ' clash' : ''}${r.writer ? ' writer' : ''}" style="left:${X(r.start)}px;width:${Math.max(3, X(r.end) - X(r.start))}px" title="${esc(r.name + ' · ' + r.result + ' · ' + L.etClock(r.start) + ' ET' + (r.writer ? ' · Writer' : ''))}"></i>`).join('')}</div></div>`).join('');
  const conc = L.concurrencyByHour(a.runs, day0).map((n, h) => `<i style="left:${h * PX}px;height:${Math.min(30, n * 8)}px" class="c${Math.min(3, n)}" title="${n} runs"></i>`).join('');
  showPanel(`<h2 id="panel-title">Automations</h2><p class="fallback">Yesterday · today · tomorrow (ET). Red outline = overlapping Writer runs. Data ${esc(L.dataAge(a.generated_at, now).text)}.</p>
    <div class="timeline"><div class="tl" style="width:${72 * PX + 120}px"><div class="days">${['Yesterday', 'Today', 'Tomorrow'].map((d, k) => `<span style="left:${k * 24 * PX}px">${d}</span>`).join('')}<em class="now" style="left:${X(now)}px"></em></div>${lanes}<div class="lane"><b>runs/h</b><div class="track conc">${conc}</div></div></div></div>
    <table class="autos"><tr><th>AI</th><th>Automation</th><th>Result</th><th>Last run</th><th>Next</th></tr>${a.rows.map(r => `<tr><td>${esc(r.ai)}</td><td>${esc(r.name)}${r.running ? ' <span class="st working">▶ running</span>' : ''}</td><td><span class="res ${r.result}">${r.result}</span></td><td>${r.last_run_at ? L.etClock(Date.parse(r.last_run_at)) + ' ET' : '—'}</td><td>${r.next_run_at ? esc(L.countdown(Date.parse(r.next_run_at), now).replace('Next check in ', 'in ')) : '—'}</td></tr>`).join('')}</table>
    <h3>Writer health</h3><ul>${WRITER_METRICS.map(([k, label]) => { const m = a.writer && a.writer[k]; return `<li><span class="dot ${m && m.status || 'none'}"></span>${esc(label)}: ${m && m.source && m.value != null ? esc(typeof m.value === 'object' ? JSON.stringify(m.value) : m.value) : 'no data'}${m && m.source ? ' <span class="meta">(' + esc(m.source) + ')</span>' : ''}</li>`; }).join('')}</ul>${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
  $('panel').classList.add('wide');
}
function checksheetHTML() { return '<ul>' + L.sortItems(items().filter(i => L.columnFor(i) !== 'done')).slice(0, 12).map(i => `<li>${esc(L.cardTitle(i))} · ${esc(i.owner)} · ${L.statusWord(i).word}</li>`).join('') + '</ul>'; }

/* HUD buttons */
let needsCursor = -1;
$('needs-btn').onclick = () => {
  const a = alertBots();
  if (!a.length || !world) return openNeeds();
  needsCursor = (needsCursor + 1) % a.length; world.goToBot(a[needsCursor].bot, true);
};
$('list-btn').onclick = openNeeds;
$('walk3d').onclick = () => enter3D();
$('flat-btn').onclick = () => { $('flat').hidden = false; T.mode = 'flat'; renderFlat(); };

/* ============================== 3D world ============================== */
let world = null;
const chars = new Map();

function enter3D() {
  $('flat').hidden = true;
  if (world) { T.mode = '3d'; return; }
  try { world = buildWorld(); T.webgl = true; T.mode = '3d'; }
  catch (e) {
    console.warn('3D unavailable:', e && e.message);
    T.webgl = false; world = null; $('flat').hidden = false; T.mode = 'flat';
    $('walk3d').hidden = true;
    $('banner').hidden = false; $('banner').textContent = '3D needs WebGL, which this browser does not provide. Showing the flat view.';
    renderFlat();
  }
  $('flat-btn').hidden = !world || TV;
  refreshAll();
}

function buildWorld() {
  const canvasTest = document.createElement('canvas');
  if (!(canvasTest.getContext('webgl2') || canvasTest.getContext('webgl'))) throw new Error('no WebGL');
  const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance', alpha: true });
  renderer.setClearColor(0x0e1013, 0);
  const fitRatio = () => Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2, 2880 / Math.max(innerWidth, innerHeight));
  renderer.setPixelRatio(fitRatio());
  renderer.setSize(innerWidth, innerHeight);
  // Tim 1:54 AM: overall lighting about 10% down from the v2 build (exposure 1.45 -> 1.305; light rig unchanged)
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45 * 0.9;
  renderer.shadowMap.enabled = false;
  renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); // WebXR: inert until a VR session starts (desktop render path is unchanged)
  $('stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 60);
  const fitFov = () => { const asp = innerWidth / innerHeight; camera.fov = asp >= 1 ? 62 : Math.min(100, 2 * Math.atan(Math.tan(0.62) / asp) * 180 / Math.PI); camera.updateProjectionMatrix(); };
  fitFov();
  camera.layers.enable(1);
  camera.position.set(0.3, L.EYE_HEIGHT, 9.0); camera.lookAt(-0.6, L.EYE_HEIGHT - 0.1, -4); // walk camera: floor level, eye = President's head height
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const CL = L.CLEARANCE;

  /* ---------- materials: graphite / cool gray, brushed metal, glass, thin cyan/white LED strips (shared) ---------- */
  const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough }, extra));
  const glow = (c, k = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k });
  const MAT = {
    floor: std(0x2b2e33, 0.42, { metalness: 0.25 }), carpet: std(0x23262b, 0.95), wall: std(0x3b3f45, 0.85), ceil: std(0x202226, 0.95), trim: std(0x15171a, 0.5, { metalness: 0.4 }),
    desk: std(0x4d535b, 0.32, { metalness: 0.35 }), metal: std(0x9aa1aa, 0.32, { metalness: 0.85 }), dark: std(0x17191c, 0.45), chair: std(0x2a2d32, 0.6),
    panel: new THREE.MeshStandardMaterial({ color: 0xf2f6ff, emissive: 0xe8f0ff, emissiveIntensity: 1.4 }),
    sconce: new THREE.MeshStandardMaterial({ color: 0xdfeaff, emissive: 0xcfe0ff, emissiveIntensity: 1.1 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe6b8, emissiveIntensity: 1.5 }),
    felt: std(0x2a4a5a, 0.9), wood: std(0x3a3c40, 0.5, { metalness: 0.2 }), fabric: std(0x3a3e45, 0.95), cushion: std(0x4a515c, 0.95), white: std(0xe6e9ed, 0.35),
    glass: new THREE.MeshStandardMaterial({ color: 0x9ec9e6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }),
    cyan: glow(0x37e0ff, 1.8), ledW: glow(0xeaf4ff, 1.4), stone: std(0x4a4d52, 0.95), leaf: std(0x3f7a52, 0.8), leafDk: std(0x2c5c3e, 0.85), pot: std(0x2d3036, 0.4, { metalness: 0.5 }), bark: std(0x4a3a2c, 0.9),
    lineFaint: new THREE.LineBasicMaterial({ color: 0xc58cff, transparent: true, opacity: 0.16 }), // item 16: the original faint purple card-to-PC lines (as in #305)
    lineHi: new THREE.LineBasicMaterial({ color: 0xc58cff, transparent: true, opacity: 0.95 }),
    focus: new THREE.MeshStandardMaterial({ color: 0xc58cff, emissive: 0xc58cff, emissiveIntensity: 1.2 }),
    hover: new THREE.MeshStandardMaterial({ color: 0xc58cff, emissive: 0xc58cff, emissiveIntensity: 0.6, transparent: true, opacity: 0.6 })
  };
  const BOXES = new Map(); const box = (w, h, d) => { const k = w + ',' + h + ',' + d; if (!BOXES.has(k)) BOXES.set(k, new THREE.BoxGeometry(w, h, d)); return BOXES.get(k); };
  const add = (geo, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  function canvasTex(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
    t.minFilter = THREE.LinearMipmapLinearFilter; return { c, ctx: c.getContext('2d'), t };
  }
  const screenMat = tex => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });

  /* ---------- room ---------- */
  const RW = 24, RD = 20, RH = 4.4;
  add(box(RW, 0.1, RD), MAT.floor, 0, -0.05, 0);
  add(box(17, 0.02, 10.6), MAT.carpet, -2.2, 0.01, -0.8);
  add(box(RW, 0.1, RD), MAT.ceil, 0, RH + 0.05, 0);
  add(box(RW, RH, 0.2), MAT.wall, 0, RH / 2, -RD / 2 - 0.1);
  add(box(RW, RH, 0.2), MAT.wall, 0, RH / 2, RD / 2 + 0.1);
  add(box(0.2, RH, RD), MAT.wall, -RW / 2 - 0.1, RH / 2, 0);
  add(box(0.2, RH, RD), MAT.wall, RW / 2 + 0.1, RH / 2, 0);
  for (const [w, d, x, z] of [[RW, 0.04, 0, -RD / 2 + 0.02], [RW, 0.04, 0, RD / 2 - 0.02], [0.04, RD, -RW / 2 + 0.02, 0], [0.04, RD, RW / 2 - 0.02, 0]]) {
    add(box(w, 0.1, d), MAT.trim, x, 0.05, z);
    add(box(w, 0.025, d), MAT.cyan, x, 0.11, z);           // thin cyan floor LED
    add(box(w, 0.03, d), MAT.ledW, x, RH - 0.12, z);       // white cove LED under the ceiling
  }
  add(box(1.3, 2.3, 0.06), MAT.metal, 0.3, 1.15, RD / 2 - 0.03); add(box(1.5, 0.05, 0.1), MAT.cyan, 0.3, 2.35, RD / 2 - 0.05);
  // Tim: wall dimmer beside the door (switch height): a faceplate with a vertical slot and a draggable knob; level 0.25-1.6 scales the lights
  const DIM_SLOT = 0.36, dimPlate = new THREE.Group(); dimPlate.position.set(1.55, 1.3, RD / 2 - 0.06); dimPlate.rotation.y = Math.PI; scene.add(dimPlate);
  add(box(0.2, 0.52, 0.025), new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.5 }), 0, 0, 0.0125, dimPlate);
  add(box(0.05, DIM_SLOT + 0.06, 0.012), new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.8 }), 0, 0, 0.026, dimPlate);
  for (const k of [0, 0.5, 1]) add(box(k === 0.5 ? 0.03 : 0.045, 0.008, 0.004), new THREE.MeshStandardMaterial({ color: 0x59606b }), -0.07, (k - 0.5) * DIM_SLOT, 0.028, dimPlate);
  const dimKnob = add(box(0.1, 0.06, 0.035), new THREE.MeshStandardMaterial({ color: 0x2f3744, roughness: 0.35, emissive: 0x37e0ff, emissiveIntensity: 0.12 }), 0, 0, 0.045, dimPlate);
  add(box(0.08, 0.008, 0.004), MAT.cyan, 0, 0, 0.064, dimKnob);
  dimPlate.traverse(o => { o.userData.dim = true; });
  // Tim item 5: the window looks out on a small town whose sky, sun / moon and lit windows follow America/New_York time (L.skyState)
  const town = canvasTex(640, 360);
  add(box(0.12, 2.0, 3.2), MAT.trim, -RW / 2 + 0.05, 2.2, -2.2);
  add(new THREE.PlaneGeometry(3.0, 1.8), screenMat(town.t), -RW / 2 + 0.115, 2.2, -2.2).rotation.y = Math.PI / 2;
  add(box(0.05, 1.8, 0.05), MAT.trim, -RW / 2 + 0.13, 2.2, -2.2);
  const windowGlow = new THREE.PointLight(0xdbe9ff, 0, 9, 1.4); windowGlow.position.set(-RW / 2 + 1.2, 2.2, -2.2); scene.add(windowGlow);
  for (const x of [-8, -2.5, 3, 8.5]) for (const z of [-6, 0, 6]) { add(box(1.8, 0.05, 0.9), MAT.panel, x, RH - 0.03, z); add(box(1.84, 0.012, 0.94), MAT.cyan, x, RH - 0.06, z); }
  scene.add(new THREE.HemisphereLight(0xeef3ff, 0x4a4d55, 2.4));
  scene.add(new THREE.AmbientLight(0xe6ecf5, 1.0));
  const key = new THREE.DirectionalLight(0xfff0e0, 1.2); key.position.set(3, 10, 8); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45); fill.position.set(-6, 6, -8); scene.add(fill);
  const sun = new THREE.DirectionalLight(0xfff2d8, 0); sun.position.set(-14, 6, -5); scene.add(sun);
  const pts = LOW ? [[-3, 0], [5, 2]] : [[-7, -5], [2, -5], [-7, 5], [2, 5], [9, 0]];
  for (const [x, z] of pts) { const p = new THREE.PointLight(0xf0f4ff, LOW ? 16 : 11, 16, 1.1); p.position.set(x, RH - 0.4, z); scene.add(p); }
  const boardGlow = new THREE.PointLight(0xdfe6ff, 5, 10, 1.2); boardGlow.position.set(-0.5, 2.6, -8.2); scene.add(boardGlow);
  if (!LOW) for (const [x, z] of [[9.5, 6.5], [-9, 6], [10, -7]]) { const p = new THREE.PointLight(0xcfeaff, 4, 8, 1.2); p.position.set(x, 2.5, z); scene.add(p); }
  const alertLights = [0, 1].map(() => { const p = new THREE.PointLight(0xff2a2a, 0, 4, 1.5); scene.add(p); return p; });

  /* ---------- obstacles ---------- */
  const obstacles = [];
  const block = (cx, cz, hx, hz, viewerOnly, tag) => obstacles.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, viewerOnly, tag });

  /* ---------- decoration: Forge holo sign (original mark), wall art, planters, shelves, bonsai ---------- */
  {
    const sg = canvasTex(512, 160), x = sg.ctx;
    x.clearRect(0, 0, 512, 160); x.strokeStyle = '#5ff0ff'; x.fillStyle = '#5ff0ff'; x.lineWidth = 7; x.shadowColor = '#37e0ff'; x.shadowBlur = 18;
    x.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; x.lineTo(80 + Math.cos(a) * 56, 80 + Math.sin(a) * 56); } x.closePath(); x.stroke(); // hexagon
    x.beginPath(); x.moveTo(62, 104); x.lineTo(80, 50); x.lineTo(98, 104); x.moveTo(68, 88); x.lineTo(92, 88); x.stroke();       // original "spark" mark
    x.font = "800 86px 'Inter PE', system-ui, sans-serif"; x.textBaseline = 'middle'; x.fillText('FORGE', 160, 84); sg.t.needsUpdate = true;
    const holo = new THREE.MeshBasicMaterial({ map: sg.t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    add(new THREE.PlaneGeometry(2.6, 0.82), holo, 10.1, 3.5, -RD / 2 + 0.25);
    add(box(2.8, 0.02, 0.2), MAT.cyan, 10.1, 3.02, -RD / 2 + 0.2);
    // release plate on the wall directly under the sign and its shelf: PR, release time (ET), short SHA, version details (build-info.json)
    {
      const pl = canvasTex(1024, 288), g = pl.ctx;
      const paint = () => {
        const d = L.buildPlate(buildInfo);
        g.clearRect(0, 0, 1024, 288); g.fillStyle = 'rgba(8,16,22,0.78)'; g.fillRect(8, 8, 1008, 272);
        g.strokeStyle = '#5ff0ff'; g.lineWidth = 6; g.shadowColor = '#37e0ff'; g.shadowBlur = 16; g.strokeRect(14, 14, 996, 260);
        g.fillStyle = '#7ff4ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = "800 92px 'Inter PE', system-ui, sans-serif"; g.fillText(d.title + (d.sha ? '  ·  ' + d.sha : ''), 512, 80);
        g.shadowBlur = 8; g.font = "700 64px 'Inter PE', system-ui, sans-serif"; g.fillText(d.when, 512, 160);
        g.font = "600 44px 'Inter PE', system-ui, sans-serif"; g.fillStyle = '#b4eef7'; g.fillText(d.detail, 512, 230, 960); pl.t.needsUpdate = true;
      };
      onBuildInfo = paint; if (buildInfo !== undefined) paint();
      add(new THREE.PlaneGeometry(2.7, 0.76), new THREE.MeshBasicMaterial({ map: pl.t, transparent: true, depthWrite: false, toneMapped: false }), 10.1, 2.52, -RD / 2 + 0.2);
    }
    const art = (cx, cz, rot, seed) => {
      const a = canvasTex(256, 320), g = a.ctx, gr = g.createLinearGradient(0, 0, 256, 320);
      gr.addColorStop(0, '#1b2128'); gr.addColorStop(1, '#2c3440'); g.fillStyle = gr; g.fillRect(0, 0, 256, 320);
      for (let k = 0; k < 7; k++) { g.strokeStyle = k % 3 ? 'rgba(120,200,230,0.55)' : 'rgba(235,240,250,0.7)'; g.lineWidth = 2 + (k * seed) % 5; g.beginPath(); g.arc(128 + ((k * 37 * seed) % 90) - 45, 160 + ((k * 53) % 120) - 60, 30 + k * 14, k, k + 2.2); g.stroke(); }
      a.t.needsUpdate = true;
      const fr = new THREE.Group(); fr.position.set(cx, 2.2, cz); fr.rotation.y = rot; scene.add(fr);
      add(box(1.3, 1.6, 0.05), MAT.metal, 0, 0, 0, fr); add(new THREE.PlaneGeometry(1.2, 1.5), screenMat(a.t), 0, 0, 0.03, fr);
    };
    art(RW / 2 - 0.05, -4.2, -Math.PI / 2, 3); art(-RW / 2 + 0.05, -5.6, Math.PI / 2, 5); art(-5, RD / 2 - 0.05, Math.PI, 7);
    // wall shelf with props (right wall)
    const sh = new THREE.Group(); sh.position.set(RW / 2 - 0.18, 0, -2.6); scene.add(sh);
    for (const y of [1.4, 1.9]) { add(box(0.3, 0.03, 1.6), MAT.metal, 0, y, 0, sh); add(box(0.02, 0.012, 1.6), MAT.cyan, -0.15, y - 0.02, 0, sh); }
    [[1.47, -0.5, 0.12, 0.14, MAT.white], [1.47, -0.3, 0.1, 0.12, MAT.dark], [1.98, 0.1, 0.18, 0.12, MAT.pot], [1.98, 0.5, 0.12, 0.18, MAT.white]].forEach(([y, z, w, h, m]) => add(box(0.2, h, w), m, 0, y + h / 2 - 0.05, z, sh));
  }
  const planterG = new THREE.CylinderGeometry(0.28, 0.22, 0.55, 20), leafG = new THREE.IcosahedronGeometry(0.32, 1);
  function planter(x, z, s = 1) { const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g); add(planterG, MAT.pot, 0, 0.275, 0, g); add(box(0.6, 0.02, 0.06), MAT.cyan, 0, 0.56, 0.2, g).visible = false;
    for (const [dx, dy, dz, m] of [[0, 0.85, 0, MAT.leaf], [0.15, 1.05, 0.05, MAT.leafDk], [-0.13, 1.15, -0.04, MAT.leaf]]) add(leafG, m, dx, dy, dz, g).scale.set(1, 1.2, 1);
    block(x, z, 0.3 * s, 0.3 * s); }
  const trunkG = new THREE.CylinderGeometry(0.025, 0.045, 0.28, 8), padG = new THREE.SphereGeometry(0.11, 12, 8), bpotG = new THREE.BoxGeometry(0.34, 0.08, 0.22);
  function bonsai(x, y, z, s = 1) { const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); scene.add(g); add(bpotG, MAT.pot, 0, 0.04, 0, g);
    const t = add(trunkG, MAT.bark, 0.02, 0.2, 0, g); t.rotation.z = 0.35;
    for (const [dx, dy, dz] of [[-0.06, 0.34, 0.02], [0.09, 0.3, -0.03], [0.02, 0.42, 0]]) add(padG, MAT.leafDk, dx, dy, dz, g).scale.set(1.2, 0.45, 0.9); }
  for (const [x, z] of [[-11.3, 9.3], [6.6, 9.4], [-11.3, -3.3]]) planter(x, z); // Tim 9:40 AM: no plant in front of the usage board (was 7.2, -9.3)

  /* ---------- boards ---------- */
  function makeBoard(id, w, h, cx, cy, cz, rotY, cw, chh) {
    const tex = canvasTex(cw, chh), g = new THREE.Group(); g.position.set(cx, cy, cz); g.rotation.y = rotY; scene.add(g);
    add(box(w + 0.18, h + 0.18, 0.08), MAT.trim, 0, 0, 0, g);
    add(box(w + 0.2, 0.02, 0.06), MAT.cyan, 0, -h / 2 - 0.12, 0.03, g);
    const screen = add(box(w, h, 0.04), [MAT.dark, MAT.dark, MAT.dark, MAT.dark, screenMat(tex.t), MAT.dark], 0, 0, 0.05, g);
    screen.userData.board = id;
    return { id, w, h, g, screen, tex, hits: [] };
  }
  const BW = 9.6, BH = 3.9;
  const project = makeBoard('project', BW, BH, -2, 2.3, -RD / 2 + 0.05, 0, LOW ? 1280 : 2048, LOW ? 520 : 832);
  const usage = makeBoard('usage', 4.4, 2.6, 5.7, 2.2, -RD / 2 + 0.05, 0, LOW ? 640 : 1024, LOW ? 378 : 605);
  const needs = makeBoard('needs', 3.6, 2.4, -RW / 2 + 0.05, 2.1, 1.4, Math.PI / 2, LOW ? 640 : 1024, LOW ? 427 : 683);
  const autos = makeBoard('autos', 3.6, 2.2, -RW / 2 + 0.05, 2.1, 6.2, Math.PI / 2, LOW ? 640 : 1024, LOW ? 391 : 626);
  const writer = makeBoard('writer', 2.6, 1.7, 0 + 4.2, 2.3, RD / 2 - 0.05, Math.PI, LOW ? 512 : 768, LOW ? 335 : 502);
  const constraint = makeBoard('constraint', 4.6, 2.6, -9.4, 2.3, -RD / 2 + 0.05, 0, LOW ? 640 : 1024, LOW ? 362 : 579); // empty back wall left of the checksheet (Tim 2026-11-16)
  const boards = { project, usage, needs, autos, writer, constraint };

  /* ---------- item 8: Pipeline Explorer wall display (right wall, above the lounge; Tim's red-outlined spot) ----------
     Desktop: the live page (https://foreman-cockpit.pages.dev/pipeline) in an iframe on a CSS3D plane that sits behind the WebGL
     canvas and shows through a transparent "hole" in the wall plane. Click it to browse it like a browser (Esc / the bar to
     leave). Phone / TV / no-embed: a plain wall face; click opens the page in a new tab. */
  const PW = 3.4, PH = 1.91, PX = RW / 2 - 0.1, PY = 3.05, PZ = 5.4, PK = 100, PFRAME = [1280, 720];
  const pipe = { live: !LOW && !TV && !touch && !NO_APP && !Q.has('nopipeline'), css: null, browsing: false };
  { const g = new THREE.Group(); g.position.set(PX, PY, PZ); g.rotation.y = -Math.PI / 2; scene.add(g);
    add(box(PW + 0.16, PH + 0.16, 0.06), MAT.trim, 0, 0, 0, g); add(box(PW + 0.18, 0.02, 0.05), MAT.cyan, 0, -PH / 2 - 0.1, 0.03, g);
    if (pipe.live) pipe.mesh = add(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, side: THREE.DoubleSide, blending: THREE.NoBlending }), 0, 0, 0.035, g);
    else { const t = canvasTex(1024, 574); drawPipelineWall(t.ctx, 1024, 574, {}); t.t.needsUpdate = true; pipe.mesh = add(new THREE.PlaneGeometry(PW, PH), screenMat(t.t), 0, 0, 0.035, g); }
    pipe.mesh.userData.board = 'pipeline'; }
  if (pipe.live) try {
    const cssScene = new THREE.Scene(), cssCam = new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.05 * PK, 60 * PK), r = new CSS3DRenderer();
    r.setSize(innerWidth, innerHeight); r.domElement.className = 'css3d'; $('stage').insertBefore(r.domElement, renderer.domElement);
    const wrap = document.createElement('div'); wrap.style.cssText = `width:${PFRAME[0]}px;height:${PFRAME[1]}px;background:#0d1014`;
    const fr = document.createElement('iframe'); fr.src = PIPELINE_URL; fr.title = 'Pipeline Explorer (live)'; fr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
    fr.style.cssText = 'width:100%;height:100%;border:0;background:#fff'; wrap.appendChild(fr);
    const obj = new CSS3DObject(wrap); obj.position.set((PX - 0.035) * PK, PY * PK, PZ * PK); obj.rotation.y = -Math.PI / 2; obj.scale.setScalar(PW * PK / PFRAME[0]); cssScene.add(obj);
    const bar = document.createElement('div'); bar.id = 'browse-bar'; bar.hidden = true;
    bar.innerHTML = '<span>Pipeline Explorer · browsing live</span><a href="' + PIPELINE_URL + '" target="_blank" rel="noopener">Open in new tab ↗</a><button type="button" id="browse-exit">Back to the office (Esc)</button>';
    document.body.appendChild(bar);
    pipe.css = { r, cssScene, cssCam, obj, bar, frame: fr };
  } catch (e) { console.warn('pipeline embed unavailable:', e && e.message); pipe.css = null; pipe.live = false; pipe.mesh.visible = true; }

  /* ---------- lounge: corner sectional, couch, futon, coffee table, exercise bike, plants, waterfall, bonsai ---------- */
  const SIT = []; // lounge sit / nap spots {id, kind:'sit'|'nap'|'bike', x, z, face, lie}
  const seatBlock = (g, len, depth) => { add(box(depth, 0.38, len), MAT.fabric, 0, 0.19, 0, g); add(box(0.22, 0.72, len), MAT.fabric, depth / 2 - 0.11, 0.5, 0, g);
    for (const s of [-1, 1]) add(box(depth, 0.5, 0.18), MAT.fabric, 0, 0.3, s * (len / 2 - 0.09), g);
    add(box(depth - 0.24, 0.12, len - 0.4), MAT.cushion, -0.1, 0.44, 0, g); add(box(0.02, 0.02, len), MAT.cyan, -depth / 2, 0.06, 0, g); };
  function sofa(cx, cz, rotY, len, kind, napOK) {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rotY; scene.add(g); seatBlock(g, len, 0.9);
    // seats along the sofa; face = the sofa's front (local -x)
    const face = rotY - Math.PI / 2, n = Math.max(1, Math.floor(len / 1.0));
    for (let k = 0; k < n; k++) { const off = (k - (n - 1) / 2) * (len / n), lx = -0.1;
      SIT.push({ id: kind + cx + ':' + k, kind: 'sit', x: cx + Math.cos(rotY) * lx + Math.sin(rotY) * off, z: cz - Math.sin(rotY) * lx + Math.cos(rotY) * off, face }); }
    if (napOK) SIT.push({ id: 'nap' + cx, kind: 'nap', x: cx - Math.cos(rotY) * (0.5 + CL), z: cz + Math.sin(rotY) * (0.5 + CL), face, lie: { x: cx, z: cz } });
    const hx = Math.abs(Math.cos(rotY)) * 0.45 + Math.abs(Math.sin(rotY)) * len / 2, hz = Math.abs(Math.sin(rotY)) * 0.45 + Math.abs(Math.cos(rotY)) * len / 2;
    block(cx, cz, hx, hz);
    return g;
  }
  sofa(11.3, 7.7, 0, 3.0, 'secA', true);                 // sectional, along the right wall (faces -x)
  sofa(9.5, 9.35, -Math.PI / 2, 2.4, 'secB', false);      // sectional return, along the front wall (faces -z)
  sofa(7.2, 7.2, Math.PI, 2.2, 'couch', true);            // couch facing the coffee table (+x)
  { // futon: low frame, slatted base, single cushion (faces +z)
    const g = sofa(9.6, 4.6, Math.PI / 2, 2.0, 'futon', true); g.scale.y = 0.85; }
  const ct = new THREE.Group(); ct.position.set(9.4, 0, 7.3); scene.add(ct);
  add(box(1.3, 0.04, 0.75), MAT.glass, 0, 0.42, 0, ct); add(box(1.2, 0.03, 0.65), MAT.dark, 0, 0.12, 0, ct);
  for (const [lx, lz] of [[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]]) add(box(0.03, 0.42, 0.03), MAT.metal, lx, 0.21, lz, ct);
  block(9.4, 7.3, 0.65, 0.38);
  bonsai(9.3, 0.44, 7.3, 1.1);
  // exercise bike
  // Tim (bike_location_1829.png): open floor between the pool table and the waterfall wall, in front of the lounge chair.
  // (A trailing "//" comment used to swallow rotation + scene.add on this line, so the bike was never added to the scene.)
  const bike = new THREE.Group(); bike.position.set(9.4, 0, 2.7);
  bike.rotation.y = -Math.PI / 2; scene.add(bike);
  add(box(0.25, 0.05, 1.0), MAT.dark, 0, 0.03, 0, bike); const fw = add(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 24), MAT.metal, 0, 0.3, 0.35, bike); fw.rotation.z = Math.PI / 2;
  add(box(0.05, 0.62, 0.05), MAT.metal, 0, 0.36, -0.15, bike).rotation.x = -0.25; add(box(0.2, 0.05, 0.28), MAT.dark, 0, 0.68, -0.22, bike);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 12), MAT.metal, 0, 0.235, 0.04, bike).rotation.z = Math.PI / 2; for (const px of [-0.1, 0.1]) add(box(0.09, 0.03, 0.15), MAT.dark, px, 0.235, 0.04, bike); // pedals the rider's feet rest on
  add(box(0.05, 0.7, 0.05), MAT.metal, 0, 0.6, 0.38, bike).rotation.x = 0.2; add(box(0.42, 0.04, 0.04), MAT.metal, 0, 0.95, 0.45, bike); add(box(0.43, 0.012, 0.012), MAT.cyan, 0, 0.98, 0.45, bike);
  // Rider spot comes from the bike's own transform (saddle at local z -0.22, facing the handlebars at local +z), so it follows any placement / rotation.
  bike.updateMatrixWorld(true);
  const saddle = new THREE.Vector3(0, 0, -0.22).applyMatrix4(bike.matrixWorld);
  const ry = bike.rotation.y, fwd = [Math.sin(ry), Math.cos(ry)], bhx = Math.abs(fwd[0]) * 0.5 + Math.abs(fwd[1]) * 0.15, bhz = Math.abs(fwd[1]) * 0.5 + Math.abs(fwd[0]) * 0.15;
  block(bike.position.x, bike.position.z, bhx, bhz); // footprint: base 0.25 x 1.0 plus handlebars, rotated with the bike
  SIT.push({ id: 'bike', kind: 'bike', x: saddle.x, z: saddle.z, face: ry });
  // indoor waterfall: stone wall, a sheet of moving water (scrolling texture, no extra lights) and a basin
  const wf = canvasTex(64, 256); { const g = wf.ctx; g.fillStyle = '#5c8fb0'; g.fillRect(0, 0, 64, 256); for (let k = 0; k < 90; k++) { g.fillStyle = `rgba(230,245,255,${0.15 + (k % 5) * 0.08})`; g.fillRect((k * 23) % 64, (k * 71) % 256, 1 + k % 2, 18 + (k * 13) % 40); } }
  wf.t.wrapS = wf.t.wrapT = THREE.RepeatWrapping; wf.t.repeat.set(2, 1.5); wf.t.needsUpdate = true;
  const waterMat = new THREE.MeshStandardMaterial({ map: wf.t, transparent: true, opacity: 0.8, roughness: 0.1, emissive: 0x16323f, emissiveIntensity: 0.6 });
  const wfall = new THREE.Group(); wfall.position.set(RW / 2 - 0.12, 0, 1.9); wfall.rotation.y = -Math.PI / 2; scene.add(wfall);
  add(box(2.0, 2.6, 0.18), MAT.stone, 0, 1.3, 0, wfall);
  for (let k = 0; k < 9; k++) add(box(0.3 + (k % 3) * 0.12, 0.16, 0.08), k % 2 ? MAT.stone : MAT.trim, -0.8 + (k * 0.37) % 1.6, 0.3 + (k * 0.29) % 2.1, 0.11, wfall);
  add(new THREE.PlaneGeometry(1.1, 2.2), waterMat, 0, 1.35, 0.13, wfall);
  add(box(2.2, 0.35, 0.7), MAT.stone, 0, 0.175, 0.4, wfall);
  const pool2 = add(new THREE.PlaneGeometry(2.0, 0.55), waterMat, 0, 0.36, 0.42, wfall); pool2.rotation.x = -Math.PI / 2;
  add(box(2.2, 0.02, 0.02), MAT.cyan, 0, 0.36, 0.76, wfall);
  block(RW / 2 - 0.5, 1.9, 0.5, 1.1);
  bonsai(RW / 2 - 0.6, 0.36, 0.6, 1.0); bonsai(RW / 2 - 0.6, 0.36, 3.2, 0.9);
  // pool table (kept), coffee station and drinks fridge
  const pool = new THREE.Group(); pool.position.set(8.9, 0, -1.6); scene.add(pool);
  add(box(1.3, 0.18, 2.4), MAT.wood, 0, 0.72, 0, pool); add(box(1.12, 0.03, 2.22), MAT.felt, 0, 0.82, 0, pool); add(box(1.32, 0.015, 2.42), MAT.cyan, 0, 0.62, 0, pool);
  for (const [lx, lz] of [[-0.55, -1.05], [0.55, -1.05], [-0.55, 1.05], [0.55, 1.05]]) add(box(0.1, 0.66, 0.1), MAT.metal, lx, 0.33, lz, pool);
  const ballG = new THREE.SphereGeometry(0.03, 10, 8); let cueBall = null;
  [0xffffff, 0xf2c200, 0x1b4fd8, 0xd8261b, 0x6b2fb3, 0xf07a10, 0x157a3a, 0x111111].forEach((c, k) => { const m = add(ballG, std(c, 0.2), -0.2 + (k % 4) * 0.13, 0.865, -0.4 + Math.floor(k / 4) * 0.12 + (k ? 0.5 : -0.2), pool); if (!k) cueBall = m; }); // item 13: ball 0 is the cue ball (L.poolShot)
  block(8.9, -1.6, 0.65, 1.2);
  const coffee = new THREE.Group(); coffee.position.set(11.3, 0, -6.0); scene.add(coffee);
  add(box(0.7, 0.9, 1.6), MAT.desk, 0, 0.45, 0, coffee); add(box(0.74, 0.04, 1.64), MAT.dark, 0, 0.92, 0, coffee); add(box(0.02, 0.02, 1.6), MAT.cyan, -0.36, 0.9, 0, coffee);
  add(box(0.42, 0.5, 0.36), MAT.dark, 0.05, 1.19, -0.3, coffee); add(box(0.1, 0.06, 0.1), MAT.metal, -0.2, 1.08, -0.3, coffee);
  for (const dz of [0.2, 0.32, 0.44]) add(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12), MAT.white, -0.1, 0.99, dz, coffee);
  const cs = canvasTex(256, 64); drawSign(cs.ctx, 256, 64, 'COFFEE', '#111', '#bfefff'); cs.t.needsUpdate = true;
  const csg = add(box(0.06, 0.22, 0.9), [screenMat(cs.t), MAT.dark, MAT.dark, MAT.dark, MAT.dark, MAT.dark], 0.32, 1.95, 0, coffee); csg.rotation.y = Math.PI;
  block(11.3, -6.0, 0.4, 0.82);
  const fridge = new THREE.Group(); fridge.position.set(11.3, 0, -8.4); scene.add(fridge);
  const fbody = std(0x2b2d31, 0.4, { metalness: 0.6 });
  add(box(0.75, 0.12, 0.85), fbody, 0, 0.06, 0, fridge); add(box(0.75, 0.1, 0.85), fbody, 0, 1.95, 0, fridge);
  add(box(0.75, 1.8, 0.04), fbody, 0, 1.0, -0.405, fridge); add(box(0.75, 1.8, 0.04), fbody, 0, 1.0, 0.405, fridge);
  add(box(0.04, 1.8, 0.85), new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0xcfe6ff, emissiveIntensity: 0.9 }), 0.355, 1.0, 0, fridge);
  const shelfY = [0.42, 0.82, 1.22, 1.62];
  for (const y of shelfY) add(box(0.66, 0.015, 0.76), MAT.metal, 0, y - 0.01, 0, fridge);
  add(box(0.02, 1.84, 0.82), MAT.glass, -0.375, 1.0, 0, fridge);
  add(box(0.04, 0.6, 0.04), MAT.metal, -0.42, 1.2, 0.33, fridge);
  const fs = canvasTex(512, 64); drawSign(fs.ctx, 512, 64, 'ENERGY', '#0b0b0c', '#5cff3a'); fs.t.needsUpdate = true;
  add(box(0.06, 0.16, 0.8), [MAT.dark, screenMat(fs.t), MAT.dark, MAT.dark, MAT.dark, MAT.dark], -0.37, 2.1, 0, fridge);
  block(11.3, -8.4, 0.42, 0.45);
  // energy cans: two InstancedMeshes (one per lookalike style), stock / desk cans alternate deterministically per slot
  const fridgeCans = []; const fridgeRng = L.makeRng(SEED ^ 0x51ed); let fridgeStock = L.FRIDGE_CAP, fridgeDrain = 0, fridgeRefill = 0, lastDeskCans = []; // item 10: simulated stock (no real inventory data)
  for (const y of shelfY) for (let k = 0; k < 5; k++) fridgeCans.push([11.3 - 0.1 + (k % 2) * 0.12, y + 0.0625, -8.4 - 0.3 + k * 0.15]);
  const canSets = [0, 1].map(st => { const m = new THREE.InstancedMesh(canGeometry(), canMaterials(st), 64); m.count = 0; scene.add(m); return m; });
  function layoutCans(deskCans) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1); canSets.forEach(s => (s.count = 0));
    const put = (st, pos, rot) => { const set = canSets[st]; if (set.count >= 64) return; q.setFromEuler(new THREE.Euler(0, rot, 0)); set.setMatrixAt(set.count++, m.compose(pos, q, one)); };
    lastDeskCans = deskCans;
    fridgeCans.forEach(([x, y, z], k) => { if (k < fridgeStock) put(k % 2, new THREE.Vector3(x, y, z), Math.PI + (k % 3) * 0.2); });
    deskCans.forEach(([x, z, seed]) => put(canStyle(seed), new THREE.Vector3(x, 0.8325, z), seed.length * 1.7));
    canSets.forEach(s => (s.instanceMatrix.needsUpdate = true));
  }
  layoutCans([]); // stocked from the first frame, even before any desk data arrives

  /* ---------- meeting room: back-left corner, conference table, chairs and the "New skills" whiteboard ---------- */
  const deskGeo = { top: box(1.6, 0.05, 0.8), leg: box(0.05, 0.72, 0.05), kb: box(0.46, 0.025, 0.15), mouse: new THREE.CapsuleGeometry(0.022, 0.03, 3, 8),
    mon: box(0.95, 0.6, 0.04), stand: new THREE.CylinderGeometry(0.025, 0.025, 0.28, 8), base: box(0.26, 0.02, 0.18), led: box(0.9, 0.018, 0.012),
    lampBase: new THREE.CylinderGeometry(0.07, 0.08, 0.025, 14), lampArm: new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), shade: new THREE.ConeGeometry(0.09, 0.12, 14, 1, true), bulb: new THREE.SphereGeometry(0.035, 10, 8),
    plate: box(0.42, 0.09, 0.05), mug: new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12), card: box(0.12, 0.004, 0.09),
    seat: box(0.5, 0.07, 0.48), back: box(0.48, 0.5, 0.06), pole: new THREE.CylinderGeometry(0.03, 0.03, 0.38, 8), spoke: box(0.04, 0.03, 0.32), ring: new THREE.TorusGeometry(1.15, 0.035, 8, 48) };
  const CONF = { x: -9.0, z: 7.4 }; // Tim item 4: front-left corner, same wall as the entry door (was back-left)
  const conf = new THREE.Group(); conf.position.set(CONF.x, 0, CONF.z); scene.add(conf);
  add(box(3.0, 0.06, 1.2), MAT.desk, 0, 0.74, 0, conf); add(box(3.0, 0.015, 1.2), MAT.cyan, 0, 0.7, 0, conf).scale.set(0.98, 1, 0.96);
  for (const [lx, lz] of [[-1.35, -0.48], [1.35, -0.48], [-1.35, 0.48], [1.35, 0.48]]) add(deskGeo.leg, MAT.metal, lx, 0.36, lz, conf);
  add(box(0.04, 2.4, 3.6), MAT.glass, CONF.x + 2.35, 1.2, CONF.z + 0.4).visible = !LOW; // glass partition
  const CONF_SEATS = [[-1.0, -1.05, 0], [-1.0, 1.05, Math.PI], [0, -1.05, 0], [0, 1.05, Math.PI], [1.0, -1.05, 0], [1.0, 1.05, Math.PI], [1.95, 0, -Math.PI / 2]]
    .map(([dx, dz, face]) => ({ x: CONF.x + dx, z: CONF.z + dz, face }));
  for (const st of CONF_SEATS) {
    const ch = new THREE.Group(); ch.position.set(st.x - Math.sin(st.face) * 0.13, 0, st.z - Math.cos(st.face) * 0.13); ch.rotation.y = st.face - Math.PI; scene.add(ch);
    add(deskGeo.seat, MAT.chair, 0, 0.46, 0, ch); add(deskGeo.back, MAT.chair, 0, 0.78, 0.24, ch); add(deskGeo.pole, MAT.metal, 0, 0.24, 0, ch);
    for (let k = 0; k < 5; k++) { const sp = add(deskGeo.spoke, MAT.metal, 0, 0.05, 0, ch); sp.rotation.y = k * 1.2566; sp.translateZ(0.14); }
    block(ch.position.x, ch.position.z, 0.3, 0.3, false, 'chair');
  }
  const TRAINER_SPOT = { x: CONF.x, z: 9.3, face: Math.PI };
  { const ch = new THREE.Group(); ch.position.set(TRAINER_SPOT.x, 0, TRAINER_SPOT.z + 0.13); scene.add(ch); /* HR stands on this chair while teaching (bots are short) */
    add(deskGeo.seat, MAT.chair, 0, 0.46, 0, ch); add(deskGeo.back, MAT.chair, 0, 0.78, 0.24, ch); add(deskGeo.pole, MAT.metal, 0, 0.24, 0, ch);
    for (let k = 0; k < 5; k++) { const sp = add(deskGeo.spoke, MAT.metal, 0, 0.05, 0, ch); sp.rotation.y = k * 1.2566; sp.translateZ(0.14); } block(ch.position.x, ch.position.z, 0.3, 0.3, false, 'chair'); } // in front of the whiteboard on the front wall, facing the table
  const wb = canvasTex(512, 256), wbG = new THREE.Group(); wbG.position.set(CONF.x, 1.7, RD / 2 - 0.05); wbG.rotation.y = Math.PI; scene.add(wbG);
  add(box(1.75, 0.95, 0.05), MAT.metal, 0, 0, 0, wbG);
  add(box(1.65, 0.85, 0.03), [MAT.white, MAT.white, MAT.white, MAT.white, screenMat(wb.t), MAT.white], 0, 0, 0.025, wbG);
  let wbKey = '';
  let skillList = null; // real skills from office/skills.json; null => the old fallback lines
  let plan = { plans: {}, meeting: null, training: null }, planAt = -1;
  fetch(new URL('skills.json', import.meta.url), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => { skillList = L.parseSkills(j); wbKey = ''; drawWB(plan.meeting); }); // skills.json sits next to this module (office/), not next to the page
  function drawWB(meeting) {
    const live = meeting ? null : L.trainingSlide(plan.training, skillList), skill = live || (meeting ? null : L.skillSlide(skillList, Date.now()));
    const k = meeting ? meeting.id + meeting.title + meeting.seated.join() : live ? 'live' + plan.training.id + live.title : skill ? 'skill' + skill.index + '/' + skillList.length : 'skills';
    if (k === wbKey) return; wbKey = k; drawWhiteboard(wb.ctx, 512, 256, { meeting, skill, demo: DEMO }); wb.t.needsUpdate = true;
  }
  drawWB(null);
  block(CONF.x, CONF.z, 1.5, 0.6);
  const WALL = 0.35;

  /* ---------- desks: built from OFFICE_STATUS bots[] (any N), laid out by L.deskLayout ---------- */
  const desks = [];
  const monW = LOW ? 320 : 640, monH = LOW ? 200 : 400; // small monitor textures; the popup loads full size
  function makeDesk(name, x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    add(deskGeo.top, MAT.desk, 0, 0.745, 0, g); add(box(1.6, 0.012, 0.012), MAT.cyan, 0, 0.72, 0.4, g);
    for (const [lx, lz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) add(deskGeo.leg, MAT.metal, lx, 0.36, lz, g);
    add(deskGeo.kb, MAT.dark, 0, 0.785, 0.12, g); add(deskGeo.mouse, MAT.dark, 0.36, 0.79, 0.14, g).rotation.x = Math.PI / 2;
    const scr = canvasTex(monW, monH);
    const mon = add(deskGeo.mon, [MAT.dark, MAT.dark, MAT.dark, MAT.dark, screenMat(scr.t), MAT.dark], 0, 1.2, -0.22, g);
    add(deskGeo.stand, MAT.metal, 0, 0.9, -0.25, g); add(deskGeo.base, MAT.metal, 0, 0.78, -0.24, g);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x888888, emissiveIntensity: 1 });
    add(deskGeo.led, ledMat, 0, 0.893, -0.195, g);
    const shadeMat = std(0xd8dde4, 0.4, { side: THREE.DoubleSide, metalness: 0.3 }), bulbMat = MAT.bulb.clone();
    add(deskGeo.lampBase, MAT.dark, 0.66, 0.78, -0.22, g); const arm = add(deskGeo.lampArm, MAT.metal, 0.66, 0.99, -0.22, g); arm.rotation.z = 0.12;
    add(deskGeo.shade, shadeMat, 0.63, 1.21, -0.2, g); add(deskGeo.bulb, bulbMat, 0.63, 1.17, -0.2, g);
    const np = canvasTex(256, 56); drawSign(np.ctx, 256, 56, name, '#141416', '#eceef1'); np.t.needsUpdate = true;
    add(deskGeo.plate, [MAT.dark, MAT.dark, MAT.dark, MAT.dark, screenMat(np.t), MAT.dark], 0.5, 0.815, 0.36, g);
    if (name === 'President') { // Tim's desk: upright plaque, front-left corner, left of the monitor and behind the can, leaning back slightly to face the chair (no collider, like the other small props)
      const pq = canvasTex(512, 160); drawPlaque(pq.ctx, 512, 160, ["We're not here to make friends...", "We're here to make cars."]); pq.t.needsUpdate = true;
      add(box(0.3, 0.094, 0.012), [MAT.metal, MAT.metal, MAT.metal, MAT.metal, screenMat(pq.t), MAT.dark], -0.62, 0.818, -0.2, g).rotation.x = -0.2;
    }
    const hasMug = L.hash('mug:' + name) % 3 === 0;
    if (hasMug) add(deskGeo.mug, MAT.white, -0.6, 0.82, 0.05, g);
    const card = add(deskGeo.card, new THREE.MeshStandardMaterial({ color: 0xeef3ff, emissive: 0x334466, emissiveIntensity: 0.4 }), -0.35, 0.775, 0.12, g); card.visible = false;
    const ch = new THREE.Group(); ch.position.set(0, 0, 0.85); g.add(ch);
    add(deskGeo.seat, MAT.chair, 0, 0.46, 0, ch); add(deskGeo.back, MAT.chair, 0, 0.78, 0.24, ch); add(deskGeo.pole, MAT.metal, 0, 0.24, 0, ch);
    for (let k = 0; k < 5; k++) { const s = add(deskGeo.spoke, MAT.metal, 0, 0.05, 0, ch); s.rotation.y = k * 1.2566; s.translateZ(0.14); }
    const hover = new THREE.Mesh(deskGeo.ring, MAT.hover); hover.layers.set(1); hover.rotation.x = Math.PI / 2; hover.position.set(0, 0.04, 0.3); hover.visible = false; g.add(hover);
    const focus = new THREE.Mesh(deskGeo.ring, MAT.focus); focus.layers.set(1); focus.rotation.x = Math.PI / 2; focus.position.set(0, 0.05, 0.3); focus.scale.setScalar(1.08); focus.visible = false; g.add(focus);
    g.traverse(o => { if (o.isMesh && o !== hover && o !== focus) o.userData.deskBot = name; });
    mon.userData.monitor = name;
    block(x, z, 0.8, 0.4, false, 'desk:' + name); block(x, z + 0.85, 0.3, 0.3, false, 'desk:' + name);
    return { name, x, z, g, mon, scr, ledMat, shadeMat, bulbMat, hover, focus, card, lod: '', drawnKey: '', img: null, imgAt: 0,
      seat: { x, z: z + 0.72, face: Math.PI }, stand: { x: x + 1.12, z: z + 0.15 + CL, face: 0 }, visit: { x: x - 1.12, z: z + 0.15 + CL, face: Math.PI / 2 },
      cans: hasMug ? [] : [[x - 0.6, z + 0.05, name]].concat(L.hash('can2:' + name) % 4 === 1 ? [[x - 0.48, z - 0.1, name + '2']] : []), linkPoint: new THREE.Vector3(x, 0.78, z - 0.4) };
  }
  function disposeDesk(d) {
    scene.remove(d.g); d.g.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { if (m && m.map && m.map.isCanvasTexture) m.map.dispose(); }); });
    for (let k = obstacles.length - 1; k >= 0; k--) if (obstacles[k].tag === 'desk:' + d.name) obstacles.splice(k, 1);
  }
  let rosterKey = '';
  function syncDesks() {
    const names = bots().map(b => b.bot), k = names.join('|');
    if (k === rosterKey) return false; rosterKey = k;
    for (const d of desks.splice(0)) disposeDesk(d);
    const lay = L.deskLayout(names.length, names);
    names.forEach((n, i) => desks.push(makeDesk(n, lay[i].x, lay[i].z)));
    for (const [n, c] of chars) if (!names.includes(n)) { scene.remove(c.root); c.tag.remove(); c.bub.remove(); book.release(n); chars.delete(n); }
    for (const c of chars.values()) { c.goalKey = ''; const d = deskOf(c.name); if (d) { c.pos.set(d.seat.x, d.seat.z); c.root.position.set(d.seat.x, 0, d.seat.z); c.path = []; } }
    layoutCans(desks.flatMap(d => d.cans));
    buildGrid(); buildTargets();
    return true;
  }
  const deskOf = n => desks.find(d => d.name === n);

  /* ---------- nav grid (A*, pure: L.createNav) ---------- */
  const nav = L.createNav({ RW, RD, CELL: 0.2, inflate: 0.22, obstacles });
  function buildGrid() { nav.build(obstacles); }
  const toCell = nav.toCell, free = nav.free;
  const route = (from, to) => nav.route(from, to).map(p => new THREE.Vector2(p.x, p.z));

  /* ---------- reserved standing / sitting slots (one bot per slot; item 22) ---------- */
  const book = L.createSlotBook();
  const BOARD_SLOTS = L.boardSlots(16, -2, -RD / 2 + 1.1 + CL, 8).map((p, i) => Object.assign({ id: 'board' + i, kind: 'board' }, p));
  const SLOTS = [
    { id: 'pool1', kind: 'pool', x: 7.95 - CL, z: -2.0, face: Math.PI / 2 }, { id: 'pool2', kind: 'pool', x: 9.85 + CL, z: -1.1, face: -Math.PI / 2 },
    { id: 'coffee1', kind: 'coffee', x: 10.5 - CL, z: -6.4, face: Math.PI / 2 }, { id: 'coffee2', kind: 'coffee', x: 10.5 - CL, z: -5.4, face: Math.PI / 2 },
    { id: 'fridge1', kind: 'fridge', x: 10.45 - CL, z: -8.2, face: Math.PI / 2 }, { id: 'fridge2', kind: 'fridge', x: 9.6 - CL, z: -8.9, face: Math.PI / 2 },
    { id: 'wf1', kind: 'waterfall', x: 10.35, z: 1.9, face: Math.PI / 2 },
    { id: 'lo1', kind: 'loiter', x: 6.4, z: 1.0, face: Math.PI / 2 }, { id: 'lo2', kind: 'loiter', x: 5.0, z: -6.6, face: Math.PI / 2 }, { id: 'lo3', kind: 'loiter', x: 6.2, z: 5.2, face: Math.PI },
    { id: 'lo4', kind: 'loiter', x: -5.2, z: 4.9, face: 0 }, { id: 'lo5', kind: 'loiter', x: 1.5, z: 6.0, face: 0 }, { id: 'lo6', kind: 'loiter', x: -3, z: 6.4, face: 0 }
  ].concat(SIT, CONF_SEATS.map((c, i) => Object.assign({ id: 'conf' + i, kind: 'conf' }, c)), L.groupChatSlots(7.2, -5.0, 4, 0.75).map((c, i) => Object.assign({ id: 'gc' + i, kind: 'gchat' }, c)));
  function takeSlot(c, kinds) {
    const mine = book.slotOf(c.name), cur = mine && SLOTS.concat(BOARD_SLOTS).find(s => s.id === mine);
    if (cur && kinds.includes(cur.kind)) return cur;
    const list = SLOTS.concat(BOARD_SLOTS).filter(s => kinds.includes(s.kind) && !book.holder(s.id));
    if (!list.length) return null;
    const s = list[L.hash(c.name + kinds.join()) % list.length]; return book.take(s.id, c.name) ? s : null; // never two bots on one spot
  }
  const slotById = id => SLOTS.concat(BOARD_SLOTS).find(s => s.id === id);

  /* ---------- characters ---------- */
  const tmpV = new THREE.Vector3();
  function ensureChars() {
    for (const b of bots()) {
      if (chars.has(b.bot) || !deskOf(b.bot)) continue;
      const c = makeBot(b.bot, !LOW, b.bot_id, b), d = deskOf(b.bot);
      c.phase = (L.hash(b.bot) % 600) / 100; c.pickups = []; c.jobs = []; c.job = null; c.idle = L.createIdleState(); c.rng = L.makeRng(SEED ^ L.hash(b.bot)); c.path = []; c.goalKey = ''; c.pos = new THREE.Vector2(d.seat.x, d.seat.z);
      c.root.position.set(d.seat.x, 0, d.seat.z); c.root.rotation.y = Math.PI; c.pose = 'sit'; c.wantSince = 0; c.carry = false;
      scene.add(c.root); chars.set(b.bot, c); c.botId = b.bot_id;
      c.tag = document.createElement('div'); c.tag.className = 'tag'; $('labels').appendChild(c.tag);
      c.bub = document.createElement('div'); c.bub.className = 'bubbles'; c.bub.hidden = true; c.bub.onclick = () => openConvo(b.bot); $('labels').appendChild(c.bub);
      c.tagKey = ''; c.bubKey = '';
    }
    for (const p of pendingPickups.splice(0)) queuePickup(p);
  }
  function cardCenter(itemId) {
    const h = project.hits.find(x => x.id === itemId);
    if (!h) return new THREE.Vector3(-2, 2.3, -RD / 2 + 0.13);
    return new THREE.Vector3(-2 + (h.x + h.w / 2 - 0.5) * BW, 2.3 + (0.5 - (h.y + h.h / 2)) * BH, -RD / 2 + 0.13); // z in front of the board face so the line starts ON the card
  }
  const IDLE_PLAN = new Set(['wander', 'coffee', 'chat', 'fridge', 'lounge', 'bike', 'sleep', 'visitdesk', 'game']); // planOffice acts that mean "idle life"; the idle rotation (item 11) replaces them
  function updatePlan() {
    const t = performance.now(); if (t - planAt < 500) return; planAt = t;
    const now = Date.now(), list = bots().filter(b => deskOf(b.bot)), ctx = signalCtx();
    S.fresh = Object.fromEntries(list.map(b => [b.bot, freshOf(withRoutine(b), now, ctx)]));
    S.needsSet = S.state === 'failed' ? new Set() : L.needsTimNames(needsData());
    plan = L.planOffice(list, S.parsed ? S.parsed.meetings : [], now, S.state, S.fresh, { training: DEMO ? [] : S.training, needs: S.needsSet }); // item 3 / 9: only a real needs_tim item waves
    const idleNames = list.filter(b => { const c = chars.get(b.bot), p = plan.plans[b.bot]; return c && p && !p.brk && IDLE_PLAN.has(p.act) && L.statusStyle(b.status).behavior !== 'work' && !S.needsSet.has(b.bot) && !c.job && !c.jobs.length; }).map(b => b.bot);
    S.restocker = L.pickRestocker(idleNames, fridgeStock, S.restocker); // item 10: an idle bot restocks when the fridge runs low
    updateInvite(list, idleNames);
    drawWB(plan.meeting);
  }
  /* HR invite (idle activity hr_training): HR walks to 1 or 2 idle bots that are waiting for training, says the invite, then
     those bots go to the training room and HR leads. No HR (or HR busy) -> the bag skips hr_training. */
  function updateInvite(list, idleNames) {
    const hr = chars.get(L.TRAINER), hp = plan.plans[L.TRAINER];
    S.hrFree = !!(hr && hp && ['visit', 'lead', 'wander'].includes(hp.act) && !plan.meeting && !S.needsSet.has(L.TRAINER) && !hr.job && !hr.jobs.length && !hr.pickups.length);
    const idleSet = new Set(idleNames), active = list.map(b => chars.get(b.bot)).filter(c => c && c.name !== L.TRAINER && idleSet.has(c.name) && c.idleAct === 'hr_training');
    const inv = S.invite, cur = L.inviteCurrent(inv);
    const waiting = active.filter(c => c.invitedUntil !== c.idle.until && !(inv && inv.guests.includes(c.name))).map(c => c.name);
    const heldFor = hr && cur && hr.goalKey === 'invite:' + cur && hr.arrived ? clock - hr.arrivedAt : -1;
    S.invite = S.hrFree ? L.inviteStep(inv, { active: active.map(c => c.name), add: waiting, heldFor, now: clock }) : null;
    if (!S.invite && S.hrFree && waiting.length && !plan.training) S.invite = L.inviteStart(waiting, clock);
  }
  const charPos = n => { const o = chars.get(n); return o ? { x: o.pos.x, z: o.pos.y } : null; };
  const seated = p => ['sit', 'type', 'game', 'meet', 'deskSleep', 'nap', 'lounge', 'bike'].includes(p);
  /* item 12: job flow (L.jobStep): receive at the board -> work at the desk -> log at the board */
  function jobGoal(c, d) {
    if (!c.job) c.job = L.jobStart(c.jobs.shift().itemId, clock);
    const j = c.job, key = 'job:' + j.itemId + ':' + j.phase, it = items().find(i => i.id === j.itemId), finished = !it || L.columnFor(it) === 'done';
    const here = c.goalKey === key && !!c.arrived, held = here ? clock - c.arrivedAt : -1;
    if (j.phase !== 'work' && here && !S.glow.has(j.itemId)) { S.glow.add(j.itemId); boardDirty = true; }
    if (j.phase === 'work' && here && c.carry) { c.carry = false; d.card.visible = true; }
    const nx = L.jobStep(j, { arrived: here, heldFor: held, finished, now: clock });
    if (nx !== j) {
      S.glow.delete(j.itemId); boardDirty = true; book.release(c.name); c.job = nx;
      if (j.phase === 'receive') c.carry = true;
      if (!nx) { c.carry = false; return c.jobs.length ? jobGoal(c, d) : null; }
      return jobGoal(c, d);
    }
    if (j.phase === 'work') return { key, spot: d.seat, pose: 'type' };
    return { key, spot: takeSlot(c, ['board']) || BOARD_SLOTS[0], pose: 'board' };
  }
  /* Group chat: bots whose idle activity is group_chat stand in groups of 2 or 3 around a free spot, each facing the next. */
  const GROUP_CENTERS = [[7.2, -5.0], [6.4, 1.0], [5.0, -6.6], [6.2, 5.2], [-5.2, 4.9], [1.5, 6.0], [-3, 6.4]];
  let groupCenters = null;
  function chatCenters() { // centres whose ring of 3 is clear of furniture (the first one is the original, always kept)
    if (!groupCenters) groupCenters = GROUP_CENTERS.filter((g, i) => i === 0 || L.groupChatSlots(g[0], g[1], 3, 0.6).every(p => free(...toCell(p.x, p.z))));
    return groupCenters;
  }
  function groupChatGoal(c) {
    const names = [...chars.values()].filter(o => o.idleAct === 'group_chat' && o.goalNow && o.goalNow.ambient === 'group' || o === c).map(o => o.name), gs = L.chatGroups(names), me = gs[c.name];
    if (!me) return null;
    const cs = chatCenters(), ctr = cs[me.group % cs.length], slots = L.groupChatSlots(ctr[0], ctr[1], me.n, me.n === 2 ? 0.45 : 0.6), spot = slots[me.i];
    book.release(c.name);
    return { key: 'gc:' + me.group + ':' + me.n + ':' + me.i, spot, pose: 'talk', faceBot: me.n === 2 ? L.groupFace(me.members, c.name) : null, ambient: 'group', members: me.members };
  }
  /* item 11 / 10 / 13: idle activity -> where the bot goes and what it does */
  function idleGoal(c, d, slotted) {
    if (c.restocked && c.goal && c.goal.pose === 'restock' && clock - c.restockedAt < 2.5) return Object.assign({}, c.goal, { box: false }); // set the box down, then move on
    const ctx = { restock: S.restocker === c.name ? 'force' : (fridgeStock >= L.FRIDGE_CAP || S.restocker) ? 'no' : 'ok', blocked: c.name === L.TRAINER || !S.hrFree ? ['hr_training'] : [] };
    const act = L.idleTick(c.idle, c.rng, clock, ctx); c.idleAct = act;
    const own = (key, pose) => { book.release(c.name); return { key, spot: d.seat, pose }; };
    switch (act) {
      case 'couch_sleep': return slotted(['nap']) || own('sleep', 'deskSleep');
      case 'desk_nap': return own('sleep', 'deskSleep');
      case 'hr_training': {
        if (c.invitedUntil === c.idle.until || L.inviteGoesToRoom(S.invite, c.name)) { c.invitedUntil = c.idle.until; return Object.assign(slotted(['conf']) || own('seat', 'sit'), { ambient: 'reply' }); } // invited: go to the training room
        if (!c.hrWait || c.hrWait.until !== c.idle.until) c.hrWait = { until: c.idle.until, at: clock };
        if (clock - c.hrWait.at > L.INVITE_WAIT_S) return slotted(['loiter']) || own('seat', 'sit'); // HR never came: do something else quietly
        book.release(c.name); return { key: 'await-hr', spot: { x: c.pos.x, z: c.pos.y }, pose: ['sit', 'type', 'game', 'deskSleep'].includes(c.pose) ? 'sit' : 'stand' }; // wait here for HR's invite
      }
      case 'video_game': return own('game', 'game');
      case 'exercise_bike': return slotted(['bike']) || slotted(['sit']) || slotted(['loiter']) || own('seat', 'sit');
      case 'group_chat': return groupChatGoal(c) || Object.assign(slotted(['loiter']) || own('seat', 'sit'), { ambient: 'group' });
      case 'waterfall_view': return slotted(['waterfall']) || slotted(['loiter']) || own('seat', 'sit'); // stand and face the waterfall
      case 'get_coffee': return slotted(['coffee']) || slotted(['loiter']) || own('seat', 'sit'); // walk to the machine, then hold the cup
      case 'get_energy_drink': return slotted(['fridge']) || slotted(['loiter']) || own('seat', 'sit'); // fridge, then hold the can
      case 'restock_fridge': { const g = slotted(['fridge']) || slotted(['loiter']) || own('seat', 'sit'); return Object.assign(g, { key: 'restock:' + g.key, pose: g.spot.kind === 'fridge' ? 'restock' : g.pose, box: !c.restocked }); }
      case 'pool': return slotted(['pool']) || slotted(['loiter']) || own('seat', 'sit');
    }
    return slotted(['loiter']) || own('seat', 'sit');
  }
  function hrInviteGoal(c) {
    const cur = L.inviteCurrent(S.invite), g = cur && chars.get(cur);
    if (!g) return { key: 'lead', spot: TRAINER_SPOT, pose: 'talk', ambient: 'train' };
    const gd = deskOf(cur), atDesk = ['sit', 'type', 'game', 'deskSleep'].includes(g.pose);
    let spot = atDesk && gd ? gd.visit : null;
    if (!spot) { const dx = c.pos.x - g.pos.x, dz = c.pos.y - g.pos.y, d = Math.hypot(dx, dz) || 1; spot = { x: g.pos.x + dx / d * 0.85, z: g.pos.y + dz / d * 0.85 }; }
    return { key: 'invite:' + cur, spot, pose: 'talk', faceBot: cur, ambient: 'invite', say: L.inviteText(cur) };
  }
  function decide(c, b, convo) {
    const st0 = L.statusStyle(b ? b.status : 'idle'), d = deskOf(c.name), needsTim = S.needsSet.has(c.name);
    if (c.spot) return { key: 'spot', spot: c.spot, pose: 'stand' }; // test/screenshot hook only
    if (needsTim) { book.release(c.name); return { key: 'stand', spot: d.stand, pose: 'wave' }; } // real needs_tim item only: stays at its own desk, one arm waving
    if (c.pickups.length) { // board card life: pin a new card, or take one off the board and carry it to the desk
      const pk = c.pickups[0], id = pk.itemId, key = 'pick:' + id;
      if (c.goalKey === key && c.arrived) {
        if (!S.glow.has(id)) { S.glow.add(id); boardDirty = true; }
        if (clock - c.arrivedAt > 2.6) { c.pickups.shift(); S.glow.delete(id); boardDirty = true; if (pk.reason === 'take' || pk.reason === 'reassigned') c.carry = true; book.release(c.name); return decide(c, b, convo); }
      }
      const s = takeSlot(c, ['board']) || BOARD_SLOTS[0];
      return { key, spot: s, pose: 'board' };
    }
    if (c.job || c.jobs.length) { const jg = jobGoal(c, d); if (jg) return jg; } // item 12: walk to the board for the job, work at the desk, walk back to log it
    if (c.carry) { if (c.goalKey === 'carry' && c.arrived) { c.carry = false; d.card.visible = true; } else return { key: 'carry', spot: d.seat, pose: 'sit' }; }
    if (convo && deskOf(convo.to)) { book.release(c.name); const dd = deskOf(convo.to); return { key: 'talk:' + convo.to, spot: dd.visit, pose: 'talk', faceBot: convo.to }; }
    if (c.name === L.TRAINER && S.invite) { book.release(c.name); return hrInviteGoal(c); }
    const p = plan.plans[c.name] || { act: S.fresh[c.name] && S.fresh[c.name].stale ? 'stale' : st0.behavior === 'work' ? 'work' : 'wander' };
    const POSE_OF = { waterfall: 'stand', loiter: 'stand', sit: 'lounge', conf: 'meet', gchat: 'talk' };
    const slotted = kinds => { const s = takeSlot(c, kinds); return s ? { key: 'slot:' + s.id, spot: s, pose: POSE_OF[s.kind] || s.kind, lie: s.lie, can: p.can } : null; };
    if (!p.brk && IDLE_PLAN.has(p.act) && st0.behavior !== 'work') return idleGoal(c, d, slotted); // item 11: idle activity rotation
    const act = p.act === 'stale' && p.trip ? 'trip' : p.act; // quiet (stale) bots take idle trips too
    if (!['coffee', 'fridge', 'lounge', 'bike', 'wander', 'sleep', 'replay_board', 'trip'].includes(act)) book.release(c.name);
    switch (act) {
      case 'trip': return slotted({ bike: ['bike'], pool: ['pool'], lounge: ['sit'], board: ['board'], waterfall: ['waterfall'] }[p.trip || p.spot] || ['loiter']) || { key: 'seat:work', spot: d.seat, pose: 'type' }; // idle trip: walk there, idle, the plan flips back to work and the bot walks home and sits
      case 'stale': return { key: 'stale', spot: d.seat, pose: 'sit', stale: true }; // no fresh signal for 2 h: sits quietly, no "?" (Tim, item 3)
      case 'stretch': return { key: 'stretch', spot: d.stand, pose: 'stretch' }; // item 9: short stretch beside the desk, then back to work
      case 'work': case 'replay': return { key: 'seat:' + p.act, spot: d.seat, pose: 'type', recent: p.replay };
      case 'replay_board': return Object.assign(slotted(['board']) || { key: 'seat', spot: d.seat, pose: 'type' }, { pose: 'board', recent: p.replay });
      case 'meeting': case 'train': return { key: p.act + ':' + p.seat, spot: CONF_SEATS[p.seat], pose: 'meet', ambient: p.act === 'train' ? 'reply' : '' };
      case 'lead': return { key: 'lead', spot: TRAINER_SPOT, pose: 'talk', ambient: 'train' };
      case 'sleep': return (L.hash(c.name) % 2 && slotted(['nap'])) || (book.release(c.name), { key: 'sleep', spot: d.seat, pose: 'deskSleep' });
      case 'game': return { key: 'game', spot: d.seat, pose: 'game' };
      case 'coffee': case 'fridge': return slotted([p.act]) || slotted(['loiter']) || { key: 'seat', spot: d.seat, pose: 'type' };
      case 'lounge': return slotted(['sit']) || slotted(['loiter']);
      case 'bike': return slotted(['bike']) || slotted(['sit']) || slotted(['loiter']);
      case 'visitdesk': { const td = deskOf(p.partner); if (td) return { key: 'vd:' + p.partner, spot: td.visit, pose: 'talk', faceBot: p.partner, ambient: 'chat', pair: c.name + '|' + p.partner, can: p.can }; break; }
      case 'chat': {
        if (p.host) return { key: 'host:' + p.partner, spot: d.seat, pose: 'talk', faceBot: p.partner, ambient: 'chat', pair: [p.partner, c.name].sort().join('|'), can: p.can };
        const hd = deskOf(p.partner); return { key: 'guest:' + p.partner, spot: hd.visit, pose: 'talk', faceBot: p.partner, ambient: 'chat', pair: [p.partner, c.name].sort().join('|'), can: p.can };
      }
      case 'listen': return { key: 'listen', spot: d.seat, pose: 'talk', faceBot: p.partner, ambient: 'reply', pair: p.partner + '|' + c.name, can: p.can };
      case 'visit': { const td = deskOf(p.partner); return { key: 'visit:' + p.partner, spot: td.visit, pose: 'talk', faceBot: p.partner, ambient: 'visit', pair: c.name + '|' + p.partner, can: p.can }; }
    }
    return slotted(['loiter', 'pool']) || { key: 'seat', spot: d.seat, pose: 'sit' };
  }
  const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };
  let walkingNow = 0, poolNow = L.poolShot(0);
  function updateChar(c, dt) {
    const b = botByName(c.name), reduced = reducedMQ.matches;
    const frozen = S.state === 'failed';
    c.setFrozen(frozen);
    const st = L.statusStyle(b ? b.status : 'idle'), needs = S.needsSet.has(c.name) && !frozen;
    if (frozen) {
      c.warn.visible = false; c.quest.visible = false; c.zzz.visible = false; c.setExpression(L.exprFor({ failed: true, pose: c.pose, name: c.name })); c.updateFace(dt, clock, true);
      animate(c, c.pose === 'type' || c.pose === 'sit' ? 'sit' : 'frozen', clock, dt, { reduced: true, holding: false });
      return;
    }
    const convo = activeConvos.get(c.name);
    let g = decide(c, b, convo);
    const dk = deskOf(c.name);
    if (c.gaveUp && dk && (c.gaveUp.key === g.key && clock < c.gaveUp.until)) g = { key: 'home', spot: dk.seat, pose: 'sit' }; // could not get there: back to the desk until the idle rotation picks something else
    if (g.key !== c.goalKey) {
      // walking cap: at most a third of the bots on the move; others wait where they are (alerts never wait)
      const far = Math.hypot(g.spot.x - c.pos.x, g.spot.z - c.pos.y) > 0.4;
      if (far && !needs && walkingNow >= L.walkCap(chars.size)) { if (!c.wantSince) c.wantSince = clock; }
      else { c.goalKey = g.key; c.goal = g; c.arrived = false; c.wantSince = 0; if (!g.key.startsWith('restock:')) c.restocked = false; c.path = route({ x: c.pos.x, z: c.pos.y }, g.spot); c.prog = null; if (far) walkingNow++; }
    }
    const goal = c.goalKey === g.key ? g : (c.goal || g);
    let pose = goal.pose;
    if (c.path.length) {
      c.prog = L.walkProgress(c.prog, Math.hypot(c.path[0].x - c.pos.x, c.path[0].y - c.pos.y), clock);
      if (c.prog.action === 'reroute') { c.path = route({ x: c.pos.x, z: c.pos.y }, goal.spot); c.prog = { best: Infinity, since: clock, tries: c.prog.tries, action: 'ok' }; }
      else if (c.prog.action === 'giveup') {
        c.path = []; c.prog = null;
        if (goal.key === 'home') { c.pos.set(goal.spot.x, goal.spot.z); c.root.position.set(c.pos.x, 0, c.pos.y); }
        else { c.gaveUp = { key: goal.key, until: clock + 30 }; c.idle.until = 0; c.goalKey = ''; }
      }
    }
    if (c.path.length) {
      const tgt = c.path[0], dx = tgt.x - c.pos.x, dz = tgt.y - c.pos.y, dist = Math.hypot(dx, dz), step = 1.35 * dt;
      if (dist <= step) { c.pos.copy(tgt); c.path.shift(); c.prog = null; } else { c.pos.x += dx / dist * step; c.pos.y += dz / dist * step; }
      if (dist > 0.01) c.root.rotation.y = angLerp(c.root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 10));
      pose = 'walk';
      c.root.position.set(c.pos.x, 0, c.pos.y);
    } else {
      if (!c.arrived) { c.arrived = true; c.arrivedAt = clock; }
      if (c.goalKey !== g.key) pose = seated(c.pose) ? c.pose : 'stand';
      let face = goal.spot.face;
      if (goal.faceBot) { const o = charPos(goal.faceBot) || deskOf(goal.faceBot); if (o) face = Math.atan2(o.x - c.pos.x, o.z - c.pos.y); }
      if (face != null) c.root.rotation.y = angLerp(c.root.rotation.y, face, Math.min(1, dt * 6));
      const lie = goal.lie && pose === 'nap' ? goal.lie : null;
      c.root.position.x += ((lie ? lie.x : c.pos.x) - c.root.position.x) * Math.min(1, dt * 4);
      c.root.position.z += ((lie ? lie.z : c.pos.y) - c.root.position.z) * Math.min(1, dt * 4);
    }
    c.pose = pose;
    c.goalNow = goal;
    // item 10: restock = the box goes into the fridge (stock back to full); a refresh at the fridge uses one can
    if (goal.pose === 'restock' && c.arrived && !c.restocked && clock - c.arrivedAt > 1.8) { fridgeStock = L.FRIDGE_CAP; layoutCans(lastDeskCans); c.restocked = true; c.restockedAt = clock; S.restocker = null; }
    if (goal.pose === 'fridge' && c.arrived && clock - c.arrivedAt > 1.4 && c.tookKey !== c.goalKey) { c.tookKey = c.goalKey; fridgeStock = L.fridgeTake(fridgeStock); layoutCans(lastDeskCans); }
    const nowMs = Date.now(), fresh = S.fresh[c.name], itemsNow = items(), gk = goal.key || '';
    const near = !renderer.xr.isPresenting && !TV && Math.hypot(camera.position.x - c.root.position.x, camera.position.z - c.root.position.z) < 1.5 && pose !== 'nap' && pose !== 'deskSleep';
    c.setExpression(L.exprFor({ pose, name: c.name, t: clock, needsTim: needs, status: L.failedPr(c.name, itemsNow, S.pulls) ? 'failed' : b ? L.statusStyle(b.status).status : 'idle', stale: !!(fresh && fresh.stale), near,
      mergedRecently: L.mergedRecently(c.name, itemsNow, S.prStates, S.prTimes, nowMs), greeted: (() => { const hr = chars.get(L.TRAINER); return !!(hr && hr.goalKey === 'invite:' + c.name && hr.arrived); })(),
      surprised: gk.startsWith('job:') && gk.endsWith(':receive') && c.arrived && clock - c.arrivedAt < 2.5, ambient: goal.ambient || '' })); // eased + blinking in c.updateFace

    c.warn.visible = needs;
    c.quest.visible = false; // "?" is gone: only a real needs_tim item shows anything (the warning triangle + arm wave)
    c.updateFace(dt, clock, reduced);
    if (needs) { const p = L.pulse(clock, reduced); c.warn.userData.mat.emissiveIntensity = 0.3 + p; c.warn.scale.setScalar(reduced ? 1 : 0.94 + 0.08 * p); c.warn.rotation.y = Math.atan2(camera.position.x - c.root.position.x, camera.position.z - c.root.position.z) - c.root.rotation.y; }
    const perch = ['sit', 'type', 'game', 'deskSleep'].includes(pose) && !!dk && Math.hypot(c.pos.x - dk.seat.x, c.pos.y - dk.seat.z) < 0.1;
    animate(c, pose, clock, dt, { perch, chair: goal.key === 'lead' && pose === 'talk', reduced, holding: c.arrived && clock - c.arrivedAt > 1.4, can: !!goal.can, carry: c.carry && pose === 'walk', box: !!goal.box && !c.restocked, stroke: pose === 'pool' ? (goal.spot && goal.spot.id === 'pool1' ? poolNow.stroke : 0) : null });
    c.rig.position.x = pose === 'nap' ? 0.5 : 0;
  }
  /* separation: no two upright bots closer than MIN_SEP (seated / lying bots are fixed points) */
  function separateChars() {
    const list = [...chars.values()], pts = list.map(c => ({ x: c.pos.x, z: c.pos.y, fixed: seated(c.pose) || c.pose === 'wave', r: c.radius || 0.3 }));
    if (pts.length < 2) return;
    L.separateWalkers(pts, L.MIN_SEP * 0.9, (x, z) => free(...toCell(x, z)));
    list.forEach((c, i) => { if (!pts[i].fixed && (pts[i].x !== c.pos.x || pts[i].z !== c.pos.y)) { c.pos.set(pts[i].x, pts[i].z); c.root.position.x = c.pos.x; c.root.position.z = c.pos.y; } });
  }

  /* ---------- labels & speech bubbles ---------- */
  const activeConvos = new Map(); let convoLines = [];
  function updateConvos() {
    activeConvos.clear();
    convoLines = S.state === 'failed' ? [] : L.recentConversations(S.parsed ? S.parsed.conversations : [], Date.now());
    for (const c of convoLines) activeConvos.set(c.from, c);
  }
  function updateLabels() {
    const w = innerWidth, h = innerHeight, max = TV ? 40 : 22, now = Date.now();
    for (const c of chars.values()) {
      const b = botByName(c.name), st = L.statusStyle(b ? b.status : 'idle'), frozen = S.state === 'failed', needs = S.needsSet.has(c.name) && !frozen;
      const rp = c.goalNow && c.goalNow.recent;
      const why = frozen ? 'office data unavailable' : S.state === 'stale' ? 'office data is stale (' + L.dataAge(S.parsed.updatedAt, now).text + ')' : b && b.why ? b.why : '';
      const fr = !frozen && !needs && S.fresh[c.name] && S.fresh[c.name].stale ? S.fresh[c.name].label : '';
      const key = c.name + st.status + needs + frozen + S.state + (hoverBot === c.name) + (rp ? rp.min : '') + why + fr;
      if (key !== c.tagKey) {
        c.tagKey = key;
        c.tag.className = 'tag' + (frozen ? ' frozen' : '') + (hoverBot === c.name ? ' hl' : '');
        const chip = needs ? '<span class="chip">⚠ NEEDS TIM</span>' : ''; // no bare "?" chip: only a real needs_tim item is flagged
        const recent = fr ? `<span class="chip stale">${esc(fr)}</span>` : rp && !needs ? `<span class="chip recent">recent · ${rp.min}m ago</span>` : '';
        c.tag.innerHTML = chip + esc(c.name) + recent; c.tag.title = why ? '? ' + why : '';
        const short = shortTag(c.name, c.botId);
        if (short !== c.name && c.tag.offsetWidth > Math.min(TAG_MAX_PX, w * 0.3)) { c.tag.innerHTML = chip + esc(short) + recent; c.tag.title = c.name + (why ? ' · ? ' + why : ''); }
      }
      tmpV.set(c.root.position.x, c.top + (needs ? 0.75 : 0.18) + c.rig.position.y, c.root.position.z).project(camera);
      const dist = camera.position.distanceTo(c.root.position);
      const vis = tmpV.z < 1 && dist < max && Math.abs(tmpV.x) < 1.2 && Math.abs(tmpV.y) < 1.2;
      c.tag.style.display = vis ? '' : 'none';
      const sx = (tmpV.x * 0.5 + 0.5) * w, sy = (-tmpV.y * 0.5 + 0.5) * h;
      if (vis) c.tag.style.transform = `translate(-50%,-100%) translate(${sx}px,${sy}px)`;
      const lines = convoLines.filter(l => l.from === c.name).slice(-1), amb = lines.length ? '' : rp ? '' : ambientText(c);
      const bk = lines.length ? lines.map(l => l.at + l.text).join('|') : rp ? 'rp' + rp.text : amb;
      if (bk !== c.bubKey) {
        c.bubKey = bk;
        c.bub.innerHTML = lines.length ? lines.map(l => `<div class="bubble${l.text ? '' : ' who'}">${esc(L.bubbleText(l))}</div>`).join('')
          : rp ? `<div class="bubble recent"><span class="amb">recent · ${rp.min}m ago</span> ${esc(L.truncate(rp.text, 40))}</div>`
          : amb ? `<div class="bubble ambient${c.goalNow && ['group', 'invite'].includes(c.goalNow.ambient) ? ' speech' : ''}"><span class="amb">ambient</span> ${esc(L.truncate(amb, L.BUBBLE_MAX))}</div>` : '';
      }
      const show = lines.length || amb || rp;
      c.bub.hidden = !show || !vis;
      c.bub.style.pointerEvents = lines.length ? '' : 'none';
      if (show && vis) c.bub.style.transform = `translate(-50%,-100%) translate(${sx}px,${sy - (TV ? 46 : 26)}px)`;
    }
  }
  function ambientText(c) {
    const g = c.goalNow; if (!g || !g.ambient || !c.arrived || S.state === 'failed') return '';
    const tick = Math.floor(clock / 4);
    if (g.pose === 'meet') return tick % 3 === 1 && g.ambient === 'reply' ? L.ambientLine('reply', c.name, tick) : '';
    if (g.ambient === 'train') return L.ambientLine('train', c.name, tick);
    if (g.ambient === 'invite') return g.say || ''; // HR at the guest: the invite
    if (g.ambient === 'group') return g.members && g.members.length > 1 && L.groupSpeaker(g.members, tick) === c.name ? L.ambientLine('group', g.members.join('|'), tick) : ''; // standing group of 2-3: one speaks at a time, the line follows the turn
    const other = g.faceBot && chars.get(g.faceBot);
    if (other && !other.arrived) return '';
    const pair = (g.pair || c.name).split('|'), speaker = pair[tick % 2];
    return speaker === c.name ? L.ambientLine(g.ambient, g.pair || c.name, tick) : '';
  }

  /* ---------- card-to-desk lines ---------- */
  const lines = new Map();
  function updateLines() {
    const seen = new Set();
    for (const it of items()) {
      const d = deskOf(it.owner); if (!d) continue;
      const h = project.hits.find(x => x.id === it.id); if (!h) continue;
      seen.add(it.id);
      let ln = lines.get(it.id);
      if (!ln) { ln = new THREE.Line(new THREE.BufferGeometry(), MAT.lineFaint); ln.frustumCulled = false; scene.add(ln); lines.set(it.id, ln); } // never culled by a stale bounding sphere
      ln.geometry.setFromPoints([cardCenter(it.id), d.linkPoint]); ln.geometry.computeBoundingSphere();
      ln.userData.owner = it.owner;
    }
    for (const [id, ln] of lines) if (!seen.has(id)) { scene.remove(ln); ln.geometry.dispose(); lines.delete(id); }
  }

  /* ---------- screens ---------- */
  let boardDirty = true, page = 0, pageAt = 0, focusItem = null;
  function drawBoards() {
    const hl = new Set();
    if (hoverBot) items().filter(i => i.owner === hoverBot).forEach(i => hl.add(i.id));
    if (hoverItem) hl.add(hoverItem);
    const t = project.tex, tabs = L.projectTabs(items()); if (!tabs.includes(boardTab)) boardTab = 'All';
    const cols = L.boardView(items(), { tab: boardTab, doneOpen });
    const age = S.parsed ? L.dataAge(S.parsed.updatedAt, Date.now()) : null;
    project.hits = drawBoard(t.ctx, t.c.width, t.c.height, { cols, tabs, tab: boardTab, page, state: S.state, ageText: age ? age.text : '', demo: DEMO, highlight: hl, glow: S.glow, focusId: focusItem });
    pagesN = project.hits.pages || 1;
    t.t.needsUpdate = true;
    const u = usage.tex; drawUsage(u.ctx, u.c.width, u.c.height, { rows: L.usageRows(S.readings, Date.now(), S.parsed ? S.parsed.usage : null), now: Date.now(), demo: DEMO, failed: S.state === 'failed' && !S.readings.length }); u.t.needsUpdate = true;
    const n = needs.tex; needs.hits = drawNeeds(n.ctx, n.c.width, n.c.height, { entries: needsEntries(), count: needsCount(), demo: DEMO, state: S.state }); n.t.needsUpdate = true;
    const a = autos.tex; drawAutomations(a.ctx, a.c.width, a.c.height, { auto: S.auto, err: S.autoErr, now: Date.now(), demo: DEMO }); a.t.needsUpdate = true;
    const wr = writer.tex; drawWriterHealth(wr.ctx, wr.c.width, wr.c.height, { auto: S.auto, err: S.autoErr, demo: DEMO }); wr.t.needsUpdate = true;
    const cw = constraint.tex; drawConstraintWall(cw.ctx, cw.c.width, cw.c.height, constraintView(Date.now())); cw.t.needsUpdate = true;
    updateLines();
    for (const [id, ln] of lines) ln.material = hl.has(id) || (hoverBot && ln.userData.owner === hoverBot) ? MAT.lineHi : MAT.lineFaint;
    for (const d of desks) d.card.visible = d.card.visible || items().some(i => i.work && i.owner === d.name && L.columnFor(i) !== 'done' && i.work.poster !== d.name);
    boardDirty = false;
  }
  let pagesN = 1;
  /* monitor mirror images: small, refreshed every 60 s with ?t= (popup loads its own full-size copy) */
  function mirrorFor(d, b, now) {
    const id = idFor(b.bot, b.bot_id), sc = L.screenState(S.screens, id, now);
    if (sc.show !== 'image') { d.img = null; return sc; }
    if (!d.img || now - d.imgAt > 60000) {
      const im = new Image(); im.crossOrigin = 'anonymous'; d.imgAt = now;
      im.onload = () => { d.img = im; d.drawnKey = ''; }; im.onerror = () => { d.img = null; };
      im.src = SCREENS_BASE + encodeURIComponent(id) + '.jpg?t=' + Math.floor(now / 60000);
    }
    return sc;
  }
  function drawDeskIf(d, force) {
    const b = botByName(d.name) || { bot: d.name, bot_id: '', status: 'idle', task: '', last_action: '', last_action_at: '', question: '' };
    const now = Date.now(), lod = L.lodFor(camera.position.distanceTo(tmpV.set(d.x, 1.2, d.z - 0.2)));
    const sc = mirrorFor(d, b, now), image = sc.show === 'image' && d.img;
    const mine = L.sortItems(items().filter(i => i.owner === d.name && L.columnFor(i) !== 'done'));
    const oc = chars.get(d.name), act = oc && oc.idleAct === 'video_game' && oc.goalNow && oc.goalNow.pose === 'game' ? 'game' : (plan.plans[d.name] || {}).act || '', mode = S.state === 'failed' ? L.monitorMode(b, '', {}) : L.monitorMode(b, act, { image: !!image });
    const key = lod + mode + JSON.stringify(b) + S.state + mine.map(i => i.id + i.status).join() + (mode === 'president' ? items().length + JSON.stringify(S.chat || S.chatErr) : '') + (image ? d.imgAt : '') + Math.floor(now / (mode === 'game' && lod !== 'far' ? 120 : 30000));
    if (!force && key === d.drawnKey) return;
    d.drawnKey = key;
    drawDesk(d.scr.ctx, d.scr.c.width, d.scr.c.height, { bot: b, lod, now, items: mine, allItems: items(), demo: DEMO, frozen: S.state === 'failed', mode, image: image || null, screenWhy: sc.why,
      chat: S.chat, chatErr: S.chatErr, usageRows: L.usageRows(S.readings, now, S.parsed ? S.parsed.usage : null), replay: L.replayFor(b, now) });
    d.scr.t.needsUpdate = true;
    const st = L.statusStyle(b.status), col = new THREE.Color(S.state === 'failed' ? '#8b9099' : st.color);
    d.ledMat.color.copy(col); d.ledMat.emissive.copy(col);
    const ask = S.needsSet.has(d.name) && S.state !== 'failed';
    d.shadeMat.color.set(ask ? 0xff3030 : 0xd8dde4);
    d.bulbMat.emissive.set(ask ? 0xff2020 : 0xffe6b8);
  }
  /* ---------- wall dimmer: one level (0.25-1.6, 1 = the original look) scales every scene light and the ceiling / sconce emissives ---------- */
  const dimLights = scene.children.filter(o => o.isLight && !alertLights.includes(o)); dimLights.forEach(l => { l.userData.base = l.intensity; });
  const dimMats = [MAT.panel, MAT.sconce, MAT.ledW].map(m => ({ m, base: m.emissiveIntensity }));
  const loadDim = () => { try { return L.clampDim(localStorage.getItem(L.DIM_KEY)); } catch (e) { return L.DIM_DEFAULT; } };
  let dimTarget = loadDim(), dimCur = dimTarget, dimDrag = false;
  function applyDim() { for (const l of dimLights) l.intensity = L.dimScale(l.userData.base, dimCur); for (const d of dimMats) d.m.emissiveIntensity = L.dimScale(d.base, dimCur); dimKnob.position.y = (L.knobFromDim(dimTarget) - 0.5) * DIM_SLOT; }
  function setDim(v, save) { dimTarget = L.clampDim(v); dimKnob.position.y = (L.knobFromDim(dimTarget) - 0.5) * DIM_SLOT; if (save) { try { localStorage.setItem(L.DIM_KEY, String(+dimTarget.toFixed(3))); } catch (e) { /* private mode */ } } }
  const dimPlane = new THREE.Plane(), dimHit = new THREE.Vector3();
  function dimDragTo(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); dimDragRay(); }
  function dimDragRay() { // `ray` (mouse or VR controller) -> faceplate plane -> knob height along the slot
    dimPlane.setFromNormalAndCoplanarPoint(dimPlate.getWorldDirection(tmpV.set(0, 0, 1)).clone(), dimPlate.position);
    if (!ray.ray.intersectPlane(dimPlane, dimHit)) return;
    setDim(L.dimFromKnob(dimPlate.worldToLocal(dimHit).y / DIM_SLOT + 0.5), false);
  }
  function applyDaylight() {
    const sky = L.skyState(Date.now());
    drawTown(town.ctx, 640, 360, sky); town.t.needsUpdate = true;
    sun.intensity = 1.3 * sky.daylight; windowGlow.intensity = 5 * sky.daylight + 0.6 * sky.stars; windowGlow.color.set(sky.warm > 0.4 ? 0xffc890 : 0xdbe9ff);
    sun.userData.base = sun.intensity; windowGlow.userData.base = windowGlow.intensity; applyDim();
    T.sky = { hour: +sky.hour.toFixed(2), daylight: +sky.daylight.toFixed(2), night: sky.isNight };
  }
  applyDaylight();

  /* ---------- controls: a plain click always picks (no pointer lock, ever); hold + drag looks; WASD walks ---------- */
  const keys = new Set(), vel = new THREE.Vector3();
  let glide = null, hop = TV, hopPos = null, lastInput = performance.now(), tour = null, joy = { x: 0, y: 0 };
  let hoverBot = null, hoverItem = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickables = () => { const a = [project.screen, usage.screen, needs.screen, constraint.screen, autos.screen, writer.screen, pipe.mesh]; desks.forEach(d => a.push(d.g)); chars.forEach(c => a.push(c.root)); return a; };
  function pick(nx, ny) { ndc.set(nx, ny); ray.setFromCamera(ndc, camera); return pickRay(); }
  function pickRay() { // uses the current `ray` (mouse or VR controller)
    const hits = ray.intersectObjects(pickables(), true).filter(h => h.object.visible && !(h.object.layers.mask === 2));
    const hit = hits[0];
    if (!hit || hit.distance > 45) return null;
    const o = hit.object;
    if (o.userData.board) {
      if (o.userData.board === 'needs' && hit.uv) { const y = 1 - hit.uv.y, r = needs.hits.find(r => y >= r.y && y <= r.y + r.h); return r ? { needsIdx: r.i } : { board: 'needs' }; }
      if (o.userData.board !== 'project') return { board: o.userData.board };
      const uv = hit.uv, x = uv.x, y = 1 - uv.y;
      const h = project.hits.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      return h ? (h.id ? { item: h.id } : h.tab ? { tab: h.tab } : h.done ? { done: true } : { more: h.more }) : { board: 'project' };
    }
    if (o.userData.monitor) return { monitor: o.userData.monitor, half: hit.uv && hit.uv.x < 0.5 ? 'left' : 'right' };
    if (o.userData.charName) return { bot: o.userData.charName };
    if (o.userData.deskBot) return { bot: o.userData.deskBot };
    return null;
  }
  function activate(p) {
    if (!p) return false;
    if (p.item) openItem(p.item); else if (p.tab) { boardTab = p.tab; boardDirty = true; } else if (p.done) { doneOpen = !doneOpen; boardDirty = true; }
    else if (p.more != null) openBoard(); else if (p.bot) openBot(p.bot);
    else if (p.monitor) clickScreen(p.monitor, p.half); else if (p.needsIdx != null) openNeedsEntry(p.needsIdx);
    else if (p.board === 'needs') openNeeds(); else if (p.board === 'usage') openUsage(); else if (p.board === 'project') openBoard();
    else if (p.board === 'constraint') window.open(PIPELINE_URL, '_blank', 'noopener');
    else if (p.board === 'autos' || p.board === 'writer') openAutomations(p.board);
    else if (p.board === 'pipeline') { if (pipe.css) setBrowse(true); else window.open(PIPELINE_URL, '_blank', 'noopener'); }
    return true;
  }
  /* item 8: browse mode. The canvas stops catching the mouse so the iframe underneath is a normal, clickable web page. */
  function setBrowse(on) {
    if (!pipe.css || pipe.browsing === on) return; pipe.browsing = on; keys.clear();
    renderer.domElement.style.pointerEvents = on ? 'none' : ''; pipe.css.r.domElement.style.pointerEvents = on ? 'auto' : 'none'; pipe.css.bar.hidden = !on; $('labels').style.display = on ? 'none' : '';
    if (on) { $('start').hidden = true; glideTo([[PX - 3.3, PY - 0.25, PZ], [PX, PY, PZ]], 700); }
  }
  if (pipe.css) { $('browse-exit').onclick = () => setBrowse(false); pipe.css.r.domElement.addEventListener('pointerdown', e => { if (e.target === pipe.css.r.domElement) setBrowse(false); }); }
  function setHover(p) {
    const nb = p && p.bot || null, ni = p && p.item || null;
    if (nb === hoverBot && ni === hoverItem) return;
    hoverBot = nb; hoverItem = ni;
    const owner = ni ? (items().find(i => i.id === ni) || {}).owner : null;
    desks.forEach(d => (d.hover.visible = d.name === nb || d.name === owner));
    boardDirty = true;
    renderer.domElement.style.cursor = p ? 'pointer' : 'grab';
  }
  const canvas = renderer.domElement;
  const look = new THREE.Euler(0, 0, 0, 'YXZ');
  function turn(dx, dy) { look.setFromQuaternion(camera.quaternion); look.y -= dx; look.x = Math.max(-1.4, Math.min(1.4, look.x - dy)); camera.quaternion.setFromEuler(look); }
  let down = null;
  canvas.addEventListener('pointerdown', e => { // dimmer first: a grab on the plate drags the knob and never starts a look-drag
    if (e.pointerType === 'touch' || e.button !== 0 || panelOpen) return;
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObject(dimPlate, true)[0], other = ray.intersectObjects(pickables(), true)[0];
    if (!h || (other && other.distance < h.distance)) return;
    dimDrag = true; down = null; glide = null; tour = null; lastInput = performance.now(); $('start').hidden = true; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    canvas.style.cursor = 'ns-resize'; dimDragTo(e.clientX, e.clientY); e.stopImmediatePropagation();
  });
  addEventListener('pointermove', e => { if (dimDrag) dimDragTo(e.clientX, e.clientY); });
  addEventListener('pointerup', () => { if (!dimDrag) return; dimDrag = false; canvas.style.cursor = ''; setDim(dimTarget, true); });
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: false }; $('start').hidden = true; });
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (down && e.buttons) { // hold-to-look: only while a button is held and dragged
      if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.drag = true;
      if (down.drag) { turn((e.clientX - down.lx) * 0.004, (e.clientY - down.ly) * 0.004); glide = null; tour = null; canvas.style.cursor = 'grabbing'; }
      down.lx = e.clientX; down.ly = e.clientY;
    } else if (e.target === canvas) hoverAt = [e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1];
  });
  addEventListener('pointerup', e => {
    if (e.pointerType === 'touch' || !down) return;
    const wasDrag = down.drag; down = null; canvas.style.cursor = '';
    if (wasDrag || panelOpen || e.target !== canvas) return;
    lastInput = performance.now(); camera.updateMatrixWorld();
    activate(pick(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)); // a plain click opens the panel or link right away
  });
  let hoverAt = null;
  $('start-btn').onclick = () => { $('start').hidden = true; };

  if (touch || touchEvents) {
    const js = $('joystick'), knob = js.querySelector('.knob'); js.hidden = !touch;
    let jid = null; const R = 52;
    const jmove = t => { const r = js.getBoundingClientRect(), dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2), l = Math.min(R, Math.hypot(dx, dy)) / (Math.hypot(dx, dy) || 1);
      joy.x = dx * l / R; joy.y = dy * l / R; knob.style.transform = `translate(${dx * l}px,${dy * l}px)`; };
    js.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; jid = t.identifier; jmove(t); lastInput = performance.now(); glide = null; }, { passive: false });
    js.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === jid) jmove(t); }, { passive: false });
    const jend = e => { for (const t of e.changedTouches) if (t.identifier === jid) { jid = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
    js.addEventListener('touchend', jend); js.addEventListener('touchcancel', jend);
    const looks = new Map();
    canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) looks.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, at: performance.now() }); lastInput = performance.now(); glide = null; }, { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) { const l = looks.get(t.identifier); if (!l) continue; turn((t.clientX - l.x) * 0.005, (t.clientY - l.y) * 0.005); l.x = t.clientX; l.y = t.clientY; } }, { passive: false });
    canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) { const l = looks.get(t.identifier); looks.delete(t.identifier);
      if (l && performance.now() - l.at < 350 && Math.hypot(t.clientX - l.sx, t.clientY - l.sy) < 10) activate(pick(t.clientX / innerWidth * 2 - 1, -(t.clientY / innerHeight) * 2 + 1)); } });
  }

  // keyboard: desktop WASD/arrows; TV hop / free walk
  let targets = [], rows = [];
  function buildTargets() {
    targets = [
      { kind: 'board', id: 'needs', x: -12, view: [[-8.4, 1.9, 1.4], [-12, 1.9, 1.4]] },
      { kind: 'board', id: 'project', x: -2, view: [[-2, 2.2, -4.6], [-2, 2.3, -10]] },
      { kind: 'board', id: 'usage', x: 5.7, view: [[5.7, 2.1, -6.4], [5.7, 2.2, -10]] }
    ].concat(desks.map(d => ({ kind: 'desk', id: d.name, bot: d.name, x: d.x, z: d.z, view: [[d.x + 0.3, 1.85, d.z + 2.0], [d.x, 1.05, d.z - 0.25]] })));
    rows = L.hopRows(targets); if (hopPos && (!rows[hopPos.row] || !rows[hopPos.row][hopPos.col])) hopPos = null;
  }
  buildTargets();
  function glideTo(view, ms) {
    const [p, l] = view, m = new THREE.Matrix4().lookAt(new THREE.Vector3(...p), new THREE.Vector3(...l), new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const dur = reducedMQ.matches ? 1 : ms;
    glide = { t0: performance.now(), dur, p0: camera.position.clone(), q0: camera.quaternion.clone(), p1: new THREE.Vector3(...p), q1: q };
  }
  function focusTarget(t) {
    desks.forEach(d => (d.focus.visible = t && t.kind === 'desk' && d.name === t.bot));
    const nm = $('focusname');
    if (t) { nm.hidden = false; nm.textContent = t.kind === 'desk' ? t.bot + ' · ' + L.statusStyle((botByName(t.bot) || {}).status).word : { needs: 'Needs Tim board', project: 'Forge checksheet', usage: 'AI usage wall', constraint: 'Pipeline constraint wall' }[t.id]; }
    else nm.hidden = true;
    setHover(t ? (t.kind === 'desk' ? { bot: t.bot } : null) : null);
  }
  function hopTo(pos) { if (!pos || !rows[pos.row]) return; hopPos = pos; const t = rows[pos.row][pos.col]; focusTarget(t); glideTo(t.view, L.GLIDE_MS); }
  function currentTarget() { return hopPos ? rows[hopPos.row][hopPos.col] : null; }
  function openTarget(t) { if (!t) return; if (t.kind === 'desk') openBot(t.bot); else activate({ board: t.id }); }
  function goToBot(name, open) {
    const r = rows.findIndex(r => r.some(t => t.bot === name)); if (r < 0) return;
    hopTo({ row: r, col: rows[r].findIndex(t => t.bot === name) }); if (open) setTimeout(() => openBot(name), L.GLIDE_MS + 50);
  }
  function overlayNav(dir) {
    const f = [...$('panel').querySelectorAll('a,button,textarea')]; if (!f.length) return;
    const i = f.indexOf(document.activeElement); const n = f[(i + dir + f.length) % f.length]; n.focus();
  }
  addEventListener('keydown', e => {
    lastInput = performance.now();
    if (pipe.browsing) { if (e.key === 'Escape') { e.preventDefault(); setBrowse(false); } return; }
    if (tour) { tour = null; e.preventDefault(); return; }
    if (panelOpen) {
      const typing = !TV && document.activeElement && document.activeElement.tagName === 'TEXTAREA';
      if (e.key === 'Escape' || (e.key === 'Backspace' && !typing)) { e.preventDefault(); closePanel(); }
      else if (TV && !typing && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) { e.preventDefault(); overlayNav(1); }
      else if (TV && !typing && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) { e.preventDefault(); overlayNav(-1); }
      return;
    }
    if ((e.key === '[' || e.key === ']') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setDim(L.dimStep(dimTarget, e.key === ']' ? 1 : -1), true); return; }
    if (TV) {
      const a = L.tvKeyAction(e.key, hop); if (!a) return; e.preventDefault();
      if (a === 'toggle_hop') { hop = !hop; showHint(); if (hop) hopTo(hopPos || { row: 0, col: 1 }); else { focusTarget(null); } return; }
      if (a === 'open') return hop ? openTarget(currentTarget()) : activate(pick(0, 0));
      if (a === 'back') return;
      if (['next', 'prev', 'up', 'down'].includes(a)) return hopTo(L.hopMove(rows, hopPos || { row: 0, col: 1 }, a));
      keys.add(a); return;
    }
    if (e.key === 'Enter' && document.activeElement === document.body) { $('needs-btn').click(); return; }
    if (e.code === 'Space' && !e.repeat) jumpReq = true;
    keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => { keys.delete(e.code); if (TV) { const a = L.tvKeyAction(e.key, false); if (a) keys.delete(a); } });
  addEventListener('blur', () => keys.clear());

  function collide(p) {
    const r = 0.3;
    p.x = Math.max(-RW / 2 + WALL, Math.min(RW / 2 - WALL, p.x)); p.z = Math.max(-RD / 2 + WALL, Math.min(RD / 2 - WALL, p.z));
    for (const o of obstacles) {
      const cx = Math.max(o.x0, Math.min(o.x1, p.x)), cz = Math.max(o.z0, Math.min(o.z1, p.z)), dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-4) { p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
        else { const pen = [[p.x - o.x0, -1, 0], [o.x1 - p.x, 1, 0], [p.z - o.z0, 0, -1], [o.z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0]; p.x += pen[1] * (pen[0] + r); p.z += pen[2] * (pen[0] + r); }
      }
    }
  }
  let jumpReq = false, jumpState = { y: 0, vy: 0, air: false };
  function doJump(dt, settle) {
    const want = jumpReq && !TV; jumpReq = false;
    if (!jumpState.air && !want && !settle) return;
    if (want) { glide = null; tour = null; }
    jumpState = L.jumpStep({ y: camera.position.y, vy: jumpState.vy, air: jumpState.air }, dt, want, L.EYE_HEIGHT);
    camera.position.y = jumpState.y;
  }
  function move(dt) {
    doJump(dt, false);
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let f = 0, s = 0;
    if (TV) { if (keys.has('forward')) f += 1; if (keys.has('backward')) f -= 1; if (keys.has('turn_left')) turn(-1.8 * dt, 0); if (keys.has('turn_right')) turn(1.8 * dt, 0); }
    else {
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD')) s += 1; if (keys.has('KeyA')) s -= 1;
      if (keys.has('ArrowLeft')) turn(-1.6 * dt, 0); if (keys.has('ArrowRight')) turn(1.6 * dt, 0);
      f -= joy.y; s += joy.x;
    }
    const target = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    if (target.lengthSq() > 1) target.normalize();
    target.multiplyScalar(keys.has('ShiftLeft') ? 5 : 3);
    vel.lerp(target, Math.min(1, dt * 10));
    if (vel.lengthSq() < 1e-5) return;
    glide = null; tour = null;
    const p = camera.position.clone().addScaledVector(vel, dt); collide(p); camera.position.x = p.x; camera.position.z = p.z;
    if (!jumpState.air) doJump(dt, true); // walking settles back to eye height after a desk hop
  }
  function showHint() {
    const h = $('hint'); h.hidden = false;
    h.textContent = TV ? (hop ? '◀ ▶ desks and boards · ▲ ▼ rows · OK opens · Back closes · H free walk' : '▲ ▼ walk · ◀ ▶ turn · OK opens · H hop mode')
      : touch ? 'Joystick to walk · drag to look · tap a bot, screen or card' : 'Click a bot, screen or card · hold and drag to look · WASD to walk · Space to jump';
  }
  showHint();
  if (TV) setTimeout(() => hopTo({ row: 0, col: 1 }), 300);

  /* ---------- loop ---------- */
  let last = performance.now(), clock = 0, hoverTick = 0, deskTick = 0, dayTick = 0, lastFrame = 0;
  const minFrame = LOW ? 1000 / 31 : 0;
  let rafQueued = false;
  const nextFrame = () => { if (rafQueued || renderer.xr.isPresenting) return; rafQueued = true; requestAnimationFrame(t => { rafQueued = false; if (!renderer.xr.isPresenting) frame(t); }); };
  function frame(now) {
    const XR = renderer.xr.isPresenting, Q = L.qualityFor(XR); // XR: the headset drives the loop (setAnimationLoop); desktop keeps requestAnimationFrame
    if (!XR) nextFrame();
    if (!XR && minFrame && now - lastFrame < minFrame) return;
    lastFrame = now;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now; // rAF time can precede the setup time: never negative
    clock += dt; // (v2 bug: this sat inside the comment above, so every animation clock stood still)
    if (XR) { glide = null; tour = null; vrFrame(dt, now); }
    if (glide) {
      const k = Math.min(1, (now - glide.t0) / glide.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(glide.p0, glide.p1, e); camera.quaternion.slerpQuaternions(glide.q0, glide.q1, e);
      if (k >= 1) glide = null;
    }
    if (!XR && !panelOpen && !pipe.browsing) move(dt);
    if (TV && !panelOpen && !tour && now - lastInput > L.TOUR_IDLE_MS) tour = { list: L.tourOrder(targets, bots()), i: -1, until: 0 };
    if (tour && now > tour.until && tour.list.length) {
      tour.i = (tour.i + 1) % tour.list.length; const s = tour.list[tour.i];
      const r = rows.findIndex(r => r.includes(s.target)); hopPos = { row: r, col: rows[r].indexOf(s.target) };
      focusTarget(s.target); glideTo(s.target.view, 1600); tour.until = now + s.dwellMs;
    }
    if (now - hoverTick > Q.hoverMs) { hoverTick = now; if (!XR && (!TV || !hop)) { const p = hoverAt && !down ? pick(...hoverAt) : null; if (!TV || p) setHover(p); } }
    // free-running page tick: each board column takes tick mod its own page count (L.columnPage)
    if (pagesN > 1 && clock - pageAt > 12) { page = (page + 1) % 1e9; pageAt = clock; boardDirty = true; }
    if (boardDirty) drawBoards();
    if (now - deskTick > Q.deskDrawMs) { deskTick = now; desks.forEach(d => drawDeskIf(d)); }
    if (now - dayTick > 60000) { dayTick = now; applyDaylight(); }
    if (dimCur !== dimTarget) { dimCur = L.dimSmooth(dimCur, dimTarget, dt); applyDim(); }
    wf.t.offset.y = L.waterfallOffset(wf.t.offset.y, dt, reducedMQ.matches); // waterfall: one scrolling texture, flowing DOWN (item 2)
    let ai = 0; const p = L.pulse(clock, reducedMQ.matches);
    for (const d of desks) { const b = botByName(d.name); if (b && S.needsSet.has(d.name) && S.state !== 'failed') { d.bulbMat.emissiveIntensity = 0.6 + 1.6 * p; if (ai < alertLights.length && ai < Q.maxAlertLights) { const l = alertLights[ai++]; l.position.set(d.x + 0.63, 1.3, d.z - 0.1); l.intensity = 2.5 * p + 0.6; } } else d.bulbMat.emissiveIntensity = 1.5; }
    for (; ai < alertLights.length; ai++) alertLights[ai].intensity = 0;
    updatePlan();
    walkingNow = [...chars.values()].filter(c => c.path.length).length;
    // item 13: the cue ball is hit and rolls while someone is playing; item 10: simulated drinks get used up slowly
    poolNow = L.poolShot(clock); const playing = [...chars.values()].some(c => c.pose === 'pool' && c.arrived), pb = playing ? poolNow.ball : L.POOL.start; cueBall.position.set(pb.x, 0.865, pb.z);
    fridgeDrain += dt; if (fridgeDrain > 150) { fridgeDrain = 0; const n = L.fridgeTake(fridgeStock); if (n !== fridgeStock) { fridgeStock = n; layoutCans(lastDeskCans); } }
    fridgeRefill += dt; if (fridgeRefill > L.FRIDGE_REFILL_S) { fridgeRefill = 0; const n = L.fridgeAutoRefill(fridgeStock, !!S.restocker); if (n !== fridgeStock) { fridgeStock = n; layoutCans(lastDeskCans); } } // no idle bot to restock: it refills itself, never empty
    for (const c of chars.values()) updateChar(c, dt);
    separateChars();
    if (Q.labels) updateLabels();
    renderer.render(scene, camera);
    if (pipe.css && Q.css3d) { // CSS3D layer: same camera, scaled by PK (CSS units are pixels); hidden when the wall is behind the camera
      const c = pipe.css, fwd = tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion), toB = new THREE.Vector3(PX - camera.position.x, PY - camera.position.y, PZ - camera.position.z), show = toB.dot(fwd) > 0.1 && toB.length() < 40;
      c.r.domElement.style.visibility = show || pipe.browsing ? '' : 'hidden';
      if (show || pipe.browsing) { if (c.cssCam.fov !== camera.fov || c.cssCam.aspect !== camera.aspect) { c.cssCam.fov = camera.fov; c.cssCam.aspect = camera.aspect; c.cssCam.updateProjectionMatrix(); }
        c.cssCam.position.copy(camera.position).multiplyScalar(PK); c.cssCam.quaternion.copy(camera.quaternion); c.r.render(c.cssScene, c.cssCam); }
    }
    T.frames++;
  }
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; fitFov(); renderer.setPixelRatio(fitRatio()); renderer.setSize(innerWidth, innerHeight); if (pipe.css) pipe.css.r.setSize(innerWidth, innerHeight); });
  reducedMQ.addEventListener && reducedMQ.addEventListener('change', () => { boardDirty = true; });
  nextFrame();

  /* ---------- WebXR (Meta Quest browser): enter VR, controller rays, teleport, dimmer drag, VR-only performance trims ---------- */
  const rig = new THREE.Group(); rig.name = 'xr-rig'; // dolly: the headset moves the camera inside it, teleport moves the rig
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.85, depthTest: false })); marker.visible = false; marker.renderOrder = 10; scene.add(marker);
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorHit = new THREE.Vector3(), tmpHead = new THREE.Vector3(), tmpO = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpM = new THREE.Matrix4();
  const pads = [0, 1].map(i => {
    const c = renderer.xr.getController(i), line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff }));
    line.scale.z = 4; c.add(line); rig.add(c);
    const st = { c, line, dim: false, floor: null, p: null };
    c.addEventListener('selectstart', () => { // trigger down: the dimmer plate grabs the knob, anything else waits for the release
      if (!xrNow) return; aim(st); const h = ray.intersectObject(dimPlate, true)[0], o = ray.intersectObjects(pickables(), true)[0];
      if (h && !(o && o.distance < h.distance)) { st.dim = true; dimDrag = true; dimDragRay(); }
    });
    c.addEventListener('selectend', () => { // trigger release: finish a dimmer drag, else click what the ray points at, else teleport to the floor point
      if (!xrNow) return;
      if (st.dim) { st.dim = false; dimDrag = false; setDim(dimTarget, true); return; }
      aim(st); const p = pickRay();
      if (p) { activate(p); return; }
      if (st.floor) teleportTo(st.floor);
    });
    return st;
  });
  let xrNow = false;
  function aim(st) { st.c.updateMatrixWorld(true); tmpM.identity().extractRotation(st.c.matrixWorld); tmpO.setFromMatrixPosition(st.c.matrixWorld); tmpD.set(0, 0, -1).applyMatrix4(tmpM).normalize(); ray.set(tmpO, tmpD); ray.layers.mask = camera.layers.mask; }
  function teleportTo(pt) {
    const t = L.teleportTarget({ x: pt.x, z: pt.z }, { w: RW, d: RD, wall: WALL }, { x: camera.getWorldPosition(tmpHead).x, z: tmpHead.z }); if (!t) return;
    const q = { x: t.x, y: 0, z: t.z }; collide(q); // same furniture / wall clearance as walking
    camera.getWorldPosition(tmpHead); const r = L.teleportRigPos(q, { x: tmpHead.x - rig.position.x, z: tmpHead.z - rig.position.z });
    rig.position.x = r.x; rig.position.z = r.z; rig.position.y = 0; // y stays 0: local-floor puts the head at real standing height
  }
  let snapArmed = true; const tmpDir = new THREE.Vector3();
  function vrSticks(dt) { // thumbsticks: left = smooth head-relative walk on the floor, right = 30 degree snap turn
    const s = renderer.xr.getSession(); if (!s) return;
    for (const src of s.inputSources) {
      if (!src.gamepad) continue;
      const st = L.stickAxes(src.gamepad);
      if (src.handedness === 'right') {
        if (Math.abs(st.x) < L.VR_SNAP_OFF) snapArmed = true;
        else if (snapArmed && Math.abs(st.x) > L.VR_SNAP_ON) { // turn the rig about the head so the player stays in place
          snapArmed = false; const a = -Math.sign(st.x) * L.VR_SNAP_DEG * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
          camera.getWorldPosition(tmpHead); const ox = rig.position.x - tmpHead.x, oz = rig.position.z - tmpHead.z;
          rig.position.x = tmpHead.x + ox * c + oz * sn; rig.position.z = tmpHead.z - ox * sn + oz * c; rig.rotation.y += a;
        }
      } else {
        camera.getWorldDirection(tmpDir); const m = L.stickMove(st, Math.atan2(-tmpDir.x, -tmpDir.z), dt);
        if (!m.x && !m.z) continue;
        camera.getWorldPosition(tmpHead); const q = { x: tmpHead.x + m.x, z: tmpHead.z + m.z }; collide(q); // same furniture / wall clearance as walking
        rig.position.x += q.x - tmpHead.x; rig.position.z += q.z - tmpHead.z; // height untouched: local-floor keeps the real head height
      }
    }
  }
  function vrFrame(dt) { // per-frame controller work while presenting
    vrSticks(dt); marker.visible = false;
    for (const st of pads) {
      if (!st.c.visible) { st.line.visible = false; continue; }
      st.line.visible = true; aim(st); st.floor = null; let len = 4;
      if (st.dim) { dimDragRay(); }
      else {
        const hit = ray.intersectObjects(pickables(), true).filter(h => h.object.visible && h.object.layers.mask !== 2)[0], dh = ray.intersectObject(dimPlate, true)[0];
        const near = Math.min(hit ? hit.distance : Infinity, dh ? dh.distance : Infinity);
        if (Number.isFinite(near)) { len = Math.min(len, near); st.line.material.color.set(0x7dff9b); }
        else if (ray.ray.intersectPlane(floorPlane, floorHit) && floorHit.distanceTo(ray.ray.origin) < 25) {
          const t = L.teleportTarget({ x: floorHit.x, z: floorHit.z }, { w: RW, d: RD, wall: WALL }, null);
          if (t) { st.floor = { x: floorHit.x, z: floorHit.z }; marker.position.set(t.x, 0.02, t.z); marker.visible = true; len = Math.min(len, floorHit.distanceTo(ray.ray.origin)); st.line.material.color.set(0x4cc9f0); }
        } else st.line.material.color.set(0xffffff);
      }
      st.line.scale.z = len;
    }
  }
  const vrBtn = $('vr-btn'); let xrSession = null, saved = null;
  function applyDesktopQuality() { const q = L.qualityFor(false); renderer.shadowMap.enabled = q.shadows; renderer.xr.setFramebufferScaleFactor(q.framebufferScale); renderer.xr.setFoveation(q.foveation); renderer.setPixelRatio(fitRatio()); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x0e1013, 0); }
  renderer.xr.addEventListener('sessionstart', () => {
    xrNow = true; const q = L.qualityFor(true), s = renderer.xr.getSession(); xrSession = s;
    saved = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
    const yaw = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y; // start where the desktop camera stood, facing the same way
    rig.position.set(camera.position.x, 0, camera.position.z); rig.rotation.set(0, yaw, 0); scene.add(rig); rig.add(camera); camera.position.set(0, 0, 0); camera.quaternion.identity();
    renderer.shadowMap.enabled = q.shadows; renderer.xr.setFoveation(q.foveation); renderer.setClearColor(0x0e1013, 1);
    try { if (s.updateTargetFrameRate) s.updateTargetFrameRate(L.pickFrameRate(s.supportedFrameRates, q.targetFps)); } catch (e) { /* optional API */ }
    $('start').hidden = true; $('hint').hidden = true; $('labels').style.display = 'none'; keys.clear(); down = null; dimDrag = false;
    renderer.setAnimationLoop(frame); if (vrBtn) vrBtn.textContent = '🥽 Exit VR'; T.vr = true;
  });
  renderer.xr.addEventListener('sessionend', () => {
    xrNow = false; xrSession = null; renderer.setAnimationLoop(null);
    const keepX = camera.getWorldPosition(tmpHead).x, keepZ = tmpHead.z; rig.remove(camera); scene.remove(rig);
    camera.position.set(keepX, (saved && saved.pos.y) || L.EYE_HEIGHT, keepZ); if (saved) camera.quaternion.copy(saved.quat);
    marker.visible = false; pads.forEach(st => { st.dim = false; }); dimDrag = false; applyDesktopQuality(); camera.aspect = innerWidth / innerHeight; fitFov();
    $('labels').style.display = ''; showHint(); last = performance.now(); nextFrame(); if (vrBtn) vrBtn.textContent = '🥽 Enter VR'; T.vr = false;
  });
  if (vrBtn) { vrBtn.hidden = false; vrBtn.disabled = true; vrBtn.style.cssText = 'opacity:0.5;cursor:not-allowed'; vrBtn.textContent = '🥽 Open on Quest for VR'; vrBtn.title = 'VR needs a WebXR browser such as the Meta Quest browser'; } /* desktop: greyed-out hint, replaced below when VR is supported */
  if (vrBtn && navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => {
      if (!ok) return; vrBtn.hidden = false; vrBtn.disabled = false; vrBtn.style.cssText = ''; vrBtn.title = 'Enter VR (Meta Quest browser): point and pull the trigger to teleport or click';
      vrBtn.textContent = '🥽 Enter VR';
      vrBtn.onclick = async () => {
        if (xrSession) { xrSession.end(); return; }
        try { const q = L.qualityFor(true); renderer.xr.setFramebufferScaleFactor(q.framebufferScale); renderer.xr.setSession(await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] })); }
        catch (e) { applyDesktopQuality(); toast('Could not start VR: ' + (e && e.message || e)); }
      };
    }).catch(() => {});
  }

  return {
    goToBot, dirty: () => { boardDirty = true; },
    activity: name => (plan.plans[name] || {}).act || '',
    screenPoint(name, dx = 0, dy = 0) { const d = deskOf(name); if (!d) return null; camera.updateMatrixWorld(); const v = d.mon.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(dx, dy, 0)).project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; },
    botPoint(name) { const c = chars.get(name); if (!c) return null; camera.updateMatrixWorld(); const v = c.root.position.clone().setY(c.top * 0.55 + c.rig.position.y).project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; },
    dimLevel: () => ({ target: dimTarget, shown: dimCur }), setDim: v => setDim(v, true),
    dimKnobPoint() { camera.updateMatrixWorld(); const v = dimKnob.getWorldPosition(new THREE.Vector3()).project(camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; },
    view(p, l) { tour = null; glideTo([p, l], 1); },
    spotlight(name, x, z) { const c = chars.get(name); if (c) c.spot = x == null || Number.isNaN(x) ? null : { x, z, face: Math.atan2(camera.position.x - x, camera.position.z - z) }; },
    pickAt(x, y) { camera.updateMatrixWorld(); return pick(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); },
    refresh() { syncDesks(); ensureChars(); updateConvos(); boardDirty = true; desks.forEach(d => drawDeskIf(d, true)); },
    layout: () => ({ RW, RD, CELL: 0.2, inflate: 0.22, obstacles: obstacles.map(o => ({ x0: +o.x0.toFixed(3), x1: +o.x1.toFixed(3), z0: +o.z0.toFixed(3), z1: +o.z1.toFixed(3), viewerOnly: !!o.viewerOnly, tag: o.tag || '' })),
  desks: desks.map(d => ({ name: d.name, seat: d.seat, stand: d.stand, visit: d.visit })),
  slots: SLOTS.concat(BOARD_SLOTS).map(s => ({ id: s.id, kind: s.kind, x: +s.x.toFixed(3), z: +s.z.toFixed(3), face: s.face })), trainer: TRAINER_SPOT }),
    info: () => ({ camY: +camera.position.y.toFixed(3), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, chars: chars.size, desks: desks.length, deskNames: desks.map(d => d.name),
      poses: [...chars.values()].map(c => c.name + ':' + c.pose), goals: [...chars.values()].map(c => c.name + ':' + c.goalKey + ':' + c.path.length), plan: plan.plans, meeting: plan.meeting && plan.meeting.id, training: !!plan.training,
      lights: scene.children.filter(o => o.isLight).length, walking: walkingNow, positions: [...chars.values()].map(c => [c.name, +c.pos.x.toFixed(2), +c.pos.y.toFixed(2), c.pose, +(c.radius || 0.3).toFixed(2)]), slots: [...chars.keys()].map(n => book.slotOf(n)).filter(Boolean),
      generic: [...chars.values()].filter(c => c.generic).map(c => c.name), idle: [...chars.values()].map(c => c.name + ':' + (c.idleAct || '')), fridge: fridgeStock, restocker: S.restocker, needs: [...S.needsSet],
      jobs: [...chars.values()].filter(c => c.job).map(c => c.name + ':' + c.job.phase), pipeline: { live: pipe.live, embed: !!pipe.css, browsing: pipe.browsing }, conf: CONF })
  };
}

/* ============================== start ============================== */
const phone = L.isPhoneLike({ coarse, width: innerWidth });
const view = Q.get('view');
document.fonts && document.fonts.load("700 20px 'Inter PE'").catch(() => {});
(document.fonts ? document.fonts.ready : Promise.resolve()).then(async () => {
  if (TV || view === '3d' || (!phone && view !== 'flat')) enter3D();
  else { $('flat').hidden = false; T.mode = 'flat'; }
  await poll();
  T.ready = true;
  if (DEMO) setTimeout(poll, 6000); // second demo poll: a new card and a reassignment -> board pickup walks
  setInterval(poll, POLL_MS);
  setInterval(refreshAll, 30000);
});
addEventListener('error', e => T.errors.push(String(e.message)));
T.info = () => (world ? world.info() : null);
T.layout = () => (world ? world.layout() : null); // test hook: tools/office-collision-check.cjs dump saves this for the walk tests
T.poll = () => poll(); // test hook: poll now (demo: next example step; the example meeting toggles each poll)
T.screenPoint = (n, dx, dy) => (world ? world.screenPoint(n, dx, dy) : null);
T.dimLevel = () => (world ? world.dimLevel() : null); T.setDim = v => world && world.setDim(v); T.dimKnobPoint = () => (world ? world.dimKnobPoint() : null); // tests / screenshots
T.view = (p, l) => world && world.view(p, l);
T.pickAt = (x, y) => (world ? world.pickAt(x, y) : null);
T.botPoint = n => (world ? world.botPoint(n) : null);
T.spotlight = (n, x, z) => world && world.spotlight(n, x, z); // screenshots only
T.openBot = n => openBot(n); T.openBoard = () => openBoard(); T.openAutomations = () => openAutomations(); // screenshots / tests
