/* 3D office viewer smoke test (office.html). Demo mode at desktop 1920x1080, TV mode at 1080p and 4K, a 390x844 touch
   phone (flat view, then "Walk in 3D"), and the failed-data state (GitHub hosts answer 500 here; nothing leaves the runner).
   Checks: no console errors, the canvas renders (many distinct colours), HUD text, TV keys, overlay open/close.
   Run: node tests/office.browser.js     OFFICE_SHOTS=<dir> writes screenshots. */
require('./helpers/block-production-writer.cjs');
const { chromium } = require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'), path = require('path'), assert = require('assert');
const { PNG } = require('pngjs');
const repo = path.resolve(__dirname, '..');
const MIME = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2' };
const shotArg = process.argv.indexOf('--shots');
const shots = process.env.OFFICE_SHOTS || (shotArg > 0 ? process.argv[shotArg + 1] : '');

function colours(buf) {
  const png = PNG.sync.read(buf), seen = new Set();
  for (let i = 0; i < png.data.length; i += 4 * 97) seen.add((png.data[i] >> 3) << 10 | (png.data[i + 1] >> 3) << 5 | (png.data[i + 2] >> 3));
  return seen.size;
}

(async () => {
  const server = require('http').createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost'), f = path.join(repo, decodeURIComponent(u.pathname));
    if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/office.html';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failures = 0;
  async function scenario(name, url, ctxOpts, fn, opts = {}) {
    const ctx = await browser.newContext(ctxOpts);
    await ctx.route(/https:\/\/(raw\.githubusercontent\.com|api\.github\.com)\/.*/, r => r.fulfill({ status: 500, body: 'offline in test' }));
    const page = await ctx.newPage(), errors = [];
    page.on('console', m => { if (m.type() === 'error' && !(opts.allowNetwork && /Failed to load resource/.test(m.text()))) errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    try {
      await page.goto(base + url);
      await page.waitForFunction(() => window.__office && window.__office.ready, null, { timeout: 60000 });
      await fn(page);
      assert.deepEqual(errors, [], 'console errors');
      console.log('ok', name);
    } catch (e) { failures++; console.log('FAIL', name, e && e.message); }
    await ctx.close();
  }
  const waitFrames = (page, n) => page.waitForFunction(k => window.__office.frames >= k, n, { timeout: 90000 });
  async function shot(page, file) {
    const buf = await page.screenshot({ timeout: 120000 });
    if (shots) { fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, file), buf); }
    return buf;
  }
  async function assert3D(page, file) {
    const st = await page.evaluate(() => ({ mode: window.__office.mode, webgl: window.__office.webgl }));
    if (st.webgl === false) { // no WebGL in this browser: the flat view must stand in, with a note
      assert.equal(st.mode, 'flat'); assert.equal(await page.isVisible('#flat'), true); console.log('  (no WebGL here; flat fallback checked)'); return;
    }
    assert.equal(st.mode, '3d');
    await waitFrames(page, 20);
    await page.waitForTimeout(1500);
    const n = colours(await shot(page, file));
    assert.ok(n > 60, 'canvas renders (distinct colours: ' + n + ')');
    const info = await page.evaluate(() => window.__office.info());
    assert.equal(info.desks, 12); assert.equal(info.chars, 12);
  }

  await scenario('desktop demo 1920x1080', '?demo=1', { viewport: { width: 1920, height: 1080 } }, async page => {
    assert.equal(await page.textContent('#demo-badge'), 'EXAMPLE DATA');
    assert.match(await page.textContent('#asof'), /Data as of \d\d:\d\d/);
    assert.equal(await page.textContent('#needs-n'), '3');
    await assert3D(page, 'desktop-1920x1080.png');
    await page.click('#list-btn');
    assert.match(await page.textContent('#panel'), /Needs Tim/);
    assert.ok(await page.$('#panel a[href]'), 'needs list has clickable links');
    await page.keyboard.press('Escape');
    assert.equal(await page.isHidden('#panel'), true);
    await page.click('#start-btn'); // click-to-start pointer lock (may be refused headless; must not error)
    await page.waitForTimeout(300);
  });

  for (const [w, h] of [[1920, 1080], [3840, 2160]]) {
    await scenario(`tv ${w}x${h}`, '?demo=1&tv=1', { viewport: { width: w, height: h } }, async page => {
      await assert3D(page, `tv-${w}x${h}.png`);
      const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('hint')).fontSize));
      assert.ok(fs >= 28, 'TV text at least 28px, got ' + fs);
      const box = await page.evaluate(() => document.getElementById('hud-tl').getBoundingClientRect().left);
      assert.ok(box >= Math.min(w, h) * 0.05 - 1, 'HUD inside the 5% safe margin');
      if (await page.evaluate(() => window.__office.webgl)) {
        await page.waitForSelector('#focusname:not([hidden])');
        const first = await page.textContent('#focusname');
        await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900);
        assert.notEqual(await page.textContent('#focusname'), first, 'right arrow hops');
        await page.keyboard.press('ArrowDown'); await page.waitForTimeout(900);
        assert.match(await page.textContent('#focusname'), /WORKING|IDLE|NEEDS TIM|BLOCKED/);
        await page.keyboard.press('Enter');
        await page.waitForSelector('#panel:not([hidden])');
        await page.keyboard.press('Backspace');
        assert.equal(await page.isHidden('#panel'), true, 'Back closes');
      }
    });
  }

  await scenario('phone 390x844 touch', '?demo=1', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, async page => {
    assert.equal(await page.isVisible('#flat'), true, 'phones open on the flat view');
    await page.waitForSelector('#flat-body .needs .row');
    await shot(page, 'phone-390x844-flat.png');
    await page.tap('#flat-body .needs button[data-bot]');
    await page.waitForSelector('#panel:not([hidden])');
    assert.match(await page.textContent('#panel'), /grokbot:\/\/app\/v1\/agent\?id=/);
    await page.tap('#panel-close');
    await page.tap('#walk3d');
    await assert3D(page, 'phone-390x844-3d.png');
    if (await page.evaluate(() => window.__office.webgl)) assert.equal(await page.isVisible('#joystick'), true, 'virtual joystick');
  });

  await scenario('live data feed down', '', { viewport: { width: 1280, height: 720 } }, async page => {
    await page.waitForSelector('#banner:not([hidden])');
    assert.match(await page.textContent('#banner'), /Office data unavailable/);
    assert.equal(await page.evaluate(() => window.__office.state), 'failed');
    assert.match(await page.textContent('#asof'), /No office data/);
    if (await page.evaluate(() => window.__office.webgl)) await waitFrames(page, 10);
    await shot(page, 'feed-down-1280x720.png');
  }, { allowNetwork: true });

  await browser.close(); server.close();
  if (failures) { console.log(failures + ' scenario(s) failed'); process.exit(1); }
  console.log('office browser smoke: all scenarios passed');
})().catch(e => { console.error(e); process.exit(1); });
