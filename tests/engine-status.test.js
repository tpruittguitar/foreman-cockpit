const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../pipeline-engine-status');

// Populated fixture from the approved cs-32ab60a7 mockup ("as of Nov 24, 2:15 PM ET").
const AT='2026-11-24T14:15:00-05:00',AT_MS=Date.parse(AT),MIN=60000;
const ROWS=[
 [1,'jobspy','JobSpy','DISCOVERY','SCRIPT','source-trial.yml · jobspy','every 30 min',13,13,0,0,12,18,'OK · 19 found','ok'],
 [2,'hiringcafe','HiringCafe','DISCOVERY','SCRIPT','source-trial.yml · hiringcafe','every 30 min',8,8,0,0,12,18,'OK · 12 found','ok'],
 [3,'boards','Career boards (97)','DISCOVERY','SCRIPT','board-discovery.yml','hourly',6,6,0,0,41,19,'74 of 97 boards OK','degraded'],
 [4,'email','Email','DISCOVERY','SCRIPT + LIGHT AI','gmail-discovery.yml','every 15 min',7,7,0,0,6,9,'OK · 4 found','ok'],
 [5,'websearch','Web search','DISCOVERY','AI','web-search (scheduled)','every 2 h',6,6,0,0,53,67,'OK · 7 found','ok'],
 [6,'fields','5 required fields','INTAKE','SCRIPT','intake/fields.js','with gate',40,40,5,0,3,12,'OK · 58 pass, 0 fail','ok'],
 [7,'descfetch','Description fetch','INTAKE','SCRIPT','intake/desc-fetch.js','with gate',40,40,0,0,3,12,'OK · 0 needed','ok'],
 [8,'duplicate','Duplicate check','INTAKE','SCRIPT','intake/duplicate.js','with gate',40,40,0,0,3,12,'OK · 6 dupes dropped','ok'],
 [9,'declined','Declined check','INTAKE','SCRIPT','intake/declined.js','with gate',40,40,0,0,3,12,'OK · 2 dropped','ok'],
 [10,'scope','Scope screen','INTAKE','SCRIPT','intake/scope.js','with gate',40,40,0,0,3,12,'OK · 11 out of scope','ok'],
 [11,'onsite','Onsite default','INTAKE','SCRIPT','intake/onsite.js','with gate',40,40,0,0,3,12,'OK · 14 set onsite','ok'],
 [12,'coords','Coordinates','INTAKE','SCRIPT','intake/coords.js','with gate',40,40,0,0,3,12,'OK · 21 mapped','ok'],
 [13,'postedpay','Posted pay','ENRICHMENT','SCRIPT','enrich-ats-pay.yml','every 15 min',40,40,118,22,9,6,'OK · 22 filled','ok'],
 [14,'degreepay','Degree and buried pay','ENRICHMENT','AI CHEAP','extract-run (new)','every 30 min',40,40,0,0,14,16,'OK · 38 done','ok'],
 [15,'expfit','Experience fit','ENRICHMENT','AI HIGHEST','exp-fit-run (new)','every 30 min',40,18,0,0,28,2,'SLOW · 18/h vs 40/h in','ok'],
 [16,'product','Product and source','ENRICHMENT','AI HIGH','product-run (new)','every 30 min',18,18,0,0,11,19,'OK · 36 done','ok'],
 [17,'paybasis','Pay basis','ENRICHMENT','SCRIPT','score-run · pay-basis','every 15 min',18,18,0,0,2,13,'OK · 18 set','ok'],
 [18,'degreeflex','Degree flexibility','ENRICHMENT','SCRIPT','score-run · degree-flex','every 15 min',18,18,0,0,2,13,'OK · 18 set','ok'],
 [19,'score','Final score','ENRICHMENT','SCRIPT','score-run · score','every 15 min',18,18,0,0,2,13,'OK · 18 scored','ok']
];
const iso=ms=>new Date(ms).toISOString();
function envelope(atMs=AT_MS){
 return {schema:'forge.engine-status.v1',at:iso(atMs),
  writer:{ratePerHour:18,lastWriteAt:iso(atMs-MIN)},
  readyForDecision:{count:42,applied:27,declined:311},
  steps:ROWS.map(([n,id,name,stage,method,runsAs,schedule,rateIn,rateOut,queue,queueDeltaPerHour,ago,next,result,state])=>({
   id,n,name,stage,method,runsAs,schedule,rateIn,rateOut,queue,queueDeltaPerHour,
   lastRunAt:iso(atMs-ago*MIN),nextRunAt:iso(atMs+next*MIN),result,state}))};
}
const step=(env,id)=>env.steps.find(s=>s.id===id);
const ERR='Engine status not available';

