/* Browser checks for iPhone Safari use: the job table is reachable, the map works by touch, inputs do not trigger
   Safari's focus zoom, and the Desktop/Mobile layout switch (and Safari's "Request Desktop Website") take effect.
   Run: node tests/mobile.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/ui.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const IPHONE={viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'};
const MAC_UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function open(ctxOpts,layout){
    const ctx=await browser.newContext(ctxOpts),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(([l])=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));if(l&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('px.layout',l)}},[layout||'']);
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true}})});
    await page.goto(base+'/pipeline.html');await page.locator('[data-tab="pipeline"]').first().click();await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(400);
    return {ctx,page,errors};
  }
  // iPhone portrait: the table sits inside the pipeline view and its first row is on screen
  let {ctx,page,errors}=await open(IPHONE);
  const fit=await page.evaluate(()=>{const v=document.getElementById('view-pipeline').getBoundingClientRect(),w=document.getElementById('worksplit').getBoundingClientRect(),row=document.querySelector('#grid tbody tr[data-id]').getBoundingClientRect();return {viewBottom:v.bottom,workTop:w.top,workBottom:w.bottom,rowBottom:row.bottom,innerH:innerHeight}});
  assert(fit.workTop<fit.viewBottom-200,'the job table starts inside the pipeline view');assert(Math.abs(fit.workBottom-fit.viewBottom)<2);assert(fit.rowBottom<fit.innerH,'first job row is on screen');
  // no input below 16px (Safari zooms the page on focus otherwise)
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]),select,textarea')].filter(e=>e.offsetParent&&parseFloat(getComputedStyle(e).fontSize)<16).length),0);
  // tap a row: the job opens; expand the map full screen; pinch zooms; a stray tap on the map keeps the job open
  await page.locator('#grid tbody tr[data-id]').first().tap();
  await page.waitForFunction(()=>document.getElementById('drawer').classList.contains('on'),null,{timeout:5000});await page.waitForTimeout(600);
  await page.locator('[data-mapaction="expand"]').tap();await page.waitForTimeout(400);
  const card=await page.locator('#job-map-card').boundingBox();assert(card.width>=389&&card.height>=843,'map is full screen');
  assert.equal(await page.locator('[data-mapaction="expand"]').innerText(),'Close map'.toUpperCase());
  const cdp=await ctx.newCDPSession(page),m=await page.locator('#job-map').boundingBox(),cx=m.x+m.width/2,cy=m.y+m.height/2;
  const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((p,i)=>({x:p[0],y:p[1],id:i}))});
  await page.locator('[data-mapaction="reset"]').tap();await page.waitForTimeout(400);
  await touch('touchStart',[[cx-30,cy],[cx+30,cy]]);for(let k=1;k<=6;k++)await touch('touchMove',[[cx-30-k*12,cy],[cx+30+k*12,cy]]);await touch('touchEnd',[]);await page.waitForTimeout(200);
  assert(+await page.locator('#job-map').getAttribute('data-zoom')>2,'pinch zooms the map');
  const x0=+await page.locator('#job-map').getAttribute('data-center-x');await touch('touchStart',[[cx,cy]]);for(let k=1;k<=5;k++)await touch('touchMove',[[cx+k*15,cy]]);await touch('touchEnd',[]);await page.waitForTimeout(300);
  assert(+await page.locator('#job-map').getAttribute('data-center-x')<x0,'one finger pans the zoomed map');
  await page.locator('[data-mapaction="expand"]').tap();await page.waitForTimeout(400);assert(!await page.evaluate(()=>document.body.classList.contains('map-full')));
  const mb=await page.locator('#job-map').boundingBox();await page.touchscreen.tap(mb.x+mb.width-6,mb.y+mb.height/2);await page.waitForTimeout(300);
  assert(await page.evaluate(()=>document.getElementById('drawer').classList.contains('on')),'a tap on empty map does not close the job on touch');
  // the layout switch is offered on a phone and reloads into the 1280px desktop layout
  assert.equal(await page.locator('#layout-toggle').innerText(),'DESKTOP');
  await Promise.all([page.waitForEvent('load'),page.locator('#layout-toggle').tap()]);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>innerWidth),1280);assert.equal(await page.locator('#layout-toggle').innerText(),'MOBILE');
  await Promise.all([page.waitForEvent('load'),page.locator('#layout-toggle').click()]);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>innerWidth),390,'back to the phone layout');
  assert.equal(errors.length,0,errors.join('\n'));await ctx.close();
  // Safari "Request Desktop Website" (Mac user agent on a phone-sized touch screen) gets the desktop layout; a saved Mobile choice wins
  ({ctx,page}=await open(Object.assign({},IPHONE,{userAgent:MAC_UA})));assert.equal(await page.evaluate(()=>innerWidth),1280);await ctx.close();
  ({ctx,page}=await open(Object.assign({},IPHONE,{userAgent:MAC_UA}),'mobile'));assert.equal(await page.evaluate(()=>innerWidth),390);await ctx.close();
  // desktop with a mouse: no switch, no expand button, the normal viewport
  ({ctx,page}=await open({viewport:{width:1440,height:900}}));
  assert(!await page.locator('#layout-toggle').isVisible());assert(!await page.locator('[data-mapaction="expand"]').isVisible());assert.equal(await page.evaluate(()=>innerWidth),1440);await ctx.close();
  await browser.close();server.close();console.log('mobile browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
