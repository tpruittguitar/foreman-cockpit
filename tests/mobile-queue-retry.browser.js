/* Mobile shell Stage 5: Decide's decision-queue Retry never sticks on "Retrying…" (Tim + Grok Bot GUI, 2026-11-02).
   While a retry is in flight the button is disabled and says "Retrying…"; once it settles it is "Retry" again. A failed retry
   says so next to the button, with the reason and the time of the last successful load (ET, or "never"). A good retry clears
   the message and shows the queue. Covers the empty "unavailable" view and the "stale" banner over an older queue.
   Run: node tests/mobile-queue-retry.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for the other browser tests)
   MOBILE_SHOTS=<dir> also writes screenshots. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
const shots=process.env.MOBILE_SHOTS;
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');   // no TIM_DECISION_REQUIRED rows: Decide = the queue
const READY=['V2X-A4CCD49EE686','V2X-299323199555'],REV='a'.repeat(40);
// Feed state the test switches between phases. Each health read gets a new snapshot time, so every read loads the snapshot.
const feed={health:'ok',snapshot:'fail',delay:0,at:null,n:0};
function healthBody(){feed.at=new Date(Date.now()-60000+(++feed.n)*10).toISOString();
  return {ok:true,sourceRevision:REV,processFlow:{at:feed.at,population:{reconciled:true},upstream:{reconciled:true,waiting:1},queues:{enrichment:0,readyForReview:READY.length}},decisionReady:{at:feed.at,ids:READY}}}
function snapshotBody(){return {schema:'forge.waiting-queues.v1',reconciled:true,at:feed.at,ids:{enrichment:[],decision:READY},counts:{enrichment:0,decision:READY.length,intake:1},
  intake:{pages:[{path:'state/waiting-queues/intake-0001.json',count:1,sha256:'b'.repeat(64)}]}}}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));window.PX_TEST_BATCH_MS=150});
  await page.route('**/script.google.com/**',r=>r.abort());await page.route('**/script.googleusercontent.com/**',r=>r.abort());   // never reach the production Writer
  await page.route('**/api.github.com/**',r=>r.fulfill({json:{}}));
  await page.route('**/raw.githubusercontent.com/**',async r=>{
    if(!/PIPELINE_WAITING_QUEUES\.json$/.test(r.request().url()))return r.fulfill({body:''});
    if(feed.delay)await wait(feed.delay);
    return feed.snapshot==='ok'?r.fulfill({json:snapshotBody()}):r.fulfill({status:503,body:'down'})});
  await page.route('**/api/pipeline-health*',async r=>{if(feed.delay)await wait(feed.delay);return feed.health==='ok'?r.fulfill({json:healthBody()}):r.fulfill({status:503,body:'down'})});
  await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');
    if(a==='master')return r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});
    return r.fulfill({json:{ok:true}})});
  await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#m-pane-decide');
  const btn='#m-pane-decide [data-m-retry-queue]',note='#m-pane-decide [data-m-retry-note]';
  const state=()=>page.evaluate(([b,n])=>{const x=document.querySelector(b),y=document.querySelector(n);return {text:x&&x.textContent.trim(),disabled:x&&x.disabled,note:y&&y.textContent.trim(),cards:document.querySelectorAll('#m-pane-decide .m-card').length,
    unavailable:/Decision queue unavailable/.test(document.querySelector('#m-pane-decide').textContent),stale:/^Showing queue from /.test(((document.querySelector('#m-pane-decide .m-stale')||{}).textContent||'').trim()),
    banner:((document.querySelector('#m-pane-decide .m-stale')||{}).textContent||'').trim(),sys:document.getElementById('m-sys-word').textContent,sysCls:document.getElementById('m-sys').className,
    count:document.querySelector('#m-pane-decide .m-count b').textContent,chips:[...document.querySelectorAll('#m-pane-decide [data-m-filter]')].map(c=>c.textContent.trim())}},[btn,note]);
  // One retry: the button must show the in-flight state (disabled, "Retrying…"), then settle back to an enabled "Retry".
  // Waiting for both avoids reading the previous "Retry" before the click has taken effect.
  async function retry(){feed.delay=400;await page.click(btn);
    await page.waitForFunction(b=>{const x=document.querySelector(b);return x&&x.disabled&&x.textContent.trim()==='Retrying…'},btn,{timeout:5000});
    await page.waitForFunction(b=>{const x=document.querySelector(b);return x&&!x.disabled&&x.textContent.trim()==='Retry'},btn,{timeout:15000});feed.delay=0;return state()}
  const T=/\d{1,2}:\d{2} [AP]M ET/;

  // 1. Nothing loaded yet: the snapshot fails, Decide says the queue is unavailable and offers Retry.
  await page.waitForSelector(btn,{timeout:20000});let s=await state();
  assert.ok(s.unavailable,'empty Decide says the queue is unavailable');assert.strictEqual(s.text,'Retry');assert.strictEqual(s.note,null,'no failure message before a retry');
  // The header never says SYS OK while the queue is failing, and unknown counts read "—", not "0" (Tim, Stage 5 review).
  assert.strictEqual(s.sys,'QUEUE DOWN','header says QUEUE DOWN');assert.match(s.sysCls,/\bm-qdown\b/,'orange (attn) style');
  assert.ok(await page.$eval('#m-sys-ic',e=>!!e.querySelector('svg path')),'with the warning glyph');
  await wait(600);   // let the header's colour transition finish before comparing
  const icons=await page.evaluate(()=>{const c=e=>getComputedStyle(e).color,v=document.querySelector('#m-pane-decide .m-done .m-g'),h=document.querySelector('#m-sys-ic svg');
    return {view:c(v),head:c(h),same:v.innerHTML===h.innerHTML.replace(/\s+$/,'')||v.innerHTML.replace(/\s/g,'')===h.innerHTML.replace(/\s/g,'')}});
  assert.strictEqual(icons.view,icons.head,'the empty view and the header use the same orange for queue down '+JSON.stringify(icons));
  assert.ok(icons.same,'and the same ⚠ glyph '+JSON.stringify(icons));
  assert.strictEqual(s.count,'—','"— need you", not "0 need you"');assert.deepStrictEqual(s.chips,['All · —','Act now · —'],'chip counts read —');

  // 2. A retry in flight is disabled and says "Retrying…"; when it fails it is "Retry" again, with the reason and "never".
  s=await retry();
  assert.match(s.note||'',new RegExp('^Retry failed at '+T.source+' \\(server error\\)\\. Last successful load: never\\.$'),'failed retry says when, why and the last good load: '+s.note);
  await wait(6500);const later=await state();   // longer than the 5 s Decide refresh
  assert.deepStrictEqual(later,s,'nothing flips back to "Retrying…" on later refreshes');
  if(shots)await page.screenshot({path:path.join(shots,'stage5-retry-failed-390x844.png')});

  // 3. A health feed failure is reported with its own reason.
  feed.health='fail';s=await retry();
  assert.match(s.note||'',/\(server error\)\. Last successful load: never\.$/,'health feed failure (HTTP 503) reads "server error": '+s.note);

  // 4. A good retry clears the message and shows the queue.
  feed.health='ok';feed.snapshot='ok';await page.click(btn);
  await page.waitForFunction(()=>document.querySelectorAll('#m-pane-decide .m-card').length===2,null,{timeout:15000});
  s=await state();assert.strictEqual(s.note,null,'success clears the failure message');assert.ok(!s.unavailable&&!s.stale,'queue shown, no unavailable or stale notice');assert.strictEqual(s.text,null,'no Retry button once the queue is ready');
  assert.ok(!/QUEUE/.test(s.sys),'header no longer reports the queue once it loads ('+s.sys+')');assert.strictEqual(s.count,'2','counts are numbers again');

  // 5. A later refresh fails over the loaded queue (stale), and a failed retry names the last successful load time.
  // The desktop re-reads the health feed on its own 60 s timer; the bridge's retryDecide runs the same setDecisionReady_ path now.
  feed.snapshot='fail';await page.evaluate(()=>PEMobileBridge.retryDecide());
  await page.waitForFunction(()=>/^Showing queue from /.test(((document.querySelector('#m-pane-decide .m-stale')||{}).textContent||'').trim()),null,{timeout:15000});
  s=await state();assert.strictEqual(s.cards,2,'the older queue stays on screen');assert.strictEqual(s.text,'Retry');
  assert.match(s.banner,new RegExp('^Showing queue from '+T.source+'\\. Refresh failed \\(server error\\)\\. Retry$'),'short stale banner: '+s.banner);
  assert.strictEqual(s.sys,'QUEUE STALE','header says QUEUE STALE');assert.ok(await page.$eval('#m-sys-ic',e=>!!e.querySelector('svg path')),'QUEUE STALE has the "?" glyph');assert.match(s.sysCls,/\bm-delayed\b/,'yellow (caution) style');assert.strictEqual(s.count,'2','an older queue keeps its counts');
  if(shots)await page.screenshot({path:path.join(shots,'stage5-queue-stale-390x844.png')});
  s=await retry();
  assert.match(s.note||'',new RegExp('^Retry failed at '+T.source+' \\(server error\\)\\.$'),'stale retry says when and why: '+s.note);
  assert.match(s.banner,new RegExp('^Showing queue from '+T.source+'\\. Retry failed at '+T.source+' \\(server error\\)\\. Retry$'),'stale banner after a failed retry keeps the last good load time: '+s.banner);
  assert.strictEqual(s.sys,'QUEUE STALE','still QUEUE STALE');
  if(shots)await page.screenshot({path:path.join(shots,'stage5-retry-stale-failed-390x844.png')});

  assert.deepStrictEqual(errors,[],'no page errors');
  await browser.close();server.close();console.log('mobile queue retry browser: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
