const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../pipeline-control-room.js');
const now=Date.parse('2026-10-29T00:00:00Z'),at='2026-10-28T23:45:00Z';
const row=(id,run,bucket='SCOUT_INTAKE',date='2026-10-28')=>({PRIMARY_ID:id,BUCKET:bucket,payload:{SCOUT_RUN_ID:run,DATE_ADDED:date}});
function fixture(){return {now,health:{ok:true,candidates:400,checks:{attention:{ok:true,at},sources:{ok:true,at},boards:{ok:true,at},schedules:{ok:true,at,configured:5,executionVerified:true}},issues:[]},master:{loaded:true,freshness:'FRESH',rows:[]},activity:{ok:true,today:{writes:21},sources:{'Pay enrichment (GitHub)':{updates:7}},pendingReceipts:0,problemReceipts:0},operations:{runs:{one:{}},obligations:{}},writer:{queue:{pending:0}}};}
test('latched intake dominates idle Writer and useful updates; banner is never falsely healthy',()=>{
 const f=fixture();f.health.issues.push({level:'BLOCKING',title:'AUTO intake stopped',detail:'Earlier run unfinished',action:'Reconcile, never replay',at:'2026-10-26T23:08:00Z'});
 f.master.rows=[row('A','FORGE-EMAIL-X'),row('B','FORGE-SOURCE-X')];const m=C.model(f);
 assert.equal(m.severity,'blocked');assert.equal(m.intakeToday,2);assert.match(C.banner(m),/PIPELINE BLOCKED.*AUTO intake stopped.*2 d/);
 const html=C.html(m);assert.match(html,/Automatic path blocked/);assert.match(html,/7<\/b>/);assert.match(html,/Next:/);
});
test('one intake chart combines all providers and deduplicates canonical IDs',()=>{
 const f=fixture();f.master.rows=[row('A','FORGE-EMAIL-CHATGPT'),row('A','FORGE-EMAIL-CHATGPT'),row('B','FORGE-SOURCE-ABC'),row('C','MANUAL-INTAKE'),row('D','LEGACY')];
 const m=C.model(f);assert.equal(m.intakeToday,4);assert.deepEqual(m.daily[6].sources,{'Email':1,'Automatic sources':1,'Manual':1,'Other / legacy':1});
 assert.equal((C.html(m).match(/<svg /g)||[]).length,1);assert.match(C.html(m),/combined/);
});

test('intake uses actual admission time in Eastern time across UTC midnight and delayed discovery',()=>{
 const f=fixture();f.now=Date.parse('2026-10-29T03:45:00Z');
 f.master.rows=[{...row('A','FORGE-EMAIL-CHATGPT','SCOUT_INTAKE','2026-10-29'),payload:{DATE_ADDED:'2026-10-29',MASTER_LOADED_AT:'2026-10-29T03:40:00Z',DISCOVERED_AT_ET:'2026-10-19 12:00 ET',SCOUT_RUN_ID:'FORGE-EMAIL-CHATGPT'}},row('B','MANUAL','SCOUT_INTAKE','2026-10-28'),{...row('C','LEGACY'),payload:{DATE_ADDED:'2026-10-28',MASTER_LOADED_AT:'invalid'}}];
 const m=C.model(f);assert.equal(m.intakeToday,3);assert.equal(m.daily[6].sources.Email,1);
 f.now=Date.parse('2026-10-29T05:15:00Z');assert.equal(C.model(f).intakeToday,0);
 f.master.rows[0].payload.MASTER_LOADED_AT='2026-10-29T04:01:00Z';assert.equal(C.model(f).intakeToday,1);
});
test('missing coverage and failed refreshes are explicit unknowns, not zero or green',()=>{
 const f=fixture();f.operations.runs={};f.health.checks.sources={ok:false};f.healthError='network failure';f.activity=null;
 const m=C.model(f);assert.equal(m.severity,'attention');assert.match(C.html(m),/Not reported/);assert.ok(m.warnings.some(x=>/coverage is not reported/.test(x.title)));assert.notEqual(C.banner(m),'');
});
test('research is open; applied and declined remain separate current decision counts',()=>{
 const f=fixture();f.master.rows=[row('A','', 'APPLIED'),row('B','','DECLINED_BY_TIM'),row('C','','MANUAL_RESEARCH'),row('D','','TIM_DECISION_REQUIRED')];
 const m=C.model(f),h=C.html(m);assert.match(h,/1 \/ 1/);assert.match(h,/1 jobs in the current research queue/);assert.match(h,/research stays open/);assert.equal(m.counts.APPLIED,1);
});

