/* REV-090 (Tim 00:36 / 00:37 ET), REV-092 (Grok Bot QA of 152f9f5: sticky LOCATION, NEW lead column): phone queue columns TITLE · COMPANY · LOCATION · SCORE always present and fully in view at 390
   / 402; COMPANY and LOCATION mono 11 px Secondary with an ellipsis; header-edge resize (44 px target) saved per device and kept
   after a reload; minimums; double-tap resets; a tap still opens the header menu; desktop unchanged.
   Run: node tests/phone-columns.browser.js */
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
  const tok=(page,v)=>page.evaluate(v=>{const d=document.createElement('i');d.style.color='var('+v+')';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c},v);
  // REV-081: every tab, every <details> opened: no text in the drawer under 11 px
  const under11=async page=>{const out=[];for(const tab of ['overview','posting','fit','application','documents','history']){
      await page.locator('#detail-tabs button[data-dtab="'+tab+'"]').tap();await page.waitForTimeout(500);
      out.push(...await page.evaluate(tab=>{const d=document.getElementById('drawer');d.querySelectorAll('details').forEach(x=>x.open=true);const r=[];
        d.querySelectorAll('*').forEach(e=>{if(!e.getClientRects().length)return;const cs=getComputedStyle(e);if(cs.visibility==='hidden')return;
          if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;const fs=parseFloat(cs.fontSize);if(fs<11)r.push(tab+': '+e.tagName+'.'+(typeof e.className==='string'?e.className:'')+' '+fs+'px "'+e.textContent.trim().slice(0,24)+'"')});return r},tab));}
    await page.locator('#detail-tabs button[data-dtab="overview"]').tap();await page.waitForTimeout(400);return out};
  const M=page=>page.evaluate(()=>{const g=document.getElementById('grid'),wrap=document.getElementById('gridwrap'),wr=wrap.getBoundingClientRect(),cs=e=>getComputedStyle(e);
    const th=c=>g.querySelector('thead th[data-c="'+c+'"]'),bx=e=>{const r=e.getBoundingClientRect();return {l:Math.round(r.left*10)/10,r:Math.round(r.right*10)/10,w:Math.round(r.width)}};
    const tr=g.querySelector('tbody tr[data-id]'),cell=c=>tr.children[[...g.querySelectorAll('thead th[data-c]')].findIndex(e=>e.dataset.c===c)];
    const four=['NEW','TITLE','COMPANY','LOCATION','OVERALL_RATING'];
    return {order:[...g.querySelectorAll('thead th[data-c]')].map(e=>e.dataset.c),wrap:{l:wr.left,r:wr.left+wrap.clientWidth,w:wrap.clientWidth,sl:wrap.scrollLeft},
      four:Object.fromEntries(four.map(c=>[c,th(c)?bx(th(c)):null])),cells:Object.fromEntries(['TITLE','COMPANY','LOCATION'].map(c=>{const e=cell(c),s=cs(e);return [c,{fs:s.fontSize,ff:s.fontFamily,c:s.color,ell:s.textOverflow,ws:s.whiteSpace}]})),
      edge:Object.fromEntries(four.map(c=>{const h=th(c)&&th(c).querySelector('.resize-handle');return [c,h?bx(h):null]})),bodyFont:cs(document.body).fontFamily,
      saved:localStorage.getItem('px.phoneColWidthsV1')}});
  const sec=page=>page.evaluate(()=>{const d=document.createElement('i');d.style.color='var(--pe-text-secondary)';document.body.appendChild(d);const c=getComputedStyle(d).color;d.remove();return c});
  const inView=(m,t)=>['NEW','TITLE','COMPANY','LOCATION','OVERALL_RATING'].forEach(c=>{const b=m.four[c];assert(b,t+c+' present');assert(b.l>=m.wrap.l-0.5&&b.r<=m.wrap.r+0.5,t+c+' fully in view: '+JSON.stringify(b)+' pane '+JSON.stringify(m.wrap))});
  const drag=async(page,c,dx)=>{const h=page.locator('#grid thead th[data-c="'+c+'"] .resize-handle');const b=await h.boundingBox();const x=b.x+b.width/2,y=b.y+b.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx/2,y,{steps:4});await page.mouse.move(x+dx,y,{steps:4});await page.mouse.up();await page.waitForTimeout(300)};
  for(const vp of [[390,844],[402,874]]){const t=vp.join('x')+': ';
    // a saved phone column set without COMPANY / LOCATION / SCORE cannot hide them
    const {ctx,page,errors}=await open({phone:vp,ls:{'px.cols':JSON.stringify({desktop:['NEW','COMPANY','TITLE','OVERALL_RATING'],phone:['NEW','TITLE','BUCKET','AGE','DISPOSITION','TIM_RULING'],bucketOrder:['SCOUT_INTAKE','DISCOVERY_LEAD','INVALID_DISCOVERY']})}});
    let m=await M(page);
    assert.deepEqual(m.order.slice(0,4),['NEW','TITLE','COMPANY','LOCATION'],t+'NEW · TITLE · COMPANY · LOCATION first: '+m.order);assert.equal(m.order[m.order.length-1],'OVERALL_RATING',t+'SCORE last (pinned right)');
    assert(m.order.indexOf('BUCKET')>3,t+'other columns after the lead four: '+m.order);assert(Math.abs(m.four.NEW.w-30)<=1,t+'NEW is a 30 px lead column: '+m.four.NEW.w);
    assert.equal(m.wrap.sl,0);inView(m,t);
        assert(Math.abs(m.four.COMPANY.w-80)<=1&&Math.abs(m.four.LOCATION.w-80)<=1&&Math.abs(m.four.OVERALL_RATING.w-72)<=1,t+'default widths 80 / 80 / 72: '+JSON.stringify(m.four));
    assert(m.four.TITLE.w>=110,t+'TITLE >= 110 by default: '+m.four.TITLE.w);
    const S2=await sec(page);['COMPANY','LOCATION'].forEach(c=>{const s=m.cells[c];assert.equal(s.fs,'11px',t+c+' 11 px');assert.notEqual(s.ff,m.bodyFont,t+c+' mono');assert.equal(s.c,S2,t+c+' Secondary');assert.equal(s.ell,'ellipsis');assert.equal(s.ws,'nowrap')});
    assert.equal(m.cells.TITLE.ell,'ellipsis',t+'TITLE ellipsis');
    assert.equal(m.edge.NEW,null,t+'NEW has no resize edge on the phone');['TITLE','COMPANY','LOCATION','OVERALL_RATING'].forEach(c=>assert(m.edge[c]&&m.edge[c].w>=44,t+c+' header edge is a 44 px target: '+JSON.stringify(m.edge[c])));
    // REV-092: sideways scroll to 200 (and to the end) leaves NEW · TITLE · COMPANY · LOCATION · SCORE where they were
    {const sw=await page.evaluate(()=>{const w=document.getElementById('gridwrap');return w.scrollWidth-w.clientWidth});assert(sw>=200,t+'the table scrolls sideways: '+sw);
     const m0=m;for(const sl of [200,sw]){await page.evaluate(sl=>{document.getElementById('gridwrap').scrollLeft=sl},sl);await page.waitForTimeout(200);const ms=await M(page);
       assert(ms.wrap.sl>=Math.min(200,sl)-1,t+'scrolled to '+sl+': '+ms.wrap.sl);inView(ms,t+'scrollLeft '+sl+': ');
       ['NEW','TITLE','COMPANY','LOCATION','OVERALL_RATING'].forEach(c=>assert(Math.abs(ms.four[c].l-m0.four[c].l)<=1,t+c+' stays put at scrollLeft '+sl+': '+ms.four[c].l+' vs '+m0.four[c].l))}
     await page.evaluate(()=>{document.getElementById('gridwrap').scrollLeft=0});await page.waitForTimeout(200)}
    // The NEW cell is the pin / new / changed marks. There is no row checkbox.
    {const nc=page.locator('#grid tbody tr[data-id]').first().locator('td.c-new');
     assert.equal(await nc.locator('input').count(),0,t+'NEW cell has no checkbox')}
    // resize COMPANY +24: TITLE gives the room, all four stay in view, the width is saved and survives a reload
    const t0=m.four.TITLE.w;await drag(page,'COMPANY',24);m=await M(page);
    assert(Math.abs(m.four.COMPANY.w-104)<=2,t+'COMPANY widened to ~104: '+m.four.COMPANY.w);assert(Math.abs(m.four.TITLE.w-(t0-24))<=2,t+'TITLE shrank by the same: '+m.four.TITLE.w);inView(m,t+'after resize: ');
    assert.equal(JSON.parse(m.saved).COMPANY,m.four.COMPANY.w,t+'width saved per device');
    await page.reload();await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(2500);m=await M(page);
    assert(Math.abs(m.four.COMPANY.w-104)<=2,t+'resize survives a reload: '+m.four.COMPANY.w);inView(m,t+'after reload: ');
    // dragging far cannot push a column out of view or TITLE under 80; minimums hold
    await drag(page,'LOCATION',400);m=await M(page);inView(m,t+'after a big drag: ');assert(m.four.TITLE.w>=80,t+'TITLE >= 80: '+m.four.TITLE.w);
    await drag(page,'LOCATION',-400);m=await M(page);assert(m.four.LOCATION.w>=56,t+'LOCATION >= 56: '+m.four.LOCATION.w);inView(m,t);
    await drag(page,'OVERALL_RATING',300);m=await M(page);assert(m.four.OVERALL_RATING.w>=72,t+'SCORE >= 72');inView(m,t);
    await drag(page,'TITLE',-400);m=await M(page);assert(m.four.TITLE.w>=80,t+'TITLE drag keeps >= 80');assert(m.four.COMPANY.w>=56&&m.four.LOCATION.w>=56);inView(m,t+'after TITLE drag: ');
    // double-tap the COMPANY edge resets it to 80
    const hb=await page.locator('#grid thead th[data-c="COMPANY"] .resize-handle').boundingBox();
    await page.mouse.click(hb.x+hb.width/2,hb.y+hb.height/2);await page.waitForTimeout(120);await page.mouse.click(hb.x+hb.width/2,hb.y+hb.height/2);await page.waitForTimeout(500);
    m=await M(page);assert(Math.abs(m.four.COMPANY.w-80)<=1,t+'double-tap resets COMPANY to 80: '+m.four.COMPANY.w);assert.equal(JSON.parse(m.saved).COMPANY,undefined);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('pop')).display),'none',t+'double-tap does not open the header menu');
    // a single tap on the edge still opens the header menu (sort / filter)
    const lb=await page.locator('#grid thead th[data-c="LOCATION"] .resize-handle').boundingBox();await page.mouse.click(lb.x+lb.width/2,lb.y+lb.height/2);await page.waitForTimeout(700);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('pop')).display),'block',t+'single tap opens the header menu');
    assert.deepEqual(errors,[]);await ctx.close();}
  // desktop: column order and widths untouched by the phone settings
  {const {ctx,page,errors}=await open({ls:{'px.phoneColWidthsV1':JSON.stringify({COMPANY:150})}});const d=await page.evaluate(()=>[...document.querySelectorAll('#grid thead th[data-c]')].map(e=>e.dataset.c));
    assert.notEqual(d[0],'TITLE','desktop keeps its own order: '+d);const cw=await page.evaluate(()=>document.querySelector('#grid thead th[data-c="COMPANY"]')&&document.querySelector('#grid thead th[data-c="COMPANY"]').getBoundingClientRect().width);
    assert(!cw||Math.abs(cw-150)>2,'desktop ignores the phone widths');assert.deepEqual(errors,[]);await ctx.close();}
  await browser.close();server.close();console.log('phone-columns.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
