/* Canvas drawing for screen faces: desk monitors (3 LOD levels), the project board, the AI usage wall and the
   Needs Tim board. Text only from the data; colour only for state, always with a glyph and a word. */
import { drawAvatar } from './avatars.js';
const L = window.OfficeLogic;
const C = L.COLORS;
const SANS = "'Inter PE', system-ui, sans-serif", MONO = "'Plex Mono', ui-monospace, monospace";
const TONE = { working: C.working, idle: C.idle, alert: C.alert, info: C.info, stale: C.stale };
const toneOf = st => (st.alert ? C.alert : st.status === 'working' ? C.working : C.idle);

export function fit(ctx, text, maxW) {
  text = String(text || '');
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1; }
  return text.slice(0, lo).trimEnd() + '…';
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function asOfText(state, iso) {
  if (state === 'failed') return { text: '⚠ NO DATA', color: C.alert };
  if (state === 'stale') return { text: '? Data as of ' + L.hhmm(iso), color: C.stale };
  return { text: 'Data as of ' + L.hhmm(iso), color: '#c9ccd2' };
}
function exampleTag(ctx, x, y, s) {
  ctx.font = `800 ${s}px ${SANS}`; const w = ctx.measureText('EXAMPLE DATA').width + s;
  ctx.fillStyle = C.stale; rr(ctx, x, y - s, w, s * 1.35, 4); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillText('EXAMPLE DATA', x + s / 2, y + s * 0.1); return w;
}