test('recovery distinguishes failed write incidents from aliases and exposes safe next actions without greenwashing',()=>{
 const f=fixture();f.activity.problemReceipts=24;f.activity.problemWriteIncidents=8;f.activity.recoveredReceipts=0;f.activity.recovery={status:'CURRENT',at,groups:[{writeId:'W-OLD',receiptCount:17,status:'ESCALATED',reason:'INSUFFICIENT_ROW_EVIDENCE',nextAction:'Inspect <original> evidence; never replay',evidenceFile:'verify/recovery/escalations/'+ 'a'.repeat(64)+'.json'}]};
 const m=C.model(f),html=C.html(m,{receiptRecoveryOpen:true});assert.equal(m.severity,'attention');assert.match(html,/8 write incidents need recovery/);assert.match(html,/24 unresolved receipt references/);assert.match(html,/Current rows do not prove the original write/);assert.match(html,/Inspect &lt;original&gt;/);assert.match(html,/Saved proof/);assert.match(html,/class="cr-recovery cr-board-history" open/);
});
test('stale incident/scheduler evidence and overdue sources never certify a healthy system',()=>{
 const f=fixture();f.health.checks.attention.at='2026-10-25T12:00:00Z';f.health.checks.boards.at='2026-10-25T12:00:00Z';f.health.checks.schedules.executionVerified=false;
 const m=C.model(f);assert.equal(m.severity,'attention');assert.ok(m.warnings.some(x=>/overdue/.test(x.title)));assert.ok(m.warnings.some(x=>/execution is not yet verified/.test(x.title)));
});
test('an old successful master/receipt read cannot stay healthy just because its connection says fresh',()=>{
 const f=fixture();f.master.checkedAt='2026-10-28T12:00:00Z';f.activity.now='2026-10-28T12:00:00Z';
 const m=C.model(f);assert.equal(m.severity,'attention');assert.ok(m.warnings.some(x=>/Master population/.test(x.title)));assert.ok(m.warnings.some(x=>/completion evidence/.test(x.title)));
});
test('read endpoint combines bounded fixed sources, deduplicates provisional URLs and keeps partial failures visible',async()=>{
 const file=fs.readFileSync(path.join(__dirname,'../functions/api/pipeline-health.js'),'utf8');const mod=await import('data:text/javascript;base64,'+Buffer.from(file).toString('base64'));
 const j=await mod.loadHealth(async url=>{
  assert.match(url,/^https:\/\/raw.githubusercontent.com\/tpruittguitar\/forge-coordination\/main\//);
  if(url.includes('NEEDS_TIM'))return new Response(JSON.stringify({schema:'forge.needs-tim.v1',builtAt:at,items:[{level:'BLOCKING',title:'Intake <stopped>',sourceUrl:'javascript:bad'}]}));
  if(url.includes('SCHEDULE'))return new Response('missing',{status:404});
  return new Response(JSON.stringify({summary:{at},new_roles:[{url:'https://jobs.example/1'},{url:'https://jobs.example/1#x'}]}));
 },now);
 assert.equal(j.candidates,1);assert.equal(j.issues[0].sourceUrl,null);assert.equal(j.checks.schedules.ok,false);assert.equal(j.checks.boards.ok,true);
 const f=fixture();f.health=j;assert.match(C.html(C.model(f)),/Intake &lt;stopped&gt;/);
});

test('fresh board history replaces obsolete failure counts and exposes each last successful check',()=>{
 const f=fixture();f.health.checks.boards.failedBoards=6;f.health.checks.boardHealth={ok:true,at};
 f.health.boardHealth=[{key:'fixed',companies:['MKS <fixed>'],status:'OK',lastAttemptAt:at,lastSuccessAt:at},{key:'down',companies:['Charter Steel'],status:'TEMPORARY_FAILURE',httpStatus:500,lastAttemptAt:at,lastSuccessAt:'2026-10-28T20:00:00Z',retryAt:'2026-10-29T00:15:00Z'}];
 const m=C.model(f),h=C.html(m);assert.ok(m.warnings.some(x=>x.title==='1 employer boards need another check'));assert.ok(!m.warnings.some(x=>/6 employer boards/.test(x.title)));
 assert.match(h,/Last successful check/);assert.doesNotMatch(h,/MKS &lt;fixed&gt;/);assert.match(h,/Charter Steel/);assert.match(h,/Employer service unavailable/);assert.match(h,/Oct 28/);
 f.health.boardHealth[1].lastSuccessAt=null;assert.match(C.html(C.model(f)),/Not yet recorded/);
 f.health.checks.boardHealth.at='2026-10-25T00:00:00Z';assert.ok(C.model(f).warnings.some(x=>/history is unavailable or stale/.test(x.title)));assert.ok(C.model(f).warnings.some(x=>/6 employer boards/.test(x.title)));
});

test('completed recovery and successful board checks leave no historical fault panel',()=>{
 const f=fixture();f.activity.problemReceipts=0;f.activity.recoveredReceipts=17;f.activity.recovery={status:'CURRENT',at,groups:[],deferred:0};f.health.checks.boardHealth={ok:true,at};f.health.boardHealth=[{key:'fixed',companies:['Recovered employer'],status:'OK',lastSuccessAt:at}];
 const html=C.html(C.model(f));assert.doesNotMatch(html,/cr-recovery|proven recovered|Recovered employer|Employer boards needing attention/);
 assert.equal(f.activity.recoveredReceipts,17,'backing recovery evidence remains available');
});

test('public health endpoint exposes bounded board history and omits paused employers',async()=>{
 const file=fs.readFileSync(path.join(__dirname,'../functions/api/pipeline-health.js'),'utf8'),mod=await import('data:text/javascript;base64,'+Buffer.from(file).toString('base64'));
 const j=await mod.loadHealth(async url=>{
  if(url.includes('board-health'))return new Response(JSON.stringify({schema:'forge.board-health.v1',at,boards:{one:{key:'one',companies:['Radiant'],status:'OK',lastSuccessAt:at},two:{key:'two',companies:['Paused'],status:'TEMPORARY_FAILURE',paused:true}}}));
  return new Response('missing',{status:404});
 },now);
 assert.equal(j.checks.boardHealth.ok,true);assert.equal(j.boardHealth.length,1);assert.equal(j.boardHealth[0].lastSuccessAt,at);assert.equal(j.boardHealth[0].companies[0],'Radiant');assert.equal(j.checks.boardHealth.pending,0);
});

test('current immutable email coverage replaces missing operations telemetry without claiming hidden work finished',()=>{
 const f=fixture();f.operations={runs:{},obligations:{}};f.health.checks.emailCoverage={ok:true,at,bodiesRead:6,verifiedInserted:24,advertisedUnshownOccurrences:22,sourceFile:'receipts/EMAIL_FINAL_FORGE-EMAIL-CHATGPT-20261030-1902ET.json'};const m=C.model(f);assert.equal(m.coverageRuns,1);assert.ok(!m.warnings.some(x=>/coverage is not reported/.test(x.title)));assert.ok(m.warnings.some(x=>/recommendations could not be opened/.test(x.title)));f.health.checks.emailCoverage.at='2026-10-25T00:00:00Z';assert.ok(C.model(f).warnings.some(x=>/coverage is not reported/.test(x.title)));
});
test('public health uses verified per-task execution, not the saved configuration flag',async()=>{
 const file=fs.readFileSync(path.join(__dirname,'../functions/api/pipeline-health.js'),'utf8'),mod=await import('data:text/javascript;base64,'+Buffer.from(file).toString('base64'));const fetcher=async url=>new Response(JSON.stringify(url.includes('EXECUTION')?{schema:'forge.automation-evidence.v1',at,executions:[],schedules:{active:[{id:'email',executionVerified:true}]},emailCoverage:{at,writerProofsVerified:true,sourceFile:'receipts/EMAIL_FINAL_FORGE-EMAIL-CHATGPT-20261030-1902ET.json'}}:url.includes('SCHEDULE')?{schema:'forge.schedule-readback.v1',at,local:[{id:'email',status:'ACTIVE'}],executionVerified:false}:url.includes('NEEDS_TIM')?{schema:'forge.needs-tim.v1',builtAt:at,items:[]}:{summary:{at},new_roles:[]}));const h=await mod.loadHealth(fetcher,now);assert.equal(h.checks.schedules.executionVerified,true);assert.equal(h.checks.emailCoverage.ok,true);
});
