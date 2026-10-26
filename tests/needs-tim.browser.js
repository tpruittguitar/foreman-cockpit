/* Needs you page and opening-page rule, end to end against a scripted Writer and a scripted attention list.
   Run: node tests/needs-tim.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for tests/ui.browser.js)
   NEEDS_TIM_SHOTS=<dir> also writes desktop and phone screenshots of the page. */
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..');
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8');
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
const ago=m=>new Date(Date.now()-m*60000).toISOString();
const attention={schema:'forge.needs-tim.v1',builtAt:ago(12),counts:{},lanes:[
  {lane:'EMAIL',provider:'CHATGPT',lastAt:ago(50),lastStatus:'PARTIAL_WITH_WORK',usualGapHours:3,runs7d:68,overdue:false},
  {lane:'POSTVAL',provider:'CHATGPT',lastAt:ago(68*60),lastStatus:'UNFINISHED',usualGapHours:1.4,runs7d:4,overdue:true}],dismissed:[{id:'d1'}],
 items:[
  {id:'ask:ASK-20261018-01',askId:'ASK-20261018-01',section:'DECIDE',level:'ACTION',title:'Auterion: P2 or Watch?',detail:'Registry says P2; CONTROL says watch.',blocks:'Which tier web discovery uses.',options:['Keep P2','Change to WATCH'],recommended:'Change to WATCH.',action:'Answer in chat.',raisedBy:'CLAUDE',at:ago(30),sourceUrl:'https://github.com/tpruittguitar/forge-coordination/blob/main/asks/open/ASK-20261018-01.json'},
  {id:'ask:ASK-20261018-09',askId:'ASK-20261018-09',section:'JOBS',level:'ACTION',title:'Ashley Furniture, Senior Director Mfg Ops: rejected or applied?',options:['Rejected','Applied'],raisedBy:'CLAUDE',at:ago(25)},
  {id:'run-unfinished:POSTVAL|CHATGPT',section:'FAILED',level:'WATCH',title:'POSTVAL · CHATGPT — run never wrote a terminal receipt',raisedBy:'CHATGPT',at:ago(68*60)},
  {id:'lane-overdue:POSTVAL',section:'UPKEEP',level:'ACTION',title:'POSTVAL lane has gone quiet (usually reports every 1.4 h)',raisedBy:'CHATGPT',at:ago(68*60)},
  {id:'pr:foreman-cockpit#66',section:'UPKEEP',level:'ACTION',title:'foreman-cockpit PR #66: Scoring audit repair',sourceUrl:'https://github.com/tpruittguitar/foreman-cockpit/pull/66',at:'2026-10-06T00:00:00Z'}]};
