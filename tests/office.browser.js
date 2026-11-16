/* 3D office viewer smoke test (office.html). Demo mode at desktop 1920x1080, TV mode at 1080p and 4K, a 390x844 touch
   phone (flat view, then "Walk in 3D"), and the failed-data state (GitHub hosts answer 500 here; nothing leaves the runner).
   Checks: no console errors, the canvas renders (many distinct colours), HUD text, TV keys, overlay open/close,
   v2: Needs Tim rows link to a PR, else the bot's Grok Bot chat, else name only; monitor popup by click, TV keys and touch;
   the floor plan (waving, meeting/training, idle chat/sleep/game/wander).
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
  // the demo's example meeting toggles on each demo poll; step polls until it is in the wanted state
  async function demoMeeting(page, on) {
    for (let k = 0; k < 6; k++) {
      const ok = await page.waitForFunction(want => !!window.__office.info().meeting === want, on, { timeout: 8000 }).then(() => true, () => false);
      if (ok) return;
      await page.evaluate(() => window.__office.poll());
    }
    throw new Error('demo meeting never ' + (on ? 'started' : 'ended'));
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
    assert.equal(await page.textContent('#needs-n'), '4');
    await assert3D(page, 'desktop-1920x1080.png');
    await page.click('#list-btn');
    assert.match(await page.textContent('#panel'), /Needs Tim/);
    assert.ok(await page.$('#panel a[href]'), 'needs list has clickable links');
    assert.ok(await page.$('#panel a[href*="/pull/63"]'), 'QA bot row opens its PR link');
    assert.ok(await page.$('#panel a[href="grokbot://app/v1/agent?id=70f0889b-ecd4-457b-a69c-304cd2aff540"]'), 'Root row opens its Grok Bot chat');
    assert.match(await page.textContent('#panel .nolink'), /EXAMPLE contractor · no PR or chat link known/);
    await page.keyboard.press('Escape');
    assert.equal(await page.isHidden('#panel'), true);
    if (await page.evaluate(() => window.__office.webgl)) {
      const info = await page.evaluate(() => window.__office.info());
      assert.match(info.poses.find(p => p.startsWith('Root:')), /wave|walk/, 'needs Tim bot waves at its desk');
      assert.equal(info.plan.Claude.act, 'work', 'working bots keep working');
      // with no meeting, idle bots chat / sleep / game / wander and the trainer visits or trains
      // (slow software renderers may already be past the first demo steps: step on until the meeting is off)
      await demoMeeting(page, false);
      const acts = new Set(Object.values((await page.evaluate(() => window.__office.info())).plan).map(p => p.act));
      assert.ok(['chat', 'sleep', 'game', 'wander', 'lead', 'train', 'visit', 'listen'].filter(a => acts.has(a)).length >= 4, [...acts].join());
      if (shots) {
        await page.evaluate(() => window.__office.view([8.6, 1.6, -6.0], [11.3, 1.0, -8.4])); await page.waitForTimeout(800); await shot(page, 'desktop-fridge.png');
        await page.evaluate(() => window.__office.view([-1.4, 1.9, 5.4], [-2.2, 0.9, 1.6])); await page.waitForTimeout(3000); await shot(page, 'desktop-desks.png');
      }
      // second demo poll (6 s) starts the example meeting: members walk to the conference table and sit
      await demoMeeting(page, true);
      const mi = await page.evaluate(() => window.__office.info());
      assert.deepEqual(['Software', 'Comp'].map(n => mi.plan[n].act), ['meeting', 'meeting'], 'meeting members head for the conference table');
      assert.ok(mi.goals.some(g => /^Software:meeting:0:/.test(g)), 'Software walks to seat 0');
      if (shots) {
        // software rendering here runs at a few frames a second, so give the walk time (not asserted)
        await page.waitForFunction(() => window.__office.info().poses.filter(p => /^(Software|Comp):meet$/.test(p)).length === 2, null, { timeout: 50000 }).catch(() => {}); await page.evaluate(() => window.__office.view([-5.4, 2.6, -4.6], [-9.9, 0.7, -8.0])); await page.waitForTimeout(4000); await shot(page, 'desktop-meeting.png'); }
    }
    await page.click('#start-btn'); // click-to-start pointer lock (may be refused headless; must not error)
    await page.waitForTimeout(300);
    // a plain click on a bot opens its panel without pointer lock (no Esc needed), and the panel links the bot's chat
    if (await page.evaluate(() => window.__office.webgl)) {
      await page.evaluate(() => document.exitPointerLock && document.exitPointerLock());
      let bpt = null;
      for (let y = 300; y < 1000 && !bpt; y += 20) for (let x = 100; x < 1820 && !bpt; x += 20) {
        const hit = await page.evaluate(([a, b]) => window.__office.pickAt(a, b), [x, y]);
        if (hit && hit.bot && await page.evaluate(([a, b]) => (document.elementFromPoint(a, b) || {}).tagName, [x, y]) === 'CANVAS') bpt = [x, y, hit.bot];
      }
      assert.ok(bpt, 'a bot is clickable on screen');
      await page.mouse.click(bpt[0], bpt[1]);
      await page.waitForSelector('#panel:not([hidden])', { timeout: 90000 });
      assert.equal(await page.evaluate(() => document.pointerLockElement), null, 'click does not lock the pointer');
      assert.ok(await page.$('#panel a[href^="grokbot://app/v1/agent?id="]'), 'bot panel has the chat link');
      assert.match(await page.textContent('#panel'), new RegExp('Chat with ' + bpt[2]));
      await page.click('#panel-close');
    }
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
        // TV keys reach the monitor popup: arrows move focus to "View screen", OK opens it, Back closes
        for (let k = 0; k < 8 && !(await page.evaluate(() => document.activeElement && document.activeElement.dataset.screen)); k++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForSelector('#panel .screenpop, #panel h3');
        assert.match(await page.textContent('#panel-title'), /'s screen$/);
        if (w === 1920) await shot(page, 'tv-1920x1080-screen-popup.png');
        await page.keyboard.press('Backspace');
        assert.equal(await page.isHidden('#panel'), true, 'Back closes');
        // clicking the monitor itself opens the same popup
        const name = (await page.textContent('#focusname')).split(' · ')[0];
        await waitFrames(page, (await page.evaluate(() => window.__office.frames)) + 3); // let the camera settle (4K software rendering is slow)
        let pt = null; const seen = []; // a point on the monitor that no bot, Zzz or bubble covers right now
        for (const [dx, dy] of [[0.3, 0.22], [-0.3, 0.22], [0, 0.24], [0.4, 0], [-0.4, 0], [0, 0]]) {
          const p = await page.evaluate(([n, x, y]) => window.__office.screenPoint(n, x, y), [name, dx, dy]);
          const hit = await page.evaluate(([x, y]) => window.__office.pickAt(x, y), p);
          const top = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) || {}).tagName, p);
          seen.push([hit, top]); if (hit && hit.monitor === name && top === 'CANVAS') { pt = p; break; }
        }
        assert.ok(pt, 'monitor is clickable: ' + JSON.stringify(seen));
        await page.mouse.click(pt[0], pt[1]);
        await page.waitForSelector('#panel:not([hidden])', { timeout: 90000 });
        assert.equal(await page.textContent('#panel-title'), name + "'s screen");
        await page.keyboard.press('Escape');
        assert.equal(await page.isHidden('#panel'), true, 'Esc closes');
      }
    });
  }

  await scenario('phone 390x844 touch', '?demo=1', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, async page => {
    assert.equal(await page.isVisible('#flat'), true, 'phones open on the flat view');
    await page.waitForSelector('#flat-body .needs .row');
    await shot(page, 'phone-390x844-flat.png');
    assert.ok(await page.$('#flat-body .needs a[href^="grokbot://app/v1/agent?id="]'), 'Needs Tim row opens the bot chat');
    assert.ok(await page.$('#flat-body .needs a[href*="/pull/63"]'), 'Needs Tim row opens the PR');
    await page.tap('#flat-body button[data-bot="Root"]');
    await page.waitForSelector('#panel:not([hidden])');
    assert.match(await page.textContent('#panel'), /grokbot:\/\/app\/v1\/agent\?id=/);
    await page.tap('#panel [data-screen]');
    await page.waitForSelector('#panel .screenpop');
    assert.match(await page.textContent('#panel .screenpop'), /EXAMPLE test runner|job-board/);
    await shot(page, 'phone-390x844-screen-popup.png');
    await page.tap('#panel-close');
    assert.equal(await page.isHidden('#panel'), true, 'close button works on touch');
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
