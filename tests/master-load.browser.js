/* Browser checks for the Explorer master-loading path (fail closed on freshness). Requests go to a local test-only writer.
   Run: node tests/master-load.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/ui.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..'),W=require('../apps-script/Code.gs');
const sample=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8').replace(/\r/g,'');
const plan=W.planMasterMigration_(sample.split('\n'),{at:'2026-10-05T00:00:00.000Z'});
const MASTER=(()=>{const l=plan.target.concat(['END V2_CURRENT_POPULATION_MASTER (0 rows)']),end=W.recomputeEndLine(l);return l.map(x=>/^END V2_/.test(x)?end:x).join('\n')})();
const ARCHIVE='V2_TERMINAL_ARCHIVE\n====\n'+plan.archive.join('\n'),COMPANION=[JSON.stringify({type:'HEADER'})].concat(plan.records.map(r=>JSON.stringify(r))).join('\n');
const MIG={mode:'LIVE',status:'CUTOVER_COMPLETE',archiveId:'ARCH',companionId:'COMP'};
const HTML404='<!DOCTYPE html><html><head><title>Page Not Found</title></head><body>Sorry, unable to open the file at this time.</body></html>';
// Navigate the way a user does: the rail on desktop (hover to reveal sub-items), the bottom bar or its More sheet on phones.
async function go(page,tab){const rail=page.locator('#rail');if(await rail.isVisible()){await rail.hover();if((await page.locator('#rail .rail-in').boundingBox()).width<100){await page.locator('#rail [data-group-btn]').first().click();await page.waitForTimeout(250)}const b=page.locator('#rail [data-tab="'+tab+'"], #rail [data-go="'+tab+'"]').first();await b.click();await page.mouse.move(700,450);await page.waitForTimeout(150);return}const bb=page.locator('#bottombar [data-go="'+tab+'"]');if(await bb.count()){await bb.click();await page.waitForTimeout(150);return}await page.locator('#bottombar [data-go="more"]').click();await page.locator('#sheet [data-go="'+tab+'"]').click();await page.waitForTimeout(150)}
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function scenario(name,fail,cache){
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],posts=[],gets=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(([c])=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));if(c)localStorage.setItem('px.cache',JSON.stringify(c))},[cache||null]);
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/writer*',async r=>{const req=r.request(),u=new URL(req.url()),a=u.searchParams.get('action');
      if(req.method()==='POST'){posts.push(req.postData());return r.fulfill({json:{ok:true}})}
      gets.push(a);if(u.searchParams.has('hydrate'))gets.push('HYDRATE_PARAM');
      if(fail[a]==='html')return r.fulfill({status:404,contentType:'text/html',body:HTML404});
      if(fail[a]==='html-once'&&gets.filter(x=>x===a).length===1)return r.fulfill({status:404,contentType:'text/html',body:HTML404});
      if(fail[a]==='html-once')delete fail[a];
      if(fail[a])return r.fulfill({json:fail[a]});
      const body=a==='master'?{ok:true,id:'M',fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-05T03:49:50Z',text:MASTER}:a==='archive'?{ok:true,archiveId:'ARCH',text:ARCHIVE}:a==='migration_status'?{ok:true,state:MIG}:a==='document_text'?{ok:true,fileId:u.searchParams.get('fileId'),text:COMPANION}:a==='evidence'?{ok:true,primaryId:u.searchParams.get('primaryId'),fields:{SCOUT_NOTES:'on-demand narrative'}}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true};
      await r.fulfill({json:body});});
    // Failures now retry for real (3 s + 8 s) before the page settles, so wait for the settled state, not a fixed time.
    await page.goto(base+'/pipeline.html');
    await page.waitForFunction(()=>{const f=document.body.dataset.freshness;return f&&f!=='loading'&&!/loading archive\/evidence/.test(document.getElementById('readout').textContent)},null,{timeout:40000});await page.waitForTimeout(300);
    const out={page,errors,posts,gets,alert:await page.locator('#load-alert').innerText(),alertVisible:await page.locator('#load-alert').isVisible(),readout:await page.locator('#readout').innerText(),freshness:await page.evaluate(()=>document.body.dataset.freshness),rows:await page.locator('#grid tbody tr[data-id]').count()};
    console.log(name.padEnd(28),JSON.stringify({freshness:out.freshness,alert:out.alert.slice(0,70),readout:out.readout.slice(-90),rows:out.rows,posts:posts.length}));
    return out;
  }
  // all reads succeed: no alert, Connected, archived rows present
  let s=await scenario('all reads ok',{});
  assert.equal(s.freshness,'live');assert.equal(s.alertVisible,false);assert.match(s.readout,/Connected/);assert.doesNotMatch(s.readout,/STALE/);
  await go(s.page,'pipeline');await s.page.waitForTimeout(200);
  assert.ok(s.gets.includes('master'));assert.ok(!s.gets.includes('HYDRATE_PARAM'),'the oversized hydrated read is never requested');assert.ok(s.gets.includes('archive')&&s.gets.includes('document_text')&&s.gets.includes('migration_status'));
  assert.equal(s.errors.length,0,s.errors.join('\n'));const liveCache=await s.page.evaluate(()=>localStorage.getItem('px.cache'));await s.page.close();
  // one transient HTML 404 on the master: retried after 3 s and recovered; LIVE, no warning, no write
  s=await scenario('master 404 once (retried)',{master:'html-once'});
  assert.equal(s.freshness,'live');assert.equal(s.alertVisible,false);assert.match(s.readout,/Connected/);
  assert.equal(s.gets.filter(a=>a==='master').length,2,'master read twice');assert.equal(s.posts.length,0);assert.equal(s.errors.length,0,s.errors.join('\n'));await s.page.close();
  // master fails (Google HTML 404) with a cache: STALE everywhere, never Connected, save does not POST
  s=await scenario('master 404 + cache',{master:'html'},JSON.parse(liveCache));
  assert.equal(s.freshness,'stale');assert.ok(s.alertVisible);assert.match(s.alert,/STALE · FETCH FAILED/);assert.match(s.alert,/NOT the live master/);
  assert.match(s.readout,/STALE · FETCH FAILED/);assert.doesNotMatch(s.readout,/Connected/);
  await go(s.page,'pipeline');await s.page.waitForTimeout(200);assert.ok(await s.page.locator('#grid tbody tr[data-id]').count()>0,'stale rows remain viewable');
  await s.page.locator('#grid tbody tr[data-id]').first().click();await s.page.locator('#edit-note').fill('test note');await s.page.locator('#save-decision').click();await s.page.waitForTimeout(400);
  assert.equal(s.posts.length,0,'no write while stale');assert.match(await s.page.locator('#edit-status').innerText(),/disabled|not loaded|Writes/i);
  await s.page.screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/master-load-stale.png'});
  assert.equal(s.errors.length,0,s.errors.join('\n'));await s.page.close();
  // master fails, no cache: NONE, no rows, no writes
  s=await scenario('master error + no cache',{master:{ok:false,error:'bad key'}});
  assert.equal(s.freshness,'none');assert.match(s.alert,/FETCH FAILED · NO DATA/);assert.match(s.readout,/FETCH FAILED/);assert.equal(s.rows,0);assert.equal(s.posts.length,0);await s.page.close();
  // malformed master (truncated): fail closed
  s=await scenario('master without COUNTS',{master:{ok:true,text:MASTER.split('\n').filter(l=>!/^COUNTS:/.test(l)).join('\n')}});
  assert.equal(s.freshness,'none');assert.match(s.alert,/no COUNTS line/);await s.page.close();
  // archive fails: master current, distinct amber notice
  s=await scenario('archive 404',{archive:'html'});
  assert.equal(s.freshness,'live');assert.match(s.alert,/ARCHIVE UNAVAILABLE/);assert.doesNotMatch(s.alert,/STALE/);assert.match(s.readout,/Connected.*ARCHIVE UNAVAILABLE/);assert.equal(s.posts.length,0);await s.page.close();
  // evidence fails: master current; on-demand narrative via the evidence read
  s=await scenario('evidence 404',{document_text:'html'});
  assert.equal(s.freshness,'live');assert.match(s.alert,/EVIDENCE UNAVAILABLE/);assert.match(s.readout,/EVIDENCE UNAVAILABLE/);
  const pidWithRef=plan.target.find(l=>/EVIDENCE_REF=EVC1:\d+/.test(l)).split(' | ')[1].trim();
  await go(s.page,'pipeline');await s.page.locator('#search').fill(pidWithRef);await s.page.waitForTimeout(300);
  await s.page.locator('#grid tbody tr[data-id]').first().click();await s.page.waitForTimeout(200);
  await s.page.locator('#row-evidence-load').click();await s.page.waitForTimeout(400);
  assert.match(await s.page.locator('#d-body').innerText(),/on-demand narrative/);assert.ok(s.gets.includes('evidence'));assert.equal(s.posts.length,0);
  assert.equal(s.errors.length,0,s.errors.join('\n'));await s.page.close();
  await browser.close();server.close();console.log('master-load browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
