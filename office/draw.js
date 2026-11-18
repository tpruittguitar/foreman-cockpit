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
  const sub = mode === 'usage' ? L.usageHeader(o.usageRows, o.now) : (b.last_action || '(no last action)') + ' · ' + L.relTime(b.last_action_at, o.now);
  ctx.fillText(fit(ctx, sub, maxW), x0, 164 * s);
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
/* Idle break: a tiny original game on the desk monitor (ambient, not data), animated from the clock. Each bot plays one of three
   lookalike styles (L.gameStyleFor): a retro corridor shooter, a top-down squad shooter, or a fantasy dungeon party. All art is drawn
   here from plain shapes; no real game's art, logos or names. */
function drawGame(ctx, W, H, s, now, seed) {
  const t = now / 1000, style = L.gameStyleFor(seed), top = 34 * s, h = H - top;
  ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, h); ctx.clip();
  if (style === 'squad') gameSquad(ctx, W, H, s, t, top);
  else if (style === 'dungeon') gameDungeon(ctx, W, H, s, t, top);
  else gameCorridor(ctx, W, H, s, t, top);
  ctx.restore();
  ctx.fillStyle = '#9aa0a8'; ctx.font = `500 ${15 * s}px ${MONO}`; ctx.fillText({ corridor: 'break — corridor run', squad: 'break — squad ops', dungeon: 'break — dungeon party' }[style], 74 * s, 22 * s);
}
function gameHud(ctx, W, H, s, text, x) { ctx.fillStyle = '#fff'; ctx.font = `800 ${22 * s}px ${MONO}`; ctx.textAlign = 'right'; ctx.fillText(text, x == null ? W - 16 * s : x, 62 * s); ctx.textAlign = 'left'; }
/* Retro corridor shooter: one-point-perspective hallway rushing past, a blob monster that drifts closer, a pistol with muzzle flash. */
function gameCorridor(ctx, W, H, s, t, top) {
  const cx = W / 2, cy = top + (H - top) * 0.46, hudH = 46 * s, fh = H - hudH - top;
  ctx.fillStyle = '#2a2420'; ctx.fillRect(0, top, W, fh);
  const flow = (t * 0.7) % 1;
  for (let k = 9; k >= 0; k--) { // nested wall frames, far to near
    const z = k + 1 - flow, sc = 1 / (0.35 + z * 0.42), w = W * 0.95 * sc, hh = fh * 0.95 * sc, sh = Math.max(0, 1 - z / 10);
    ctx.fillStyle = `rgb(${Math.round(70 + 70 * sh)},${Math.round(54 + 46 * sh)},${Math.round(44 + 34 * sh)})`; ctx.fillRect(cx - w / 2, cy - hh / 2, w, hh);
    ctx.fillStyle = `rgb(${Math.round(30 + 50 * sh)},${Math.round(38 + 40 * sh)},${Math.round(46 + 40 * sh)})`; ctx.fillRect(cx - w / 2, cy + hh / 2 - hh * 0.28, w, hh * 0.28); // floor band
    ctx.fillStyle = `rgb(${Math.round(24 + 30 * sh)},${Math.round(24 + 30 * sh)},${Math.round(28 + 30 * sh)})`; ctx.fillRect(cx - w / 2, cy - hh / 2, w, hh * 0.12); // ceiling band
    if (k % 3 === 0) { ctx.fillStyle = '#e8c35a'; ctx.fillRect(cx - w / 2 + w * 0.04, cy - hh * 0.16, w * 0.03, hh * 0.12); ctx.fillRect(cx + w / 2 - w * 0.07, cy - hh * 0.16, w * 0.03, hh * 0.12); } // wall lamps
  }
  const ph = (t % 4.2) / 4.2, mz = 1 - ph * 0.8, ms = 0.35 + mz * 0.65, mx = cx + Math.sin(t * 1.3) * 60 * s * mz, my = cy + 20 * s * ms; // monster
  ctx.fillStyle = '#6fbf4a'; ctx.beginPath(); ctx.ellipse(mx, my, 54 * s * ms, 60 * s * ms, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#d93636'; ctx.beginPath(); ctx.arc(mx - 18 * s * ms, my - 14 * s * ms, 8 * s * ms, 0, 7); ctx.arc(mx + 18 * s * ms, my - 14 * s * ms, 8 * s * ms, 0, 7); ctx.fill();
  ctx.fillStyle = '#2b1010'; ctx.fillRect(mx - 20 * s * ms, my + 14 * s * ms, 40 * s * ms, 8 * s * ms);
  const shot = (t * 2.2) % 1 < 0.14; // muzzle flash
  if (shot) { ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.moveTo(cx - 14 * s, H - hudH - 56 * s); ctx.lineTo(cx, H - hudH - 96 * s); ctx.lineTo(cx + 14 * s, H - hudH - 56 * s); ctx.fill(); }
  ctx.fillStyle = '#555a62'; ctx.fillRect(cx - 14 * s, H - hudH - 60 * s, 28 * s, 60 * s); ctx.fillStyle = '#7b818b'; ctx.fillRect(cx - 9 * s, H - hudH - 60 * s, 18 * s, 20 * s);
  ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(cx - 10 * s, cy); ctx.lineTo(cx + 10 * s, cy); ctx.moveTo(cx, cy - 10 * s); ctx.lineTo(cx, cy + 10 * s); ctx.stroke();
  ctx.fillStyle = '#3a3f47'; ctx.fillRect(0, H - hudH, W, hudH); ctx.font = `800 ${24 * s}px ${MONO}`; ctx.fillStyle = '#ff6b5a'; ctx.fillText('HP 100%', 18 * s, H - 14 * s);
  ctx.fillStyle = '#ffd23f'; ctx.fillText('AMMO ' + String(50 - Math.floor(t * 2.2) % 50).padStart(2, '0'), W * 0.4, H - 14 * s); ctx.fillStyle = '#9fe8f5'; ctx.fillText('KILLS ' + String(Math.floor(t / 4.2) % 100).padStart(2, '0'), W * 0.72, H - 14 * s);
}
/* Top-down squad shooter: a four-person squad (blue) advances on swarming crawlers (orange) in a night field, tracers, a drop beacon. */
function gameSquad(ctx, W, H, s, t, top) {
  ctx.fillStyle = '#18221c'; ctx.fillRect(0, top, W, H - top);
  ctx.strokeStyle = '#223127'; ctx.lineWidth = 1; const gx = 48 * s, off = (t * 20 * s) % gx;
  for (let x = -off; x < W; x += gx) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = top + gx - off; y < H; y += gx) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const bx = W * 0.78, by = top + (H - top) * 0.3, pulse = (t % 2) / 2; // drop beacon
  ctx.strokeStyle = `rgba(255,210,63,${1 - pulse})`; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(bx, by, (14 + pulse * 40) * s, 0, 7); ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(bx, by, 6 * s, 0, 7); ctx.fill();
  const sx = W * 0.3 + Math.sin(t * 0.5) * 30 * s, sy = top + (H - top) * 0.62, squad = [[0, 0], [-34, 26], [34, 26], [0, 52]].map(([dx, dy]) => [sx + dx * s, sy + dy * s]);
  const crawlers = []; for (let k = 0; k < 9; k++) { const ang = k * 0.7 + t * 0.18, r = (150 + ((k * 53) % 90) - ((t * 22 + k * 31) % 140)) * s, x = sx + Math.cos(ang) * Math.max(40 * s, r) * 1.6, y = sy + Math.sin(ang) * Math.max(40 * s, r) * 0.9; crawlers.push([x, y]); }
  crawlers.forEach(([x, y], k) => { ctx.fillStyle = '#e0702b'; ctx.beginPath(); ctx.ellipse(x, y, 11 * s, 8 * s, k, 0, 7); ctx.fill(); ctx.fillStyle = '#5a2200'; ctx.fillRect(x - 2 * s, y - 2 * s, 4 * s, 4 * s); });
  const tgt = crawlers[Math.floor(t * 3) % crawlers.length]; // tracers: each squad member fires at a crawler
  squad.forEach(([x, y], k) => { if ((Math.floor(t * 6) + k) % 3 !== 0) return; const c = crawlers[(Math.floor(t * 3) + k) % crawlers.length] || tgt; ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(c[0], c[1]); ctx.stroke(); });
  squad.forEach(([x, y]) => { ctx.fillStyle = '#4aa3ff'; rr(ctx, x - 10 * s, y - 10 * s, 20 * s, 20 * s, 5 * s); ctx.fill(); ctx.fillStyle = '#12304f'; ctx.fillRect(x - 4 * s, y - 14 * s, 8 * s, 6 * s); });
  ctx.fillStyle = '#fff'; ctx.font = `700 ${18 * s}px ${MONO}`; ctx.fillText('SQUAD 4/4', 18 * s, 62 * s); gameHud(ctx, W, H, s, 'KILLS ' + String(Math.floor(t * 4) % 1000).padStart(3, '0'));
  ctx.fillStyle = '#ffffff22'; ctx.fillRect(18 * s, H - 30 * s, 160 * s, 10 * s); ctx.fillStyle = '#4aa3ff'; ctx.fillRect(18 * s, H - 30 * s, 160 * s * (0.55 + 0.4 * Math.sin(t * 0.7)), 10 * s);
}
/* Fantasy dungeon party: a stone room with torches, a horned ogre boss, a party frame with HP bars, a hotbar with cooldown sweeps, a rolling d20, floating damage. */
function gameDungeon(ctx, W, H, s, t, top) {
  ctx.fillStyle = '#241c2c'; ctx.fillRect(0, top, W, H - top);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) { ctx.fillStyle = (r + c) % 2 ? '#2d2438' : '#312840'; ctx.fillRect(c * 56 * s + (r % 2) * 28 * s - 28 * s, top + r * 38 * s, 54 * s, 36 * s); } // brick wall
  const gy = top + (H - top) * 0.7; ctx.fillStyle = '#3a3248'; ctx.fillRect(0, gy, W, H - gy);
  [W * 0.32, W * 0.9].forEach((x, i) => { const f = 1 + 0.2 * Math.sin(t * 9 + i * 2); ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - 3 * s, top + 54 * s, 6 * s, 22 * s); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(x, top + 48 * s, 8 * s, 14 * s * f, 0, 0, 7); ctx.fill(); }); // torches
  const bx = W * 0.62, by = gy - 4 * s, bob = Math.sin(t * 2) * 3 * s; // ogre boss
  ctx.fillStyle = '#5f8f4a'; ctx.beginPath(); ctx.ellipse(bx, by - 46 * s + bob, 46 * s, 54 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#4a7239'; ctx.beginPath(); ctx.arc(bx, by - 112 * s + bob, 28 * s, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8e2cf'; ctx.beginPath(); ctx.moveTo(bx - 24 * s, by - 126 * s + bob); ctx.lineTo(bx - 34 * s, by - 154 * s + bob); ctx.lineTo(bx - 12 * s, by - 134 * s + bob); ctx.moveTo(bx + 24 * s, by - 126 * s + bob); ctx.lineTo(bx + 34 * s, by - 154 * s + bob); ctx.lineTo(bx + 12 * s, by - 134 * s + bob); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(bx - 14 * s, by - 116 * s + bob, 7 * s, 5 * s); ctx.fillRect(bx + 7 * s, by - 116 * s + bob, 7 * s, 5 * s);
  const party = ['#e04a4a', '#4aa3ff', '#4ad07a', '#c27bff']; // fighter, mage, ranger, cleric
  party.forEach((col, i) => { const x = W * 0.12 + i * 42 * s + Math.sin(t * 1.2 + i) * 4 * s, y = gy + 12 * s - (i % 2) * 14 * s; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - 22 * s, 9 * s, 0, 7); ctx.fill(); ctx.fillRect(x - 8 * s, y - 14 * s, 16 * s, 26 * s); });
  const dn = (t * 1.6) % 1; ctx.fillStyle = `rgba(255,120,120,${1 - dn})`; ctx.font = `800 ${22 * s}px ${MONO}`; ctx.fillText(String(7 + Math.floor(t * 1.6) * 3 % 23), bx - 12 * s, by - 150 * s - dn * 30 * s); // damage number
  ctx.fillStyle = '#00000088'; ctx.fillRect(10 * s, top + 8 * s, 118 * s, 64 * s); // party frame
  party.forEach((col, i) => { const y = top + 14 * s + i * 15 * s; ctx.fillStyle = '#ffffff22'; ctx.fillRect(16 * s, y, 104 * s, 9 * s); ctx.fillStyle = col; ctx.fillRect(16 * s, y, 104 * s * (0.5 + 0.45 * Math.abs(Math.sin(t * 0.4 + i * 1.7))), 9 * s); });
  for (let i = 0; i < 6; i++) { const x = W / 2 - 105 * s + i * 36 * s, y = H - 38 * s; ctx.fillStyle = '#000a'; ctx.fillRect(x, y, 32 * s, 32 * s); ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 2 * s; ctx.strokeRect(x, y, 32 * s, 32 * s); ctx.fillStyle = party[i % 4]; ctx.fillRect(x + 10 * s, y + 10 * s, 12 * s, 12 * s); const cd = ((t * 0.5 + i * 0.17) % 1); ctx.fillStyle = '#000b'; ctx.fillRect(x, y, 32 * s, 32 * s * (1 - cd)); } // hotbar
  const roll = Math.floor(t * 0.8) % 20 + 1, spin = (t * 0.8) % 1 < 0.35; // d20
  ctx.fillStyle = '#e8e2cf'; ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3, x = W - 50 * s + Math.cos(a) * 24 * s, y = top + 52 * s + Math.sin(a) * 24 * s; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.fill();
  ctx.fillStyle = '#241c2c'; ctx.font = `800 ${20 * s}px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText(String(spin ? (Math.floor(t * 30) % 20) + 1 : roll), W - 50 * s, top + 60 * s); ctx.textAlign = 'left';
}
/* Conference whiteboard: ambient "New skills" doodle, or the meeting title from the data. */
export function drawWhiteboard(ctx, W, H, o) {
  ctx.fillStyle = '#f4f5f2'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c9ccc6'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, H - 6);
  const sk = !o.meeting && o.skill;
  ctx.fillStyle = o.meeting ? '#1f4fb8' : '#1d7a3c'; ctx.font = `800 ${H * (sk ? 0.15 : 0.2)}px ${SANS}`;
  if (sk) for (let f = 0.15; f > 0.085 && ctx.measureText(sk.title).width > W - 130; f -= 0.01) ctx.font = `800 ${H * f}px ${SANS}`; // long skill names shrink to fit
  ctx.fillText(fit(ctx, o.meeting ? o.meeting.title : sk ? sk.title : 'New skills', W - (sk ? 130 : 60)), 30, H * 0.3);
  ctx.font = `600 ${H * (sk ? 0.085 : 0.1)}px ${SANS}`; ctx.fillStyle = '#333';
  const lines = o.meeting ? ['Meeting · ' + o.meeting.seated.length + ' at the table', ...o.meeting.seated.slice(0, 3)] : sk ? sk.bullets.map(b => '✓ ' + b) : ['✓ read the task twice', '✓ small PRs, green checks', '✓ ask Tim early'];
  lines.forEach((l, i) => ctx.fillText(fit(ctx, l, W - 50), 36, H * (0.5 + i * 0.14)));
  if (sk) { ctx.font = `700 ${H * 0.08}px ${SANS}`; ctx.fillStyle = '#6b7280'; ctx.textAlign = 'right'; ctx.fillText(sk.counter, W - 22, H * 0.3); ctx.textAlign = 'left'; }
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
    ctx.fillStyle = col; ctx.font = `800 ${50 * s}px ${SANS}`; const pct = u.pct_used == null ? '—' : Math.round(u.pct_used) + '%'; ctx.fillText(pct, x, 272 * s);
    if (u.pct_used != null) { const pw = ctx.measureText(pct).width; ctx.font = `700 ${20 * s}px ${SANS}`; ctx.fillText('used', x + pw + 6 * s, 272 * s); }
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
  // Each column pages on its own cycle (L.columnPage); hits.pages = the longest cycle, so the caller knows to keep ticking.
  let pages = 1;
  o.cols.forEach((c, ci) => {
    const cx = 36 * s + ci * colW, cw = colW - 18 * s;
    const pg = c.collapsed ? { items: [], page: 0, pages: 1 } : L.columnPage(c.cards, fit, o.page || 0);
    pages = Math.max(pages, pg.pages);
    ctx.fillStyle = c.id === 'needs_tim' ? C.alert : c.id === 'done' ? '#8b9099' : '#c6c9cf'; ctx.font = `800 ${30 * s}px ${SANS}`;
    ctx.fillText(fitText(ctx, (c.id === 'needs_tim' ? '⚠ ' : c.id === 'done' ? '✓ ' : '') + c.label + ' (' + c.total + ')', cw - (pg.pages > 1 ? 80 * s : 0)), cx + 4 * s, top + 32 * s);
    if (pg.pages > 1) { ctx.textAlign = 'right'; ctx.fillStyle = '#9aa0a8'; ctx.font = `700 ${20 * s}px ${SANS}`; ctx.fillText('p ' + (pg.page + 1) + '/' + pg.pages, cx + cw, top + 30 * s); ctx.textAlign = 'left'; }
    if (ci) { ctx.fillStyle = '#22262b'; ctx.fillRect(cx - 10 * s, top, 2 * s, H - top - 30 * s); }
    const y0 = top + headH;
    if (c.collapsed) {
      ctx.fillStyle = '#1a1d22'; rr(ctx, cx, y0, cw, 70 * s, 10 * s); ctx.fill(); ctx.fillStyle = '#9aa0a8'; ctx.font = `700 ${24 * s}px ${SANS}`;
      ctx.fillText(c.total ? c.total + ' done · tap to expand' : 'nothing done yet', cx + 16 * s, y0 + 44 * s);
      hits.push({ x: cx / W, y: y0 / H, w: cw / W, h: 70 * s / H, done: true }); return;
    }
    const slice = pg.items;
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
    const rest = c.more; // cards beyond the cap; everything in c.cards is reachable by paging
    if (rest > 0) { const y = y0 + fit * (cardH + gap) + 18 * s; ctx.fillStyle = '#9aa0a8'; ctx.font = `700 ${22 * s}px ${SANS}`; ctx.fillText('+' + rest + ' more · open the board', cx + 8 * s, y); hits.push({ x: cx / W, y: (y - 22 * s) / H, w: cw / W, h: 30 * s / H, more: c.id }); }
  });
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
  ctx.textAlign = 'right'; ctx.font = `600 ${22 * s}px ${SANS}`; ctx.fillStyle = '#9aa0a8'; ctx.fillText(L.usageHeader(rows, o.now) + ' · ' + rows[0].source, W - 30 * s, 56 * s); ctx.textAlign = 'left';
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
    ctx.fillStyle = '#a9aeb6'; ctx.font = `500 ${16 * s}px ${SANS}`;
    const pool = [L.creditLine(u), L.resetsLine(u)].filter(Boolean);
    pool.forEach((t, j) => ctx.fillText(fit(ctx, t, 600 * s), 34 * s, y + (134 + j * 20) * s));
    ctx.textAlign = 'right'; ctx.fillStyle = col; ctx.font = `800 ${92 * s}px ${SANS}`;
    ctx.fillText(u.pct_used == null ? '—' : Math.round(u.pct_used) + '%', W - 120 * s, y + 100 * s);
    ctx.font = `700 ${24 * s}px ${SANS}`; ctx.fillText('used', W - 34 * s, y + 70 * s); ctx.textAlign = 'left';
  });
}

/* ---------- Pipeline constraint wall (back wall, left of the checksheet) ----------
   o: { sum: PipelineControlRoom.summary(...) | null, age: L.constraintAge(...), err, demo }. Mirrors the cockpit strip: stage rate cards,
   the waiting queues between them, the CONSTRAINT stage outlined in red. Unknown stays "Unknown" / "—", never zero. */
function shrink(ctx, text, wt, size, maxW) { // largest font <= size (px) whose text fits maxW; no ellipsis, so labels stay whole
  for (let z = size; z > 14; z -= 1) { ctx.font = `${wt} ${z}px ${SANS}`; if (ctx.measureText(text).width <= maxW) return; }
}
export function drawConstraintWall(ctx, W, H, o) {
  const s = W / 1024, sum = o.sum, RED = '#ff4d4d';
  ctx.fillStyle = '#0d1014'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left'; ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${40 * s}px ${SANS}`; ctx.fillText('PIPELINE CONSTRAINT', 24 * s, 56 * s);
  if (o.demo) exampleTag(ctx, 470 * s, 50 * s, 20 * s);
  const age = o.age || { text: 'no data yet', stale: true };
  ctx.textAlign = 'right'; ctx.font = `700 ${26 * s}px ${SANS}`; ctx.fillStyle = age.stale ? C.stale : '#c9ccd2';
  ctx.fillText((age.stale ? '? STALE · ' : '') + age.text, W - 24 * s, 54 * s); ctx.textAlign = 'left';
  if (!sum) { ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${32 * s}px ${SANS}`; ctx.fillText(fit(ctx, o.err ? 'Pipeline feed unavailable: ' + o.err : 'Waiting for the pipeline feed…', W - 48 * s), 24 * s, 160 * s); return; }
  const cw = 184 * s, qw = 84 * s, y0 = 80 * s, ch = 380 * s, x0 = 14 * s, num = n => n.toLocaleString('en-US');
  sum.stages.forEach((st, i) => {
    const x = x0 + i * (cw + qw), con = st.constraint;
    ctx.fillStyle = '#16191e'; rr(ctx, x, y0, cw, ch, 8 * s); ctx.fill();
    ctx.lineWidth = (con ? 5 : 2) * s; ctx.strokeStyle = con ? RED : '#2b2f36'; rr(ctx, x, y0, cw, ch, 8 * s); ctx.stroke();
    ctx.fillStyle = '#f1f2f4'; shrink(ctx, st.name, 800, 28 * s, cw - 20 * s); ctx.fillText(st.name, x + 12 * s, y0 + 44 * s);
    if (con) { ctx.fillStyle = RED; rr(ctx, x + 12 * s, y0 + 62 * s, 150 * s, 32 * s, 4 * s); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `800 ${22 * s}px ${SANS}`; ctx.fillText('CONSTRAINT', x + 20 * s, y0 + 86 * s); }
    if (st.manual) {
      ctx.fillStyle = '#f1f2f4'; ctx.font = `800 ${58 * s}px ${SANS}`; ctx.fillText(sum.needDecision == null ? '—' : num(sum.needDecision), x + 12 * s, y0 + 184 * s);
      ctx.fillStyle = '#c9ccd2'; ctx.font = `600 ${24 * s}px ${SANS}`; ctx.fillText('ready for you', x + 12 * s, y0 + 222 * s);
      ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${22 * s}px ${SANS}`; ctx.fillText('manual stage', x + 12 * s, y0 + 262 * s); return;
    }
    const known = st.perHour != null;
    ctx.fillStyle = con ? RED : known ? '#f1f2f4' : '#9aa0a8'; ctx.font = `800 ${(known ? 58 : 40) * s}px ${SANS}`;
    ctx.fillText(known ? (st.partial && st.perHour > 0 ? '≥ ' : '') + st.perHour.toLocaleString('en-US', { maximumFractionDigits: 1 }) : 'Unknown', x + 12 * s, y0 + 184 * s);
    ctx.fillStyle = '#c9ccd2'; shrink(ctx, st.unit, 700, 26 * s, cw - 20 * s); ctx.fillText(st.unit, x + 12 * s, y0 + 222 * s);
    ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${20 * s}px ${SANS}`; ctx.fillText(sum.hours + ' h average', x + 12 * s, y0 + 262 * s); if (st.partial && known) { shrink(ctx, 'observed minimum', 600, 20 * s, cw - 20 * s); ctx.fillText('observed minimum', x + 12 * s, y0 + 290 * s); };
  });
  const names = ['Backlog', 'Waiting', 'Waiting'];
  sum.waiting.forEach((q, i) => {
    const cx = x0 + (i + 1) * cw + i * qw + qw / 2, n = q.count, max = Math.max(1, ...sum.waiting.map(w => w.count || 0));
    ctx.textAlign = 'center'; ctx.fillStyle = '#c9ccd2'; ctx.font = `700 ${22 * s}px ${SANS}`; ctx.fillText(names[i], cx, y0 + 130 * s);
    ctx.fillStyle = n ? '#f1f2f4' : '#9aa0a8'; ctx.font = `800 ${(n != null && String(n).length > 4 ? 28 : 34) * s}px ${SANS}`; ctx.fillText(n == null ? '—' : (q.partial ? '≥ ' : '') + num(n), cx, y0 + 172 * s);
    const th = 120 * s, tx = cx - 14 * s, ty = y0 + 190 * s; ctx.fillStyle = '#2b2e33'; ctx.fillRect(tx, ty, 28 * s, th);
    if (n) { const fh = Math.max(6 * s, th * n / max); ctx.fillStyle = '#c9aa77'; ctx.fillRect(tx, ty + th - fh, 28 * s, fh); }
    ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${20 * s}px ${SANS}`; ctx.fillText(i === 0 ? 'to intake' : i === 1 ? 'to enrich' : 'to you', cx, y0 + 346 * s); ctx.textAlign = 'left';
  });
  const cons = sum.stages.filter(x => x.constraint).map(x => x.name);
  ctx.font = `700 ${26 * s}px ${SANS}`; ctx.fillStyle = cons.length ? RED : '#c9ccd2';
  ctx.fillText(fit(ctx, cons.length ? 'CONSTRAINT: ' + cons.join(' / ') + ' · lowest ' + sum.hours + ' h output with work waiting' : sum.constraintReason, W - 48 * s), 24 * s, 510 * s);
  if (sum.evidenceDelayed) { ctx.fillStyle = C.stale; ctx.font = `700 ${24 * s}px ${SANS}`; ctx.fillText('? Evidence refresh delayed: last verified reading shown', 24 * s, 550 * s); }
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

