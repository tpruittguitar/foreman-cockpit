/* Render golden-frame source pages to PNG at native resolution and report text geometry against the reference.
   node tests/visual/render-golden.cjs [F02]   (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/ui.browser.js)
   Output: tests/visual/golden/<frame>_2560x1440.png and tests/visual/golden/<frame>.words.json (DOM word boxes). */
'use strict';
const { chromium } = require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const repo = path.resolve(__dirname, '../..');
const FRAMES = { F02: 'F02-job-selected.html' };
const MIME = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
(async () => {
  const want = process.argv.slice(2); const list = want.length ? want : Object.keys(FRAMES);
  const server = http.createServer((q, r) => { const f = path.join(repo, decodeURIComponent(new URL(q.url, 'http://x').pathname)); try { r.setHeader('Content-Type', MIME[path.extname(f)] || 'text/plain'); r.end(fs.readFileSync(f)); } catch (e) { r.statusCode = 404; r.end(''); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.PIPELINE_CHROMIUM || undefined, args: ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text'] });
  for (const id of list) {
    const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/tests/visual/golden-src/' + FRAMES[id]);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    if (errors.length) { console.error(id, errors); process.exitCode = 1; }
    const out = path.join(repo, 'tests/visual/golden', id + '_2560x1440.png');
    await page.screenshot({ path: out, animations: 'disabled' });
    const words = await page.evaluate(() => {
      const res = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = walker.nextNode())) {
        const t = n.textContent; const re = /\S+/g; let m;
        while ((m = re.exec(t))) { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const b = r.getBoundingClientRect(); if (b.width) res.push([+b.left.toFixed(1), +b.top.toFixed(1), +b.right.toFixed(1), +b.bottom.toFixed(1), m[0]]); }
      }
      // SVG text
      document.querySelectorAll('svg text').forEach(e => { const b = e.getBoundingClientRect(); res.push([+b.left.toFixed(1), +b.top.toFixed(1), +b.right.toFixed(1), +b.bottom.toFixed(1), e.textContent]); });
      return res;
    });
    fs.writeFileSync(path.join(repo, 'tests/visual/golden', id + '.words.json'), JSON.stringify(words));
    console.log(id + ' -> ' + path.relative(repo, out) + ' (' + words.length + ' words)');
    await page.close();
  }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
