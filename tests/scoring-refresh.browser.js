/* Browser proof, UI only: changing scoring inputs re-derives the scores the Explorer displays,
   with no Writer row submission, no master rewrite or re-read, and no bucket/application-state change.
   Inputs exercised: canonical Rules FLEX policy (Reload and Save), scoring weights, salary model,
   geo model, and a geocode result landing in px.geoCache. Model version / revision changes are
   covered by tests/governed-flex-policy.test.js (fingerprint). Run: node tests/scoring-refresh.browser.js */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),R=require('../pipeline-rules');
const repo=require('path').resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const baseRules=fs.readFileSync(repo+'/tests/fixtures/TIM_PIPELINE_RULES_CANONICAL.sample.txt','utf8');
const rulesWith=high=>R.setFlexPolicy(baseRules,{HIGH_FLEX_MODIFIER:high,SOFT_FLEX_MODIFIER:20,NO_FLEX_MODIFIER:-15,STRICT_MODIFIER:-30});
const RULES_V3=rulesWith(30),RULES_RELOAD=rulesWith(12),RULES_SAVED=rulesWith(7);
const MODEL={modelId:'TIM_WEIGHTED_JOB_RATING',modelVersion:'2026-10-04.1',publishedRevision:9,weights:{experience:29,flex:24,compensation:20,geo:22,ats:0,title:5,culture:0,ownership:0},
  geo:{power:2,controlPoints:[{name:'Cleveland, TN',lat:35.1595,lon:-84.8766,score:100,hard:false},{name:'Seattle, WA',lat:47.6062,lon:-122.3321,score:5,hard:false}]},
  salary:{floor:180000,target:220000,ceiling:320000,stateFactors:{TN:1}}};
