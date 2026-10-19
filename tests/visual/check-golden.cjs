/* BUILD 5 (Grok Bot rev4): re-render the golden frames with the pinned Playwright Chromium and the repo fonts, and compare
   them to the committed PNGs. Read only: the committed golden files are never written here.
   node tests/visual/check-golden.cjs   (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for render-golden.cjs)
   Fails when any frame differs in more than VISUAL_GOLDEN_MAX_PERCENT (default 0.05) % of its pixels. Diff PNGs go to
   tests/visual/artifacts/golden-check/. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { PNG } = require('pngjs'); const pm = require('pixelmatch'); const pixelmatch = pm.default || pm;
const repo = path.resolve(__dirname, '../..');
const max = Number(process.env.VISUAL_GOLDEN_MAX_PERCENT || 0.05);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-check-'));
const art = path.join(repo, 'tests/visual/artifacts/golden-check'); fs.mkdirSync(art, { recursive: true });
execFileSync(process.execPath, [path.join(__dirname, 'render-golden.cjs')], { stdio: 'inherit', env: Object.assign({}, process.env, { VISUAL_GOLDEN_OUT: tmp }) });
let failed = 0;
for (const id of ['F01', 'F02']) {
  const want = PNG.sync.read(fs.readFileSync(path.join(repo, 'tests/visual/golden', id + '_2560x1440.png')));
  const got = PNG.sync.read(fs.readFileSync(path.join(tmp, id + '_2560x1440.png')));
  if (want.width !== got.width || want.height !== got.height) { console.error(id + ': size ' + got.width + 'x' + got.height + ' vs ' + want.width + 'x' + want.height); failed++; continue; }
  const diff = new PNG({ width: want.width, height: want.height });
  const n = pixelmatch(want.data, got.data, diff.data, want.width, want.height, { threshold: 0.1 });
  const pct = n / (want.width * want.height) * 100;
  fs.writeFileSync(path.join(art, id + '-actual.png'), PNG.sync.write(got)); fs.writeFileSync(path.join(art, id + '-diff.png'), PNG.sync.write(diff));
  console.log(id + ': ' + n + ' differing pixels (' + pct.toFixed(4) + '%), limit ' + max + '%');
  if (pct > max) failed++;
}
if (failed) { console.error('golden check FAILED (' + failed + ' frame(s))'); process.exit(1); }
console.log('golden check PASS');
