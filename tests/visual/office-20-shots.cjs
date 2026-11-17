// Before/after screenshots for the office page (demo data, swiftshader). Same approach as the office shots helper.
//   node tests/visual/office-20-shots.cjs <repo-root> <before|after> [out-dir]
// Needs playwright (PLAYWRIGHT_DIR env = a node_modules parent holding it; defaults to resolving normally).
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_DIR ? require.resolve('playwright', { paths: [process.env.PLAYWRIGHT_DIR] }) : 'playwright');
const [repo, tag, out0] = process.argv.slice(2), OUT = out0 || path.join(__dirname, 'build', 'office-20');
const MIME = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = require('http').createServer((req, res) => { const u = new URL(req.url, 'http://x'), f = path.join(repo, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
  await new Promise(r => server.listen(0, r));
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.route(/https:\/\/(raw\.githubusercontent\.com|api\.github\.com)\/.*/, r => r.fulfill({ status: 500, body: 'offline' }));
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(`http://localhost:${server.address().port}/office.html?demo=1`);
  await p.waitForFunction(() => window.__office && window.__office.ready && window.__office.frames > 30, null, { timeout: 120000 });
  await p.waitForTimeout(8000);
  const shot = async (name, view, wait = 3000) => { if (view) await p.evaluate(v => window.__office.view(v[0], v[1]), view); await p.waitForTimeout(wait); await p.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); console.log('wrote', tag, name); };
  // walk camera: the default start view (eye height before: 1.75 m, after: President head height)
  await shot('walk-camera-start', null, 1500);
  const eye = await p.evaluate(() => (window.OfficeLogic && window.OfficeLogic.EYE_HEIGHT) || 1.75);
  await shot('walk-camera-lounge', [[5.2, eye, 5.4], [9.3, eye - 0.3, 1.3]], 2500);
  // bike: open floor between the pool table and the waterfall wall, in front of the lounge chair
  await shot('bike', [[6.2, 2.6, 5.4], [9.4, 0.5, 1.6]], 2500);
  // President avatar close-up
  await p.evaluate(() => window.__office.view([1.0, 1.25, 7.5], [1.0, 0.92, 6.2]));
  await p.evaluate(() => window.__office.spotlight('President', 1.0, 6.2));
  await p.waitForFunction(() => /President:stand/.test(window.__office.info().poses.join()), null, { timeout: 90000 });
  await shot('president', [[1.0, 1.2, 7.1], [1.0, 1.0, 6.2]], 3000);
  await b.close(); server.close();
})();