const FLEX_ROW='V2X-E48592F5CB73';   // fixture: HIGH_FLEX, raw fit 40, salary known
const GEO_ROW='V2X-E1022416175B';    // fixture: "Pensacola, FL", scored at the FL state centroid until geocoded
const ROW_WRITES=/^(ruling|submit|intake|enrich|upsert_application|data_discovery|bulk|decline|apply|approve)/i;
async function go(page,tab){const rail=page.locator('#rail');if(await rail.isVisible()){await rail.hover();if((await page.locator('#rail .rail-in').boundingBox()).width<100){await page.locator('#rail [data-group-btn]').first().click();await page.waitForTimeout(250)}await page.locator('#rail [data-tab="'+tab+'"], #rail [data-go="'+tab+'"]').first().click();await page.mouse.move(700,450);await page.waitForTimeout(150);return}await page.locator('#menu-btn').click();await page.locator('#sheet [data-go="'+tab+'"]').click();await page.waitForTimeout(150)}
(async()=>{
  let rulesText=RULES_V3;const gets={},posts=[];
  const server=require('http').createServer((req,res)=>{const file=repo+new URL(req.url,'http://x').pathname;try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}catch(e){res.statusCode=404;res.end('missing')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'})));
  // The GEO_ROW lookup is held until the test releases it, so the row is first scored (and cached) at the state centroid.
  let geocodes=0,release;const gate=new Promise(r=>release=r);
  await page.route('**/geocoding-api.open-meteo.com/**',async r=>{geocodes++;if(/Pensacola/i.test(r.request().url()))await gate;return r.fulfill({json:{results:[{latitude:47.6062,longitude:-122.3321,admin1:'Florida'}]}})});
  await page.route('**/writer*',async r=>{const req=r.request(),a=new URL(req.url()).searchParams.get('action');let body={ok:true};
    if(req.method()==='POST'){const b=JSON.parse(req.postData()||'{}');posts.push(b.action||'');if(b.action==='save_rules')rulesText=b.rules.text;}
    else{gets[a]=(gets[a]||0)+1;
      if(a==='master')body={ok:true,id:'test-master',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'};
      else if(a==='canonical_rules')body={ok:true,text:rulesText};
      else if(a==='scoring')body={ok:true,exists:true,model:MODEL};
      else if(a==='runs')body={ok:true,runs:[]};else if(a==='state')body={ok:true,state:{}};}
    await r.fulfill({json:body});});
  await page.goto('http://127.0.0.1:'+server.address().port+'/pipeline.html');
  await go(page,'pipeline');await page.waitForSelector('#grid tbody tr[data-id="'+FLEX_ROW+'"]');
  const grid=async()=>page.evaluate(()=>[...document.querySelectorAll('#grid tbody tr[data-id]')].map(tr=>tr.dataset.id+'|'+((tr.querySelector('.bpill')||{}).textContent||'')).join('\n'));
  const masterGets=gets.master,bucketsBefore=await grid();
  // Displayed rating card for a row (Fit tab of the Job Workspace).
  async function card(id){await page.locator('#grid tbody tr[data-id="'+id+'"]').first().click();await page.locator('[data-dtab="fit"]').click();await page.waitForTimeout(100);
    const t=await page.locator('#d-body').innerText(),m=t.match(/Raw scope fit (\d+) \+ FLEX modifier ([+-]\d+) → adjusted fit (\d+)/);assert(m,'rating card shows raw/modifier/adjusted for '+id);
    const comp=(t.match(/Net compensation\s*\n\s*(\d+|—)/i)||[])[1],geo=t.match(/Geographic preference\s*\n\s*(\d+|—)[^\n]*\n([^\n]*)/i)||[];
    return {raw:+m[1],mod:+m[2],adj:+m[3],overall:(await page.locator('#d-body .detail-card.full b').first().innerText()).trim(),comp,geo:geo[1],geoBasis:geo[2]||''}}
  async function waitMod(id,mod){for(let i=0;i<40;i++){const c=await card(id);if(c.mod===mod)return c;await page.waitForTimeout(150)}return card(id)}

  const a=await waitMod(FLEX_ROW,30);
  assert.equal(a.mod,30,'canonical Rules v3 HIGH_FLEX +30 drives the displayed modifier');assert.equal(a.adj,Math.min(100,a.raw+30));

  // 1. Rules Reload: the canonical text changed on the server; Reload pulls it; the display follows.
  rulesText=RULES_RELOAD;await go(page,'rules');await page.locator('#rules-reload').click();await page.waitForTimeout(300);await go(page,'pipeline');
  const b=await card(FLEX_ROW);
  assert.equal(b.mod,12,'reloaded Rules modifier displayed');assert.equal(b.adj,Math.min(100,b.raw+12));assert.equal(b.raw,a.raw,'raw fit never absorbs the modifier');
  assert.equal(b.overall,a.overall,'overall ignores modifier magnitude: FLEX weighs in only as its own class-based component');

  // 2. Rules Save through the Explorer (save_rules + readback).
  await go(page,'rules');await page.locator('#rules-mode').click();await page.locator('#rules-edit').fill(RULES_SAVED);await page.locator('#rules-save').click();await page.waitForTimeout(400);await go(page,'pipeline');
  const c=await card(FLEX_ROW);assert.equal(c.mod,7,'saved Rules modifier displayed');assert.equal(c.adj,Math.min(100,c.raw+7));

  // 3. Weights (Scoring tab, local save).
  await go(page,'scoring');await page.locator('[data-score-weight="experience"]').fill('19');await page.locator('[data-score-weight="flex"]').fill('34');await page.locator('#score-save').click();await page.waitForTimeout(150);
  await go(page,'pipeline');const d=await card(FLEX_ROW);assert.notEqual(d.overall,c.overall,'weight change re-derives the displayed overall');assert.equal(d.mod,7);

  // 4. Salary model.
  await go(page,'scoring');await page.locator('[data-salary="floor"]').fill('900000');await page.locator('[data-salary="target"]').fill('950000');await page.locator('[data-salary="ceiling"]').fill('1000000');await page.locator('#score-save').click();await page.waitForTimeout(150);
  await go(page,'pipeline');const e=await card(FLEX_ROW);assert.notEqual(e.comp,d.comp,'salary model change re-derives the compensation component');assert.equal(e.comp,'0','midpoint far below the new floor scores 0');

  // 5. Geo model: the Seattle control point (where the routed geocoder puts this row) rises to 90.
  await go(page,'scoring');await page.locator('[data-point="score"][data-i="1"]').fill('90');await page.locator('#score-save').click();await page.waitForTimeout(150);
  await go(page,'pipeline');const f=await card(FLEX_ROW);assert.notEqual(f.geo,e.geo,'geo model change re-derives the geo component');assert.equal(f.geo,'90');

  // 6. Geocode: selecting a centroid-scored row geocodes it; the cached centroid score must not survive.
  const g0=await card(GEO_ROW);release();await page.waitForTimeout(600);const g1=await card(GEO_ROW);
  console.log('geocode',{calls:geocodes,before:[g0.geo,g0.geoBasis],after:[g1.geo,g1.geoBasis]});
  assert(/state centroid/.test(g0.geoBasis),'precondition: first render is the FL state centroid');
  assert(!/state centroid/.test(g1.geoBasis),'after the geocode lands, the row is rescored at its geocoded point');

  // Nothing canonical moved.
  assert.equal(await grid(),bucketsBefore,'row set and bucket pills unchanged');
  assert.equal(gets.master,masterGets,'no master re-read was needed to display new scores');
  // 'state' is the viewer-state file (seen marks), written when a row is selected; it never touches the master.
  assert.deepEqual(posts.filter(p=>p!=='save_rules'&&p!=='state'),[],'no Writer submission besides the Rules save itself');
  assert.equal(posts.filter(p=>p==='save_rules').length,1,'exactly one Rules save');
  assert(!posts.some(p=>ROW_WRITES.test(p)),'no row writes');
  assert.deepEqual(errors,[],'no browser errors');
  console.log('scoring refresh browser checks passed',JSON.stringify({a,b,c,d,e,f,posts}));
  await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
