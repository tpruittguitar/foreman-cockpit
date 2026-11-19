/* Office board readability capture (GUI review 2026-11-18, findings 2 / 6 / 7).
   Serves this checkout's office.html on localhost with fixture data (2 Needs Tim cards, 27 in progress, AI usage, automations)
   and no network writes: GitHub reads answer from fixtures, every other outside host is aborted, every POST is recorded.
   Measures on-screen text cap height (CSS px, 1440x900 and 390x844) by projecting each board text run's canvas cap height
   through the board mesh to the screen, from Standing (6.7 m from the back wall) and Walk-up (3 m) spots. Each wall board
   has one Detail face only (no Far overlay / distance crossfade).
   Run:  node tests/office-readability.capture.cjs [out-dir]     (default /workspace/officeread-proof)
   Writes screenshots, measurements.json and summary.md to out-dir; exits 1 when a criterion fails. */
require('./helpers/block-production-writer.cjs');
const { chromium } = require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const repo = path.resolve(__dirname, '..');
const OUT = process.argv[2] || '/workspace/officeread-proof';
const MIME = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const EYE = L.EYE_HEIGHT;
const QUICK = process.env.READABILITY_QUICK === '1';
/* as-of / freshness lines belong to separate work (one as-of per board); measured and reported on their own line, not changed here */
const AS_OF = /^(fetched |Latest reading|updated |\? ?STALE · |\? ?Data as of|Data as of)/; // shorter paging watch while developing (the default is the full 60 s)

/* ---------- fixtures (EXAMPLE data shaped like the 2026-11-18 live office) ---------- */
function fixtures(now) {
  const ago = m => new Date(now - m * 60000).toISOString(), st = L.demoStatus(now);
  const I = (id, title, priority, status, owner, extra) => Object.assign({ id, title, priority, status, owner, updated_at: ago(5 + id.length), project: 'Job pipeline', link: '' }, extra || {});
  const ip = ['3D office design review, information boards first', 'Enrichment throughput: batch the employer lookups so the queue drains overnight',
    'Constraint wall keeps last good numbers when the feed is stale', 'Writer heartbeat alert when no good write for 90 minutes', 'Score preview for the new flex policy',
    'Dedupe ATS job ids across the two discovery channels', 'Archive sweep for asks older than 14 days', 'Phone flat view: Needs Tim header from the checksheet count',
    'Map popup shows the employer evidence trail', 'Pay estimator: shift differential rules', 'Usage readings at 6 AM, noon, 6 PM and midnight ET',
    'Retry queue for failed intake rows', 'Backlog grid keyboard order', 'Office chat relay rate limit', 'Cover letter templates v3 with the new tone guide',
    'Price scrape for job leads: 412 listings', 'Lead scoring rules for remote roles', 'Pipeline Explorer audit: stale evidence links',
    'Automations board summary line and sort by last run', 'Bot pose follows the live card it owns', 'Training sessions schedule for new bots',
    'Desk cards show the bot’s open checksheet items', 'Held emails: release after Tim reviews', 'Discovery channel health check', 'Control room: one freshness line per board',
    'Build badge popup shows the PR summary', 'Visual golden refresh for the pipeline map'];
  const owners = ['GUI', 'Cursor', 'Claude', 'Edgar', 'Gauge', 'Sniffer', 'Comp', 'QA', 'Root', 'ChatGPT', 'Usage', 'Archive', 'HR', 'President'];
  const items = [
    I('nt-1', 'Pay estimator rule gaps: pick a/b for each', 'Needs Tim', 'needs_tim', 'Comp',
      { question: 'Pick a or b for each of the three rule gaps', note: 'Three rule gaps found in the pay estimator; Comp needs an a/b answer on each to finish.' }),
    I('nt-2', 'Six 12–16 h old PRs need a/b before merge', 'Needs Tim', 'needs_tim', 'President',
      { question: 'a: merge as is, b: hold for QA', note: 'All six are green; each needs a/b.' })
  ].concat(ip.map((t, k) => I('ip-' + k, t, k % 5 ? 'P2' : 'P1', 'working', owners[k % owners.length])))
    .concat(Array.from({ length: 9 }, (_, k) => I('q-' + k, ['Queued: ', 'Later: '][k % 2] + ['Grok usage reader', 'Bitcoin watcher', 'Office warehouse phase 2', 'Quest VR menu', 'Archive search', 'Skills whiteboard v2', 'HR onboarding chat', 'Job board API key rotation', 'Fridge restock schedule'][k], 'P3', 'queued', owners[(k + 3) % owners.length])))
    .concat(Array.from({ length: 5 }, (_, k) => I('d-' + k, 'Done item ' + k, 'P2', 'done', owners[k])));
  const status = { updated_at: ago(1), needs_tim: [], bots: st.bots, items };
  const readings = [['CLAUDE', 9], ['CHATGPT', 92], ['GROK', 8]].map(([p, u]) => JSON.stringify({ at: ago(9), provider: p, usedPct: u, meter: 'weekly', label: 'Weekly limit', status: 'OK' })).join('\n');
  const autoRows = [{ ai: 'ChatGPT', name: 'FORGE_EMAIL_DISCOVERY', result: 'FAIL', last_run_at: ago(100), next_run_at: new Date(now + 13 * 60000).toISOString() },
    { ai: 'Claude', name: 'Intake sweep', result: 'FAIL', last_run_at: ago(300), next_run_at: new Date(now + 600 * 60000).toISOString() }]
    .concat(Array.from({ length: 11 }, (_, k) => ({ ai: ['Grok', 'Gauge', 'Usage'][k % 3], name: 'Scheduled job ' + (k + 1), result: 'FAIL', last_run_at: '', next_run_at: new Date(now + (k + 2) * 3600000).toISOString() })));
  const autos = { generated_at: ago(3), automations: autoRows, runs: [], writer_health: { last_write_age_min: { value: 108, status: 'amber', source: 'EXAMPLE' }, writes_per_hour: { value: 0.5, status: 'amber', source: 'EXAMPLE' } } };
  return { status, readings, autos };
}

