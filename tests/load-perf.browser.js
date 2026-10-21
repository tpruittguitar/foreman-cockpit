/* REV-093 (perf, Grok 00:26 ET: cut the live load): an unchanged structured re-read after the background Writer re-import does
   not rebuild the table; a changed one is applied; parallel geocode results all persist (none asked again on the next visit);
   geocoder misses are remembered for 7 days. Run: node tests/load-perf.browser.js */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const JOB='V2X-A4CCD49EE686';
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const lines=fixture.split('\n'),srcLines=lines.filter(l=>/^\d+ \| V2X-[0-9A-F]+ \|/.test(l));
  async function open(opts){
    const ctx=await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1});const page=await ctx.newPage(),errors=[],N={geo:0,geoNames:new Set(),jobs:0,imports:0};
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    if(opts.ls)await page.addInitScript(ls=>{Object.keys(ls).forEach(k=>{if(localStorage.getItem(k)==null)localStorage.setItem(k,ls[k])})},opts.ls);
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',async r=>{const name=new URL(r.request().url()).searchParams.get('name');N.geo++;N.geoNames.add(name);
      await new Promise(x=>setTimeout(x,40+Math.random()*200));r.fulfill({json:{results:[{name,latitude:35+Math.random(),longitude:-90+Math.random(),admin1:'Tennessee'}]}})});
    await page.route('**/api/structured/jobs*',r=>{const u=new URL(r.request().url()),lim=+u.searchParams.get('limit')||250,off=+u.searchParams.get('offset')||0;N.jobs++;
      r.fulfill({json:{ok:true,total:srcLines.length,meta:{generatedAt:'2026-10-20T05:00:00Z'},jobs:srcLines.slice(off,off+lim).map(l=>({SOURCE_LINE:l}))}})});
    await page.route('**/api/structured/admin/import-from-writer',async r=>{N.imports++;await new Promise(x=>setTimeout(x,300));r.fulfill({json:{ok:true,imported:srcLines.length}})});
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');
      r.fulfill({json:a==='scoring'?{ok:true,exists:true,model:{publishedRevision:26,modelVersion:'test'}}:a==='state'?{ok:true,state:{seen:{},reviewed:{}}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?open=jobs');await page.waitForSelector('#grid tbody tr[data-id]');
    return {ctx,page,errors,N};
  }
  const pages=Math.ceil(srcLines.length/250);
  const reread=(page,N)=>page.waitForFunction(()=>true).then(async()=>{for(let k=0;k<150&&!(N.imports>=1&&N.jobs>=2*pages);k++)await page.waitForTimeout(100);await page.waitForTimeout(1500)});
  // 1. the background Writer re-import reads the runtime again; unchanged rows give the same text, so the table is not rebuilt
  {const {ctx,page,errors,N}=await open({});await page.evaluate(()=>{document.querySelectorAll('#grid tbody tr[data-id]').forEach(tr=>tr.__keep=1)});
    await reread(page,N);
    const k=await page.evaluate(()=>{const trs=[...document.querySelectorAll('#grid tbody tr[data-id]')];return {n:trs.length,kept:trs.filter(t=>t.__keep).length}});
    assert.equal(N.imports,1,'one background re-import');assert.equal(N.jobs,2*pages,'the runtime was read twice: '+N.jobs+' pages');
    assert(k.n>0&&k.kept===k.n,'identical re-read keeps every row node (no full rebuild): '+k.kept+'/'+k.n);
    assert.deepEqual(errors,[]);await ctx.close()}
  // 2. a changed runtime on the re-read is still applied (the table is rebuilt)
  {const {ctx,page,errors,N}=await open({});await page.evaluate(()=>{document.querySelectorAll('#grid tbody tr[data-id]').forEach(tr=>tr.__keep=1)});
    const gone=srcLines.shift();await reread(page,N);srcLines.unshift(gone);
    const k=await page.evaluate(()=>{const trs=[...document.querySelectorAll('#grid tbody tr[data-id]')];return {n:trs.length,kept:trs.filter(t=>t.__keep).length}});
    assert(k.n>0&&k.kept===0,'changed re-read rebuilds the table: '+k.kept+'/'+k.n);
    assert.deepEqual(errors,[]);await ctx.close()}
  // 3. geocode results from parallel lookups all persist, so a second visit asks the geocoder for nothing already found
  {const {ctx,page,errors,N}=await open({});await page.waitForFunction(()=>{const s=document.getElementById('map-loc-status');return s&&!/LOCATING/.test(s.textContent)},null,{timeout:20000});await page.waitForTimeout(1500);
    const first=N.geo,names=[...N.geoNames];assert(first>=3,'the map draw geocoded several places: '+first);
    const stored=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('px.geoCache')||'{}')).length);
    assert(stored>=names.length,'every geocoded place stored ('+stored+' stored, '+names.length+' asked)');
    N.geo=0;await page.reload();await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForFunction(()=>{const s=document.getElementById('map-loc-status');return s&&!/LOCATING/.test(s.textContent)},null,{timeout:20000});await page.waitForTimeout(1500);
    assert.equal(N.geo,0,'second visit: no geocode requests for places already found ('+N.geo+')');
    assert.deepEqual(errors,[]);await ctx.close()}
  // 4. a place with no geocoder result is remembered as a miss for 7 days (state fallback meanwhile)
  {const ctx=await browser.newContext({viewport:{width:2560,height:1440}});const page=await ctx.newPage();let asks=0;
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',r=>{asks++;r.fulfill({json:{results:[]}})});
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString()}:a==='state'?{ok:true,state:{seen:{},reviewed:{}}}:{ok:true,exists:false}})});
    await page.goto(base+'/pipeline.html?src=writer&open=jobs');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(4000);const a1=asks;
    assert(a1>=1,'misses asked once: '+a1);asks=0;await page.reload();await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(4000);
    assert.equal(asks,0,'remembered misses are not asked again ('+asks+')');await ctx.close()}
  // 5. REV-098: the canonical rules and published revision arrive late; on a second visit the kept copy gives the same scoring
  //    fingerprint at first paint, so each row is scored about once (live before: 4,629 scoreRow calls for 1,183 rows)
  {const rules=fs.readFileSync(repo+'/tests/fixtures/TIM_PIPELINE_RULES_CANONICAL.sample.txt','utf8');
    const ctx=await browser.newContext({viewport:{width:2560,height:1440}});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));window.__scored=0;let P;
      Object.defineProperty(window,'PipelineScoring',{configurable:true,get(){return P},set(v){const o=v.scoreRow;v.scoreRow=function(){window.__scored++;return o.apply(this,arguments)};P=v}})});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
    await page.route('**/api/structured/jobs*',r=>{const u=new URL(r.request().url()),lim=+u.searchParams.get('limit')||250,off=+u.searchParams.get('offset')||0;
      r.fulfill({json:{ok:true,total:srcLines.length,meta:{generatedAt:'2026-10-20T05:00:00Z'},jobs:srcLines.slice(off,off+lim).map(l=>({SOURCE_LINE:l}))}})});
    await page.route('**/api/structured/admin/import-from-writer',r=>r.fulfill({json:{ok:true}}));
    await page.route('**/writer*',async r=>{const a=new URL(r.request().url()).searchParams.get('action');
      if(a==='scoring'||a==='canonical_rules')await new Promise(x=>setTimeout(x,1500));   // the Writer answers after the first paint
      r.fulfill({json:a==='scoring'?{ok:true,exists:true,publishedRevision:26,model:{modelVersion:'test',publishedRevision:26}}:a==='canonical_rules'?{ok:true,text:rules}:a==='state'?{ok:true,state:{seen:{},reviewed:{}}}:{ok:true}})});
    const settle=async()=>{await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(5000)};
    await page.goto(base+'/pipeline.html?open=jobs');await settle();const first=await page.evaluate(()=>window.__scored);
    assert(await page.evaluate(()=>!!localStorage.getItem('px.scoringSeedV1')),'rules + revision kept after the first visit');
    await page.reload();await settle();const second=await page.evaluate(()=>window.__scored);const n=srcLines.length;
    assert(second<=n+15,'second visit scores each row about once (plus a fixed few for the dashboard): '+second+' calls for '+n+' rows (first visit '+first+')');
    assert(first>second,'the kept copy saves a pass: first '+first+', second '+second);
    assert.deepEqual(errors,[]);await ctx.close()}
  await browser.close();server.close();console.log('load-perf.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
