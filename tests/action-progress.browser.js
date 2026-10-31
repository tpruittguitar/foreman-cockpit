/* Local scripted Writer only: delayed acceptance, durable readback and reload recovery. */
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const Scoring=require('../pipeline-scoring');
const repo=path.resolve(__dirname,'..'),fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8'),rules=fs.readFileSync(repo+'/tests/fixtures/TIM_PIPELINE_RULES_CANONICAL.sample.txt','utf8');
async function main(){
  const server=require('http').createServer((req,res)=>{try{const f=repo+new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end('missing')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'})));
    let master=fixture.replace(/\r/g,''),requests=[],posts=0,durable=false,model=Scoring.defaults(),mismatch=false;model.publishedRevision=9;
    await page.route('**/writer*',async route=>{
      const req=route.request(),a=new URL(req.url()).searchParams.get('action');
      if(req.method()==='POST'){
        const b=JSON.parse(req.postData());
        if(b.action==='batch'){
          posts++;requests.push(...b.requests);
          await new Promise(r=>setTimeout(r,200));
          master=master.split('\n').map(line=>{const cells=line.split(' | '),r=b.requests.find(x=>x.ruling.primaryId===cells[1]);if(!r)return line;cells[4]='MANUAL_RESEARCH';cells[9]+='; STATE_SOURCE=TIM:'+r.ruling.requestId;return cells.join(' | ')}).join('\n');
          return route.fulfill({json:{ok:true,writeId:'batch-one'}});
        }
        if(b.action==='save_scoring_model'){await new Promise(r=>setTimeout(r,250));model={...b.model,publishedRevision:10,publishedAt:new Date().toISOString()};return route.fulfill({json:{ok:true,model}})}
        return route.fulfill({json:{ok:true}});
      }
      if(a==='request_result')return route.fulfill({json:{ok:true,found:true,status:durable?'COMPLETE':'PENDING',durable,entry:{w:'batch-one'}}});
      if(a==='scoring')return route.fulfill({json:{ok:true,exists:true,model:mismatch?Scoring.defaults():model}});
      if(a==='canonical_rules'||a==='rules')return route.fulfill({json:{ok:true,text:rules}});
      return route.fulfill({json:a==='master'?{ok:true,text:master,fetchedAt:new Date().toISOString()}:a==='archive'?{ok:true,text:'COLUMNS: INV | PRIMARY_ID | COMPANY | TITLE | BUCKET\n========\n'}:{ok:true}});
    });
    await page.goto(base+'/pipeline.html?open=jobs');await page.waitForSelector('#grid tbody tr[data-id]');
    await page.evaluate(()=>{document.getElementById('select-visible').click();var s=document.getElementById('bulk-decision');s.value='MANUAL_RESEARCH';s.dispatchEvent(new Event('change'))});
    page.on('dialog',d=>d.accept('test decision'));
    await page.evaluate(()=>document.getElementById('bulk-apply').click());
    await page.waitForFunction(()=>document.querySelector('#action-progress')?.textContent.includes('Sending decisions'));
    assert.equal(await page.locator('#action-progress.ap-complete').count(),0);
    await page.waitForFunction(()=>document.querySelector('#action-progress')?.textContent.includes('Remaining writes are unconfirmed'));
    assert(requests.length>0);assert.equal(posts,1);assert.equal(await page.locator('#action-progress.ap-complete').count(),0,'accepted rows are not complete without a durable receipt');
    // Reload must retain the original requests, offer read-only recovery, and never submit them again.
    await page.reload();await page.waitForSelector('#action-progress .ap-actions button');durable=true;
    await page.locator('#action-progress .ap-actions button').click();
    try{await page.waitForSelector('#action-progress.ap-complete')}catch(e){console.error(await page.locator('#action-progress').innerText());console.error(requests.map(x=>x.ruling));throw e}assert.equal(posts,1);
    assert.match(await page.locator('#action-progress').innerText(),new RegExp(requests.length+' decisions confirmed'));
    await page.waitForSelector('#action-progress',{state:'detached'});
    // Current scoring section update: actual affected count, delayed save, independent GET and score calculation.
    await page.evaluate(()=>document.querySelector('[data-tab="scoring"]').click());await page.waitForSelector('#score-update-weights');
    const experience=page.locator('[data-score-weight="experience"]'),flex=page.locator('[data-score-weight="flex"]');
    await experience.fill(String(+(await experience.inputValue())+5));await flex.fill(String(+(await flex.inputValue())-5));
    await page.locator('#score-update-weights').click();
    await page.waitForSelector('#action-progress');assert.match(await page.locator('#action-progress').innerText(),/ratings will change/);
    await page.waitForSelector('#action-progress.ap-complete');assert.match(await page.locator('#action-progress').innerText(),/Revision 10 confirmed/);
    await page.waitForSelector('#action-progress',{state:'detached'});
    // An accepted save with mismatched readback must remain visible; it must not claim success.
    mismatch=true;await experience.fill(String(+(await experience.inputValue())+5));await flex.fill(String(+(await flex.inputValue())-5));
    await page.locator('#score-update-weights').click();await page.waitForSelector('#action-progress.ap-pending');
    assert.match(await page.locator('#action-progress').innerText(),/Update not confirmed/);
    assert.equal(await page.locator('#action-progress.ap-complete').count(),0);
    assert.deepEqual(errors,[]);console.log('action progress browser checks passed');
  }finally{await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