/* ---------- in-page instrumentation: every fillText on every canvas, reset when the canvas is repainted from (0,0) ---------- */
const INIT = `(() => {
  const runs = new WeakMap(); window.__runs = runs;
  const P = CanvasRenderingContext2D.prototype, ft = P.fillText, fr = P.fillRect;
  P.fillRect = function (x, y, w, h) { if (x === 0 && y === 0 && w >= this.canvas.width && h >= this.canvas.height) runs.set(this.canvas, []); return fr.apply(this, arguments); };
  P.fillText = function (t, x, y) { let a = runs.get(this.canvas); if (!a) runs.set(this.canvas, a = []);
    if (a.length < 4000) a.push({ text: String(t), x, y, font: this.font, color: String(this.fillStyle), align: this.textAlign, alpha: this.globalAlpha }); return ft.apply(this, arguments); };
})();`;

/* in-page: project every text run of every board face to the screen; contrast from the run's own pixels */
function measurePage(opts) {
  const T = window.__office, vw = innerWidth, vh = innerHeight, scratch = document.createElement('canvas').getContext('2d'), capOf = {};
  const cap = font => (capOf[font] != null ? capOf[font] : (scratch.font = font, capOf[font] = scratch.measureText('H').actualBoundingBoxAscent));
  const width = (font, t) => { scratch.font = font; return scratch.measureText(t).width; };
  const lum = c => { const f = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = s => { const m = /^#([0-9a-f]{6})$/i.exec(s); return m ? [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16)) : null; };
  const out = [];
  for (const b of T.boards()) {
    const face = 'detail', cv = b.detail, W = cv.width, H = cv.height;
    let runs = (window.__runs.get(cv) || []).filter(r => r.alpha !== 0 && r.text.trim());
    const roleOf = new Map();
    if (b.hits && b.hits.runs) for (const r of b.hits.runs) roleOf.set(r.text + '@' + Math.round(r.x) + ',' + Math.round(r.y), r.role);
    const g = opts.contrast ? cv.getContext('2d') : null;
    for (const r of runs) {
      const c = cap(r.font), w = width(r.font, r.text), left = r.align === 'right' || r.align === 'end' ? r.x - w : r.align === 'center' ? r.x - w / 2 : r.x;
      const p0 = b.toScreen(left / W, r.y / H), p1 = b.toScreen(left / W, (r.y - c) / H), p2 = b.toScreen((left + w) / W, r.y / H);
      const px = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const inView = p0[2] < 1 && Math.max(p0[0], p2[0]) > 0 && Math.min(p0[0], p2[0]) < vw && p1[1] > 0 && p0[1] < vh;
      const fullyInView = p0[2] < 1 && Math.min(p0[0], p2[0]) >= 0 && Math.max(p0[0], p2[0]) <= vw && p1[1] >= 0 && p0[1] <= vh;
      const rec = { board: b.id, face, role: roleOf.get(r.text + '@' + Math.round(r.x) + ',' + Math.round(r.y)) || 'text', text: r.text.slice(0, 80), font: r.font, capPx: +px.toFixed(2), inView, fullyInView, dist: +b.dist.toFixed(2) };
      if (g) { // contrast: text colour vs the commonest pixel colour in the run's box that is not near the text colour
        const fg = hex(r.color);
        if (fg) {
          const x0 = Math.max(0, Math.floor(left)), y0 = Math.max(0, Math.floor(r.y - c * 1.1)), x1 = Math.min(W, Math.ceil(left + w)), y1 = Math.min(H, Math.ceil(r.y + c * 0.25));
          if (x1 - x0 > 1 && y1 - y0 > 1) {
            const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, count = new Map();
            for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - fg[0]) + Math.abs(d[i + 1] - fg[1]) + Math.abs(d[i + 2] - fg[2]) < 90) continue; const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; count.set(k, (count.get(k) || 0) + 1); }
            let best = null, n = 0; for (const [k, v] of count) if (v > n) { n = v; best = k; }
            if (best != null) { const bg = [best >> 16 & 255, best >> 8 & 255, best & 255]; rec.fg = r.color; rec.bg = '#' + bg.map(v => v.toString(16).padStart(2, '0')).join(''); rec.contrast = +ratio(fg, bg).toFixed(2); }
          }
        }
      }
      out.push(rec);
    }
  }
  return { boards: T.boards().map(b => ({ id: b.id, dist: +b.dist.toFixed(2), detailCanvas: b.detail.width + 'x' + b.detail.height })), runs: out };
}

