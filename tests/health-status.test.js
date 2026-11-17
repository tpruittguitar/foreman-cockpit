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
 'NEEDS_TIM.json':{schema:'forge.needs-tim.v1',builtAt:a,items:[]},
 'AUTOMATION_SCHEDULE_READBACK.json':{schema:'forge.schedule-readback.v1',at:a,local:[{id:'email',status:'ACTIVE'}]},
 'AUTOMATION_EXECUTION_EVIDENCE.json':{schema:'forge.automation-evidence.v1',at:a,executions:[],schedules:{active:[{id:'email',taskExecutionVerified:true}]}}
});
const health=(a,failed,candidates=3)=>({schema:'forge.discovery-health.v1',at:a,failedBoards:failed,candidates,urls:[]});
const boardHealth=(a,statuses)=>({schema:'forge.board-health.v1',at:a,boards:Object.fromEntries(statuses.map((s,i)=>['b'+i,{key:'b'+i,companies:['Co'+i],status:s}]))});
function fixture({sources=health(at,0),boards=health(at,0),history=boardHealth(at,['OK'])}={}){
 const files={...base(at),'board-health.json':history};
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