test('populated fixture: ok, no banner copy, constraint is step 15 Experience fit',()=>{
 const r=E.evaluate(envelope(),AT_MS+5*MIN);
 assert.equal(r.status,'ok');assert.equal(r.copy,null);assert.equal(r.copyDetail,null);
 assert.equal(r.asOf,iso(AT_MS));assert.equal(r.asOfLabel,'Nov 24, 2:15 PM');
 assert.equal(r.steps.length,19);
 assert.equal(r.constraint.n,15);assert.equal(r.constraint.id,'expfit');assert.equal(r.constraint.name,'Experience fit');
 assert.equal(r.constraint.rateOut,18);assert.equal(r.constraint.rateIn,40);
 assert.deepEqual(r.steps.filter(s=>s.isConstraint).map(s=>s.n),[15]);
 assert.deepEqual(r.writer,{queue:null,ratePerHour:18,lastWriteAt:iso(AT_MS-MIN)});
 assert.deepEqual(r.readyForDecision,{count:42,applied:27,declined:311});
});

test('now accepts a Date or ms; age uses envelope.at only',()=>{
 assert.equal(E.evaluate(envelope(),new Date(AT_MS+MIN)).status,'ok');
 const env=envelope();env.writer.lastWriteAt=iso(AT_MS-3*86400000);env.steps.forEach(s=>s.lastRunAt=iso(AT_MS-3*86400000));
 assert.equal(E.evaluate(env,AT_MS+MIN).status,'ok');
 assert.equal(E.STALE_MS,90*60000);assert.equal(E.EXPIRED_MS,24*3600000);
});

test('queue growth: only postedpay (13, queue 118, +22/h); zero is STEADY',()=>{
 const r=E.evaluate(envelope(),AT_MS);
 assert.deepEqual(r.growingQueues.map(s=>[s.id,s.n,s.queue,s.queueDeltaPerHour]),[['postedpay',13,118,22]]);
 assert.ok(r.steps.filter(s=>s.id!=='postedpay').every(s=>s.queueTrend==='STEADY'));
 assert.equal(r.steps.find(s=>s.id==='fields').queueTrend,'STEADY');
});

test('schema and at validation: error, no constraint, no numbers',()=>{
 const cases=[];
 cases.push(null,undefined,42,'not json',[],{});
 let e=envelope();delete e.schema;cases.push(e);
 e=envelope();e.schema='forge.engine-status.v2';cases.push(e);
 e=envelope();delete e.at;cases.push(e);
 e=envelope();e.at='yesterday-ish';cases.push(e);
 e=envelope();delete e.steps;cases.push(e);
 e=envelope();e.steps={};cases.push(e);
 for(const c of cases){
  const r=E.evaluate(c,AT_MS);
  assert.equal(r.status,'error');assert.equal(r.copy,ERR);
  assert.equal(r.constraint,null);assert.deepEqual(r.steps,[]);assert.deepEqual(r.growingQueues,[]);
  assert.equal(r.writer,null);assert.equal(r.readyForDecision,null);assert.equal(r.asOf,null);
 }
 assert.equal(E.evaluate(JSON.stringify(envelope()),AT_MS).status,'ok');
});

test('empty steps: "No steps reported yet", no constraint',()=>{
 const env=envelope();env.steps=[];
 const r=E.evaluate(env,AT_MS+MIN);
 assert.equal(r.status,'empty');assert.equal(r.copy,'No steps reported yet');assert.equal(r.constraint,null);assert.deepEqual(r.steps,[]);
});

test('stale band (2 h old): keeps the numbers, STALE copy in ET',()=>{
 const now=AT_MS,r=E.evaluate(envelope(now-2*3600000),now);
 assert.equal(r.status,'stale');assert.equal(r.copy,'STALE · as of Nov 24, 12:15 PM ET');
 assert.equal(r.steps.length,19);assert.equal(r.constraint.n,15);
 assert.equal(r.growingQueues[0].queue,118);
 assert.equal(E.evaluate(envelope(now-90*MIN),now).status,'stale');
 assert.equal(E.evaluate(envelope(now-90*MIN+1),now).status,'ok');
});

