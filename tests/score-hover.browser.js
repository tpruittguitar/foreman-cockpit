/* REV-063 (spec v1.5.2 B-1 / B-2, Grok Bot V-19): the score hover names the percentile band, rank, N and time; the old
   band() label (PRIORITY / STRONG / WATCH / WEAK / NO-GO) never shows. Fixture + mocked Writer (harness from
   review-delta.browser.js). Run: node tests/score-hover.browser.js */
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
  // 1. 130 extra open jobs: bands on. Score hover = "◆ UPPER · 58 · #66 of N eligible open · HH:MM"; no band() word anywhere
  {const lines=fixture.split('\n'),tpl=lines.find(l=>/\| READY_TO_PURSUE \|/.test(l)),extra=[];for(let i=0;i<130;i++)extra.push(tpl.replace(/^\d+ \| V2X-[0-9A-F]+/,(900+i)+' | V2X-'+String(900+i).padStart(12,'0')));
    const big=lines.slice(0,lines.indexOf(tpl)).concat(extra,lines.slice(lines.indexOf(tpl))).join('\n');
    const {ctx,page,errors}=await open({master:big});
    const titles=await page.$$eval('#grid tbody tr[data-id] .score-badge',els=>els.map(e=>e.title));
    assert(titles.length>20,'score cells: '+titles.length);
    const BAD=/\b(PRIORITY|STRONG|WATCH|WEAK|NO-GO)\b/;
    titles.forEach(t=>{assert.doesNotMatch(t,BAD,'no band() word: '+t);assert.match(t,/^(▲ TOP|◆ UPPER|● MID|▽ LOW) · \d+ · #\d+ of \d+ eligible open · (\d\d:\d\d|—)$|^\d+ · ⊘ HOLD · outside the bands$|^\d+ · not ranked \(applied or closed\)$/,'V-19 format: '+t)});
    assert(titles.some(t=>/eligible open/.test(t)),'ranked rows present');console.log('sample hover: '+titles.find(t=>/eligible open/.test(t)));
    await page.locator('#grid tbody tr[data-id]').first().click();await page.waitForTimeout(800);
    const ring=await page.locator('#drawer .ws-ring').getAttribute('title');assert.doesNotMatch(ring,BAD,'ring title: '+ring);assert.match(ring,/^Opportunity rating · viewer-derived from the scoring model · /);
    assert.deepEqual(errors,[]);await ctx.close();}

  // 2. Fixture (fewer than 40 eligible): bands off, hover says so, still no band() word
  {const {ctx,page,errors}=await open({});
    const titles=await page.$$eval('#grid tbody tr[data-id] .score-badge',els=>els.map(e=>e.title));
    titles.forEach(t=>{assert.doesNotMatch(t,/\b(PRIORITY|STRONG|WATCH|WEAK|NO-GO)\b/,t);assert.match(t,/^\d+ · (bands off · N \d+ eligible open < 40|⊘ HOLD · outside the bands)$/,t)});
    assert.deepEqual(errors,[]);await ctx.close();}

  await browser.close();server.close();console.log('score-hover.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
