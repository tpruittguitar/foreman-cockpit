/* Writer connection set on purpose (Tim 2026-11-02). A device with no saved connection reads the jobs through the built-in
   defaults but sends nothing: the phone header shows NO WRITER with a warning glyph, Decide explains it, Pursue queues
   nothing; desktop shows "Writer ⚠ not connected" in the status cells; even the desktop decision form's send is stopped by
   the last check in gsPost. A connection already saved before this change keeps sending. Clear asks first, then shows the
   not-connected state, and stays cleared after a reload.
   Every request outside the local server is aborted and every POST is recorded: none may leave a device without a
   deliberate connection.
   Run: node tests/writer-connection.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for the other browser tests) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..'),shots=process.env.MOBILE_SHOTS;   // MOBILE_SHOTS=<dir> also writes screenshots
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8').split('\n').map(l=>{const c=l.split(' | ');
  if(c.length<10||!/^\d+$/.test(c[0])||!/^(READY_TO_PURSUE|MANUAL_RESEARCH|SCOUT_INTAKE|DISCOVERY_LEAD)$/.test(c[4]))return l;c[4]='TIM_DECISION_REQUIRED';return c.join(' | ')}).join('\n');
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const phone={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};
  const master=()=>({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});
  async function open(opts,saved){
    const ctx=await browser.newContext(opts),page=await ctx.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(s=>{window.PX_TEST_BATCH_MS=150;if(s&&!sessionStorage.getItem('seeded')){localStorage.setItem('px.cfg',JSON.stringify(s));sessionStorage.setItem('seeded','1')}},saved||null);
    await ctx.route('**/*',r=>{const q=r.request(),u=q.url();
      if(q.method()==='POST'){posts.push(u);return u.startsWith(base+'/writer')?r.fulfill({json:{ok:true,receipt:{REQUEST_ID:JSON.parse(q.postData()||'{}').ruling?.requestId}}}):r.abort()}
      if(/\/api\/writer-read\?/.test(u)||u.startsWith(base+'/writer'))return /action=master/.test(u)?r.fulfill(master()):r.fulfill({json:{ok:true}});
      if(u.startsWith(base))return r.continue();return r.abort()});
    await page.goto(base+'/pipeline.html');
    return {ctx,page,errors,posts};
  }

  // 1. Phone, first visit (nothing saved): jobs load through the defaults, NO WRITER, Pursue sends nothing.
  let {ctx,page,errors,posts}=await open(phone);await page.waitForSelector('#m-pane-decide .m-card');await page.waitForTimeout(300);
  assert.strictEqual(await page.textContent('#m-sys-word'),'NO WRITER','phone header says NO WRITER');
  assert.ok(await page.$('#m-sys.m-nowriter svg'),'with a warning glyph');
  assert.strictEqual(await page.evaluate(()=>getComputedStyle(document.querySelector('.m-nowriter-note')).color),'rgb(232, 134, 42)','banner text orange, like the header');assert.match(await page.textContent('.m-nowriter-note'),/Writer not connected/,'Decide explains it');
  await page.click('.m-card.m-top [data-m-do="pursue"]');await page.waitForTimeout(500);
  assert.ok(await page.isHidden('#m-toast'),'no success toast');
  const say1=await page.textContent('.m-card.m-top .m-say');assert.match(await page.textContent('.m-card.m-top .m-say'),/Writer not connected/,'card says why');
  if(shots)await page.screenshot({path:path.join(shots,'stage3-no-writer-phone-390x844.png')});
  assert.deepStrictEqual(posts,[],'nothing sent from a first-visit phone');
  await page.click('[data-m-settings]');await page.waitForTimeout(300);assert.ok(await page.isVisible('#view-settings'),'the banner Settings link opens Settings');
  assert.deepStrictEqual(errors,[]);await ctx.close();

  // 2. Desktop, first visit: status cell shows the warning; the desktop decision form's send is stopped before any POST.
  ({ctx,page,errors,posts}=await open({viewport:{width:1440,height:900}}));await page.waitForSelector('#hstat .hs-nowriter');
  assert.match(await page.textContent('#hstat .hs-nowriter'),/Writer\s*not connected/,'desktop shows Writer not connected');assert.ok(await page.$('#hstat .hs-nowriter svg'),'with a warning glyph');
  await page.waitForFunction(()=>/off/.test(document.getElementById('writer-badge').textContent),null,{timeout:10000});await page.waitForTimeout(800);   // let the badge colour transition finish
  const wb=await page.evaluate(()=>{const b=document.getElementById('writer-badge'),c=document.querySelector('#hstat .hs-nowriter b');return {text:b.textContent.trim(),cls:b.className,badge:getComputedStyle(b.querySelector('b')).color,lines:Math.round(c.getBoundingClientRect().height/parseFloat(getComputedStyle(c).lineHeight||'14')),cell:getComputedStyle(c).color,bad:document.querySelector('#hstat .hs-nowriter').classList.contains('bad')}});
  assert.match(wb.text,/Writer\s*off/i,'centre box says Writer off, not idle ('+wb.text+')');assert.match(wb.cls,/\boff\b/);
  assert.deepStrictEqual([wb.badge,wb.cell,wb.bad],['rgb(232, 134, 42)','rgb(232, 134, 42)',false],'both Writer indicators orange, not red');
  assert.strictEqual(wb.lines,1,'not-connected cell stays on one line');
  if(shots)await page.screenshot({path:path.join(shots,'stage3-no-writer-desktop-1440x900.png'),clip:{x:0,y:0,width:1440,height:120}});
  await page.goto(base+'/pipeline.html?open=jobs');await page.waitForSelector('#grid tbody tr[data-id]');await page.click('#grid tbody tr[data-id]');
  await page.waitForSelector('#edit-state',{state:'attached'});await page.evaluate(()=>{const d=document.getElementById('decision-details');if(d)d.open=true});
  await page.selectOption('#edit-state','DECLINED_BY_TIM');await page.click('#save-decision');await page.waitForTimeout(1500);
  assert.deepStrictEqual(posts,[],'desktop decision form sends nothing without a deliberate connection');
  assert.deepStrictEqual(errors,[]);await ctx.close();

  // 3. A connection saved before this change (no deliberate flag) keeps sending, with no warning.
  ({ctx,page,errors,posts}=await open(phone,{url:base+'/writer',key:'test-only'}));await page.waitForSelector('#m-pane-decide .m-card');await page.waitForTimeout(300);
  assert.notStrictEqual(await page.textContent('#m-sys-word'),'NO WRITER','saved device is connected');assert.ok(!(await page.$('.m-nowriter-note')),'no warning');
  await page.click('.m-card.m-top [data-m-do="pursue"]');await page.waitForSelector('#m-toast:not([hidden])');await page.waitForTimeout(600);
  assert.strictEqual(posts.length,1,'saved device sends its decision');assert.ok(posts[0].startsWith(base+'/writer'),'to its own Writer');
  assert.deepStrictEqual(errors,[]);await ctx.close();

  // 4. Clear asks first; Cancel changes nothing; OK shows not-connected at once and it survives a reload.
  ({ctx,page,errors,posts}=await open({viewport:{width:1440,height:900}},{url:base+'/writer',key:'test-only'}));await page.waitForSelector('#hstat .hcell');
  assert.ok(!(await page.$('#hstat .hs-nowriter')),'connected desktop has no warning');
  await page.evaluate(()=>{location.hash='';});await page.goto(base+'/pipeline.html#settings');await page.waitForTimeout(400);
  if(!(await page.$('#cfg-clear')))await page.evaluate(()=>document.querySelector('[data-go="settings"]').click());await page.waitForSelector('#cfg-clear');
  let asked='';page.once('dialog',d=>{asked=d.message();d.dismiss()});await page.click('#cfg-clear');await page.waitForTimeout(200);
  assert.match(asked,/^Stop sending decisions from this device\?/,'Clear asks first');assert.ok(!(await page.$('#hstat .hs-nowriter')),'Cancel keeps the connection');
  page.once('dialog',d=>d.accept());await page.click('#cfg-clear');await page.waitForSelector('#hstat .hs-nowriter');
  await page.reload();await page.waitForSelector('#hstat .hs-nowriter');
  const cfg=await page.evaluate(()=>JSON.parse(localStorage.getItem('px.cfg')));assert.strictEqual(cfg.deliberate,false,'after a reload the device stays not connected');
  assert.deepStrictEqual(posts,[],'nothing sent');assert.deepStrictEqual(errors,[]);await ctx.close();

  await browser.close();server.close();console.log('writer-connection: all checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