const writerStatus={ok:true,level:'warn',warnings:[{code:'QUEUE_BACKLOG',level:'warn',message:'9 waiting, oldest 15 min'}],queue:{pending:9,processing:[],hold:['FORGE-WEB-CHATGPT-B02.json']},triggerInstalled:true,recentRuns:[],recentHolds:[],recentFailed:[],unverified:{count:0}};
const operations={ok:true,store:{obligations:{}},summary:{open:[{id:'OB-1',state:'FAILED_UNVERIFIED',source:'email',runId:'FORGE-EMAIL-CHATGPT-20261018-1502ET'}],counts:{},total:1,done:0}};
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end('')}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  async function open(ctxOpts,hash){
    const ctx=await browser.newContext(ctxOpts||{viewport:{width:2560,height:1440}}),page=await ctx.newPage(),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await page.route('**/api.github.com/**',r=>r.fulfill({json:{sha:'x'}}));
    // registered last so it wins over the generic GitHub mock (Playwright matches the newest route first)
    await page.route('**/api.github.com/repos/tpruittguitar/forge-coordination/contents/attention/**',r=>r.fulfill({json:attention}));
    await page.route('**/raw.githubusercontent.com/**',r=>r.fulfill({body:''}));
    await page.route('**/writer*',r=>{const req=r.request();if(req.method()==='POST'){posts.push(req.postData());return r.fulfill({json:{ok:true}})}const a=new URL(req.url()).searchParams.get('action');return r.fulfill({json:a==='master'?{ok:true,id:'m',text:fixture,fetchedAt:new Date().toISOString(),modifiedTime:'2026-10-02T03:00:00Z'}:a==='writer_status'?writerStatus:a==='operations'?operations:{ok:true}})});
    await page.goto(base+'/pipeline.html?src=writer&open=jobs'+(hash||''));await page.waitForSelector('#grid tbody tr[data-id]');await page.waitForTimeout(600);
    return {ctx,page,errors,posts};
  }
  // 1. Start from a URL that last showed Applied: the opening page is Open roles and lists no applied or terminal job.
  let {ctx,page,errors,posts}=await open(null,'#'+encodeURIComponent(JSON.stringify({t:'pipeline',p:'APPLIED'})));
  const start=await page.evaluate(()=>({hash:decodeURIComponent(location.hash.slice(1)),buckets:[...document.querySelectorAll('#grid tbody tr[data-id]')].map(tr=>tr.textContent)}));
  assert.match(start.hash,/"p":"OPEN"/,'start view is Open roles');
  assert.ok(!start.buckets.some(t=>/\b(APPLIED|REJECTED_BY_EMPLOYER|CLOSED_DEAD|DECLINED_BY_TIM|DUPLICATE)\b/.test(t)),'no applied/terminal rows on the opening page');
  // 2. Bell carries the to-act count once the list and Writer status arrive; it opens Needs you.
  await page.waitForFunction(()=>{const b=document.querySelector('#bell .nt-badge');return b&&+b.textContent>=5},null,{timeout:10000}).catch(()=>{});
  const n=+(await page.locator('#bell .nt-badge').textContent());
  assert.ok(n>=5,'badge counts blocking + action items, got '+n);
  await page.locator('#bell').click();await page.waitForSelector('#view-needs-tim.on .nt-page');await page.waitForTimeout(300);
  const view=await page.evaluate(()=>({stats:[...document.querySelectorAll('#view-needs-tim .nt-stat span')].map(h=>h.textContent),items:[...document.querySelectorAll('#view-needs-tim .nt-item')].map(a=>a.getAttribute('data-nt-id')),hash:decodeURIComponent(location.hash.slice(1)),tab:document.querySelector('#section-tabs button[aria-selected="true"]')&&document.querySelector('#section-tabs button[aria-selected="true"]').textContent,object:document.body.textContent.indexOf('[object Object]')}));
  assert.deepStrictEqual(view.stats,['My decisions','AI work','Incidents','History']);
  ['ask:ASK-20261018-01','ask:ASK-20261018-09','live:queue-held','live:writer-warning:QUEUE_BACKLOG','live:obligation:OB-1','lane-overdue:POSTVAL','pr:foreman-cockpit#66'].forEach(id=>assert.ok(view.items.indexOf(id)>=0,'shows '+id));
  assert.match(view.hash,/"t":"needs-tim"/);assert.strictEqual(view.tab,'Needs you','System section tab is highlighted');
  assert.strictEqual(view.object,-1,'no literal [object Object]');
  // 3. Copy answer puts a ready-to-paste ruling on the clipboard; nothing is posted to the Writer.
  await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
  await page.locator('[data-nt-id="ask:ASK-20261018-01"] [data-nt-pick]').click();
  await page.locator('#nt-detail .nt-opt',{hasText:'Change to WATCH'}).click();await page.waitForTimeout(200);
  const clip=await page.evaluate(()=>navigator.clipboard.readText());
  assert.match(clip,/^Tim ruling on ASK-20261018-01 \("Auterion: P2 or Watch\?"\): Change to WATCH\./);
  assert.ok(!posts.some(p=>/needs|ruling|ask/i.test(p||'')),'the page writes nothing');
  // 4. A job item opens the matching queue.
  if(view.items.indexOf('live:jobs-ready')>=0){await page.locator('[data-nt-id="live:jobs-ready"] [data-nt-pick]').click();await page.locator('#nt-detail .nt-go').click();await page.waitForTimeout(300);assert.match(decodeURIComponent(await page.evaluate(()=>location.hash)),/"t":"pipeline".*"p":"APPLY_NOW"/)}
  if(process.env.NEEDS_TIM_SHOTS){await page.locator('#bell').click();await page.waitForTimeout(400);await page.screenshot({path:path.join(process.env.NEEDS_TIM_SHOTS,'needs-tim-desktop-2560.png')})}
  assert.deepStrictEqual(errors,[],'no page errors');await ctx.close();
  // 5. Phone: page renders, decision buttons meet 44 px, no horizontal scroll.
  ({ctx,page,errors}=await open({viewport:{width:402,height:874},deviceScaleFactor:3,isMobile:true,hasTouch:true}));
  await page.evaluate(()=>{location.hash=encodeURIComponent(JSON.stringify({t:'needs-tim'}))});await page.reload();await page.waitForSelector('#view-needs-tim.on .nt-page');await page.waitForTimeout(700);
  const ph=await page.evaluate(()=>({wide:document.documentElement.scrollWidth-innerWidth,small:[...document.querySelectorAll('#view-needs-tim .nt-opt,#view-needs-tim .nt-foot button')].filter(b=>b.offsetParent&&b.getBoundingClientRect().height<44).length}));
  assert.strictEqual(ph.wide,0,'no horizontal scroll on phone');assert.strictEqual(ph.small,0,'phone buttons are at least 44 px tall');
  if(process.env.NEEDS_TIM_SHOTS)await page.screenshot({path:path.join(process.env.NEEDS_TIM_SHOTS,'needs-tim-phone.png'),fullPage:false});
  assert.deepStrictEqual(errors,[],'no page errors on phone');await ctx.close();
  await browser.close();server.close();console.log('needs-tim.browser.js: all checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
