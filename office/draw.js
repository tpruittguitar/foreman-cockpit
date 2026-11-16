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
  if (mode === 'usage') return miniUsage(ctx, W, H, s, o.usage, o.now);
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
function miniUsage(ctx, W, H, s, usage, now) {
  const sv = (usage && usage.services) || [];
  if (!sv.length) { ctx.fillStyle = '#7d828a'; ctx.font = `600 ${22 * s}px ${SANS}`; ctx.fillText('No usage readings yet', 22 * s, 236 * s); return; }
  sv.slice(0, 3).forEach((u, i) => {
    const x = (22 + i * 204) * s, w = L.usageWord(u.pct_used), col = TONE[w.tone];
    ctx.fillStyle = '#e3e5e9'; ctx.font = `700 ${20 * s}px ${SANS}`; ctx.fillText(fit(ctx, u.name, 180 * s), x, 214 * s);
    ctx.fillStyle = col; ctx.font = `800 ${50 * s}px ${SANS}`; ctx.fillText(u.pct_used == null ? '—' : Math.round(u.pct_used) + '%', x, 272 * s);
    ctx.font = `800 ${17 * s}px ${SANS}`; ctx.fillText(w.glyph + ' ' + w.word, x, 300 * s);
    ctx.fillStyle = '#2b2e33'; ctx.fillRect(x, 314 * s, 180 * s, 10 * s);
    ctx.fillStyle = col; ctx.fillRect(x, 314 * s, 180 * s * (u.pct_used || 0) / 100, 10 * s);
    ctx.fillStyle = '#a9aeb6'; ctx.font = `500 ${16 * s}px ${SANS}`;
    ctx.fillText(u.pct_left == null ? '' : Math.round(u.pct_left) + '% left', x, 348 * s);
    if (u.resets_at) ctx.fillText(fit(ctx, 'Resets ' + resetText(u.resets_at, now), 190 * s), x, 372 * s);
  });
}
function resetText(iso, now) {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return '?';
  const d = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const days = Math.round((t - now) / 86400000);
  return d + (days >= 0 ? ' · in ' + days + (days === 1 ? ' day' : ' days') : ' · passed');
}

