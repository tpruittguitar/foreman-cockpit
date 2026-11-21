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
  flower: rot => polar(t => 0.31 + 0.12 * Math.pow(Math.abs(Math.cos(2.5 * t)), 0.8), rot),   // rounded petal lobes
  hexagon: rot => roundedPoly(regular(6, 0.44), 0.16, rot),                                    // Archive: soft hexagon (Grok "hexagone")
  cloud: rot => polar(t => 0.33 + 0.045 * Math.cos(5 * t + 0.6) + 0.02 * Math.cos(3 * t + 2.1), rot, 90), // Edgar: scalloped cloud (Grok "nuage")
  starburst: rot => polar(t => 0.31 + 0.11 * Math.sign(-Math.cos(6 * t)) * Math.pow(Math.abs(Math.cos(6 * t)), 0.6), rot, 120), // Claude: 6 rounded rays (3D body is an SDF in chars.js; this outline is for the 2D owner icon)
  blob: rot => polar(t => 0.38 + 0.03 * Math.cos(3 * t) + 0.02 * Math.sin(2 * t), rot),
  dial: rot => polar(() => 0.4, rot),                                                        // round gauge face
  /* Hermes (Tim, Nov 21): a white app-icon tile, a rounded square like his "Meshy_AI_Button" picture; built as a bevelled box in chars.js */
  icontile: rot => roundedPoly([[-0.38, -0.38], [0.38, -0.38], [0.38, 0.38], [-0.38, 0.38]], 0.15, rot)
};
/* Sidebar shape names (profile.json avatarShape) -> our shapes. */
const SHAPE_ALIAS = { square: 'roundsquare', tablet: 'pill', sparkle: 'star4', star: 'cookie6', clover: 'clover4', teardrop: 'teardrop', wedge: 'wedge', blob: 'blob', flower: 'flower', pentagon: 'pentagon', dial: 'dial', circle: 'blob', hexagon: 'hexagon', cloud: 'cloud', starburst: 'starburst' };
/* Sidebar colour names -> hex. */
export const MARK_COLORS = { magenta: '#e0369b', blue: '#2f7cf0', red: '#e8423f', green: '#1cc26d', yellow: '#f2c12e', black: '#2a2a2e', gray: '#8c8c8c', grey: '#8c8c8c', cyan: '#22c3d6', brown: '#a8733f', orange: '#f79a1d', purple: '#8f6ee8', pink: '#f2399a', teal: '#22b8a2' };
/* Baked sidebar marks (avatarShape, avatarColor from each bot's profile.json, supplied by President 2:16 AM; '' = none). */
export const SIDEBAR_MARKS = {
  '132c47df-ccfb-4f91-b4e2-ebcb1d775bc6': ['', 'magenta'],    // Gauge
  '321469c4-1299-43e7-bd32-1704f58777be': ['tablet', 'blue'], // Sniffer
  '338fc1b1-fecc-475d-ba9e-acd49bcadcfc': ['teardrop', 'magenta'], // QA bot
  '372936ae-81e1-4013-b0d0-9ee47d97a3c4': ['teardrop', 'red'], // HR - Bot Trainer
  '424e5611-fb8f-4ae1-a360-051e61e63e8a': ['wedge', 'green'], // Comp
  '431e8cf1-f077-4548-82b7-46c1959dc4c9': ['blob', 'black'],  // President
  '70f0889b-ecd4-457b-a69c-304cd2aff540': ['square', 'gray'], // Root
  '7bcb0d85-ec55-4e17-907f-3e71688e8799': ['wedge', 'yellow'], // ChatGPT
  '811cc842-4bef-47c2-98d2-0f4bb78f7169': ['flower', 'blue'], // Edgar
  'a8b4a0b2-acfd-4485-8444-7ab27007df4a': ['clover', 'red'],  // GUI
  'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f': ['sparkle', 'cyan'], // Cursor
  'c95408dd-c07f-460e-aaa0-9d515fe5be7d': ['', ''],           // Archive · Application State Tracker
  'd4118f0c-1b06-4e9a-982f-f5314451c841': ['star', 'brown'],  // Claude
  'f1a70b7a-6051-45d7-8031-e46a4cba066f': ['', 'gray']        // Usage Budget
};