/* card rectangles on screen, and what covers them (desk screens, name chips) */
function coverPage() {
  const T = window.__office, b = T.boards().find(x => x.id === 'project'), los = T.los(), vw = innerWidth, vh = innerHeight;
  const cards = (b.hits || []).filter(h => h.id).map(h => { const a = b.toScreen(h.x, h.y), c = b.toScreen(h.x + h.w, h.y + h.h);
    return { id: h.id, col: h.col, x0: Math.min(a[0], c[0]), y0: Math.min(a[1], c[1]), x1: Math.max(a[0], c[0]), y1: Math.max(a[1], c[1]) }; });
  const ov = (p, q) => p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
  const boardDepth = (los.boards.find(x => x.id === 'project') || {}).depth || 99;
  const desks = los.desks.filter(d => d.rect && d.depth < boardDepth).map(d => ({ name: d.name, opacity: d.opacity, covers: cards.filter(c => ov(d.rect, c)).map(c => c.id) })).filter(d => d.covers.length);
  const chips = [...document.querySelectorAll('#labels .tag, #labels .bubbles')].filter(e => e.style.display !== 'none' && !e.hidden && e.getBoundingClientRect().width)
    .map(e => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim().slice(0, 40), opacity: +getComputedStyle(e).opacity, rect: { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } }; })
    .map(t => ({ ...t, covers: cards.filter(c => ov(t.rect, c)).map(c => c.id) })).filter(t => t.covers.length);
  const nt = cards.filter(c => c.col === 'needs_tim' || /^nt-/.test(c.id));
  return { cards: cards.length, needsTim: nt.map(c => ({ id: c.id, inView: c.x0 >= 0 && c.y0 >= 0 && c.x1 <= vw && c.y1 <= vh })), desks, chips,
    titles: (b.hits.runs || []).filter(r => r.role === 'title').map(r => r.text), ids: cards.map(c => c.id), facing: los.boards.map(x => x.id) };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const fx = fixtures(Date.now());
  const server = require('http').createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost'), f = path.join(repo, decodeURIComponent(u.pathname));
    if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/office.html';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'] });
  const requests = [], results = { at: new Date().toISOString(), base: 'office.html (this checkout, fixture data)', criteria: [], spots: {} };
  const crit = (id, name, pass, detail) => { results.criteria.push({ id, name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + id + ' ' + name + (detail ? ' — ' + detail : '')); };
  // measured and reported, but owned by other work: never fails this PR's run
  const outOfScope = (id, name, met, detail) => { results.criteria.push({ id, name, pass: true, outOfScope: true, met: !!met, detail }); console.log('OUT OF SCOPE ' + id + ' ' + name + ' — ' + (met ? 'met' : 'not met') + (detail ? ', ' + detail : '')); };

  async function open(ctxOpts) {
    const ctx = await browser.newContext(ctxOpts);
    await ctx.addInitScript(INIT);
    await ctx.route(/^https?:\/\/(?!localhost[:/])/, r => { // nothing leaves the machine: GitHub reads from fixtures, everything else aborted
      const u = r.request().url();
      if (/OFFICE_STATUS\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx.status) });
      if (/AI_USAGE_READINGS\.jsonl/.test(u)) return r.fulfill({ status: 200, contentType: 'text/plain', body: fx.readings });
      if (/AUTOMATIONS_STATUS\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fx.autos) });
      if (/raw\.githubusercontent\.com|api\.github\.com/.test(u)) return r.fulfill({ status: 404, body: 'not in fixture' });
      return r.abort();
    });
    const page = await ctx.newPage(), errors = [];
    page.on('request', q => { if (!['GET', 'HEAD', 'OPTIONS'].includes(q.method())) requests.push({ method: q.method(), url: q.url() }); });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('crash', () => console.log('renderer crashed (busy runner?)'));
    return { ctx, page, errors };
  }
  const ready = page => page.waitForFunction(() => window.__office && window.__office.ready && window.__office.frames > 10, null, { timeout: 120000 });
  async function go(page, pos, look, settle) {
    await page.evaluate(([p, l]) => { window.__office.view(p, l); const s = document.getElementById('start'); if (s) s.hidden = true; }, [pos, look]);
    const f0 = await page.evaluate(() => window.__office.frames);
    await page.waitForFunction(k => window.__office.frames > k + 3, f0, { timeout: 240000 }); // swiftshader on a busy runner can be slow
    await page.waitForTimeout(settle == null ? 900 : settle);
  }
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), timeout: 120000 });
  const BOARD = { project: { c: [-2, 2.3, -9.88], n: [0, 0, 1] }, usage: { c: [5.7, 2.2, -9.88], n: [0, 0, 1] }, constraint: { c: [-9.4, 2.3, -9.88], n: [0, 0, 1] },
    autos: { c: [-11.88, 2.1, 7.1], n: [1, 0, 0] }, writer: { c: [-11.88, 2.3, -8.3], n: [1, 0, 0] } };
  const walkup = id => { const b = BOARD[id]; return [[b.c[0] + 3 * b.n[0], EYE, b.c[2] + 3 * b.n[2]], b.c]; };
  const DOOR = [[0.3, EYE, 9.0], [-0.6, EYE - 0.1, -4]], STAND = [[-2, EYE, -10 + 6.7], [-2, 2.3, -9.95]];
  const minOf = (runs, f) => { const r = runs.filter(f); return r.length ? Math.min(...r.map(x => x.capPx)) : null; };
  const summarize = m => { const by = {}; for (const r of m.runs.filter(x => x.inView)) { const k = r.board + '/' + r.face + '/' + r.role; by[k] = Math.min(by[k] == null ? 1e9 : by[k], r.capPx); } return by; };

  /* ======================= desktop 1440 x 900 ======================= */
  {
    const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
    await page.goto(base); await ready(page);
    await page.waitForFunction(() => window.__office.boards().find(b => b.id === 'project').hits.some(h => h.id), null, { timeout: 60000 });

    // Door (screenshot + probe: Detail face only, no Far overlay)
    await go(page, ...DOOR); await shot(page, 'desktop_door.png');
    const door = await page.evaluate(measurePage, { contrast: true }); results.spots.desktop_door = { boards: door.boards, min: summarize(door) };
    const noFar = await page.evaluate(() => window.__office.boards().every(b => !b.far && !('fade' in b) && !('layout' in b)));
    crit('1a', 'Door: wall boards expose only the Detail face (no Far overlay fields)', noFar, door.boards.map(b => b.id + ' ' + b.dist + 'm').join(', '));
    const contrastRuns = door.runs.filter(r => r.contrast != null);

    // Standing
    await go(page, ...STAND); await shot(page, 'desktop_standing.png');
    const stand = await page.evaluate(measurePage, { contrast: true }); results.spots.desktop_standing = { boards: stand.boards, min: summarize(stand) };
    const cs = stand.runs.filter(r => r.board === 'project' && r.inView && !AS_OF.test(r.text));
    const tMin = minOf(cs, () => true);
    crit('3a', 'Standing: checksheet Detail face is present', !!stand.boards.find(b => b.id === 'project'), 'project ' + (stand.boards.find(b => b.id === 'project') || {}).dist + ' m');
    crit('3b', 'Standing: checksheet body text >= 16 px', tMin >= 16, (tMin || 0).toFixed(1) + ' px');
    crit('3c', 'Standing: checksheet body text >= 13 px', tMin >= 13, (tMin || 0).toFixed(1) + ' px');
    for (const r of stand.runs) if (r.contrast != null) contrastRuns.push(r);

    // checksheet: both Needs Tim cards in full, nothing in the line of sight
    const c0 = await page.evaluate(coverPage);
    crit('4a', 'Both Needs Tim cards fully visible from Standing', c0.needsTim.length === 2 && c0.needsTim.every(c => c.inView), JSON.stringify(c0.needsTim));
    crit('5', 'Standing: no desk screen or name chip covers a checksheet card (faded to <= 30%)',
      c0.desks.every(d => d.opacity <= 0.3 + 1e-6) && c0.chips.every(t => t.opacity <= 0.3 + 1e-6),
      `${c0.desks.length} desk screens and ${c0.chips.length} chips in line, opacities ${c0.desks.map(d => d.name + ' ' + d.opacity).concat(c0.chips.map(t => t.text + ' ' + t.opacity)).join(', ') || 'none'}`);
    results.spots.desktop_standing.cover = c0;
    await shot(page, 'desktop_standing_after_settle.png');

    // Walk-up (3 m) at every board
    results.spots.desktop_walkup = {};
    let walkMin = Infinity, bodyMin = Infinity, worst = '', asOfMin = Infinity, asOfWorst = '';
    for (const id of Object.keys(BOARD)) {
      await go(page, ...walkup(id)); await shot(page, `desktop_walkup_${id}.png`);
      const m = await page.evaluate(measurePage, { contrast: true });
      const rs = m.runs.filter(r => r.board === id && r.inView);
      const mn = minOf(rs, r => !AS_OF.test(r.text)), body = mn, ao = minOf(rs, r => AS_OF.test(r.text));
      if (ao != null && ao < asOfMin) { asOfMin = ao; asOfWorst = id + ': ' + rs.filter(r => AS_OF.test(r.text)).sort((a, b) => a.capPx - b.capPx)[0].text + ' ' + ao + ' px'; }
      results.spots.desktop_walkup[id] = { dist: m.boards.find(b => b.id === id).dist, minPx: mn, bodyMinPx: body, smallest: rs.sort((a, b) => a.capPx - b.capPx).slice(0, 3).map(r => r.text + ' ' + r.capPx) };
      if (mn != null && mn < walkMin) { walkMin = mn; const r0 = rs.filter(r => !AS_OF.test(r.text)).sort((a, b) => a.capPx - b.capPx)[0]; worst = id + ': ' + r0.text + ' ' + r0.capPx + ' px'; }
      if (body != null) bodyMin = Math.min(bodyMin, body);
      for (const r of m.runs) if (r.contrast != null && r.board === id) contrastRuns.push(r);
    }
    crit('3d', 'Walk-up: no text under 12 px on any board (as-of lines on 3f)', walkMin >= 12, 'smallest ' + worst);
    crit('3e', 'Walk-up: body text >= 14 px', bodyMin >= 14, 'smallest body ' + bodyMin.toFixed(1) + ' px');
    outOfScope('3f', 'Walk-up: as-of lines >= 12 px (owned by the as-of work; not changed in this PR)', asOfMin >= 12, 'smallest ' + asOfWorst);

    // contrast
    const seen = new Map(); for (const r of contrastRuns) { const k = r.board + r.face + r.text + r.fg; if (!seen.has(k)) seen.set(k, r); }
    const samples = [...seen.values()], bad = samples.filter(r => r.contrast < L.minContrast(r.capPx));
    results.contrast = { samples: samples.length, failing: bad.map(r => ({ board: r.board, face: r.face, text: r.text, fg: r.fg, bg: r.bg, contrast: r.contrast, capPx: r.capPx })), min: samples.length ? Math.min(...samples.map(r => r.contrast)) : null };
    crit('7', 'Contrast >= 4.5:1 under 24 px, >= 3:1 from 24 px (board text samples)', !bad.length, samples.length + ' samples, ' + bad.length + ' failing' + (bad.length ? ': ' + bad.slice(0, 4).map(r => `${r.board} "${r.text}" ${r.contrast}`).join('; ') : ''));

    // saved textures (proof): Detail face only
    const tex = await page.evaluate(() => window.__office.boards().filter(b => b.id === 'project' || b.id === 'usage').map(b => [b.id + '_detail', b.detail.toDataURL()]));
    for (const [n, d] of tex) fs.writeFileSync(path.join(OUT, `texture_${n}.png`), Buffer.from(d.split(',')[1], 'base64'));
    if (errors.length) crit('E1', 'desktop: no page errors', false, errors.join(' | ').slice(0, 300));
    await ctx.close();
  }

  /* ======================= phone 390 x 844 ======================= */
  {
    const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await page.goto(base); await page.waitForFunction(() => window.__office && window.__office.ready, null, { timeout: 120000 });
    const mode0 = await page.evaluate(() => window.__office.mode);
    crit('6a', 'Phone: Flat view is the default', mode0 === 'flat', 'mode ' + mode0);
    await shot(page, 'phone_default_flat.png');
    await page.click('#walk3d'); await ready(page);
    await page.waitForFunction(() => window.__office.boards().find(b => b.id === 'project').hits.some(h => h.id), null, { timeout: 60000 });
    results.spots.phone = {};
    const spots = [['door', DOOR], ['standing', STAND]].concat(Object.keys(BOARD).map(id => ['walkup_' + id, walkup(id)]));
    let detailOnly = true;
    for (const [name, v] of spots) {
      await go(page, ...v); await shot(page, `phone_${name}.png`);
      const m = await page.evaluate(measurePage, { contrast: false });
      const probe = await page.evaluate(() => window.__office.boards().map(b => ({ id: b.id, far: !!b.far, fade: 'fade' in b, layout: 'layout' in b })));
      detailOnly = detailOnly && probe.every(b => !b.far && !b.fade && !b.layout);
      results.spots.phone[name] = { boards: m.boards, probe };
      // labels never overlap
      const tags = await page.evaluate(() => [...document.querySelectorAll('#labels .tag')].filter(e => e.style.display !== 'none').map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, e.textContent.trim()]; }).filter(r => r[2] > r[0]));
      const over = []; for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) { const a = tags[i], b = tags[j]; if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) over.push(a[4] + ' / ' + b[4]); }
      results.spots.phone[name].labels = { shown: tags.length, overlaps: over };
      if (over.length) crit('6d-' + name, 'Phone: name labels do not overlap at ' + name, false, over.join(', '));
    }
    crit('6b', 'Phone 3D: Detail face only from every spot (no Far overlay)', detailOnly, '');
    crit('6d', 'Phone: name labels never overlap (all spots)', Object.values(results.spots.phone).every(s => !s.labels.overlaps.length), Object.entries(results.spots.phone).map(([k, s]) => k + ' ' + s.labels.shown).join(', '));
    // HUD hides while moving, back after 2 s still
    await go(page, ...DOOR);
    const op = () => page.evaluate(() => ['hud-tl', 'hud-tr'].map(id => +getComputedStyle(document.getElementById(id)).opacity));
    await page.keyboard.down('KeyW'); await page.waitForTimeout(700);
    const moving = await op(); await shot(page, 'phone_walking_hud_hidden.png');
    await page.keyboard.up('KeyW'); await page.waitForTimeout(1200);
    const still1 = await op(); await page.waitForTimeout(1600);
    const still2 = await op(); await shot(page, 'phone_still_hud_back.png');
    crit('6e', 'Phone: HUD hidden while moving, back after 2 s still', moving.every(o => o === 0) && still2.every(o => o === 1), `moving ${moving}, 1.2 s still ${still1}, 2.8 s still ${still2}`);
    if (errors.length) crit('E2', 'phone: no page errors', false, errors.join(' | ').slice(0, 300));
    await ctx.close();
  }

  /* ======================= network ======================= */
  const writerPosts = requests.filter(q => /script\.google|googleusercontent|writer/i.test(q.url));
  results.requests = { nonGet: requests, writerPosts };
  crit('N1', 'Zero Writer POSTs', writerPosts.length === 0, requests.length + ' non-GET requests in total');

  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(results, null, 2));
  const failed = results.criteria.filter(c => !c.pass), scoped = results.criteria.filter(c => !c.outOfScope);
  const verdict = c => (c.outOfScope ? 'OUT OF SCOPE' + (c.met ? '' : ' (not met)') : c.pass ? 'PASS' : '**FAIL**');
  fs.writeFileSync(path.join(OUT, 'summary.md'), '| # | Criterion | Result | Measured |\n|---|---|---|---|\n' + results.criteria.map(c => `| ${c.id} | ${c.name} | ${verdict(c)} | ${String(c.detail || '').replace(/\|/g, '/')} |`).join('\n') + '\n');
  console.log(`\n${scoped.length - failed.length}/${scoped.length} in-scope criteria pass (${results.criteria.length - scoped.length} out of scope); wrote ${OUT}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
