const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../functions/api/pipeline-health.js'),'utf8');
let serial=0;
const api=()=>import('data:text/javascript;base64,'+Buffer.from(source+'\n// status case '+serial++).toString('base64'));
const now=Date.parse('2026-11-17T12:00:00Z'),iso=ms=>new Date(ms).toISOString(),at=iso(now),sha='b'.repeat(40),HOUR=3600000;
const base=a=>({
 'PROCESS_COMPLETIONS.json':{schema:'forge.process-completions.v1',model:'four-stage-v2',at:a,states:{}},
 'ENRICHMENT_FLOW.json':{schema:'forge.enrichment-flow.v1',at:a,queues:{readyForReview:0}},
 'APPLICATION_OUTCOMES.json':{schema:'forge.application-outcomes.v1',at:a,events:[],coverageComplete:true},
 'EMAIL_RECOVERY_SUMMARY.json':{schema:'forge.email-recovery-summary.v1',at:a,capturedUniqueJobs:1,pendingJobs:0},
 'BOT_INCIDENTS.json':{schema:'forge.bot-incidents.v1',builtAt:a,items:[]},
 'AUTOMATION_SCHEDULE_READBACK.json':{schema:'forge.schedule-readback.v1',at:a,local:[{id:'email',status:'ACTIVE'}]},
 'AUTOMATION_EXECUTION_EVIDENCE.json':{schema:'forge.automation-evidence.v1',at:a,executions:[],schedules:{active:[{id:'email',taskExecutionVerified:true}]}}
});
const health=(a,failed,candidates=3)=>({schema:'forge.discovery-health.v1',at:a,failedBoards:failed,candidates,urls:[]});
const boardHealth=(a,statuses)=>({schema:'forge.board-health.v1',at:a,boards:Object.fromEntries(statuses.map((s,i)=>['b'+i,{key:'b'+i,companies:['Co'+i],status:s}]))});
function fixture({sources=health(at,0),boards=health(at,0),history=boardHealth(at,['OK']),extra={}}={}){
 const files={...base(at),'board-health.json':history,...extra};
 return async url=>{
  if(url.startsWith('https://api.github.com/'))return Response.json({ref:'refs/heads/main',object:{type:'commit',sha}});
  const name=new URL(url).pathname.split('/').pop();
  if(name==='source-trial-report.health.json')return Response.json(sources);
  if(name==='board-discovery-report.health.json')return Response.json(boards);
  return files[name]?Response.json(files[name]):new Response('',{status:404});
 };
}
test('boards with a high failure count are not ok even though the snapshot parses; the failure is named and the count is kept',async()=>{
 const m=await api(),r=await m.loadHealth(fixture({boards:health(at,25,23)}),now,sha);
 assert.equal(r.checks.boards.ok,false);assert.equal(r.checks.boards.failedBoards,25);assert.equal(r.checks.boards.candidates,23);assert.match(r.checks.boards.error,/25 boards failed/);
 assert.equal(r.checks.sources.ok,true);assert.equal(r.ok,false);
});
test('a few failed boards stay within the limit, and the limit itself is ok',async()=>{
 const m=await api();
 for(const failed of [0,2,10]){const r=await m.loadHealth(fixture({boards:health(at,failed)}),now,sha);assert.equal(r.checks.boards.ok,true,String(failed));assert.equal(r.ok,true);}
 assert.equal((await m.loadHealth(fixture({boards:health(at,11)}),now,sha)).checks.boards.ok,false);
});
test('old, missing or future timestamps are not ok; fresh ones are',async()=>{
 const m=await api();
 const old=await m.loadHealth(fixture({sources:health(iso(now-9*HOUR-60000),0)}),now,sha);
 assert.equal(old.checks.sources.ok,false);assert.match(old.checks.sources.error,/minutes old/);
 assert.equal((await m.loadHealth(fixture({sources:health(iso(now-9*HOUR),0)}),now,sha)).checks.sources.ok,true);
 const future=await m.loadHealth(fixture({boards:health(iso(now+HOUR),0)}),now,sha);
 assert.equal(future.checks.boards.ok,false);assert.match(future.checks.boards.error,/future/);
});
test('a failing source still contributes its candidates to the union',async()=>{
 const m=await api(),r=await m.loadHealth(fixture({boards:{...health(at,25,1),urls:['https://jobs.test/a']}}),now,sha);
 assert.equal(r.checks.boards.ok,false);assert.equal(r.candidates,1);
});
test('board history is judged on its failure rate and age',async()=>{
 const m=await api(),ok=Array(9).fill('OK'),bad=['TEMPORARY_FAILURE'];
 const tenth=await m.loadHealth(fixture({history:boardHealth(at,[...ok,...bad])}),now,sha);
 assert.equal(tenth.checks.boardHealth.ok,true);assert.equal(tenth.checks.boardHealth.failureRate,0.1);
 const high=await m.loadHealth(fixture({history:boardHealth(at,[...Array(211).fill('OK'),...Array(25).fill('TEMPORARY_FAILURE'),...Array(6).fill('INVALID_RESPONSE'),'PARTIAL'])}),now,sha);
 assert.equal(high.checks.boardHealth.ok,false);assert.equal(high.checks.boardHealth.pending,32);assert.match(high.checks.boardHealth.error,/32 of 243 boards failing/);
 const stale=await m.loadHealth(fixture({history:boardHealth(iso(now-10*HOUR),['OK'])}),now,sha);assert.equal(stale.checks.boardHealth.ok,false);
});
test('an evidence file that cannot be read is still not ok, and only readable results are cached',async()=>{
 const m=await api(),f=fixture(),broken=async url=>new URL(url).pathname.endsWith('board-discovery-report.health.json')||new URL(url).pathname.endsWith('board-discovery-report.json')?new Response('',{status:404}):f(url);
 const r=await m.loadHealth(broken,now,sha);assert.equal(r.checks.boards.ok,false);assert.equal(r.ok,false);assert.equal(r.checks.boards.observed,undefined);
 const puts=[],cache={async match(){return undefined},async put(k){puts.push(k.url)}};
 await m.healthResponse(broken,cache,now);assert.ok(puts.every(x=>!x.includes('__health_response')));
 const failing=fixture({boards:health(at,25)});puts.length=0;
 const response=await m.healthResponse(failing,cache,now),body=await response.json();
 assert.equal(body.checks.boards.ok,false);assert.equal(body.ok,false);assert.ok(puts.some(x=>x.includes('__health_response')),'an unhealthy but fully read result is still cached for the minute');
});
test('Workday HTTP 429 boards are blocked and left out of the failure rate; other failures still count',async()=>{
 const m=await api(),board=(key,status,extra={})=>({key,companies:[key],status,...extra});
 const wd429=i=>board('workday:host'+i+'.wd1.myworkdayjobs.com/Careers','TEMPORARY_FAILURE',{httpStatus:429,error:'HTTP 429'});
 const history=list=>({schema:'forge.board-health.v1',at,boards:Object.fromEntries(list.map(b=>[b.key,b]))});
 const live=[...Array.from({length:65},(_,i)=>board('greenhouse:co'+i,'OK')),...['ferrovial','bagelbrands','munters'].map(n=>board('workday:'+n+'.wd3.myworkdayjobs.com/Careers','OK')),...Array.from({length:19},(_,i)=>wd429(i))];
 const r=await m.loadHealth(fixture({history:history(live)}),now,sha),c=r.checks.boardHealth;
 assert.equal(c.ok,true);assert.equal(c.tracked,87);assert.equal(c.pending,0);assert.equal(c.blocked,19);assert.equal(c.failureRate,0);assert.equal(c.error,undefined);assert.equal(c.blockedReason,'Workday HTTP 429');
 assert.equal(r.boardHealth.filter(x=>x.blocked===true).length,19);assert.ok(r.boardHealth.filter(x=>x.key.startsWith('workday:')&&x.status==='OK').every(x=>!x.blocked));
 const b429=r.boardHealth.find(x=>x.blocked);assert.equal(b429.status,'TEMPORARY_FAILURE');assert.equal(b429.httpStatus,429);assert.equal(b429.error,'HTTP 429');
 const textOnly=await m.loadHealth(fixture({history:history([board('a','OK'),board('workday:x.wd1.myworkdayjobs.com/y','TEMPORARY_FAILURE',{error:'HTTP 429'})])}),now,sha);
 assert.equal(textOnly.checks.boardHealth.blocked,1);assert.equal(textOnly.checks.boardHealth.pending,0);
 const other429=await m.loadHealth(fixture({history:history([...Array(9).fill(0).map((_,i)=>board('ok'+i,'OK')),board('greenhouse:limited','TEMPORARY_FAILURE',{httpStatus:429,error:'HTTP 429'})])}),now,sha);
 assert.equal(other429.checks.boardHealth.pending,1);assert.equal(other429.checks.boardHealth.blocked,0);assert.equal(other429.checks.boardHealth.failureRate,0.1);assert.equal(other429.checks.boardHealth.ok,true);assert.ok(!other429.boardHealth.some(x=>x.blocked));
 const other429High=await m.loadHealth(fixture({history:history([...Array(8).fill(0).map((_,i)=>board('ok'+i,'OK')),board('lever:a','TEMPORARY_FAILURE',{httpStatus:429}),board('lever:b','TEMPORARY_FAILURE',{httpStatus:429})])}),now,sha);
 assert.equal(other429High.checks.boardHealth.ok,false);assert.match(other429High.checks.boardHealth.error,/2 of 10 boards failing/);
 const wd500=await m.loadHealth(fixture({history:history([...Array(4).fill(0).map((_,i)=>board('ok'+i,'OK')),board('workday:down.wd1.myworkdayjobs.com/x','TEMPORARY_FAILURE',{httpStatus:500,error:'HTTP 500'}),wd429(1)])}),now,sha);
 assert.equal(wd500.checks.boardHealth.pending,1);assert.equal(wd500.checks.boardHealth.blocked,1);assert.equal(wd500.checks.boardHealth.failureRate,0.2);assert.equal(wd500.checks.boardHealth.ok,false);assert.match(wd500.checks.boardHealth.error,/1 of 5 boards failing/);
 assert.ok(!wd500.boardHealth.find(x=>x.httpStatus===500).blocked);
 const stale=await m.loadHealth(fixture({history:{...history([wd429(1)]),at:iso(now-10*HOUR)}}),now,sha);assert.equal(stale.checks.boardHealth.ok,false);assert.equal(stale.checks.boardHealth.failureRate,0);
});