/* Desk plaque (President's desk): dark face, thin brushed-gold border, engraved-style light text on two lines */
export function drawPlaque(ctx, W, H, lines) {
  ctx.fillStyle = '#121316'; ctx.fillRect(0, 0, W, H);
  const b = Math.max(3, H * 0.035), g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#8a6d2f'); g.addColorStop(0.5, '#e3c77a'); g.addColorStop(1, '#8a6d2f');
  ctx.strokeStyle = g; ctx.lineWidth = b; ctx.strokeRect(b * 1.5, b * 1.5, W - b * 3, H - b * 3);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `600 ${H * 0.2}px ${SANS}`;
  lines.forEach((t, i) => {
    const y = H * (0.36 + i * 0.3);
    ctx.fillStyle = '#000'; ctx.fillText(t, W / 2, y - 1, W * 0.9); // engraved: dark lip above the light fill
    ctx.fillStyle = '#e8e2cf'; ctx.fillText(t, W / 2, y + 1, W * 0.9);
  });
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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

/* Window view (Tim item 5): a simple small town at the edge of the hills. `sky` is L.skyState(now) (America/New_York time of
   day): gradient sky, sun or moon, stars at night, hills, a street of small houses, a church steeple, trees, lit windows and
   street lamps after dusk. Original artwork, drawn with plain canvas shapes. */
export function drawTown(ctx, W, H, sky) {
  const dl = sky.daylight, night = 1 - dl;
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.72); g.addColorStop(0, sky.top); g.addColorStop(1, sky.bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (sky.stars > 0.02) { ctx.fillStyle = `rgba(255,255,255,${0.85 * sky.stars})`; for (let i = 0; i < 60; i++) { const x = (i * 97 + 31) % W, y = (i * 53 + 7) % (H * 0.5), r = 0.8 + (i % 3) * 0.5; ctx.fillRect(x, y, r, r); } }
  const body = sky.sun || sky.moon;
  if (body && (sky.sun || sky.moon)) {
    const x = W * (0.1 + 0.8 * body.x), y = H * 0.62 - H * 0.5 * body.y, r = H * (sky.sun ? 0.075 : 0.06);
    const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3.2); halo.addColorStop(0, sky.sun ? 'rgba(255,236,170,0.55)' : 'rgba(200,215,255,0.25)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo; ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
    ctx.fillStyle = sky.sun ? '#fff3c4' : '#eef2ff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (sky.moon) { ctx.fillStyle = sky.top; ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.9, 0, 7); ctx.fill(); } // crescent
  }
  if (dl > 0.3) { ctx.fillStyle = `rgba(255,255,255,${0.55 * dl})`; for (const [cx, cy, w] of [[0.2, 0.2, 0.14], [0.62, 0.14, 0.18], [0.85, 0.28, 0.12]]) for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(W * (cx + k * 0.025), H * (cy + (k % 2) * 0.015), W * w * (1 - k * 0.2), H * 0.035, 0, 0, 7); ctx.fill(); } }
  const shade = (c, k) => { const n = parseInt(c.slice(1), 16), f = v => Math.round(v * k); return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`; };
  const lum = 0.22 + 0.78 * dl;
  ctx.fillStyle = shade('#4e6a58', lum); ctx.beginPath(); ctx.moveTo(0, H * 0.62); for (let x = 0; x <= W; x += 16) ctx.lineTo(x, H * (0.5 + 0.07 * Math.sin(x / W * 5 + 1) + 0.04 * Math.sin(x / W * 13))); ctx.lineTo(W, H * 0.7); ctx.lineTo(0, H * 0.7); ctx.fill();
  ctx.fillStyle = shade('#3c5a45', lum); ctx.beginPath(); ctx.moveTo(0, H * 0.66); for (let x = 0; x <= W; x += 16) ctx.lineTo(x, H * (0.6 + 0.04 * Math.sin(x / W * 7 + 3))); ctx.lineTo(W, H * 0.74); ctx.lineTo(0, H * 0.74); ctx.fill();
  ctx.fillStyle = shade('#35503e', lum); ctx.fillRect(0, H * 0.7, W, H * 0.3); // grass
  ctx.fillStyle = shade('#6c6a66', lum); ctx.fillRect(0, H * 0.86, W, H * 0.07); // main street
  ctx.fillStyle = `rgba(240,225,150,${0.5 * lum})`; for (let x = 8; x < W; x += 44) ctx.fillRect(x, H * 0.893, 22, 3);
  const houses = [[0.04, 0.12, 0.13, '#c9b79c'], [0.19, 0.1, 0.12, '#b6c7d6'], [0.33, 0.13, 0.12, '#d8c7b4'], [0.7, 0.11, 0.13, '#c7d3b8'], [0.85, 0.12, 0.12, '#d6b7b0']];
  const lit = sky.lights;
  const house = (x, h, w, c) => {
    const px = W * x, pw = W * w, ph = H * h, py = H * 0.82 - ph;
    ctx.fillStyle = shade(c, lum); ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = shade('#6b4a3a', lum); ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + pw / 2, py - ph * 0.55); ctx.lineTo(px + pw + 4, py); ctx.fill();
    for (const wx of [0.22, 0.6]) { ctx.fillStyle = lit ? 'rgba(255,214,120,0.95)' : shade('#5d7388', 0.6 + 0.4 * dl); ctx.fillRect(px + pw * wx, py + ph * 0.3, pw * 0.2, ph * 0.28); }
    ctx.fillStyle = shade('#5a3d2c', lum); ctx.fillRect(px + pw * 0.44, py + ph * 0.6, pw * 0.14, ph * 0.4);
  };
  houses.forEach(([x, h, w, c]) => house(x, h, w, c));
  { // church with a steeple in the middle of the street
    const px = W * 0.5, py = H * 0.82, bw = W * 0.1, bh = H * 0.14;
    ctx.fillStyle = shade('#e6e0d4', lum); ctx.fillRect(px - bw / 2, py - bh, bw, bh); ctx.fillRect(px - bw * 0.16, py - bh - H * 0.17, bw * 0.32, H * 0.17);
    ctx.fillStyle = shade('#5b4a58', lum); ctx.beginPath(); ctx.moveTo(px - bw * 0.22, py - bh - H * 0.17); ctx.lineTo(px, py - bh - H * 0.3); ctx.lineTo(px + bw * 0.22, py - bh - H * 0.17); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px - bw / 2 - 3, py - bh); ctx.lineTo(px, py - bh - H * 0.08); ctx.lineTo(px + bw / 2 + 3, py - bh); ctx.fill();
    ctx.fillStyle = lit ? 'rgba(255,214,120,0.95)' : shade('#6b7f94', 0.6 + 0.4 * dl); ctx.fillRect(px - bw * 0.1, py - bh * 0.8, bw * 0.2, bh * 0.4);
  }
  for (const [x, s] of [[0.17, 1], [0.31, 0.8], [0.47, 0.9], [0.64, 1.1], [0.79, 0.85], [0.97, 1]]) { // trees
    ctx.fillStyle = shade('#4a3a2c', lum); ctx.fillRect(W * x - 2, H * 0.82 - 12 * s, 4, 14 * s);
    ctx.fillStyle = shade('#3f7a52', lum); ctx.beginPath(); ctx.arc(W * x, H * 0.82 - 22 * s, 13 * s, 0, 7); ctx.fill();
  }
  if (lit) for (const x of [0.12, 0.27, 0.42, 0.58, 0.74, 0.9]) { // street lamps
    const px = W * x, py = H * 0.84; ctx.fillStyle = '#2a2d31'; ctx.fillRect(px - 1, py - H * 0.1, 2, H * 0.1);
    const lg = ctx.createRadialGradient(px, py - H * 0.1, 1, px, py - H * 0.1, H * 0.09); lg.addColorStop(0, 'rgba(255,225,150,0.9)'); lg.addColorStop(1, 'rgba(255,225,150,0)');
    ctx.fillStyle = lg; ctx.fillRect(px - H * 0.09, py - H * 0.19, H * 0.18, H * 0.18);
  }
  if (night > 0.5) { ctx.fillStyle = `rgba(6,10,28,${0.25 * night})`; ctx.fillRect(0, 0, W, H); }
}

/* Pipeline Explorer wall display, plain face: shown on phones / TV / when the live embed is unavailable (the live page is
   embedded as an iframe on the same wall spot otherwise). Clicking it opens the real page. */
export function drawPipelineWall(ctx, W, H, o) {
  ctx.fillStyle = '#0d1014'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#37e0ff'; ctx.lineWidth = 4; ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.fillStyle = '#eef3ff'; ctx.textAlign = 'center'; ctx.font = `800 ${H * 0.14}px ${SANS}`; ctx.fillText('Pipeline Explorer', W / 2, H * 0.4);
  ctx.fillStyle = '#9aa0a8'; ctx.font = `600 ${H * 0.075}px ${SANS}`; ctx.fillText('foreman-cockpit.pages.dev/pipeline', W / 2, H * 0.55);
  ctx.fillStyle = '#37e0ff'; ctx.font = `700 ${H * 0.085}px ${SANS}`; ctx.fillText(o && o.live ? 'Click to browse it live' : 'Click to open the live page', W / 2, H * 0.75);
  ctx.textAlign = 'left';
}
