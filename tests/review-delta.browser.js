/* D-3 (REV-053): score change since Tim's last review. Fixture, ?src=writer, mocked Writer with a published scoring model.
   1. A Writer review record with an older score for one job: the table marks it ▲n, the strip counts 1 score change with a
      computed cause, the strip item filters the queue to it, opening it shows "▲ +n since you last opened it" in the drawer,
      records a new review (sent to the Writer as state.reviewed) and the mark clears.
   2. Baseline once: jobs already seen get bl records (sent once); a reload does not baseline again.
   3. No published scoring model: nothing is recorded and the strip says it is waiting.
   2560x1440. Run: node tests/review-delta.browser.js (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/mobile.browser.js) */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const JOB='V2X-A4CCD49EE686';
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://x');try{res.setHeader('Content-Type',u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(repo+u.pathname))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function open(opts){
    const ctx=await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1});const page=await ctx.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    if(opts.ls)await page.addInitScript(ls=>{Object.keys(ls).forEach(k=>localStorage.setItem(k,ls[k]))},opts.ls);
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    await page.route('**/geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[]}}));
    const W={old:!!opts.oldWriter,refuse:opts.refuse||0,stateFail:opts.stateFail||0,stateReads:0,inFlight:0,maxInFlight:0,store:opts.keepState?{seen:{},reviewed:{}}:null,lie:opts.lie||0};   // old Writer (before REV-053): answers ok with no "reviewed" count and keeps nothing
    await page.route('**/writer*',async r=>{const q=r.request();if(q.method()==='POST'){let b={};try{b=JSON.parse(q.postData()||'{}')}catch(e){}posts.push(b);
        if(b.action==='state'&&opts.postDelay){W.inFlight++;W.maxInFlight=Math.max(W.maxInFlight,W.inFlight);await new Promise(x=>setTimeout(x,opts.postDelay));W.inFlight--}
        if(b.action==='state'&&W.store){Object.assign(W.store.reviewed,(b.state||{}).reviewed||{});Object.assign(W.store.seen,(b.state||{}).seen||{});
          if(W.lie>0){W.lie--;return r.fulfill({json:{ok:false,error:'Lock timeout: another process was holding the lock for too long.'}})}}
        if(b.action==='state'&&W.refuse>0){W.refuse--;return r.fulfill({json:{ok:false,error:'Writer busy (test)'}})}
        return r.fulfill({json:W.old||b.action!=='state'?{ok:true}:{ok:true,seen:Object.keys((b.state||{}).seen||{}).length,incidents:0,reviewed:Object.keys((b.state||{}).reviewed||{}).length}})}
      if(opts.stateDelay&&new URL(q.url()).searchParams.get('action')==='state')await new Promise(x=>setTimeout(x,opts.stateDelay));
      const a=new URL(q.url()).searchParams.get('action');if(a==='state'){W.stateReads++;if(W.stateFail>0){W.stateFail--;return r.abort('failed')}}
      return r.fulfill({json:a==='master'?{ok:true,id:'m',text:opts.master||fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:
        a==='scoring'?(opts.model===false?{ok:true,exists:false}:{ok:true,exists:true,model:{publishedRevision:26,modelVersion:'test'}}):
        a==='state'?{ok:true,state:W.store?JSON.parse(JSON.stringify(W.store)):opts.state||{seen:{},reviewed:{}}}:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer&open=jobs');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(2500);
    return {ctx,page,errors,posts,W};
  }
  const strip=page=>page.locator('#queue-head .since-strip').innerText();
  const mark=(page,id)=>page.evaluate(id=>{const tr=[...document.querySelectorAll('#grid tbody tr[data-id]')].find(t=>t.dataset.id===id);const m=tr&&tr.querySelector('.sc-d');return m?{text:m.textContent,title:m.title}:null},id);
  const sentReviewed=posts=>posts.filter(b=>b.action==='state'&&b.state&&b.state.reviewed).map(b=>b.state.reviewed);

  // 1. older Writer record for JOB
  {const t=Date.now()-86400000;const {ctx,page,errors,posts}=await open({state:{seen:{},reviewed:{[JOB]:{s:33,t,p:[30,90,60,50,-1,40,-1,-1],b:0,r:25}}}});
    const score=await page.evaluate(id=>{const tr=[...document.querySelectorAll('#grid tbody tr[data-id]')].find(t=>t.dataset.id===id);return +tr.querySelector('.score-badge').textContent},JOB);
    const m=await mark(page,JOB);assert(m,'delta mark on the job');assert.equal(m.text,'▲'+(score-33),'mark = current score − recorded score');
    assert.match(m.title,new RegExp('^\\+'+(score-33)+' since you opened it .* · scoring model rev 25 → 26$'),'mark title names the cause: '+m.title);
    await page.screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/review-delta-before-2560.png'});
    const fs=await page.evaluate(()=>[...document.querySelectorAll('#queue-head .since-strip .ss-i')].map(e=>getComputedStyle(e).fontSize));
    assert(fs.length===4&&fs.every(x=>x==='13px'),'strip items at --pe-fs-small 13 px: '+fs);
    let st=await strip(page);assert.match(st,/^Since your last review · /i);assert.doesNotMatch(st,/none recorded/i,'the Writer record is the last review');assert.match(st,/Δ 1 score change \(▲1 ▼0\)/,'strip counts the change: '+st);
    await page.locator('#queue-head [data-since="changed"]').click();await page.waitForTimeout(800);
    const ids=await page.locator('#grid tbody tr[data-id]').evaluateAll(t=>t.map(x=>x.dataset.id));assert.deepEqual(ids,[JOB],'strip item filters the queue');
    await page.locator('#grid tbody tr[data-id]').first().click();await page.waitForTimeout(1500);
    const dl=await page.locator('#drawer .ws-delta').innerText();assert.match(dl,new RegExp('^▲ \\+'+(score-33)+' since you last opened it '),'drawer line: '+dl);
    assert.equal(await mark(page,JOB),null,'opening the job reviews it: the mark clears');
    assert.equal(await strip(page).then(x=>x.split(' · ')[1].split('Δ')[0].trim()),st.split(' · ')[1].split('Δ')[0].trim(),'the last-review time stays fixed for the session');
    await page.waitForTimeout(2200);const sent=sentReviewed(posts).filter(r=>r[JOB]&&!r[JOB].bl).pop();assert(sent,'the new review went to the Writer');
    assert.equal(sent[JOB].s,score);assert(sent[JOB].t>t);assert.equal(sent[JOB].r,26);assert.equal(sent[JOB].p.length,8);
    await page.screenshot({path:(process.env.PIPELINE_UI_ARTIFACTS||require('os').tmpdir())+'/review-delta-2560.png'});
    assert.deepEqual(errors,[]);await ctx.close();}

  // 2. baseline once, sent once; a reload does not baseline again
  {const {ctx,page,errors,posts}=await open({});await page.waitForTimeout(2200);
    const ls=await page.evaluate(()=>({rev:JSON.parse(localStorage.getItem('px.reviewed')||'{}'),flag:localStorage.getItem('px.reviewBaselineV2'),seen:JSON.parse(localStorage.getItem('px.seen')||'{}')}));
    const seenIds=Object.keys(ls.seen);assert(seenIds.length>0,'fixture jobs are seen');assert.equal(ls.flag,'true');
    assert(seenIds.every(id=>ls.rev[id]&&ls.rev[id].bl===1&&ls.rev[id].t===Math.round(ls.seen[id])),'every seen job has a baseline at its seen time');
    const sent=sentReviewed(posts);assert(sent.length>=1&&Object.keys(sent[0]).length===Object.keys(ls.rev).length,'baseline sent once');
    assert.match(await strip(page),/none recorded yet/i,'baselines are not reviews');
    const before=posts.length;await page.reload();await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(3000);
    // no second baseline: the records keep their times (the Writer mock holds none, so this device re-sends what it has)
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('px.reviewed')||'{}'));
    assert.deepEqual(Object.keys(after).sort(),Object.keys(ls.rev).sort());Object.keys(after).forEach(k=>assert.equal(after[k].t,ls.rev[k].t,k));
    const again=sentReviewed(posts.slice(before));assert(again.length>=1&&again.every(r=>Object.values(r).every(x=>ls.rev[Object.keys(r).find(k=>r[k]===x)].t===x.t)),'re-sent unchanged records only');
    assert.equal(await page.evaluate(()=>localStorage.getItem('px.reviewBaselineV2')),'true');
    assert.deepEqual(errors,[]);await ctx.close();}

  // 4. REV-055: an old Writer answers ok but drops "reviewed": the records stay pending and go again once the Writer keeps them
  {const {ctx,page,errors,posts,W}=await open({oldWriter:true});await page.waitForTimeout(2500);
    const local=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('px.reviewed')||'{}')).length);assert(local>0,'baseline made');
    const first=sentReviewed(posts);assert(first.length>=1,'baseline sent to the old Writer');
    W.old=false;const before=posts.length;await page.waitForTimeout(6500);   // first retry at 5 s
    const again=sentReviewed(posts.slice(before));assert(again.length>=1&&Object.keys(again[again.length-1]).length===local,'all '+local+' records re-sent after the old Writer dropped them: '+again.map(r=>Object.keys(r).length));
    const n=posts.length;await page.waitForTimeout(16000);assert.equal(sentReviewed(posts.slice(n)).length,0,'confirmed: no more re-sends');
    assert.deepEqual(errors,[]);await ctx.close();}

  // 5. REV-055: the baseline runs as soon as the Writer state arrives, without waiting for a click or a re-render
  {const {ctx,page,errors,posts}=await open({stateDelay:3000});await page.waitForTimeout(4500);
    assert.equal(await page.evaluate(()=>localStorage.getItem('px.reviewBaselineV2')),'true','baseline ran after the late state read');
    assert(sentReviewed(posts).length>=1,'and was sent');assert.deepEqual(errors,[]);await ctx.close();}

  // 6. REV-056: big baselines go in pieces (test chunk 50), each kept before the next; System shows the device's records
  {const lines=fixture.split('\n'),tpl=lines.find(l=>/\| READY_TO_PURSUE \|/.test(l)),extra=[];for(let i=0;i<130;i++)extra.push(tpl.replace(/^\d+ \| V2X-[0-9A-F]+/,(900+i)+' | V2X-'+String(900+i).padStart(12,'0')));
    const big=lines.slice(0,lines.indexOf(tpl)).concat(extra,lines.slice(lines.indexOf(tpl))).join('\n');
    const {ctx,page,errors,posts}=await open({ls:{'px.reviewChunk':'50'},master:big});await page.waitForTimeout(6000);
    const local=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('px.reviewed')||'{}')).length);assert(local>100,'big baseline made: '+local);
    const sizes=sentReviewed(posts).map(r=>Object.keys(r).length);assert(sizes.every(n=>n<=50),'pieces of <= 50: '+sizes);
    assert.equal(sizes.reduce((a,b)=>a+b,0),local,'every record sent once: '+sizes+' / '+local);
    await page.evaluate(()=>document.getElementById('writer-badge').click());await page.waitForTimeout(400);
    const row=await page.evaluate(()=>{const r=[...document.querySelectorAll('#writer-panel *')].find(e=>/^review records$/i.test((e.textContent||'').trim()));return r&&r.parentElement.textContent});
    assert.match(row||'',new RegExp(local+' on this device \\('+local+' baseline\\) · 0 waiting to send · baseline '+local+' made'),'System row: '+row);assert.match(row,/✓ last send/);
    assert.deepEqual(errors,[]);await ctx.close();}

  // 7. REV-056: a refused send waits; coming back to the page sends at once (no 1.5 s debounce, ahead of the 5 s retry)
  {const {ctx,page,errors,posts,W}=await open({refuse:1});await page.waitForTimeout(600);
    const n=sentReviewed(posts).length;assert.equal(n,1,'one refused send');
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForTimeout(700);
    assert.equal(sentReviewed(posts).length,2,'sent again on return to the page: '+JSON.stringify(posts.map(b=>b.action+':'+(b.state&&b.state.reviewed?Object.keys(b.state.reviewed).length:0))));
    await page.evaluate(()=>document.getElementById('writer-badge').click());await page.waitForTimeout(400);
    const row=await page.evaluate(()=>{const r=[...document.querySelectorAll('#writer-panel *')].find(e=>/^review records$/i.test((e.textContent||'').trim()));return r&&r.parentElement.textContent});
    assert.match(row||'',/ 0 waiting to send /,'System row after the resend: '+row);assert.match(row,/✓ last send/);
    const nAfter=posts.length;await page.waitForTimeout(6000);assert.equal(sentReviewed(posts.slice(nAfter)).length,0,'the pending 5 s retry was cancelled');
    assert.deepEqual(errors,[]);await ctx.close();}

  // 8. REV-056: a device whose old V1 flag was set with no records made runs the baseline again (V2) and sends it;
  //    "Send now" in System re-runs the baseline and sends every record this device holds, at once
  {const {ctx,page,errors,posts}=await open({ls:{'px.reviewBaselineV1':'true'}});await page.waitForTimeout(2200);
    const local=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('px.reviewed')||'{}')).length);assert(local>0,'V2 baseline made despite the V1 flag: '+local);
    assert(sentReviewed(posts).some(r=>Object.keys(r).length===local),'and sent');
    await page.evaluate(()=>document.getElementById('writer-badge').click());await page.waitForTimeout(400);
    const btn=page.locator('#writer-panel [data-review-send]');assert.equal(await btn.count(),1,'Send now button in the review records row');
    const before=posts.length;await btn.click();await page.waitForTimeout(700);
    const sent=sentReviewed(posts.slice(before));assert(sent.length===1&&Object.keys(sent[0]).length===local,'Send now posts every record at once: '+sent.map(r=>Object.keys(r).length));
    assert.equal(await page.locator('#writer-panel').isHidden(),false,'the panel stays open');
    assert.deepEqual(errors,[]);await ctx.close();}

  // 9. REV-058: the state read fails twice (dropped request): it is tried again until it succeeds, then the baseline runs and is sent;
  //    while it waits, System says the state read failed and is retrying
  {const {ctx,page,errors,posts,W}=await open({stateFail:2});
    await page.evaluate(()=>document.getElementById('writer-badge').click());await page.waitForTimeout(300);
    const row1=await page.evaluate(()=>{const r=[...document.querySelectorAll('#writer-panel *')].find(e=>/^review records$/i.test((e.textContent||'').trim()));return r&&r.parentElement.textContent});
    assert.match(row1||'',/baseline not run: waiting for the Writer state \(state read failed .* retrying\)/,'System shows the failed state read: '+row1);
    await page.waitForTimeout(12000);
    assert(W.stateReads>=3,'state read tried again: '+W.stateReads);
    const local=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('px.reviewed')||'{}')).length);assert(local>0,'baseline made after the state read succeeded');
    assert(sentReviewed(posts).some(r=>Object.keys(r).length===local),'and sent');
    assert.equal(await page.evaluate(()=>localStorage.getItem('px.reviewBaselineV2')),'true');
    errors.splice(0,errors.length,...errors.filter(e=>!/Failed to fetch|Load failed/i.test(e)));assert.deepEqual(errors,[]);await ctx.close();}

  // 10. REV-059: the review-records line also shows at the top of Incident History (phone)
  {const {ctx,page,errors}=await open({});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
    await page.evaluate(()=>document.querySelector('[data-go="incident-history"]').click());await page.waitForTimeout(600);
    const line=await page.locator('.inc-history-page .review-line').innerText();
    assert.match(line,/^Review records · \d+ on this device \(\d+ baseline\) · 0 waiting to send · baseline \d+ made/,'Incident History line: '+line);
    assert.equal(await page.locator('.inc-history-page .review-line [data-review-send]').count(),1,'Send now is there too');
    assert.deepEqual(errors,[]);await ctx.close();}

  // 11. REV-060: a slow Writer (2.5 s per write) and a big baseline in pieces of 50: never two state writes at once from this device,
  //     a job opened mid-send rides the next write, and every record still goes exactly once
  {const lines=fixture.split('\n'),tpl=lines.find(l=>/\| READY_TO_PURSUE \|/.test(l)),extra=[];for(let i=0;i<130;i++)extra.push(tpl.replace(/^\d+ \| V2X-[0-9A-F]+/,(900+i)+' | V2X-'+String(900+i).padStart(12,'0')));
    const big=lines.slice(0,lines.indexOf(tpl)).concat(extra,lines.slice(lines.indexOf(tpl))).join('\n');
    const {ctx,page,errors,posts,W}=await open({ls:{'px.reviewChunk':'50'},master:big,postDelay:2500});
    await page.locator('#grid tbody tr[data-id]').nth(3).click();await page.waitForTimeout(20000);
    assert.equal(W.maxInFlight,1,'one state write at a time: '+W.maxInFlight);
    const local=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('px.reviewed')||'{}')).length);
    const ids=sentReviewed(posts).flatMap(r=>Object.keys(r).filter(k=>r[k].bl));assert.equal(new Set(ids).size,ids.length,'no baseline record sent twice');
    assert(new Set(sentReviewed(posts).flatMap(r=>Object.keys(r))).size>=local,'every record sent: '+local);
    assert.deepEqual(errors,[]);await ctx.close();}

  // 12. REV-060: the Writer keeps a piece but the answer is a lock timeout: the phone reads the Writer back, sees the records
  //     there, stops counting them as waiting, and does not send them again; System shows ✓ checked the Writer
  {const {ctx,page,errors,posts,W}=await open({keepState:true,lie:1});await page.waitForTimeout(4000);
    const local=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('px.reviewed')||'{}')).length);assert(local>0);
    assert.equal(Object.keys(W.store.reviewed).length,local,'the Writer kept them');
    assert.equal(sentReviewed(posts).filter(r=>Object.keys(r).length).length,1,'sent once, not again after the lock-timeout answer');
    await page.evaluate(()=>document.getElementById('writer-badge').click());await page.waitForTimeout(400);
    const row=await page.evaluate(()=>{const r=[...document.querySelectorAll('#writer-panel *')].find(e=>/^review records$/i.test((e.textContent||'').trim()));return r&&r.parentElement.textContent});
    assert.match(row||'',/ 0 waiting to send /,'System row: '+row);assert.match(row,/✓ checked the Writer .* · \d+ already there · Writer holds \d+/,'System row: '+row);
    const n=posts.length;await page.waitForTimeout(6000);assert.equal(sentReviewed(posts.slice(n)).filter(r=>Object.keys(r).length).length,0,'no resend after the 5 s retry time');
    assert.deepEqual(errors,[]);await ctx.close();}

  // 3. no published model: nothing recorded
  {const {ctx,page,errors,posts}=await open({model:false});
    assert.match(await strip(page),/waiting for the published scoring model/);
    await page.locator('#grid tbody tr[data-id]').first().click();await page.waitForTimeout(2200);
    assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('px.reviewed')||'{}')).length),0,'no review records without the published model');
    assert.equal(sentReviewed(posts).length,0);assert.deepEqual(errors,[]);await ctx.close();}

  await browser.close();server.close();console.log('review-delta.browser.js: OK');
})().catch(e=>{console.error(e);process.exit(1)});
