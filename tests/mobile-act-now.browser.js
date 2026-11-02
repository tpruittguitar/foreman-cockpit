/* Mobile shell: the Decide "Act now" chip follows the Act Now rules (Tim + Grok Bot GUI, 2026-11-02; rules from Simplify PR 1,
   pipeline-act-now.js): Shield AI is pinned first even when it is not the top score, Memphis roles are left out, and a role
   Tim has decided leaves Act now at once and stays out after a reload. The chip count is the number of cards it shows (<= 10).
   The old layout's checks of the same rules are tests/act-now.browser.js (touch tablets).
   Run: node tests/mobile-act-now.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for the other browser tests)
   MOBILE_SHOTS=<dir> also writes a screenshot. */
require('./helpers/block-production-writer.cjs'); // no request to the production Writer
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
const shots=process.env.MOBILE_SHOTS;
const SHIELD='V2X-005F540B3422',MEMPHIS='V2X-023572E52448';
// Open rows become needs-decision with measured fit and posted-range pay; one is Shield AI, one is in Memphis (as in act-now.browser.js).
let fit=60;
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8').split('\n').map(l=>{
  const c=l.split(' | ');if(c.length<10||!/^\d+$/.test(c[0]))return l;
  if(!/^(READY_TO_PURSUE|MANUAL_RESEARCH|SCOUT_INTAKE|DISCOVERY_LEAD|TIM_DECISION_REQUIRED)$/.test(c[4]))return l;
  c[4]='TIM_DECISION_REQUIRED';if(c[1]===SHIELD)c[2]='Shield AI';if(c[1]===MEMPHIS)c[8]='Memphis, TN';
  return c.join(' | ')+'; SCOPE_FIT_RAW='+(fit++)+'; FIT_CONF=MED; SALARY_BASE_LOW=190000; SALARY_BASE_HIGH=230000; SALARY_BASIS=FORGE-ESTIMATE';
}).join('\n');
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
  const page=await ctx.newPage(),errors=[],posts=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}));window.PX_TEST_BATCH_MS=150});
  await page.route('**/script.google.com/**',r=>r.abort());await page.route('**/script.googleusercontent.com/**',r=>r.abort());   // never reach the production Writer
  await page.route('**/api.github.com/**',r=>r.fulfill({json:{}}));await page.route('**/raw.githubusercontent.com/**',r=>r.fulfill({body:''}));
  await page.route('**/writer*',r=>{const req=r.request(),a=new URL(req.url()).searchParams.get('action');
    if(req.method()==='POST'){const b=JSON.parse(req.postData()||'{}');posts.push(b);
      if(b.action==='batch')return r.fulfill({json:{ok:true,mode:'BATCH_RULING_SINGLE_COMMIT',writeId:'W1',results:b.requests.map(q=>({ok:true,requestId:q.ruling.requestId}))}});
      return r.fulfill({json:{ok:true,receipt:{REQUEST_ID:b.ruling&&b.ruling.requestId}}})}
    if(a==='master')return r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}});
    if(a==='request_result')return r.fulfill({json:{ok:true,found:true,status:'COMPLETE'}});
    return r.fulfill({json:{ok:true}})});
  const rulings=()=>posts.flatMap(b=>b.action==='ruling'?[b.ruling]:b.action==='batch'?b.requests.map(q=>q.ruling):[]);
  const cards=()=>page.$$eval('#m-pane-decide .m-card',cs=>cs.map(c=>({id:c.getAttribute('data-m-card'),score:parseInt(c.querySelector('.m-score b').textContent,10),sub:c.textContent})));
  const chip=async()=>parseInt((await page.textContent('[data-m-filter="act"]')).replace(/\D+/g,' ').trim().split(' ').pop(),10);
  async function load(){await page.goto(base+'/pipeline.html?src=writer');await page.waitForSelector('#m-pane-decide .m-card');await page.waitForTimeout(300)}
  async function filter(k){await page.click('[data-m-filter="'+k+'"]');await page.waitForTimeout(200)}

  // 1. All: Shield AI is in the list but is NOT the top score, so the pin (not the sort) has to put it first in Act now.
  await load();const all=await cards();
  assert.ok(all.some(c=>c.id===SHIELD),'Shield AI is a needs-decision job');assert.ok(all.some(c=>c.id===MEMPHIS),'the Memphis job is in All');
  assert.notStrictEqual(all[0].id,SHIELD,'Shield AI is not first by score (so the pin is tested)');
  assert.ok(all.find(c=>c.id===SHIELD).score<Math.max(...all.map(c=>c.score)),'Shield AI scores below the top card');

  // 2. Act now: Shield AI first, Memphis out, at most 10, chip count = cards shown, every card also in All.
  await filter('act');let act=await cards();
  assert.strictEqual(act[0].id,SHIELD,'Shield AI pinned first in Act now');assert.match(act[0].sub,/Shield AI/);
  assert.ok(!act.some(c=>c.id===MEMPHIS),'Memphis role left out of Act now');assert.ok(!act.some(c=>/Memphis/.test(c.sub)),'no Memphis card at all');
  assert.ok(act.length>=2&&act.length<=10,'Act now shows 2 to 10 cards ('+act.length+')');
  assert.strictEqual(await chip(),act.length,'chip count = cards shown');assert.ok(act.every(c=>all.some(x=>x.id===c.id)),'Act now is a subset of All');
  assert.deepStrictEqual(act.map(c=>c.id),await page.evaluate(()=>PEMobileBridge.actNowIds().filter(id=>PEMobileBridge.decideRows().some(r=>r.id===id))),'same roles, same order as the shared Act Now model');
  if(shots)await page.screenshot({path:path.join(shots,'stage5-act-now-rules-390x844.png')});

  // 3. Decided: Decline the second Act now card; it leaves Act now (and All) at once, the chip drops by one, one DECLINE is sent.
  const n0=act.length,gone=act[1].id;
  await page.click('.m-card[data-m-card="'+gone+'"] [data-m-do="decline"]');await page.waitForSelector('#m-toast:not([hidden])');await page.waitForTimeout(600);
  act=await cards();assert.ok(!act.some(c=>c.id===gone),'decided role left Act now at once');assert.strictEqual(await chip(),n0-1,'chip count dropped by one');
  const r=rulings().filter(x=>x.primaryId===gone);assert.strictEqual(r.length,1,'one ruling sent');assert.strictEqual(r[0].kind,'DECLINE');
  await page.waitForTimeout(5500);   // past the 5 s Undo

  // 4. After a reload the decided role stays out of Act now and All; Shield AI is still first.
  await load();assert.ok(!(await cards()).some(c=>c.id===gone),'still out of All after a reload');
  await filter('act');act=await cards();assert.ok(!act.some(c=>c.id===gone),'still out of Act now after a reload');assert.strictEqual(act[0].id,SHIELD,'Shield AI still first');
  assert.ok(!act.some(c=>c.id===MEMPHIS),'Memphis still out');

  assert.deepStrictEqual(errors,[],'no page errors');
  await browser.close();server.close();console.log('mobile act now browser: PASS ('+n0+' Act now cards, Shield AI first, Memphis out, decided role out after reload)');
})().catch(e=>{console.error(e);process.exit(1)});
