/* Private Writer setup: first visits and cleared devices remain unconfigured with no reads/posts.
   Explicitly saved connections still load fixtures and send decisions. Cancel preserves a connection;
   confirmed Clear stays empty after reload. All Writer responses are local fixtures and external traffic is blocked.
   Run: node tests/writer-connection.browser.js (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM supported). */
require('./helpers/block-production-writer.cjs'); // no request to the production Writer
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
    const ctx=await browser.newContext(opts),page=await ctx.newPage(),errors=[],posts=[],reads=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(s=>{window.PX_TEST_BATCH_MS=150;if(s&&!sessionStorage.getItem('seeded')){localStorage.setItem('px.cfg',JSON.stringify(s));sessionStorage.setItem('seeded','1')}},saved||null);
    await ctx.route('**/*',r=>{const q=r.request(),u=q.url();
      if(q.method()==='POST'){posts.push(u);return u.startsWith(base+'/writer')?r.fulfill({json:{ok:true,receipt:{REQUEST_ID:JSON.parse(q.postData()||'{}').ruling?.requestId}}}):r.abort()}
      if(/\/api\/(master|structured)/.test(u))reads.push(u);
      if(/\/api\/writer-read\?/.test(u)||u.startsWith(base+'/writer')){reads.push(u);return /action=master/.test(u)?r.fulfill(master()):r.fulfill({json:{ok:true}});}
      if(u.startsWith(base))return r.continue();return r.abort()});
    await page.goto(base+'/pipeline.html');
    return {ctx,page,errors,posts,reads};
  }

  // 1. First-visit phone has no bundled credential: setup is shown, with no job data or traffic.
  let {ctx,page,errors,posts,reads}=await open(phone);await page.waitForSelector('#cfg-url',{state:'attached'});await page.waitForTimeout(300);
  assert.strictEqual(await page.inputValue('#cfg-url'),'');assert.strictEqual(await page.inputValue('#cfg-key'),'');
  assert.strictEqual(await page.locator('#m-pane-decide .m-card').count(),0,'no jobs without configuration');
  assert.deepStrictEqual(reads,[],'no first-visit live reads');assert.deepStrictEqual(posts,[],'no first-visit writes');
  if(shots)await page.screenshot({path:path.join(shots,'stage3-no-writer-phone-390x844.png')});
  assert.deepStrictEqual(errors,[]);await ctx.close();

  // 2. First-visit desktop shows the actual empty-configuration state, without fetching jobs.
  ({ctx,page,errors,posts,reads}=await open({viewport:{width:1440,height:900}}));
  await page.waitForFunction(()=>/not configured/.test(document.getElementById('writer-badge').textContent),null,{timeout:15000});
  assert.match(await page.textContent('#writer-badge'),/Writer\s*not configured/i);
  assert.match(await page.getAttribute('#writer-badge','class'),/\boff\b/);
  if(shots)await page.screenshot({path:path.join(shots,'stage3-no-writer-desktop-1440x900.png'),clip:{x:0,y:0,width:1440,height:120}});
  await page.goto(base+'/pipeline.html?open=jobs');await page.waitForSelector('#cfg-url',{state:'attached'});await page.waitForTimeout(300);
  assert.strictEqual(await page.locator('#grid tbody tr[data-id]').count(),0,'no jobs without configuration');
  assert.deepStrictEqual(reads,[],'desktop first visit makes no live reads');
  assert.deepStrictEqual(posts,[],'desktop first visit sends nothing');
  assert.deepStrictEqual(errors,[]);await ctx.close();

  // 3. A connection saved before this change (no deliberate flag) keeps sending, with no warning.
  ({ctx,page,errors,posts,reads}=await open(phone,{url:base+'/writer',key:'test-only'}));await page.waitForSelector('#m-pane-decide .m-card');await page.waitForTimeout(300);
  assert.notStrictEqual(await page.textContent('#m-sys-word'),'NO WRITER','saved device is connected');assert.ok(!(await page.$('.m-nowriter-note')),'no warning');
  await page.click('.m-card.m-top [data-m-do="pursue"]');await page.waitForSelector('#m-toast:not([hidden])');await page.waitForTimeout(600);
  assert.strictEqual(posts.length,1,'saved device sends its decision');assert.ok(posts[0].startsWith(base+'/writer'),'to its own Writer');
  assert.deepStrictEqual(errors,[]);await ctx.close();

  // 4. Clear asks first; Cancel changes nothing; OK shows not-connected at once and it survives a reload.
  ({ctx,page,errors,posts,reads}=await open({viewport:{width:1440,height:900}},{url:base+'/writer',key:'test-only'}));await page.waitForSelector('#hstat .hcell');
  assert.ok(!/not configured|off/.test(await page.textContent('#writer-badge')),'connected desktop is not Writer off');
  await page.evaluate(()=>{location.hash='';});await page.goto(base+'/pipeline.html#settings');await page.waitForTimeout(400);
  if(!(await page.$('#cfg-clear')))await page.evaluate(()=>document.querySelector('[data-go="settings"]').click());await page.waitForSelector('#cfg-clear');
  let asked='';page.once('dialog',d=>{asked=d.message();d.dismiss()});await page.click('#cfg-clear');await page.waitForTimeout(200);
  assert.match(asked,/^Stop sending decisions from this device\?/,'Clear asks first');assert.ok(!/not configured|off/.test(await page.textContent('#writer-badge')),'Cancel keeps the connection');
  page.once('dialog',d=>d.accept());await page.click('#cfg-clear');await page.waitForFunction(()=>/not configured|off/.test(document.getElementById('writer-badge').textContent),null,{timeout:15000});
  reads.length=0;await page.reload();await page.waitForFunction(()=>{const b=document.getElementById('writer-badge');return /not configured/.test(b.textContent)},null,{timeout:15000});
  const cfg=await page.evaluate(()=>JSON.parse(localStorage.getItem('px.cfg')));assert.strictEqual(cfg.deliberate,false,'after a reload the device stays not connected');
  assert.strictEqual(cfg.url,'');assert.strictEqual(cfg.key,'');
  assert.deepStrictEqual(reads,[],'cleared device does not read after reload');
  assert.strictEqual(await page.locator('#grid tbody tr[data-id]').count(),0);
  assert.deepStrictEqual(posts,[],'nothing sent');assert.deepStrictEqual(errors,[]);await ctx.close();

  await browser.close();server.close();console.log('writer-connection: all checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
