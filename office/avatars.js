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

/* Usage's pick outline (Tim, Nov 22): 90 polar radii every 4 degrees from the centre of the pick's bounding box, counter-clockwise from +x,
   traced from his Grok Bot avatar picture and scaled so the pick spans 0.84 units. */
const USAGE_PICK = [.409,.399,.388,.374,.358,.343,.327,.315,.304,.294,.289,.283,.277,.278,.274,.277,.277,.279,.286,.290,.300,.307,.321,.335,.355,.377,.401,.424,.447,.465,.482,.487,.488,.479,.468,.453,.441,.427,.414,.404,.397,.391,.389,.384,.385,.388,.392,.395,.403,.414,.427,.443,.463,.482,.501,.515,.524,.524,.517,.504,.487,.465,.447,.428,.412,.395,.380,.371,.360,.351,.343,.342,.337,.334,.333,.333,.332,.334,.336,.343,.345,.354,.360,.368,.377,.389,.396,.403,.409,.410];
/* Edgar's upright six-lobe cloud, sampled from the neutral frame of Tim's reference video. */
const EDGAR_CLOUD = [
  .2972895652, .3014316166, .3111297460, .3199500000, .3287730733, .3387155000, .3466748123, .3533368342, .3615503294, .3672285562,
  .3712978855, .3751892781, .3782748123, .3800630562, .3822241075, .3830285562, .3822241075, .3800630562, .3782741075, .3751292610,
  .3704348294, .3651875391, .3615503294, .3553778514, .3475378685, .3387741075, .3286523343, .3181010342, .3050794166, .2937137823,
  .2903161626, .2995833556, .3119920974, .3238378685, .3347633856, .3435278514, .3506248123, .3564237781, .3633985904, .3702540733,
  .3742640904, .3761730733, .3791985904, .3821040733, .3821640904, .3801230733, .3791992952, .3782147952, .3751885733, .3712985904,
  .3672892781, .3624748123, .3563623513, .3505640904, .3426655000, .3327830904, .3247630562, .3171193535, .3052587631, .2972288433,
  .2996440775, .3060031947, .3151969609, .3247637610, .3347647952, .3427248123, .3493861294, .3575403123, .3624147952, .3652468513,
  .3703748123, .3742040733, .3751878685, .3752500000, .3753100171, .3761137610, .3773503294, .3760530391, .3743848294, .3721630562,
  .3703133856, .3663040733, .3594485904, .3524730733, .3466155000, .3387748123, .3296375391, .3221103465, .3127958413, .3026074630,
  .2942040310, .2975416336, .3071804508, .3160000000, .3248237781, .3348255171, .3435892781, .3515485904, .3593878685, .3663033685,
  .3703140904, .3722237781, .3753093123, .3790785562, .3812396075, .3800623513, .3791992952, .3782755171, .3761123513, .3742647952,
  .3703748123, .3651868342, .3615503294, .3553778514, .3475378685, .3387748123, .3287123513, .3189640904, .3071190241, .2935937481,
  .2865469187, .2944575091, .3092807802, .3207516294, .3317371636, .3417403123, .3484630562, .3555593123, .3633385733, .3702533685,
  .3742640904, .3761730733, .3791992952, .3821647952, .3830878685, .3830885733, .3822241075, .3800030391, .3774103465, .3730268172,
  .3694503294, .3633392781, .3564223684, .3505647952, .3426655000, .3327830904, .3247630562, .3171186487, .3051987460, .2963643775,
  .2974844358, .3043964117, .3148241535, .3290265513, .3395171294, .3475364588, .3545147952, .3594485904, .3642630562, .3694503294,
  .3721030391, .3743841246, .3760530391, .3773510342, .3761737781, .3761737781, .3773517390, .3761130562, .3752485904, .3742647952,
  .3712385733, .3673478855, .3632785562, .3575996246, .3493268172, .3418610513, .3326637610, .3238985904, .3150183193, .3043964117,
];
function tracedOutline(radii, rot) {
  return polar(t => {
    const f = t / TAU * radii.length, k = Math.floor(f) % radii.length;
    return radii[k] + (radii[(k + 1) % radii.length] - radii[k]) * (f - Math.floor(f));
  }, rot, 180);
}
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
  edgarCloud: rot => tracedOutline(EDGAR_CLOUD, rot),
  starburst: rot => polar(t => 0.31 + 0.11 * Math.sign(-Math.cos(6 * t)) * Math.pow(Math.abs(Math.cos(6 * t)), 0.6), rot, 120), // Claude: 6 rounded rays (3D body is an SDF in chars.js; this outline is for the 2D owner icon)
  blob: rot => polar(t => 0.38 + 0.03 * Math.cos(3 * t) + 0.02 * Math.sin(2 * t), rot),
  dial: rot => polar(() => 0.4, rot),                                                        // round gauge face
  /* Hermes (Tim, Nov 21): a white app-icon tile, a rounded square like his "Meshy_AI_Button" picture; built as a bevelled box in chars.js */
  icontile: rot => roundedPoly([[-0.38, -0.38], [0.38, -0.38], [0.38, 0.38], [-0.38, 0.38]], 0.18, rot, 12),
  /* Usage (Tim, Nov 22): the Grok Bot pick, a rounded tilted triangle traced from his avatar picture (USAGE_PICK); built as a satin pillow in chars.js */
  pick: rot => polar(t => { const n = USAGE_PICK.length, f = t / TAU * n, k = Math.floor(f) % n; return USAGE_PICK[k] + (USAGE_PICK[(k + 1) % n] - USAGE_PICK[k]) * (f - Math.floor(f)); }, rot, 180),
  /* ChatGPT (Tim, Nov 21): a complete glossy black sphere with the white logo on the front; built as a sphere in chars.js */
  sphere: rot => polar(() => 0.36, rot, 64)
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
/* Claude's starburst (Tim, Nov 21), traced from his picture: the outline's distance from the hub at every 2 degrees, counter-clockwise
   from +x, in units of the ball's radius. chars.js prints it flat on the front of the ball; drawAvatar paints it on the board icon. */
