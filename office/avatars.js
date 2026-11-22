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
// Symmetrized, smoothed radius trace of QA's reference teardrop. t runs from bottom to tip.
const QA_PROFILE = [0.301546883, -0.1683504293, -0.0676869127, 0.0224846473, -0.0010045269,
  0.0078611362, -0.0120182123, -0.0036124767, -0.0044281486];
export function qaDropRadius(t) {
  const x = 2 * t - 1;
  let prev = 1, curr = x, sum = QA_PROFILE[0] + x * QA_PROFILE[1];
  for (let k = 2; k < QA_PROFILE.length; k++) {
    [prev, curr] = [curr, 2 * x * curr - prev];
    sum += QA_PROFILE[k] * curr;
  }
  return Math.sqrt(Math.max(0, t * (1 - t) * sum));
}
// Archive’s six-sided outline traced from the approved pink reference.
const ARCHIVE_HEX = [
  .3321374063, .3293051413, .3270365438, .3250459042, .3232329897, .3218277374, .3210873070, .3208958431, .3208990505, .3211011013,
  .3218400320, .3231481622, .3246836285, .3262700941, .3280464732, .3301678752, .3325877778, .3349638137, .3367244938, .3374505979,
  .3371800638, .3361959438, .3346232253, .3323769278, .3295206332, .3263894744, .3232713777, .3202844271, .3175034457, .3150313914,
  .3130045493, .3115555646, .3107079299, .3103537861, .3104762062, .3111034929, .3120122287, .3129896277, .3141390710, .3156133952,
  .3174078292, .3195568101, .3223275963, .3259910469, .3303500831, .3348276710, .3390717411, .3430127911, .3464558313, .3491276903,
  .3508676665, .3513794160, .3502815964, .3476807880, .3442740306, .3407869844, .3375379045, .3345834822, .3320405625, .3300827928,
  .3286616747, .3274609806, .3263447063, .3255618607, .3253804347, .3257891739, .3266369417, .3278146917, .3292449025, .3309548246,
  .3330653327, .3356356680, .3385961381, .3417143067, .3446002420, .3468928356, .3485121262, .3497873525, .3512996266, .3533176703,
  .3553644975, .3565950967, .3565947244, .3555333950, .3536637940, .3510753337, .3477644397, .3438442543, .3397489525, .3360317149,
  .3329593189, .3303501894, .3278814583, .3255711048, .3237583898, .3226753808, .3221555565, .3218403517, .3217042597, .3220456598,
  .3229092130, .3240052664, .3252720904, .3270783422, .3297553634, .3330214010, .3360384706, .3381106639, .3390858186, .3391206062,
  .3384058779, .3371252999, .3353980899, .3332386883, .3306166951, .3275393514, .3241514806, .3207859333, .3178010973, .3154064410,
  .3137039999, .3127367330, .3123542059, .3122332896, .3121875101, .3122539126, .3125389352, .3131485299, .3141942024, .3157626037,
  .3179332792, .3207811279, .3241916286, .3278550792, .3315744008, .3353528716, .3392175384, .3430387213, .3464587597, .3491278898,
  .3508676665, .3513794160, .3502815964, .3476807880, .3442740306, .3407869844, .3375379045, .3345834822, .3320405625, .3300827928,
  .3286616747, .3274609806, .3263447063, .3255618607, .3253804347, .3257891739, .3266369417, .3278146917, .3292449025, .3309548246,
  .3330653327, .3356356680, .3385961381, .3417143067, .3446002420, .3468926361, .3485093972, .3497641512, .3511770306, .3529150657,
  .3545427844, .3555527776, .3557730112, .3551307904, .3535411980, .3510519329, .3477589819, .3438208535, .3396263565, .3356291103,
];
export function archiveHexRadius(t) {
  const f = ((t % TAU + TAU) % TAU) * ARCHIVE_HEX.length / TAU, i = Math.floor(f);
  return ARCHIVE_HEX[i] + (ARCHIVE_HEX[(i + 1) % ARCHIVE_HEX.length] - ARCHIVE_HEX[i]) * (f - i);
}
// GUI’s four-lobed clover, traced from the approved upright red reference.
const GUI_CLOVER = [
  .3055083121, .3072738124, .3128487206, .3201261675, .3275843763, .3347506220, .3417457244, .3487518659, .3556629616, .3621465327,
  .3680435441, .3735415244, .3787409771, .3833712925, .3872259437, .3904907499, .3933501909, .3956472703, .3972557403, .3984674968,
  .3996222218, .4006388930, .4012222747, .4012194445, .4006124487, .3994777631, .3979678509, .3961508223, .3940517499, .3917396642,
  .3890731280, .3857686516, .3818528235, .3774878932, .3725647088, .3669939230, .3609932874, .3547745248, .3483152679, .3415890463,
  .3345975622, .3271824184, .3194344943, .3124285336, .3080882260, .3079523411, .3119506217, .3185172862, .3258445635, .3328971979,
  .3395437213, .3460547781, .3525669386, .3590119064, .3653115063, .3712550717, .3764372782, .3807300318, .3844106341, .3877518271,
  .3908390331, .3935800439, .3957441333, .3972226939, .3982555759, .3991681934, .4000119483, .4005635184, .4005635184, .4000118946,
  .3991674590, .3982493320, .3971896475, .3956347825, .3933487222, .3904906425, .3872261584, .3833744448, .3787691050, .3737016769,
  .3686377694, .3636308175, .3582960211, .3523450455, .3458876473, .3391034513, .3319876186, .3245937189, .3172272573, .3107898945,
  .3072675939, .3085310143, .3141918715, .3220107234, .3301743486, .3380374086, .3454234046, .3522097075, .3582708309, .3636278799,
  .3686375546, .3737016769, .3787693197, .3833776508, .3872550207, .3906568779, .3939736833, .3972077345, .3999355775, .4017381075,
  .4026083713, .4028605666, .4026871254, .4020490924, .4009678238, .3995924351, .3980527828, .3963697215, .3944941860, .3923006772,
  .3895154031, .3859853476, .3819188090, .3775003810, .3725661776, .3669940303, .3609932874, .3547745248, .3483150531, .3415860550,
  .3345718523, .3270442035, .3189681095, .3114356355, .3067450626, .3067874993, .3112992444, .3183048804, .3259437564, .3334563170,
  .3408856897, .3481934324, .3550091098, .3612331301, .3670978734, .3726216123, .3775619959, .3817066745, .3850992369, .3880798087,
  .3909382261, .3935986146, .3957439723, .3972019201, .3981378123, .3987434368, .3990172478, .3990253789, .3989471935, .3987758562,
  .3983184715, .3974108923, .3959561810, .3940101490, .3917647832, .3891808490, .3859926730, .3821585203, .3778441540, .3731346304,
  .3680720842, .3627183544, .3571458673, .3513251575, .3449928965, .3379292493, .3302690102, .3223550817, .3146757890, .3084049661,
];
export function guiCloverRadius(t) {
  const f = ((t % TAU + TAU) % TAU) * GUI_CLOVER.length / TAU, i = Math.floor(f);
  return GUI_CLOVER[i] + (GUI_CLOVER[(i + 1) % GUI_CLOVER.length] - GUI_CLOVER[i]) * (f - i);
}
// The approved pill proportions, with equal circular end caps and level top/bottom.
export const PILL_SIZE = { snifferPill: { w: 0.894, h: 0.600 }, gaugePill: { w: 0.891, h: 0.595 } };
function horizontalPill({ w, h }) {
  const r = h / 2, run = (w - h) / 2, points = [];
  for (const side of [1, -1]) for (let i = 0; i <= 48; i++) {
    const t = Math.PI * (i / 48 - 0.5) + (side === 1 ? 0 : Math.PI);
    points.push([side * run + r * Math.cos(t), r * Math.sin(t)]);
  }
  return points;
}
const SHAPES = {
  rootSquare: rot => roundedPoly([[-0.3293072, -0.3293072], [0.3293072, -0.3293072], [0.3293072, 0.3293072], [-0.3293072, 0.3293072]], 0.0823268, rot),
  roundsquare: rot => roundedPoly([[-0.36, -0.36], [0.36, -0.36], [0.36, 0.36], [-0.36, 0.36]], 0.17, rot),
  star4: rot => polar(t => 0.2 + 0.25 * Math.pow(Math.abs(Math.cos(2 * t)), 2.2), rot),
  guiClover: rot => tracedOutline(GUI_CLOVER, rot),
  clover4: rot => polar(t => 0.29 + 0.14 * Math.pow(Math.abs(Math.cos(2 * t)), 0.55), rot),
  teardrop: rot => polar(t => 0.35 + 0.16 * Math.pow(Math.max(0, Math.cos(t - 2.35)), 7), rot),
  snifferPill: () => horizontalPill(PILL_SIZE.snifferPill),
  gaugePill: () => horizontalPill(PILL_SIZE.gaugePill),
  pill: rot => polar(t => Math.pow(Math.pow(Math.abs(Math.cos(t) / 0.47), 2.6) + Math.pow(Math.abs(Math.sin(t) / 0.32), 2.6), -1 / 2.6), rot),
  wedge: rot => roundedPoly([[-0.4, -0.34], [0.42, -0.3], [-0.04, 0.46]], 0.19, rot),
  cookie6: rot => polar(t => 0.35 + 0.075 * Math.cos(6 * t), rot),
  pentagon: rot => roundedPoly(regular(5, 0.45), 0.15, rot),
  flower: rot => polar(t => 0.31 + 0.12 * Math.pow(Math.abs(Math.cos(2.5 * t)), 0.8), rot),   // rounded petal lobes
  archiveHex: rot => tracedOutline(ARCHIVE_HEX, rot),
  hexagon: rot => roundedPoly(regular(6, 0.44), 0.16, rot),                                    // Archive: soft hexagon (Grok "hexagone")
  cloud: rot => polar(t => 0.33 + 0.045 * Math.cos(5 * t + 0.6) + 0.02 * Math.cos(3 * t + 2.1), rot, 90), // Edgar: scalloped cloud (Grok "nuage")
  edgarCloud: rot => tracedOutline(EDGAR_CLOUD, rot),
  starburst: rot => polar(t => 0.31 + 0.11 * Math.sign(-Math.cos(6 * t)) * Math.pow(Math.abs(Math.cos(6 * t)), 0.6), rot, 120), // Claude: 6 rounded rays (3D body is an SDF in chars.js; this outline is for the 2D owner icon)
  blob: rot => polar(t => 0.38 + 0.03 * Math.cos(3 * t) + 0.02 * Math.sin(2 * t), rot),
  dial: rot => polar(() => 0.4, rot),                                                        // round gauge face
  /* Hermes (Tim, Nov 21): a white app-icon tile, a rounded square like his "Meshy_AI_Button" picture; built as a bevelled box in chars.js */
  icontile: rot => roundedPoly([[-0.38, -0.38], [0.38, -0.38], [0.38, 0.38], [-0.38, 0.38]], 0.18, rot, 12),
  /* Usage (Tim, Nov 22): the Grok Bot pick, a rounded tilted triangle traced from his avatar picture (USAGE_PICK); built as a satin pillow in chars.js */
  qaDrop: () => {
    const side = Array.from({ length: 49 }, (_, i) => [qaDropRadius(i / 48), 0.746 * i / 48 - 0.373]);
    return side.concat(side.slice(1, -1).reverse().map(([x, y]) => [-x, y]));
  },
  usageCone: rot => roundedPoly([[-0.371, -0.35], [0.371, -0.35], [0, 0.373]], 0.17, rot),
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
  '338fc1b1-fecc-475d-ba9e-acd49bcadcfc': { shape: 'qaDrop', rot: 0, color: '#ff309b', shade: '#e5238a', satin: true, face: { color: '#232325' } }, // QA: satin-pink reference teardrop
  '372936ae-81e1-4013-b0d0-9ee47d97a3c4': { shape: 'sphere', rot: 0, color: '#ff263c', shade: '#e51d35', satin: true, face: { color: '#232325' } }, // HR: satin-red sphere
  'b0178cd7-2b7a-4843-8bd1-a58bd6a13b6f': { shape: 'sphere', rot: 0, color: '#1084fe', shade: '#0871e5', icon: 'cursor' }, // Cursor: satin-blue sphere with supplied front mark
  'd4118f0c-1b06-4e9a-982f-f5314451c841': { shape: 'sphere', rot: 0, color: '#d46b4e', shade: '#bf472f', icon: 'claude' }, // Claude (Tim, Nov 21): orange satin ball, flat white starburst (CLAUDE_STAR); color is his picture's orange, shade the deeper 3D paint that reads as that orange under the office lights
  '7bcb0d85-ec55-4e17-907f-3e71688e8799': { shape: 'sphere', rot: 0, color: '#18181b', icon: 'chatgpt' },  // ChatGPT (Tim, Nov 21): black glossy sphere, white logo on the front (office/assets/chatgpt-logo.png)
  '70f0889b-ecd4-457b-a69c-304cd2aff540': { shape: 'rootSquare', rot: 0, color: '#777777', shade: '#555555', satin: true, face: { rot: 0, dx: 0.03, dy: -0.026, gap: 0.78, color: '#232325' } }, // RootCause: satin-gray square
  // Usage: upright satin cone with a generous lower rim and flat vertical eyes.
  'f1a70b7a-6051-45d7-8031-e46a4cba066f': { shape: 'usageCone', rot: 0, color: '#777777', shade: '#555555', satin: true, face: { color: '#232325' } },
  '811cc842-4bef-47c2-98d2-0f4bb78f7169': { shape: 'edgarCloud', rot: 0, color: '#1084fe', shade: '#0871e5', satin: true, prop: 'quill', face: { rot: 0, dx: 0.013, dy: -0.029, gap: 0.78, color: '#232325' } }, // Edgar: video cloud + quill
  '424e5611-fb8f-4ae1-a360-051e61e63e8a': { shape: 'usageCone', rot: 0, color: '#00c972', shade: '#00b869', satin: true, face: { color: '#232325' } }, // Comp: same cone as Usage, reference green
  '132c47df-ccfb-4f91-b4e2-ebcb1d775bc6': { shape: 'gaugePill', rot: 0, color: '#ff309b', satin: true, prop: 'gauge', pillEyes: { x: 0.058, y: -0.061, gap: 0.24, w: 0.053, h: 0.105, color: '#232325' } },
  '321469c4-1299-43e7-bd32-1704f58777be': { shape: 'snifferPill', rot: 0, color: '#1084fe', satin: true, pillEyes: { x: 0.095, y: 0.115, gap: 0.235, w: 0.053, h: 0.105, color: '#232325' } },
  'a8b4a0b2-acfd-4485-8444-7ab27007df4a': { shape: 'guiClover', rot: 0, color: '#ff263c', shade: '#e51d35', satin: true, face: { rot: 0, dx: 0.014, dy: 0.021, gap: 0.77, color: '#232325' } }, // GUI: satin-red reference clover
  'c95408dd-c07f-460e-aaa0-9d515fe5be7d': { shape: 'archiveHex', rot: 0, color: '#ff309b', shade: '#e5238a', satin: true, face: { rot: 0, dx: 0.048, dy: 0.005, gap: 0.82, color: '#232325' } }, // Archive: satin-pink reference hexagon
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
let cursorBadge;
export function loadCursorBadge(onReady) {
  if (typeof Image === 'undefined') return null;
  if (!cursorBadge) {
    cursorBadge = new Image();
    cursorBadge.src = new URL('./assets/cursor-logo.png', import.meta.url).href;
  }
  if (onReady && !cursorBadge.complete) cursorBadge.addEventListener('load', onReady, { once: true });
  return cursorBadge;
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
  if (a.icon) { // Icon avatars use their mark instead of slot eyes.
    ctx.lineWidth = Math.max(1, size * 0.06); ctx.strokeStyle = a.icon === 'claude' ? '#9c4a33' : a.icon === 'chatgpt' ? '#d8d8dc' : '#2a2a2e'; ctx.stroke();
    if (a.icon === 'cursor') {
      const mark = loadCursorBadge(), halfSpan = 0.252 * size;
      if (mark?.complete && mark.naturalWidth) ctx.drawImage(mark, -halfSpan, -halfSpan, 2 * halfSpan, 2 * halfSpan);
    }
    if (a.icon === 'claude') { ctx.fillStyle = '#fff'; ctx.beginPath(); const n = CLAUDE_STAR.length;
      CLAUDE_STAR.forEach((r, k) => { const t = TAU * k / n, x = r * 0.36 * size * Math.cos(t), y = -r * 0.36 * size * Math.sin(t); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.fill(); }
    ctx.restore(); return;
  }

  if (a.pillEyes) {
    const { x, y, gap, w, h, color } = a.pillEyes;
    ctx.fillStyle = color;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.roundRect((x + side * gap / 2 - w) * size, (-y - h) * size, 2 * w * size, 2 * h * size, w * size); ctx.fill();
    }
    ctx.restore(); return;
  }
  if (a.shape === 'usageCone' || a.shape === 'qaDrop' || (a.shape === 'sphere' && a.face)) {
    ctx.fillStyle = a.face.color;
    const sphere = a.shape === 'sphere', eyeX = sphere ? [-0.053, 0.155] : [-0.084, 0.084];
    const halfWidth = sphere ? 0.0498 : 0.045, top = sphere ? -0.0894 : -0.005, height = sphere ? 0.1968 : 0.178;
    for (const x of eyeX) {
      ctx.beginPath(); ctx.roundRect((x - halfWidth) * size, top * size, 2 * halfWidth * size, height * size, halfWidth * size); ctx.fill();
    }
    ctx.restore(); return;
  }
  if (a.shape === 'edgarCloud' || a.shape === 'rootSquare' || a.shape === 'archiveHex' || a.shape === 'guiClover') {
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
