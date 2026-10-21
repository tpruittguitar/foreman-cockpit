/* REV-067 (Track M step 1, HF-13; Grok Q9-c): the "Since your last review" strip on the phone. 390 x 844, 402 x 874 and
   landscape 874 x 402: strip inside the screen, four 44 px tap targets at 13 px, 11 px label, cause example hidden, no
   sideways scroll, a tap filters the queue. Desktop strip unchanged. Run: node tests/phone-strip.browser.js */
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
    const ctx=await browser.newContext(opts.phone?{viewport:{width:opts.phone[0],height:opts.phone[1]},deviceScaleFactor:3,isMobile:true,hasTouch:true}:{viewport:{width:2560,height:1440},deviceScaleFactor:1});const page=await ctx.newPage(),errors=[],posts=[];
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
    await page.goto(base+'/pipeline.html?src=writer&open=jobs');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(2500);
    return {ctx,page,errors,posts,W};
  }
  const t0=Date.now()-86400000,older={[JOB]:{s:33,t:t0,p:[30,90,60,50,-1,40,-1,-1],b:0,r:25}};
  for(const [w,h] of [[390,844],[402,874],[874,402]]){
    const {ctx,page,errors}=await open({phone:[w,h],state:{seen:{},reviewed:older}});
    const box=await page.locator('#queue-head .since-strip').boundingBox();
    assert(box&&box.height>0,w+'x'+h+': strip shows on the phone');
    assert(box.x>=0&&box.x+box.width<=w+0.5,w+'x'+h+': strip inside the screen: '+JSON.stringify(box));
    const items=await page.$$eval('#queue-head .since-strip .ss-i',els=>els.map(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {t:e.innerText.trim(),h:r.height,w:r.width,fs:cs.fontSize,dis:e.disabled}}));
    assert.equal(items.length,4,'four items');items.forEach(x=>{assert(x.h>=44,w+'x'+h+' tap target >= 44 px: '+JSON.stringify(x));assert.equal(x.fs,'13px')});
    const lbl=await page.$eval('#queue-head .since-strip .ss-lbl',e=>({t:e.textContent,fs:getComputedStyle(e).fontSize,h:e.getBoundingClientRect().height,lh:parseFloat(getComputedStyle(e).fontSize)}));
    assert.match(lbl.t,/^Since your last review · /);assert.equal(lbl.fs,'11px','label at --pe-fs-min (11 px floor)');if(w<600)assert(lbl.h<lbl.lh*2,w+'x'+h+': label on one line in portrait ('+lbl.h+')');
    const ch=items.find(x=>/score change/.test(x.t));assert.match(ch.t,/^Δ 1 score change \(▲1 ▼0\)$/,'changed item, cause example hidden on the phone: '+ch.t);
    const sw=await page.evaluate(()=>document.documentElement.scrollWidth);assert(sw<=w+1,w+'x'+h+': no sideways scroll ('+sw+')');
    if(w===390){await page.locator('#queue-head .since-strip').screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/phone-strip-only.png'});await page.screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/phone-strip-390x844.png'});
      await page.locator('#queue-head [data-since="changed"]').tap();await page.waitForTimeout(800);
      const ids=await page.locator('#grid tbody tr[data-id]').evaluateAll(t=>t.map(x=>x.dataset.id));
      const cards=ids.length?ids:await page.evaluate(()=>[...document.querySelectorAll('[data-id]')].filter(e=>e.offsetParent).map(e=>e.dataset.id));
      assert(cards.includes('V2X-A4CCD49EE686'),'tap filters to the changed job: '+JSON.stringify(cards.slice(0,5)));}
    assert.deepEqual(errors,[]);await ctx.close();}

  // longest label ("none recorded yet") still one line in portrait at 390
  {const {ctx,page}=await open({phone:[390,844]});const x=await page.$eval('#queue-head .since-strip .ss-lbl',e=>({t:e.textContent,h:e.getBoundingClientRect().height,lh:parseFloat(getComputedStyle(e).fontSize)}));
    assert.match(x.t,/none recorded yet$/);assert(x.h<x.lh*2,'longest label on one line at 390: '+x.h);await ctx.close();}
  // desktop strip unchanged: one 40 px row, example shown
  {const {ctx,page,errors}=await open({state:{seen:{},reviewed:older}});
    const b=await page.locator('#queue-head .since-strip').boundingBox();assert.equal(Math.round(b.height),40,'desktop strip 40 px');
    assert.match(await page.locator('#queue-head .since-strip').innerText(),/e\.g\. /,'desktop keeps the cause example');
    assert.deepEqual(errors,[]);await ctx.close();}

  await browser.close();server.close();console.log('phone-strip.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