export const CLAUDE_STAR = [.473,.610,.642,.649,.652,.637,.498,.218,.231,.239,.247,.262,.277,.293,.322,.334,.364,.402,.460,.530,.600,.617,.641,.648,.656,.647,.634,.604,.466,.306,.205,.189,.184,.187,.221,.245,.307,.464,.606,.626,.633,.632,.619,.591,.393,.171,.131,.126,.126,.132,.143,.206,.223,.283,.372,.473,.693,.710,.725,.728,.717,.712,.703,.629,.460,.376,.314,.264,.228,.225,.225,.644,.683,.687,.689,.680,.667,.638,.539,.465,.371,.325,.295,.260,.227,.215,.199,.183,.172,.675,.695,.691,.681,.602,.458,.414,.344,.290,.251,.222,.209,.190,.192,.181,.178,.540,.649,.670,.669,.658,.624,.468,.407,.321,.275,.247,.233,.684,.705,.702,.687,.609,.559,.460,.387,.324,.276,.263,.224,.217,.643,.686,.699,.703,.686,.666,.479,.379,.289,.250,.251,.269,.297,.348,.394,.464,.547,.645,.660,.670,.680,.665,.611,.314,.376,.454,.571,.688,.688,.685,.600,.283,.227,.229,.242,.273,.333,.390,.465,.577,.634,.650,.670,.676,.656,.605,.290,.309,.363,.403];
/* bot_id -> { shape, rot, color }, matched to the current sidebar avatars (item 17). Keyed by id so renames never break an avatar. */
export const AVATARS = {
  '431e8cf1-f077-4548-82b7-46c1959dc4c9': { shape: 'minifig', rot: 0, color: '#f5d2b0' },            // President: round face, dark hair (original art)
  '338fc1b1-fecc-475d-ba9e-acd49bcadcfc': { shape: 'blob', rot: 0.5, color: '#f2399a' },             // QA: pink pebble
  '372936ae-81e1-4013-b0d0-9ee47d97a3c4': { shape: 'blob', rot: 0, color: '#e8423f' },               // HR: red round blob
  'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f': { shape: 'blob', rot: 0.3, color: '#22b8a2' },             // Cursor: teal round blob
  'd4118f0c-1b06-4e9a-982f-f5314451c841': { shape: 'sphere', rot: 0, color: '#d46b4e', shade: '#bf472f', icon: 'claude' }, // Claude (Tim, Nov 21): orange satin ball, flat white starburst (CLAUDE_STAR); color is his picture's orange, shade the deeper 3D paint that reads as that orange under the office lights
  '7bcb0d85-ec55-4e17-907f-3e71688e8799': { shape: 'sphere', rot: 0, color: '#18181b', icon: 'chatgpt' },  // ChatGPT (Tim, Nov 21): black glossy sphere, white logo on the front (office/assets/chatgpt-logo.png)
  '70f0889b-ecd4-457b-a69c-304cd2aff540': { shape: 'roundsquare', rot: 0.22, color: '#8e8c88' },     // Root: gray rounded square
  /* Usage (Tim, Nov 22): his Grok Bot avatar, a gray rounded pick in the satin finish of the balls. face: the two dark pill eyes up and right
     of centre, the pair tilted by rot, each eye leaning by tilt, gap = eye spacing vs the usual pair, all measured from his picture. */
  'f1a70b7a-6051-45d7-8031-e46a4cba066f': { shape: 'pick', rot: 0, color: '#777777', shade: '#555555', satin: true, face: { rot: 0.122, dx: 0.06, dy: 0.13, tilt: 0.92, gap: 0.81, color: '#1e1e20' } },
  '811cc842-4bef-47c2-98d2-0f4bb78f7169': { shape: 'edgarCloud', rot: 0, color: '#1084fe', shade: '#0871e5', satin: true, prop: 'quill', face: { rot: 0, dx: 0.013, dy: -0.029, gap: 0.78, color: '#232325' } }, // Edgar: video cloud + quill
  '424e5611-fb8f-4ae1-a360-051e61e63e8a': { shape: 'wedge', rot: 0.5, color: '#1cc26d' },            // Comp: green tilted wedge
  '132c47df-ccfb-4f91-b4e2-ebcb1d775bc6': { shape: 'pill', rot: 0, color: '#f2399a', prop: 'gauge' }, // Gauge: pink pill + needle
  '321469c4-1299-43e7-bd32-1704f58777be': { shape: 'pill', rot: 0.12, color: '#2382f2' },            // Sniffer: blue pill
  'a8b4a0b2-acfd-4485-8444-7ab27007df4a': { shape: 'clover4', rot: 0.45, color: '#f2353f' },         // GUI: red clover
  'c95408dd-c07f-460e-aaa0-9d515fe5be7d': { shape: 'hexagon', rot: 0.15, color: '#f2389b' },         // Archive: pink soft hexagon
  /* Hermes (Tim, Nov 21): a glossy white 3D icon tile in place of the teal hexagon bot. The front shows the black-and-white girl with
     headphones from Tim's icon picture (office/assets/hermes-icon.png, line art only, the tile itself is the white); the back is plain white.
     No slot eyes: the artwork is the face. */
  /* Hermes ball (Tim, Nov 21, for review): the same girl artwork on a white satin ball, in the style of the ChatGPT and Claude balls.
     color stays the board-icon grey-white; shade is the 3D paint. */
  '15ab4cfb-2d51-4809-9ae3-f1285ebd829f': { shape: 'sphere', rot: 0, color: '#cdcbc6', shade: '#eceae6', icon: 'hermes' }
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
  if (a.icon) { // icon bots (Hermes tile, ChatGPT and Claude spheres): a thin edge so the mark reads on the board, no slot eyes
    ctx.lineWidth = Math.max(1, size * 0.06); ctx.strokeStyle = a.icon === 'claude' ? '#9c4a33' : a.icon === 'chatgpt' ? '#d8d8dc' : '#2a2a2e'; ctx.stroke();
    if (a.icon === 'claude') { ctx.fillStyle = '#fff'; ctx.beginPath(); const n = CLAUDE_STAR.length;
      CLAUDE_STAR.forEach((r, k) => { const t = TAU * k / n, x = r * 0.36 * size * Math.cos(t), y = -r * 0.36 * size * Math.sin(t); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.fill(); }
    ctx.restore(); return;
  }

  if (a.shape === 'edgarCloud') {
    ctx.fillStyle = a.face.color;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.roundRect((a.face.dx + sx * 0.078 - 0.034) * size, -0.05 * size, 0.068 * size, 0.164 * size, 0.034 * size); ctx.fill();
    }
    ctx.restore(); return;
  }
  const fc = a.face || {}, fr = fc.rot || 0;
  ctx.fillStyle = fc.color || '#111'; ctx.rotate(-fr); // canvas y points down, so a CCW face tilt is a negative canvas rotation
  for (const dx of [-0.1 * (fc.gap || 1), 0.1 * (fc.gap || 1)]) { ctx.beginPath(); ctx.ellipse((dx + (fc.dx || 0)) * size, (-0.02 - (fc.dy || 0)) * size, size * 0.05, size * 0.09, -(fc.tilt || 0), 0, TAU); ctx.fill(); }
  ctx.restore();
}
