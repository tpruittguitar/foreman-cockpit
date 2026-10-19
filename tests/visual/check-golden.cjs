/* BUILD 5 (Grok Bot rev4): re-render the golden frames with the pinned Playwright Chromium and the repo fonts, and compare
   them to the committed PNGs. Read only: the committed golden files are never written here.
   node tests/visual/check-golden.cjs   (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for render-golden.cjs)
   System fonts are limited to tests/visual/fonts.conf (same fallback glyphs on every machine).
   Fails when any frame differs in more than VISUAL_GOLDEN_MAX_PERCENT (default 0.05) % of its pixels. Diff PNGs go to
   tests/visual/artifacts/golden-check/. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { PNG } = require('pngjs'); const pm = require('pixelmatch'); const pixelmatch = pm.default || pm;
const repo = path.resolve(__dirname, '../..');
const max = Number(process.env.VISUAL_GOLDEN_MAX_PERCENT || 0.05);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-check-'));
const art = path.join(repo, 'tests/visual/artifacts/golden-check'); fs.mkdirSync(art, { recursive: true });
execFileSync(process.execPath, [path.join(__dirname, 'render-golden.cjs')], { stdio: 'inherit', env: Object.assign({ FONTCONFIG_FILE: path.join(__dirname, 'fonts.conf') }, process.env, { VISUAL_GOLDEN_OUT: tmp }) });
let failed = 0;
for (const id of ['F01', 'F02']) {
  const want = PNG.sync.read(fs.readFileSync(path.join(repo, 'tests/visual/golden', id + '_2560x1440.png')));
  const got = PNG.sync.read(fs.readFileSync(path.join(tmp, id + '_2560x1440.png')));
  if (want.width !== got.width || want.height !== got.height) { if (process.env.GITHUB_ACTIONS) console.log('::error title=golden ' + id + '::size mismatch'); console.error(id + ': size ' + got.width + 'x' + got.height + ' vs ' + want.width + 'x' + want.height); failed++; continue; }
  const diff = new PNG({ width: want.width, height: want.height });
  const n = pixelmatch(want.data, got.data, diff.data, want.width, want.height, { threshold: 0.1 });
  const pct = n / (want.width * want.height) * 100;
  fs.writeFileSync(path.join(art, id + '-actual.png'), PNG.sync.write(got)); fs.writeFileSync(path.join(art, id + '-diff.png'), PNG.sync.write(diff));
  console.log(id + ': ' + n + ' differing pixels (' + pct.toFixed(4) + '%), limit ' + max + '%');
  if (process.env.GITHUB_ACTIONS) console.log('::' + (pct > max ? 'error' : 'notice') + ' title=golden ' + id + '::' + id + ' ' + n + ' differing pixels (' + pct.toFixed(4) + '%), limit ' + max + '%');   // readable as a check annotation
  if (n) {   // where the differences are: bounding box + the busiest 64 px tiles (readable in the CI annotation)
    const W = want.width, tiles = {}; let x0 = W, y0 = want.height, x1 = -1, y1 = -1;
    for (let i = 0; i < W * want.height; i++) { const r = diff.data[i * 4], g = diff.data[i * 4 + 1], b = diff.data[i * 4 + 2]; if (r === 255 && g === 0 && b === 0) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); const k = (x >> 6) + ',' + (y >> 6); tiles[k] = (tiles[k] || 0) + 1; } }
    const top = Object.entries(tiles).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => { const [tx, ty] = k.split(','); return (tx * 64) + ',' + (ty * 64) + ':' + v; }).join(' ');
    const where = 'bbox ' + x0 + ',' + y0 + '-' + x1 + ',' + y1 + ' tiles ' + top;
    console.log(id + ' ' + where); if (process.env.GITHUB_ACTIONS) console.log('::warning title=golden ' + id + ' where::' + where);
  }
  if (pct > max) failed++;
}
if (failed) { console.error('golden check FAILED (' + failed + ' frame(s))'); process.exit(1); }
console.log('golden check PASS');
