/* 3D office viewer (read-only). Data: control/OFFICE_STATUS.json, open PRs and asks/open from public GitHub repos,
   polled every 60 s straight from the browser (all three repos are public; no proxy, no token, no new secret).
   ?demo=1 example data · ?tv=1 10-foot UI · ?view=3d|flat. Three.js r170 is vendored in office/vendor/three. */
import * as THREE from 'three';
import { PointerLockControls } from './vendor/three/addons/PointerLockControls.js';
import { makeBot, animate } from './chars.js';
import { drawDesk, drawBoard, drawUsage, drawNeeds, drawSign } from './draw.js';
import { avatarFor, shortTag } from './avatars.js';
const TAG_MAX_PX = 240; // full bot name unless the label would be wider than this (or 30% of the screen)

const L = window.OfficeLogic;
const Q = new URLSearchParams(location.search);
const DEMO = Q.get('demo') === '1', TV = Q.get('tv') === '1';
const OWNER = 'tpruittguitar';
const STATUS_URL = `https://raw.githubusercontent.com/${OWNER}/forge-coordination/main/control/OFFICE_STATUS.json`;
const PR_REPOS = ['foreman-cockpit', 'forge-coordination', 'forge-policy'];
const ASKS_URL = `https://api.github.com/repos/${OWNER}/forge-coordination/contents/asks/open`;
const POLL_MS = 60000;
const coarse = matchMedia('(pointer: coarse)').matches;
const touch = coarse; // touch UI (joystick, drag-look); mouse/keyboard stay on desktops
const touchEvents = 'ontouchstart' in window;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const LOW = L.isPhoneLike({ coarse, width: innerWidth }) && !TV; // lower quality on phones
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEATS = ['Claude', 'Software', 'Comp', 'GUI', 'ChatGPT', 'Sniffer', 'QA bot', 'Archive · Application State Tracker', 'Root', 'President', 'Usage Budget', 'HR - Bot Trainer'];
const DESK_X = [-7, -3.8, -0.6, 2.6], DESK_Z = [-4, -0.6, 2.8];

const T = window.__office = { mode: 'loading', frames: 0, webgl: null, ready: false, errors: [], state: '', lastPoll: 0 };
if (TV) document.documentElement.classList.add('tv');

