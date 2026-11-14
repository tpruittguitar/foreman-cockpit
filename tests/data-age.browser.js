/* Explorer data-age warning. generatedAt is the only clock: 30 min stays SYS OK, 61 min is the yellow "?"
   DATA AS OF line, a missing time is ? DATA AGE UNKNOWN, and a down queue still wins.
   Run: node tests/data-age.browser.js
   DATA_AGE_SHOTS=<dir> writes the five review screenshots. */
require('./helpers/block-production-writer.cjs');
const { chromium } = require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'), assert = require('assert'), path = require('path');
const repo = path.resolve(__dirname, '..');
const MIME = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2' };
const fixture = fs.readFileSync(repo + '/tests/fixtures/master.sample.txt', 'utf8');
const lines = fixture.split('\n').filter(l => /^\d+ \| V2X-[0-9A-F]+ \|/.test(l));
const shots = process.env.DATA_AGE_SHOTS;
const REV = 'a'.repeat(40);
const MIN = 60000;

function clock(iso) {
  const d = new Date(iso), h24 = d.getHours(), m = d.getMinutes(), ap = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12; if (!h) h = 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
}
function isoAge(min) { return new Date(Date.now() - min * MIN).toISOString(); }

(async () => {
  const server = require('http').createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost'), f = repo + u.pathname;
    try { res.setHeader('Content-Type', MIME[path.extname(f)] || 'text/plain'); res.end(fs.readFileSync(f)); }
    catch (e) { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PIPELINE_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const phoneOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
  let generatedAt = isoAge(30), queueOk = true, feedAt = null;

  function healthBody() {
    feedAt = new Date().toISOString();
    const at = feedAt;
    return { ok: true, candidates: 4, issues: [], sourceRevision: REV, checks: { attention: { ok: true, at }, sources: { ok: true, at }, boards: { ok: true, at }, schedules: { ok: true, at, configured: 5, executionVerified: true } },
      processFlow: { at, population: { reconciled: true, total: lines.length }, upstream: { reconciled: true, waiting: 0 }, queues: { enrichment: 0, readyForReview: 0, verification: 0, blockedClosed: 0 },
        completion: { verification: { countsAvailable: true, last24h: 0, available: true, perHour: 0, count36: 0, partial: true, startedAt: at }, enrichment: { countsAvailable: true, last24h: 0, available: true, perHour: 0, count36: 0, partial: true, startedAt: at } } },
      decisionReady: { at, ids: [] } };
  }
  function snapshotBody() {
    return { schema: 'forge.waiting-queues.v1', reconciled: true, at: feedAt, ids: { enrichment: [], decision: [] }, counts: { enrichment: 0, decision: 0, intake: 0 }, intake: { pages: [] } };
  }

  async function open(opts) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('px.cfg', JSON.stringify({ url: location.origin + '/writer', key: 'test-only' })));
    await page.route('**/script.google.com/**', r => r.abort());
    await page.route('**/script.googleusercontent.com/**', r => r.abort());
    await page.route('**/api.github.com/**', r => r.fulfill({ json: {} }));
    await page.route('**/geocoding-api.open-meteo.com/**', r => r.fulfill({ json: { results: [] } }));
    await page.route('**/api/pipeline-health*', r => r.fulfill({ json: healthBody() }));
    await page.route('**/api/writer-activity*', r => r.fulfill({ json: { ok: false, error: 'no receipt snapshot in this test' } }));
    await page.route('**/api/structured/admin/**', r => r.fulfill({ json: { ok: true, imported: lines.length } }));
    await page.route('**/api/structured/jobs*', r => {
      const u = new URL(r.request().url()), lim = +u.searchParams.get('limit') || 250, off = +u.searchParams.get('offset') || 0;
      const meta = { schema: 'pipeline-structured-snapshot-v1', source: 'writer-master' };
      if (generatedAt !== null) meta.generatedAt = generatedAt;
      r.fulfill({ json: { ok: true, total: lines.length, meta: meta, jobs: lines.slice(off, off + lim).map(l => ({ SOURCE_LINE: l })) } });
    });
    await page.route('**/raw.githubusercontent.com/**', r => {
      if (!/PIPELINE_WAITING_QUEUES\.json$/.test(r.request().url())) return r.fulfill({ status: 404, body: '' });
      return queueOk ? r.fulfill({ json: snapshotBody() }) : r.fulfill({ status: 503, body: 'down' });
    });
    await page.route('**/writer*', r => {
      const u = new URL(r.request().url());
      if (/writer-activity/.test(u.pathname)) return r.fallback();
      const a = u.searchParams.get('action');
      if (a === 'master') return r.fulfill({ json: { ok: true, text: fixture, fetchedAt: new Date().toISOString(), modifiedTime: new Date().toISOString() } });
      if (a === 'writer_status') return r.fulfill({ json: { ok: true, level: 'ok', warnings: [], queue: { processing: [], pending: 0 }, unverified: { count: 0 }, triggerInstalled: true } });
      return r.fulfill({ json: { ok: true } });
    });
    return { ctx, page, errors };
  }

  async function phone() {
    const s = await open(phoneOpts);
    await s.page.goto(base + '/pipeline.html');
    await s.page.waitForSelector('#m-sys-word');
    await s.page.waitForFunction(() => { const t = document.getElementById('m-sys-word').textContent; return t && t !== 'SYS …'; }, null, { timeout: 20000 });
    return s;
  }
  function header(page) {
    return page.evaluate(() => {
      const el = document.getElementById('m-sys'), svg = document.querySelector('#m-sys-ic svg');
      const fit = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && document.getElementById('m-sys').getBoundingClientRect().right <= innerWidth + 1;
      return { word: document.getElementById('m-sys-word').textContent, cls: el.className, aria: el.getAttribute('aria-label'), path: svg ? svg.innerHTML : '', color: getComputedStyle(el).color, fit: fit };
    });
  }
  const Q = 'M9.2 9a3 3 0 1 1 4.2 2.8';
  const CHECK = 'M5 12.5l4.5 4.5L19 7';
  const WARN = 'M12 4l9 16H3z';

  // 30 min: the normal OK header, same glyph as a fresh system.
  generatedAt = isoAge(30); queueOk = true;
  let s = await phone();
  await s.page.waitForTimeout(700);
  let h = await header(s.page);
  assert.strictEqual(h.word, 'SYS OK', '30 min header ' + JSON.stringify(h) + ' ' + s.errors.join(';'));
  assert.match(h.cls, /\bm-ok\b/);
  assert.ok(h.path.includes(CHECK), '30 min keeps the check glyph');
  assert.ok(!h.path.includes(Q), '30 min does not use the ? glyph');
  assert.ok(h.fit, '30 min header fits');
  const okShot = await s.page.locator('#m-sys').screenshot();
  assert.deepStrictEqual(s.errors, []);
  await s.ctx.close();

  // 61 min: yellow ? and DATA AS OF in local time. Status row says the same and names it for assistive tech.
  generatedAt = isoAge(61);
  const expectTime = clock(generatedAt);
  s = await phone();
  await s.page.waitForTimeout(700);
  h = await header(s.page);
  assert.strictEqual(h.word, 'DATA AS OF ' + expectTime, h.word);
  assert.match(h.cls, /\bm-delayed\b/, 'yellow caution style');
  const caution = await s.page.evaluate(() => {
    const probe = document.createElement('i'); probe.className = 'm-sys m-delayed'; document.getElementById('m-root').appendChild(probe);
    const c = getComputedStyle(probe).color; probe.remove();
    return { token: getComputedStyle(document.documentElement).getPropertyValue('--m-caution').trim(), probe: c };
  });
  assert.strictEqual(h.color, caution.probe, 'header uses the existing caution color ' + JSON.stringify(caution));
  assert.ok(h.path.includes(Q), 'yellow ? glyph');
  assert.ok(!h.path.includes(CHECK));
  assert.strictEqual(h.aria, 'Data may be out of date, as of ' + expectTime);
  assert.ok(h.fit, '61 min header fits');
  const staleShot = await s.page.locator('#m-sys').screenshot();
  if (shots) await s.page.locator('#m-hd').screenshot({ path: path.join(shots, 'phone-header-61min.png') });
  await s.page.click('#m-tab-status');
  await s.page.waitForSelector('#m-pane-status .m-fresh');
  const fresh = await s.page.evaluate(() => {
    const p = document.querySelector('#m-pane-status .m-fresh');
    return { text: p.textContent, cls: p.className, aria: p.getAttribute('aria-label'), glyph: (p.querySelector('svg') || {}).innerHTML || '' };
  });
  assert.ok(fresh.text.startsWith('DATA AS OF ' + expectTime), fresh.text);
  assert.match(fresh.cls, /\bcaution\b/);
  assert.ok(fresh.glyph.includes(Q), 'status row uses the ? glyph');
  assert.strictEqual(fresh.aria, 'Data may be out of date, as of ' + expectTime);
  assert.deepStrictEqual(s.errors, []);
  await s.ctx.close();

  // Missing generatedAt.
  generatedAt = null;
  s = await phone();
  h = await header(s.page);
  assert.strictEqual(h.word, 'DATA AGE UNKNOWN');
  assert.match(h.cls, /\bm-delayed\b/);
  assert.ok(h.path.includes(Q), 'the ? glyph is the non-color signal');
  assert.strictEqual(h.aria, 'Data age unknown');
  if (shots) await s.page.locator('#m-hd').screenshot({ path: path.join(shots, 'phone-header-missing.png') });
  await s.page.click('#m-tab-status');
  await s.page.waitForSelector('#m-pane-status .m-fresh');
  assert.strictEqual(await s.page.getAttribute('#m-pane-status .m-fresh', 'aria-label'), 'Data age unknown');
  const missingFresh = await s.page.evaluate(() => { const p = document.querySelector('#m-pane-status .m-fresh'); return { text: p.textContent, glyph: (p.querySelector('svg') || {}).innerHTML || '' }; });
  assert.ok(missingFresh.text.includes('DATA AGE UNKNOWN') && !missingFresh.text.includes('? DATA'), missingFresh.text);
  assert.ok(missingFresh.glyph.includes(Q));
  assert.deepStrictEqual(s.errors, []);
  await s.ctx.close();

  // Queue down still wins at 61 min, and the header glyph matches the empty view.
  generatedAt = isoAge(61); queueOk = false;
  s = await phone();
  await s.page.waitForSelector('#m-pane-decide .m-down');
  await s.page.waitForTimeout(700);
  h = await header(s.page);
  assert.strictEqual(h.word, 'QUEUE DOWN');
  assert.match(h.cls, /\bm-qdown\b/);
  assert.ok(h.path.includes(WARN));
  assert.ok(!/DATA AS OF|DATA AGE/.test(h.word));
  const icons = await s.page.evaluate(() => {
    const c = e => getComputedStyle(e).color, v = document.querySelector('#m-pane-decide .m-down .m-g'), hd = document.querySelector('#m-sys-ic svg');
    return { view: c(v), head: c(hd), same: v.innerHTML.replace(/\s/g, '') === hd.innerHTML.replace(/\s/g, '') };
  });
  assert.strictEqual(icons.view, icons.head, 'queue down orange matches ' + JSON.stringify(icons));
  assert.ok(icons.same, 'queue down glyph matches the header');
  assert.deepStrictEqual(s.errors, []);
  await s.ctx.close();

  // Grayscale: the ? glyph and the check are different shapes, and their colors are not the same gray.
  function lum(buf) {
    const { PNG } = require('pngjs');
    const p = PNG.sync.read(buf); let n = 0, s = 0;
    for (let i = 0; i < p.data.length; i += 4) { s += 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]; n++; }
    return { w: p.width, h: p.height, mean: s / n };
  }
  const gOk = lum(okShot), gStale = lum(staleShot);
  assert.ok(gOk.w !== gStale.w || gOk.h !== gStale.h || Math.abs(gOk.mean - gStale.mean) > 4, 'stale header is distinguishable in grayscale ' + JSON.stringify({ gOk, gStale }));

  async function desktop(min) {
    generatedAt = min == null ? null : isoAge(min); queueOk = true;
    const s = await open({ viewport: { width: 1440, height: 900 } });
    await s.page.goto(base + '/pipeline.html?open=jobs');
    await s.page.waitForSelector('#hstat .hcell');
    await s.page.waitForFunction(() => /Last sync/.test(document.getElementById('hstat').textContent), null, { timeout: 20000 });
    return s;
  }
  function syncCell(page) {
    return page.evaluate(() => {
      const cell = document.querySelectorAll('#hstat .hcell')[1];
      return { text: [...cell.children].map(n => n.textContent.trim()).join(' '), cls: cell.className, aria: cell.getAttribute('aria-label') || '' };
    });
  }

  s = await desktop(30);
  let cell = await syncCell(s.page);
  assert.match(cell.text, /^Last sync (now|\d+m)$/, cell.text);
  assert.ok(!/DATA AS OF|DATA AGE|bad/.test(cell.cls + cell.text));
  assert.strictEqual(cell.aria, '');
  await s.page.locator('#rail [data-tab="automations"]').click();
  await s.page.waitForFunction(() => /Structured snapshot/.test(document.getElementById('view-automations').textContent), null, { timeout: 20000 });
  const row30 = await s.page.evaluate(() => {
    const d = document.querySelector('[data-cr-diagnostics]'); if (d) d.open = true;
    const tr = [...document.querySelectorAll('#view-automations tr')].find(r => /Structured snapshot/.test(r.textContent));
    return tr.textContent.replace(/\s+/g, ' ').trim();
  });
  assert.match(row30, /Structured snapshot\s*OK\s*rows \d+ · generated \d{4}-\d{2}-\d{2}T.+ · age \d+ min/);
  assert.ok(!/STALE/.test(row30));
  if (shots) {
    await s.page.evaluate(() => { const d = document.querySelector('[data-cr-diagnostics]'); if (d) d.open = true; document.querySelector('#view-automations tr td').scrollIntoView(); });
    const row = s.page.locator('#view-automations tr', { hasText: 'Structured snapshot' });
    await row.screenshot({ path: path.join(shots, 'operations-row-30min.png') });
  }
  assert.deepStrictEqual(s.errors, []);
  await s.ctx.close();

  s = await desktop(61);
  cell = await syncCell(s.page);
  assert.strictEqual(cell.text, 'Last sync ? DATA AS OF ' + clock(generatedAt), cell.text);
  assert.match(cell.cls, /\bage\b/);
  assert.ok(!/\bbad\b/.test(cell.cls), 'data age is not a sync failure: ' + cell.cls);
  assert.strictEqual(cell.aria, 'Data may be out of date, as of ' + clock(generatedAt));
  const tone = await s.page.evaluate(() => {
    const b = document.querySelectorAll('#hstat .hcell')[1].querySelector('b');
    const probe = document.createElement('i');
    probe.style.color = 'var(--caution)';
    document.body.appendChild(probe);
    const caution = getComputedStyle(probe).color;
    const unknown = document.createElement('span');
    unknown.className = 'conf UNKNOWN';
    document.body.appendChild(unknown);
    const conf = getComputedStyle(unknown).color;
    probe.remove(); unknown.remove();
    return { text: b.textContent, color: getComputedStyle(b).color, caution, conf };
  });
  assert.ok(tone.text.startsWith('?'), tone.text);
  assert.strictEqual(tone.color, tone.caution, 'age value uses the caution token');
  assert.strictEqual(tone.color, tone.conf, 'same yellow as .conf.UNKNOWN');
  if (shots) await s.page.locator('header').screenshot({ path: path.join(shots, 'desktop-header-61min-fixed.png') });
  await s.page.locator('#rail [data-tab="automations"]').click();
  await s.page.waitForFunction(() => /Structured snapshot/.test(document.getElementById('view-automations').textContent), null, { timeout: 20000 });
  const row61 = await s.page.evaluate(() => {
    const d = document.querySelector('[data-cr-diagnostics]'); if (d) d.open = true;
    return [...document.querySelectorAll('#view-automations tr')].find(r => /Structured snapshot/.test(r.textContent)).textContent.replace(/\s+/g, ' ').trim();
  });
  assert.match(row61, /Structured snapshot\s*STALE\s*rows \d+ · generated .+ · age \d+ min/);
  assert.ok(!/Structured snapshot\s*OK/.test(row61));
  if (shots) {
    const row = s.page.locator('#view-automations tr', { hasText: 'Structured snapshot' });
    await row.scrollIntoViewIfNeeded();
    await row.screenshot({ path: path.join(shots, 'operations-row-61min.png') });
  }
  assert.deepStrictEqual(s.errors, []);
  await s.ctx.close();

  s = await desktop(null);
  cell = await syncCell(s.page);
  assert.strictEqual(cell.text, 'Last sync ? DATA AGE UNKNOWN');
  assert.strictEqual(cell.aria, 'Data age unknown');
  await s.page.locator('#rail [data-tab="automations"]').click();
  await s.page.waitForFunction(() => /Structured snapshot/.test(document.getElementById('view-automations').textContent), null, { timeout: 20000 });
  const rowMissing = await s.page.evaluate(() => [...document.querySelectorAll('#view-automations tr')].find(r => /Structured snapshot/.test(r.textContent)).textContent.replace(/\s+/g, ' ').trim());
  assert.match(rowMissing, /Structured snapshot\s*STALE\s*rows \d+ · generated UNKNOWN · age UNKNOWN/);
  assert.ok(!/Structured snapshot\s*OK/.test(rowMissing));
  assert.deepStrictEqual(s.errors, []);
  await s.ctx.close();

  await browser.close(); server.close();
  console.log('data-age browser: PASS');
})().catch(e => { console.error(e); process.exit(1); });