/* ---------- desk monitor ---------- */
export function drawDesk(ctx, W, H, o) {
  // o: { bot, lod, now, items, demo, frozen, usage, state, allItems, mode: L.monitorMode(bot, activity) }
  const b = o.bot, st = L.statusStyle(b.status), tone = o.frozen ? C.idle : toneOf(st);
  const s = W / 640;
  ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0, 0, W, H);
  // window chrome
  ctx.fillStyle = '#1e2024'; ctx.fillRect(0, 0, W, 34 * s);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc((18 + i * 18) * s, 17 * s, 5 * s, 0, 7); ctx.fill(); });
  ctx.fillStyle = '#9aa0a8'; ctx.font = `500 ${15 * s}px ${MONO}`;
  const mode = o.mode || 'terminal';
  if (mode === 'game' && o.lod !== 'far') return drawGame(ctx, W, H, s, o.now, b.bot);
  if (mode === 'mirror' && o.image) { drawImageFit(ctx, o.image, 0, 0, W, H); return stamp(ctx, W, H, s, o.screenWhy); }
  if (mode === 'president' && o.lod !== 'far') return presidentSplit(ctx, W, H, s, o);
  if (mode === 'routine' && o.lod !== 'far') { ctx.fillStyle = C.working; ctx.font = `800 ${46 * s}px ${SANS}`; ctx.fillText(fit(ctx, '▶ ' + b.routine.name, W - 44 * s), 22 * s, H / 2 - 10 * s);
    ctx.fillStyle = '#c9ccd2'; ctx.font = `600 ${30 * s}px ${SANS}`; ctx.fillText('running' + (b.routine.started_at ? ' · started ' + L.etClock(Date.parse(b.routine.started_at)) + ' ET' : ''), 22 * s, H / 2 + 40 * s); return; }
  const app = { checksheet: 'Forge checksheet', usage: 'Usage board', screen: (b.screen && b.screen.title) || 'app' }[mode] || 'terminal';
  ctx.fillText(fit(ctx, b.bot.toLowerCase().replace(/\s+/g, '-') + ' — ' + app, 420 * s), 74 * s, 22 * s);
  if (o.demo) { ctx.textAlign = 'left'; exampleTag(ctx, W - 150 * s, 23 * s, 13 * s); }
  // state strip
  ctx.fillStyle = tone; ctx.fillRect(0, H - 8 * s, W, 8 * s);
  if (o.lod === 'far') {
    ctx.fillStyle = tone; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${200 * s}px ${SANS}`; ctx.fillText(o.frozen ? '?' : st.glyph, W / 2, H / 2 + 14 * s);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; return;
  }
  if (o.lod === 'mid') {
    ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${62 * s}px ${SANS}`; ctx.textAlign = 'center';
    ctx.fillText(fit(ctx, b.bot, W - 40 * s), W / 2, H / 2 - 4 * s);
    ctx.fillStyle = tone; ctx.font = `800 ${50 * s}px ${SANS}`;
    ctx.fillText((o.frozen ? '? ' : st.glyph + ' ') + (o.frozen ? 'NO DATA' : st.word), W / 2, H / 2 + 66 * s);
    ctx.textAlign = 'left'; return;
  }
  // near: 3 fixed lines
  const x0 = 22 * s, maxW = W - 44 * s;
  ctx.font = `800 ${38 * s}px ${SANS}`; ctx.fillStyle = '#f1f2f4';
  const nm = fit(ctx, b.bot, 300 * s); ctx.fillText(nm, x0, 80 * s);
  const nw = ctx.measureText(nm).width;
  ctx.fillStyle = tone; ctx.font = `800 ${32 * s}px ${SANS}`;
  ctx.fillText(fit(ctx, (o.frozen ? '? NO DATA' : st.glyph + ' ' + st.word), maxW - nw - 20 * s), x0 + nw + 18 * s, 80 * s);
  ctx.fillStyle = '#e0e3e8'; ctx.font = `600 ${30 * s}px ${SANS}`;
  ctx.fillText(fit(ctx, b.task || '(no task)', maxW), x0, 124 * s);
  ctx.fillStyle = '#a9aeb6'; ctx.font = `500 ${27 * s}px ${SANS}`;
  ctx.fillText(fit(ctx, (b.last_action || '(no last action)') + ' · ' + L.relTime(b.last_action_at, o.now), maxW), x0, 164 * s);
  ctx.strokeStyle = '#2b2e33'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x0, 182 * s); ctx.lineTo(W - x0, 182 * s); ctx.stroke();
  if (mode === 'checksheet') return checksheet(ctx, W, H, s, o.allItems, o.now);
  if (mode === 'usage') return miniUsage(ctx, W, H, s, o.usageRows, o.now);
  if (mode === 'audit') return miniAudit(ctx, W, H, s, b.audit, o.now);
  if (mode === 'replay' && o.replay) { ctx.fillStyle = C.info; ctx.font = `800 ${24 * s}px ${SANS}`; ctx.fillText('recent · ' + o.replay.min + 'm ago', 22 * s, 214 * s);
    ctx.fillStyle = '#e0e3e8'; ctx.font = `600 ${26 * s}px ${MONO}`; wrap(ctx, o.replay.text, 22 * s, 252 * s, W - 44 * s, 32 * s); return; }
  if (mode === 'screen') return miniApp(ctx, W, H, s, b.screen, o.now);
  // terminal: this bot's own items and question, from the data only
  ctx.font = `500 ${20 * s}px ${MONO}`;
  const lines = [];
  for (const it of o.items) { const w = L.statusWord(it); lines.push({ t: '$ ' + L.cardTitle(it), c: '#d7dae0' }, { t: '  ' + it.priority + ' · ' + w.glyph + ' ' + w.word, c: TONE[w.tone] }); }
  if (b.question) lines.push({ t: '? ' + b.question, c: C.alert });
  if (!lines.length) lines.push({ t: '$ no open items for ' + b.bot, c: '#7d828a' });
  lines.push({ t: '$ _', c: '#7d828a' });
  lines.slice(0, 7).forEach((l, i) => { ctx.fillStyle = l.c; ctx.fillText(fit(ctx, l.t, maxW), x0, (214 + i * 25) * s); });
}
/* bots[].screen as a mini app window: title bar, up to 6 lines, "updated" time. Text only from the data. */
function miniApp(ctx, W, H, s, scr, now) {
  const x0 = 22 * s, y0 = 194 * s, w = W - 44 * s, h = H - y0 - 18 * s;
  ctx.fillStyle = '#16181c'; rr(ctx, x0, y0, w, h, 8 * s); ctx.fill();
  ctx.fillStyle = '#23262c'; rr(ctx, x0, y0, w, 30 * s, 8 * s); ctx.fill(); ctx.fillRect(x0, y0 + 20 * s, w, 10 * s);
  ctx.fillStyle = '#e9ebef'; ctx.font = `700 ${18 * s}px ${SANS}`; ctx.fillText(fit(ctx, scr.title || 'Screen', w - 150 * s), x0 + 12 * s, y0 + 21 * s);
  if (scr.updated_at) { ctx.textAlign = 'right'; ctx.fillStyle = '#9aa0a8'; ctx.font = `500 ${15 * s}px ${SANS}`; ctx.fillText(L.relTime(scr.updated_at, now), x0 + w - 12 * s, y0 + 21 * s); ctx.textAlign = 'left'; }
  ctx.font = `500 ${19 * s}px ${MONO}`; ctx.fillStyle = '#d7dae0';
  scr.lines.forEach((l, i) => ctx.fillText(fit(ctx, l, w - 24 * s), x0 + 12 * s, y0 + (56 + i * 26) * s));
}
/* Idle break: a tiny side-scroller (ambient, not data), animated from the clock. */
function drawGame(ctx, W, H, s, now, seed) {
  const t = now / 1000, gy = H * 0.78;
  const sky = ctx.createLinearGradient(0, 34 * s, 0, gy); sky.addColorStop(0, '#1b2a6b'); sky.addColorStop(1, '#4a3b8f');
  ctx.fillStyle = sky; ctx.fillRect(0, 34 * s, W, gy - 34 * s);
  ctx.fillStyle = '#9aa0a8'; ctx.font = `500 ${15 * s}px ${MONO}`; ctx.fillText('break — pixel run (idle)', 74 * s, 22 * s);
  ctx.fillStyle = '#ffffff55'; for (let k = 0; k < 14; k++) { const x = ((k * 97 + seed.length * 13) % W - t * 12 * s % W + W) % W; ctx.fillRect(x, (50 + (k * 37) % 120) * s, 3 * s, 3 * s); }
  ctx.fillStyle = '#2bd46a'; ctx.fillRect(0, gy, W, H - gy);
  ctx.fillStyle = '#1a9a4c'; for (let x = -((t * 160 * s) % (40 * s)); x < W; x += 40 * s) ctx.fillRect(x, gy, 20 * s, 8 * s);
  const period = 1.6, ph = (t % period) / period, ox = W - ph * (W + 80 * s);
  ctx.fillStyle = '#ff5a5a'; ctx.fillRect(ox, gy - 46 * s, 30 * s, 46 * s);
  const jump = Math.max(0, Math.sin(Math.min(1, Math.max(0, (ph - 0.62) / 0.3)) * Math.PI)) * 96 * s;
  ctx.fillStyle = '#ffd23f'; rr(ctx, 120 * s, gy - 44 * s - jump, 40 * s, 44 * s, 6 * s); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(146 * s, gy - 34 * s - jump, 6 * s, 8 * s);
  ctx.fillStyle = '#fff'; ctx.font = `800 ${24 * s}px ${MONO}`; ctx.textAlign = 'right'; ctx.fillText('SCORE ' + String(Math.floor(t * 7) % 100000).padStart(5, '0'), W - 20 * s, 66 * s); ctx.textAlign = 'left';
}
/* Conference whiteboard: ambient "New skills" doodle, or the meeting title from the data. */
export function drawWhiteboard(ctx, W, H, o) {
  ctx.fillStyle = '#f4f5f2'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c9ccc6'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.fillStyle = o.meeting ? '#1f4fb8' : '#1d7a3c'; ctx.font = `800 ${H * 0.2}px ${SANS}`;
  ctx.fillText(fit(ctx, o.meeting ? o.meeting.title : 'New skills', W - 60), 30, H * 0.3);
  ctx.font = `600 ${H * 0.1}px ${SANS}`; ctx.fillStyle = '#333';
  const lines = o.meeting ? ['Meeting · ' + o.meeting.seated.length + ' at the table', ...o.meeting.seated.slice(0, 3)] : ['✓ read the task twice', '✓ small PRs, green checks', '✓ ask Tim early'];
  lines.forEach((l, i) => ctx.fillText(fit(ctx, l, W - 60), 36, H * (0.5 + i * 0.14)));
  if (o.demo && o.meeting) exampleTag(ctx, W - 230, H * 0.92, 22);
}
function drawImageFit(ctx, img, x, y, w, h) { const k = Math.min(w / img.width, h / img.height), iw = img.width * k, ih = img.height * k; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); }
function stamp(ctx, W, H, s, text) { if (!text) return; ctx.font = `700 ${16 * s}px ${SANS}`; const tw = ctx.measureText(text).width + 16 * s; ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(W - tw - 6 * s, H - 30 * s, tw, 24 * s); ctx.fillStyle = '#e6e9ee'; ctx.fillText(text, W - tw + 2 * s, H - 12 * s); }
/* President: LEFT = Tim-President chat (canvas text only, newest at bottom), RIGHT = mirrored screen or the checksheet fallback */
function presidentSplit(ctx, W, H, s, o) {
  const half = W / 2, top = 40 * s;
  ctx.fillStyle = '#121418'; ctx.fillRect(0, top, half - 2 * s, H - top);
  ctx.fillStyle = '#9fe8f5'; ctx.font = `800 ${20 * s}px ${SANS}`; ctx.fillText('Tim ↔ President', 12 * s, top + 26 * s);
  const chat = o.chat || [];
  if (!chat.length) { ctx.fillStyle = '#8f96a0'; ctx.font = `600 ${20 * s}px ${SANS}`; ctx.fillText(o.chatErr || 'Chat not published yet', 12 * s, top + 64 * s); }
  else { let y = H - 16 * s; ctx.font = `500 ${17 * s}px ${SANS}`;
    for (let k = chat.length - 1; k >= 0 && y > top + 50 * s; k--) { const m = chat[k];
      ctx.fillStyle = m.from === 'Tim' ? '#7fd0ff' : '#c7f0c9'; ctx.fillText(fit(ctx, L.etClock(Date.parse(m.at)) + ' ' + m.from + ': ' + m.text, half - 26 * s), 12 * s, y); y -= 24 * s; } }
  ctx.fillStyle = '#2b2f35'; ctx.fillRect(half - 2 * s, top, 4 * s, H - top);
  if (o.image) { drawImageFit(ctx, o.image, half + 2 * s, top, half - 2 * s, H - top); stamp(ctx, W, H, s, o.screenWhy); return; }
  ctx.fillStyle = '#9aa0a8'; ctx.font = `700 ${16 * s}px ${SANS}`; ctx.fillText(fit(ctx, (o.screenWhy || 'Screen offline') + ' · checksheet', half - 24 * s), half + 12 * s, top + 26 * s);
  L.sortItems((o.allItems || []).filter(i => L.columnFor(i) !== 'done')).slice(0, 11).forEach((it, i) => { const w = L.statusWord(it);
    ctx.font = `800 ${15 * s}px ${SANS}`; ctx.fillStyle = TONE[w.tone] || '#ccc'; ctx.fillText(w.glyph, half + 12 * s, top + (58 + i * 28) * s);
    ctx.font = `600 ${17 * s}px ${SANS}`; ctx.fillStyle = '#e3e5e9'; ctx.fillText(fit(ctx, L.cardTitle(it), half - 50 * s), half + 32 * s, top + (58 + i * 28) * s); });
}
function miniAudit(ctx, W, H, s, a, now) {
  const stale = L.auditStale(a, now), x0 = 22 * s;
  ctx.font = `700 ${22 * s}px ${SANS}`; ctx.fillStyle = stale ? C.stale : '#c9ccd2';
  ctx.fillText((stale ? '? ' : '') + 'Last audit ' + (a.last_at ? L.etClock(Date.parse(a.last_at)) + ' ET (' + L.waitingMinutes(a.last_at, now) + 'm ago)' : 'time unknown') + (stale ? ' · stale' : ''), x0, 210 * s);
  a.checks.forEach((c, i) => { const y = (244 + i * 30) * s; ctx.font = `800 ${22 * s}px ${SANS}`;
    ctx.fillStyle = c.value === 'ok' ? C.working : c.value === 'flag' ? C.alert : C.idle; ctx.fillText(c.value === 'ok' ? '✓' : c.value === 'flag' ? '⚠' : '?', x0, y);
    ctx.fillStyle = '#e0e3e8'; ctx.font = `600 ${22 * s}px ${SANS}`; ctx.fillText(c.label, x0 + 34 * s, y); });
  ctx.fillStyle = '#c9ccd2'; ctx.font = `700 ${20 * s}px ${SANS}`; ctx.fillText('Findings sent to President: ' + (a.findings_sent == null ? '?' : a.findings_sent), x0, 372 * s);
}
function checksheet(ctx, W, H, s, items, now) {
  const sorted = L.sortItems(items || []);
  ctx.font = `700 ${18 * s}px ${SANS}`; ctx.fillStyle = '#8f949c';
  ctx.fillText('PRIORITY', 22 * s, 206 * s); ctx.fillText('ITEM', 130 * s, 206 * s); ctx.fillText('OWNER', 410 * s, 206 * s); ctx.fillText('STATUS', 520 * s, 206 * s);
  if (!sorted.length) { ctx.fillStyle = '#7d828a'; ctx.fillText('No items yet', 22 * s, 236 * s); return; }
  sorted.slice(0, 7).forEach((it, i) => {
    const y = (232 + i * 24) * s, w = L.statusWord(it), pb = L.priorityBadge(it.priority);
    ctx.font = `800 ${15 * s}px ${SANS}`; ctx.fillStyle = pb.loud ? C.alert : '#c6c9cf'; ctx.fillText(pb.text, 22 * s, y);
    ctx.font = `600 ${17 * s}px ${SANS}`; ctx.fillStyle = '#e3e5e9'; ctx.fillText(fit(ctx, L.cardTitle(it), 270 * s), 130 * s, y);
    ctx.fillStyle = '#b6bac1'; ctx.fillText(fit(ctx, it.owner, 100 * s), 410 * s, y);
    ctx.font = `800 ${15 * s}px ${SANS}`; ctx.fillStyle = TONE[w.tone]; ctx.fillText(w.glyph + ' ' + w.word, 520 * s, y);
  });
  if (sorted.length > 7) { ctx.fillStyle = '#8f949c'; ctx.font = `600 ${15 * s}px ${SANS}`; ctx.fillText('+' + (sorted.length - 7) + ' more', 22 * s, 404 * s); }
}
function miniUsage(ctx, W, H, s, rows, now) {
  const sv = rows || [];
  if (!sv.length) { ctx.fillStyle = '#7d828a'; ctx.font = `600 ${22 * s}px ${SANS}`; ctx.fillText('No usage readings yet', 22 * s, 236 * s); return; }
  sv.slice(0, 3).forEach((u, i) => {
    const x = (22 + i * 204) * s, w = L.usageWord(u.pct_used), col = TONE[w.tone];
    ctx.fillStyle = '#e3e5e9'; ctx.font = `700 ${20 * s}px ${SANS}`; ctx.fillText(fit(ctx, u.name, 180 * s), x, 214 * s);
    ctx.fillStyle = col; ctx.font = `800 ${50 * s}px ${SANS}`; ctx.fillText(u.pct_used == null ? '—' : Math.round(u.pct_used) + '%', x, 272 * s);
    ctx.font = `800 ${17 * s}px ${SANS}`; ctx.fillText(w.glyph + ' ' + w.word, x, 300 * s);
    ctx.fillStyle = '#2b2e33'; ctx.fillRect(x, 314 * s, 180 * s, 10 * s);
    ctx.fillStyle = col; ctx.fillRect(x, 314 * s, 180 * s * (u.pct_used || 0) / 100, 10 * s);
    ctx.fillStyle = '#a9aeb6'; ctx.font = `500 ${16 * s}px ${SANS}`;
    ctx.fillStyle = u.stale ? C.stale : '#a9aeb6'; ctx.fillText(fit(ctx, (u.stale ? '? stale · ' : '') + u.measured.replace('Measured ', ''), 190 * s), x, 348 * s);
    ctx.fillStyle = '#a9aeb6'; ctx.fillText(fit(ctx, u.next.replace('Next check in ', 'next '), 190 * s), x, 372 * s);
  });
}
function resetText(iso, now) {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '?';
  const d = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const days = Math.round((t - now) / 86400000);
  return d + (days >= 0 ? ' · in ' + days + (days === 1 ? ' day' : ' days') : ' · passed');
}

