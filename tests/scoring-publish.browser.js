/* Scoring: review before publish, restore previous revision, revision stamp in the System panel. Scripted local Writer only. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const rules=fs.readFileSync(repo+'/tests/fixtures/TIM_PIPELINE_RULES_CANONICAL.sample.txt','utf8');
const Scoring=require(repo+'/pipeline-scoring.js');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end('missing')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[],posts=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
  // The scripted Writer holds the published model, as the real one does: a save bumps the revision and stamps the time.
  const start=Scoring.defaults();start.publishedRevision=9;start.publishedAt='2026-10-06T19:46:06.378Z';start.publishedBy='TIM';
  let published=JSON.parse(JSON.stringify(start)),failNext=false;
  await page.route('**/writer*',r=>{const q=r.request(),a=new URL(q.url()).searchParams.get('action');
    if(q.method()==='POST'){const b=JSON.parse(q.postData()||'{}');posts.push(b);
      if(b.action==='save_scoring_model'){if(failNext){failNext=false;return r.fulfill({json:{ok:false,error:'boom'}})}
        const m=JSON.parse(JSON.stringify(b.model));m.publishedRevision=(published.publishedRevision||0)+1;m.publishedAt=new Date().toISOString();m.publishedBy='TIM';published=m;return r.fulfill({json:{ok:true,model:m}})}
      return r.fulfill({json:{ok:true}})}
    if(a==='scoring')return r.fulfill({json:{ok:true,exists:true,model:published}});
    if(a==='canonical_rules'||a==='rules')return r.fulfill({json:{ok:true,text:rules}});
    return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:{ok:true}})});
  await page.goto(base+'/pipeline.html');await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(900);
  const scoringPosts=()=>posts.filter(p=>p.action==='save_scoring_model');
  const weights=()=>page.$$eval('[data-score-weight]',els=>Object.fromEntries(els.map(e=>[e.dataset.scoreWeight,+e.value])));
  const badges=()=>page.$$eval('#grid tbody tr .score-badge',e=>e.map(x=>x.textContent.trim()).join(','));
  const stamp=async()=>{await page.evaluate(()=>{const p=document.getElementById('writer-panel');if(p.hidden)document.getElementById('writer-badge').click()});await page.waitForTimeout(200);return page.locator('#writer-panel .build-row',{hasText:/^scoring/}).innerText()};

  // 1. The System panel carries the published revision, version, time and author.
  let row=await stamp();assert.match(row,/rev 9/);assert.match(row,/v2026-10-04\.1/);assert.match(row,/published .* by TIM/);
  await page.evaluate(()=>document.getElementById('sys-close').click());
  await page.evaluate(()=>document.querySelector('[data-tab="scoring"]').click());await page.waitForSelector('#score-publish');
  assert.match(await page.locator('#score-canonical-status').innerText(),/rev 9/);
  assert.equal((await page.locator('#score-publish').textContent()).trim(),'Review & publish…');
  assert.equal(await page.locator('#score-restore').isHidden(),true,'no previous revision known yet');

  // 2. Reviewing with no change: shows nothing differs, Publish is disabled, nothing is posted.
  await page.locator('#score-publish').click();await page.waitForSelector('#score-review .score-review');
  assert.match(await page.locator('#score-review').innerText(),/No settings differ from the published model/i);
  assert.equal(await page.locator('#score-review-publish').isDisabled(),true);assert.equal(scoringPosts().length,0);
  await page.locator('#score-review-cancel').click();assert.equal(await page.locator('#score-review').isHidden(),true);

  // 3. A real change: the review lists it and shows the effect; nothing is saved, shared or applied to the live ratings.
  const w0=await weights(),ratingsBefore=await badges();assert(ratingsBefore.length>0,'ratings are visible in the table');
  await page.locator('[data-score-weight="experience"]').fill(String(w0.experience+10));await page.locator('[data-score-weight="flex"]').fill(String(w0.flex-10));
  await page.locator('[data-score-weight="compensation"]').fill(String(w0.compensation));
  await page.locator('#score-publish').click();await page.waitForSelector('#score-review .score-review');
  let text=await page.locator('#score-review').innerText();
  assert.match(text,/Review · revision 10/i);assert.match(text,new RegExp('Weight experience: '+w0.experience+' → '+(w0.experience+10),'i'));assert.match(text,new RegExp('Weight flex: '+w0.flex+' → '+(w0.flex-10),'i'));
  assert.match(text,/Effect on \d+ active-work jobs/i);assert.match(text,/Ranking\s+\d+ move up · \d+ move down · \d+ unchanged/i);assert.match(text,/Ratings\s+\d+ higher · \d+ lower · \d+ same · average [+-]?\d/i);
  assert.match(text,/Top 10, before and after/i);assert.match(text,/Published now/i);assert.match(text,/With your change/i);
  assert.equal(scoringPosts().length,0,'reviewing posts nothing');
  assert.equal(await badges(),ratingsBefore,'the live ratings are untouched by a review');
  assert.equal(await page.locator('#score-review-publish').isEnabled(),true);

  // 4. A failed publish reports the reason, changes nothing, and can be retried.
  failNext=true;await page.locator('#score-review-publish').click();await page.waitForFunction(()=>/Publish failed/.test(document.getElementById('score-review-msg').textContent));
  assert.match(await page.locator('#score-review-msg').innerText(),/Publish failed · boom \(nothing was changed\)/);assert.equal(published.publishedRevision,9);
  assert.equal(await page.locator('#score-review-publish').isEnabled(),true);

  // 5. Publish: exactly the reviewed settings are sent; the stamp moves to revision 10; Restore appears for revision 9.
  await page.locator('#score-review-publish').click();await page.waitForFunction(()=>/Published and read back: revision 10/.test(document.getElementById('score-msg').textContent));
  const sent=scoringPosts().filter(p=>p.model.weights.experience===w0.experience+10);assert.equal(sent.length,2,'the failed and the successful attempt carry the reviewed settings');
  assert.equal(sent[1].model.weights.flex,w0.flex-10);assert.equal(await page.locator('#score-review').isHidden(),true);
  assert.match(await page.locator('#score-canonical-status').innerText(),/rev 10/);
  assert.equal((await weights()).experience,w0.experience+10,'the published model is now the live model');
  assert.notEqual(await badges(),ratingsBefore,'publishing changes the ratings everyone sees');
  row=await stamp();assert.match(row,/rev 10/);await page.evaluate(()=>document.getElementById('sys-close').click());
  assert.equal(await page.locator('#score-restore').isVisible(),true);assert.equal((await page.locator('#score-restore').textContent()).trim(),'Restore revision 9…');

  // 6. Restore: loads revision 9 settings and goes through the same review; publishing creates revision 11 with the old settings.
  await page.locator('#score-restore').click();await page.waitForSelector('#score-review .score-review');
  text=await page.locator('#score-review').innerText();assert.match(text,/Review · revision 11/i);assert.match(text,/restores the settings of revision 9 as a new revision/i);
  assert.match(text,new RegExp('Weight experience: '+(w0.experience+10)+' → '+w0.experience,'i'));
  await page.locator('#score-review-publish').click();await page.waitForFunction(()=>/revision 11/.test(document.getElementById('score-msg').textContent));
  const last=scoringPosts().pop();assert.equal(last.model.weights.experience,w0.experience);assert.equal(published.publishedRevision,11);
  assert.deepEqual(await weights(),w0);assert.equal(await badges(),ratingsBefore,'restoring returns the original ratings');

  assert.equal(errors.length,0,errors.join('\n'));
  await browser.close();server.close();console.log('scoring publish browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
