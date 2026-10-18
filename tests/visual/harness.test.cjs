const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {PNG} = require('pngjs');
const {diffPNGs, parseTokens} = require('./run.cjs');
const repo = path.resolve(__dirname, '../..');

test('pixel ratio uses percentages and includes antialias differences', () => {
  const a = new PNG({width:100,height:100}); a.data.fill(255);
  const b = PNG.sync.read(PNG.sync.write(a));
  for (let i=0;i<21;i++) { b.data[i*4]=0; b.data[i*4+1]=0; b.data[i*4+2]=0; }
  const result = diffPNGs(PNG.sync.write(a), PNG.sync.write(b), 0.2);
  assert.equal(result.percent, 0.21); assert.equal(result.passed, false);
  assert.equal(diffPNGs(PNG.sync.write(a), PNG.sync.write(b), 0.22).passed, true);
});

test('real browser rejects independent token, box, motion and screenshot regressions', {timeout:120000}, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-contract-'));
  try {
    const original = JSON.parse(fs.readFileSync(path.join(__dirname,'elements.json')));
    const geometry = JSON.parse(fs.readFileSync(path.join(__dirname,'geometry.json')));
    geometry.viewports = geometry.viewports.slice(0,1);
    const geometryPath = path.join(temp,'geometry.json');
    const configPath = path.join(temp,'elements.json');
    const tokenText = fs.readFileSync(path.join(repo,original.tokens),'utf8');
    for (const kind of ['tokens','geometry','motion','pixels']) {
      const config = structuredClone(original), boxes = structuredClone(geometry);
      if (kind === 'tokens' || kind === 'motion') {
        config.tokens = path.join(temp,'changed.css');
        fs.writeFileSync(config.tokens, kind === 'tokens' ? tokenText.replace('#111111','#ff0000') : tokenText.replace('240ms','241ms'));
      }
      if (kind === 'geometry') boxes.viewports[0].boxes.panel.x += 2;
      if (kind === 'pixels') {
        config.goldenDir = temp;
        const png = PNG.sync.read(fs.readFileSync(path.join(repo,original.goldenDir,'desktop.png')));
        png.data.fill(255);
        fs.writeFileSync(path.join(temp,'desktop.png'),PNG.sync.write(png));
      }
      fs.writeFileSync(configPath,JSON.stringify(config)); fs.writeFileSync(geometryPath,JSON.stringify(boxes));
      const result = spawnSync(process.execPath,[path.join(__dirname,'run.cjs')], {
        cwd:repo, env:{...process.env,VISUAL_ELEMENTS:configPath,VISUAL_GEOMETRY:geometryPath,VISUAL_ARTIFACTS:path.join(temp,'artifacts'),VISUAL_DIFF_PERCENT:'0.2'}, encoding:'utf8', timeout:25000
      });
      assert.equal(result.status,1,`${kind} must fail: ${result.stdout}${result.stderr}`);
      const reason = {tokens:/page\/background-color/,geometry:/panel.x/,motion:/animation duration/,pixels:/differing pixels exceeds/}[kind];
      assert.match(result.stderr,reason,`${kind} fails for the intended reason`);
    }
    assert.equal(parseTokens(path.join(repo,original.tokens))['--sample-duration'],'240ms');
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
