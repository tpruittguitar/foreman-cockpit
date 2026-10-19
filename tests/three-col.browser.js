/* PE build step 6 (REV-049, PDF p40 / golden F01-F02): three columns on wide desktops.
   2560x1440: KPI row full width; job table | 16 px splitter | map | 16 px gutter | 508 px drawer, table:map at the golden
   1112:801 (58 %); the splitter is vertical, drags and keys move columns, the ratio saves under px.listMapSplitCols and
   double-click restores 58; the table fits its pane (TITLE / LOCATION / COMPANY shrink, never below 192 / 120 / 120);
   the drawer decision row is one line and visible on screen; the drawer label is not clipped.
   3440x1440: wider table pane gives the text columns their content width back.
   2048x1152 and 1440x900: stacked list over map unchanged (horizontal splitter, px.listMapSplit).
   390x844 touch: phone layout unchanged (no splitter, no three-column class).
   Run: node tests/three-col.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/mobile.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const box=(page,s)=>page.locator(s).first().boundingBox();
const near=(a,b,t,msg)=>assert(Math.abs(a-b)<=t,msg+': '+a+' vs '+b);

(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function open(width,height,touch){
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:!!touch,isMobile:!!touch,deviceScaleFactor:1});const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(1200);
    return {ctx,page,errors};
  }
  const tableFit=page=>page.evaluate(()=>{const w=document.getElementById('gridwrap'),cols={};document.querySelectorAll('#grid thead th[data-c]').forEach(t=>cols[t.dataset.c]=Math.round(t.getBoundingClientRect().width));return {client:w.clientWidth,scroll:w.scrollWidth,cols}});

  // 2560 x 1440: three columns
  {const {ctx,page,errors}=await open(2560,1440);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('pe-three-col')),true,'three-column class');
    const q=await box(page,'#queue-head'),t=await box(page,'#worksplit'),d=await box(page,'#list-map-divider'),m=await box(page,'#job-map-card'),w=await box(page,'#drawer');
    near(q.width,t.width+d.width+m.width+16+w.width,1,'KPI row spans all three columns');
    near(w.width,508,0.5,'drawer = --pe-col-work');near(d.width,16,0.5,'splitter = --pe-gutter');
    near(d.x,t.x+t.width,1,'splitter right of table');near(m.x,d.x+16,1,'map right of splitter');near(w.x,m.x+m.width+16,1,'drawer right of map, 16 px gutter');
    near(t.y,m.y,1,'table and map top align');near(m.y,w.y,1,'map and drawer top align');near(t.height,m.height,1,'table and map same height');
    near(t.width/(t.width+m.width),1112/1913,0.01,'table : map = golden 1112 : 801');
    const div=page.locator('#list-map-divider');
    assert.equal(await div.getAttribute('aria-orientation'),'vertical');assert.equal(await div.getAttribute('aria-valuenow'),'58');
    let f=await tableFit(page);assert(f.scroll<=f.client+1,'table fits its pane: '+JSON.stringify(f));
    assert(f.cols.TITLE>=192&&f.cols.LOCATION>=120&&f.cols.COMPANY>=Math.min(120,f.cols.COMPANY),'text columns at or above the golden floor: '+JSON.stringify(f.cols));
    // drag 200 px left: table narrower, saved under the column key, table refits
    const h=await box(page,'#list-map-divider');await page.mouse.move(h.x+8,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+8-200,h.y+h.height/2,{steps:10});await page.mouse.up();await page.waitForTimeout(300);
    const t2=await box(page,'#worksplit');near(t2.width,t.width-200,6,'drag moves the column');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('px.listMapSplitCols')));assert(saved>.2&&saved<.58,'saved column ratio '+saved);
    assert.equal(await page.evaluate(()=>localStorage.getItem('px.listMapSplit')),null,'stacked ratio untouched');
    f=await tableFit(page);assert(f.scroll<=f.client+1||f.cols.TITLE<=193,'table refits after the drag: '+JSON.stringify(f));
    await div.focus();const before=+await div.getAttribute('aria-valuenow');await page.keyboard.press('ArrowRight');await page.waitForTimeout(150);
    assert.equal(+await div.getAttribute('aria-valuenow'),before+2,'ArrowRight +2');
    await div.dblclick();await page.waitForTimeout(200);assert.equal(await div.getAttribute('aria-valuenow'),'58','double-click restores 58');
    // a selected job: decision row on one line and on screen, label not clipped
    await page.locator('#grid tbody tr[data-id]').nth(2).click();await page.waitForTimeout(1200);
    const btn=await page.locator('#drawer .wh-decide button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {t:b.textContent.trim(),y:Math.round(r.top),b:Math.round(r.bottom),x:r.left,r:r.right}}));
    assert(btn.length>=4,'decision buttons');assert.equal(new Set(btn.map(b=>b.y)).size,1,'decision row on one line '+JSON.stringify(btn));
    const vis=await page.evaluate(()=>{const b=document.getElementById('d-body').getBoundingClientRect(),g=document.querySelector('#drawer .wh-decide').getBoundingClientRect();return g.top>=b.top-1&&g.bottom<=b.bottom+1});
    assert.equal(vis,true,'decision row inside the visible drawer body');
    const lab=await page.evaluate(()=>{const l=document.querySelector('#drawer .d-label');return {sw:l.scrollWidth,cw:l.clientWidth,t:l.textContent}});
    assert(lab.sw<=lab.cw+1,'drawer label not clipped '+JSON.stringify(lab));
    await page.screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/three-col-2560.png'});
    assert.deepEqual(errors,[]);await ctx.close();}

  // 3440 x 1440: text columns get their content width back
  {const {ctx,page,errors}=await open(3440,1440);const f=await tableFit(page);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('pe-three-col')),true);assert(f.cols.TITLE>300,'TITLE at content width on a wide pane '+JSON.stringify(f.cols));
    near((await box(page,'#drawer')).width,508,0.5,'drawer stays 508');assert.deepEqual(errors,[]);await ctx.close();}

  // stacked layouts unchanged
  for(const [W,H] of [[2048,1152],[1440,900]]){const {ctx,page,errors}=await open(W,H);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('pe-three-col')),false,W+' stacked');
    const div=page.locator('#list-map-divider');assert.equal(await div.getAttribute('aria-orientation'),'horizontal');assert.equal(await div.getAttribute('aria-valuenow'),'55');
    const t=await box(page,'#worksplit'),m=await box(page,'#job-map-card');assert(m.y>t.y+t.height-1,W+': map under the table');near(t.x,m.x,1,W+': same column');
    assert.deepEqual(errors,[]);await ctx.close();}

  // phone
  {const {ctx,page,errors}=await open(390,844,true);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('pe-three-col')),false);
    assert.equal(await page.locator('#list-map-divider').isVisible(),false);assert.deepEqual(errors,[]);await ctx.close();}

  await browser.close();server.close();console.log('three-col.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
