/* Controlled refresh of stored policy-derived values: review, preconditions, batch-by-batch apply, stop at a failure, rerun, stop button,
 * and the verification re-read. The scripted Writer applies every request with the Writer's real mutateRow. Local test-only writer. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const W=require(repo+'/apps-script/Code.gs'),Pol=require(repo+'/pipeline-policy'),G=require(repo+'/tests/gen_population.js'),P=require(repo+'/pipeline-parser.js'),R=require(repo+'/pipeline-rules.js');
const V3=['SECTION=DEGREE_FLEX','FLEX_POLICY_VERSION=1','HIGH_FLEX_MODIFIER=30','SOFT_FLEX_MODIFIER=20','NO_FLEX_MODIFIER=-15','STRICT_MODIFIER=-30','NOT_STATED_CLASS=HIGH_FLEX','EQUIVALENCY_CLASS=SOFT_FLEX','HARD_DEGREE_CLASS=NO_FLEX','SINGLE_PATH_CLASS=STRICT','FRESH_DEGREE_OVERRIDES_STALE_CLASS=YES'].join('\n');
const rules=fs.readFileSync(repo+'/tests/fixtures/TIM_PIPELINE_RULES_CANONICAL.sample.txt','utf8')+'\n'+V3+'\n';
const policy=Pol.normalizeFlexPolicy(R.flexPolicy(rules));assert.equal(policy.HIGH_FLEX_MODIFIER,30,'the scripted canonical rules carry the current policy');
const ACTIVE=['READY_TO_PURSUE','SCOUT_INTAKE','DISCOVERY_LEAD','MANUAL_RESEARCH','TIM_DECISION_REQUIRED','BLOCKED'],OLD={HIGH_FLEX:15,SOFT_FLEX:6,NO_FLEX:-10,STRICT:-10},CLASSES=['HIGH_FLEX','SOFT_FLEX','NO_FLEX','STRICT'];
// A synthetic master where 60 active rows hold values stored under the old policy.
const base=G.generate(1000,7).split('\n');let injected=[];
base.forEach((l,i)=>{const m=l.match(/^\d+ \| (V2F-[0-9A-F]+) \| .* \| ([A-Z_]+) \| [A-Z_]+\//);if(!m||ACTIVE.indexOf(m[2])<0||injected.length>=60)return;
  const cls=CLASSES[injected.length%4],raw=60+injected.length%30,mod=OLD[cls],adj=Math.max(0,Math.min(100,raw+mod));
  base[i]=l+'; FLEX_CLASS='+cls+'; FLEX_MODIFIER='+mod+'; SCOPE_FIT_RAW='+raw+'; ADJUSTED_FIT='+adj+'; PURSUIT_STATUS=NEEDS_EVIDENCE';injected.push({id:m[1],cls,mod,raw});});
assert.equal(injected.length,60,'the synthetic population has enough active rows');
const ORIGINAL=base.slice();
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end('missing')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
  let master=base.slice(),version=1,calls=[],failCall=0,delayMs=0,status={ok:true,queue:{pending:0,processing:[],hold:[]},triggerInstalled:true,unverified:{count:0},freeze:{frozen:false},warnings:[],recentRuns:[]};
  const LOCK='Lock timeout: another process was holding the lock for too long.';
  await page.route('**/writer*',async r=>{const q=r.request(),a=new URL(q.url()).searchParams.get('action');
    if(q.method()==='POST'){const b=JSON.parse(q.postData()||'{}');
      if(b.action==='batch'){calls.push(b.requests);if(delayMs)await new Promise(x=>setTimeout(x,delayMs));
        if(failCall&&calls.length===failCall)return r.fulfill({json:{ok:false,error:LOCK,results:b.requests.map((_,i)=>({index:i,ok:false,error:LOCK}))}});
        const results=b.requests.map((rq,index)=>{const pid=rq.ruling.primaryId,at=master.findIndex(l=>l.split(' | ')[1]===pid);if(at<0)return {index,ok:false,error:'no such row'};
          const res=W.mutateRow(master[at],Object.assign({ts:new Date().toISOString()},rq.ruling),policy);if(!res.ok)return {index,ok:false,error:res.error};master[at]=res.after;return {index,ok:true}});
        version++;return r.fulfill({json:{ok:results.every(x=>x.ok),results}})}
      return r.fulfill({json:{ok:true}})}
    if(a==='writer_status')return r.fulfill({json:Object.assign({now:new Date().toISOString()},status)});
    if(a==='canonical_rules'||a==='rules')return r.fulfill({json:{ok:true,text:rules}});
    if(a==='master')return r.fulfill({json:{ok:true,id:'m',text:master.join('\n'),fetchedAt:new Date().toISOString(),modifiedTime:new Date(Date.UTC(2026,9,7,0,0,version)).toISOString()}});
    return r.fulfill({json:{ok:true}})});
  await page.goto(origin+'/pipeline.html');await page.waitForSelector('#grid tbody tr[data-id]');
  const gotoScoring=async()=>{await page.evaluate(()=>document.querySelector('[data-tab="scoring"]').click());await page.waitForSelector('#score-stored-status')};
  const statusText=async()=>(await page.locator('#score-stored-status').innerText()).trim();
  const sys=async()=>{await page.evaluate(()=>{const p=document.getElementById('writer-panel');if(p.hidden)document.getElementById('writer-badge').click()});await page.waitForTimeout(150);const t=await page.locator('#writer-panel .build-row',{hasText:/^stored FLEX values/i}).innerText();await page.evaluate(()=>document.getElementById('sys-close').click());return t};
  const lineOf=id=>master.find(l=>l.split(' | ')[1]===id),pay=l=>W.parsePayload(l.split(' | ').slice(9).join(' | ')).payload;

  // 1. The Scoring screen and the System panel report the stored values that are out of date. Nothing has been written.
  await gotoScoring();await page.waitForFunction(()=>/hold values from an older policy/.test(document.getElementById('score-stored-status').textContent));
  assert.equal(await statusText(),'60 of 60 active rows hold values from an older policy');assert.match(await sys(),/60 out of date/);assert.equal(calls.length,0);

  // 2. The review lists what will be written and the safety checks. A busy queue blocks Apply, and nothing is written.
  status.queue.pending=2;await page.locator('#score-stored-review').click();await page.waitForSelector('#score-refresh .score-review');
  let text=await page.locator('#score-refresh').innerText();
  assert.match(text,/What will be written · 60 rows/i);assert.match(text,/3 batches of at most 25/);assert.match(text,/FLEX_MODIFIER (15|6|-10) → (30|20|-15|-30)/);assert.match(text,/never changes a row's FLEX class, bucket, state, notes or evidence/i);
  assert.match(text,/✗ Queue idle/);assert.equal(await page.locator('#score-refresh-apply').isDisabled(),true);assert.equal(calls.length,0,'a blocked review writes nothing');
  await page.locator('#score-refresh-cancel').click();assert.equal(await page.locator('#score-refresh').isHidden(),true);

  // 3. With the queue idle, Apply runs batch by batch. Batch 2 fails: it stops, sends nothing further, and the master is re-read.
  status.queue.pending=0;failCall=2;await page.locator('#score-stored-review').click();await page.waitForSelector('#score-refresh-apply:not([disabled])');
  assert.match(await page.locator('#score-refresh').innerText(),/✓ Queue idle/);
  await page.locator('#score-refresh-apply').click();await page.waitForFunction(()=>/Refresh stopped at a failure/i.test(document.getElementById('score-refresh').textContent));
  text=await page.locator('#score-refresh').innerText();
  assert.match(text,/Batch 2 of 3 failed: Lock timeout/);assert.match(text,/Nothing from later batches was sent/);assert.match(text,/25 rows from earlier batches were written and verified/);assert.match(text,/35 rows? still out of date/);
  assert.deepEqual(calls.map(c=>c.length),[25,25],'the third batch was never sent');
  assert.equal(await statusText(),'35 of 60 active rows hold values from an older policy','the status comes from the re-read master');
  await page.locator('#score-refresh-close').click();

  // 4. A rerun sends only the rows still out of date (25 + 10), then verifies from a fresh read.
  failCall=0;await page.locator('#score-stored-review').click();await page.waitForSelector('#score-refresh-apply:not([disabled])');
  assert.match(await page.locator('#score-refresh').innerText(),/What will be written · 35 rows/i);assert.match(await page.locator('#score-refresh').innerText(),/2 batches/);
  await page.locator('#score-refresh-apply').click();await page.waitForFunction(()=>/Refresh complete/i.test(document.getElementById('score-refresh').textContent));
  text=await page.locator('#score-refresh').innerText();assert.match(text,/35 rows written in 2 batches/);assert.match(text,/Verified from a fresh master read: 0 rows still out of date/);
  assert.deepEqual(calls.map(c=>c.length),[25,25,25,10]);
  assert.equal(await statusText(),'all 60 active rows match the current FLEX policy');assert.match(await sys(),/up to date/);await page.locator('#score-refresh-close').click();
  assert.equal(await page.locator('#score-stored-review').isHidden(),true,'nothing left to refresh');

  // 5. What was written: only the requested fields, only on the 60 rows; classes, buckets and every other row are unchanged.
  const sent=[].concat(calls[0],calls[2],calls[3]);assert.equal(sent.length,60,'each row went out exactly once in a successful batch');assert.equal(new Set(sent.map(x=>x.ruling.requestId)).size,60);
  sent.forEach(x=>{assert.equal(x.action,'ruling');assert.equal(x.ruling.kind,'ENRICH');assert.deepEqual(Object.keys(x.ruling.fields),['FLEX_CLASS']);assert.equal(x.ruling.actor,'EXPLORER');assert.match(x.ruling.requestId,/^PX-REFRESH-[0-9a-f]{6}-V2F-/)});
  const touched=new Set(injected.map(x=>x.id));let changedOthers=0;
  master.forEach((l,i)=>{const id=l.split(' | ')[1];if(!touched.has(id)){if(l!==ORIGINAL[i])changedOthers++;return}
    const o=ORIGINAL[i].split(' | '),n=l.split(' | '),exp=injected.find(x=>x.id===id),p=pay(l),op=pay(ORIGINAL[i]);
    assert.equal(n[4],o[4],'bucket unchanged');assert.equal(n[5],o[5],'disposition unchanged');assert.equal(p.FLEX_CLASS,exp.cls,'class unchanged');assert.equal(Number(p.FLEX_MODIFIER),policy[exp.cls+'_MODIFIER']||({HIGH_FLEX:30,SOFT_FLEX:20,NO_FLEX:-15,STRICT:-30})[exp.cls]);
    assert.equal(Number(p.ADJUSTED_FIT),Math.max(0,Math.min(100,exp.raw+Number(p.FLEX_MODIFIER))));assert.equal(p.SCOPE_FIT_RAW,op.SCOPE_FIT_RAW,'the raw fit is untouched');assert.equal(p.TIM_NOTE,op.TIM_NOTE)});
  assert.equal(changedOthers,0,'no row outside the plan changed');

  // 6. The Stop button: a new policy change makes 30 rows stale again; stopping during batch 1 lets it finish and sends nothing more.
  injected.slice(0,30).forEach(x=>{const at=master.findIndex(l=>l.split(' | ')[1]===x.id);master[at]=master[at].replace(/FLEX_MODIFIER=[-0-9]+/,'FLEX_MODIFIER='+OLD[x.cls]).replace(/ADJUSTED_FIT=[-0-9]+/,'ADJUSTED_FIT='+Math.max(0,Math.min(100,x.raw+OLD[x.cls])))});version++;
  await page.reload();await page.waitForSelector('#grid tbody tr[data-id]');await gotoScoring();await page.waitForFunction(()=>/30 of 60/.test(document.getElementById('score-stored-status').textContent));
  calls=[];delayMs=700;await page.locator('#score-stored-review').click();await page.waitForSelector('#score-refresh-apply:not([disabled])');await page.locator('#score-refresh-apply').click();
  await page.waitForSelector('#score-refresh-stop');await page.locator('#score-refresh-stop').click();
  await page.waitForFunction(()=>/Refresh stopped/i.test(document.getElementById('score-refresh').textContent),null,{timeout:15000});
  text=await page.locator('#score-refresh').innerText();assert.match(text,/You stopped it/);assert.match(text,/25 rows from earlier batches were written and verified/);assert.match(text,/5 rows? still out of date/);assert.deepEqual(calls.map(c=>c.length),[25]);

  assert.equal(errors.length,0,errors.join('\n'));
  await browser.close();server.close();console.log('derived refresh browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
