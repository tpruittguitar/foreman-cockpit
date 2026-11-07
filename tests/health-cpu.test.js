const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../functions/api/pipeline-health.js'),'utf8');
let serial=0;
const api=()=>import('data:text/javascript;base64,'+Buffer.from(source+'\n// case '+serial++).toString('base64'));
const now=Date.parse('2026-11-07T12:00:10Z'),at=new Date(now).toISOString(),sha='a'.repeat(40);
const reports={
 'PROCESS_COMPLETIONS.json':{schema:'forge.process-completions.v1',model:'four-stage-v2',at,states:{ready:{enrichment:true,closed:false}}},
 'ENRICHMENT_FLOW.json':{schema:'forge.enrichment-flow.v1',at,queues:{readyForReview:1}},
 'APPLICATION_OUTCOMES.json':{schema:'forge.application-outcomes.v1',at,events:[],coverageComplete:true},
 'EMAIL_RECOVERY_SUMMARY.json':{schema:'forge.email-recovery-summary.v1',at,capturedUniqueJobs:1,pendingJobs:0},
 'NEEDS_TIM.json':{schema:'forge.needs-tim.v1',builtAt:at,items:[]},
 'AUTOMATION_SCHEDULE_READBACK.json':{schema:'forge.schedule-readback.v1',at,local:[{id:'email',status:'ACTIVE'}]},
 'board-health.json':{schema:'forge.board-health.v1',at,boards:{}},
 'AUTOMATION_EXECUTION_EVIDENCE.json':{schema:'forge.automation-evidence.v1',at,executions:[],schedules:{active:[{id:'email',taskExecutionVerified:true}]}}
};
const sourceReport={summary:{at,boards:{failed:2}},new_roles:[null,{url:'https://jobs.test/a#one'},{url:'https://jobs.test/a#two'},{url:'http://jobs.test/b'},{url:42}]};
const boardReport={summary:{at},new_roles:[{url:'https://jobs.test/a#three'},{url:'https://jobs.test/b'}]};
const compact=r=>({schema:'forge.discovery-health.v1',at:r.summary.at,failedBoards:r.summary.boards?.failed||0,candidates:r.new_roles.length,urls:[...new Set(r.new_roles.filter(x=>x&&typeof x.url==='string'&&/^https:\/\//.test(x.url)).map(x=>x.url.replace(/#.*$/,'')))]});
function fetchFixture({summaries=true,override=()=>undefined,revision=()=>sha}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push(url);const name=new URL(url).pathname.split('/').pop();const replacement=override(name,url,options);if(replacement!==undefined)return replacement;
  if(url.startsWith('https://api.github.com/'))return Response.json({ref:'refs/heads/main',object:{type:'commit',sha:revision()}});
  if(name.endsWith('-report.health.json'))return summaries?Response.json(compact(name.startsWith('source-')?sourceReport:boardReport)):new Response('',{status:404});
  if(name.endsWith('-report.json'))return Response.json(name.startsWith('source-')?sourceReport:boardReport);
  return reports[name]?Response.json(reports[name]):new Response('',{status:404});
 };return {fetcher,calls};
}
function cacheFixture(){const entries=new Map(),puts=[];return {entries,puts,async match(key){return entries.get(key.url)?.clone();},async put(key,value){puts.push(key.url);entries.set(key.url,value.clone());}};}

test('compact discovery preserves full-report output without reading descriptions',async()=>{
 const m=await api(),small=fetchFixture(),large=fetchFixture({summaries:false});
 const actual=await m.loadHealth(small.fetcher,now,sha),expected=await m.loadHealth(large.fetcher,now,sha);
 assert.deepEqual(actual,expected);assert.equal(actual.candidates,2);assert.equal(actual.checks.sources.candidates,5);assert.equal(actual.checks.boards.candidates,2);
 assert.equal(small.calls.length,10);assert.ok(small.calls.every(x=>!/-report\.json\?/.test(x)));assert.equal(large.calls.length,12);
 assert.ok(small.calls.every(x=>x.includes('/'+sha+'/')));
});
test('invalid or missing sidecars fall back independently and preserve partial failures',async()=>{
 for(const bad of [{schema:'wrong'}, {...compact(sourceReport),candidates:0}, {...compact(sourceReport),failedBoards:-1}, {...compact(sourceReport),urls:['http://unsafe.test/']}, {...compact(sourceReport),at:'bad'}]){
  const m=await api(),f=fetchFixture({override:name=>name==='source-trial-report.health.json'?Response.json(bad):undefined});
  const result=await m.loadHealth(f.fetcher,now,sha);assert.equal(result.checks.sources.candidates,5);assert.equal(result.candidates,2);assert.ok(f.calls.some(x=>x.includes('/source-trial-report.json?')));assert.ok(!f.calls.some(x=>x.includes('/board-discovery-report.json?')));
 }
 const m=await api(),f=fetchFixture({override:name=>name.startsWith('source-trial-report')?new Response('',{status:404}):undefined});
 const result=await m.loadHealth(f.fetcher,now,sha);assert.equal(result.checks.sources.ok,false);assert.equal(result.checks.boards.ok,true);assert.equal(result.candidates,2);
});
test('oversized summary is cancelled before decoding and falls back',async()=>{
 for(const contentLength of [true,false]){
  let cancelled=false;
  const m=await api(),f=fetchFixture({override:name=>name==='source-trial-report.health.json'?new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(256*1024+1));},cancel(){cancelled=true;}}),{headers:contentLength?{'Content-Length':String(256*1024+1)}:{}}):undefined});
  const result=await m.loadHealth(f.fetcher,now,sha);assert.equal(cancelled,true);assert.equal(result.checks.sources.ok,true);assert.equal(result.checks.sources.candidates,5);
 }
});
test('concurrent and repeat requests share one verified build without extending minute freshness',async()=>{
 const m=await api(),f=fetchFixture(),cache=cacheFixture();
 const responses=await Promise.all(Array.from({length:8},()=>m.healthResponse(f.fetcher,cache,now)));
 const bodies=await Promise.all(responses.map(x=>x.text()));assert.equal(new Set(bodies).size,1);assert.equal(f.calls.length,11);
 const repeated=await m.healthResponse(f.fetcher,cache,now+20000);assert.equal(await repeated.text(),bodies[0]);assert.equal(f.calls.length,11);assert.match(repeated.headers.get('cache-control'),/^public, max-age=(29|30)$/);
 await m.healthResponse(f.fetcher,cache,now+50000);assert.equal(f.calls.length,21,'minute boundary rebuilds even with unchanged source revision');
});
test('edge hits need no report parsing and a changed verified revision cannot reuse an old result',async()=>{
 const cache=cacheFixture(),first=await api(),f=fetchFixture();await first.healthResponse(f.fetcher,cache,now);
 const cold=await api(),next=fetchFixture();const hit=await cold.healthResponse(next.fetcher,cache,now+2000);assert.equal(next.calls.length,0);assert.equal((await hit.json()).sourceRevision,sha);
 const changed='b'.repeat(40);cache.entries.set('https://foreman-cockpit.pages.dev/__health_source_revision',Response.json({sha:changed,at:new Date(now+3000).toISOString()}));
 const fresh=await api(),last=fetchFixture({revision:()=>changed});const result=await fresh.healthResponse(last.fetcher,cache,now+4000);assert.equal((await result.json()).sourceRevision,changed);assert.equal(last.calls.length,10);assert.ok(last.calls.every(x=>x.includes('/'+changed+'/')));
});
test('partial evidence and unverified revisions are not memoized as a healthy result',async()=>{
 let fail=true;const m=await api(),cache=cacheFixture(),f=fetchFixture({override:name=>fail&&name==='PROCESS_COMPLETIONS.json'?new Response('',{status:404}):undefined});
 const partial=await m.healthResponse(f.fetcher,cache,now);assert.equal(partial.headers.get('cache-control'),'no-store');assert.equal((await partial.json()).checks.processStates.ok,false);assert.ok(cache.puts.every(x=>!x.includes('__health_response')));
 fail=false;assert.equal((await(await m.healthResponse(f.fetcher,cache,now+1)).json()).checks.processStates.ok,true);assert.equal(f.calls.length,21);
 const down=await api(),g=fetchFixture({override:(_,url)=>url.startsWith('https://api.github.com/')?new Response('',{status:429}):undefined}),other=cacheFixture();
 for(let i=0;i<2;i++){const response=await down.healthResponse(g.fetcher,other,now+i);assert.equal(response.headers.get('cache-control'),'no-store');const result=await response.json();assert.equal(result.checks.revision.ok,false);assert.equal(result.sourceRevision,'main');}
 assert.equal(other.puts.length,0);assert.equal(g.calls.length,21);
});
test('cache failures do not prevent a current, verified response',async()=>{
 const m=await api(),f=fetchFixture(),cache={async match(){throw Error('unavailable');},async put(){throw Error('unavailable');}};
 const result=await(await m.healthResponse(f.fetcher,cache,now)).json();assert.equal(result.checks.revision.ok,true);assert.deepEqual(result.decisionReady.ids,['ready']);
});
test('a new minute recomputes execution freshness without changing evidence timestamps',async()=>{
 const m=await api(),f=fetchFixture();const before=await(await m.healthResponse(f.fetcher,null,now)).json();assert.equal(before.checks.schedules.executionVerified,true);
 const after=await(await m.healthResponse(f.fetcher,null,now+90*60000)).json();assert.equal(after.checks.schedules.executionVerified,false);assert.equal(after.execution.at,at);assert.equal(after.observedAt,new Date(now+90*60000).toISOString());
});
test('the final millisecond of a minute never grants a fresh minute to the browser',async()=>{
 const m=await api(),f=fetchFixture();const response=await m.healthResponse(f.fetcher,null,now+49999);assert.equal(response.headers.get('cache-control'),'public, max-age=0');
});
