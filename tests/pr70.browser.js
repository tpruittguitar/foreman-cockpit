'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require(process.env.PIPELINE_PLAYWRIGHT_MODULE||'playwright');
const repo = path.resolve(__dirname,'..');
const out = process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir();
fs.mkdirSync(out,{recursive:true});
const fixture = require(repo + '/tests/gen_population').generate(600, 70);
const assert=require('node:assert/strict');
const O=require(repo+'/pipeline-operations');
const rules = require(repo+'/pipeline-rules').setFlexPolicy(fs.readFileSync(repo + '/tests/fixtures/TIM_PIPELINE_RULES_CANONICAL.sample.txt', 'utf8'),{FLEX_POLICY_VERSION:'RULES_V4_20261007',HIGH_FLEX_MODIFIER:30,SOFT_FLEX_MODIFIER:20,NO_FLEX_MODIFIER:-10,STRICT_MODIFIER:-30,EQUIVALENCY_CLASS:'HIGH_FLEX',FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'});
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
async function main() {
  const server = http.createServer((req, res) => {
    const target = path.resolve(repo, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!target.startsWith(repo + '/')) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', mime[path.extname(target)] || 'text/plain'); res.end(fs.readFileSync(target)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  const evidence = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.PIPELINE_CHROMIUM||undefined, headless: true, args: ['--no-sandbox'] });
    for (const spec of [
      { name: 'preview-desktop-2560x1440', width: 2560, height: 1440, touch: false },
      { name: 'preview-desktop-1280x960', width: 1280, height: 960, touch: false },
      { name: 'preview-portrait', width: 390, height: 844, touch: true },
      { name: 'preview-landscape-left', width: 844, height: 390, touch: true, angle: 90 },
      { name: 'preview-landscape-right', width: 844, height: 390, touch: true, angle: -90 }
    ]) {
      const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, isMobile: spec.touch, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];let canonical=rules;
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(angle => {
        localStorage.setItem('px.cfg', JSON.stringify({ url: location.origin + '/writer', key: 'local-fixture-only' }));
        if (angle) Object.defineProperty(window, 'orientation', { get: () => angle });
      }, spec.angle || 0);
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname !== '127.0.0.1') { await route.abort(); return; }
        if (url.pathname !== '/writer') { await route.continue(); return; }
        if (request.method() !== 'GET') { const submitted=JSON.parse(request.postData());if(submitted.action==='save_rules'){canonical=submitted.rules.text;await route.fulfill({json:{ok:true}});}else await route.fulfill({ json: { ok: false, error: 'Synthetic preview forbids other writes' } }); return; }
        const action = url.searchParams.get('action');
        let body = { ok: true };
        if (action === 'master') body = { ok: true, id: 'synthetic-only', text: fixture, fetchedAt: new Date().toISOString(), modifiedTime: '2026-10-08T20:00:00Z' };
        else if (action === 'canonical_rules') body = { ok: true, text: canonical };
        else if (action === 'writer_status') body = { ok: true, level: 'ok', warnings: [], queue: { processing: [] }, unverified: { pending: [] } };
        else if (action === 'operations') { let d=O.empty(),messages={};for(let n=0;n<103;n++)messages['GMAIL-'+n]={at:'2026-10-09T12:00:00Z',reviewed:n<12,bodyEvidence:n<12?'body:'+n:'',digestComplete:n<12};d=O.update(d,{baseRevision:0,runs:[{id:'EMAIL-SYNTHETIC',messages,sources:{alerts:{planned:true,paginationExhausted:true,evidenceRef:'synthetic-page'}}}]},new Date().toISOString());body={ok:true,store:d,observedAt:new Date().toISOString()};}
        else if (action === 'schedules') body={ok:true,manifest:{schema:1,revision:0,tasks:[],history:[]},nativeControl:'UNSUPPORTED'};
        else if (action === 'state') body = { ok: true, state: {} };
        else if (action === 'runs') body = { ok: true, runs: [] };
        await route.fulfill({ json: body });
      });
      await page.goto('http://127.0.0.1:' + server.address().port + '/pipeline.html');
      if (await page.locator('#rail').isVisible()) {
        await page.locator('#rail').hover();
        await page.locator('#rail [data-tab="pipeline"], #rail [data-go="pipeline"]').first().click();await page.mouse.move(700,450);await page.waitForTimeout(220);
        await page.mouse.move(700, 450);
      } else await page.locator('#bottombar [data-go="pipeline"]').click();
      await page.waitForSelector('#grid tbody tr[data-id]');
      await page.locator('#grid tbody tr[data-id]').first().click();
      await page.waitForTimeout(700);
      if (spec.touch) {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.querySelector('#view-pipeline').scrollTop = 0;
        });
        await page.waitForTimeout(250);
      }
      if (spec.width === 2560) {
        const divider = page.locator('#list-map-divider');
        await divider.waitFor({state:'visible'});
        await page.waitForTimeout(150);
        assert.equal(await divider.getAttribute('aria-valuenow'),'55');
        const before = await page.locator('#worksplit').boundingBox();
        const handle = await divider.boundingBox();
        await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
        await page.mouse.down();
        await page.mouse.move(handle.x+handle.width/2,handle.y-140,{steps:12});
        await page.mouse.up();
        await page.waitForTimeout(200);
        assert((await page.locator('#worksplit').boundingBox()).height < before.height-100);
        const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('px.listMapSplit')));
        assert(saved < .55 && saved > .25);
        await page.screenshot({path:out+'/preview-adjusted-split-2560.png'});
        await page.reload();
        await page.waitForSelector('#grid tbody tr[data-id]');
        await divider.waitFor({state:'visible'});
        await page.waitForTimeout(200);
        assert.equal(await divider.getAttribute('aria-valuenow'),String(Math.round(saved*100)));
        await divider.focus();
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(100);
        assert.equal(await divider.getAttribute('aria-valuenow'),String(Math.round((saved+.02)*100)));
        await divider.dblclick();
        await page.waitForTimeout(150);
        assert.equal(await divider.getAttribute('aria-valuenow'),'55');
        await page.locator('#grid tbody tr[data-id]').first().click();
        await page.mouse.move(700,450);
      }
      if(spec.touch) assert.equal(await page.locator('#list-map-divider').isVisible(),false);
      if(spec.width===2560){
        assert.deepEqual(await page.locator('#rail .rail-group').evaluateAll(es=>es.map(e=>e.dataset.group)),['pipeline','discovery','kit','analytics','preferences','operations']);
        await page.locator('[data-next-job-step]').click();
        assert.equal(await page.locator('#enrich-url').evaluate(e=>e===document.activeElement),true);
        await page.locator('[data-dtab="overview"]').click();
        await page.locator('#drawer details summary').click();
        assert.match(await page.locator('#drawer details').innerText(),/Primary ID/i);
        await page.locator('#drawer details summary').click();
        await page.locator('#rail').hover();await page.locator('#rail [data-tab="scoring"]').first().click();await page.mouse.move(700,450);await page.waitForTimeout(220);
        await page.locator('#score-flex-weight').fill('24');await page.locator('[data-score-weight="experience"]').fill('24');await page.locator('#score-save').click();
        await page.locator('#rail').hover();
        await page.locator('#rail [data-action="profile"]').click();await page.mouse.move(700,450);await page.waitForTimeout(220);
        await page.waitForSelector('#doc-ats-keywords');
        assert.equal(await page.locator('#doc-ats-keywords').evaluate(e=>e===document.activeElement),true);
        const beforeProfile=await page.evaluate(()=>JSON.parse(localStorage.getItem('px.scoring')));
        await page.locator('#doc-ats-keywords').fill('navigation fixture profile');
        await page.locator('#doc-ats-save').click();
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('px.scoring')).resumeKeywords),'navigation fixture profile');
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('px.scoringLocalEdited'))),true);
        await page.locator('#doc-ats-reset').click();
        const afterProfile=await page.evaluate(()=>JSON.parse(localStorage.getItem('px.scoring')));
        if(beforeProfile){assert.deepEqual(afterProfile.weights,beforeProfile.weights);assert.deepEqual(afterProfile.geo,beforeProfile.geo);}
        await page.locator('#rail').hover();await page.locator('#rail [data-action="pay-location"]').click();await page.mouse.move(700,450);await page.waitForTimeout(220);
        assert.equal(await page.locator('[data-salary="floor"]').evaluate(e=>e===document.activeElement),true);
        assert.equal(await page.locator('#score-keywords').count(),0);
        await page.locator('#score-flex-weight').fill('23');await page.locator('[data-score-weight="experience"]').fill('25');await page.locator('#score-save').click();
        await page.locator('#rail').hover();await page.locator('#rail [data-action="schedules"]').click();await page.mouse.move(700,450);await page.waitForTimeout(220);
        assert.equal(await page.locator('[data-ops-tab="schedules"]').getAttribute('aria-selected'),'true');
        await page.locator('#rail').hover();await page.locator('#rail [data-action="system"]').click();await page.mouse.move(700,450);await page.waitForTimeout(220);
        assert.equal(await page.locator('#writer-panel').isVisible(),true);
        await page.locator('#sys-close').click();
        await page.locator('#rail').hover();await page.locator('#rail [data-action="compare"]').click();await page.mouse.move(700,450);await page.waitForTimeout(220);
        assert.equal(await page.locator('#compare-dialog').isVisible(),true);await page.locator('#compare-close').click();
        await page.locator('#rail').hover();await page.locator('#rail [data-preset="ALL"]').click();await page.mouse.move(700,450);await page.waitForTimeout(220);await page.mouse.move(700,450);
        await page.locator('#grid tbody tr[data-id]').first().click();await page.waitForTimeout(800);
        await page.locator('#rail').hover();await page.screenshot({path:out+'/preview-navigation-2560.png'});await page.mouse.move(700,450);await page.waitForTimeout(250);
      }
      if(spec.touch){
        await page.locator('#bottombar [data-go="more"]').click();
        assert.deepEqual(await page.locator('#sheet .sheet-g h4').allTextContents(),['Pipeline','Discovery','Application Kit','Analytics','Preferences','Operations']);
        await page.waitForTimeout(300);await page.screenshot({path:out+'/'+spec.name+'-navigation.png'});
        await page.locator('#sheet .sheet-g').filter({has:page.locator('h4', {hasText:'Preferences'})}).locator('summary').click();
        assert.equal(await page.locator('#sheet [data-go="scoring"]').first().isVisible(),true);
        await page.locator('#sheet-close').click();
      }
      const metrics = await page.evaluate(() => {
        const box = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
        const table = document.querySelector('#worksplit').getBoundingClientRect();
        const visibleRows = [...document.querySelectorAll('#grid tbody tr[data-id]')].filter(e => { const b = e.getBoundingClientRect(); return b.top >= Math.max(0, table.top) && b.bottom <= Math.min(innerHeight, table.bottom); }).length;
        const style=s=>{const e=document.querySelector(s),c=e&&getComputedStyle(e);return c?{fontSize:c.fontSize,padding:c.padding}:null;};
        return { typography:{cell:style('#grid td:not(.mono)'),heading:style('.qh-title'),headerSearch:style('header #search'),detailText:style('.ck-kd li'),drawer:style('#drawer')},visibleRows, map: box(document.querySelector('#job-map-card')), table: box(document.querySelector('#worksplit')), drawer: box(document.querySelector('#drawer')), horizontalOverflow: document.documentElement.scrollWidth - innerWidth, selectedId: document.querySelector('#grid tr.focus')?.dataset.id || null };
      });
      await page.screenshot({ path: out + '/' + spec.name + '.png' });
      if(!spec.touch){
        for(const tab of ['overview','posting','fit','application','documents','history']){
          await page.locator('[data-dtab="'+tab+'"]').click();
          await page.waitForTimeout(100);
          const clipped=await page.evaluate(()=>[...document.querySelectorAll('#drawer .kv>div,#drawer .bpill,#drawer .wchip,#drawer #detail-tabs button,#drawer .ck-kd li span')].filter(e=>{
            const c=getComputedStyle(e);return e.getBoundingClientRect().width>0 && (e.scrollWidth>e.clientWidth+2 || e.scrollHeight>e.clientHeight+2) && ['hidden','clip'].includes(c.overflowX);
          }).map(e=>e.textContent));
          assert.deepEqual(clipped,[],tab+' has clipped workspace text');
          const drawer=page.locator('#drawer');
          assert.equal(await drawer.evaluate(e=>e.scrollWidth>e.clientWidth+2),false,tab+' workspace overflows');
          if(spec.width===2560 && ['application','fit'].includes(tab)) await page.screenshot({path:out+'/preview-'+tab+'-2560.png'});
        }
        await page.locator('[data-dtab="overview"]').click();
      }
      if(!spec.touch){assert(metrics.visibleRows>=15&&metrics.visibleRows<=20);await page.locator('#autobar').click();await page.locator('[data-ops-tab="email"]').click();await page.waitForSelector('[data-ops-catchup]');assert.match(await page.locator('.ops-table').first().innerText(),/103/);assert.match(await page.locator('.ops-table').first().innerText(),/91/);await page.screenshot({path:out+'/preview-operations-email-'+spec.width+'.png'});await page.locator('[data-ops-tab="schedules"]').click();assert.match(await page.locator('.ops-console').innerText(),/UNSUPPORTED/);await page.locator('.ops-console summary').click();await page.locator('[data-ops-task]').fill(JSON.stringify({key:'email-synthetic',owner:'SCOUT',provider:'ChatGPT',enabled:true,timezone:'America/New_York',time:'09:00',days:['MO']}));await page.locator('[data-ops-preview]').click();assert.match(await page.locator('[data-ops-preview-result]').innerText(),/PENDING_MANUAL/);assert.equal(await page.locator('[data-ops-stage]').isEnabled(),true);await page.screenshot({path:out+'/preview-operations-schedules-'+spec.width+'.png'});await page.locator('#rail').hover();await page.locator('#rail [data-tab="scoring"], #rail [data-go="scoring"]').first().click();await page.mouse.move(700,450);await page.waitForTimeout(220);await page.mouse.move(700,450);await page.waitForSelector('#rules-flex-save');assert.match(await page.locator('#view-scoring').innerText(),/FLEX weighting and eligibility policy/i);assert.equal(await page.locator('[data-score-weight="flex"]').count(),1);assert.equal(await page.locator('#score-flex-weight').inputValue(),'23');assert.equal(await page.locator('#fp-high-mod').inputValue(),'30');assert.equal(await page.locator('#fp-soft-mod').inputValue(),'20');await page.locator('[data-flex-weight-save]').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('px.scoring')).weights.flex),23);await page.locator('#rules-flex-save').click();await page.waitForFunction(()=>document.querySelector('#rules-flex-status').textContent.includes('Saved and verified'));assert.equal(await page.locator('[data-score-weight="flex"]').count(),1);assert.equal(await page.locator('#score-flex-weight').inputValue(),'23');for(const id of ['score-flex-weight','fp-high-mod','fp-soft-mod','rules-flex-save']){const b=await page.locator('#'+id).boundingBox();assert(b.y>=0&&b.y+b.height<=spec.height,id+' must be visible without scrolling');}await page.screenshot({path:out+'/preview-scoring-'+spec.width+'.png'});if(spec.width===2560)await page.screenshot({path:out+'/preview-scoring.png'});await page.locator('#rail').hover();await page.locator('#rail [data-tab="rules"], #rail [data-go="rules"]').first().click();await page.mouse.move(700,450);await page.waitForTimeout(220);await page.mouse.move(700,450);assert.equal(await page.locator('#view-rules #rules-flex-save').count(),0);}
      assert.equal(metrics.horizontalOverflow,0);assert.deepEqual(errors,[]);
      evidence.push({ ...spec, ...metrics, errors, fixture: '600 synthetic jobs; no production access', limitation: spec.touch ? 'Chromium landscape emulation; physical iOS safe-area insets are not verified' : '' });
      await context.close();
    }
    fs.writeFileSync(out + '/preview-ui-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence));
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
