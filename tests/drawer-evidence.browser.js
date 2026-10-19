/* REV-066 (spec v1.5.2 B-4 / B-5, Grok Bot R-3 + E-10 re-ruling): soft evidence lines show ≈ + "soft" in amber, apart
   from "?" unknown; Research / Blocked bucket words in Secondary; "Screen gate FAIL" keeps the word without ▸.
   2560 x 1440, fixture + mocked Writer (harness from review-delta.browser.js). Run: node tests/drawer-evidence.browser.js */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const JOB='V2X-A4CCD49EE686';
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function open(opts){
    const ctx=await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1});const page=await ctx.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    if(opts.ls)await page.addInitScript(ls=>{Object.keys(ls).forEach(k=>localStorage.setItem(k,ls[k]))},opts.ls);
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
    const W={old:!!opts.oldWriter,refuse:opts.refuse||0,stateFail:opts.stateFail||0,stateReads:0,inFlight:0,maxInFlight:0,store:opts.keepState?{seen:{},reviewed:{}}:null,lie:opts.lie||0};   // old Writer (before REV-053): answers ok with no "reviewed" count and keeps nothing
    await page.route('**/writer*',async r=>{const q=r.request();if(q.method()==='POST'){let b={};try{b=JSON.parse(q.postData()||'{}')}catch(e){}posts.push(b);
        if(b.action==='state'&&opts.postDelay){W.inFlight++;W.maxInFlight=Math.max(W.maxInFlight,W.inFlight);await new Promise(x=>setTimeout(x,opts.postDelay));W.inFlight--}
        if(b.action==='state'&&W.store){Object.assign(W.store.reviewed,(b.state||{}).reviewed||{});Object.assign(W.store.seen,(b.state||{}).seen||{});
          if(W.lie>0){W.lie--;return r.fulfill({json:{ok:false,error:'Lock timeout: another process was holding the lock for too long.'}})}}
        if(b.action==='state'&&W.refuse>0){W.refuse--;return r.fulfill({json:{ok:false,error:'Writer busy (test)'}})}
        return r.fulfill({json:W.old||b.action!=='state'?{ok:true}:{ok:true,seen:Object.keys((b.state||{}).seen||{}).length,incidents:0,reviewed:Object.keys((b.state||{}).reviewed||{}).length}})}
      if(opts.stateDelay&&new URL(q.url()).searchParams.get('action')==='state')await new Promise(x=>setTimeout(x,opts.stateDelay));
      const a=new URL(q.url()).searchParams.get('action');if(a==='state'){W.stateReads++;if(W.stateFail>0){W.stateFail--;return r.abort('failed')}}
      return r.fulfill({json:a==='master'?{ok:true,id:'m',text:opts.master||fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:
        a==='scoring'?(opts.model===false?{ok:true,exists:false}:{ok:true,exists:true,model:{publishedRevision:26,modelVersion:'test'}}):
        a==='state'?{ok:true,state:W.store?JSON.parse(JSON.stringify(W.store)):opts.state||{seen:{},reviewed:{}}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(2500);
    return {ctx,page,errors,posts,W};
  }
  // 1. Soft evidence (B-4): a job with FLEX_CLASS=SOFT_FLEX and FIT_SCORE=70 shows ≈ soft lines in amber; a missing value stays "?" unknown
  {const lines=fixture.split('\n'),i=lines.findIndex(l=>l.includes(JOB));lines[i]=lines[i].replace(/\s*$/,'; FLEX_CLASS=SOFT_FLEX; FIT_SCORE=70');
    const {ctx,page,errors}=await open({master:lines.join('\n')});
    await page.evaluate(id=>{const tr=[...document.querySelectorAll('#grid tbody tr[data-id]')].find(t=>t.dataset.id===id);tr.click()},JOB);await page.waitForTimeout(900);
    const items=await page.$$eval('#drawer .ck-checks li',els=>els.map(e=>({text:e.firstChild.textContent.trim(),cls:e.className,word:(e.querySelector('small')||{}).textContent,glyph:getComputedStyle(e,'::before').content,col:getComputedStyle(e,'::before').color})));
    const amber=await page.evaluate(()=>{const d=document.createElement('i');d.style.color='var(--pe-amber)';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c});
    const flex=items.find(x=>x.text==='Degree FLEX'),work=items.find(x=>x.text==='Work content');
    assert(flex&&work,'evidence lines: '+JSON.stringify(items));
    for(const x of [flex,work]){assert.equal(x.cls,'soft',x.text+' is soft: '+JSON.stringify(x));assert.equal(x.word,'soft');assert.equal(x.glyph,'"≈"');assert.equal(x.col,amber,x.text+' ≈ in amber')}
    assert(items.some(x=>x.cls==='unk'&&x.glyph==='"?"'&&x.word==='unknown')||items.every(x=>x.cls!=='unk'),'unknown keeps ?');
    assert.deepEqual(errors,[]);await ctx.close();}

  // 2. B-5: Research / Blocked bucket words in Secondary; Screen gate FAIL has no ▸
  {const {ctx,page,errors}=await open({});
    const sec=await page.evaluate(()=>{const d=document.createElement('i');d.style.color='var(--pe-text-secondary)';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c});
    const cols=await page.$$eval('#grid td .bpill.b-MANUAL_RESEARCH, #grid td .bpill.b-BLOCKED',els=>els.map(e=>getComputedStyle(e).color));
    assert(cols.length>0,'fixture has Research / Blocked rows');cols.forEach(c=>assert.equal(c,sec,'bucket word in Secondary'));
    const src=await page.evaluate(()=>[...document.scripts].map(s=>s.textContent).join('\n'));assert(!/▸ FAIL/.test(src),'no ▸ before FAIL');
    assert.deepEqual(errors,[]);await ctx.close();}

  await browser.close();server.close();console.log('drawer-evidence.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
