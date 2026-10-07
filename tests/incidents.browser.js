/* System drawer incident model and top-level health, end to end against a scripted Writer. Local test-only writer. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
const ago=m=>new Date(Date.now()-m*60000).toISOString();
const run=(file,status,m,error,extra)=>Object.assign({file,fileId:'id-'+file,terminalStatus:status,action:'',finishedAt:ago(m),error:error||''},extra||{});
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end('missing')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage(),errors=[],statePosts=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
  const lock='Lock timeout: another process was holding the lock for too long.';
  let status={ok:true,queue:{pending:0,processing:[],hold:[]},triggerInstalled:false,unverified:{count:0},
    warnings:[{level:'critical',code:'TRIGGER_MISSING',message:'The queue trigger is not installed; queued requests are not processed.'},{level:'notice',code:'FAILED',message:'3 request(s) FAILED in the last 24 h'}],
    recentRuns:[run('BACKLOG_20261006_SCHED_R2.json','FAILED',20,lock),run('BACKLOG_20261006_SCHED.json','FAILED',30,lock),run('RESCORE_B1.json','FAILED',40,'batch too large (max 50 requests)')],
    recentHolds:[],recentFailed:[]};
  await page.route('**/writer*',r=>{const q=r.request(),a=new URL(q.url()).searchParams.get('action');
    if(q.method()==='POST'){const b=JSON.parse(q.postData()||'{}');if(b.action==='state')statePosts.push(b.state);return r.fulfill({json:{ok:true}})}
    if(a==='writer_status')return r.fulfill({json:Object.assign({now:new Date().toISOString()},status)});
    return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:{ok:true}})});
  await page.goto(base+'/pipeline.html');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(800);
  const panel=async()=>{const open=await page.locator('#writer-panel').evaluate(e=>!e.hidden);if(!open){await page.locator('#writer-badge').click();await page.waitForTimeout(200)}};
  const refresh=async()=>{await panel();await page.locator('#writer-refresh').click();await page.waitForTimeout(600)};
  const read=()=>page.evaluate(()=>({health:document.getElementById('sys-health')&&document.getElementById('sys-health').textContent,badge:document.getElementById('writer-badge').className,badgeText:document.getElementById('writer-badge').textContent,
    active:[...document.querySelectorAll('#writer-panel .incident')].filter(n=>!n.closest('details')&&/CRITICAL|WARNING/.test(n.querySelector('.lvl').textContent)).map(n=>n.textContent),
    recovered:[...document.querySelectorAll('#writer-panel .incident')].filter(n=>!n.closest('details')&&/RECOVERED|ACKNOWLEDGED/.test(n.querySelector('.lvl').textContent)).map(n=>n.textContent),
    strip:document.getElementById('writer-alert').textContent}));

  // 1. Missing trigger (critical) + two failed attempts of one operation + one other failure: DEGRADED, three incidents, retries merged.
  await panel();let s=await read();
  assert.equal(s.health,'DEGRADED');assert.match(s.badge,/critical/);assert.match(s.badgeText,/· 3/,'badge counts active incidents, not raw failure events');
  assert.equal(s.active.length,3);const backlog=s.active.find(t=>/BACKLOG_20261006_SCHED/.test(t));assert.match(backlog,/2 attempts/);assert.match(backlog,/First failure .* latest/);
  assert.match(s.strip,/TRIGGER MISSING/,'a critical Writer incident raises the strip');
  assert(!s.active.some(t=>/^\s*\w+\s*FAILED · 3 request/.test(t)),'the Writer aggregate FAILED notice is not double counted');
  // 2. Trigger fixed and the backlog retry succeeds: its incident recovers with evidence; health drops to LIVE / WARNING.
  status=Object.assign({},status,{triggerInstalled:true,warnings:[],recentRuns:[run('BACKLOG_20261006_SCHED_R3.json','SUCCESS',5)].concat(status.recentRuns)});
  await refresh();s=await read();
  assert.equal(s.health,'LIVE / WARNING');assert.match(s.badge,/warn/);assert.equal(s.active.length,1);assert.match(s.active[0],/RESCORE_B1/);
  assert(s.recovered.some(t=>/BACKLOG_20261006_SCHED/.test(t)&&/Recovery evidence: SUCCESS · BACKLOG_20261006_SCHED_R3\.json/.test(t)),'recovered queue incident shows its evidence');
  assert(s.recovered.some(t=>/TRIGGER MISSING/.test(t)&&/no longer reports it/.test(t)),'cleared condition recovered by a status read');
  // 3. The failure leaves the Writer's 24-hour window: the unresolved incident stays ACTIVE.
  status=Object.assign({},status,{recentRuns:[run('UNRELATED_20261006.json','SUCCESS',1)],recentHolds:[],recentFailed:[]});
  await refresh();s=await read();assert.equal(s.health,'LIVE / WARNING');assert.equal(s.active.length,1,'never aged out of ACTIVE');
  // 4. Tim acknowledges it: health LIVE; the acknowledgement is synced to the shared Explorer state.
  await page.locator('#writer-panel .inc-ack').first().click();await page.waitForTimeout(1900);s=await read();
  assert.equal(s.health,'LIVE');assert.match(s.badge,/\bok\b/);assert.equal(s.active.length,0);assert(s.recovered.some(t=>/ACKNOWLEDGED/.test(t)&&/Acknowledged by TIM/.test(t)));
  const last=statePosts[statePosts.length-1];assert(last&&last.incidents,'incidents are synced with the Explorer state');
  assert(Object.values(last.incidents.incidents).some(i=>i.status==='ACKNOWLEDGED'&&/RESCORE_B1/.test(i.operation)));
  assert(Object.values(last.incidents.incidents).every(i=>i.kind==='event'),'live conditions are not synced');
  // 5. Persisted across a reload; acknowledged stays resolved.
  await page.reload();await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(700);await panel();s=await read();
  assert.equal(s.health,'LIVE');assert.equal(s.active.length,0);
  assert.equal(errors.length,0,errors.join('\n'));
  await browser.close();server.close();console.log('incident browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
