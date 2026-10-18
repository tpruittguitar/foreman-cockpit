/* Independent visual contract runner. Baselines are read-only except sample bootstrap. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const postcss = require('postcss');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const { chromium } = require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const resolve = file => path.resolve(repo, file);

function parseTokens(file) {
  const tokens = {};
  // Only unconditional root declarations are a global token contract. Fail on ambiguous values.
  postcss.parse(fs.readFileSync(file, 'utf8'), { from: file }).walkDecls(/^--/, decl => {
    if (decl.parent.type !== 'rule' || decl.parent.selector !== ':root' || decl.parent.parent.type !== 'root') return;
    if (tokens[decl.prop] && tokens[decl.prop] !== decl.value) throw Error(`Ambiguous token ${decl.prop}`);
    tokens[decl.prop] = decl.value;
  });
  assert.ok(Object.keys(tokens).length, `No :root tokens in ${file}`);
  return tokens;
}

function diffPNGs(actualBytes, goldenBytes, maxPercent) {
  const actual = PNG.sync.read(actualBytes), golden = PNG.sync.read(goldenBytes);
  assert.equal(actual.width, golden.width, 'screenshot width');
  assert.equal(actual.height, golden.height, 'screenshot height');
  const diff = new PNG({ width: actual.width, height: actual.height });
  const pixels = pixelmatch(actual.data, golden.data, diff.data, actual.width, actual.height,
    { threshold: 0.1, includeAA: true });
  const percent = pixels / (actual.width * actual.height) * 100;
  return { percent, passed: percent <= maxPercent, diff: PNG.sync.write(diff) };
}

async function run() {
  const configFile = resolve(process.env.VISUAL_ELEMENTS || 'tests/visual/elements.json');
  const config = readJSON(configFile);
  const geometry = readJSON(resolve(process.env.VISUAL_GEOMETRY || 'tests/visual/geometry.json'));
  const tokens = parseTokens(resolve(config.tokens || 'tokens.css'));
  const threshold = Number(process.env.VISUAL_DIFF_PERCENT ?? config.diffPercent ?? 0.2);
  assert.ok(Number.isFinite(threshold) && threshold >= 0 && threshold <= 100, 'VISUAL_DIFF_PERCENT must be 0..100');
  assert.ok(config.elements?.length, 'elements must not be empty');
  assert.ok(geometry.viewports?.length, 'viewports must not be empty');
  const goldenDir = resolve(config.goldenDir || 'tests/visual/golden');
  const bootstrap = process.argv.includes('--bootstrap-sample');
  if (bootstrap) {
    assert.equal(configFile, resolve('tests/visual/elements.json'));
    assert.equal(config.page, 'tests/visual/sample/index.html?src=writer');
    assert.equal(goldenDir, resolve('tests/visual/sample/baselines'), 'Only sample baselines can be created');
  }
  const artifacts = resolve(process.env.VISUAL_ARTIFACTS || 'tests/visual/artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const fixture = fs.readFileSync(resolve('tests/fixtures/master.sample.txt'), 'utf8');
  const server = http.createServer((req, res) => {
    const file = resolve('.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(repo + path.sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', ({ '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.woff2':'font/woff2' })[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  let browser;
  const failures = [];
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless:true, executablePath:process.env.PIPELINE_CHROMIUM || undefined, args:['--no-sandbox'] });
    for (const viewport of geometry.viewports) {
      assert.match(viewport.name, /^[a-zA-Z0-9_-]+$/, 'safe viewport name');
      assert.ok(Object.keys(viewport.boxes || {}).length, 'geometry boxes must not be empty');
      const ctx = await browser.newContext({ viewport:{width:viewport.width, height:viewport.height}, deviceScaleFactor:viewport.deviceScaleFactor || 1, isMobile:!!viewport.isMobile, hasTouch:!!viewport.hasTouch, locale:'en-US', timezoneId:'UTC', colorScheme:'dark' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        // No live requests or writes: same fixture/Writer pattern as needs-tim.browser.js.
        await page.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin === base && url.pathname === '/writer') {
            assert.equal(route.request().method(), 'GET', 'visual fixture must not write');
            const action = url.searchParams.get('action');
            return route.fulfill({ json: action === 'master' ? {ok:true, id:'visual-fixture', text:fixture, fetchedAt:'2026-10-18T12:00:00Z', modifiedTime:'2026-10-18T12:00:00Z'} : (config.writerResponses?.[action] || {ok:true}) });
          }
          if (url.origin === base) return route.continue();
          if (url.hostname === 'api.github.com') return route.fulfill({json:config.githubResponse || {sha:'visual-fixture'}});
          return route.abort('blockedbyclient');
        });
        await page.addInitScript(() => localStorage.setItem('px.cfg', JSON.stringify({url:location.origin+'/writer', key:'test-only'})));
        await page.clock.install({time:new Date('2026-10-18T12:00:00Z')});
        await page.goto(base + '/' + config.page, {waitUntil:'load'});
        await page.waitForSelector(config.ready, {state:'attached'});
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(img => img.decode()));
        });
        // Resolve expected values in an isolated document using ONLY the parsed token file.
        const expected = await page.evaluate(({tokens, elements, motion}) => {
          const frame = document.createElement('iframe'); frame.style.display='none'; document.body.append(frame);
          const targetDoc = frame.contentDocument;
          const style = targetDoc.createElement('style');
          style.textContent = ':root {' + Object.entries(tokens).map(([k,v]) => `${k}:${v};`).join('') + '}';
          targetDoc.head.append(style);
          const probe = targetDoc.createElement('div'); targetDoc.body.append(probe);
          const values = elements.map(element => Object.fromEntries(Object.entries(element.styles).map(([property, token]) => {
            if (!(token in tokens)) throw Error('Unknown token '+token);
            probe.style.cssText = '';
            probe.style.setProperty(property, `var(${token})`);
            return [property, frame.contentWindow.getComputedStyle(probe).getPropertyValue(property)];
          })));
          const motions = motion.map(item => {
            if (!(item.duration in tokens) || !(item.easing in tokens)) throw Error('Unknown motion token');
            probe.style.cssText = `transition-duration:var(${item.duration});transition-timing-function:var(${item.easing})`;
            const computed = frame.contentWindow.getComputedStyle(probe);
            return {duration:parseFloat(computed.transitionDuration)*1000, easing:computed.transitionTimingFunction};
          });
          frame.remove(); return {values, motions};
        }, {tokens, elements:config.elements, motion:config.motion || []});
        for (const [i, element] of config.elements.entries()) {
          const locator = page.locator(element.selector);
          assert.equal(await locator.count(), 1, `${element.name}: selector must match exactly one element`);
          const actual = await locator.evaluate((el, properties) => {
            const style = getComputedStyle(el);
            return Object.fromEntries(properties.map(key => [key, style.getPropertyValue(key)]));
          }, Object.keys(element.styles));
          for (const [property, value] of Object.entries(expected.values[i])) assert.equal(actual[property], value, `${viewport.name}/${element.name}/${property}`);
        }
        for (const [name, box] of Object.entries(viewport.boxes)) {
          const locator = page.locator(box.selector);
          assert.equal(await locator.count(), 1, `${name}: geometry selector must be unique`);
          const actual = await locator.boundingBox(); assert.ok(actual, `${name} visible`);
          for (const key of ['x','y','width','height']) {
            assert.ok(Number.isFinite(box[key]), `${name}.${key} must be finite`);
            assert.ok(Math.abs(actual[key]-box[key]) <= 1, `${viewport.name}/${name}.${key}: ${actual[key]} vs ${box[key]} (±1 CSS px)`);
          }
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
        const animations = await page.evaluate(motion => document.getAnimations().map(animation => {
          const effect = animation.effect, timing = effect.getTiming();
          return {matches:motion.map(item => effect.target?.matches(item.selector) && (!item.animationName || animation.animationName === item.animationName)), duration:timing.duration,
            easings: animation instanceof CSSAnimation ? [...new Set(effect.getKeyframes().slice(0,-1).map(k => k.easing))] : [timing.easing]};
        }), config.motion || []);
        for (const animation of animations) {
          const matches = animation.matches.flatMap((match,i) => match ? [i] : []);
          assert.equal(matches.length, 1, 'every active animation must match exactly one motion contract');
          const expectedMotion = expected.motions[matches[0]];
          assert.equal(animation.duration, expectedMotion.duration, 'animation duration');
          for (const easing of animation.easings) assert.equal(easing, expectedMotion.easing, 'animation easing');
        }
        for (let i=0; i<(config.motion || []).length; i++) assert.ok(animations.some(a => a.matches[i]), `missing animation: ${config.motion[i].name}`);
        await page.evaluate(() => {
          for (const animation of document.getAnimations()) {
            const timing = animation.effect.getComputedTiming();
            assertFinite(timing.activeDuration);
            animation.pause(); animation.currentTime = timing.delay + timing.activeDuration;
          }
          function assertFinite(duration) { if (!Number.isFinite(duration)) throw Error('Infinite animation: define a finite fixture state before capture'); }
        });
        await page.clock.pauseAt(new Date('2026-10-18T12:01:00Z'));
        const actual = await page.screenshot({animations:'allow', caret:'hide', fullPage:false});
        const golden = path.join(goldenDir, viewport.name+'.png');
        fs.writeFileSync(path.join(artifacts, viewport.name+'-actual.png'), actual);
        if (bootstrap) { fs.mkdirSync(goldenDir, {recursive:true}); fs.writeFileSync(golden, actual); }
        assert.ok(fs.existsSync(golden), `Missing golden ${golden}; ask the frame owner to supply it`);
        const result = diffPNGs(actual, fs.readFileSync(golden), threshold);
        fs.writeFileSync(path.join(artifacts, viewport.name+'-diff.png'), result.diff);
        assert.ok(result.passed, `${viewport.name}: ${result.percent.toFixed(4)}% differing pixels exceeds ${threshold}%`);
        assert.deepEqual(errors, [], 'no page errors');
        console.log(`${viewport.name}: tokens, geometry, motion, pixels PASS (${result.percent.toFixed(4)}%)`);
      } catch (error) { failures.push(`${viewport.name}: ${error.stack}`); }
      finally { await ctx.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
  assert.equal(failures.length, 0, failures.join('\n'));
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode=1; });
module.exports = { parseTokens, diffPNGs };
