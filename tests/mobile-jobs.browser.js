/* Mobile shell Stage 4: Jobs and Status.
   Jobs: 44px search; one row of chips at 390px (Mine / Applied / All, sort, Fields); rows show title, company, location,
   salary, fit, flex, age and score with no clipped badge, no horizontal scroll and no inner scroll box; filters, the sort
   cycle (Score → Salary → Fit → Age), search with "No jobs match.", the Fields sheet (switches, kept after a reload),
   a row opens the job sheet; a landscape phone gets a table with a sticky Title column and header.
   Status: four stages with rates, three waiting queues, the orange Constraint stage from the desktop viewer's own model,
   key numbers, legend and freshness line; when the constraint moves, the new stage gets the highlight ring.
   Run: node tests/mobile-jobs.browser.js  (PIPELINE_PLAYWRIGHT_MODULE / PIPELINE_CHROMIUM as for the other browser tests)
   MOBILE_SHOTS=<dir> also writes screenshots. */
require('./helpers/block-production-writer.cjs'); // no request to the production Writer
const {chromium}=require(process.env.PIPELINE_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),assert=require('assert'),path=require('path');
const repo=path.resolve(__dirname,'..'),shots=process.env.MOBILE_SHOTS;
const MIME={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
let n=0;
const fixture=fs.readFileSync(repo+'/tests/fixtures/master.sample.txt','utf8').split('\n').map(l=>{
  const c=l.split(' | ');if(c.length<10||!/^\d+$/.test(c[0]))return l;
  if(!/^(READY_TO_PURSUE|MANUAL_RESEARCH|SCOUT_INTAKE|DISCOVERY_LEAD|TIM_DECISION_REQUIRED)$/.test(c[4]))return l;
  const i=n++;if(i%2===0)c[4]='TIM_DECISION_REQUIRED';
  const pay=[['190000','230000'],['250000','320000'],null,['150000','180000']][i%4];
  return c.join(' | ')+'; SCOPE_FIT_RAW='+(55+i*4)+'; FIT_CONF=MED'+(pay?'; SALARY_BASE_LOW='+pay[0]+'; SALARY_BASE_HIGH='+pay[1]+'; SALARY_BASIS=FORGE-ESTIMATE':'');
}).join('\n');
// Health + Writer activity as the operations monitor reads them (the constraint case from tests/control-room.test.js).
let enrichRate=0;
function health(){const at=new Date().toISOString();return {ok:true,candidates:400,issues:[],checks:{attention:{ok:true,at},sources:{ok:true,at},boards:{ok:true,at},schedules:{ok:true,at,configured:5,executionVerified:true}},
  emailRecovery:{at,awaitingIntake:2},processFlow:{at,population:{total:10,reconciled:true},queues:{verification:0,enrichment:10,readyForReview:0,blockedClosed:0},
    completion:{verification:{countsAvailable:true,last24h:0,available:true,perHour:0,count36:0,partial:true,startedAt:at},enrichment:{countsAvailable:true,last24h:enrichRate,available:true,perHour:enrichRate,count36:enrichRate*36,partial:true,startedAt:at}}}}}
function activity(){return {ok:true,now:new Date().toISOString(),today:{writes:21},sources:{},pendingReceipts:0,problemReceipts:0,rates36:{intake:{perHour:7}}}}
(async()=>{
  const server=require('http').createServer((req,res)=>{const u=new URL(req.url,'http://localhost'),f=repo+u.pathname;try{res.setHeader('Content-Type',MIME[path.extname(f)]||'text/plain');res.end(fs.readFileSync(f))}catch(e){res.statusCode=404;res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.PIPELINE_CHROMIUM||undefined,args:['--no-sandbox']});
  const phone=(w,h)=>({viewport:{width:w,height:h},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  async function open(opts){
    const ctx=await browser.newContext(opts),page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('px.cfg',JSON.stringify({url:location.origin+'/writer',key:'test-only'}))});
    await ctx.route('**/*',r=>{const q=r.request(),u=q.url();
      if(/\/api\/pipeline-health/.test(u))return r.fulfill({json:health()});if(/\/api\/writer-activity/.test(u))return r.fulfill({json:activity()});
      if(u.startsWith(base+'/writer'))return /action=master/.test(u)?r.fulfill({json:{ok:true,text:fixture,modifiedTime:new Date().toISOString(),fetchedAt:new Date().toISOString()}}):r.fulfill({json:{ok:true}});
      if(u.startsWith(base))return r.continue();return r.abort()});   // nothing leaves the test, the production Writer included
    await page.goto(base+'/pipeline.html');await page.waitForSelector('#m-pane-decide .m-card');
    return {ctx,page,errors};
  }

  // 1. Jobs at 390x844: search, one chip row, full rows, no sideways scroll, no inner scroll box.
  let {ctx,page,errors}=await open(phone(390,844));
  await page.click('#m-tab-jobs');await page.waitForSelector('#m-jobs-list .m-row');
  const lay=await page.evaluate(()=>{const s=document.querySelector('.m-search').getBoundingClientRect(),chips=[...document.querySelectorAll('.m-jobchips .m-chip')].map(c=>c.getBoundingClientRect());
    let el=document.getElementById('m-jobs-list'),inner=[];while(el&&el!==document.body){const o=getComputedStyle(el).overflowY;if(/auto|scroll/.test(o))inner.push(el.id||el.className);el=el.parentElement}
    return {search:Math.round(s.height),oneRow:chips.every(c=>Math.abs(c.top-chips[0].top)<1),right:Math.round(Math.max(...chips.map(c=>c.right))),labels:[...document.querySelectorAll('.m-jobchips .m-chip')].map(c=>c.textContent),inner,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}});
  assert.strictEqual(lay.search,44,'search field 44px');assert.ok(lay.oneRow,'chips on one row');assert.ok(lay.right<=390-12,'chips fit inside the 12px gutter ('+lay.right+')');
  assert.deepStrictEqual(lay.labels,['Mine','Applied','All','Score ↓','Fields']);assert.deepStrictEqual(lay.inner,[],'no inner scroll container');assert.ok(lay.sw<=lay.cw,'no horizontal scroll');
  const rows=await page.evaluate(()=>[...document.querySelectorAll('#m-jobs-list .m-row')].map(r=>{const rb=r.getBoundingClientRect(),bs=[...r.querySelectorAll('.m-b')];
    return {h:Math.round(rb.height),title:!!r.querySelector('.m-title').textContent,sub:(r.querySelector('.m-sub')||{}).textContent||'',score:!!r.querySelector('.m-score b'),badges:bs.length,
      clipped:bs.filter(b=>b.scrollWidth>b.clientWidth+1||b.getBoundingClientRect().right>rb.right+0.5).length}}));
  assert.ok(rows.length>=3,'rows listed');assert.ok(rows.every(r=>r.h>=76),'rows >= 76px');assert.ok(rows.every(r=>r.title&&r.score&&/ · /.test(r.sub)),'title, score, company · location on every row');
  assert.ok(rows.every(r=>r.badges>=4),'salary, fit, flex and age badges on every row');assert.ok(rows.every(r=>!r.clipped),'no badge clipped');
  assert.deepStrictEqual(await page.evaluate(()=>[...document.querySelectorAll('#m-root .m-b.caution')].map(b=>b.textContent.trim()).filter(t=>/^(Age|Fit|Flex)$/.test(t))),[],'unknown badges say what is unknown');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#m-jobs-list .m-b')].every(b=>getComputedStyle(b).textTransform==='none')),'badges keep their case in Jobs rows');
  if(shots)await page.screenshot({path:path.join(shots,'stage4-jobs-390x844.png')});
  // 2. Filters: Mine = the Decide queue; Applied rows say Applied; All holds more.
  const count=async()=>parseInt(await page.textContent('#m-jobcount'),10);
  const mine=await count(),decide=parseInt(await page.textContent('.m-count b'),10);assert.strictEqual(mine,decide,'Mine matches Decide');
  await page.click('[data-m-jf="applied"]');const applied=await count();assert.ok(applied>=1,'applied jobs listed');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#m-jobs-list .m-row')].every(r=>/Applied/.test(r.textContent))),'every Applied row shows ✓ Applied');
  await page.click('[data-m-jf="all"]');const all=await count();assert.ok(all>mine&&all>=applied,'All holds more ('+all+')');
  // 3. Sort cycle and score order.
  const scores=()=>page.$$eval('#m-jobs-list .m-row .m-score b',bs=>bs.map(b=>parseInt(b.textContent,10)).filter(x=>!isNaN(x)));
  const s0=await scores();assert.deepStrictEqual(s0,[...s0].sort((a,b)=>b-a),'Score ↓ order');
  const cyc=[];for(let i=0;i<4;i++){await page.click('#m-sort');cyc.push(await page.textContent('#m-sort'))}
  assert.deepStrictEqual(cyc,['Salary ↓','Fit ↓','Age ↑','Score ↓'],'sort cycles');
  // 4. Search keeps focus while typing; nonsense gives "No jobs match."
  await page.fill('#m-q','');await page.type('#m-q','operations',{delay:30});await page.waitForTimeout(400);
  assert.strictEqual(await page.evaluate(()=>document.activeElement.id),'m-q','focus stays in the search box');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#m-jobs-list .m-row')].every(r=>/operations/i.test(r.textContent))),'search filters rows');
  await page.fill('#m-q','zzzz-nothing');await page.waitForTimeout(400);assert.strictEqual((await page.textContent('#m-jobs-list')).trim(),'No jobs match.');
  await page.fill('#m-q','');await page.waitForTimeout(300);
  // 5. Fields sheet: switches, kept after a reload, Escape closes.
  await page.click('#m-fields-btn');await page.waitForSelector('#m-fields:not([hidden])');
  assert.deepStrictEqual(await page.$$eval('#m-fields [role=switch]',b=>b.map(x=>x.textContent+':'+x.getAttribute('aria-checked'))),['Salary:true','Location:true','Fit:true','Flex:true','Age:true','Company:true']);
  if(shots)await page.screenshot({path:path.join(shots,'stage4-fields-390x844.png')});
  await page.click('[data-m-field="fit"]');assert.strictEqual(await page.getAttribute('[data-m-field="fit"]','aria-checked'),'false');
  await page.keyboard.press('Escape');assert.ok(await page.isHidden('#m-fields'),'Escape closes the Fields sheet');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#m-jobs-list .m-b')].every(b=>!/Fit/.test(b.textContent))),'Fit hidden from rows');
  await page.reload();await page.waitForSelector('#m-pane-decide .m-card');await page.click('#m-tab-jobs');await page.waitForSelector('#m-jobs-list .m-row');
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('#m-jobs-list .m-b')].every(b=>!/Fit/.test(b.textContent))),'Fields choice kept after a reload');
  await page.click('#m-fields-btn');await page.click('[data-m-field="fit"]');await page.keyboard.press('Escape');
  // 6. A row opens the job sheet; Back returns to Jobs.
  await page.click('#m-jobs-list .m-row');await page.waitForSelector('#m-detail:not([hidden])');await page.goBack();await page.waitForTimeout(200);
  assert.ok(await page.isHidden('#m-detail')&&await page.isVisible('#m-jobs-list'),'row opens the sheet, Back returns to Jobs');
  // 7. Text sizes.
  const small=await page.evaluate(()=>[...document.querySelectorAll('#m-pane-jobs *')].filter(e=>e.offsetParent&&!e.closest('.m-sr')&&[...e.childNodes].some(x=>x.nodeType===3&&x.textContent.trim())&&parseFloat(getComputedStyle(e).fontSize)<12).map(e=>e.textContent.trim().slice(0,20)));
  assert.deepStrictEqual(small,[],'no Jobs text under 12px');

  // 8. Status: stages, waiting, constraint (Enrichment: 0 jobs/hr with 10 waiting), numbers, legend, freshness.
  await page.click('#m-tab-status');await page.waitForFunction(()=>document.querySelectorAll('#m-pane-status .m-stage').length===4,null,{timeout:20000});
  await page.waitForFunction(()=>document.querySelector('#m-pane-status .m-constraint'),null,{timeout:20000});
  const st=await page.evaluate(()=>({names:[...document.querySelectorAll('.m-stage-t b')].map(b=>b.textContent),links:document.querySelectorAll('.m-flow .m-wait').length,
    constraint:(document.querySelector('.m-constraint .m-stage-t b')||{}).textContent,cword:(document.querySelector('.m-constraint .m-stage-s')||{}).textContent,cglyph:!!document.querySelector('.m-constraint .m-stage-s svg'),
    border:getComputedStyle(document.querySelector('.m-constraint')).borderTopColor,tiles:[...document.querySelectorAll('.m-tile .m-label')].map(t=>t.textContent),
    legend:[...document.querySelectorAll('.m-legend li')].map(l=>l.textContent+(l.querySelector('svg')?'+glyph':'')),fresh:document.querySelector('.m-fresh').textContent}));
  assert.deepStrictEqual(st.names,['Discovery','Intake','Enrichment','Your decisions']);assert.strictEqual(st.links,3,'three waiting queues between stages');
  assert.strictEqual(st.constraint,'Enrichment','constraint from the desktop model');assert.ok(/Constraint/.test(st.cword)&&st.cglyph,'Constraint word and glyph');
  assert.strictEqual(st.border,'rgb(232, 134, 42)','orange constraint border');
  assert.strictEqual(await page.evaluate(()=>document.querySelector('.m-tile b').textContent.trim()),String(decide),'Need decision tile = the Decide count');assert.deepStrictEqual(st.tiles,['Need decision','Applied','Interviews']);
  assert.deepStrictEqual(st.legend,['OK+glyph','Caution+glyph','Constraint+glyph','Fault+glyph']);assert.match(st.fresh,/SYNC/,'freshness line');
  assert.match(await page.evaluate(()=>document.querySelector('#m-pane-status details .m-sec-b').textContent),/open-record jobs accounted for/,'Details text intact');
  if(shots)await page.screenshot({path:path.join(shots,'stage4-status-390x844.png'),fullPage:true});
  // 9. The constraint moves (enrichment now faster than intake): the new constraint stage gets the highlight ring.
  enrichRate=20;await page.waitForFunction(()=>{const c=document.querySelector('#m-pane-status .m-constraint .m-stage-t b');return c&&c.textContent==='Intake'},null,{timeout:80000});   // the operations monitor re-reads health every 60 s
  assert.ok(await page.$('#m-pane-status .m-constraint.m-flash'),'moved constraint is highlighted');enrichRate=0;
  assert.deepStrictEqual(errors,[],'no page errors');await ctx.close();

  // 10. Landscape phone: a table with sticky Title column and header, no page-level sideways scroll.
  ({ctx,page,errors}=await open(phone(844,390)));
  await page.click('#m-tab-jobs');await page.click('[data-m-jf="all"]');await page.waitForSelector('#m-jobs-list table');
  const tb=await page.evaluate(()=>{const th=document.querySelector('.m-table thead th'),tr=document.querySelector('.m-table tbody th');
    return {cols:[...document.querySelectorAll('.m-table thead th')].map(x=>x.textContent),headSticky:getComputedStyle(th).position,titleSticky:getComputedStyle(tr).position,left:getComputedStyle(tr).left,
      sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}});
  assert.deepStrictEqual(tb.cols,['Title','Company','Location','Salary','Fit','Flex','Score','Age'],'table columns');
  const vis=await page.evaluate(()=>{const w=document.querySelector('.m-table-wrap').getBoundingClientRect();return [...document.querySelectorAll('.m-table thead th')].filter(t=>t.getBoundingClientRect().right<=w.right+0.5).map(t=>t.textContent)});
  ['Title','Company','Location','Salary','Fit','Flex','Score','Age'].forEach(c=>assert.ok(vis.includes(c),c+' column visible at 844px without scrolling ('+vis+')'));
  const chip=await page.evaluate(()=>{const b=document.querySelector('[data-m-jf="all"]'),c=getComputedStyle(b);return [c.backgroundColor,c.color]});
  assert.deepStrictEqual(chip,['rgb(217, 217, 217)','rgb(11, 11, 11)'],'active chip light with dark text at once');
  assert.strictEqual(tb.headSticky,'sticky');assert.strictEqual(tb.titleSticky,'sticky');assert.strictEqual(tb.left,'0px','Title column sticks left');assert.ok(tb.sw<=tb.cw,'no page sideways scroll');
  const ls=await page.evaluate(()=>{const tabs=document.querySelector('.m-tabs').getBoundingClientRect(),top=document.querySelector('.m-table thead').getBoundingClientRect().bottom;
    const full=[...document.querySelectorAll('.m-table tbody tr')].filter(r=>{const b=r.getBoundingClientRect();return b.top>=top-0.5&&b.bottom<=tabs.top+0.5}).length;
    const sc=document.querySelector('.m-table td.m-num');
    return {full,tabH:Math.round(tabs.height),names:[...document.querySelectorAll('#m-root [role=tab]')].map(t=>t.textContent.trim()),labelsShown:[...document.querySelectorAll('#m-root [role=tab] span')].some(x=>x.getBoundingClientRect().width>1),
      search:document.querySelector('.m-search').getBoundingClientRect().height,count:document.getElementById('m-jobcount-l').getBoundingClientRect().height>0,chipRow:Math.round(document.querySelector('.m-jobchips').getBoundingClientRect().height),
      scoreWeight:getComputedStyle(sc).fontWeight,city:document.querySelector('.m-table tbody .m-clip[title*=","]')?document.querySelector('.m-table tbody .m-clip[title*=","]').textContent:''}});
  assert.ok(ls.full>=4,'landscape shows at least 4 full job rows at rest ('+ls.full+')');assert.strictEqual(ls.tabH,44,'landscape tab bar 44px');
  // Fit cells keep their glyph in the table (the cell drops the word "Fit", not the meaning): strong fits are "✓ 79", not a bare "79".
  const fitCells=await page.evaluate(()=>{const i=[...document.querySelectorAll('.m-table thead th')].findIndex(t=>t.textContent==='Fit');
    return [...document.querySelectorAll('.m-table tbody tr')].map(r=>r.children[i]).filter(c=>c&&c.textContent.trim()).map(c=>({t:c.textContent.trim(),g:!!c.querySelector('svg.m-g'),cls:(c.querySelector('.m-b')||{}).className}))});
  assert.ok(fitCells.length,'the table shows fit cells');
  fitCells.forEach(c=>{assert.ok(c.g||/^~/.test(c.t),'fit cell has a glyph or "~": '+JSON.stringify(c));assert.ok(!/Fit/.test(c.t),'the cell drops the word Fit: '+c.t);
    if(/^\d+$/.test(c.t)&&+c.t>=70)assert.strictEqual(c.cls,'m-b ok','strong fit cell is green: '+JSON.stringify(c))});
  assert.deepStrictEqual(ls.names,['Decide','Jobs','Status'],'tabs keep their names for screen readers');assert.ok(!ls.labelsShown,'tab labels hidden visually in landscape');
  assert.strictEqual(ls.search,0,'search box tucked behind the header icon');assert.ok(ls.count,'job count in the chip row');assert.strictEqual(ls.chipRow,36,'chips and count on one 36px row');
  assert.strictEqual(ls.scoreWeight,'600','Score column as heavy as the portrait score');assert.ok(ls.city&&!/,/.test(ls.city),'table shows the city without the state ('+ls.city+')');
  await page.click('#m-search');assert.ok(await page.evaluate(()=>document.activeElement.id==='m-q'&&document.querySelector('.m-search').getBoundingClientRect().height===44),'header search opens the search box');
  await page.evaluate(()=>document.activeElement.blur());await page.waitForTimeout(100);
  if(shots)await page.screenshot({path:path.join(shots,'stage4-jobs-landscape-844x390.png')});
  assert.deepStrictEqual(errors,[],'no page errors (landscape)');await ctx.close();
  // 11. Reduced motion: the constraint highlight ring does not animate.
  ({ctx,page,errors}=await open({...phone(390,844),reducedMotion:'reduce'}));await page.click('#m-tab-status');
  await page.waitForFunction(()=>document.querySelector('#m-pane-status .m-constraint'),null,{timeout:20000});
  assert.strictEqual(await page.evaluate(()=>{const c=document.querySelector('#m-pane-status .m-constraint');c.classList.add('m-flash');return getComputedStyle(c).animationName}),'none','reduced motion: no highlight ring animation');
  assert.deepStrictEqual(errors,[],'no page errors (reduced motion)');await ctx.close();
  await browser.close();server.close();console.log('mobile-jobs: all checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
