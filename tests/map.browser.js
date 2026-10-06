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
  await page.addInitScript(()=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));localStorage.setItem('px.baselined','true');localStorage.setItem('px.seen','{}');localStorage.setItem('px.geoCache',JSON.stringify({'tullahoma, tn':{lat:34.775,lon:-86.55,state:'TN',approx:false,source:'test'},'costa mesa, ca':{lat:33.6411,lon:-117.9187,state:'CA',approx:false,source:'test'},'louisville, co':{lat:39.9778,lon:-105.1319,state:'CO',approx:false,source:'test'}}))});
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
  // 3. Nothing checked: the Selected layer shows the single selected job, so a lone pin is not boosted.
  const shown=()=>page.locator('.map-target:not([hidden])').count(),drawn=()=>page.locator('.map-target').count();
  const check=async(id,on)=>{const cb=page.locator('#grid tbody tr[data-id="'+id+'"] .row-select');on?await cb.check():await cb.uncheck();await page.waitForTimeout(1100)};
  await pick('V2X-3EB07714AE24');assert.equal(await label(),'600%','a single job is acquired at 600%');assert.equal(await drawn(),1,'only the selected job is drawn when nothing is checked');
  // Checked jobs: every checked job is drawn and the map frames them all. Tullahoma and Huntsville are ~6 km apart, so the dense boost separates them (capped at 1000%).
  await check('V2X-A4CCD49EE686',true);const boosted=await zoom();
  assert.equal(await drawn(),2,'the checked job is drawn with the selected one');assert.equal(await shown(),2,'both are on screen');assert(boosted>6&&boosted<=10.001,'a crowded selection is boosted past 600% (got '+boosted+')');
  assert.match(await page.locator('#map-sub').innerText(),/1 selected job/);
  // A far-away checked job (Louisville, CO): the map zooms out to keep every selected pin on screen.
  await check('V2X-299323199555',true);assert.equal(await drawn(),3);assert.equal(await shown(),3,'all checked jobs stay on screen');assert(await zoom()<6,'framing zooms out for spread-out selections');
  // Checked jobs filtered out of the queue (or scrolled off it) still show on the map.
  await page.locator('#search').fill('Tullahoma');await page.waitForTimeout(1100);assert.equal(await page.locator('#grid tbody tr[data-id="V2X-A4CCD49EE686"]').count(),0,'Huntsville row is filtered out of the queue');
  assert.equal(await drawn(),3,'checked jobs outside the current view are still drawn');assert.equal(await shown(),3);
  await page.locator('#search').fill('');await page.waitForTimeout(1100);
  // Clearing the checks returns to the single selected job.
  await check('V2X-299323199555',false);await check('V2X-A4CCD49EE686',false);assert.equal(await drawn(),1,'no checks: back to the single job');
  // Dense boost off: a checked crowded pair is framed at the selection zoom, no deeper.
  await openLayers();await page.locator('#map-dense').uncheck();await closeLayers();
  await check('V2X-A4CCD49EE686',true);await pick('V2X-3EB07714AE24');assert.equal(await label(),'600%','with the boost off a crowded selection stays at the base zoom');await check('V2X-A4CCD49EE686',false);
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

  // 8. Selected layer = the explicit checkbox selection, independent of table scrolling.
  const pinOf=(name)=>page.locator('.map-target[aria-label="'+name+'"]');
  const checkedIds=()=>page.$$eval('#grid tbody .row-select',c=>c.filter(x=>x.checked).map(x=>x.dataset.id));
  const offScreen=(id)=>page.evaluate(id=>{const w=document.getElementById('gridwrap').getBoundingClientRect(),h=document.querySelector('#grid thead').getBoundingClientRect().bottom,r=document.querySelector('#grid tbody tr[data-id="'+id+'"]').getBoundingClientRect();return r.top>=w.bottom||r.bottom<=h},id);
  const scrollTable=(top)=>page.locator('#gridwrap').evaluate((e,t)=>{e.scrollTop=t?0:e.scrollHeight},top);
  assert.deepEqual(await checkedIds(),[],'start with no checkbox selections');
  // 8.1 No checkbox selections + focused row: exactly one pin, the focused one, at the selection zoom. Huntsville is in the current view
  // ~6 km away but is not rendered, so it must not drive a boost.
  await pick('V2X-3EB07714AE24');assert.equal(await drawn(),1,'no checks: exactly one selected pin');assert(await pinOf('Tullahoma, TN').evaluate(e=>e.classList.contains('active')),'the focused pin is highlighted');
  assert.equal(await label(),'600%','unrendered Current View neighbours do not boost a single pin');
  // 8.2 Three checked jobs, one of them scrolled off the table viewport: all three render.
  await check('V2X-F5344DCB7B12',true);await scrollTable(true);await page.waitForTimeout(200);assert(await offScreen('V2X-F5344DCB7B12'),'Costa Mesa row is scrolled off-screen');
  await check('V2X-A4CCD49EE686',true);await check('V2X-299323199555',true);await scrollTable(true);await page.waitForTimeout(200);assert(await offScreen('V2X-F5344DCB7B12'));
  await pick('V2X-A4CCD49EE686');await scrollTable(true);await page.waitForTimeout(300);assert(await offScreen('V2X-F5344DCB7B12'),'still scrolled off after focusing');
  for(const n of ['Huntsville, AL','Louisville, CO','Costa Mesa, CA'])assert.equal(await pinOf(n).count(),1,n+' pin renders');
  assert.equal(await drawn(),3,'exactly the three checked jobs render');assert.equal(await shown(),3,'and all three are on screen');
  // 8.3 Focus one of the three: all three remain, checks are kept, the layer stays Selected, the focused pin gets the active treatment.
  await pick('V2X-299323199555');assert.equal(await drawn(),3);assert.equal(await shown(),3);
  assert.deepEqual((await checkedIds()).sort(),['V2X-299323199555','V2X-A4CCD49EE686','V2X-F5344DCB7B12'],'focusing a row does not clear the checkbox selection');
  assert.equal(await page.locator('[data-mapfilter="selected"]').getAttribute('aria-pressed'),'true','the layer stays Selected');
  const activeLabels=async()=>page.$$eval('.map-target.active',b=>b.map(x=>x.getAttribute('aria-label')));
  assert.deepEqual(await activeLabels(),['Louisville, CO'],'only the focused pin is active');
  const hb=await pinOf('Huntsville, AL').boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.waitForTimeout(150);
  const g2=await page.locator('#gridwrap').boundingBox();await page.mouse.move(g2.x+20,g2.y+20);await page.waitForTimeout(150);
  assert.deepEqual(await activeLabels(),['Louisville, CO'],'after hovering another pin the focused one keeps the active treatment');
  const pinState=(n)=>pinOf(n).evaluate(e=>({checked:e.classList.contains('checked'),focused:e.classList.contains('focused')}));
  assert.deepEqual(await pinState('Louisville, CO'),{checked:true,focused:true},'checked + open: both states, focused look');
  assert.deepEqual(await pinState('Huntsville, AL'),{checked:true,focused:false},'checked only: selected state');
  // 8.3b Three checked jobs + a different, unchecked open job: four pins, count stays three, checks unchanged.
  const before=(await checkedIds()).sort();await pick('V2X-3EB07714AE24');
  assert.equal(await drawn(),4,'three checked + one focused-only job render four pins');assert.equal(await shown(),4,'all four on screen');
  assert.match(await page.locator('#map-sub').innerText(),/^3 selected jobs\b/,'the count reports checkbox selections only');
  assert.deepEqual(await pinState('Tullahoma, TN'),{checked:false,focused:true},'the open, unchecked job gets the focused treatment only');
  for(const n of ['Huntsville, AL','Louisville, CO','Costa Mesa, CA'])assert.deepEqual(await pinState(n),{checked:true,focused:false},n+' keeps the selected treatment');
  assert.deepEqual((await checkedIds()).sort(),before,'opening an unchecked job leaves the checkbox selection unchanged');
  assert.equal(await page.locator('#grid tbody tr[data-id="V2X-3EB07714AE24"] .row-select').isChecked(),false);
  // 8.4 Clustered selection: only Huntsville + Tullahoma checked, so the boost reacts to that rendered pair.
  await check('V2X-299323199555',false);await check('V2X-F5344DCB7B12',false);await check('V2X-3EB07714AE24',true);await pick('V2X-3EB07714AE24');
  assert.equal(await drawn(),2,'the rendered set is the clustered pair');const cz=await zoom();assert(cz>6&&cz<=10.001,'crowded selected pins boost past 600% (got '+cz+')');assert.equal(await shown(),2);
  // 8.5 Clearing the checkbox selections returns to single focused-job behaviour.
  await check('V2X-3EB07714AE24',false);await check('V2X-A4CCD49EE686',false);assert.deepEqual(await checkedIds(),[]);
  assert.equal(await drawn(),1,'back to exactly one pin');assert.equal(await label(),'600%','single-job acquisition at the selection zoom');assert.deepEqual(await activeLabels(),['Tullahoma, TN']);

  // 7. Explicit selection still behaves as before: it marks the row seen (the existing state sync may follow).
  await pick('V2X-A4CCD49EE686');assert(await page.evaluate(()=>!!JSON.parse(localStorage.getItem('px.seen')||'{}')['V2X-A4CCD49EE686']),'an explicit selection marks the row seen as before');
  assert.equal(errors.length,0,errors.join('\n'));
  await browser.close();server.close();console.log('map browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