test('a source pass that read no boards reports failedBoards null; boards and boardHealth carry their labels',async()=>{
 const m=await api(),r=await m.loadHealth(fixture({sources:health(at,null)}),now,sha);
 assert.equal(r.checks.sources.ok,true);assert.equal(r.checks.sources.failedBoards,null);
 assert.equal(r.checks.boards.label,'latest pass');assert.equal(r.checks.boardHealth.label,'currently failing');assert.equal(r.checks.sources.label,undefined);
});
const capture=(a,o={})=>({corroborated:true,coverageComplete:false,at:a,messagesRead:752,pendingMessages:1382,sourceFile:'receipts/FORGE-CODE-CHATGPT-TEST_MAIL.json',...o});
const coverage=(a,o={})=>({writerProofsVerified:true,at:a,pendingSourceWindows:2,sourceFile:'receipts/EMAIL_FINAL_FORGE-EMAIL-CHATGPT-20261030-1902ET.json',...o});
const timed=(a,{cap=capture(a),cov=coverage(a)}={})=>{const b=base(at);return {'APPLICATION_OUTCOMES.json':{...b['APPLICATION_OUTCOMES.json'],at:a,events:[{primaryId:'P1',type:'APPLIED',evidenceVerified:true}]},'AUTOMATION_EXECUTION_EVIDENCE.json':{...b['AUTOMATION_EXECUTION_EVIDENCE.json'],emailCapture:cap,emailCoverage:cov}};};
const AGED=['applicationOutcomes','emailCapture','emailCoverage'];
test('outcomes, email capture and email coverage stay ok when fresh and at exactly 6 hours',async()=>{
 const m=await api();
 for(const a of [at,iso(now-6*HOUR)]){
  const r=await m.loadHealth(fixture({extra:timed(a)}),now,sha);
  for(const k of AGED){assert.equal(r.checks[k].ok,true,k+' '+a);assert.equal(r.checks[k].status,undefined,k);assert.equal(r.checks[k].at,a,k);}
  assert.equal(r.checks.emailCapture.messagesRead,752);assert.equal(r.checks.emailCoverage.pendingSourceWindows,2);assert.equal(r.ok,true);
 }
});
test('outcomes, email capture and email coverage past 6 hours are STALE with their true age, and the whole result is not ok',async()=>{
 const m=await api();
 for(const ageMs of [6*HOUR+60000,20*24*HOUR+8*HOUR]){
  const a=iso(now-ageMs),r=await m.loadHealth(fixture({extra:timed(a)}),now,sha);
  for(const k of AGED){const c=r.checks[k];assert.equal(c.ok,false,k);assert.equal(c.status,'STALE',k);assert.equal(c.observed,true,k);assert.equal(c.at,a,k);assert.match(c.error,/minutes old \(limit 360\)/,k);assert.equal(c.ageMs,ageMs,k);assert.equal(c.ageMinutes,Math.round(ageMs/60000),k);}
  assert.equal(r.checks.emailCapture.messagesRead,752);assert.equal(r.checks.emailCapture.corroborated,true);assert.equal(r.checks.emailCoverage.writerProofsVerified,true);
  assert.equal(r.checks.sources.ok,true);assert.equal(r.checks.boards.ok,true);assert.equal(r.ok,false);
 }
 for(const k of AGED){const ex={...timed(at),...(k==='applicationOutcomes'?{'APPLICATION_OUTCOMES.json':timed(iso(now-7*HOUR))['APPLICATION_OUTCOMES.json']}:{'AUTOMATION_EXECUTION_EVIDENCE.json':timed(at,k==='emailCapture'?{cap:capture(iso(now-7*HOUR))}:{cov:coverage(iso(now-7*HOUR))})['AUTOMATION_EXECUTION_EVIDENCE.json']})};
  const r=await m.loadHealth(fixture({extra:ex}),now,sha);assert.equal(r.checks[k].status,'STALE',k);assert.equal(r.ok,false,k);assert.equal(r.checks.execution.ok,true,k);}
});
test('stale application outcomes keep serving the last-good events',async()=>{
 const m=await api(),r=await m.loadHealth(fixture({extra:timed(iso(now-10*24*HOUR))}),now,sha);
 assert.equal(r.checks.applicationOutcomes.status,'STALE');assert.equal(r.applicationOutcomes.events.length,1);assert.equal(r.applicationOutcomes.events[0].primaryId,'P1');
});
test('a missing or future outcomes timestamp is not ok and is not labelled STALE',async()=>{
 const m=await api(),b=base(at);
 const missing=await m.loadHealth(fixture({extra:{'APPLICATION_OUTCOMES.json':{...b['APPLICATION_OUTCOMES.json'],at:undefined}}}),now,sha);
 assert.equal(missing.checks.applicationOutcomes.ok,false);assert.equal(missing.checks.applicationOutcomes.status,undefined);assert.equal(missing.checks.applicationOutcomes.observed,undefined);assert.match(missing.checks.applicationOutcomes.error,/Missing timestamp/);
 const future=await m.loadHealth(fixture({extra:timed(iso(now+HOUR))}),now,sha);
 for(const k of AGED){assert.equal(future.checks[k].ok,false,k);assert.equal(future.checks[k].status,undefined,k);assert.match(future.checks[k].error,/future/,k);}
});
test('proof gates still hide unverified coverage and uncorroborated or unmatched capture, even when stale',async()=>{
 const m=await api(),old=iso(now-10*24*HOUR);
 const r=await m.loadHealth(fixture({extra:timed(old,{cov:coverage(old,{writerProofsVerified:false}),cap:capture(old,{corroborated:false})})}),now,sha);
 assert.equal(r.checks.emailCoverage,undefined);assert.equal(r.checks.emailCapture,undefined);
 const bad=await m.loadHealth(fixture({extra:timed(old,{cap:capture(old,{sourceFile:'receipts/OTHER_MAIL.json'})})}),now,sha);
 assert.equal(bad.checks.emailCapture,undefined);assert.equal(bad.checks.emailCoverage.status,'STALE');
});
test('email receipt fields cannot override API health or mark evidence PAUSED',async()=>{
 const m=await api(),claimed={ok:false,status:'PAUSED',observed:true,error:'receipt error',ageMs:10,ageMinutes:1};
 for(const a of [at,iso(now-7*HOUR),iso(now+HOUR)]){
  const cap=capture(a,claimed),cov=coverage(a,claimed);
  const extra={...timed(at),'AUTOMATION_EXECUTION_EVIDENCE.json':timed(at,{cap,cov})['AUTOMATION_EXECUTION_EVIDENCE.json']};
  const r=await m.loadHealth(fixture({extra}),now,sha);
  const stale=Date.parse(a)<now,fresh=a===at;
  for(const k of ['emailCapture','emailCoverage']){
   const c=r.checks[k];
   assert.equal(c.ok,fresh,k);assert.equal(c.status,stale?'STALE':undefined,k);
   assert.equal(c.observed,stale?true:undefined,k);
   assert.equal(c.ageMs,stale?7*HOUR:undefined,k);assert.equal(c.ageMinutes,stale?420:undefined,k);
   if(fresh)assert.equal(c.error,undefined,k);
   else assert.match(c.error,stale?/minutes old/:/future/,k);
  }
  assert.equal(r.ok,fresh);
 }
});
test('malformed optional email receipts remain unreported',async()=>{
 const m=await api();
 for(const [cap,cov] of [
  [capture(at,{at:undefined}),coverage(at,{at:'invalid'})],
  [capture(at,{messagesRead:0}),coverage(at,{sourceFile:'receipts/OTHER_MAIL.json'})],
  [capture(at,{coverageComplete:true}),null]
 ]){
  const r=await m.loadHealth(fixture({extra:timed(at,{cap,cov})}),now,sha);
  assert.equal(r.checks.emailCapture,undefined);assert.equal(r.checks.emailCoverage,undefined);
  assert.equal(r.ok,true);
 }
});
test('unreadable or invalid outcome and recovery snapshots are errors, not stale observations',async()=>{
 const m=await api(),b=base(at);
 for(const [outcomes,recovery] of [[undefined,undefined],[
  {...b['APPLICATION_OUTCOMES.json'],events:{}},
  {...b['EMAIL_RECOVERY_SUMMARY.json'],pendingJobs:-1}
 ]]){
  const r=await m.loadHealth(fixture({extra:{'APPLICATION_OUTCOMES.json':outcomes,'EMAIL_RECOVERY_SUMMARY.json':recovery}}),now,sha);
  for(const k of ['applicationOutcomes','emailRecovery']){
   assert.deepEqual(r.checks[k],{ok:false,error:'Could not read '+k+' evidence'});
   assert.equal(r[k],undefined);
  }
  assert.equal(r.ok,false);
 }
});
test('a fully read result with stale application outcomes is still cached for the minute',async()=>{
 const m=await api(),puts=[],cache={async match(){return undefined},async put(k){puts.push(k.url)}};
 const body=await (await m.healthResponse(fixture({extra:timed(iso(now-10*24*HOUR))}),cache,now)).json();
 assert.equal(body.checks.applicationOutcomes.status,'STALE');assert.equal(body.ok,false);assert.ok(puts.some(x=>x.includes('__health_response')));
});
// cs-d4f77128: recovery (24 h), process flow and process states (90 min) are judged on data age, keeping last-good payloads.
const MIN=60000,sibling=(a,{ready=[],flowAt=a}={})=>({
 'PROCESS_COMPLETIONS.json':{schema:'forge.process-completions.v1',model:'four-stage-v2',at:a,states:Object.fromEntries(ready.map(id=>[id,{enrichment:true,closed:false}]))},
 'ENRICHMENT_FLOW.json':{schema:'forge.enrichment-flow.v1',at:flowAt,queues:{readyForReview:ready.length}},
 'EMAIL_RECOVERY_SUMMARY.json':{schema:'forge.email-recovery-summary.v1',at:a,capturedUniqueJobs:4,pendingJobs:2,awaitingIntake:2}});
