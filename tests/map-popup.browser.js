/* MAP-1 (Grok Bot, 2026-10-19; Tim's standing rule): every map popup shows COMPANY · TITLE · SALARY · CITY.
   Salary = the app's own figure (PipelineTrust.salaryRange, "~" + "EST." when estimated) or PAY UNKNOWN; city = clean "City, ST".
   Everything wraps (no ellipsis), nothing under 11 px, text >= 4.5:1, the popup stays inside the open canvas, never covers its pin,
   and keeps off the selector / zoom / legend / actions unless it is taller than half the canvas. Shared pins read ×N and list all jobs
   (or "+k MORE"). Phone: first tap opens a sheet above the bottom bar with Open job per job; empty-map tap closes; Open job opens it.
   Fixture, ?src=writer, offline geocode (state centroids). 2560x1440, 1440x900, 390x844 touch.
   Run: node tests/map-popup.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/mobile.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');

// one popup, measured in the page against the fixture parsed by the app's own parser
const inspect=(page,fx)=>page.evaluate(fx=>{
  const pop=document.getElementById('map-pop'),box=document.getElementById('job-map');if(!pop)return null;
  const rows=PipelineParser.parse(fx);const list=Array.isArray(rows)?rows:(rows.rows||[]);
  const exp=c=>{const r=list.find(x=>x.COMPANY===c);if(!r)return null;const sr=PipelineTrust.salaryRange(r.payload||{});return {title:r.TITLE,pay:sr.text?(sr.approx?'~':'')+sr.text+(sr.approx?'EST.':''):'PAY UNKNOWN'}};
  const lum=c=>{const m=c.match(/[\d.]+/g).map(Number).slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*m[0]+.7152*m[1]+.0722*m[2]};
  const cr=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const bg=getComputedStyle(pop).backgroundColor,pr=pop.getBoundingClientRect(),bad=[];
  pop.querySelectorAll('*').forEach(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();if(s.display==='none'||!r.width)return;const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(own&&parseFloat(s.fontSize)<10.95)bad.push('small '+e.className+' '+s.fontSize);
    if(own&&s.textOverflow==='ellipsis')bad.push('ellipsis '+e.className);
    if(own&&cr(s.color,bg)<4.5)bad.push('contrast '+e.className+' '+cr(s.color,bg).toFixed(2));
    if(r.right>pr.right+0.5||r.left<pr.left-0.5)bad.push('overflow '+e.className)});
  if(pop.scrollWidth>pop.clientWidth+1)bad.push('scrollWidth');
  if(pop.scrollHeight>pop.clientHeight+1&&!pop.classList.contains('scroll')&&!pop.classList.contains('tap'))bad.push('silent clip');
  const jobs=[...pop.querySelectorAll('.mp-job')].map(li=>{const t=s=>(li.querySelector(s)||{}).textContent||'';return {row:li.dataset.row,co:t('.mp-co'),ti:t('.mp-ti'),pay:t('.mp-pay'),city:t('.mp-city'),open:li.querySelectorAll('.mp-open').length,exp:exp(t('.mp-co'))}});
  const more=(pop.querySelector('.mp-more')||{}).textContent||'',n=(pop.querySelector('.mp-n')||{}).textContent||'';
  const br=box.getBoundingClientRect(),card=document.getElementById('job-map-card'),band=card.querySelector('.map-band');
  const bandTop=band&&band.offsetParent?band.getBoundingClientRect().top:br.bottom;
  const ctl=['.map-seg','.map-zoom','.map-layers','.map-blegend','.map-actions'].map(s=>card.querySelector(s)).filter(e=>e&&e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return {s:e.className,x:r.left,y:r.top,w:r.width,h:r.height}});
  const ro=document.querySelector('#map-lock:not([hidden]) .ro'),rr=ro?ro.getBoundingClientRect():null;
  return {head:(pop.querySelector('.mp-cityh')||{}).textContent||'',n,more,jobs,bad,rect:{x:pr.left,y:pr.top,w:pr.width,h:pr.height},canvas:{x:br.left,y:br.top,w:br.width,bandTop,h:br.height},
    ctl,ro:rr&&{x:rr.left,y:rr.top,w:rr.width,h:rr.height},sheet:pop.classList.contains('sheet'),vw:innerWidth,vh:innerHeight,
    bottomBar:(()=>{const b=document.getElementById('bottombar');return b&&b.offsetParent?b.getBoundingClientRect().top:innerHeight})()};
},fx);
const hit=(a,b,g=0)=>a.x<b.x+b.w+g&&b.x<a.x+a.w+g&&a.y<b.y+b.h+g&&b.y<a.y+a.h+g;

function checkPopup(m,pin,what,phone){
  assert(m,what+': popup shown');
  assert.deepEqual(m.bad,[],what+': popup text rules');
  assert(/,\s[A-Z]{2}\b/.test(m.head),what+': head names City, ST ('+m.head+')');
  assert(m.jobs.length>=1,what+': lists a job');
  const N=m.n?+m.n.replace(/[^\d]/g,''):1,k=m.more?+(m.more.match(/\+(\d+)/)||[0,0])[1]:0;
  assert.equal(m.jobs.length+k,N,what+': ×N = listed + counted rest');
  m.jobs.forEach(j=>{assert(j.exp,what+': '+j.co+' is a fixture company');assert.equal(j.ti,j.exp.title,what+': title of '+j.co);
    assert.equal(j.pay.replace(/\s+/g,''),j.exp.pay.replace(/\s+/g,''),what+': salary of '+j.co+' is the computed figure');
    if(N>1)assert(/,\s[A-Z]{2}\b/.test(j.city),what+': per-job city with state ('+j.city+')');
    if(phone)assert.equal(j.open,1,what+': one Open job per job')});
  if(!phone){
    const c=m.canvas,r=m.rect;assert(r.x>=c.x-0.5&&r.x+r.w<=c.x+c.w+0.5&&r.y>=c.y-0.5&&r.y+r.h<=c.bandTop+0.5,what+': inside the open canvas');
    assert(!(pin.x>=r.x&&pin.x<=r.x+r.w&&pin.y>=r.y&&pin.y<=r.y+r.h),what+': does not cover its pin');
    if(r.h<=(c.bandTop-c.y)/2)m.ctl.forEach(z=>assert(!hit(r,z),what+': clear of '+z.s));
  }else{
    assert(m.sheet,what+': phone tap opens the sheet');
    const r=m.rect;assert(r.x>=12-0.5&&r.x+r.w<=m.vw-12+0.5,what+': sheet >= 12 px from the sides');
    assert(r.y+r.h<=m.bottomBar-12+0.5||r.y>=12-0.5,what+': sheet above the bottom bar');
    assert(!(pin.x>=r.x&&pin.x<=r.x+r.w&&pin.y>=r.y&&pin.y<=r.y+r.h),what+': sheet does not cover the tapped pin');
  }
}

(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const sizes=[{viewport:{width:2560,height:1440}},{viewport:{width:1440,height:900}},{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}];
  for(const opt of sizes){
    const vp=opt.viewport,what=vp.width+'x'+vp.height,phone=!!opt.isMobile;
    const ctx=await browser.newContext(opt),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));localStorage.setItem('px.mapMode',JSON.stringify('visible'))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForSelector('.map-target');await page.waitForTimeout(1200);
    const emptySpot=async()=>page.evaluate(()=>{const b=document.getElementById('job-map').getBoundingClientRect();for(let y=b.top+b.height*.5;y<b.bottom-10;y+=6)for(let x=b.left+10;x<b.right-10;x+=6){const e=document.elementFromPoint(x,y);if(e&&e.closest('#job-map')&&!e.closest('.map-target,#map-pop,button')){const ok=[...document.querySelectorAll('.map-target')].every(t=>{const r=t.getBoundingClientRect();return Math.hypot(r.left+r.width/2-x,r.top+r.height/2-y)>40});if(ok)return {x,y}}}return null});
    const pins=await page.locator('.map-target:not([hidden])').count();assert(pins>1,what+': filtered view pins');
    let multi=0;
    for(let i=0;i<pins;i++){
      const b=page.locator('.map-target:not([hidden])').nth(i),bb=await b.boundingBox();if(!bb)continue;const pin={x:bb.x+bb.width/2,y:bb.y+bb.height/2};
      if(pin.y>(await page.locator('#job-map').boundingBox()).y+(await page.locator('#job-map').boundingBox()).height-1)continue;
      const drawerBefore=await page.locator('#drawer').evaluate(e=>e.classList.contains('on'));
      if(phone){await page.touchscreen.tap(pin.x,pin.y);await page.waitForTimeout(250)}else{await b.focus();await page.waitForTimeout(150)}
      const m=await inspect(page,fixture);checkPopup(m,pin,what+' pin '+i+' ('+(await b.getAttribute('aria-label'))+')',phone);if(m.n)multi++;
      if(phone){assert.equal(await page.locator('#drawer').evaluate(e=>e.classList.contains('on')),drawerBefore,what+': first tap does not open a job');
        const sp=await emptySpot();assert(sp,what+': an empty map spot to tap');await page.touchscreen.tap(sp.x,sp.y);await page.waitForTimeout(200);
        assert.equal(await page.locator('#map-pop').count(),0,what+': empty-map tap closes the sheet')}
      else{await page.evaluate(()=>document.activeElement&&document.activeElement.blur());await page.waitForTimeout(80)}
    }
    assert(multi>=1,what+': at least one ×N pin');
    if(!phone){
      // mouse hover on pin 0
      const b0=await page.locator('.map-target:not([hidden])').first().boundingBox();await page.mouse.move(b0.x+b0.width/2,b0.y+b0.height/2);await page.waitForTimeout(200);
      checkPopup(await inspect(page,fixture),{x:b0.x+b0.width/2,y:b0.y+b0.height/2},what+' hover pin 0',false);
      // locked pin focused: popup clear of the lock readout
      await page.locator('[data-mapseg="selected"]').click();await page.locator('#grid tbody tr[data-id]').first().click();await page.waitForTimeout(1800);
      const f=page.locator('.map-target.focused');await f.focus();await page.waitForTimeout(200);const fb=await f.boundingBox();
      const lm=await inspect(page,fixture);checkPopup(lm,{x:fb.x+fb.width/2,y:fb.y+fb.height/2},what+' locked pin',false);
      assert(lm.ro&&!hit(lm.rect,lm.ro),what+': locked-pin popup clear of the lock readout');
    }else{
      // Open job from the sheet opens the drawer
      const b0=await page.locator('.map-target:not([hidden])').first().boundingBox();await page.touchscreen.tap(b0.x+b0.width/2,b0.y+b0.height/2);await page.waitForTimeout(250);
      const co=await page.locator('#map-pop .mp-job .mp-co').first().innerText(),focus0=await page.locator('#grid tr.focus').getAttribute('data-id').catch(()=>null);
            await page.locator('#map-pop .mp-open').first().tap();await page.waitForTimeout(900);
      assert(await page.locator('#drawer').evaluate(e=>e.classList.contains('on')),what+': Open job opens the drawer');
      const dm=await page.evaluate(()=>({meta:(document.getElementById('d-meta')||{}).textContent,title:(document.getElementById('d-title')||{}).textContent,focus:(document.querySelector('#grid tr.focus')||{}).dataset}));      assert((dm.meta||'').includes(co),what+': the drawer shows '+co);
    }
    assert.deepEqual(errors,[],what+': no page errors');
    await ctx.close();
  }
  await browser.close();server.close();console.log('map popup browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
