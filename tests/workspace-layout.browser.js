/* Browser checks for the desktop workspace layout mode: entering and leaving it, and no lock-in after a reload.
   Regression for 2026-10-11: the toolbar was rebuilt on every animation frame while editing (its own DOM writes
   re-triggered the body MutationObserver), so the Done button never received a click, and the saved editing flag
   put the app straight back into layout mode after a restart.
   Run: node tests/workspace-layout.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/mobile.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
async function go(page,tab){const rail=page.locator('#rail');await rail.hover();if((await page.locator('#rail .rail-in').boundingBox()).width<100){await page.locator('#rail [data-group-btn]').first().click();await page.waitForTimeout(250)}await page.locator('#rail [data-tab="'+tab+'"], #rail [data-go="'+tab+'"]').first().click();await page.mouse.move(700,450);await page.waitForTimeout(150)}
const editing=page=>page.evaluate(()=>document.body.classList.contains('workspace-layout-edit'));
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
  await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
  await page.route('**/writer*',r=>{const a=new URL(r.request().url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?{ok:true,level:'ok',warnings:[],queue:{processing:[]}}:{ok:true}})});
  // Layout mode does not depend on job data; the pipeline view and its panels render without rows.
  await page.goto(base+'/pipeline.html');await page.waitForSelector('#workspace-layout-toolbar [data-ws-toggle]');await page.waitForTimeout(400);

  // enter layout mode
  assert.equal(await editing(page),false,'starts outside layout mode');
  await page.locator('#workspace-layout-toolbar [data-ws-toggle]').click();await page.waitForTimeout(300);
  assert.equal(await editing(page),true,'Layout enters layout mode');

  // the toolbar must be stable while editing (no rebuild every frame)
  const churn=await page.evaluate(()=>new Promise(res=>{let n=0;const bar=document.getElementById('workspace-layout-toolbar');const o=new MutationObserver(m=>{n+=m.length});o.observe(bar,{childList:true,subtree:true,characterData:true});setTimeout(()=>{o.disconnect();res(n)},700)}));
  assert(churn<=2,'toolbar DOM is stable while editing (mutations in 700ms: '+churn+')');

  // Done leaves layout mode
  await page.locator('#workspace-layout-toolbar [data-ws-toggle]').click();await page.waitForTimeout(300);
  assert.equal(await editing(page),false,'Done leaves layout mode');

  // Escape also leaves layout mode
  await page.locator('#workspace-layout-toolbar [data-ws-toggle]').click();await page.waitForTimeout(200);
  assert.equal(await editing(page),true);
  await page.keyboard.press('Escape');await page.waitForTimeout(200);
  assert.equal(await editing(page),false,'Escape leaves layout mode');

  // a reload never restarts in layout mode, even with the old saved flag present
  await page.locator('#workspace-layout-toolbar [data-ws-toggle]').click();await page.waitForTimeout(200);
  await page.evaluate(()=>localStorage.setItem('px.workspace.editing','1'));
  await page.reload();await page.waitForTimeout(600);
  assert.equal(await editing(page),false,'reload starts outside layout mode');
  assert.equal(await page.evaluate(()=>localStorage.getItem('px.workspace.editing')),null,'stale editing flag is cleared');

  assert.deepEqual(errors,[],'no page errors');
  await browser.close();server.close();console.log('workspace-layout.browser.js: ok');
})().catch(e=>{console.error(e);process.exit(1)});