test('expired: mockup stale-as-of, 24 h 35 min before the populated clock',()=>{
 const env=envelope();env.at='2026-11-23T13:40:00-05:00';
 assert.equal(AT_MS-Date.parse(env.at),(24*60+35)*MIN);
 const r=E.evaluate(env,AT_MS);
 assert.equal(r.status,'expired');assert.equal(r.copy,'No engine status');
 assert.equal(r.copyDetail,'Last update over 24 h ago (as of Nov 23, 1:40 PM). Steps are unknown.');
 assert.equal(r.constraint,null);assert.deepEqual(r.steps,[]);assert.deepEqual(r.growingQueues,[]);
 assert.equal(E.evaluate(envelope(AT_MS-E.EXPIRED_MS),AT_MS).status,'expired');
 assert.equal(E.evaluate(envelope(AT_MS-E.EXPIRED_MS+1),AT_MS).status,'stale');
});

test('ok never uses stale or expired copy',()=>{
 const r=E.evaluate(envelope(),AT_MS+30*MIN);
 assert.equal(r.status,'ok');
 assert.doesNotMatch(JSON.stringify([r.copy,r.copyDetail]),/STALE|No engine status|over 24 h|Steps are unknown/);
});

test('readyForDecision is never the constraint, even with worse rates',()=>{
 const env=envelope();env.readyForDecision={count:42,applied:27,declined:311,rateIn:500,rateOut:0};
 const r=E.evaluate(env,AT_MS);
 assert.equal(r.constraint.n,15);assert.deepEqual(r.readyForDecision,{count:42,applied:27,declined:311});
 step(env,'expfit').rateOut=40;
 assert.equal(E.evaluate(env,AT_MS).constraint,null);
});

test('unknown steps are listed but not chosen; a step fed by an unknown step is not chosen',()=>{
 let env=envelope();step(env,'expfit').rateOut=null;
 let r=E.evaluate(env,AT_MS),s=r.steps.find(x=>x.id==='expfit');
 assert.equal(r.steps.length,19);assert.equal(s.unknown,true);assert.deepEqual(s.problems,['rateOut']);assert.equal(s.queueTrend,'UNKNOWN');
 assert.equal(r.constraint,null);
 env=envelope();step(env,'degreepay').stage='SOMEWHERE';
 r=E.evaluate(env,AT_MS);
 assert.equal(r.steps.find(x=>x.id==='degreepay').unknown,true);
 assert.equal(r.constraint,null,'15 is fed by unknown 14, so no constraint is invented');
 env=envelope();step(env,'degreepay').lastRunAt='not a time';step(env,'product').rateOut=5;
 r=E.evaluate(env,AT_MS);
 assert.equal(r.constraint.n,16,'first eligible step whose feeder is known');
 env=envelope();delete step(env,'jobspy').id;step(env,'hiringcafe').rateOut=1;step(env,'email').rateOut=1;
 r=E.evaluate(env,AT_MS);
 assert.equal(r.constraint.n,4,'step 2 is fed by unknown step 1');
 env=envelope();step(env,'jobspy').rateOut=1;
 assert.equal(E.evaluate(env,AT_MS).constraint.n,1,'the first step has no feeder');
});

test('missed or failed steps stay visible and are chosen only on real rateOut < rateIn',()=>{
 let env=envelope();Object.assign(step(env,'degreepay'),{state:'failed',rateOut:10});
 let r=E.evaluate(env,AT_MS);
 assert.equal(r.constraint.n,14);assert.equal(r.constraint.state,'failed');
 env=envelope();Object.assign(step(env,'degreepay'),{state:'missed',rateOut:0});
 assert.equal(E.evaluate(env,AT_MS).constraint.n,14);
 env=envelope();Object.assign(step(env,'degreepay'),{state:'missed',rateOut:null});
 r=E.evaluate(env,AT_MS);
 assert.equal(r.steps.find(x=>x.id==='degreepay').state,'missed');assert.equal(r.constraint,null);
 env=envelope();Object.assign(step(env,'degreepay'),{state:'failed',rateIn:'40',rateOut:10});
 assert.equal(E.evaluate(env,AT_MS).constraint,null);
 env=envelope();Object.assign(step(env,'degreepay'),{state:'failed'});
 r=E.evaluate(env,AT_MS);
 assert.equal(r.steps.find(x=>x.id==='degreepay').state,'failed');assert.equal(r.constraint.n,15);
});