/* Sidebar name -> Grok Bot bot_id. Used only when a caller has a name but no id (e.g. item owners). Short sidebar names (item 17);
   the old long names stay as lookups so older status files still resolve. */
export const BOT_IDS = {
  'President': '431e8cf1-f077-4548-82b7-46c1959dc4c9',
  'QA': '338fc1b1-fecc-475d-ba9e-acd49bcadcfc',
  'HR': '372936ae-81e1-4013-b0d0-9ee47d97a3c4',
  'Cursor': 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f',
  'Claude': 'd4118f0c-1b06-4e9a-982f-f5314451c841',
  'ChatGPT': '7bcb0d85-ec55-4e17-907f-3e71688e8799',
  'Root': '70f0889b-ecd4-457b-a69c-304cd2aff540',
  'Usage': 'f1a70b7a-6051-45d7-8031-e46a4cba066f',
  'Edgar': '811cc842-4bef-47c2-98d2-0f4bb78f7169',
  'Comp': '424e5611-fb8f-4ae1-a360-051e61e63e8a',
  'Gauge': '132c47df-ccfb-4f91-b4e2-ebcb1d775bc6',
  'Sniffer': '321469c4-1299-43e7-bd32-1704f58777be',
  'GUI': 'a8b4a0b2-acfd-4485-8444-7ab27007df4a',
  'Archive': 'c95408dd-c07f-460e-aaa0-9d515fe5be7d',
  'Hermes': '15ab4cfb-2d51-4809-9ae3-f1285ebd829f',
  'QA bot': '338fc1b1-fecc-475d-ba9e-acd49bcadcfc', 'HR - Bot Trainer': '372936ae-81e1-4013-b0d0-9ee47d97a3c4', 'Software': 'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f',
  'Usage Budget': 'f1a70b7a-6051-45d7-8031-e46a4cba066f', 'Archive \u00b7 Application State Tracker': 'c95408dd-c07f-460e-aaa0-9d515fe5be7d'
};
/* bot_id -> { shape, rot, color }, matched to the current sidebar avatars (item 17). Keyed by id so renames never break an avatar. */
export const AVATARS = {
  '431e8cf1-f077-4548-82b7-46c1959dc4c9': { shape: 'minifig', rot: 0, color: '#f5d2b0' },            // President: round face, dark hair (original art)
  '338fc1b1-fecc-475d-ba9e-acd49bcadcfc': { shape: 'blob', rot: 0.5, color: '#f2399a' },             // QA: pink pebble
  '372936ae-81e1-4013-b0d0-9ee47d97a3c4': { shape: 'blob', rot: 0, color: '#e8423f' },               // HR: red round blob
  'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f': { shape: 'blob', rot: 0.3, color: '#22b8a2' },             // Cursor: teal round blob
  'd4118f0c-1b06-4e9a-982f-f5314451c841': { shape: 'starburst', rot: 0.2, color: '#a8733f' },          // Claude: brown starburst
  '7bcb0d85-ec55-4e17-907f-3e71688e8799': { shape: 'wedge', rot: -0.18, color: '#f79a1d' },          // ChatGPT: orange wedge blob
  '70f0889b-ecd4-457b-a69c-304cd2aff540': { shape: 'roundsquare', rot: 0.22, color: '#8e8c88' },     // Root: gray rounded square
  'f1a70b7a-6051-45d7-8031-e46a4cba066f': { shape: 'wedge', rot: 0.6, color: '#7c7b79' },            // Usage: gray tilted wedge
  '811cc842-4bef-47c2-98d2-0f4bb78f7169': { shape: 'cloud', rot: 0.1, color: '#2f7cf0', prop: 'quill' }, // Edgar: blue cloud + quill
  '424e5611-fb8f-4ae1-a360-051e61e63e8a': { shape: 'wedge', rot: 0.5, color: '#1cc26d' },            // Comp: green tilted wedge
  '132c47df-ccfb-4f91-b4e2-ebcb1d775bc6': { shape: 'pill', rot: 0, color: '#f2399a', prop: 'gauge' }, // Gauge: pink pill + needle
  '321469c4-1299-43e7-bd32-1704f58777be': { shape: 'pill', rot: 0.12, color: '#2382f2' },            // Sniffer: blue pill
  'a8b4a0b2-acfd-4485-8444-7ab27007df4a': { shape: 'clover4', rot: 0.45, color: '#f2353f' },         // GUI: red clover
  'c95408dd-c07f-460e-aaa0-9d515fe5be7d': { shape: 'hexagon', rot: 0.15, color: '#f2389b' },         // Archive: pink soft hexagon
  /* Hermes (Tim, Nov 21): a glossy white 3D icon tile in place of the teal hexagon bot. The front shows the black-and-white girl with
     headphones from Tim's icon picture (office/assets/hermes-icon.png, line art only, the tile itself is the white); the back is plain white.
     No slot eyes: the artwork is the face. */
  '15ab4cfb-2d51-4809-9ae3-f1285ebd829f': { shape: 'icontile', rot: 0, color: '#f4f4f2', icon: 'hermes' }
};
/* bot_id -> short tag, used only when the full name does not fit the label. */
export const SHORT_TAGS = { 'c95408dd-c07f-460e-aaa0-9d515fe5be7d': 'Archive' };
export const idFor = (bot, botId) => (botId && String(botId).trim()) || BOT_IDS[bot] || '';
export const shortTag = (bot, botId) => SHORT_TAGS[idFor(bot, botId)] || bot;
const FALLBACK = ['#c9a227', '#5b8def', '#e06666', '#6aa84f'];
/* Custom model first; else OFFICE_STATUS bots[].avatar_shape/avatar_color, then the baked sidebar mark, then a hash colour. */
export function avatarFor(bot, botId, override) {
  const id = idFor(bot, botId);
  if (AVATARS[id]) return AVATARS[id];
  const o = override || {}, baked = SIDEBAR_MARKS[id] || ['', ''];
  let h = 0; for (const ch of String(id || bot)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const shape = SHAPE_ALIAS[String(o.avatar_shape || '').toLowerCase()] || SHAPE_ALIAS[baked[0]] || 'blob';
  const color = MARK_COLORS[String(o.avatar_color || '').toLowerCase()] || (/^#[0-9a-f]{6}$/i.test(o.avatar_color || '') ? o.avatar_color : '') || MARK_COLORS[baked[1]] || 'hsl(' + (h % 360) + ',62%,55%)';
  return { shape, rot: 0, color, generic: true };
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
  if (a.icon) { // icon tiles (Hermes): a thin dark edge so the white tile reads on the board, no slot eyes
    ctx.lineWidth = Math.max(1, size * 0.06); ctx.strokeStyle = '#2a2a2e'; ctx.stroke(); ctx.restore(); return;
  }
  const fc = a.face || {}, fr = fc.rot || 0;
  ctx.fillStyle = fc.color || '#111'; ctx.rotate(-fr); // canvas y points down, so a CCW face tilt is a negative canvas rotation
  for (const dx of [-0.1, 0.1]) { ctx.beginPath(); ctx.ellipse((dx + (fc.dx || 0)) * size, (-0.02 - (fc.dy || 0)) * size, size * 0.05, size * 0.09, -(fc.tilt || 0), 0, TAU); ctx.fill(); }
  ctx.restore();
}