/* ---------- project board ---------- */
export function drawBoard(ctx, W, H, o) {
  // o: { rows, state, asOf, demo, page, pages, highlight:Set(itemId), glow:Set(itemId), focusId }
  const s = W / 2048, hits = [];
  ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${54 * s}px ${SANS}`; ctx.textBaseline = 'alphabetic';
  ctx.fillText('PROJECT BOARD', 36 * s, 72 * s);
  let x = 36 * s + ctx.measureText('PROJECT BOARD').width + 22 * s;
  if (o.demo) exampleTag(ctx, x, 66 * s, 26 * s);
  const a = asOfText(o.state, o.asOf);
  ctx.textAlign = 'right'; ctx.fillStyle = a.color; ctx.font = `700 ${36 * s}px ${SANS}`; ctx.fillText(a.text, W - 36 * s, 70 * s);
  if (o.pages > 1) { ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${26 * s}px ${SANS}`; ctx.fillText('Page ' + (o.page + 1) + '/' + o.pages, W - 36 * s, H - 18 * s); }
  ctx.textAlign = 'left';
  const labelW = 210 * s, colW = (W - labelW - 50 * s) / 4, top = 104 * s, headH = 52 * s;
  L.COLUMNS.forEach((c, i) => {
    const cx = labelW + 20 * s + i * colW;
    ctx.fillStyle = c.id === 'needs_tim' ? C.alert : '#c6c9cf'; ctx.font = `800 ${32 * s}px ${SANS}`;
    ctx.fillText((c.id === 'needs_tim' ? '⚠ ' : '') + c.label, cx + 8 * s, top + 36 * s);
    if (i) { ctx.fillStyle = '#25272c'; ctx.fillRect(cx - 4 * s, top, 3 * s, H - top - 40 * s); }
  });
  const rowsTop = top + headH + 8 * s, rowH = (H - rowsTop - 44 * s) / Math.max(1, o.perPage || 2);
  if (!o.rows.length) { ctx.fillStyle = '#7d828a'; ctx.font = `600 ${34 * s}px ${SANS}`; ctx.fillText('No items', labelW, rowsTop + 60 * s); }
  o.rows.forEach((r, ri) => {
    const y0 = rowsTop + ri * rowH;
    ctx.fillStyle = '#25272c'; ctx.fillRect(20 * s, y0 - 4 * s, W - 40 * s, 3 * s);
    ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${34 * s}px ${SANS}`;
    wrap(ctx, r.project, 26 * s, y0 + 44 * s, labelW - 30 * s, 40 * s);
    L.COLUMNS.forEach((c, ci) => {
      const cell = r.cols[c.id], cx = labelW + 20 * s + ci * colW, cardW = colW - 26 * s, cardH = 56 * s, gap = 7 * s;
      cell.cards.forEach((it, k) => {
        const y = y0 + 10 * s + k * (cardH + gap);
        if (y + cardH > y0 + rowH - 34 * s) return;
        const hl = o.highlight && o.highlight.has(it.id), glow = o.glow && o.glow.has(it.id), focus = o.focusId === it.id;
        const nt = c.id === 'needs_tim';
        ctx.save();
        if (nt || glow) { ctx.shadowColor = glow ? C.focus : C.alert; ctx.shadowBlur = (glow ? 36 : 22) * s; }
        ctx.fillStyle = nt ? '#2a1013' : glow ? '#2a2140' : '#1b1d21'; rr(ctx, cx, y, cardW, cardH, 8 * s); ctx.fill();
        ctx.restore();
        ctx.lineWidth = (focus ? 7 : hl || glow ? 4 : nt ? 3 : 1.5) * s;
        ctx.strokeStyle = focus || hl || glow ? C.focus : nt ? C.alert : '#33363c'; rr(ctx, cx, y, cardW, cardH, 8 * s); ctx.stroke();
        const pb = L.priorityBadge(it.priority);
        ctx.font = `800 ${19 * s}px ${SANS}`; const bw = ctx.measureText(pb.text).width + 12 * s;
        ctx.fillStyle = pb.loud ? '#b3161c' : 'transparent'; rr(ctx, cx + 10 * s, y + 8 * s, bw, 24 * s, 4 * s); ctx.fill();
        ctx.strokeStyle = pb.loud ? '#ff6b6b' : '#8a8f97'; ctx.lineWidth = 1.5 * s; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(pb.text, cx + 16 * s, y + 27 * s);
        ctx.font = `700 ${24 * s}px ${SANS}`; ctx.fillStyle = '#eef0f3';
        ctx.fillText(fit(ctx, L.cardTitle(it), cardW - bw - 30 * s), cx + bw + 20 * s, y + 27 * s);
        drawAvatar(ctx, it.owner, cx + 22 * s, y + 42 * s, 24 * s);
        ctx.font = `600 ${20 * s}px ${SANS}`; ctx.fillStyle = '#b6bac1';
        ctx.fillText(fit(ctx, it.owner || '(no owner)', cardW * 0.45), cx + 42 * s, y + 49 * s);
        const w = L.statusWord(it); ctx.textAlign = 'right'; ctx.font = `800 ${19 * s}px ${SANS}`; ctx.fillStyle = TONE[w.tone];
        ctx.fillText(w.glyph + ' ' + w.word, cx + cardW - 10 * s, y + 49 * s); ctx.textAlign = 'left';
        hits.push({ x: cx / W, y: y / H, w: cardW / W, h: cardH / H, id: it.id });
      });
      if (cell.more) {
        const y = y0 + 10 * s + Math.min(cell.cards.length, 5) * (cardH + gap) + 24 * s;
        ctx.fillStyle = '#9aa0a8'; ctx.font = `700 ${24 * s}px ${SANS}`; ctx.fillText('+' + cell.more + ' more', cx + 10 * s, y);
        hits.push({ x: cx / W, y: (y - 24 * s) / H, w: cardW / W, h: 30 * s / H, more: r.project + '|' + c.id });
      }
    });
  });
  return hits;
}
function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(/\s+/); let line = '', n = 0;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y + n * lh); line = w; n++; } else line = t;
  }
  ctx.fillText(fit(ctx, line, maxW), x, y + n * lh);
}

/* ---------- AI usage wall ---------- */
export function drawUsage(ctx, W, H, o) {
  // o: { usage, now, demo, failed }
  const s = W / 1024;
  ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${44 * s}px ${SANS}`; ctx.fillText('AI USAGE', 30 * s, 62 * s);
  if (o.demo) exampleTag(ctx, 250 * s, 56 * s, 20 * s);
  const stale = o.failed || L.usageStale(o.usage, o.now);
  ctx.textAlign = 'right'; ctx.font = `700 ${28 * s}px ${SANS}`;
  ctx.fillStyle = o.failed ? C.alert : stale ? C.stale : '#c9ccd2';
  ctx.fillText(o.failed ? '⚠ NO DATA' : (stale ? '? ' : '') + 'Data as of ' + (o.usage && o.usage.as_of ? L.hhmm(o.usage.as_of) : '--:--'), W - 30 * s, 60 * s);
  ctx.textAlign = 'left';
  const sv = (o.usage && o.usage.services && o.usage.services.length) ? o.usage.services : ['Grok Bot', 'Claude', 'ChatGPT'].map(name => ({ name, pct_used: null, pct_left: null, resets_at: '' }));
  const rowH = (H - 100 * s) / 3;
  sv.slice(0, 3).forEach((u, i) => {
    const y = 96 * s + i * rowH, w = L.usageWord(u.pct_used), col = TONE[w.tone];
    ctx.fillStyle = '#25272c'; ctx.fillRect(24 * s, y, W - 48 * s, 2 * s);
    ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${40 * s}px ${SANS}`; ctx.fillText(u.name, 34 * s, y + 54 * s);
    const nw = ctx.measureText(u.name).width;
    ctx.fillStyle = col; ctx.font = `800 ${30 * s}px ${SANS}`; ctx.fillText(w.glyph + ' ' + w.word, 54 * s + nw, y + 52 * s);
    ctx.fillStyle = '#2b2e33'; ctx.fillRect(34 * s, y + 76 * s, 520 * s, 22 * s);
    ctx.fillStyle = col; ctx.fillRect(34 * s, y + 76 * s, 520 * s * (u.pct_used || 0) / 100, 22 * s);
    ctx.fillStyle = '#a9aeb6'; ctx.font = `600 ${26 * s}px ${SANS}`;
    ctx.fillText(u.resets_at ? 'Resets ' + resetText(u.resets_at, o.now) : (u.note || 'No reset date'), 34 * s, y + 134 * s);
    ctx.textAlign = 'right'; ctx.fillStyle = col; ctx.font = `800 ${104 * s}px ${SANS}`;
    ctx.fillText(u.pct_used == null ? '—' : Math.round(u.pct_used) + '%', W - 150 * s, y + 112 * s);
    ctx.font = `700 ${28 * s}px ${SANS}`; ctx.fillText('used', W - 34 * s, y + 80 * s);
    ctx.fillStyle = '#c9ccd2'; ctx.fillText(u.pct_left == null ? '' : Math.round(u.pct_left) + '% left', W - 34 * s, y + 134 * s);
    ctx.textAlign = 'left';
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
  const lines = o.entries.length ? o.entries : [{ glyph: '✓', text: 'Nothing waiting on Tim', tone: 'idle' }];
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
export function drawCanLabel(ctx, W, H) {
  ctx.fillStyle = '#0b0b0c'; ctx.fillRect(0, 0, W, H);
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
    ctx.fillStyle = '#5cff3a'; ctx.shadowColor = '#3cff2a'; ctx.shadowBlur = W * 0.01;
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
