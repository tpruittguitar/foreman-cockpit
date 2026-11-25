const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../pipeline-engine-status');
const T=require('../pipeline-explorer-tabs');

// Reuse the committed PR 2 fixtures and the PR 1 clock (AT = Nov 24, 2:15 PM ET). No new envelope.
const FX=path.join(__dirname,'fixtures/engine-status');
const load=name=>JSON.parse(fs.readFileSync(path.join(FX,name+'.json'),'utf8'));
const AT_MS=Date.parse('2026-11-24T14:15:00-05:00'),MIN=60000,HOUR=60*MIN;
const populated=()=>E.evaluate(load('populated'),AT_MS+5*MIN);
const TABS=['constraints','steps','engine-health'];
const html=(tab,r)=>T.render(tab,r);
// [id, state] for each step a page shows, from the data attributes the renderer writes.
function stepsOn(h){return [...h.matchAll(/<(?:li|tr|article)[^>]*data-ex-step="([^"]*)"[^>]*data-ex-state="([^"]*)"/g)].map(m=>[m[1],m[2]]);}
const uniq=a=>[...new Map(a.map(x=>[x[0],x])).values()];

test('routes and fixture clock',()=>{
 assert.deepEqual(T.ROUTES,['constraints','steps','engine-health']);
 assert.equal(T.API,'/api/engine-status');
 assert.equal(T.FIXTURE,'tests/fixtures/engine-status/populated.json');
 assert.equal(T.FIXTURE_NOW,AT_MS+5*MIN);
});

test('same 19 ids, names and states on all three tabs for the populated fixture',()=>{
 const r=populated(),want=r.steps.map(s=>[s.id,T.stateOf(s)]);
 assert.equal(want.length,19);
 for(const tab of TABS){
  const h=html(tab,r),got=uniq(stepsOn(h));
  assert.deepEqual(got,want,tab);
  for(const s of r.steps)assert.ok(h.includes(s.name.replace(/&/g,'&amp;')),tab+' shows '+s.name);
 }
 const st=Object.fromEntries(want);
 assert.equal(st.boards,'degraded');assert.equal(st.expfit,'constraint');assert.equal(st.descfetch,'ok','07 Description fetch is OK, not idle');
 assert.equal(Object.values(st).filter(x=>x==='constraint').length,1);
 assert.match(html('engine-health',r),/OK · 0 needed/);
});