/* ---------- Forge checksheet board: project tabs, Needs Tim | In progress | Queued | Done (collapsed), paged columns ---------- */
export function drawBoard(ctx, W, H, o) {
  // o: { cols: L.boardView(...), tabs, tab, page, state, ageText, demo, highlight, glow, focusId }
  const s = W / 2048, hits = [];
  ctx.fillStyle = '#0f1114'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${50 * s}px ${SANS}`; ctx.textBaseline = 'alphabetic';
  ctx.fillText('FORGE CHECKSHEET', 36 * s, 64 * s);
  let x = 36 * s + ctx.measureText('FORGE CHECKSHEET').width + 22 * s;
  if (o.demo) exampleTag(ctx, x, 58 * s, 24 * s);
  ctx.textAlign = 'right'; ctx.fillStyle = o.state === 'failed' ? C.alert : o.state === 'stale' ? C.stale : '#9fe8f5'; ctx.font = `700 ${32 * s}px ${SANS}`;
  ctx.fillText(o.state === 'failed' ? '⚠ data feed down' : (o.state === 'stale' ? '? ' : '') + (o.ageText || ''), W - 36 * s, 62 * s); ctx.textAlign = 'left';
  // tabs
  let tx = 36 * s; const ty = 86 * s, th = 46 * s;
  for (const t of o.tabs || ['All']) {
    ctx.font = `700 ${26 * s}px ${SANS}`; const tw = ctx.measureText(t).width + 34 * s, on = t === o.tab;
    ctx.fillStyle = on ? '#123a44' : '#1a1d22'; rr(ctx, tx, ty, tw, th, 10 * s); ctx.fill();
    ctx.strokeStyle = on ? '#37e0ff' : '#30343a'; ctx.lineWidth = 2 * s; ctx.stroke();
    ctx.fillStyle = on ? '#dffaff' : '#b6bac1'; ctx.fillText(t, tx + 17 * s, ty + 32 * s);
    hits.push({ x: tx / W, y: ty / H, w: tw / W, h: th / H, tab: t }); tx += tw + 12 * s;
  }
  const top = ty + th + 18 * s, colW = (W - 72 * s) / 4, headH = 48 * s, cardH = 92 * s, gap = 10 * s;
  const fit = Math.max(1, Math.floor((H - top - headH - 44 * s) / (cardH + gap)));
  let pages = 1;
  for (const c of o.cols) if (!c.collapsed) pages = Math.max(pages, Math.ceil(c.cards.length / fit));
  const page = (o.page || 0) % pages;
  o.cols.forEach((c, ci) => {
    const cx = 36 * s + ci * colW, cw = colW - 18 * s;
    ctx.fillStyle = c.id === 'needs_tim' ? C.alert : c.id === 'done' ? '#8b9099' : '#c6c9cf'; ctx.font = `800 ${30 * s}px ${SANS}`;
    ctx.fillText((c.id === 'needs_tim' ? '⚠ ' : c.id === 'done' ? '✓ ' : '') + c.label + ' (' + c.total + ')', cx + 4 * s, top + 32 * s);
    if (ci) { ctx.fillStyle = '#22262b'; ctx.fillRect(cx - 10 * s, top, 2 * s, H - top - 30 * s); }
    const y0 = top + headH;
    if (c.collapsed) {
      ctx.fillStyle = '#1a1d22'; rr(ctx, cx, y0, cw, 70 * s, 10 * s); ctx.fill(); ctx.fillStyle = '#9aa0a8'; ctx.font = `700 ${24 * s}px ${SANS}`;
      ctx.fillText(c.total ? c.total + ' done · tap to expand' : 'nothing done yet', cx + 16 * s, y0 + 44 * s);
      hits.push({ x: cx / W, y: y0 / H, w: cw / W, h: 70 * s / H, done: true }); return;
    }
    const slice = c.cards.slice(page * fit, page * fit + fit);
    if (!c.total && c.id === 'needs_tim') { ctx.fillStyle = '#7fd9a0'; ctx.font = `700 ${26 * s}px ${SANS}`; ctx.fillText('Nothing needs Tim ✓', cx + 8 * s, y0 + 40 * s); }
    slice.forEach((it, k) => {
      const y = y0 + k * (cardH + gap), hl = o.highlight && o.highlight.has(it.id), glow = o.glow && o.glow.has(it.id), focus = o.focusId === it.id, nt = c.id === 'needs_tim';
      ctx.save(); if (nt || glow) { ctx.shadowColor = glow ? C.focus : C.alert; ctx.shadowBlur = (glow ? 30 : 16) * s; }
      ctx.fillStyle = nt ? '#2a1013' : glow ? '#2a2140' : '#1a1d22'; rr(ctx, cx, y, cw, cardH, 9 * s); ctx.fill(); ctx.restore();
      ctx.lineWidth = (focus ? 6 : hl || glow ? 4 : 1.5) * s; ctx.strokeStyle = focus || hl || glow ? C.focus : nt ? C.alert : '#30343a'; rr(ctx, cx, y, cw, cardH, 9 * s); ctx.stroke();
      const pb = L.priorityBadge(it.priority); ctx.font = `800 ${18 * s}px ${SANS}`; const bw = ctx.measureText(pb.text).width + 12 * s;
      ctx.fillStyle = pb.loud ? '#b3161c' : 'transparent'; rr(ctx, cx + 10 * s, y + 9 * s, bw, 24 * s, 4 * s); ctx.fill(); ctx.strokeStyle = pb.loud ? '#ff6b6b' : '#7f858d'; ctx.lineWidth = 1.5 * s; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText(pb.text, cx + 16 * s, y + 27 * s);
      ctx.font = `700 ${23 * s}px ${SANS}`; ctx.fillStyle = '#eef0f3'; ctx.fillText(fitText(ctx, L.cardTitle(it), cw - bw - 30 * s), cx + bw + 20 * s, y + 28 * s);
      if (it.note) { ctx.font = `500 ${18 * s}px ${SANS}`; ctx.fillStyle = '#8f96a0'; ctx.fillText(fitText(ctx, it.note, cw - 24 * s), cx + 12 * s, y + 54 * s); }
      drawAvatar(ctx, it.owner, cx + 22 * s, y + 75 * s, 22 * s);
      ctx.font = `600 ${19 * s}px ${SANS}`; ctx.fillStyle = '#b6bac1'; ctx.fillText(fitText(ctx, it.owner || '(no owner)', cw * 0.4), cx + 40 * s, y + 82 * s);
      const w = L.statusWord(it); ctx.textAlign = 'right'; ctx.font = `800 ${17 * s}px ${SANS}`; ctx.fillStyle = TONE[w.tone] || '#ccc';
      ctx.fillText(fitText(ctx, w.glyph + ' ' + w.word, cw * 0.55), cx + cw - 10 * s, y + 82 * s); ctx.textAlign = 'left';
      hits.push({ x: cx / W, y: y / H, w: cw / W, h: cardH / H, id: it.id });
    });
    const rest = c.cards.length - (page * fit + slice.length) + c.more;
    if (rest > 0) { const y = y0 + fit * (cardH + gap) + 18 * s; ctx.fillStyle = '#9aa0a8'; ctx.font = `700 ${22 * s}px ${SANS}`; ctx.fillText('+' + rest + ' more · open the board', cx + 8 * s, y); hits.push({ x: cx / W, y: (y - 22 * s) / H, w: cw / W, h: 30 * s / H, more: c.id }); }
  });
  if (pages > 1) { ctx.textAlign = 'right'; ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${22 * s}px ${SANS}`; ctx.fillText('Page ' + (page + 1) + '/' + pages, W - 36 * s, H - 12 * s); ctx.textAlign = 'left'; }
  hits.pages = pages;
  return hits;
}
const fitText = (ctx, t, w) => fit(ctx, t, w);
function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(/\s+/); let line = '', n = 0;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y + n * lh); line = w; n++; } else line = t;
  }
  ctx.fillText(fit(ctx, line, maxW), x, y + n * lh);
}

