/* Avatar marks for each bot: 2D silhouettes traced from the Grok Bot sidebar avatars (office-mockups/refs/sidebar-*.png).
   Used for the glossy 3D jelly bodies (extruded) and for the small owner icons on the board. Pure data, no Three.js. */
const TAU = Math.PI * 2;
function polar(fn, rot = 0, n = 72) {
  const p = [];
  for (let i = 0; i < n; i++) { const t = i / n * TAU, r = fn(t); p.push([Math.cos(t + rot) * r, Math.sin(t + rot) * r]); }
  return p;
}
function roundedPoly(verts, rad, rot = 0, seg = 8) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const v = verts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const out = [];
  for (let i = 0; i < v.length; i++) {
    const p = v[(i - 1 + v.length) % v.length], q = v[i], n = v[(i + 1) % v.length];
    const dir = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
    const d1 = dir(p, q), d2 = dir(n, q);
    const a = [q[0] + d1[0] * rad, q[1] + d1[1] * rad], b = [q[0] + d2[0] * rad, q[1] + d2[1] * rad];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * q[0] + t * t * b[0], u * u * a[1] + 2 * u * t * q[1] + t * t * b[1]]);
    }
  }
  return out;
}
const regular = (n, r, start = Math.PI / 2) => Array.from({ length: n }, (_, i) => [Math.cos(start + i / n * TAU) * r, Math.sin(start + i / n * TAU) * r]);

const SHAPES = {
  roundsquare: rot => roundedPoly([[-0.36, -0.36], [0.36, -0.36], [0.36, 0.36], [-0.36, 0.36]], 0.17, rot),
  star4: rot => polar(t => 0.2 + 0.25 * Math.pow(Math.abs(Math.cos(2 * t)), 2.2), rot),
  clover4: rot => polar(t => 0.29 + 0.14 * Math.pow(Math.abs(Math.cos(2 * t)), 0.55), rot),
  teardrop: rot => polar(t => 0.35 + 0.16 * Math.pow(Math.max(0, Math.cos(t - 2.35)), 7), rot),
  pill: rot => polar(t => Math.pow(Math.pow(Math.abs(Math.cos(t) / 0.47), 2.6) + Math.pow(Math.abs(Math.sin(t) / 0.32), 2.6), -1 / 2.6), rot),
  wedge: rot => roundedPoly([[-0.4, -0.34], [0.42, -0.3], [-0.04, 0.46]], 0.19, rot),
  cookie6: rot => polar(t => 0.35 + 0.075 * Math.cos(6 * t), rot),
  pentagon: rot => roundedPoly(regular(5, 0.45), 0.15, rot)
};

/* Sidebar name -> Grok Bot bot_id. Used only when a caller has a name but no id (e.g. item owners). */
export const BOT_IDS = {
  'President': '431e8cf1-f077-4548-82b7-46c1959dc4c9',
  'Root': '70f0889b-ecd4-457b-a69c-304cd2aff540',
  'Software': 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f',
  'GUI': 'a8b4a0b2-acfd-4485-8444-7ab27007df4a',
  'QA bot': '338fc1b1-fecc-475d-ba9e-acd49bcadcfc',
  'Sniffer': '321469c4-1299-43e7-bd32-1704f58777be',
  'Comp': '424e5611-fb8f-4ae1-a360-051e61e63e8a',
  'ChatGPT': '7bcb0d85-ec55-4e17-907f-3e71688e8799',
  'Claude': 'd4118f0c-1b06-4e9a-982f-f5314451c841',
  'Usage Budget': 'f1a70b7a-6051-45d7-8031-e46a4cba066f',
  'Archive \u00b7 Application State Tracker': 'c95408dd-c07f-460e-aaa0-9d515fe5be7d',
  'HR - Bot Trainer': '372936ae-81e1-4013-b0d0-9ee47d97a3c4'
};
/* bot_id -> { shape, rot, color }. Keyed by id so renames never break an avatar. */
export const AVATARS = {
  '70f0889b-ecd4-457b-a69c-304cd2aff540': { shape: 'roundsquare', rot: 0.22, color: '#8e8c88' }, // Root
  'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f': { shape: 'star4', rot: 0.35, color: '#22b8a2' }, // Software
  'a8b4a0b2-acfd-4485-8444-7ab27007df4a': { shape: 'clover4', rot: 0.45, color: '#f2353f' }, // GUI
  '338fc1b1-fecc-475d-ba9e-acd49bcadcfc': { shape: 'teardrop', rot: 0, color: '#f2399a' }, // QA bot
  '321469c4-1299-43e7-bd32-1704f58777be': { shape: 'pill', rot: -0.22, color: '#2382f2' }, // Sniffer
  '424e5611-fb8f-4ae1-a360-051e61e63e8a': { shape: 'wedge', rot: 0.05, color: '#1cc26d' }, // Comp
  '7bcb0d85-ec55-4e17-907f-3e71688e8799': { shape: 'wedge', rot: -0.18, color: '#f79a1d' }, // ChatGPT
  'd4118f0c-1b06-4e9a-982f-f5314451c841': { shape: 'cookie6', rot: 0.2, color: '#a8733f' }, // Claude
  'f1a70b7a-6051-45d7-8031-e46a4cba066f': { shape: 'wedge', rot: 0.25, color: '#7c7b79' }, // Usage Budget
  'c95408dd-c07f-460e-aaa0-9d515fe5be7d': { shape: 'pentagon', rot: 0.25, color: '#f2389b' }, // Archive · Application State Tracker
  '372936ae-81e1-4013-b0d0-9ee47d97a3c4': { shape: 'roundsquare', rot: -0.12, color: '#8f6ee8' }, // HR - Bot Trainer
  '431e8cf1-f077-4548-82b7-46c1959dc4c9': { shape: 'minifig', rot: 0, color: '#f5d2b0' } // President
};
/* bot_id -> short tag, used only when the full name does not fit the label. */
export const SHORT_TAGS = { 'c95408dd-c07f-460e-aaa0-9d515fe5be7d': 'Archive' };
export const idFor = (bot, botId) => (botId && String(botId).trim()) || BOT_IDS[bot] || '';
export const shortTag = (bot, botId) => SHORT_TAGS[idFor(bot, botId)] || bot;
const FALLBACK = ['#c9a227', '#5b8def', '#e06666', '#6aa84f'];
export function avatarFor(bot, botId) {
  const id = idFor(bot, botId);
  if (AVATARS[id]) return AVATARS[id];
  let h = 0; for (const ch of String(id || bot)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { shape: 'roundsquare', rot: 0, color: FALLBACK[h % FALLBACK.length] };
}
export function shapePoints(a) {
  const f = SHAPES[a.shape] || SHAPES.roundsquare;
  return f(a.rot || 0);
}
/* Small owner icon for canvas boards. */
export function drawAvatar(ctx, bot, cx, cy, size, botId) {
  const a = avatarFor(bot, botId);
  ctx.save();
  ctx.translate(cx, cy);
  if (a.shape === 'minifig') {
    ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(0, 0, size * 0.45, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1f1a'; ctx.beginPath(); ctx.arc(0, -size * 0.12, size * 0.47, Math.PI, TAU); ctx.fill();
  } else {
    const pts = shapePoints(a);
    ctx.fillStyle = a.color; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * size, -y * size) : ctx.moveTo(x * size, -y * size)));
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#111';
  for (const dx of [-0.1, 0.1]) { ctx.beginPath(); ctx.ellipse(dx * size, -0.02 * size, size * 0.05, size * 0.09, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
}