test('email recovery is ok inside 24 hours and STALE past it, keeping the last-good summary',async()=>{
 const m=await api();
 for(const ageMs of [0,24*HOUR]){const a=iso(now-ageMs),r=await m.loadHealth(fixture({extra:{'EMAIL_RECOVERY_SUMMARY.json':sibling(a)['EMAIL_RECOVERY_SUMMARY.json']}}),now,sha);const c=r.checks.emailRecovery;assert.equal(c.ok,true,a);assert.equal(c.status,undefined);assert.equal(c.at,a);}
 const ageMs=24*HOUR+MIN,a=iso(now-ageMs),r=await m.loadHealth(fixture({extra:{'EMAIL_RECOVERY_SUMMARY.json':sibling(a)['EMAIL_RECOVERY_SUMMARY.json']}}),now,sha),c=r.checks.emailRecovery;
 assert.equal(c.ok,false);assert.equal(c.status,'STALE');assert.equal(c.observed,true);assert.equal(c.at,a);assert.equal(c.ageMs,ageMs);assert.equal(c.ageMinutes,Math.round(ageMs/MIN));assert.match(c.error,/minutes old \(limit 1440\)/);
 assert.equal(r.emailRecovery.pendingJobs,2);assert.equal(r.ok,false);
 const future=await m.loadHealth(fixture({extra:{'EMAIL_RECOVERY_SUMMARY.json':sibling(iso(now+HOUR))['EMAIL_RECOVERY_SUMMARY.json']}}),now,sha);
 assert.equal(future.checks.emailRecovery.ok,false);assert.equal(future.checks.emailRecovery.status,undefined);assert.equal(future.checks.emailRecovery.observed,undefined);assert.match(future.checks.emailRecovery.error,/future/);assert.equal(future.emailRecovery.pendingJobs,2);
 const missing=await m.loadHealth(fixture({extra:{'EMAIL_RECOVERY_SUMMARY.json':{...sibling(at)['EMAIL_RECOVERY_SUMMARY.json'],at:undefined}}}),now,sha);
 assert.equal(missing.checks.emailRecovery.ok,false);assert.equal(missing.checks.emailRecovery.status,undefined);
});
test('process flow and states are ok inside 90 minutes and STALE past it; stale reconciled states keep decisionReady',async()=>{
 const m=await api();
 for(const ageMs of [0,90*MIN-1000]){const a=iso(now-ageMs),r=await m.loadHealth(fixture({extra:sibling(a,{ready:['P1']})}),now,sha);for(const k of ['processFlow','processStates']){assert.equal(r.checks[k].ok,true,k+' '+a);assert.equal(r.checks[k].status,undefined,k);}assert.deepEqual(r.decisionReady.ids,['P1']);}
 const ageMs=90*MIN+MIN,a=iso(now-ageMs),r=await m.loadHealth(fixture({extra:sibling(a,{ready:['P1','P2']})}),now,sha);
 for(const k of ['processFlow','processStates']){const c=r.checks[k];assert.equal(c.ok,false,k);assert.equal(c.status,'STALE',k);assert.equal(c.observed,true,k);assert.equal(c.at,a,k);assert.equal(c.ageMs,ageMs,k);assert.match(c.error,/minutes old \(limit 90\)/,k);}
 assert.equal(r.processFlow.queues.readyForReview,2);assert.deepEqual(r.decisionReady,{at:a,ids:['P1','P2']});assert.equal(r.ok,false);
 const future=await m.loadHealth(fixture({extra:sibling(iso(now+HOUR))}),now,sha);
 for(const k of ['processFlow','processStates']){assert.equal(future.checks[k].ok,false,k);assert.equal(future.checks[k].status,undefined,k);assert.match(future.checks[k].error,/future/,k);}
 const missing=await m.loadHealth(fixture({extra:{'ENRICHMENT_FLOW.json':{schema:'forge.enrichment-flow.v1',queues:{readyForReview:0}}}}),now,sha);
 assert.equal(missing.checks.processFlow.ok,false);assert.equal(missing.checks.processFlow.status,undefined);
});
test('a readiness snapshot that does not reconcile stays a reconcile failure, not STALE',async()=>{
 const m=await api(),old=iso(now-5*HOUR),r=await m.loadHealth(fixture({extra:sibling(old,{ready:['P1'],flowAt:iso(now-4*HOUR)})}),now,sha);
 assert.deepEqual(r.checks.processStates,{ok:false,error:'Readiness does not reconcile with process flow'});assert.equal(r.decisionReady,null);assert.equal(r.checks.processFlow.status,'STALE');
});
test('schedules.ok tracks fresh configuration and verified execution, and stale configuration is STALE',async()=>{
 const m=await api(),b=base(at),cfg=a=>({...b['AUTOMATION_SCHEDULE_READBACK.json'],at:a}),ex=(a,verified=true)=>({...b['AUTOMATION_EXECUTION_EVIDENCE.json'],at:a,schedules:{active:[{id:'email',taskExecutionVerified:verified}]}});
 const load=extra=>m.loadHealth(fixture({extra}),now,sha);
 let s=(await load({})).checks.schedules;assert.equal(s.ok,true);assert.equal(s.executionVerified,true);assert.equal(s.status,undefined);
 s=(await load({'AUTOMATION_SCHEDULE_READBACK.json':cfg(iso(now-24*HOUR+MIN))})).checks.schedules;assert.equal(s.ok,true);
 s=(await load({'AUTOMATION_EXECUTION_EVIDENCE.json':ex(at,false)})).checks.schedules;
 assert.equal(s.ok,false);assert.equal(s.executionVerified,false);assert.equal(s.status,undefined);assert.equal(s.observed,true);assert.deepEqual(s.unverified,['email']);
 s=(await load({'AUTOMATION_EXECUTION_EVIDENCE.json':ex(iso(now-90*MIN))})).checks.schedules;assert.equal(s.ok,false);assert.equal(s.executionVerified,false);assert.equal(s.status,undefined);assert.equal(s.observed,true);
 s=(await load({'AUTOMATION_EXECUTION_EVIDENCE.json':undefined})).checks.schedules;assert.equal(s.ok,false);assert.equal(s.status,undefined);assert.equal(s.observed,true);assert.deepEqual(s.ids,['email']);
 const old=iso(now-24*HOUR-MIN);s=(await load({'AUTOMATION_SCHEDULE_READBACK.json':cfg(old)})).checks.schedules;
 assert.equal(s.ok,false);assert.equal(s.status,'STALE');assert.equal(s.observed,true);assert.equal(s.at,old);assert.equal(s.configured,1);assert.deepEqual(s.ids,['email']);assert.equal(s.ageMs,24*HOUR+MIN);
 assert.equal(s.executionVerified,true,'promotion still runs on a stale configuration');assert.equal(s.executionAt,at);
 s=(await load({'AUTOMATION_SCHEDULE_READBACK.json':cfg(iso(now+HOUR))})).checks.schedules;assert.equal(s.ok,false);assert.equal(s.status,undefined);assert.equal(s.observed,undefined);assert.match(s.error,/future/);
 s=(await load({'AUTOMATION_SCHEDULE_READBACK.json':cfg(undefined)})).checks.schedules;assert.equal(s.ok,false);assert.equal(s.status,undefined);assert.match(s.error,/Missing timestamp/);
 s=(await load({'AUTOMATION_SCHEDULE_READBACK.json':undefined})).checks.schedules;assert.deepEqual(s,{ok:false,error:'Schedule execution not reported'});
});
test('stale recovery, process flow and schedule configuration are still observed and cached for the minute',async()=>{
 const m=await api(),puts=[],cache={async match(){return undefined},async put(k){puts.push(k.url)}},b=base(at);
 const extra={...sibling(iso(now-30*HOUR)),'AUTOMATION_SCHEDULE_READBACK.json':{...b['AUTOMATION_SCHEDULE_READBACK.json'],at:iso(now-30*HOUR)}};
 const body=await (await m.healthResponse(fixture({extra}),cache,now)).json();
 for(const k of ['emailRecovery','processFlow','processStates','schedules']){assert.equal(body.checks[k].status,'STALE',k);assert.equal(body.checks[k].observed,true,k);}
 assert.equal(body.ok,false);assert.ok(puts.some(x=>x.includes('__health_response')));
});
test('confirmed paused workflow metadata overrides old or missing discovery evidence, but a failed lookup does not',async()=>{
 const m=await api(),old=iso(now-10*HOUR),get=fixture({sources:health(old,0),history:boardHealth(old,['OK'])});
 const states={};
 const fetcher=async(url,options)=>{
  if(!url.includes('/actions/workflows/'))return get(url);
  assert.equal(options.headers.Authorization,'Bearer test-token');
  const state=states[new URL(url).pathname.split('/').pop()];
  return state?Response.json({state}):new Response('',{status:403});
 };
 for(const state of ['disabled_manually','disabled','disabled_inactivity','paused']){
  states['source-trial.yml']=state;
  const r=await m.loadHealth(fetcher,now,sha,'test-token');
  assert.equal(r.checks.sources.status,'PAUSED');
  assert.equal(r.checks.sources.at,old);
  assert.equal(r.checks.sources.workflowState,state);
  assert.equal(r.checks.sources.ok,false);
  assert.equal(r.checks.sources.error,undefined);
  assert.equal(r.checks.boards.ok,true);
  assert.equal(r.ok,false,'unrelated stale board history still counts');
 }
 states['board-discovery.yml']='disabled_fork';
 const missing=await m.loadHealth((url,options)=>url.includes('board-discovery-report')?new Response('',{status:404}):fetcher(url,options),now,sha,'test-token');
 assert.equal(missing.checks.boards.status,'PAUSED');
 assert.equal(missing.checks.boardHealth.status,'PAUSED');
 assert.equal(missing.ok,true,'paused checks do not degrade aggregate health');
 for(const state of ['active',undefined]){
  states['source-trial.yml']=state;
  const r=await m.loadHealth(fetcher,now,sha,'test-token');
  assert.notEqual(r.checks.sources.status,'PAUSED');
  assert.match(r.checks.sources.error,/minutes old/);
 }
});
