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
test('missing coverage and failed refreshes are explicit unknowns, not zero or green',()=>{
 const f=fixture();f.operations.runs={};f.health.checks.sources={ok:false};f.healthError='network failure';f.activity=null;
 const m=C.model(f);assert.equal(m.severity,'attention');assert.match(C.html(m),/Not reported/);assert.ok(m.warnings.some(x=>/coverage is not reported/.test(x.title)));assert.notEqual(C.banner(m),'');
});
test('research is open; applied and declined remain separate current decision counts',()=>{
 const f=fixture();f.master.rows=[row('A','', 'APPLIED'),row('B','','DECLINED_BY_TIM'),row('C','','MANUAL_RESEARCH'),row('D','','TIM_DECISION_REQUIRED')];
 const m=C.model(f),h=C.html(m);assert.match(h,/1 \/ 1/);assert.match(h,/1 jobs in the current research queue/);assert.match(h,/research stays open/);assert.equal(m.counts.APPLIED,1);
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