test('constraint is 15 Experience fit on the Enrichment plate; the only GROWING queue is postedpay',()=>{
 const r=populated(),h=html('constraints',r);
 assert.equal(r.constraint.n,15);assert.equal(r.constraint.name,'Experience fit');
 assert.equal((h.match(/ex-badge-red">CONSTRAINT/g)||[]).length,1);
 assert.match(h,/<section class="ex-plate ex-p-constraint" data-ex-stage="ENRICHMENT"[^>]*18 jobs per hour out, 40 per hour in, CONSTRAINT/);
 assert.match(h,/<section class="ex-plate ex-p-ok" data-ex-stage="DISCOVERY"/);assert.match(h,/<section class="ex-plate ex-p-ok" data-ex-stage="INTAKE"/);
 assert.match(h,/data-ex-queue="ENRICHMENT" data-ex-step="postedpay" data-ex-trend="GROWING"[^>]*><span class="ex-label">QUEUE<\/span><span class="ex-qv">118<\/span><span class="ex-qd">\+22\/h<\/span><span class="ex-qd">▲ GROWING<\/span>/);
 assert.match(h,/class="ex-queue ex-grow" data-ex-queue="ENRICHMENT"/);
 assert.match(h,/data-ex-queue="INTAKE" data-ex-step="fields" data-ex-trend="STEADY"[^>]*>.*?<span class="ex-qd">STEADY<\/span>/);
 assert.equal((h.match(/ex-grow/g)||[]).length,1);
 assert.deepEqual(r.growingQueues.map(s=>s.id),['postedpay']);
 assert.match(h,/18 ROWS\/H SAVED/);assert.match(h,/WRITER - SAVES ROWS, NOT A STAGE/);
 assert.match(h,/data-ex-scored[^>]*><span class="ex-qv">18\/h<\/span>/);
});

test('ready for decision: only count, applied, declined; never a constraint; nothing invented',()=>{
 const env=load('populated');env.readyForDecision={count:42,applied:27,declined:311,rateIn:500,rateOut:0,emailRejections:9,questions:2};
 const r=E.evaluate(env,AT_MS+5*MIN),h=html('constraints',r);
 assert.equal(r.constraint.n,15);
 const ready=h.slice(h.indexOf('data-ex-ready'),h.indexOf('</section>',h.indexOf('data-ex-ready')));
 assert.match(ready,/<div class="ex-kpi">42<\/div>/);assert.match(ready,/Applied<\/span><b>27/);assert.match(ready,/Declined<\/span><b>311/);
 assert.doesNotMatch(ready,/CONSTRAINT|500|Email rejections|Questions/);
 for(const tab of TABS){const x=html(tab,r);assert.doesNotMatch(x,/\bGATE\b|Intake gate|Constraint watch|emailRejections|Email rejections|Questions for you|width:\s*\d+%|ex-meter/,tab);assert.doesNotMatch(x,/questions/i,tab);}
});

test('VIEW WAITING JOBS opens the existing Waiting for my decision preset',()=>{
 assert.match(html('constraints',populated()),/<button type="button" class="ex-btn" data-go="pipeline" data-preset="DECISION_READY">VIEW WAITING JOBS<\/button>/);
});

test('ok shows no banner and never stale or expired copy',()=>{
 for(const tab of TABS){const h=html(tab,populated());assert.doesNotMatch(h,/ex-banner|STALE|No engine status|over 24 h|Steps are unknown|Engine status not available|No steps reported yet/,tab);}
});

test('stale keeps the numbers with the exact copy',()=>{
 const r=E.evaluate(load('populated'),AT_MS+2*HOUR);assert.equal(r.status,'stale');
 for(const tab of TABS){
  const h=html(tab,r);
  assert.match(h,/<div class="ex-banner ex-b-stale" role="status"><b class="ex-glyph">STALE · as of Nov 24, 2:15 PM ET<\/b><\/div>/,tab);
  assert.equal(uniq(stepsOn(h)).length,19,tab);
 }
 const h=html('constraints',r);assert.match(h,/ex-qv">118</);assert.match(h,/ex-badge-stale">STALE/);assert.match(h,/ex-kpi">42</);
});

test('expired: exact copy, no current steps, numbers or constraint',()=>{
 const r=E.evaluate(load('expired'),AT_MS);assert.equal(r.status,'expired');
 for(const tab of TABS){
  const h=html(tab,r);
  assert.match(h,/<b class="ex-glyph">No engine status<\/b><p>Last update over 24 h ago \(as of Nov 23, 1:40 PM ET\)\. Steps are unknown\.<\/p>/,tab);
  assert.deepEqual(stepsOn(h),[],tab);assert.doesNotMatch(h,/ex-badge-red">CONSTRAINT|data-ex-state="constraint"|ex-grow|\b(118|311|42|27)\b|ROWS\/H SAVED/,tab);
 }
 assert.match(html('constraints',r),/data-go="pipeline" data-preset="DECISION_READY" disabled>/);
});

test('empty: "No steps reported yet", no invented counts',()=>{
 const r=E.evaluate(load('empty'),AT_MS+MIN);assert.equal(r.status,'empty');
 for(const tab of TABS){
  const h=html(tab,r);
  assert.match(h,/<div class="ex-banner ex-b-empty" role="status"><b class="ex-glyph">—<\/b><p>No steps reported yet<\/p><\/div>/,tab);
  assert.deepEqual(stepsOn(h),[]);assert.doesNotMatch(h,/\b19 STEPS|ex-badge-red">CONSTRAINT|data-ex-state="constraint"|ex-kpi">\d/,tab);
 }
});

test('error, invalid fixture and a failed fetch: exact copy, no constraint, no numbers',async()=>{
 const results=[E.evaluate(load('invalid'),AT_MS),T.render('constraints',null)&&E.evaluate(null,AT_MS),await T.load({fetch:async()=>{throw Error('offline')},location:{search:''}}),await T.load({fetch:async()=>new Response('<html>',{status:200}),location:{search:''}})];
 for(const r of results){
  assert.equal(r.status,'error');
  for(const tab of TABS){
   const h=html(tab,r);
   assert.match(h,/<div class="ex-banner ex-b-error" role="alert"><b class="ex-glyph">Engine status not available<\/b><\/div>/,tab);
   assert.deepEqual(stepsOn(h),[]);assert.doesNotMatch(h,/ex-badge-red">CONSTRAINT|data-ex-state="constraint"|ex-grow|ex-kpi">\d|ex-qv">\d|ROWS\/H SAVED/,tab);
  }
 }
 assert.match(html('steps',null),/Engine status not available/);
});

test('unknown steps show UNKNOWN on all tabs and are not chosen; missed and failed stay visible and red',()=>{
 const env=load('populated');
 Object.assign(env.steps.find(s=>s.id==='websearch'),{state:'missed',result:'MISSED RUN'});
 Object.assign(env.steps.find(s=>s.id==='degreepay'),{rateOut:null});
 const r=E.evaluate(env,AT_MS+5*MIN);
 assert.equal(r.constraint,null,'15 is fed by unknown 14');
 for(const tab of TABS){
  const st=Object.fromEntries(uniq(stepsOn(html(tab,r))));
  assert.equal(st.degreepay,'unknown',tab);assert.equal(st.websearch,'missed',tab);assert.equal(st.expfit,'ok',tab);
  assert.equal(Object.keys(st).length,19);
 }
 assert.match(html('steps',r),/ex-big ex-s-unknown/);
 assert.match(html('engine-health',r),/<tr class="ex-r-red" data-ex-step="websearch" data-ex-state="missed">/);
 assert.match(html('engine-health',r),/class="ex-card ex-c-red" data-ex-step="websearch"/);
 assert.doesNotMatch(html('constraints',r),/ex-badge-red/);
 const f=load('populated');Object.assign(f.steps.find(s=>s.id==='degreepay'),{state:'failed',rateOut:10});
 const rf=E.evaluate(f,AT_MS+5*MIN);assert.equal(rf.constraint.id,'degreepay');
 assert.match(html('engine-health',rf),/<tr class="ex-r-red" data-ex-step="degreepay" data-ex-state="constraint">/);
});

test('engine health: table and stacked cards, ET times from ISO, Writer outside the flow',()=>{
 const h=html('engine-health',populated());
 assert.match(h,/ENGINE HEALTH · SCRIPTS AND AUTOMATIONS/);
 assert.match(h,/17 OK<\/span> · <span class="ex-amber">1 DEGRADED<\/span> · <span class="ex-red">1 CONSTRAINT<\/span> · <span>0 FAILED<\/span> · <span>0 MISSED RUNS/);
 assert.deepEqual([...h.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(m=>m[1]),['ENGINE','RUNS AS','METHOD','SCHEDULE','LAST RUN','RESULT','NEXT']);
 assert.match(h,/data-ex-step="jobspy"[^]*?<td class="ex-mono">2:03 PM ET<\/td>[^]*?<td class="ex-mono">2:33 PM ET<\/td>/);
 assert.match(h,/<tr class="ex-r-amber" data-ex-step="boards"/);
 assert.match(h,/OUTSIDE THE FLOW[^]*data-ex-writer[^]*18 rows\/h/);
 assert.match(h,/<div class="ex-cards">/);
 assert.match(html('steps',populated()),/19 STEPS — CURRENT STATE/);
 assert.match(html('steps',populated()),/aria-label="Legend: OK, DEGRADED, CONSTRAINT, NOT NEEDED, IDLE"/);
});

test('render takes an injected result; load uses the API by default and the fixture only on fixture=mockup',async()=>{
 const seen=[];
 const fetcher=async u=>{seen.push(u);return new Response(u===T.FIXTURE?fs.readFileSync(path.join(FX,'populated.json'),'utf8'):JSON.stringify(E.evaluate(load('empty'),AT_MS)));};
 assert.equal((await T.load({fetch:fetcher,location:{search:''}})).status,'empty');
 const r=await T.load({fetch:fetcher,location:{search:'?fixture=mockup'}});
 assert.equal(r.status,'ok');assert.equal(r.constraint.n,15);
 assert.deepEqual(seen,['/api/engine-status',T.FIXTURE]);
});

test('Jobs page untouched: mounts are new empty siblings; navigation keeps the seven Pipeline pages first',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8');
 assert.match(page,/<div class="view" id="view-needs-tim"><\/div>\n  <div class="view" id="view-constraints" tabindex="0" aria-label="Constraints"><\/div>\n  <div class="view" id="view-steps" tabindex="0" aria-label="Steps"><\/div>\n  <div class="view" id="view-engine-health" tabindex="0" aria-label="Engine health"><\/div>\n<\/main>/);
 assert.ok(page.indexOf('id="view-pipeline"')<page.indexOf('id="view-constraints"'));
 assert.match(page,/<link rel="stylesheet" href="tokens.css">\n<link rel="stylesheet" href="pipeline-explorer-tabs.css">/);
 assert.match(page,/<script src="pipeline-navigation.js"><\/script>\n<script src="pipeline-engine-status.js"><\/script>\n<script src="pipeline-explorer-tabs.js"><\/script>/);
 const nav=fs.readFileSync(path.join(__dirname,'../pipeline-navigation.js'),'utf8');
 assert.ok(nav.includes("items:[['Jobs','pipeline'],['Review queue','pipeline','NEEDS_TIM'],['Decline candidates','pipeline','DECLINE_CANDIDATES'],['My rulings','pipeline','RULED'],['Map','map'],['Trends','reports'],['Compare','pipeline',null,'compare'],['Constraints','constraints'],['Steps','steps'],['Engine health','engine-health']]"));
 assert.match(nav,/constraints:'pipeline',steps:'pipeline','engine-health':'pipeline'/);
 const src=fs.readFileSync(path.join(__dirname,'../pipeline-explorer-tabs.js'),'utf8');
 assert.doesNotMatch(src,/view-pipeline|#presets|#filters|section-tabs|PRESETS/);
 const css=fs.readFileSync(path.join(__dirname,'../pipeline-explorer-tabs.css'),'utf8');
 for(const rule of css.replace(/\/\*[^]*?\*\//g,'').split('}').map(x=>x.split('{')[0].trim()).filter(x=>x&&!x.startsWith('@media')))
  for(const sel of rule.replace(/^@media[^{]*\{/,'').split(/,(?![^(]*\))/))assert.match(sel.trim(),/\.ex-root/,'scoped: '+sel);
 assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b|rgba?\(|@import|font-family:\s*(?!var\()["a-z]/i,'tokens only');
});

// ---------- PR 3 fix round 1 (GUI review of PR 559) ----------
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('fix 2: switchTab hides #mapfilters on the three new pages, the same way it hides #presets, and keeps it on Jobs and Map',()=>{
 const page=read('pipeline.html'),i=page.indexOf('function switchTab('),sw=page.slice(i,page.indexOf('\n',i));
 assert.ok(sw.includes("$('presets').style.display=t==='pipeline'?'flex':'none';$('mapfilters').style.display=PipelineExplorerTabs.ROUTES.indexOf(t)>=0?'none':'';"));
 // The same expression, run per route: hidden on the three new pages, back to the stylesheet ('') on Jobs and Map (map runs as t='pipeline').
 const expr=new Function('PipelineExplorerTabs','t',"return PipelineExplorerTabs.ROUTES.indexOf(t)>=0?'none':'';");
 for(const t of T.ROUTES)assert.equal(expr(T,t),'none',t);
 for(const t of ['pipeline','reports','automations','settings'])assert.equal(expr(T,t),'',t);
});

test('fix 3: a hash naming Constraints, Steps or Engine health opens that page on the phone; More lists all three',()=>{
 for(const t of T.ROUTES){
  const hash='#'+encodeURIComponent(JSON.stringify({t,p:'OPEN',s:'score',f:{}}));
  assert.equal(T.routeFromHash(hash),t,t);
  assert.equal(T.routeFromHash(hash.slice(1)),t,t+' without #');
 }
 for(const h of ['','#',null,'#'+encodeURIComponent(JSON.stringify({t:'pipeline'})),'#'+encodeURIComponent(JSON.stringify({t:'decide'})),'#not-json'])assert.equal(T.routeFromHash(h),null,String(h));
 assert.deepEqual(T.PHONE_MORE.map(m=>m[0]),T.ROUTES);
 assert.deepEqual(T.PHONE_MORE.map(m=>m[1]),['Constraints','Steps','Engine health']);
 const mob=read('pipeline-mobile.js');
 assert.ok(mob.includes("].concat(root.PipelineExplorerTabs ? root.PipelineExplorerTabs.PHONE_MORE : []);"),'More sheet lists the three routes');
 assert.match(mob,/\['backlog', 'Discovery backlog'[^]*\['settings', 'Settings'/,'existing More items kept');
 assert.ok(mob.includes("var TABS = [['decide', 'Decide'], ['jobs', 'Jobs'], ['status', 'Status']];"),'Decide, Jobs, Status kept');
 assert.ok(mob.includes("setTab('decide'); refresh();\n    /* A link to Constraints, Steps or Engine health opens that page, not Decide; Mobile returns to the shell. */\n    var deep = root.PipelineExplorerTabs && root.PipelineExplorerTabs.routeFromHash(root.location && root.location.hash);\n    if (deep) openDesktop(deep);"),'mount opens the hashed page after Decide');
 const page=read('pipeline.html');
 // The phone path is the existing m-legacy bridge, which falls through to switchTab(k) for these keys.
 assert.ok(page.includes("if(k==='compare'){switchTab('pipeline');var c=$('compare-open');if(c)c.click();return}switchTab(k)}"));
 assert.ok(page.indexOf('<script src="pipeline-explorer-tabs.js">')<page.indexOf('<script src="pipeline-mobile.js">'),'tabs module loads before the phone shell');
});

test('fix 6: every new page scroller is a keyboard tab stop with a name',()=>{
 const page=read('pipeline.html');
 for(const [id,name] of [['constraints','Constraints'],['steps','Steps'],['engine-health','Engine health']])
  assert.ok(page.includes('<div class="view" id="view-'+id+'" tabindex="0" aria-label="'+name+'"></div>'),id);
});

test('fix 1 and 7: Steps squares wrap inside their stage plate; CONSTRAINT badge uses a light label from tokens',()=>{
 const css=read('pipeline-explorer-tabs.css'),tok=read('tokens.css');
 assert.ok(css.includes('.ex-root .ex-squares { display: flex; flex-wrap: wrap;'));
 assert.match(css,/\.ex-root \.ex-stage-group \{[^}]*flex: 1 1 auto; min-width: 0;/);
 assert.ok(css.includes('.ex-root .ex-badge-red { background: var(--pe-badge-red); color: var(--pe-text-primary);'));
 const hex=n=>tok.match(new RegExp('--pe-'+n+':\\s*(#[0-9A-Fa-f]{6})'))[1];
 const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 assert.ok(ratio(hex('text-primary'),hex('badge-red'))>=4.5,'CONSTRAINT label contrast');
 assert.match(html('constraints',populated()),/<span class="ex-badge ex-badge-red">CONSTRAINT<\/span>/,'the word stays');
});

test('fix 8: as-of and clock times end in ET, once',()=>{
 const ex=E.evaluate(load('expired'),AT_MS);
 assert.equal(ex.copyDetail,'Last update over 24 h ago (as of Nov 23, 1:40 PM). Steps are unknown.','PR 1 copy unchanged');
 for(const tab of TABS)assert.ok(html(tab,ex).includes('(as of Nov 23, 1:40 PM ET). Steps are unknown.'),tab);
 const st=E.evaluate(load('populated'),AT_MS+2*HOUR);
 for(const tab of TABS){const h=html(tab,st);assert.equal((h.match(/as of Nov 24, 2:15 PM ET/g)||[]).length,1,tab);assert.doesNotMatch(h,/ET ET/,tab);}
 const h=html('engine-health',populated());
 assert.match(h,/data-ex-step="jobspy"[^]*?2:03 PM ET[^]*?2:33 PM ET/);
 assert.ok(h.includes('· last 2:03 PM ET · next 2:33 PM ET'),'stacked cards too');
 assert.doesNotMatch(h,/ET ET/);
 assert.equal(T.asOfEt('STALE · as of Nov 24, 2:15 PM ET'),'STALE · as of Nov 24, 2:15 PM ET');
 assert.equal(T.asOfEt('(as of Nov 23, 1:40 PM)'),'(as of Nov 23, 1:40 PM ET)');
 for(const r of [E.evaluate(load('empty'),AT_MS+MIN),E.evaluate(null,AT_MS)])for(const tab of TABS)assert.doesNotMatch(html(tab,r),/\bET\b|\d:\d\d/,tab+' '+r.status);
});

test('fix 5: the section strip wraps between 761 and 1279 px and shows its scrollbar on phones',()=>{
 const nav=read('pipeline-navigation.js');
 assert.ok(nav.includes('@media(min-width:761px) and (max-width:1279px){#section-tabs{overflow-x:visible}#section-tabs .st-row{flex-wrap:wrap}}'));
 assert.ok(nav.includes('@media(max-width:760px){#section-tabs{scrollbar-width:thin;'));
});
