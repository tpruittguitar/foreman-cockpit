/* REV-069 (Track M step 3, Grok Bot 19:55 ET): (a) on the phone SCORE is visible at the right edge without sideways
   scroll and stays there while the other columns scroll; TITLE shrinks first (>= 140 px, ellipsis), leaving a 96 px
   window. 390 x 844, 402 x 874, landscape 874 x 402; desktop not pinned. (b) the ring label rule is never under 11 px.
   Run: node tests/phone-table.browser.js */
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
  const measure=page=>page.evaluate(()=>{const wrap=document.getElementById('gridwrap'),wr=wrap.getBoundingClientRect(),g=document.getElementById('grid');
    const th=g.querySelector('thead th[data-c="OVERALL_RATING"]'),tds=[...g.querySelectorAll('tbody tr[data-id]')].slice(0,6).map(tr=>tr.querySelector('td.pin-r'));
    const tt=g.querySelector('thead th[data-c="TITLE"]'),tn=g.querySelector('thead th[data-c="NEW"]'),title=g.querySelector('tbody tr[data-id] td:nth-child(2)');
    const box=e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right,w:r.width}};
    return {wrap:{l:wr.left,r:wr.right,w:wrap.clientWidth,sw:wrap.scrollWidth,sl:wrap.scrollLeft},th:box(th),tds:tds.map(box),title:box(tt),nw:box(tn),ell:getComputedStyle(title).textOverflow,pos:getComputedStyle(th).position}});
  for(const [w,h] of [[390,844],[402,874],[874,402]]){
    const {ctx,page,errors}=await open({phone:[w,h]});
    let m=await measure(page);
    const inside=(b,tag)=>{assert(b.l>=m.wrap.l-0.5&&b.r<=m.wrap.r+0.5,w+'x'+h+' '+tag+' inside the pane: '+JSON.stringify(b)+' pane '+JSON.stringify(m.wrap))};
    assert.equal(m.pos,'sticky','SCORE pinned on the phone');
    inside(m.th,'SCORE header');m.tds.forEach((b,i)=>inside(b,'score row '+i));
    assert(Math.abs(m.th.r-m.wrap.l-m.wrap.w)<=1.5,w+'x'+h+': SCORE sits at the right edge ('+(m.th.r-m.wrap.l)+' of '+m.wrap.w+')');
    assert(m.title.w>=140,'TITLE never under 140 px: '+m.title.w);
    assert(m.nw.w+m.title.w+m.th.w+96<=m.wrap.w+1.5,w+'x'+h+' NEW + TITLE + SCORE leave the 96 px window: '+JSON.stringify([m.nw.w,m.title.w,m.th.w,m.wrap.w]));
    assert.equal(m.ell,'ellipsis','long titles end in an ellipsis');
    // scroll the table all the way: SCORE stays in the same place
    await page.evaluate(()=>{const wr=document.getElementById('gridwrap');wr.scrollLeft=wr.scrollWidth});await page.waitForTimeout(200);
    const m2=await measure(page);assert(m2.wrap.sl>0,'the other columns still scroll');
    assert(Math.abs(m2.th.r-m.th.r)<=1,'SCORE fixed while scrolling: '+m.th.r+' -> '+m2.th.r);m=m2;m2.tds.forEach((b,i)=>inside(b,'score row '+i+' scrolled'));
    if(w===390)await page.screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/phone-table-390x844.png'});
    assert.deepEqual(errors,[]);await ctx.close();}
  // desktop unchanged: SCORE not pinned
  {const {ctx,page,errors}=await open({});const d=await page.$eval('#grid thead th[data-c="OVERALL_RATING"]',e=>({right:getComputedStyle(e).right,last:!e.nextElementSibling}));
    assert.notEqual(d.right,'0px','desktop SCORE column not pinned right');assert.equal(d.last,false,'desktop column order unchanged (SCORE not moved last)');assert.deepEqual(errors,[]);await ctx.close();}
  // ring label rule on the phone never under the 11 px floor (pipeline-ui-mobile.css)
  {const css=fs.readFileSync(repo+'/pipeline-ui-mobile.css','utf8');for(const m of css.matchAll(/\.ws-ring small\{font-size:([^!}]+)/g))assert(!/^[0-9.]+px$/.test(m[1].trim())||parseFloat(m[1])>=11,'ring label '+m[1]);}

  await browser.close();server.close();console.log('phone-table.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
