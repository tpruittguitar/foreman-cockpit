/* Map acquisition, preferences and wheel zoom (PR #65), plus the display-only first-load selection. Local test-only writer. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end('missing')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage(),errors=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Pre-baselined profile with nothing seen, so any seen mark comes from this session. Tullahoma, TN is cached ~6 km from Huntsville, AL so the two form a dense pair; Huntsville has three fixture rows at one spot.
  await page.addInitScript(()=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));localStorage.setItem('px.baselined','true');localStorage.setItem('px.seen','{}');localStorage.setItem('px.geoCache',JSON.stringify({'tullahoma, tn':{lat:34.775,lon:-86.55,state:'TN',approx:false,source:'test'}}))});
  await page.route('**/writer*',r=>{const q=r.request(),a=new URL(q.url()).searchParams.get('action');if(q.method()==='POST')posts.push(q.postData());return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:{ok:true}})});
  await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
  await page.goto(base+'/pipeline.html');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(900);
  const zoom=async()=>+await page.locator('#job-map').getAttribute('data-zoom');
  const label=async()=>page.locator('#map-zoom-level').innerText();
  const pick=async(id)=>{await page.locator('#grid tbody tr[data-id="'+id+'"]').click();await page.waitForTimeout(1200)};
  const openLayers=async()=>{if(!(await page.locator('#job-map-card').evaluate(e=>e.classList.contains('layers-open'))))await page.locator('#map-layers').click();await page.waitForTimeout(220)};
  const closeLayers=async()=>{await page.locator('#job-map-card').evaluate(e=>e.classList.remove('layers-open'))};

  // 1. First load shows the top row in the workspace, display only: no write, no seen mark, no zoom, no URL change.
  const first=await page.evaluate(()=>({on:document.getElementById('drawer').classList.contains('on'),focus:document.querySelector('#grid tr.focus')&&document.querySelector('#grid tr.focus').dataset.id,top:document.querySelector('#grid tbody tr[data-id]').dataset.id,seen:JSON.parse(localStorage.getItem('px.seen')||'{}'),hash:decodeURIComponent(location.hash)}));
  assert(first.on,'workspace is filled on first load');assert.equal(first.focus,first.top,'the top row is the one shown');
  assert(!first.seen[first.focus],'auto-display does not mark the row seen');assert(!/"j":/.test(first.hash),'auto-display does not write the job into the URL');
  assert.equal(posts.length,0,'auto-display sends nothing to the Writer');assert.equal(await label(),'100%','auto-display does not zoom the map');
  const topClass=await page.locator('#grid tbody tr[data-id]').first().getAttribute('class');assert(!/\bseen\b/.test(topClass||''),'auto-display does not reorder or restyle the row as seen');

  // 2. Defaults: auto zoom on, 600%, dense boost on.
  await openLayers();assert(await page.locator('#map-autozoom').isChecked());assert.equal(await page.locator('#map-selzoom').inputValue(),'6');assert(await page.locator('#map-dense').isChecked());await closeLayers();
  await pick('V2X-299323199555');assert.equal(await label(),'600%','an ordinary location is acquired at 600%');
  // 3. Dense-area boost: Tullahoma sits ~6 km from Huntsville (other jobs in the current view), so selecting it zooms deeper (capped at 1000%).
  await pick('V2X-3EB07714AE24');const boosted=await zoom();assert(boosted>6&&boosted<=10.001,'a crowded pin is boosted past 600% (got '+boosted+')');
  await openLayers();await page.locator('#map-dense').uncheck();await closeLayers();
  await pick('V2X-A4CCD49EE686');assert.equal(await label(),'600%','with the boost off a crowded pin stays at the base zoom');
  // 4. Selection zoom preset.
  await openLayers();await page.locator('#map-selzoom').selectOption('3');await closeLayers();
  await pick('V2X-299323199555');assert.equal(await label(),'300%','the selection zoom preference applies');
  // 5. Auto zoom off: the map recentres on the job without changing zoom.
  await openLayers();await page.locator('#map-autozoom').uncheck();assert(await page.locator('#map-selzoom').isDisabled());await closeLayers();
  await page.locator('[data-mapaction="reset"]').click();await page.waitForTimeout(800);assert.equal(await label(),'100%');
  const cx0=+await page.locator('#job-map').getAttribute('data-center-x');await pick('V2X-A4CCD49EE686');
  assert.equal(await label(),'100%','auto zoom off keeps the current zoom');assert.notEqual(+await page.locator('#job-map').getAttribute('data-center-x'),cx0,'but the map still travels to the job');
  // preferences persist
  await page.reload();await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(600);await openLayers();
  assert(!(await page.locator('#map-autozoom').isChecked()));assert.equal(await page.locator('#map-selzoom').inputValue(),'3');assert(!(await page.locator('#map-dense').isChecked()));
  await page.locator('#map-autozoom').check();await page.locator('#map-selzoom').selectOption('6');await page.locator('#map-dense').check();await closeLayers();

  // 6. Wheel: zooms about the cursor, roughly 10% per notch, smoothly; only while the pointer is over the map.
  await pick('V2X-299323199555');assert.equal(await label(),'600%');
  const m=await page.locator('#job-map').boundingBox(),px=m.x+m.width/2+90,py=m.y+m.height/2+30;
  const under=()=>page.evaluate(([px,py])=>{const b=document.getElementById('job-map'),r=b.getBoundingClientRect(),s=Math.min(b.clientWidth/960,b.clientHeight/510)*+b.dataset.zoom;return {x:+b.dataset.centerX+(px-r.left-b.clientWidth/2)/s,y:+b.dataset.centerY+(py-r.top-b.clientHeight/2)/s}},[px,py]);
  await page.mouse.move(px,py);const z0=await zoom(),p0=await under();await page.mouse.wheel(0,-100);await page.waitForTimeout(350);const z1=await zoom(),p1=await under();
  assert(z1/z0>1.07&&z1/z0<1.13,'one wheel notch zooms in ~10% (ratio '+(z1/z0).toFixed(3)+')');
  const sc=await page.evaluate(()=>{const b=document.getElementById('job-map');return Math.min(b.clientWidth/960,b.clientHeight/510)*+b.dataset.zoom});
  assert(Math.hypot(p1.x-p0.x,p1.y-p0.y)*sc<2,'the point under the cursor stays put');
  await page.mouse.wheel(0,100);await page.waitForTimeout(350);assert(Math.abs(await zoom()-z0)<.01,'wheel down zooms back out');
  await page.mouse.wheel(0,-300);await page.waitForTimeout(400);const manual=await zoom();assert(manual>z0);
  // a re-render does not take the manual zoom back
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.waitForTimeout(500);assert(Math.abs(await zoom()-manual)<.01,'manual wheel zoom is not overridden by auto-zoom');
  // outside the map the wheel scrolls the table, not the map
  const g=await page.locator('#gridwrap').boundingBox();await page.mouse.move(g.x+g.width/2,g.y+g.height/2);const st0=await page.locator('#gridwrap').evaluate(e=>e.scrollTop);
  await page.mouse.wheel(0,300);await page.waitForTimeout(300);assert(Math.abs(await zoom()-manual)<.01,'wheel over the table leaves the map alone');assert(await page.locator('#gridwrap').evaluate(e=>e.scrollTop)>st0,'and scrolls the table');
  // Recenter keeps the zoom; Reset glides back to the full-US overview.
  await page.locator('[data-mapaction="recenter"]').click();await page.waitForTimeout(800);assert(Math.abs(await zoom()-manual)<.01,'Recenter keeps the current zoom');
  await page.locator('[data-mapaction="reset"]').click();await page.waitForTimeout(800);assert.equal(await label(),'100%');assert.equal(await page.locator('#job-map').getAttribute('data-center-x'),'480.000');

  // 7. Explicit selection still behaves as before: it marks the row seen (the existing state sync may follow).
  await pick('V2X-A4CCD49EE686');assert(await page.evaluate(()=>!!JSON.parse(localStorage.getItem('px.seen')||'{}')['V2X-A4CCD49EE686']),'an explicit selection marks the row seen as before');
  assert.equal(errors.length,0,errors.join('\n'));
  await browser.close();server.close();console.log('map browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
