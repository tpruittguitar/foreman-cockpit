'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE||'playwright');
const O=require('../pipeline-operations'),repo=path.resolve(__dirname,'..'),out=process.env.PIPELINE_UI_ARTIFACTS||'/tmp/pipeline-progress';
const fixture=require('./gen_population').generate(600,70),rules=fs.readFileSync(repo+'/tests/fixtures/TIM_PIPELINE_RULES_CANONICAL.sample.txt','utf8');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(repo,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(repo+'/'))return res.writeHead(403).end();try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}catch(e){res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:2560,height:1440}}),errors=[],writes=[];
  let statusCalls=0,statusActive=0,statusPeak=0,delayStatus=0,failStatus=false,delayRead=0,canonical=rules;
  let store=O.update(O.empty(),{baseRevision:0,obligations:[
   {id:'SYNTHETIC-DONE',state:'VERIFIED_COMPLETE',source:{},proof:{independent:true,at:new Date().toISOString(),evidenceRef:'synthetic-proof'}},
   {id:'SYNTHETIC-PENDING',state:'QUEUED',source:{},owner:'FORGE',nextAction:'Await independent verification'}
  ],runs:[{id:'EMAIL-SYNTHETIC',messages:{m1:{reviewed:true,bodyEvidence:'body:1',digestComplete:true},m2:{reviewed:true,bodyEvidence:'body:2',digestComplete:true},m3:{reviewed:false}},sources:{mail:{planned:true,paginationExhausted:false,evidenceRef:'synthetic-page'}}}]},new Date().toISOString());
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.addInitScript(()=>localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'synthetic-only'})));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.hostname!=='127.0.0.1')return route.abort();
   if(u.pathname==='/api/manual-intake')return route.fulfill({json:{ok:true,items:[],counts:{}}});
   if(u.pathname!=='/writer')return route.continue();
   const a=u.searchParams.get('action');let j={ok:true};
   if(req.method()!=='GET'){
    const b=JSON.parse(req.postData());writes.push(b.action);
    if(b.action==='save_rules'){await new Promise(r=>setTimeout(r,900));canonical=b.rules.text;j={ok:true};}
    else if(b.action==='catch_up'){await new Promise(r=>setTimeout(r,1400));j={ok:false,error:'Synthetic provider unavailable'};}
    else if(b.action==='data_discovery'){await new Promise(r=>setTimeout(r,600));j={ok:true,requested:1};}
    else j={ok:false,error:'Synthetic preview forbids canonical writes'};
   }else if(a==='master'){if(delayRead)await new Promise(r=>setTimeout(r,delayRead));j={ok:true,text:fixture,id:'synthetic-only',fetchedAt:new Date().toISOString()};}
   else if(a==='canonical_rules'){if(delayRead)await new Promise(r=>setTimeout(r,delayRead));j={ok:true,text:canonical};}
   else if(a==='state')j={ok:true,state:{}};
   else if(a==='writer_status'){
    statusCalls++;statusActive++;statusPeak=Math.max(statusPeak,statusActive);if(delayStatus)await new Promise(r=>setTimeout(r,delayStatus));statusActive--;
    j=failStatus?{ok:false,error:'Synthetic outage'}:{ok:true,level:'ok',warnings:[],queue:{processing:[]},unverified:{count:0}};
   }else if(a==='operations')j={ok:true,store,observedAt:new Date().toISOString()};
   else if(a==='schedules')j={ok:true,manifest:{schema:1,revision:0,tasks:[],history:[]},nativeControl:'UNSUPPORTED'};
   await route.fulfill({json:j});
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/pipeline.html');await page.waitForSelector('#grid tbody tr[data-id]');
  const clock=page.locator('header .writer-identity > [data-writer-countdown]'),clockBar=clock.locator('[role=progressbar]');
  await page.waitForFunction(()=>document.querySelector('header [data-writer-countdown]').dataset.state==='countdown');
  // Record an actual countdown and refresh for the review preview (synthetic endpoint only).
  const cdp=await page.context().newCDPSession(page),frames=[];
  cdp.on('Page.screencastFrame',e=>{frames.push({time:e.metadata.timestamp,data:e.data});cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:2560,maxHeight:1440,everyNthFrame:1});
  await page.waitForTimeout(2600);delayStatus=1100;await page.locator('#writer-badge').click();
  await page.waitForFunction(()=>document.querySelector('header [data-writer-countdown]').dataset.state==='countdown');
  await page.waitForTimeout(600);await page.locator('#sys-close').click();await cdp.send('Page.stopScreencast');delayStatus=0;
  const frameDir=path.join(out,'frames');fs.mkdirSync(frameDir,{recursive:true});
  frames.forEach((f,i)=>fs.writeFileSync(path.join(frameDir,'frame-'+String(i).padStart(5,'0')+'.jpg'),Buffer.from(f.data,'base64')));
  fs.writeFileSync(out+'/frames.ffconcat','ffconcat version 1.0\n'+frames.map((f,i)=>"file 'frames/frame-"+String(i).padStart(5,'0')+".jpg'\nduration "+(i+1<frames.length?Math.max(.01,frames[i+1].time-f.time):.1)+'\n').join(''));
  let before=+await clockBar.getAttribute('aria-valuenow'),calls=statusCalls;
  await page.clock.fastForward(10000);assert((+await clockBar.getAttribute('aria-valuenow'))<=before-9);assert.equal(statusCalls,calls);
  delayStatus=1100;await page.clock.fastForward(51000);
  await page.waitForFunction(()=>document.querySelector('header [data-writer-countdown]').dataset.state==='active');assert.match(await clock.innerText(),/Checking/);assert.equal(await clockBar.getAttribute('aria-valuenow'),null);
  await page.locator('#writer-badge').click();await page.locator('#writer-refresh').dispatchEvent('click');await page.locator('#writer-refresh').dispatchEvent('click');
  await page.waitForFunction(()=>document.querySelector('header [data-writer-countdown]').dataset.state==='countdown');assert.equal(statusCalls,calls+1);assert.equal(statusPeak,1);assert(+await clockBar.getAttribute('aria-valuenow')>=59);
  failStatus=true;await page.locator('#writer-refresh').click();await page.waitForFunction(()=>document.querySelector('#writer-badge').textContent.includes('unreachable'));
  assert(+await clockBar.getAttribute('aria-valuenow')>=59,'Failures schedule another refresh');failStatus=false;
  calls=statusCalls;
  await page.evaluate(()=>{window.testHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});document.dispatchEvent(new Event('visibilitychange'))});
  assert.match(await clock.innerText(),/paused/);await page.clock.fastForward(61000);assert.equal(statusCalls,calls);
  await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'))});
  await page.waitForFunction(()=>document.querySelector('header [data-writer-countdown]').dataset.state==='countdown');assert.equal(statusCalls,calls+1);
  await page.locator('#sys-close').click();
  await page.locator('#rail').hover();await page.locator('#rail [data-tab="automations"]').first().click();await page.mouse.move(700,450);
  await page.waitForSelector('.work-progress.large [aria-valuenow="1"]');assert.equal(await page.locator('.work-progress.large [role=progressbar]').getAttribute('aria-valuemax'),'2');
  await page.locator('[data-ops-tab="email"]').click();assert.equal(await page.locator('.work-progress.medium [role=progressbar]').getAttribute('aria-valuenow'),'2');assert.equal(await page.locator('.work-progress.medium [role=progressbar]').getAttribute('aria-valuemax'),'3');
  await page.locator('[data-ops-start]').fill('2026-10-09T08:00');await page.locator('[data-ops-end]').fill('2026-10-09T09:00');
  await page.locator('[data-ops-catchup]').click();await page.waitForSelector('[data-ops-catchup][aria-busy=true]');
  assert.equal(await page.locator('[data-ops-catchup] [role=progressbar]').getAttribute('aria-valuenow'),null);
  await page.clock.fastForward(1000);assert.match(await page.locator('[data-ops-catchup] .command-elapsed').innerText(),/s$/);
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('[data-ops-catchup] .command-track i').evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.screenshot({path:out+'/progress-command-2560.png'});
  await page.waitForSelector('[data-ops-catchup] .command-progress[data-state=attention]');assert.equal(await page.locator('[data-ops-catchup] [role=progressbar]').getAttribute('aria-valuenow'),null);
  await page.locator('#rail').hover();await page.locator('#rail [data-tab="rules"], #rail [data-go="rules"]').first().click();await page.mouse.move(700,450);await page.locator('#rules-mode').click();await page.waitForSelector('#rules-edit');
  await page.locator('#rules-edit').fill(canonical+'\nSYNTHETIC_PROGRESS_REVIEW=YES\n');delayRead=900;
  await page.locator('#rules-save').click();await page.waitForSelector('#rules-save[aria-busy=true]');
  await page.waitForFunction(()=>document.querySelector('#rules-save [role=progressbar]')?.getAttribute('aria-label')==='Verifying saved rules');
  await page.waitForFunction(()=>document.querySelector('#rules-status').textContent==='Saved and verified.');delayRead=0;
  assert.equal(await page.locator('#rules-save').getAttribute('aria-busy'),null);
  await page.locator('#rail').hover();await page.locator('#rail [data-preset="ALL"]').first().click();await page.mouse.move(700,450);await page.locator('#grid tbody tr[data-id]').first().click();
  await page.locator('[data-dtab="fit"]').click();await page.locator('#enrich-request').click();await page.waitForSelector('#enrich-request .command-progress[data-state=waiting]');
  assert.equal(await page.locator('#enrich-request [role=progressbar]').getAttribute('aria-valuenow'),null);assert.equal(await page.locator('#enrich-request .command-elapsed').innerText(),'Queued');
  await page.locator('#grid tbody tr[data-id]').nth(1).click();await page.locator('[data-dtab="fit"]').click();assert.equal(await page.locator('#enrich-request .command-progress').count(),0,'Queued work must not appear on a different job');
  await page.screenshot({path:out+'/progress-countdown-2560.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/progress-countdown-390.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert(writes.every(a=>['state','save_rules','catch_up','data_discovery'].includes(a)));
  fs.writeFileSync(out+'/progress-evidence.json',JSON.stringify({statusCalls,statusPeak,errors,writes,checks:['real deadline countdown','automatic refresh','no overlapping manual refresh','retry countdown on failure','hidden pause and resume','verified count bars','body review count bars','unknown duration command','failed command','reduced motion','rules readback','queued AI remains waiting','job isolation','phone overflow'],fixture:'600 synthetic jobs; external requests blocked'},null,2));
  console.log('PASS: Writer countdown, automatic/manual timing, no overlap, failure retry, visibility pause, command waits, verified counts, reduced motion, queued work and job isolation; no browser errors.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
