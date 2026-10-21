/* Simplify PR 1: Act now opens first (phone and desktop), Shield AI first, Memphis and decided roles out, Applied / Decline
   leave the list at once and stay out after a reload, an unsaved decision comes back with a retry that resends the same
   request, and a held email resolves from Needs you with one tap.
   Run: node tests/act-now.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for the other browser tests)
   ACT_NOW_SHOTS=<dir> also writes phone and desktop screenshots. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
// The scrubbed fixture with measured fit on its open rows, one Shield AI role and one Memphis role.
let fit=60;
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8').split('\n').map(l=>{
  const c=l.split(' | ');if(c.length<10||!/^\d+$/.test(c[0]))return l;
  if(!/^(READY_TO_PURSUE|MANUAL_RESEARCH|SCOUT_INTAKE|DISCOVERY_LEAD|TIM_DECISION_REQUIRED)$/.test(c[4]))return l;
  if(c[1]==='V2X-005F540B3422')c[2]='Shield AI';
  if(c[1]==='V2X-023572E52448')c[8]='Memphis, TN';
  return c.join(' | ')+'; SCOPE_FIT_RAW='+(fit++)+'; FIT_CONF=MED; SALARY_BASE_LOW=190000; SALARY_BASE_HIGH=230000; SALARY_BASIS=FORGE-ESTIMATE';
}).join('\n');
const hold={id:'HOLD-UK-test0001',upsertKey:'UK-test0001',kind:'NEAR_TIM_RULED',status:'OPEN',at:new Date().toISOString(),company:'Company-08',title:'Operations Director',state:'APPLIED',evidence:'Gmail 18f2 "Thanks for applying"',candidates:[{primaryId:'V2X-A4CCD49EE686',title:'Sr Director - Operations',location:'Austin, TX'}]};
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const phone=(w,h)=>({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
  async function open(ctxOpts,writer){
    const ctx=await browser.newContext(ctxOpts),page=await ctx.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));window.PX_TEST_BATCH_MS=150});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{}}));await page.route('**/raw.githubusercontent.com/**',r=>r.fulfill({body:''}));
    await page.route('**/writer*',r=>{const req=r.request(),a=new URL(req.url()).searchParams.get('action');
      if(req.method()==='POST'){const b=JSON.parse(req.postData()||'{}');posts.push(b);return Promise.resolve(writer&&writer.post?writer.post(b):{ok:true,receipt:{REQUEST_ID:b.ruling&&b.ruling.requestId}}).then(json=>r.fulfill({json}))}
      if(a==='master')return r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});
      if(a==='held_emails')return r.fulfill({json:{ok:true,count:1,holds:[hold]}});
      return r.fulfill({json:{ok:true}})});
    const t0=Date.now();await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#act-now .an-card');const ms=Date.now()-t0;await page.waitForTimeout(400);
    return {ctx,page,errors,posts,ms};
  }
  const rulingsOf=list=>list.flatMap(b=>b.action==='ruling'?[b.ruling]:b.action==='batch'?(b.requests||[]).map(q=>q.ruling):[]);
  const cards=page=>page.evaluate(()=>[...document.querySelectorAll('#act-now .an-card')].map(c=>({id:c.getAttribute('data-an-id'),t:c.querySelector('.an-sub').textContent})));
  // 1. Cold load on two phones and a desktop: Act now is the opening view, at the top, Shield AI first, no Memphis, no decided role.
  for(const [name,opts] of [['390x844',phone(390,844)],['402x874',phone(402,874)],['1440x900',{viewport:{width:1440,height:900}}]]){
    const {ctx,page,errors,ms}=await open(opts);
    const v=await page.evaluate(()=>{const a=document.getElementById('act-now').getBoundingClientRect(),b=document.querySelector('#act-now .an-btn').getBoundingClientRect();return {view:document.querySelector('.view.on').id,top:a.top,ih:innerHeight,btnH:b.height,btnW:b.width}});
    assert.strictEqual(v.view,'view-act-now',name+': opens on Act now');assert.ok(v.top>=0&&v.top<v.ih/2,name+': Act now at the top '+JSON.stringify(v));
    assert.ok(v.btnH>=44&&v.btnW>=44,name+': 44 px controls '+JSON.stringify(v));
    const c=await cards(page);assert.ok(c.length>=3&&c.length<=10,name+': up to 10 cards, got '+c.length);
    assert.match(c[0].t,/^Shield AI/,name+': Shield AI pinned first');assert.ok(!c.some(x=>/Memphis/.test(x.t)),name+': Memphis excluded');
    console.log('  '+name+': '+c.length+' cards, Act now painted in '+ms+' ms (local server)');
    if(process.env.ACT_NOW_SHOTS)await page.screenshot({path:path.join(process.env.ACT_NOW_SHOTS,'act-now-'+name+'.png')});
    assert.deepStrictEqual(errors,[],name+': no page errors');await ctx.close();
  }
  // 2. Applied leaves the list at once, writes one APPLIED ruling, and stays out after a reload.
  let {ctx,page,errors,posts}=await open(phone(390,844));
  const first=(await cards(page))[1].id;
  await page.locator('[data-an-applied="'+first+'"]').click();await page.waitForTimeout(600);
  const rul=posts.filter(p=>p.action==='ruling');assert.strictEqual(rul.length,1,'one ruling posted');assert.strictEqual(rul[0].ruling.kind,'APPLIED');assert.strictEqual(rul[0].ruling.primaryId,first);
  assert.strictEqual(rul[0].ruling.decisionSnap,undefined,'device-only fields stay on the device');
  assert.ok(!(await cards(page)).some(x=>x.id===first),'applied role left Act now');
  await page.reload();await page.waitForSelector('#act-now .an-card');await page.waitForTimeout(300);
  assert.ok(!(await cards(page)).some(x=>x.id===first),'still out after a reload');
  assert.match(await page.locator('[data-an-more="DECIDED"]').textContent(),/Decided \(\d+\)/);
  // the same role is hidden from the default table too, and the Decided view finds it
  await page.locator('[data-an-more="OPEN"]').click();await page.waitForSelector('#grid tbody tr[data-id]');
  assert.strictEqual(await page.locator('#grid tbody tr[data-id="'+first+'"]').count(),0,'decided role is out of Open roles');
  await page.locator('#section-tabs [data-go="act-now"]').first().click();await page.waitForSelector('#act-now [data-an-more="DECIDED"]');await page.locator('[data-an-more="DECIDED"]').click();await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(200);
  assert.strictEqual(await page.locator('#grid tbody tr[data-id="'+first+'"]').count(),1,'Decided view finds it');
  assert.deepStrictEqual(errors,[]);await ctx.close();
  // 3. A Decline the Writer refuses comes back with "Decision not saved · tap to retry"; the retry resends the same request.
  ({ctx,page,errors,posts}=await open(phone(390,844),{post:b=>b.action==='ruling'&&!globalThis.__ok?{ok:false,error:'Writer refused (test)'}:{ok:true}}));
  const tgt=(await cards(page))[1].id;
  await page.locator('[data-an-decline="'+tgt+'"]').click();await page.locator('[data-an-for="'+tgt+'"][data-an-reason="pay"]').click();await page.waitForSelector('[data-an-retry="'+tgt+'"]',{timeout:8000}).catch(()=>{});
  assert.strictEqual(await page.locator('[data-an-retry="'+tgt+'"]').count(),1,'unsaved decision is back with the retry chip');
  assert.strictEqual(await page.locator('[data-an-applied="'+tgt+'"]').count(),0,'no second decision from that card');
  const firstId=posts.filter(p=>p.action==='ruling')[0].ruling.requestId;
  await page.locator('[data-an-retry="'+tgt+'"]').click();await page.waitForFunction(n=>true,null);await page.waitForTimeout(3000);
  const ids=posts.filter(p=>p.action==='ruling').map(p=>p.ruling.requestId);assert.deepStrictEqual(ids,[firstId,firstId],'retry reuses the requestId');
  assert.strictEqual(posts.filter(p=>p.action==='ruling')[0].ruling.code,'PAY_BELOW_FLOOR');
  assert.deepStrictEqual(errors,[]);await ctx.close();
  // 5 (REV-131). The outbox resends unsaved rulings with the same requestId until the Writer saves them.
  //    a) a Decline refused by a write fence is resent automatically, no tap; b) a "Saving" left by a closed page is checked
  //    with request_result and resent; c) one that did land is marked saved without a second post.
  {
    let fence=2;const landed='PX-LANDED-1';
    const seeds={'V2X-C567A75157C0':{kind:'DECLINE',code:'FIT',writeStatus:'SUBMITTING',ts:'2026-10-20T20:20:58.387Z',primaryId:'V2X-C567A75157C0',actor:'TIM',requestId:'PX-STUCK-1'},
      'V2X-299323199555':{kind:'DECLINE',code:'PAY_BELOW_FLOOR',writeStatus:'SUBMITTING',ts:'2026-10-20T20:21:00.000Z',primaryId:'V2X-299323199555',actor:'TIM',requestId:landed}};
    const ctx2=await browser.newContext(phone(390,844)),pg=await ctx2.newPage(),errs=[],ps=[];pg.on('pageerror',e=>errs.push(e.message));
    await pg.addInitScript(s=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));localStorage.setItem('px.rulings',JSON.stringify(s));window.PX_TEST_OUTBOX_DELAYS=[300,300,300];window.PX_TEST_BATCH_MS=150},seeds);
    await pg.route('**/api.github.com/**',r=>r.fulfill({json:{}}));await pg.route('**/raw.githubusercontent.com/**',r=>r.fulfill({body:''}));
    await pg.route('**/writer*',r=>{const req=r.request(),u=new URL(req.url()),a=u.searchParams.get('action');
      if(req.method()==='POST'){const b=JSON.parse(req.postData()||'{}');ps.push(b);const fenced=rulingsOf([b]).some(x=>x.code==='LOCATION')&&fence-->0;if(fenced)return r.fulfill({json:{ok:false,mode:'WRITE_FENCE',error:'an earlier master write is not yet independently verified; retry after it is decided'}});if(b.action==='batch')return r.fulfill({json:{ok:true,mode:'BATCH_RULING_SINGLE_COMMIT',writeId:'W-T',results:b.requests.map((q,i)=>({index:i,ok:true,mode:'BATCH_RULING',requestId:q.ruling.requestId}))}});return r.fulfill({json:{ok:true,receipt:{REQUEST_ID:b.ruling&&b.ruling.requestId}}})}
      if(a==='master')return r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});
      if(a==='request_result')return r.fulfill({json:u.searchParams.get('requestId')===landed?{ok:true,found:true,status:'COMPLETE',durable:true}:{ok:true,found:false}});
      return r.fulfill({json:{ok:true}})});
    await pg.goto(base+'/pipeline.html?src=writer');await pg.waitForSelector('#act-now .an-card');
    const tgt2=(await cards(pg))[0].id;
    await pg.locator('[data-an-decline="'+tgt2+'"]').click();await pg.locator('[data-an-for="'+tgt2+'"][data-an-reason="location"]').click();
    await pg.waitForFunction(()=>{try{return Object.values(JSON.parse(localStorage.getItem('px.rulings'))).every(r=>/^(READBACK_PENDING|READBACK_UNCONFIRMED|VERIFIED)$/.test(r.writeStatus)&&!(r.outbox&&r.outbox.auto))}catch(e){return false}},null,{timeout:30000});
    const rul2=rulingsOf(ps).map(x=>({ruling:x})),loc=rul2.filter(p=>p.ruling.code==='LOCATION');
    assert.strictEqual(loc.length,3,'fenced twice, then saved: 3 posts');assert.strictEqual(new Set(loc.map(p=>p.ruling.requestId)).size,1,'one requestId throughout');
    assert.ok(rul2.filter(p=>p.ruling.requestId==='PX-STUCK-1').length>=1,'stale Saving resent (with the fenced batch it rides in, REV-132)');
    assert.strictEqual(rul2.filter(p=>p.ruling.requestId===landed).length,0,'a write that landed is not sent again');
    assert.strictEqual(await pg.locator('[data-an-retry]').count(),0,'no "not saved" chip while the outbox works');
    assert.ok(rul2.every(p=>p.ruling.outbox===undefined),'outbox state stays on the device');
    assert.ok(ps.every(p=>p.action!=='batch'||p.requests.length<=25),'batches stay within 25');
    assert.deepStrictEqual(errs,[]);await ctx2.close();
  }
  // 6 (REV-132). Quick taps coalesce: four Declines in a row go as ONE batch write with four rulings; a per-item refusal
  //    shows the retry chip on that card only, and the others are saved.
  {
    let refusePid='';
    ({ctx,page,errors,posts}=await open(phone(390,844),{post:b=>b.action==='batch'?{ok:false,mode:'BATCH_RULING_SINGLE_COMMIT',writeId:'W-6',results:b.requests.map((q,i)=>q.ruling.primaryId===refusePid?{index:i,ok:false,error:'PROTECTED_APPLIED_ROW (test)'}:{index:i,ok:true,mode:'BATCH_RULING',requestId:q.ruling.requestId})}:{ok:true}}));
    const ids=(await cards(page)).slice(0,4).map(c=>c.id);refusePid=ids[2];
    for(const id of ids){await page.locator('[data-an-decline="'+id+'"]').click();await page.locator('[data-an-for="'+id+'"][data-an-reason="fit"]').click()}
    await page.waitForFunction(()=>{try{return Object.values(JSON.parse(localStorage.getItem('px.rulings'))).filter(r=>r.writeStatus!=='SUBMITTING').length>=4}catch(e){return false}},null,{timeout:10000});
    const writes=posts.filter(p=>p.action==='batch'||p.action==='ruling');
    assert.strictEqual(writes.length,1,'one Writer write for four quick taps, got '+writes.length);
    assert.strictEqual(writes[0].action,'batch');assert.deepStrictEqual(writes[0].requests.map(q=>q.ruling.primaryId).sort(),ids.slice().sort());
    assert.strictEqual(new Set(writes[0].requests.map(q=>q.ruling.requestId)).size,4,'each ruling keeps its own requestId');
    await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('[data-an-retry="'+refusePid+'"]').count(),1,'the refused one shows the retry chip');
    assert.strictEqual(await page.locator('[data-an-retry]').count(),1,'only the refused one');
    assert.strictEqual(posts.filter(p=>p.action==='batch'||p.action==='ruling').length,1,'still one write after the final wait');
    assert.deepStrictEqual(errors,[]);await ctx.close();
  }
  // 7 (Grok QA #182). "master changed; retry" (BATCH_RULING_RETRY) returns PLANNED items as ok:true with nothing written:
  //    none may be marked saved; all go to the outbox and are resent with the same requestIds until a batch commits.
  {
    let retries=1;
    ({ctx,page,errors,posts}=await open(phone(390,844),{post:b=>{if(b.action!=='batch')return {ok:true};const res=b.requests.map((q,i)=>({index:i,ok:true,mode:'PLANNED',primaryId:q.ruling.primaryId,requestId:q.ruling.requestId}));
      if(retries-->0)return {ok:false,mode:'BATCH_RULING_RETRY',error:'master changed during request (a -> b); retry',results:res};
      return {ok:true,mode:'BATCH_RULING_SINGLE_COMMIT',writeId:'W-7',results:res.map(x=>({...x,mode:'BATCH_RULING'}))}}}));
    await page.evaluate(()=>{window.PX_TEST_OUTBOX_DELAYS=[300,300,300]});
    const ids=(await cards(page)).slice(0,3).map(c=>c.id);
    for(const id of ids){await page.locator('[data-an-decline="'+id+'"]').click();await page.locator('[data-an-for="'+id+'"][data-an-reason="fit"]').click()}
    await page.waitForFunction(()=>{try{return Object.values(JSON.parse(localStorage.getItem('px.rulings'))).filter(r=>r.writeStatus!=='SUBMITTING').length>=3}catch(e){return false}},null,{timeout:10000});
    const after1=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('px.rulings'))).map(r=>[r.writeStatus,!!(r.outbox&&r.outbox.auto)]));
    assert.ok(after1.every(([s,auto])=>s==='WRITE_FAILED'&&auto),'not committed → none saved, all in the outbox: '+JSON.stringify(after1));
    const batches=()=>posts.filter(p=>p.action==='batch');
    const rids=batches()[0].requests.map(q=>q.ruling.requestId).sort();
    await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'))});
    await page.waitForFunction(()=>{try{return Object.values(JSON.parse(localStorage.getItem('px.rulings'))).every(r=>r.writeStatus==='READBACK_PENDING'||r.writeStatus==='VERIFIED')}catch(e){return false}},null,{timeout:40000});
    const last=batches()[batches().length-1];assert.deepStrictEqual(last.requests.map(q=>q.ruling.requestId).sort(),rids,'resent with the same requestIds');
    assert.deepStrictEqual(errors,[]);await ctx.close();
  }
  // 8 (Grok QA #182). Undo goes through the queue: a decision still waiting on this device is dropped, and nothing is sent.
  {
    ({ctx,page,errors,posts}=await open({viewport:{width:1440,height:900}}));
    await page.evaluate(()=>{window.PX_TEST_BATCH_MS=3000});
    await page.$eval('[data-an-more="OPEN"]',b=>b.click());await page.waitForSelector('#grid tbody tr[data-id]');
    await page.locator('#grid tbody tr[data-id]').first().click();await page.locator('#edit-note').fill('undo test');
    await page.locator('#save-decision').click();await page.locator('#undo-decision').click();
    await page.waitForTimeout(3500);
    assert.strictEqual(posts.filter(p=>/ruling|batch|undo_ruling/.test(p.action)).length,0,'queued decision undone locally; nothing sent');
    assert.match(await page.locator('#edit-status').innerText(),/Undone/);
    assert.deepStrictEqual(errors,[]);await ctx.close();
  }
  // 9 (Grok re-QA #182). An in-flight ruling the Writer refuses, then Undo → no undo_ruling (it would erase the earlier decision).
  {
    let release;const gate=new Promise(z=>release=z);
    ({ctx,page,errors,posts}=await open({viewport:{width:1440,height:900}},{post:async b=>{if(b.action==='ruling'){await gate;return {ok:false,error:'PROTECTED_APPLIED_ROW (test)'}}return {ok:true}}}));
    await page.evaluate(()=>{window.PX_TEST_BATCH_MS=50});
    await page.$eval('[data-an-more="OPEN"]',b=>b.click());await page.waitForSelector('#grid tbody tr[data-id]');
    await page.locator('#grid tbody tr[data-id]').first().click();await page.locator('#edit-note').fill('undo in flight');
    await page.locator('#save-decision').click();await page.waitForFunction(()=>true);await page.waitForTimeout(400);
    assert.strictEqual(posts.filter(p=>p.action==='ruling').length,1,'the ruling is in flight');
    await page.locator('#undo-decision').click();release();
    await page.waitForFunction(()=>/Undone|Undo failed/.test(document.getElementById('edit-status').innerText),null,{timeout:10000});await page.waitForTimeout(500);
    assert.strictEqual(posts.filter(p=>p.action==='undo_ruling').length,0,'failed in-flight ruling → no undo_ruling sent');
    assert.match(await page.locator('#edit-status').innerText(),/earlier decision stands/);
    assert.deepStrictEqual(errors,[]);await ctx.close();
  }
  // 10/11 (Grok re-QA #182 2a/2b). Seeded rulings on one row; the drawer's Undo for that row.
  async function seeded(seed,onGet){
    const c=await browser.newContext({viewport:{width:1440,height:900}}),pg=await c.newPage(),errs=[],ps=[];pg.on('pageerror',e=>errs.push(e.message));
    await pg.addInitScript(s=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));localStorage.setItem('px.rulings',JSON.stringify(s));window.PX_TEST_BATCH_MS=50},seed);
    await pg.route('**/api.github.com/**',r=>r.fulfill({json:{}}));await pg.route('**/raw.githubusercontent.com/**',r=>r.fulfill({body:''}));
    await pg.route('**/writer*',async r=>{const req=r.request(),u=new URL(req.url()),a=u.searchParams.get('action');
      if(req.method()==='POST'){ps.push(JSON.parse(req.postData()||'{}'));return r.fulfill({json:{ok:true}})}
      if(a==='master')return r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});
      if(a==='request_result')return r.fulfill({json:await onGet(u)});
      return r.fulfill({json:{ok:true}})});
    await pg.goto(base+'/pipeline.html?src=writer&open=jobs');await pg.waitForSelector('#grid tbody tr[data-id]');
    return {c,pg,errs,ps};
  }
  const pid='V2X-C567A75157C0',drawer=async pg=>{await pg.evaluate(id=>{const s=document.getElementById('search');if(s){s.value=id;s.dispatchEvent(new Event('input',{bubbles:true}))}},pid);
    await pg.waitForSelector('#grid tbody tr[data-id="'+pid+'"]',{timeout:10000});await pg.$eval('#grid tbody tr[data-id="'+pid+'"]',tr=>tr.click());await pg.waitForSelector('#undo-decision')};
  {  // 10: a refused "Decision not saved" is undone locally; undo_ruling would erase the earlier decision
    const {c,pg,errs,ps}=await seeded({[pid]:{kind:'DECLINE',code:'FIT',writeStatus:'WRITE_FAILED',error:'PROTECTED_APPLIED_ROW (test)',ts:'2026-10-20T20:20:58.387Z',primaryId:pid,actor:'TIM',requestId:'PX-REFUSED-1'}},()=>({ok:true,found:false}));
    await drawer(pg);await pg.$eval('#undo-decision',b=>b.click());
    await pg.waitForFunction(()=>/Undone|Undo failed/.test(document.getElementById('edit-status').innerText),null,{timeout:10000});await pg.waitForTimeout(400);
    assert.strictEqual(ps.filter(p=>p.action==='undo_ruling').length,0,'refused ruling → no undo_ruling');
    assert.match(await pg.locator('#edit-status').innerText(),/earlier decision stands/);
    assert.deepStrictEqual(errs,[]);await c.close();
  }
  {  // 11: Undo while the outbox's request_result check is running → the outbox never sends that ruling
    let release,first=true;const gate=new Promise(z=>release=z);
    const {c,pg,errs,ps}=await seeded({[pid]:{kind:'DECLINE',code:'FIT',writeStatus:'WRITE_FAILED',error:'Lock timeout: another process was holding the lock for too long.',outbox:{auto:true,tries:1,nextAt:0},ts:'2026-10-20T20:20:58.387Z',primaryId:pid,actor:'TIM',requestId:'PX-RACE-1'}},
      async()=>{if(first){first=false;await gate}return {ok:true,found:false}});
    await pg.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>/action=request_result/.test(e.name))||true);
    await drawer(pg);await pg.waitForTimeout(3000);   // the outbox's check (fired ~2.5 s after load) is now held at the gate
    await pg.$eval('#undo-decision',b=>b.click());
    await pg.waitForFunction(()=>/Undone|Undo failed/.test(document.getElementById('edit-status').innerText),null,{timeout:10000});
    release();await pg.waitForTimeout(1500);
    assert.strictEqual(ps.filter(p=>p.action==='ruling'||p.action==='batch').length,0,'the undone ruling is never sent');
    assert.strictEqual(ps.filter(p=>p.action==='undo_ruling').length,0);
    assert.deepStrictEqual(errs,[]);await c.close();
  }
  // 4. A held email shows in Needs you with one-tap Same role / Different role.
  ({ctx,page,errors,posts}=await open({viewport:{width:1440,height:900}}));
  await page.locator('#bell').click();await page.waitForSelector('[data-nt-held="HOLD-UK-test0001"]',{timeout:10000});
  assert.strictEqual(await page.locator('[data-nt-held="HOLD-UK-test0001"]').count(),2,'Same role and Different role');
  await page.locator('[data-nt-held="HOLD-UK-test0001"][data-nt-choice="SAME"]').click();await page.waitForTimeout(400);
  const rs=posts.filter(p=>p.action==='resolve_held_email');assert.strictEqual(rs.length,1);assert.deepStrictEqual([rs[0].holdId,rs[0].choice,rs[0].primaryId],['HOLD-UK-test0001','SAME','V2X-A4CCD49EE686']);
  if(process.env.ACT_NOW_SHOTS)await page.screenshot({path:path.join(process.env.ACT_NOW_SHOTS,'needs-tim-held-1440.png')});
  assert.deepStrictEqual(errors,[]);await ctx.close();
  await browser.close();server.close();console.log('act-now browser: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
