/* PAY WORTH drawer chip (Tim 2026-10-19 02:17 ET): "PAY_WORTH n · <area> score n · needs $Xk", same number as the shared scoring,
   full text (no ellipsis), >= 11 px, state also in words when held. Run: node tests/pay-worth.browser.js
   (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/mobile.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  for(const vp of [{width:1440,height:900},{width:390,height:844}]){
    const ctx=await browser.newContext({viewport:vp}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#grid tbody tr[data-id]',{timeout:15000});await page.waitForTimeout(600);
    // pick a fixture row with pay; expected PAY_WORTH from the shared module on the parsed fixture (page model = defaults here)
    const pick=await page.evaluate(fx=>{const rows=PipelineParser.parse(fx).rows||PipelineParser.parse(fx),shown=new Set([...document.querySelectorAll('#grid tbody tr[data-id]')].map(t=>t.getAttribute('data-id')));
      const r=(Array.isArray(rows)?rows:[]).find(x=>shown.has(x.PRIMARY_ID)&&PipelineEvidence.salary(x.payload||{}).mid!=null);return r?{id:r.PRIMARY_ID,expect:PipelineScoring.payWorth(r,PipelineScoring.defaults()).score}:null},fixture);
    assert(pick,'fixture has a shown row with pay');
    await page.locator('#grid tbody tr[data-id="'+pick.id+'"]').first().click();await page.waitForSelector('#drawer .pe-chip.pw',{timeout:5000});
    const got=await page.evaluate(()=>{const el=document.querySelector('#drawer .pe-chip.pw'),cs=getComputedStyle(el);
      return{text:el.textContent,attr:el.getAttribute('data-pay-worth'),fs:parseFloat(cs.fontSize),ell:cs.textOverflow,clip:el.scrollWidth>el.clientWidth+1,line:(document.querySelector('#drawer .pw-line')||{}).textContent||''}});
    assert.match(got.text,/^(PAY HOLD · )?PAY_WORTH \d+ · .+ score \d+ · needs \$\d+k$/,'chip text: '+got.text);
    assert.equal(got.attr,String(pick.expect),'chip shows the shared-module PAY_WORTH');
    assert.match(got.line,/PAY_WORTH \d+ · /,'overview pay line carries PAY_WORTH');
    assert(got.fs>=11,'chip >= 11 px ('+got.fs+')');assert.notEqual(got.ell,'ellipsis');assert(!got.clip,'chip text not clipped');
    if(process.env.PW_SHOT)await page.locator('#drawer').screenshot({path:process.env.PW_SHOT+'/pay-worth-'+vp.width+'.png'});
    assert.deepEqual(errors,[],'no page errors');
    await ctx.close();
  }
  await browser.close();server.close();console.log('pay-worth.browser.js: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