/* ============================== data ============================== */
const S = {
  raw: null, parsed: null, fetchOk: false, everOk: false, state: 'failed', error: '',
  prevItems: null, pulls: [], pullsErr: '', asks: [], asksErr: '', checkCache: new Map(),
  glow: new Set(), demoStep: 0
};
async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache', headers: url.includes('api.github.com') ? { Accept: 'application/vnd.github+json' } : {} });
  if (!r.ok) { const e = new Error(r.status === 403 || r.status === 429 ? 'GitHub rate limit reached' : 'HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
async function loadPulls() {
  const out = [];
  for (const repo of PR_REPOS) {
    const list = await getJSON(`https://api.github.com/repos/${OWNER}/${repo}/pulls?state=open&per_page=30`);
    for (const p of list) {
      const sha = p.head && p.head.sha;
      let checks = S.checkCache.get(sha);
      if (!checks) {
        try { const cr = await getJSON(`https://api.github.com/repos/${OWNER}/${repo}/commits/${sha}/check-runs?per_page=50`); checks = L.checkState(cr.check_runs); }
        catch (e) { checks = 'unknown'; }
        if (checks === 'passing' || checks === 'failing') S.checkCache.set(sha, checks);
      }
      out.push(L.summarizePull(repo, p, checks));
    }
  }
  return out;
}
async function poll() {
  const now = Date.now();
  if (DEMO) {
    S.raw = S.demoStep === 0 ? L.demoStatus(now) : L.demoNextStatus(S.raw, now);
    S.demoStep++; S.fetchOk = true; S.pulls = L.DEMO_PULLS; S.asks = ['EXAMPLE-ASK-1.json', 'EXAMPLE-ASK-2.json']; S.pullsErr = S.asksErr = '';
  } else {
    try { S.raw = await getJSON(STATUS_URL + '?t=' + Math.floor(now / POLL_MS)); S.fetchOk = true; S.error = ''; }
    catch (e) { S.fetchOk = false; S.error = e.status === 404 ? 'control/OFFICE_STATUS.json not found on forge-coordination main' : 'OFFICE_STATUS.json could not be loaded (' + e.message + ')'; }
    loadPulls().then(p => { S.pulls = p; S.pullsErr = ''; }, e => { S.pullsErr = e.message; }).then(refreshAll);
    getJSON(ASKS_URL).then(a => { S.asks = a.filter(f => f.type === 'file' && /\.json$/i.test(f.name)).map(f => f.name); S.asksErr = ''; },
      e => { S.asksErr = e.status === 404 ? 'asks/open not found' : e.message; }).then(refreshAll);
  }
  const parsed = S.raw ? L.parseStatus(S.raw) : null;
  if (S.fetchOk && parsed && parsed.ok) {
    if (S.parsed) for (const p of L.diffItems(S.parsed.items, parsed.items)) queuePickup(p);
    S.parsed = parsed; S.everOk = true;
  } else if (S.fetchOk && parsed && !parsed.ok) { S.fetchOk = false; S.error = parsed.error; }
  T.lastPoll = Date.now();
  refreshAll();
}
function queuePickup(p) { const c = chars.get(p.bot); if (c && !c.pickups.includes(p.itemId)) c.pickups.push(p.itemId); else if (!c) pendingPickups.push(p); }
const pendingPickups = [];
function bots() { return S.parsed ? S.parsed.bots : []; }
function items() { return S.parsed ? S.parsed.items : []; }
function botByName(n) { return bots().find(b => b.bot === n); }
function alertBots() { return bots().filter(b => L.statusStyle(b.status).alert); }
function needsEntries() {
  const e = [];
  for (const b of alertBots()) e.push({ glyph: '⚠', tone: 'alert', text: b.bot + ': ' + (b.question || b.task || L.statusStyle(b.status).word), bot: b.bot });
  for (const n of S.parsed ? S.parsed.needsTim : []) e.push({ glyph: '⚠', tone: 'alert', text: n.text, link: n.link });
  for (const p of S.pulls.filter(p => p.readyForTim)) e.push({ glyph: '◆', tone: 'info', text: p.repo + (p.number ? ' #' + p.number : '') + ' ready: ' + p.title, link: p.url });
  if (S.asks.length) e.push({ glyph: '?', tone: 'stale', text: S.asks.length + ' open asks in forge-coordination', link: `https://github.com/${OWNER}/forge-coordination/tree/main/asks/open` });
  if (S.pullsErr) e.push({ glyph: '?', tone: 'stale', text: 'Open PRs: data source unavailable (' + S.pullsErr + ')' });
  if (S.asksErr) e.push({ glyph: '?', tone: 'stale', text: 'Open asks: data source unavailable (' + S.asksErr + ')' });
  return e;
}
function needsCount() { return alertBots().length + (S.parsed ? S.parsed.needsTim.length : 0); }

function refreshAll() {
  const now = Date.now();
  S.state = L.dataState(S.parsed, S.fetchOk, now);
  T.state = S.state;
  const asof = $('asof');
  asof.className = 'asof ' + S.state;
  asof.textContent = S.state === 'failed' ? (S.everOk ? '⚠ Data feed down · last data ' + L.hhmm(S.parsed.updatedAt) : '⚠ No office data')
    : (S.state === 'stale' ? '? ' : '') + 'Data as of ' + L.hhmm(S.parsed.updatedAt) + (S.state === 'stale' ? ' (stale)' : '');
  $('demo-badge').hidden = !DEMO;
  const banner = $('banner');
  if (S.state === 'failed') { banner.hidden = false; banner.textContent = '⚠ Office data unavailable: ' + (S.error || 'no data') + '. Bots are greyed out where they stand.'; }
  else banner.hidden = true;
  const n = needsCount(); $('needs-n').textContent = n; $('needs-btn').classList.toggle('zero', !n);
  renderFlat();
  if (world) world.refresh();
}

/* ============================== flat view (phones) ============================== */
function stWord(b) { const st = L.statusStyle(b.status); return `<span class="st ${st.alert ? 'alert' : st.status}">${st.glyph} ${st.word}</span>`; }
function renderFlat() {
  if ($('flat').hidden) return;
  const now = Date.now(), h = [];
  const ne = needsEntries();
  h.push(`<section class="needs"><h2>⚠ Needs Tim (${needsCount()})</h2>`);
  if (!ne.length) h.push('<div class="row">✓ Nothing waiting on Tim</div>');
  for (const e of ne) {
    const inner = `<span class="glyph st ${e.tone}">${e.glyph}</span><span>${esc(e.text)}</span>`;
    if (e.bot) h.push(`<div class="row"><button class="rowbtn" data-bot="${esc(e.bot)}">${inner}</button></div>`);
    else h.push(`<div class="row">${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${inner}</a>` : inner}</div>`);
  }
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
  for (const b of bots()) h.push(`<div class="row"><button class="rowbtn" data-bot="${esc(b.bot)}"><span>${esc(b.bot)} ${stWord(b)}<div class="meta">${esc(b.task || '—')}</div><div class="meta">${esc(b.last_action)} · ${L.relTime(b.last_action_at, now)}</div></span></button></div>`);
  if (!bots().length) h.push('<div class="row">No bot data</div>');
  h.push('</section><section><h2>AI usage</h2>');
  const u = S.parsed ? S.parsed.usage : { services: [] };
  for (const s of u.services) { const w = L.usageWord(s.pct_used);
    h.push(`<div class="row"><span><b>${esc(s.name)}</b> <span class="st ${w.tone}">${w.glyph} ${w.word}</span><div class="usage-n st ${w.tone}">${s.pct_used == null ? '—' : Math.round(s.pct_used) + '% used'}</div><div class="meta">${s.pct_left == null ? '' : Math.round(s.pct_left) + '% left · '}${s.resets_at ? 'resets ' + esc(new Date(s.resets_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : esc(s.note)}</div></span></div>`); }
  h.push(`<div class="meta">Usage data as of ${u.as_of ? L.hhmm(u.as_of) : '--:--'}${L.usageStale(u, now) ? ' (stale)' : ''}</div></section>`);
  $('flat-body').innerHTML = h.join('');
}
$('flat-body').addEventListener('click', e => {
  const b = e.target.closest('[data-bot]'), it = e.target.closest('[data-item]');
  if (b) openBot(b.dataset.bot); else if (it) openItem(it.dataset.item);
});

/* ============================== overlay panel ============================== */
let panelOpen = false, panelReturn = null;
function showPanel(html) {
  $('panel-body').innerHTML = html; $('panel').hidden = false; panelOpen = true;
  if (world && world.controls && world.controls.isLocked) world.controls.unlock();
  const f = $('panel').querySelector('a,button.linkbtn') || $('panel-close'); f.focus();
}
function closePanel() { $('panel').hidden = true; panelOpen = false; if (panelReturn) { panelReturn.focus(); panelReturn = null; } }
$('panel-close').onclick = closePanel;
$('panel').addEventListener('click', e => {
  if (e.target === $('panel')) closePanel();
  const b = e.target.closest('[data-bot]'), it = e.target.closest('[data-item]'), go = e.target.closest('[data-go]');
  if (go) { closePanel(); world && world.goToBot(go.dataset.go); }
  else if (b) openBot(b.dataset.bot); else if (it) openItem(it.dataset.item);
});
function linkHTML(href, label) { return `<a class="open" href="${esc(href)}" ${/^https?:/.test(href) ? 'target="_blank" rel="noopener"' : ''}>${esc(label)}</a>`; }
function openBot(name) {
  const b = botByName(name);
  if (!b) return showPanel(`<h2 id="panel-title">${esc(name)}</h2><p>No data for this bot${S.state === 'failed' ? ' (office data unavailable)' : ''}.</p>`);
  const st = L.statusStyle(b.status), now = Date.now(), link = L.linkFor(b), mine = L.sortItems(items().filter(i => i.owner === b.bot));
  const wait = st.alert ? L.waitingMinutes(b.last_action_at, now) : null;
  showPanel(`<h2 id="panel-title">${esc(b.bot)} ${stWord(b)}</h2>
    ${st.alert ? `<div class="q">${b.question ? esc(b.question) : '(no question recorded)'}${wait != null ? `<div class="fallback">waiting ${wait} min</div>` : ''}</div>` : ''}
    <dl><dt>Status</dt><dd>${st.glyph} ${st.word}${b.rawStatus && b.rawStatus !== b.status ? ' (' + esc(b.rawStatus) + ')' : ''}</dd>
    <dt>Task</dt><dd>${esc(b.task || '—')}</dd>
    <dt>Last action</dt><dd>${esc(b.last_action || '—')} · ${L.relTime(b.last_action_at, now)}</dd>
    ${!st.alert ? `<dt>Question</dt><dd>${esc(b.question || '—')}</dd>` : ''}</dl>
    ${linkHTML(link, st.alert ? 'Answer ' + b.bot : 'Open ' + b.bot)}
    <div class="fallback">${esc(L.fallbackText(b))}<br>${esc(link)}</div>
    ${mine.length ? '<h3>Cards</h3><ul>' + mine.map(i => `<li><button class="linkbtn" data-item="${esc(i.id)}">${esc(L.cardTitle(i))}</button> · ${esc(i.priority)} · ${L.statusWord(i).word}</li>`).join('') + '</ul>' : ''}
    ${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
}
function openItem(id) {
  const it = items().find(i => i.id === id); if (!it) return;
  const w = L.statusWord(it), pb = L.priorityBadge(it.priority), col = L.COLUMNS.find(c => c.id === L.columnFor(it)).label;
  showPanel(`<h2 id="panel-title">${esc(L.cardTitle(it))}</h2>
    <dl><dt>Priority</dt><dd><span class="pbadge ${pb.loud ? 'loud' : ''}">${esc(it.priority)}</span></dd>
    <dt>Status</dt><dd><span class="st ${w.tone}">${w.glyph} ${w.word}</span> (${esc(it.status)}) · column ${esc(col)}</dd>
    <dt>Owner</dt><dd>${it.owner ? `<button class="linkbtn" data-bot="${esc(it.owner)}">${esc(it.owner)}</button>${it.ownerKnown ? '' : ' (not a known bot)'}` : '—'}</dd>
    <dt>Project</dt><dd>${esc(it.project)}</dd><dt>Updated</dt><dd>${L.relTime(it.updated_at, Date.now())}</dd><dt>ID</dt><dd>${esc(it.id)}</dd></dl>
    ${it.link ? linkHTML(it.link, 'Open link') + `<div class="fallback">${esc(it.link)}</div>` : '<p class="fallback">No link on this card.</p>'}
    ${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
}
function openNeeds() {
  const ne = needsEntries();
  showPanel(`<h2 id="panel-title">⚠ Needs Tim</h2><ul>${ne.length ? ne.map(e => `<li><span class="st ${e.tone}">${e.glyph}</span> ${e.bot ? `<button class="linkbtn" data-bot="${esc(e.bot)}">${esc(e.text)}</button> · <button class="linkbtn" data-go="${esc(e.bot)}">go to desk</button>` : e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.text)}</a>` : esc(e.text)}</li>`).join('') : '<li>✓ Nothing waiting on Tim</li>'}</ul>
    <h3>Open PRs</h3><ul>${S.pullsErr ? `<li class="src-down">? Data source unavailable: ${esc(S.pullsErr)}</li>` : S.pulls.length ? S.pulls.map(p => `<li>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.repo)} #${p.number}</a>` : esc(p.repo)} ${esc(p.title)} · ${p.draft ? 'draft' : 'ready'} · checks ${esc(p.checks)}</li>`).join('') : '<li>None open</li>'}</ul>
    <h3>Open asks</h3><ul>${S.asksErr ? `<li class="src-down">? Data source unavailable: ${esc(S.asksErr)}</li>` : S.asks.length ? S.asks.map(a => `<li><a href="https://github.com/${OWNER}/forge-coordination/blob/main/asks/open/${encodeURIComponent(a)}" target="_blank" rel="noopener">${esc(a)}</a></li>`).join('') : '<li>None</li>'}</ul>
    ${DEMO ? '<p class="fallback">EXAMPLE DATA</p>' : ''}`);
}
function openBoard(filter) {
  const [proj, colId] = (filter || '').split('|');
  const list = L.sortItems(items().filter(i => (!proj || i.project === proj) && (!colId || L.columnFor(i) === colId)));
  showPanel(`<h2 id="panel-title">Project board${proj ? ' · ' + esc(proj) : ''}</h2><ul>${list.map(i => { const w = L.statusWord(i);
    return `<li><span class="pbadge ${L.priorityBadge(i.priority).loud ? 'loud' : ''}">${esc(L.priorityBadge(i.priority).text)}</span> <button class="linkbtn" data-item="${esc(i.id)}">${esc(L.cardTitle(i))}</button> · ${esc(i.owner)} · <span class="st ${w.tone}">${w.glyph} ${w.word}</span></li>`; }).join('') || '<li>No items</li>'}</ul>`);
}
function openUsage() {
  const u = S.parsed ? S.parsed.usage : { services: [], as_of: '' };
  showPanel(`<h2 id="panel-title">AI usage</h2><ul>${u.services.map(s => { const w = L.usageWord(s.pct_used); return `<li><b>${esc(s.name)}</b> <span class="st ${w.tone}">${w.glyph} ${w.word}</span> · ${s.pct_used == null ? 'no reading' : Math.round(s.pct_used) + '% used, ' + Math.round(s.pct_left) + '% left'}${s.resets_at ? ' · resets ' + esc(new Date(s.resets_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : ''}${s.note ? ' · ' + esc(s.note) : ''}</li>`; }).join('') || '<li>No readings</li>'}</ul>
    <p class="fallback">Data as of ${u.as_of ? L.hhmm(u.as_of) : '--:--'} (America/New_York)${L.usageStale(u, Date.now()) ? ' · stale' : ''} · from Usage Ctrl's reports in OFFICE_STATUS.json</p>`);
}
function openConvo(name) {
  const lines = L.recentConversations(S.parsed ? S.parsed.conversations : [], Date.now()).filter(c => c.from === name);
  showPanel(`<h2 id="panel-title">${esc(name)} is talking</h2><ul>${lines.map(c => `<li><b>${esc(c.from)} → ${esc(c.to)}</b> · ${L.relTime(c.at, Date.now())}<br>${esc(c.text || 'talking with ' + c.to)}</li>`).join('')}</ul>`);
}

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
  const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: 'high-performance' });
  // cap the drawing buffer (~2880 px wide): 4K TVs stay smooth; DOM text stays full resolution
  const fitRatio = () => Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2, 2880 / Math.max(innerWidth, innerHeight));
  renderer.setPixelRatio(fitRatio());
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.45;
  renderer.shadowMap.enabled = false; // baked/simple lighting, no real-time shadows
  $('stage').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121214);
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 60);
  camera.layers.enable(1); // layer 1: focus/hover rings, never hit by the pick ray
  camera.position.set(0.3, 1.75, 9.0); camera.lookAt(-0.6, 1.05, -4);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  /* ---------- materials (graphite; colour only for state) ---------- */
  const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough }, extra));
  const MAT = {
    floor: std(0x35343a, 0.85), carpet: std(0x313236, 0.95), wall: std(0x333438, 0.9), ceil: std(0x2e2f32, 0.95), trim: std(0x1d1c1b, 0.6),
    desk: std(0x4b433c, 0.55), metal: std(0x55575c, 0.4, { metalness: 0.6 }), dark: std(0x1c1d20, 0.5), chair: std(0x2a2a2d, 0.7),
    panel: new THREE.MeshStandardMaterial({ color: 0xfff4e2, emissive: 0xfff0d8, emissiveIntensity: 1.4 }),
    sconce: new THREE.MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffd49a, emissiveIntensity: 1.2 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe6b8, emissiveIntensity: 1.5 }),
    felt: std(0x1f5a3a, 0.9), wood: std(0x3d2a1e, 0.6), fabric: std(0x3a4150, 0.95), cushion: std(0x46506a, 0.95), white: std(0xe8e8e6, 0.35), glass: null,
    lineFaint: new THREE.LineBasicMaterial({ color: 0xc58cff, transparent: true, opacity: 0.16 }),
    lineHi: new THREE.LineBasicMaterial({ color: 0xc58cff, transparent: true, opacity: 0.95 }),
    focus: new THREE.MeshStandardMaterial({ color: 0xc58cff, emissive: 0xc58cff, emissiveIntensity: 1.2 }),
    hover: new THREE.MeshStandardMaterial({ color: 0xc58cff, emissive: 0xc58cff, emissiveIntensity: 0.6, transparent: true, opacity: 0.6 })
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const add = (geo, mat, x, y, z, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  function canvasTex(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
    t.minFilter = THREE.LinearMipmapLinearFilter; return { c, ctx: c.getContext('2d'), t };
  }
  const screenMat = tex => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });

  /* ---------- room: 24 x 20 m, board wall at z = -10 faces the entrance at z = +10 ---------- */
  const RW = 24, RD = 20, RH = 4.4;
  add(box(RW, 0.1, RD), MAT.floor, 0, -0.05, 0);
  add(box(13, 0.02, 9.6), MAT.carpet, -2.2, 0.01, -0.6);
  add(box(RW, 0.1, RD), MAT.ceil, 0, RH + 0.05, 0);
  add(box(RW, RH, 0.2), MAT.wall, 0, RH / 2, -RD / 2 - 0.1);
  add(box(RW, RH, 0.2), MAT.wall, 0, RH / 2, RD / 2 + 0.1);
  add(box(0.2, RH, RD), MAT.wall, -RW / 2 - 0.1, RH / 2, 0);
  add(box(0.2, RH, RD), MAT.wall, RW / 2 + 0.1, RH / 2, 0);
  for (const [w, d, x, z] of [[RW, 0.04, 0, -RD / 2 + 0.02], [RW, 0.04, 0, RD / 2 - 0.02], [0.04, RD, -RW / 2 + 0.02, 0], [0.04, RD, RW / 2 - 0.02, 0]]) add(box(w, 0.12, d), MAT.trim, x, 0.06, z);
  // entrance door (behind the start view)
  add(box(1.3, 2.3, 0.06), MAT.wood, 0.3, 1.15, RD / 2 - 0.03); add(box(1.5, 0.1, 0.1), MAT.trim, 0.3, 2.35, RD / 2 - 0.05);
  // window on the left wall: light follows America/New_York time of day
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1630, emissive: 0x0d1a3a, emissiveIntensity: 1 });
  add(box(0.12, 2.0, 3.2), MAT.trim, -RW / 2 + 0.05, 2.2, -5.5);
  for (const dz of [-0.78, 0.78]) add(box(0.05, 1.8, 1.45), glassMat, -RW / 2 + 0.13, 2.2, -5.5 + dz);
  // ceiling light panels and wall sconces (emissive) + lights spread around the room so there are no dark corners
  const panelPos = [];
  for (const x of [-8, -2.5, 3, 8.5]) for (const z of [-6, 0, 6]) { add(box(1.8, 0.05, 0.9), MAT.panel, x, RH - 0.03, z); panelPos.push([x, z]); }
  for (const z of [-7, -1, 5]) { add(box(0.1, 0.35, 0.5), MAT.sconce, -RW / 2 + 0.06, 2.6, z); add(box(0.1, 0.35, 0.5), MAT.sconce, RW / 2 - 0.06, 2.6, z); }
  for (const x of [-9, 9]) add(box(0.5, 0.35, 0.1), MAT.sconce, x, 2.6, RD / 2 - 0.06);
  scene.add(new THREE.HemisphereLight(0xfff0de, 0x5a5048, 2.4));
  scene.add(new THREE.AmbientLight(0xffe6cc, 1.0));
  const key = new THREE.DirectionalLight(0xffe4c4, 1.2); key.position.set(3, 10, 8); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.45); fill.position.set(-6, 6, -8); scene.add(fill);
  const sun = new THREE.DirectionalLight(0xfff2d8, 0); sun.position.set(-14, 6, -5); scene.add(sun);
  const pts = LOW ? [[-3, 0], [5, 2]] : [[-7, -5], [2, -5], [-7, 5], [2, 5], [9, 0]];
  for (const [x, z] of pts) { const p = new THREE.PointLight(0xffe9cf, LOW ? 16 : 11, 16, 1.1); p.position.set(x, RH - 0.4, z); scene.add(p); }
  const boardGlow = new THREE.PointLight(0xdfe6ff, 5, 10, 1.2); boardGlow.position.set(-0.5, 2.6, -8.2); scene.add(boardGlow);
  if (!LOW) for (const [x, z] of [[-11, -1], [11, 5], [-9, 9], [9, 9], [11, -7]]) { const p = new THREE.PointLight(0xffd49a, 4, 8, 1.2); p.position.set(x, 2.5, z); scene.add(p); }
  const alertLights = [0, 1].map(() => { const p = new THREE.PointLight(0xff2a2a, 0, 4, 1.5); scene.add(p); return p; });

  /* ---------- obstacles + nav grid ---------- */
  const obstacles = []; // {x0,x1,z0,z1, viewerOnly}
  const block = (cx, cz, hx, hz, viewerOnly) => obstacles.push({ x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz, viewerOnly });

  /* ---------- desks ---------- */
  const deskGeo = { top: box(1.6, 0.05, 0.8), leg: box(0.05, 0.72, 0.05), kb: box(0.46, 0.025, 0.15), mouse: new THREE.CapsuleGeometry(0.022, 0.03, 3, 8),
    mon: box(0.95, 0.6, 0.04), stand: new THREE.CylinderGeometry(0.025, 0.025, 0.28, 8), base: box(0.26, 0.02, 0.18), led: box(0.9, 0.018, 0.012),
    lampBase: new THREE.CylinderGeometry(0.07, 0.08, 0.025, 14), lampArm: new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), shade: new THREE.ConeGeometry(0.09, 0.12, 14, 1, true), bulb: new THREE.SphereGeometry(0.035, 10, 8),
    plate: box(0.42, 0.09, 0.05), mug: new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12),
    seat: box(0.5, 0.07, 0.48), back: box(0.48, 0.5, 0.06), pole: new THREE.CylinderGeometry(0.03, 0.03, 0.38, 8), spoke: box(0.04, 0.03, 0.32), ring: new THREE.TorusGeometry(1.15, 0.035, 8, 48) };
  const desks = [];
  const monW = LOW ? 448 : 640, monH = LOW ? 280 : 400;
  SEATS.forEach((name, i) => {
    const x = DESK_X[i % 4], z = DESK_Z[Math.floor(i / 4)], g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    add(deskGeo.top, MAT.desk, 0, 0.745, 0, g);
    for (const [lx, lz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) add(deskGeo.leg, MAT.metal, lx, 0.36, lz, g);
    add(deskGeo.kb, MAT.dark, 0, 0.785, 0.12, g); add(deskGeo.mouse, MAT.dark, 0.36, 0.79, 0.14, g).rotation.x = Math.PI / 2;
    const scr = canvasTex(monW, monH);
    const monMats = [MAT.dark, MAT.dark, MAT.dark, MAT.dark, screenMat(scr.t), MAT.dark];
    const mon = add(deskGeo.mon, monMats, 0, 1.2, -0.22, g); // screen face (+z) faces the bot and the entrance
    add(deskGeo.stand, MAT.metal, 0, 0.9, -0.25, g); add(deskGeo.base, MAT.metal, 0, 0.78, -0.24, g);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x888888, emissiveIntensity: 1 });
    add(deskGeo.led, ledMat, 0, 0.893, -0.195, g);
    // desk lamp (turns red for blocked / waiting_tim)
    const shadeMat = std(0xd8d2c8, 0.5, { side: THREE.DoubleSide }), bulbMat = MAT.bulb.clone();
    add(deskGeo.lampBase, MAT.dark, 0.66, 0.78, -0.22, g); const arm = add(deskGeo.lampArm, MAT.metal, 0.66, 0.99, -0.22, g); arm.rotation.z = 0.12;
    add(deskGeo.shade, shadeMat, 0.63, 1.21, -0.2, g); add(deskGeo.bulb, bulbMat, 0.63, 1.17, -0.2, g);
    // nameplate: 3D block, name on its front face
    const np = canvasTex(256, 56); drawSign(np.ctx, 256, 56, name, '#141416', '#eceef1'); np.t.needsUpdate = true;
    add(deskGeo.plate, [MAT.dark, MAT.dark, MAT.dark, MAT.dark, screenMat(np.t), MAT.dark], 0.5, 0.815, 0.36, g);
    if (i % 3 === 0) add(deskGeo.mug, MAT.white, -0.6, 0.82, 0.05, g);
    // chair
    const ch = new THREE.Group(); ch.position.set(0, 0, 0.85); g.add(ch);
    add(deskGeo.seat, MAT.chair, 0, 0.46, 0, ch); add(deskGeo.back, MAT.chair, 0, 0.78, 0.24, ch); add(deskGeo.pole, MAT.metal, 0, 0.24, 0, ch);
    for (let k = 0; k < 5; k++) { const s = add(deskGeo.spoke, MAT.metal, 0, 0.05, 0, ch); s.rotation.y = k * 1.2566; s.translateZ(0.14); }
    const hover = new THREE.Mesh(deskGeo.ring, MAT.hover); hover.layers.set(1); hover.rotation.x = Math.PI / 2; hover.position.set(0, 0.04, 0.3); hover.visible = false; g.add(hover);
    const focus = new THREE.Mesh(deskGeo.ring, MAT.focus); focus.layers.set(1); focus.rotation.x = Math.PI / 2; focus.position.set(0, 0.05, 0.3); focus.scale.setScalar(1.08); focus.visible = false; g.add(focus);
    g.traverse(o => { if (o.isMesh && o !== hover && o !== focus) o.userData.deskBot = name; });
    block(x, z, 0.8, 0.4); block(x, z + 0.85, 0.32, 0.3, true);
    desks.push({ name, i, x, z, g, mon, scr, ledMat, shadeMat, bulbMat, hover, focus, lod: '', drawnKey: '',
      seat: { x, z: z + 0.72, face: Math.PI }, stand: { x: x + 1.12, z: z + 0.15, face: 0 }, visit: { x: x - 1.12, z: z + 0.15, face: Math.PI / 2 },
      linkPoint: new THREE.Vector3(x, 0.78, z - 0.4) });
  });
  const deskOf = n => desks.find(d => d.name === n);

  /* ---------- boards: 3D frames with the screen on the front face ---------- */
  function makeBoard(id, w, h, cx, cy, cz, rotY, cw, chh) {
    const tex = canvasTex(cw, chh), g = new THREE.Group(); g.position.set(cx, cy, cz); g.rotation.y = rotY; scene.add(g);
    add(box(w + 0.18, h + 0.18, 0.08), MAT.trim, 0, 0, 0, g);
    const screen = add(box(w, h, 0.04), [MAT.dark, MAT.dark, MAT.dark, MAT.dark, screenMat(tex.t), MAT.dark], 0, 0, 0.05, g);
    screen.userData.board = id;
    return { id, w, h, g, screen, tex, hits: [] };
  }
  const BW = 9.6, BH = 4.6;
  const project = makeBoard('project', BW, BH, -2, 2.5, -RD / 2 + 0.05, 0, LOW ? 1280 : 2048, LOW ? 613 : 981);
  const usage = makeBoard('usage', 4.8, 2.9, 5.6, 2.35, -RD / 2 + 0.05, 0, LOW ? 640 : 1024, LOW ? 387 : 619);
  const needs = makeBoard('needs', 3.6, 2.4, -RW / 2 + 0.05, 2.1, 1, Math.PI / 2, LOW ? 640 : 1024, LOW ? 427 : 683);
  const boards = { project, usage, needs };

  /* ---------- lounge: pool table, couch, coffee station, fridge (all primitives) ---------- */
  const pool = new THREE.Group(); pool.position.set(8.9, 0, -0.9); scene.add(pool);
  add(box(1.3, 0.18, 2.4), MAT.wood, 0, 0.72, 0, pool); add(box(1.12, 0.03, 2.22), MAT.felt, 0, 0.82, 0, pool);
  for (const [lx, lz] of [[-0.55, -1.05], [0.55, -1.05], [-0.55, 1.05], [0.55, 1.05]]) add(box(0.12, 0.66, 0.12), MAT.wood, lx, 0.33, lz, pool);
  const ballG = new THREE.SphereGeometry(0.03, 10, 8);
  [0xffffff, 0xf2c200, 0x1b4fd8, 0xd8261b, 0x6b2fb3, 0xf07a10, 0x157a3a, 0x111111].forEach((c, k) => add(ballG, std(c, 0.2), -0.2 + (k % 4) * 0.13, 0.865, -0.4 + Math.floor(k / 4) * 0.12 + (k ? 0.5 : -0.2), pool));
  block(8.9, -0.9, 0.65, 1.2);
  const couch = new THREE.Group(); couch.position.set(11.25, 0, 4.5); scene.add(couch);
  add(box(0.9, 0.4, 2.6), MAT.fabric, 0, 0.2, 0, couch); add(box(0.25, 0.75, 2.6), MAT.fabric, 0.33, 0.55, 0, couch);
  add(box(0.9, 0.55, 0.22), MAT.fabric, 0, 0.32, -1.3, couch); add(box(0.9, 0.55, 0.22), MAT.fabric, 0, 0.32, 1.3, couch);
  for (const dz of [-0.62, 0.62]) add(box(0.62, 0.14, 1.18), MAT.cushion, -0.08, 0.46, dz, couch);
  block(11.25, 4.5, 0.45, 1.4);
  const coffee = new THREE.Group(); coffee.position.set(11.3, 0, -6.2); scene.add(coffee);
  add(box(0.7, 0.9, 1.6), MAT.wood, 0, 0.45, 0, coffee); add(box(0.74, 0.04, 1.64), MAT.dark, 0, 0.92, 0, coffee);
  add(box(0.42, 0.5, 0.36), MAT.dark, 0.05, 1.19, -0.3, coffee); add(box(0.1, 0.06, 0.1), MAT.metal, -0.2, 1.08, -0.3, coffee);
  for (const dz of [0.2, 0.32, 0.44]) add(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12), MAT.white, -0.1, 0.99, dz, coffee);
  const cs = canvasTex(256, 64); drawSign(cs.ctx, 256, 64, 'COFFEE', '#111', '#f4e7d0'); cs.t.needsUpdate = true;
  const csg = add(box(0.06, 0.22, 0.9), [screenMat(cs.t), MAT.dark, MAT.dark, MAT.dark, MAT.dark, MAT.dark], 0.35, 1.95, 0, coffee); csg.rotation.y = Math.PI; csg.position.x = 0.32;
  block(11.3, -6.2, 0.4, 0.82);
  const fridge = new THREE.Group(); fridge.position.set(11.3, 0, -8.4); scene.add(fridge);
  add(box(0.75, 1.9, 0.85), MAT.white, 0, 0.95, 0, fridge); add(box(0.02, 1.86, 0.02), MAT.metal, -0.38, 0.95, 0, fridge);
  add(box(0.04, 0.6, 0.04), MAT.metal, -0.4, 1.2, 0.3, fridge);
  const fs = canvasTex(512, 64); drawSign(fs.ctx, 512, 64, 'WHITE MONSTER', '#f4f4f4', '#111'); fs.t.needsUpdate = true;
  const fsg = add(box(0.06, 0.16, 0.8), [MAT.dark, screenMat(fs.t), MAT.dark, MAT.dark, MAT.dark, MAT.dark], -0.37, 1.65, 0, fridge); void fsg;
  block(11.3, -8.4, 0.42, 0.45);
  // walls for the viewer
  const WALL = 0.35;

  /* ---------- nav grid (A*) for the bots ---------- */
  const CELL = 0.2, GX = Math.round(RW / CELL), GZ = Math.round(RD / CELL), INF = 0.22;
  const grid = new Uint8Array(GX * GZ);
  const toCell = (x, z) => [Math.max(0, Math.min(GX - 1, Math.floor((x + RW / 2) / CELL))), Math.max(0, Math.min(GZ - 1, Math.floor((z + RD / 2) / CELL)))];
  const cellC = (i, j) => [-RW / 2 + (i + 0.5) * CELL, -RD / 2 + (j + 0.5) * CELL];
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
    const [x, z] = cellC(i, j);
    let b = x < -RW / 2 + 0.4 || x > RW / 2 - 0.4 || z < -RD / 2 + 0.4 || z > RD / 2 - 0.4;
    if (!b) for (const o of obstacles) if (!o.viewerOnly && x > o.x0 - INF && x < o.x1 + INF && z > o.z0 - INF && z < o.z1 + INF) { b = true; break; }
    grid[j * GX + i] = b ? 1 : 0;
  }
  const free = (i, j) => i >= 0 && j >= 0 && i < GX && j < GZ && !grid[j * GX + i];
  function nearestFree(i, j) {
    if (free(i, j)) return [i, j];
    for (let r = 1; r < 15; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) if (Math.max(Math.abs(di), Math.abs(dj)) === r && free(i + di, j + dj)) return [i + di, j + dj];
    return [i, j];
  }
  function los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.1);
    for (let k = 1; k < n; k++) { const [i, j] = toCell(ax + (bx - ax) * k / n, az + (bz - az) * k / n); if (!free(i, j)) return false; }
    return true;
  }
  function route(from, to) {
    const [si, sj] = nearestFree(...toCell(from.x, from.z)), [ti, tj] = nearestFree(...toCell(to.x, to.z));
    const N = GX * GZ, gS = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [[0, si, sj]]; gS[sj * GX + si] = 0;
    const h = (i, j) => Math.hypot(i - ti, j - tj);
    let found = false, guard = 0;
    while (open.length && guard++ < 20000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, i, j] = open.splice(bi, 1)[0], id = j * GX + i;
      if (closed[id]) continue; closed[id] = 1;
      if (i === ti && j === tj) { found = true; break; }
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (!free(ni, nj)) continue;
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
        const nid = nj * GX + ni, ng = gS[id] + (di && dj ? 1.414 : 1);
        if (ng < gS[nid]) { gS[nid] = ng; came[nid] = id; open.push([ng + h(ni, nj), ni, nj]); }
      }
    }
    const raw = [];
    if (found) { let id = tj * GX + ti; while (id !== -1) { raw.push(cellC(id % GX, Math.floor(id / GX))); id = came[id]; } raw.reverse(); }
    raw.push([to.x, to.z]);
    const out = []; let ax = from.x, az = from.z, k = 0;
    while (k < raw.length) {
      let far = k; for (let m = raw.length - 1; m > k; m--) if (los(ax, az, raw[m][0], raw[m][1])) { far = m; break; }
      out.push(new THREE.Vector2(raw[far][0], raw[far][1])); ax = raw[far][0]; az = raw[far][1]; k = far + 1;
    }
    return out;
  }

  /* ---------- lounge activity slots ---------- */
  const SLOTS = [
    { id: 'pool1', kind: 'pool', x: 7.95, z: -1.3, face: Math.PI / 2 }, { id: 'pool2', kind: 'pool', x: 9.85, z: -0.4, face: -Math.PI / 2 },
    { id: 'nap1', kind: 'nap', x: 10.3, z: 3.95, face: Math.PI / 2, lie: { x: 11.05, z: 3.95 } }, { id: 'nap2', kind: 'nap', x: 10.3, z: 5.15, face: Math.PI / 2, lie: { x: 11.05, z: 5.15 } },
    { id: 'coffee', kind: 'coffee', x: 10.5, z: -6.0, face: Math.PI / 2 }, { id: 'fridge', kind: 'fridge', x: 10.45, z: -7.7, face: Math.PI / 2 },
    { id: 'lo1', kind: 'loiter', x: 7.6, z: 3.6, face: Math.PI / 2 }, { id: 'lo2', kind: 'loiter', x: 7.4, z: -4.6, face: Math.PI / 2 }, { id: 'lo3', kind: 'loiter', x: 8.6, z: 7.6, face: Math.PI }
  ];
  const slotBy = new Map();

  /* ---------- characters ---------- */
  const tmpV = new THREE.Vector3();
  function ensureChars() {
    for (const b of bots()) {
      if (chars.has(b.bot) || !deskOf(b.bot)) continue;
      const c = makeBot(b.bot, !LOW, b.bot_id), d = deskOf(b.bot);
      c.phase = Math.random() * 6; c.pickups = []; c.path = []; c.goalKey = ''; c.pos = new THREE.Vector2(d.seat.x, d.seat.z);
      c.root.position.set(d.seat.x, 0, d.seat.z); c.root.rotation.y = Math.PI; c.pose = 'sit';
      scene.add(c.root); chars.set(b.bot, c); c.botId = b.bot_id;
      c.tag = document.createElement('div'); c.tag.className = 'tag'; $('labels').appendChild(c.tag);
      c.bub = document.createElement('div'); c.bub.className = 'bubbles'; c.bub.hidden = true; c.bub.onclick = () => openConvo(b.bot); $('labels').appendChild(c.bub);
      c.tagKey = ''; c.bubKey = '';
    }
    for (const p of pendingPickups.splice(0)) queuePickup(p);
  }
  function releaseSlot(c) { if (c.slot) { slotBy.delete(c.slot.id); c.slot = null; } }
  function pickSlot(c) {
    releaseSlot(c);
    const order = SLOTS.filter(s => !slotBy.has(s.id) && s.kind !== 'loiter').sort(() => Math.random() - 0.5);
    const s = order[0] || SLOTS.find(s => !slotBy.has(s.id)) || SLOTS[6];
    slotBy.set(s.id, c.name); c.slot = s; c.slotUntil = clock + 20 + Math.random() * 40; c.slotKey = s.id + ':' + Math.round(clock);
  }
  function cardCenter(itemId) {
    const h = project.hits.find(x => x.id === itemId);
    if (!h) return new THREE.Vector3(-2, 2.5, -RD / 2 + 0.1);
    return new THREE.Vector3(-2 + (h.x + h.w / 2 - 0.5) * BW, 2.5 + (0.5 - (h.y + h.h / 2)) * BH, -RD / 2 + 0.1);
  }
  function decide(c, b, convo) {
    if (c.pickups.length) {
      const id = c.pickups[0], key = 'pick:' + id + ':' + c.pickups.length;
      if (c.goalKey === key && c.arrived) {
        if (!S.glow.has(id)) { S.glow.add(id); boardDirty = true; }
        if (clock - c.arrivedAt > 2.6) { c.pickups.shift(); S.glow.delete(id); boardDirty = true; return decide(c, b, convo); }
      }
      const p = cardCenter(id);
      return { key, spot: { x: Math.max(-6.4, Math.min(2.4, p.x)), z: -8.9, face: Math.PI }, pose: 'board' };
    }
    if (convo && deskOf(convo.to)) { releaseSlot(c); const d = deskOf(convo.to); return { key: 'talk:' + convo.to, spot: d.visit, pose: 'talk' }; }
    const st = L.statusStyle(b ? b.status : 'idle'), d = deskOf(c.name);
    if (st.behavior === 'work') { releaseSlot(c); return { key: 'seat', spot: d.seat, pose: 'type' }; }
    if (st.behavior === 'wave') { releaseSlot(c); return { key: 'stand', spot: d.stand, pose: 'wave' }; }
    if (!c.slot || clock > c.slotUntil) pickSlot(c);
    return { key: 'act:' + c.slotKey, spot: c.slot, pose: c.slot.kind === 'loiter' ? 'stand' : c.slot.kind, lie: c.slot.lie };
  }
  const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };
  function updateChar(c, dt) {
    const b = botByName(c.name), reduced = reducedMQ.matches;
    const frozen = S.state === 'failed';
    c.setFrozen(frozen);
    const st = L.statusStyle(b ? b.status : 'idle');
    if (frozen) {
      c.warn.visible = false; c.quest.visible = true; c.zzz.visible = false; c.setExpression('puzzled');
      animate(c, c.pose === 'type' || c.pose === 'sit' ? 'sit' : 'frozen', clock, dt, { reduced: true, holding: false });
      return;
    }
    const convo = activeConvos.get(c.name);
    const g = decide(c, b, convo);
    if (g.key !== c.goalKey) {
      c.goalKey = g.key; c.goal = g; c.arrived = false;
      c.path = route({ x: c.pos.x, z: c.pos.y }, g.spot);
    }
    let pose = g.pose;
    if (c.path.length) {
      const tgt = c.path[0], dx = tgt.x - c.pos.x, dz = tgt.y - c.pos.y, dist = Math.hypot(dx, dz), step = 1.35 * dt;
      if (dist <= step) { c.pos.copy(tgt); c.path.shift(); } else { c.pos.x += dx / dist * step; c.pos.y += dz / dist * step; }
      if (dist > 0.01) c.root.rotation.y = angLerp(c.root.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 10));
      pose = 'walk';
      c.root.position.set(c.pos.x, 0, c.pos.y);
    } else {
      if (!c.arrived) { c.arrived = true; c.arrivedAt = clock; }
      let face = g.spot.face;
      if (g.pose === 'talk' && deskOf(convo.to)) { const d = deskOf(convo.to), o = chars.get(convo.to), tx = o ? o.pos.x : d.x, tz = o ? o.pos.y : d.z; face = Math.atan2(tx - c.pos.x, tz - c.pos.y); }
      c.root.rotation.y = angLerp(c.root.rotation.y, face, Math.min(1, dt * 6));
      const lie = g.lie && pose === 'nap' ? g.lie : null;
      c.root.position.x += ((lie ? lie.x : c.pos.x) - c.root.position.x) * Math.min(1, dt * 4);
      c.root.position.z += ((lie ? lie.z : c.pos.y) - c.root.position.z) * Math.min(1, dt * 4);
    }
    c.pose = pose;
    c.setExpression(pose === 'nap' ? 'sleepy' : st.alert ? 'worried' : S.state === 'stale' ? 'puzzled' : pose === 'type' || pose === 'talk' ? 'happy' : 'neutral');
    c.warn.visible = st.alert;
    c.quest.visible = S.state === 'stale' && !st.alert;
    if (st.alert) { const p = L.pulse(clock, reduced); c.warn.userData.mat.emissiveIntensity = 0.3 + p; c.warn.scale.setScalar(reduced ? 1 : 0.94 + 0.08 * p); c.warn.rotation.y = Math.atan2(camera.position.x - c.root.position.x, camera.position.z - c.root.position.z) - c.root.rotation.y; }
    animate(c, pose, clock, dt, { reduced, holding: c.arrived && clock - c.arrivedAt > 1.4 });
    c.rig.position.x = pose === 'nap' ? 0.5 : 0;
  }

  /* ---------- labels & speech bubbles (DOM, projected from 3D) ---------- */
  const activeConvos = new Map(); let convoLines = [];
  function updateConvos() {
    activeConvos.clear();
    convoLines = S.state === 'failed' ? [] : L.recentConversations(S.parsed ? S.parsed.conversations : [], Date.now());
    for (const c of convoLines) activeConvos.set(c.from, c);
  }
  function updateLabels() {
    const w = innerWidth, h = innerHeight, max = TV ? 40 : 22;
    for (const c of chars.values()) {
      const b = botByName(c.name), st = L.statusStyle(b ? b.status : 'idle'), frozen = S.state === 'failed';
      const key = c.name + st.status + frozen + S.state + (hoverBot === c.name);
      if (key !== c.tagKey) {
        c.tagKey = key;
        c.tag.className = 'tag' + (frozen ? ' frozen' : '') + (hoverBot === c.name ? ' hl' : '');
        const chip = st.alert && !frozen ? `<span class="chip">⚠ ${st.word}</span>` : S.state === 'stale' || frozen ? '<span class="chip stale">?</span>' : '';
        c.tag.innerHTML = chip + esc(c.name); c.tag.title = '';
        const short = shortTag(c.name, c.botId);
        if (short !== c.name && c.tag.offsetWidth > Math.min(TAG_MAX_PX, w * 0.3)) { c.tag.innerHTML = chip + esc(short); c.tag.title = c.name; }
      }
      tmpV.set(c.root.position.x, c.top + (st.alert ? 0.75 : 0.18) + c.rig.position.y, c.root.position.z).project(camera);
      const dist = camera.position.distanceTo(c.root.position);
      const vis = tmpV.z < 1 && dist < max && Math.abs(tmpV.x) < 1.2 && Math.abs(tmpV.y) < 1.2;
      c.tag.style.display = vis ? '' : 'none';
      const sx = (tmpV.x * 0.5 + 0.5) * w, sy = (-tmpV.y * 0.5 + 0.5) * h;
      if (vis) c.tag.style.transform = `translate(-50%,-100%) translate(${sx}px,${sy}px)`;
      const lines = convoLines.filter(l => l.from === c.name);
      const bk = lines.map(l => l.at + l.text).join('|');
      if (bk !== c.bubKey) {
        c.bubKey = bk;
        c.bub.innerHTML = lines.map((l, k) => `<div class="bubble${l.text ? '' : ' who'}" style="opacity:${[0.45, 0.72, 1][3 - lines.length + k] || 1}">${esc(L.bubbleText(l))}</div>`).join('');
      }
      c.bub.hidden = !lines.length || !vis;
      if (lines.length && vis) c.bub.style.transform = `translate(-50%,-100%) translate(${sx}px,${sy - (TV ? 46 : 26)}px)`;
    }
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
      if (!ln) { ln = new THREE.Line(new THREE.BufferGeometry(), MAT.lineFaint); scene.add(ln); lines.set(it.id, ln); }
      ln.geometry.setFromPoints([cardCenter(it.id), d.linkPoint]);
      ln.userData.owner = it.owner;
    }
    for (const [id, ln] of lines) if (!seen.has(id)) { scene.remove(ln); ln.geometry.dispose(); lines.delete(id); }
  }

  /* ---------- screens ---------- */
  let boardDirty = true, page = 0, pageAt = 0, focusItem = null;
  function drawBoards() {
    const rows = L.buildBoard(items()), per = 2, pages = Math.max(1, Math.ceil(rows.length / per));
    if (page >= pages) page = 0;
    const hl = new Set();
    if (hoverBot) items().filter(i => i.owner === hoverBot).forEach(i => hl.add(i.id));
    if (hoverItem) hl.add(hoverItem);
    const t = project.tex;
    project.hits = drawBoard(t.ctx, t.c.width, t.c.height, { rows: rows.slice(page * per, page * per + per), perPage: per, page, pages, state: S.state, asOf: S.parsed && S.parsed.updatedAt, demo: DEMO, highlight: hl, glow: S.glow, focusId: focusItem });
    t.t.needsUpdate = true;
    const u = usage.tex; drawUsage(u.ctx, u.c.width, u.c.height, { usage: S.parsed ? S.parsed.usage : null, now: Date.now(), demo: DEMO, failed: S.state === 'failed' }); u.t.needsUpdate = true;
    const n = needs.tex; drawNeeds(n.ctx, n.c.width, n.c.height, { entries: needsEntries(), count: needsCount(), demo: DEMO, state: S.state }); n.t.needsUpdate = true;
    updateLines();
    for (const [id, ln] of lines) ln.material = hl.has(id) || (hoverBot && ln.userData.owner === hoverBot) ? MAT.lineHi : MAT.lineFaint;
    boardDirty = false;
  }
  function drawDeskIf(d, force) {
    const b = botByName(d.name) || { bot: d.name, bot_id: '', status: 'idle', task: '', last_action: '', last_action_at: '', question: '' };
    const lod = L.lodFor(camera.position.distanceTo(tmpV.set(d.x, 1.2, d.z - 0.2)));
    const mine = L.sortItems(items().filter(i => i.owner === d.name));
    const key = lod + JSON.stringify(b) + S.state + mine.map(i => i.id + i.status).join() + (d.name === 'President' ? items().length : '') + Math.floor(Date.now() / 30000);
    if (!force && key === d.drawnKey) return;
    d.drawnKey = key;
    drawDesk(d.scr.ctx, d.scr.c.width, d.scr.c.height, { bot: b, lod, now: Date.now(), items: mine, allItems: items(), demo: DEMO, frozen: S.state === 'failed', usage: S.parsed && S.parsed.usage });
    d.scr.t.needsUpdate = true;
    const st = L.statusStyle(b.status), col = new THREE.Color(S.state === 'failed' ? '#8b9099' : st.color);
    d.ledMat.color.copy(col); d.ledMat.emissive.copy(col);
    d.shadeMat.color.set(st.alert && S.state !== 'failed' ? 0xff3030 : 0xd8d2c8);
    d.bulbMat.emissive.set(st.alert && S.state !== 'failed' ? 0xff2020 : 0xffe6b8);
  }
  function applyDaylight() {
    const k = L.daylight(Date.now());
    glassMat.emissive.setRGB(0.05 + 0.7 * k, 0.1 + 0.75 * k, 0.23 + 0.75 * k); glassMat.color.copy(glassMat.emissive);
    sun.intensity = 1.3 * k;
  }
  applyDaylight();

  /* ---------- controls ---------- */
  const controls = new PointerLockControls(camera, document.body);
  const keys = new Set(), vel = new THREE.Vector3();
  let glide = null, hop = TV, hopPos = null, lastInput = performance.now(), tour = null, joy = { x: 0, y: 0 };
  let hoverBot = null, hoverItem = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickables = () => { const a = [project.screen, usage.screen, needs.screen]; desks.forEach(d => a.push(d.g)); chars.forEach(c => a.push(c.root)); return a; };
  function pick(nx, ny) {
    ndc.set(nx, ny); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables(), true)[0];
    if (!hit || hit.distance > 30) return null;
    const o = hit.object;
    if (o.userData.board) {
      if (o.userData.board !== 'project') return { board: o.userData.board };
      const uv = hit.uv, x = uv.x, y = 1 - uv.y;
      const h = project.hits.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      return h ? (h.id ? { item: h.id } : { more: h.more }) : { board: 'project' };
    }
    if (o.userData.charName) return { bot: o.userData.charName };
    if (o.userData.deskBot) return { bot: o.userData.deskBot };
    return null;
  }
  function activate(p) {
    if (!p) return false;
    if (p.item) openItem(p.item); else if (p.more) openBoard(p.more); else if (p.bot) openBot(p.bot);
    else if (p.board === 'needs') openNeeds(); else if (p.board === 'usage') openUsage(); else if (p.board === 'project') openBoard('');
    return true;
  }
  function setHover(p) {
    const nb = p && p.bot || null, ni = p && p.item || null;
    if (nb === hoverBot && ni === hoverItem) return;
    hoverBot = nb; hoverItem = ni;
    const owner = ni ? (items().find(i => i.id === ni) || {}).owner : null;
    desks.forEach(d => (d.hover.visible = d.name === nb || d.name === owner));
    boardDirty = true;
  }
  const canvas = renderer.domElement;
  let down = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch' || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6; down = null; if (moved || panelOpen) return;
    lastInput = performance.now();
    const p = controls.isLocked ? pick(0, 0) : pick(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (!activate(p) && !controls.isLocked && !touch && !TV) controls.lock();
  });
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch' || controls.isLocked) return; hoverAt = [e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1]; });
  let hoverAt = null;
  controls.addEventListener('lock', () => { $('start').hidden = true; $('crosshair').hidden = false; $('hint').hidden = true; });
  controls.addEventListener('unlock', () => { $('crosshair').hidden = true; showHint(); });
  $('start-btn').onclick = () => { $('start').hidden = true; if (!touch) controls.lock(); };

  // touch: left joystick moves, drag anywhere else looks, tap picks
  const look = new THREE.Euler(0, 0, 0, 'YXZ');
  function turn(dx, dy) { look.setFromQuaternion(camera.quaternion); look.y -= dx; look.x = Math.max(-1.4, Math.min(1.4, look.x - dy)); camera.quaternion.setFromEuler(look); }
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
  const targets = [
    { kind: 'board', id: 'needs', x: -12, view: [[-8.4, 1.9, 1], [-12, 1.9, 1]] },
    { kind: 'board', id: 'project', x: -2, view: [[-2, 2.3, -5.0], [-2, 2.45, -10]] },
    { kind: 'board', id: 'usage', x: 5.6, view: [[5.6, 2.2, -6.3], [5.6, 2.3, -10]] }
  ].concat(desks.map(d => ({ kind: 'desk', id: d.name, bot: d.name, x: d.x, z: d.z, view: [[d.x + 0.3, 1.85, d.z + 2.0], [d.x, 1.05, d.z - 0.25]] })));
  const rows = L.hopRows(targets);
  function glideTo(view, ms) {
    const [p, l] = view, m = new THREE.Matrix4().lookAt(new THREE.Vector3(...p), new THREE.Vector3(...l), new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    const dur = reducedMQ.matches ? 1 : ms;
    glide = { t0: performance.now(), dur, p0: camera.position.clone(), q0: camera.quaternion.clone(), p1: new THREE.Vector3(...p), q1: q };
  }
  function focusTarget(t) {
    desks.forEach(d => (d.focus.visible = t && t.kind === 'desk' && d.name === t.bot));
    const nm = $('focusname');
    if (t) { nm.hidden = false; nm.textContent = t.kind === 'desk' ? t.bot + ' · ' + L.statusStyle((botByName(t.bot) || {}).status).word : { needs: 'Needs Tim board', project: 'Project board', usage: 'AI usage wall' }[t.id]; }
    else nm.hidden = true;
    setHover(t ? (t.kind === 'desk' ? { bot: t.bot } : null) : null);
  }
  function hopTo(pos) { hopPos = pos; const t = rows[pos.row][pos.col]; focusTarget(t); glideTo(t.view, L.GLIDE_MS); }
  function currentTarget() { return hopPos ? rows[hopPos.row][hopPos.col] : null; }
  function openTarget(t) { if (!t) return; if (t.kind === 'desk') openBot(t.bot); else activate({ board: t.id }); }
  function goToBot(name, open) {
    const r = rows.findIndex(r => r.some(t => t.bot === name)); if (r < 0) return;
    hopTo({ row: r, col: rows[r].findIndex(t => t.bot === name) }); if (open) setTimeout(() => openBot(name), L.GLIDE_MS + 50);
  }
  function overlayNav(dir) {
    const f = [...$('panel').querySelectorAll('a,button')]; if (!f.length) return;
    const i = f.indexOf(document.activeElement); const n = f[(i + dir + f.length) % f.length]; n.focus();
  }
  addEventListener('keydown', e => {
    lastInput = performance.now();
    if (tour) { tour = null; e.preventDefault(); return; } // any key stops the tour
    if (panelOpen) {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); closePanel(); }
      else if (TV && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) { e.preventDefault(); overlayNav(1); }
      else if (TV && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) { e.preventDefault(); overlayNav(-1); }
      return;
    }
    if (TV) {
      const a = L.tvKeyAction(e.key, hop); if (!a) return; e.preventDefault();
      if (a === 'toggle_hop') { hop = !hop; showHint(); if (hop) hopTo(hopPos || { row: 0, col: 1 }); else { focusTarget(null); } return; }
      if (a === 'open') return hop ? openTarget(currentTarget()) : activate(pick(0, 0));
      if (a === 'back') return;
      if (['next', 'prev', 'up', 'down'].includes(a)) return hopTo(L.hopMove(rows, hopPos || { row: 0, col: 1 }, a));
      keys.add(a); return;
    }
    if (e.key === 'Enter' && !controls.isLocked && document.activeElement === document.body) { $('needs-btn').click(); return; }
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
  function move(dt) {
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let f = 0, s = 0;
    if (TV) { if (keys.has('forward')) f += 1; if (keys.has('backward')) f -= 1; if (keys.has('turn_left')) turn(-1.8 * dt, 0); if (keys.has('turn_right')) turn(1.8 * dt, 0); }
    else {
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
      f -= joy.y; s += joy.x;
    }
    const target = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    if (target.lengthSq() > 1) target.normalize();
    target.multiplyScalar(keys.has('ShiftLeft') ? 5 : 3);
    vel.lerp(target, Math.min(1, dt * 10));
    if (vel.lengthSq() < 1e-5) return;
    glide = null; tour = null;
    const p = camera.position.clone().addScaledVector(vel, dt); collide(p); camera.position.x = p.x; camera.position.z = p.z;
  }
  function showHint() {
    const h = $('hint'); h.hidden = false;
    h.textContent = TV ? (hop ? '◀ ▶ desks and boards · ▲ ▼ rows · OK opens · Back closes · H free walk' : '▲ ▼ walk · ◀ ▶ turn · OK opens · H hop mode')
      : touch ? 'Joystick to walk · drag to look · tap a desk, card or bot' : 'Click to walk · WASD · mouse to look · click a desk or card';
  }
  if (TV) { showHint(); setTimeout(() => hopTo({ row: 0, col: 1 }), 300); }
  else if (touch) showHint();
  else { $('start').hidden = false; }

  /* ---------- loop ---------- */
  let last = performance.now(), clock = 0, acc = 0, hoverTick = 0, deskTick = 0, dayTick = 0, lastFrame = 0;
  const minFrame = LOW ? 1000 / 31 : 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (minFrame && now - lastFrame < minFrame) return;
    lastFrame = now;
    const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt; acc += dt;
    if (glide) {
      const k = Math.min(1, (now - glide.t0) / glide.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(glide.p0, glide.p1, e); camera.quaternion.slerpQuaternions(glide.q0, glide.q1, e);
      if (k >= 1) glide = null;
    }
    if (!panelOpen) move(dt);
    // idle auto-tour (TV mode): Needs Tim desks first, then boards, then the rest
    if (TV && !panelOpen && !tour && now - lastInput > L.TOUR_IDLE_MS) tour = { list: L.tourOrder(targets, bots()), i: -1, until: 0 };
    if (tour && now > tour.until) {
      tour.i = (tour.i + 1) % tour.list.length; const s = tour.list[tour.i];
      const r = rows.findIndex(r => r.includes(s.target)); hopPos = { row: r, col: rows[r].indexOf(s.target) };
      focusTarget(s.target); glideTo(s.target.view, 1600); tour.until = now + s.dwellMs;
    }
    if (now - hoverTick > 90) {
      hoverTick = now;
      if (!TV || !hop) { const p = controls.isLocked ? pick(0, 0) : hoverAt ? pick(...hoverAt) : null; if (!TV || p) setHover(p); }
    }
    if (pages() > 1 && clock - pageAt > 12) { page++; pageAt = clock; boardDirty = true; }
    if (boardDirty) drawBoards();
    if (now - deskTick > 300) { deskTick = now; desks.forEach(d => drawDeskIf(d)); }
    if (now - dayTick > 60000) { dayTick = now; applyDaylight(); }
    let ai = 0; const p = L.pulse(clock, reducedMQ.matches);
    for (const d of desks) { const b = botByName(d.name); if (b && L.statusStyle(b.status).alert && S.state !== 'failed') { d.bulbMat.emissiveIntensity = 0.6 + 1.6 * p; if (ai < alertLights.length) { const l = alertLights[ai++]; l.position.set(d.x + 0.63, 1.3, d.z - 0.1); l.intensity = 2.5 * p + 0.6; } } else d.bulbMat.emissiveIntensity = 1.5; }
    for (; ai < alertLights.length; ai++) alertLights[ai].intensity = 0;
    for (const c of chars.values()) updateChar(c, dt);
    updateLabels();
    renderer.render(scene, camera);
    T.frames++;
  }
  const pages = () => Math.max(1, Math.ceil(L.buildBoard(items()).length / 2));
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(fitRatio()); renderer.setSize(innerWidth, innerHeight); });
  reducedMQ.addEventListener && reducedMQ.addEventListener('change', () => { boardDirty = true; });
  requestAnimationFrame(frame);

  return {
    controls, goToBot,
    refresh() { ensureChars(); updateConvos(); boardDirty = true; desks.forEach(d => drawDeskIf(d, true)); },
    info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, chars: chars.size, desks: desks.length,
      poses: [...chars.values()].map(c => c.name + ':' + c.pose), lights: scene.children.filter(o => o.isLight).length })
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