/* ---------- AI usage wall: latest reading per provider, "Measured h:mm ET", live "Next check in", stale mark ---------- */
export function drawUsage(ctx, W, H, o) {
  // o: { rows: L.usageRows(...), now, demo, failed }
  const s = W / 1024;
  ctx.fillStyle = '#0f1114'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${44 * s}px ${SANS}`; ctx.fillText('AI USAGE', 30 * s, 60 * s);
  if (o.demo) exampleTag(ctx, 250 * s, 54 * s, 20 * s);
  const rows = o.rows || [];
  if (!rows.length) { ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${30 * s}px ${SANS}`; ctx.fillText('Waiting for the first usage reading…', 30 * s, 140 * s); return; }
  ctx.textAlign = 'right'; ctx.font = `600 ${22 * s}px ${SANS}`; ctx.fillStyle = '#9aa0a8'; ctx.fillText(rows[0].source, W - 30 * s, 56 * s); ctx.textAlign = 'left';
  const rowH = (H - 90 * s) / Math.max(3, rows.length);
  rows.slice(0, 4).forEach((u, i) => {
    const y = 84 * s + i * rowH, w = L.usageWord(u.pct_used), col = TONE[w.tone];
    ctx.fillStyle = '#22262b'; ctx.fillRect(24 * s, y, W - 48 * s, 2 * s);
    ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${38 * s}px ${SANS}`; ctx.fillText(u.name, 34 * s, y + 48 * s);
    const nw = ctx.measureText(u.name).width;
    ctx.fillStyle = col; ctx.font = `800 ${26 * s}px ${SANS}`; ctx.fillText(w.glyph + ' ' + w.word + (u.stale ? '  ? STALE' : ''), 52 * s + nw, y + 46 * s);
    ctx.fillStyle = '#2b2e33'; ctx.fillRect(34 * s, y + 64 * s, 560 * s, 18 * s);
    ctx.fillStyle = col; ctx.fillRect(34 * s, y + 64 * s, 560 * s * (u.pct_used || 0) / 100, 18 * s);
    ctx.fillStyle = u.stale ? C.stale : '#a9aeb6'; ctx.font = `600 ${22 * s}px ${SANS}`;
    ctx.fillText(fit(ctx, u.measured + ' · ' + u.next, 600 * s), 34 * s, y + 112 * s);
    ctx.textAlign = 'right'; ctx.fillStyle = col; ctx.font = `800 ${92 * s}px ${SANS}`;
    ctx.fillText(u.pct_used == null ? '—' : Math.round(u.pct_used) + '%', W - 120 * s, y + 100 * s);
    ctx.font = `700 ${24 * s}px ${SANS}`; ctx.fillText('used', W - 34 * s, y + 70 * s); ctx.textAlign = 'left';
  });
}

/* ---------- Needs Tim board (left wall) ---------- */
export function drawNeeds(ctx, W, H, o) {
  // o: { entries:[{glyph,text,tone}], demo, state, sources:[...] }
  const s = W / 1024;
  ctx.fillStyle = '#140d0f'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.alert; ctx.font = `800 ${50 * s}px ${SANS}`; ctx.fillText('⚠ NEEDS TIM', 30 * s, 66 * s);
  ctx.fillStyle = '#f1f2f4'; ctx.textAlign = 'right'; ctx.fillText(String(o.count), W - 30 * s, 66 * s); ctx.textAlign = 'left';
  if (o.demo) exampleTag(ctx, 380 * s, 58 * s, 20 * s);
  ctx.font = `600 ${30 * s}px ${SANS}`;
  const lines = o.entries.length ? o.entries : [{ glyph: '✓', text: 'Nothing needs Tim right now', tone: 'working' }];
  const hits = [];
  lines.slice(0, 11).forEach((e, i) => {
    const y = (122 + i * 50) * s, link = e.target && e.target.href;
    ctx.fillStyle = TONE[e.tone] || '#ddd'; ctx.font = `800 ${30 * s}px ${SANS}`; ctx.fillText(e.glyph, 30 * s, y);
    ctx.font = `600 ${30 * s}px ${SANS}`;
    const tail = link ? (e.target.kind === 'pr' ? '  ↗ PR' : e.target.kind === 'chat' ? '  ↗ chat' : '  ↗') : '';
    const tw = tail ? ctx.measureText(tail).width : 0;
    const txt = fit(ctx, e.text, W - 100 * s - tw);
    ctx.fillStyle = '#eceef1'; ctx.fillText(txt, 76 * s, y);
    if (tail) { ctx.fillStyle = C.info; ctx.fillText(tail, 76 * s + ctx.measureText(txt).width, y); }
    if (o.entries.length) hits.push({ y: (y - 38 * s) / H, h: 50 * s / H, i });
  });
  if (lines.length > 11) { ctx.fillStyle = '#9aa0a8'; ctx.fillText('+' + (lines.length - 11) + ' more — open the list', 76 * s, (122 + 11 * 50) * s); }
  return hits;
}

/* Energy-can wrap: black can, a green claw-scratch "M" drawn procedurally (a lookalike mark, not any brand's artwork or
   wordmark). Drawn twice round the can so it shows from both sides. */
export function drawCanLabel(ctx, W, H, style = 0) { // style 0: black + green mark; 1: white + silver mark (lookalikes)
  ctx.fillStyle = style ? '#f4f5f6' : '#0b0b0c'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#9aa0a6'; ctx.fillRect(0, 0, W, H * 0.05); ctx.fillRect(0, H * 0.95, W, H * 0.05);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const claw = (pts, w0) => { // ragged tapered stroke through pts
    const left = [], right = [];
    pts.forEach(([x, y], i) => { const w = w0 * (1 - i / pts.length * 0.75), j = (rnd() - 0.5) * w0 * 0.35; left.push([x - w + j, y]); right.push([x + w + j, y]); });
    ctx.beginPath(); left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    right.reverse().forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
  };
  for (const cx of [W * 0.25, W * 0.75]) {
    const u = W * 0.16, top = H * 0.2, bot = H * 0.78;
    ctx.fillStyle = style ? '#a9b0b8' : '#5cff3a'; ctx.shadowColor = style ? '#7d858e' : '#3cff2a'; ctx.shadowBlur = W * 0.01;
    const line = (x0, y0, x1, y1) => Array.from({ length: 9 }, (_, i) => [x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8]);
    claw(line(cx - u, top, cx - u * 1.06, bot), W * 0.022);       // left leg
    claw(line(cx - u * 0.92, top, cx, H * 0.6), W * 0.018);       // left diagonal
    claw(line(cx + u * 0.92, top, cx, H * 0.6), W * 0.018);       // right diagonal
    claw(line(cx + u, top, cx + u * 1.06, bot), W * 0.022);       // right leg
    ctx.shadowBlur = 0;
  }
}

/* Small label sign (COFFEE, ENERGY) */
export function drawSign(ctx, W, H, text, bg, fg) {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg; ctx.font = `800 ${H * 0.55}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + 2); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

/* ---------- Automations wall board (3-day schedule summary) and Writer health board ---------- */
const RES_COL = { OK: '#3ddc84', FAIL: '#ff4b4b', SKIP: '#8b9099', EMPTY: '#4aa3ff', STALE: '#ffd23f', UPCOMING: '#3a4250' };
export function drawAutomations(ctx, W, H, o) {
  const s = W / 1024, a = o.auto;
  ctx.fillStyle = '#0f1114'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${40 * s}px ${SANS}`; ctx.fillText('AUTOMATIONS', 28 * s, 56 * s);
  if (o.demo) exampleTag(ctx, 330 * s, 50 * s, 20 * s);
  if (!a || (!a.rows.length && !a.runs.length)) { ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${26 * s}px ${SANS}`; ctx.fillText(o.err || 'Waiting for AUTOMATIONS_STATUS.json', 28 * s, 130 * s); return; }
  const day0 = L.etDayStart(o.now) - 86400000, span = 3 * 86400000, x0 = 150 * s, x1 = W - 24 * s, X = t => x0 + (t - day0) / span * (x1 - x0);
  const ais = [...new Set(a.runs.map(r => r.ai).concat(a.rows.map(r => r.ai)))].slice(0, 7), laneH = Math.min(56 * s, (H - 190 * s) / Math.max(1, ais.length));
  ['Yesterday', 'Today', 'Tomorrow'].forEach((d, k) => { ctx.fillStyle = k === 1 ? '#c9ccd2' : '#7d838b'; ctx.font = `700 ${20 * s}px ${SANS}`; ctx.fillText(d, X(day0 + k * 86400000) + 6 * s, 88 * s); ctx.fillStyle = '#2a2e34'; ctx.fillRect(X(day0 + k * 86400000), 70 * s, 2 * s, H - 80 * s); });
  const bad = L.writerOverlaps(a.runs);
  ais.forEach((ai, i) => { const y = 100 * s + i * laneH;
    ctx.fillStyle = '#e3e5e9'; ctx.font = `700 ${20 * s}px ${SANS}`; ctx.fillText(fit(ctx, ai, x0 - 34 * s), 24 * s, y + laneH * 0.62);
    for (const r of a.runs.filter(r => r.ai === ai)) { const bx = X(r.start), bw = Math.max(3 * s, X(r.end) - bx);
      ctx.fillStyle = RES_COL[r.result] || '#555'; ctx.fillRect(bx, y + 6 * s, bw, laneH - 14 * s);
      if (bad.has(r)) { ctx.strokeStyle = '#ff2a2a'; ctx.lineWidth = 3 * s; ctx.strokeRect(bx, y + 6 * s, bw, laneH - 14 * s); } } });
  const conc = L.concurrencyByHour(a.runs, day0), max = Math.max(1, ...conc), cy = H - 46 * s;
  conc.forEach((n, h) => { ctx.fillStyle = n >= 3 ? '#ff4b4b' : n === 2 ? '#ffd23f' : '#2f6f80'; const bh = 30 * s * n / max; ctx.fillRect(X(day0 + h * 3600000), cy + 30 * s - bh, (x1 - x0) / 72 - 1, bh); });
  ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${16 * s}px ${SANS}`; ctx.fillText('runs / hour', 24 * s, cy + 24 * s);
  ctx.fillStyle = '#37e0ff'; ctx.fillRect(X(o.now), 70 * s, 3 * s, H - 80 * s); // now line
}
export const WRITER_METRICS = [['last_ping', 'Last ping'], ['last_write_age_min', 'Last good write'], ['writes_per_hour', 'Writes / hour'], ['error_rate', 'Errors'], ['timeout_rate', 'Timeouts'], ['lock_waits', 'Lock waits'], ['queue_depth', 'Queue depth']];
export function drawWriterHealth(ctx, W, H, o) {
  const s = W / 768, wh = o.auto && o.auto.writer;
  ctx.fillStyle = '#0f1114'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${38 * s}px ${SANS}`; ctx.fillText('WRITER HEALTH', 24 * s, 52 * s);
  if (o.demo) exampleTag(ctx, 330 * s, 46 * s, 18 * s);
  WRITER_METRICS.forEach(([k, label], i) => { const m = wh && wh[k], y = (96 + i * 56) * s, st = m && m.status;
    ctx.fillStyle = st === 'green' ? '#3ddc84' : st === 'amber' ? '#ffd23f' : st === 'red' ? '#ff4b4b' : '#555a62'; ctx.beginPath(); ctx.arc(36 * s, y - 9 * s, 11 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#e3e5e9'; ctx.font = `700 ${24 * s}px ${SANS}`; ctx.fillText(label, 60 * s, y);
    ctx.textAlign = 'right'; ctx.fillStyle = m && m.value != null && m.source ? '#c9ccd2' : '#7d838b'; ctx.font = `600 ${22 * s}px ${SANS}`;
    ctx.fillText(fit(ctx, m && m.value != null && m.source ? String(typeof m.value === 'object' ? JSON.stringify(m.value) : m.value) : 'no data', 330 * s), W - 24 * s, y); ctx.textAlign = 'left'; });
}
