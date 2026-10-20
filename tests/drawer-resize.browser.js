/* REV-077 (Tim 21:26 ET): wide desktop (three columns) map / drawer resize handle, and the decision row on one line even
   with a classic scrollbar in the drawer. Run: node tests/drawer-resize.browser.js */
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
  const lines=fixture.split('\n'),tpl=lines.find(l=>/\| READY_TO_PURSUE \|/.test(l)),extra=[];for(let i=0;i<130;i++)extra.push(tpl.replace(/^\d+ \| V2X-[0-9A-F]+/,(900+i)+' | V2X-'+String(900+i).padStart(12,'0')));
  const big=lines.slice(0,lines.indexOf(tpl)).concat(extra,lines.slice(lines.indexOf(tpl))).join('\n');
  const W=2560,H=1440;
  const geo=page=>page.evaluate(()=>{const g=id=>{const e=document.getElementById(id);return e?e.getBoundingClientRect():null},d=document.querySelector('#drawer .wh-decide'),bs=d?[...d.querySelectorAll('button')].filter(b=>b.offsetParent):[];
    const h=g('map-drawer-divider'),m=g('job-map-card'),dr=g('drawer');
    return {h:h&&{l:h.left,r:h.right,w:h.width,vis:getComputedStyle(document.getElementById('map-drawer-divider')).display},mapR:m.right,drL:dr.left,drW:Math.round(dr.width),
      rows:[...new Set(bs.map(b=>Math.round(b.getBoundingClientRect().top)))].length,clip:bs.filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.innerText),decW:d?Math.round(d.getBoundingClientRect().width):0,
      saved:localStorage.getItem('px.mapDrawerWidth'),split:document.getElementById('map-drawer-divider').dataset.split}});
  {const {ctx,page,errors}=await open({master:big});await page.locator('#grid tbody tr[data-id]').first().click();await page.waitForTimeout(1200);
    let g=await geo(page);
    assert.equal(g.h.vis,'flex','handle shown on the wide desktop');assert(g.h.l>=g.mapR-1&&g.h.r<=g.drL+1,'handle sits in the map / drawer gutter: '+JSON.stringify(g));
    assert.equal(g.drW,508,'default drawer 508 px (golden)');assert.equal(g.rows,1,'decision row one line at default');assert.deepEqual(g.clip,[]);
    // a classic 17 px scrollbar's worth less room: still one line, nothing clipped
    await page.addStyleTag({content:'html body:not(.map-full) #view-pipeline.on #drawer{padding-right:21px !important}'});await page.waitForTimeout(300);
    let s=await geo(page);assert(s.decW<=g.decW-15,'simulated scrollbar narrows the row: '+g.decW+' -> '+s.decW);assert.equal(s.rows,1,'decision row one line with a scrollbar: '+JSON.stringify(s));assert.deepEqual(s.clip,[],'no clipped decision text');
    // drag the handle 200 px left: drawer 708 px, saved, readout
    const hb=await page.locator('#map-drawer-divider').boundingBox(),cx=hb.x+hb.width/2,cy=hb.y+hb.height/2;
    await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx-100,cy,{steps:4});await page.mouse.move(cx-200,cy,{steps:4});await page.mouse.up();await page.waitForTimeout(500);
    g=await geo(page);assert(Math.abs(g.drW-708)<=2,'drag left 200 px widens the drawer to 708: '+g.drW);assert.equal(Math.round(JSON.parse(g.saved)),708,'width saved');assert.equal(g.split,'drawer 708 px');
    assert(g.h.l>=g.mapR-1&&g.h.r<=g.drL+1,'handle stays in the gutter');
    // keyboard: ArrowLeft +16, ArrowRight -16; End = minimum 480; double-click = 508
    await page.locator('#map-drawer-divider').focus();await page.keyboard.press('ArrowLeft');await page.waitForTimeout(250);assert.equal((await geo(page)).drW,724,'ArrowLeft +16');
    await page.keyboard.press('End');await page.waitForTimeout(250);g=await geo(page);assert.equal(g.drW,480,'minimum 480 px');assert.equal(g.rows,1,'decision row one line at the minimum (with scrollbar)');assert.deepEqual(g.clip,[]);
    await page.locator('#map-drawer-divider').dblclick();await page.waitForTimeout(300);assert.equal((await geo(page)).drW,508,'double-click restores 508');
    await page.locator('#map-drawer-divider').focus();await page.keyboard.press('Shift+ArrowLeft');await page.waitForTimeout(250);assert.equal((await geo(page)).drW,556,'Shift+ArrowLeft +48');
    await page.reload();await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(1500);assert.equal((await geo(page)).drW,556,'width kept after reload');
    // list / map handle still works with a wider drawer
    assert.deepEqual(errors,[]);await ctx.close();}
  // stacked desktop and phone: no map / drawer handle
  for(const vp of [[1600,1000],[390,844]]){const ctx=await browser.newContext({viewport:{width:vp[0],height:vp[1]},isMobile:vp[0]<500,hasTouch:vp[0]<500});const page=await ctx.newPage();
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='state'?{ok:true,state:{seen:{},reviewed:{}}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#grid tbody tr[data-id]');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('map-drawer-divider')).display),'none',vp+': no map / drawer handle');await ctx.close();}
  await browser.close();server.close();console.log('drawer-resize.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
