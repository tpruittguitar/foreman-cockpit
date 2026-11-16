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
  pentagon: rot => roundedPoly(regular(5, 0.45), 0.15, rot),
  egg: () => Array.from({ length: 72 }, (_, i) => { const t = i / 72 * TAU; return [0.32 * Math.cos(t) * (1 - 0.1 * Math.sin(t)), 0.42 * Math.sin(t)]; })
};

/* bot -> { shape, rot, color }. HR - Bot Trainer (formerly dr eggbot) keeps the egg shape guessed from its old name. */
export const AVATARS = {
  'Root': { shape: 'roundsquare', rot: 0.22, color: '#8e8c88' },
  'Software': { shape: 'star4', rot: 0.35, color: '#22b8a2' },
  'GUI': { shape: 'clover4', rot: 0.45, color: '#f2353f' },
  'QA bot': { shape: 'teardrop', rot: 0, color: '#f2399a' },
  'Sniffer': { shape: 'pill', rot: -0.22, color: '#2382f2' },
  'Comp': { shape: 'wedge', rot: 0.05, color: '#1cc26d' },
  'ChatGPT': { shape: 'wedge', rot: -0.18, color: '#f79a1d' },
  'Claude': { shape: 'cookie6', rot: 0.2, color: '#a8733f' },
  'Usage Budget': { shape: 'wedge', rot: 0.25, color: '#7c7b79' },
  'Archive · Application State Tracker': { shape: 'pentagon', rot: 0.25, color: '#f2389b' },
  'HR - Bot Trainer': { shape: 'egg', rot: 0, color: '#f1e3c2' },
  'President': { shape: 'minifig', rot: 0, color: '#f5d2b0' }
};
const FALLBACK = ['#c9a227', '#5b8def', '#e06666', '#6aa84f'];
export function avatarFor(bot) {
  if (AVATARS[bot]) return AVATARS[bot];
  let h = 0; for (const ch of String(bot)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { shape: 'roundsquare', rot: 0, color: FALLBACK[h % FALLBACK.length] };
}
export function shapePoints(a) {
  const f = SHAPES[a.shape] || SHAPES.roundsquare;
  return f(a.rot || 0);
}
/* Small owner icon for canvas boards. */
export function drawAvatar(ctx, bot, cx, cy, size) {
  const a = avatarFor(bot);
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
