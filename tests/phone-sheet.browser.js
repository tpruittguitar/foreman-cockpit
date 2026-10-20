/* REV-083 (Tim 22:58 ET, option A; p42 item 15): on the phone an open job is a full-screen sheet over the header, banner and
   tabs, ending at the bottom nav; decision row pinned at the sheet bottom; phone Back and "‹ Queue" close it; desktop unchanged.
   Run: node tests/phone-sheet.browser.js */
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
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(2500);
    return {ctx,page,errors,posts,W};
  }
  const tok=(page,v)=>page.evaluate(v=>{const d=document.createElement('i');d.style.color='var('+v+')';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c},v);
  // REV-081: every tab, every <details> opened: no text in the drawer under 11 px
  const under11=async page=>{const out=[];for(const tab of ['overview','posting','fit','application','documents','history']){
      await page.locator('#detail-tabs button[data-dtab="'+tab+'"]').tap();await page.waitForTimeout(500);
      out.push(...await page.evaluate(tab=>{const d=document.getElementById('drawer');d.querySelectorAll('details').forEach(x=>x.open=true);const r=[];
        d.querySelectorAll('*').forEach(e=>{if(!e.getClientRects().length)return;const cs=getComputedStyle(e);if(cs.visibility==='hidden')return;
          if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;const fs=parseFloat(cs.fontSize);if(fs<11)r.push(tab+': '+e.tagName+'.'+(typeof e.className==='string'?e.className:'')+' '+fs+'px "'+e.textContent.trim().slice(0,24)+'"')});return r},tab));}
    await page.locator('#detail-tabs button[data-dtab="overview"]').tap();await page.waitForTimeout(400);return out};
  const lines=fixture.split('\n'),tpl=lines.find(l=>/\| READY_TO_PURSUE \|/.test(l)),extra=[];for(let i=0;i<130;i++)extra.push(tpl.replace(/^\d+ \| V2X-[0-9A-F]+/,(900+i)+' | V2X-'+String(900+i).padStart(12,'0')));
  const big=lines.slice(0,lines.indexOf(tpl)).concat(extra,lines.slice(lines.indexOf(tpl))).join('\n');
  for(const [w,h] of [[390,844],[402,874]]){
    const t=w+'x'+h+': ';const {ctx,page,errors}=await open({phone:[w,h],master:big});
    const st=()=>page.evaluate(()=>{const d=document.getElementById('drawer'),bb=document.getElementById('bottombar'),r=d.getBoundingClientRect(),b=bb.getBoundingClientRect(),dec=d.querySelector('.wh-decide'),ring=d.querySelector('.ws-ring');
      const at=(x,y)=>{const e=document.elementFromPoint(x,y);return e?(d.contains(e)?'drawer':bb.contains(e)?'bottombar':(e.closest('header')?'header':e.tagName)):null};
      return {on:d.classList.contains('on'),sheet:document.body.classList.contains('pe-sheet'),pos:getComputedStyle(d).position,top:r.top,bottom:r.bottom,w:r.width,bbTop:b.top,bbH:b.height,
        topHit:at(innerWidth/2,12),midHit:at(innerWidth/2,innerHeight/2),bbHit:at(innerWidth/2,b.top+b.height/2),dec:dec&&dec.getBoundingClientRect().toJSON(),ring:ring&&ring.getBoundingClientRect().toJSON(),hs:history.state,hl:history.length,scrollTop:d.scrollTop,ih:innerHeight}});
    // load: the phone previews the top job below the queue (shown, not opened): no sheet, the queue stays usable
    let s0=await st();assert.equal(s0.sheet,false,t+'load-time preview is not a sheet');assert.notEqual(s0.pos,'fixed');
    const hl0=s0.hl;
    // REV-084 (Tim 23:35 ET, iPhone): simulate a 47 px status-bar inset; on open the header row starts below it, sheet at the top
    await page.addStyleTag({content:':root{--pe-safe-top:47px !important}'});
    await page.locator('#grid tbody tr[data-id]').nth(1).tap();await page.waitForTimeout(1000);
    const top=await page.evaluate(()=>({head:document.querySelector('#drawer .d-head').getBoundingClientRect().top,back:document.getElementById('d-back').getBoundingClientRect().top,title:document.getElementById('d-title').getBoundingClientRect().top,st:document.getElementById('drawer').scrollTop,wy:scrollY,vv:visualViewport?visualViewport.offsetTop:0}));
    assert(top.head>=47&&top.back>=47&&top.title>=47,t+'header row below the safe-area inset on open: '+JSON.stringify(top));assert.equal(top.st,0,t+'sheet opens scrolled to the top');assert.equal(top.wy,0);assert.equal(top.vv,0);
    let s=await st();
    assert(s.on&&s.sheet,t+'open job is a sheet');assert.equal(s.pos,'fixed',t+'sheet is fixed');assert.equal(s.top,0,t+'sheet starts at the top (its padding holds the inset)');assert.equal(s.w,w,t+'full width');
    assert(Math.abs(s.bottom-s.bbTop)<=1,t+'sheet ends at the bottom nav: '+s.bottom+' vs '+s.bbTop);assert.equal(s.topHit,'drawer',t+'sheet covers the page header');assert.equal(s.midHit,'drawer');assert.equal(s.bbHit,'bottombar',t+'bottom nav still visible and tappable');
    assert(s.dec.bottom<=s.bottom+1&&s.dec.bottom>=s.bottom-12,t+'decision row pinned at the sheet bottom: '+JSON.stringify([s.dec.bottom,s.bottom]));
    assert(s.ring.bottom<=s.dec.top,t+'ring clear of the decision row');assert.equal(s.hl,hl0+1,t+'opening adds one history entry');assert.deepEqual(s.hs,{peSheet:1});
    // the sheet scrolls itself; the decision row stays pinned
    await page.evaluate(()=>{document.getElementById('drawer').scrollTop=400});await page.waitForTimeout(300);s=await st();assert(s.scrollTop>0,t+'sheet scrolls');assert(s.dec.bottom<=s.bottom+1&&s.dec.bottom>=s.bottom-12,t+'decision row still pinned after scrolling');
    // phone Back closes the sheet
    await page.goBack();await page.waitForTimeout(700);s=await st();assert(!s.on&&!s.sheet,t+'Back closes the sheet');assert.notDeepEqual(s.hs,{peSheet:1});
    assert.equal(await page.evaluate(()=>location.pathname),'/pipeline.html',t+'Back stays on the page');
    // reopen, then ‹ Queue closes and removes the history entry again
    await page.locator('#grid tbody tr[data-id]').first().tap();await page.waitForTimeout(1000);s=await st();assert(s.sheet,t+'reopened');assert.equal(s.scrollTop,0,t+'reopened at the top');
    await page.locator('#d-back').tap();await page.waitForTimeout(700);s=await st();assert(!s.on&&!s.sheet,t+'‹ Queue closes the sheet');assert.notDeepEqual(s.hs,{peSheet:1},t+'history entry consumed');
    if(w===390){await page.locator('#grid tbody tr[data-id]').first().tap();await page.waitForTimeout(1200);await page.screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/phone-sheet-390x844.png'});}
    assert.deepEqual(errors,[]);await ctx.close();}
  // desktop: the drawer stays in the layout (no sheet)
  {const {ctx,page,errors}=await open({master:big});const hl0=await page.evaluate(()=>history.length);await page.locator('#grid tbody tr[data-id]').first().click();await page.waitForTimeout(900);
    const d=await page.evaluate(()=>({sheet:document.body.classList.contains('pe-sheet'),pos:getComputedStyle(document.getElementById('drawer')).position,hl:history.length}));
    assert.equal(d.sheet,false,'desktop: no sheet');assert.notEqual(d.pos,'fixed','desktop drawer not fixed');assert.equal(d.hl,hl0,'desktop: no history entry');assert.deepEqual(errors,[]);await ctx.close();}
  await browser.close();server.close();console.log('phone-sheet.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
