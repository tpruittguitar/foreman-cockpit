const BASE='https://raw.githubusercontent.com/tpruittguitar/forge-coordination/';
const FILES={processStates:'state/PROCESS_COMPLETIONS.json',processFlow:'state/ENRICHMENT_FLOW.json',applicationOutcomes:'state/APPLICATION_OUTCOMES.json',emailRecovery:'state/EMAIL_RECOVERY_SUMMARY.json',attention:'attention/NEEDS_TIM.json',sources:'state/source-trial-report.json',boards:'state/board-discovery-report.json',schedules:'state/AUTOMATION_SCHEDULE_READBACK.json',boardHealth:'state/board-health.json',execution:'state/AUTOMATION_EXECUTION_EVIDENCE.json'};
async function readSnapshot(fetcher,url){
  for(let attempt=0;attempt<2;attempt++){
    try{const r=await fetcher(url,{cache:'no-store',headers:{'Accept':'application/json'},signal:AbortSignal.timeout(7000)});if(attempt===0&&[408,500,502,503,504].includes(r.status)){await r.body?.cancel();continue;}return r;}
    catch(e){if(attempt)throw e;}
  }
}
// Read only a bounded projection on the normal discovery path. The producer writes
// it in the same commit as the full report, so the existing revision pin still applies.
async function readJson(fetcher,url,limit){
  const res=await readSnapshot(fetcher,url);
  if(!res.ok){await res.body?.cancel();throw Error('HTTP '+res.status);}
  if(Number(res.headers.get('Content-Length'))>limit){await res.body?.cancel();throw Error('Snapshot too large');}
  const reader=res.body?.getReader();if(!reader)throw Error('Empty snapshot');
  const decoder=new TextDecoder();let text='',bytes=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit)throw Error('Snapshot too large');text+=decoder.decode(value,{stream:true});}
    text+=decoder.decode();
  }finally{await reader.cancel();}
  return JSON.parse(text);
}
async function readDiscovery(fetcher,url){
  try{
    const j=await readJson(fetcher,url.replace('.json?','.health.json?'),256*1024);
    if(j.schema!=='forge.discovery-health.v1'||!Number.isFinite(Date.parse(j.at))||!Number.isSafeInteger(j.failedBoards)||j.failedBoards<0||!Number.isSafeInteger(j.candidates)||j.candidates<0||!Array.isArray(j.urls)||j.urls.length>j.candidates||j.urls.some(u=>typeof u!=='string'||!/^https:\/\//.test(u)))throw Error('Invalid discovery summary');
    return j;
  }catch{
    // Older producer revisions and failed summary publication remain readable.
    const j=await readJson(fetcher,url,8*1024*1024);
    if(!j.summary||!j.summary.at||!Array.isArray(j.new_roles))throw Error('Unsupported discovery report');
    return {at:j.summary.at,failedBoards:j.summary.boards?.failed||0,candidates:j.new_roles.length,urls:j.new_roles.filter(x=>x&&typeof x.url==='string'&&/^https:\/\//.test(x.url)).map(x=>x.url)};
  }
}
export async function loadHealth(fetcher=fetch,now=Date.now(),revision='main'){
  if(revision!=='main'&&!/^[a-f0-9]{40}$/.test(revision))throw Error('Invalid evidence revision');
  const output={ok:true,sourceRevision:revision,observedAt:new Date(now).toISOString(),checks:{},issues:[],candidates:null};
  const urls=new Set();let reports=0;
  await Promise.all(Object.entries(FILES).map(async([key,file])=>{
    try{
      const url=BASE+revision+'/'+file+'?cb='+Math.floor(now/60000);
      const j=key==='sources'||key==='boards'?await readDiscovery(fetcher,url):await readJson(fetcher,url,8*1024*1024);
      if(key==='processStates'){
        if(j.schema!=='forge.process-completions.v1'||j.model!=='four-stage-v2'||!j.states||!Number.isFinite(Date.parse(j.at)))throw Error('Invalid readiness snapshot');
        output.decisionReady={at:j.at,ids:Object.keys(j.states).filter(id=>j.states[id].enrichment===true&&j.states[id].closed===false)};output.checks[key]={ok:true,at:j.at};
      }else if(key==='processFlow'){
        if(j.schema!=='forge.enrichment-flow.v1'||!Number.isFinite(Date.parse(j.at)))throw Error('Invalid process flow');output.processFlow=j;output.checks[key]={ok:true,at:j.at};
      }else if(key==='applicationOutcomes'){
        if(j.schema!=='forge.application-outcomes.v1'||!Array.isArray(j.events))throw Error('Invalid application outcomes');output.applicationOutcomes={at:j.at,events:j.events.map(e=>({primaryId:e.primaryId,type:e.type,eventDate:e.eventDate,stage:e.stage,progress:e.progress,sourceType:e.sourceType||(e.gmailMessageId?'EMAIL':undefined),evidenceVerified:e.evidenceVerified===true})),coverageComplete:j.coverageComplete===true};output.checks[key]={ok:true,at:j.at};
      }else if(key==='emailRecovery'){
        if(j.schema!=='forge.email-recovery-summary.v1'||!Number.isFinite(Date.parse(j.at))||!Number.isInteger(j.capturedUniqueJobs)||j.capturedUniqueJobs<0||!Number.isInteger(j.pendingJobs)||j.pendingJobs<0)throw Error('Invalid recovery summary');
        output.emailRecovery=j;output.checks[key]={ok:true,at:j.at};
      }else if(key==='attention'){
        if(j.schema!=='forge.needs-tim.v1'||!Array.isArray(j.items))throw Error('Unsupported incident feed');
        output.checks[key]={ok:true,at:j.builtAt};
        output.issues=j.items.filter(x=>x&&['BLOCKING','ACTION'].includes(x.level)).map(x=>({id:String(x.id||''),section:x.section||'',level:x.level,title:String(x.title||''),detail:String(x.detail||''),action:String(x.action||''),at:x.at||null,sourceUrl:/^https:\/\/github.com\/tpruittguitar\//.test(x.sourceUrl||'')?x.sourceUrl:null}));
      }else if(key==='execution'){
        if(j.schema!=='forge.automation-evidence.v1'||!Array.isArray(j.executions)||!Array.isArray(j.schedules?.active)||!Number.isFinite(Date.parse(j.at)))throw Error('Unsupported execution evidence');
        output.execution=j;
        output.checks[key]={ok:true,at:j.at};
        const capture=j.emailCapture;
        if(capture&&capture.corroborated===true&&capture.coverageComplete===false&&Number.isFinite(Date.parse(capture.at))&&Number.isSafeInteger(capture.messagesRead)&&capture.messagesRead>0&&/^receipts\/FORGE-CODE-CHATGPT-[A-Za-z0-9_-]+_MAIL\.json$/.test(capture.sourceFile||''))output.checks.emailCapture={ok:true,...capture};
        const c=j.emailCoverage;
        if(c&&c.writerProofsVerified===true&&Number.isFinite(Date.parse(c.at))&&/^receipts\/EMAIL_FINAL_FORGE-EMAIL-CHATGPT-/.test(c.sourceFile||''))output.checks.emailCoverage={ok:true,...c};
      }else if(key==='boardHealth'){
        if(j.schema!=='forge.board-health.v1'||!j.boards||Array.isArray(j.boards))throw Error('Unsupported board history');
        output.boardHealth=Object.values(j.boards).filter(x=>x&&!x.paused&&typeof x.key==='string').map(x=>({key:x.key,companies:Array.isArray(x.companies)?x.companies.slice(0,10).map(c=>String(c).slice(0,150)):[],status:String(x.status||'UNKNOWN'),error:String(x.error||'').slice(0,150),httpStatus:Number.isInteger(x.httpStatus)?x.httpStatus:null,lastAttemptAt:x.lastAttemptAt||null,lastSuccessAt:x.lastSuccessAt||null,retryAt:x.retryAt||null,consecutiveFailures:Math.max(0,+x.consecutiveFailures||0)}));
        output.checks[key]={ok:true,at:j.at,tracked:output.boardHealth.length,pending:output.boardHealth.filter(x=>x.status!=='OK').length};
      }else if(key==='schedules'){
        if(j.schema!=='forge.schedule-readback.v1'||!Array.isArray(j.local))throw Error('Unsupported schedule readback');
        output.checks[key]={ok:true,at:j.at,configured:j.local.filter(x=>x.status==='ACTIVE'&&x.managed!==false).length,ids:j.local.filter(x=>x.status==='ACTIVE'&&x.managed!==false).map(x=>x.id),executionVerified:false,
          taskExecutionVerified:false,nativeInvocationVerified:false,configurationReadbackScope:j.configurationReadbackScope||'UNSPECIFIED',
          configurationDiscrepancies:Array.isArray(j.configurationDiscrepancies)?j.configurationDiscrepancies:[]};
      }else{
        output.checks[key]={ok:true,at:j.at,failedBoards:j.failedBoards,candidates:j.candidates};
        j.urls.forEach(url=>urls.add(url.replace(/#.*$/,'')));reports++;
      }
    }catch(e){output.checks[key]={ok:false,error:key==='schedules'?'Schedule execution not reported':'Could not read '+key+' evidence'};}
  }));
  // Configuration and execution are different evidence. Never promote configuration alone.
  const e=output.execution,s=output.checks.schedules;
  if(e&&s?.ok&&now-Date.parse(e.at)<90*60000&&now>=Date.parse(e.at)){
    const active=e.schedules.active;
    const matches=active.length===s.configured&&active.length>0&&new Set(active.map(x=>x.id)).size===s.configured&&active.every(x=>s.ids.includes(x.id));
    const taskVerified=matches&&active.every(x=>(x.taskExecutionVerified??x.executionVerified)===true);
    output.checks.schedules={...s,executionVerified:taskVerified,taskExecutionVerified:taskVerified,
      nativeInvocationVerified:matches&&active.every(x=>x.nativeInvocationVerified===true),
      nativeInvocationStatus:e.schedules.nativeInvocationStatus||'NOT_OBSERVED',
      serviceWorkVerified:Array.isArray(e.services)&&e.services.some(x=>x.workEvidenceVerified===true),
      configurationDiscrepancies:[...s.configurationDiscrepancies,...(Array.isArray(e.schedules.configurationDiscrepancies)?e.schedules.configurationDiscrepancies:[])],
      executionAt:e.at,unverified:active.filter(x=>(x.taskExecutionVerified??x.executionVerified)!==true).map(x=>x.id)};
  }
  if(reports)output.candidates=urls.size;
  if(output.decisionReady&&(!output.processFlow||output.decisionReady.at!==output.processFlow.at||output.decisionReady.ids.length!==output.processFlow.queues.readyForReview)){output.decisionReady=null;output.checks.processStates={ok:false,error:'Readiness does not reconcile with process flow'};}
  return output;
}
// Resolve once per minute and pin every file to one immutable commit. Branch raw URLs can lag main.
let revisionMemo=null,revisionPending=null,revisionFailureUntil=0;
export async function currentRevision(fetcher=fetch,cache=null,now=Date.now()){
  const valid=x=>x&&/^[a-f0-9]{40}$/.test(x.sha||'')&&Number.isFinite(Date.parse(x.at))&&now>=Date.parse(x.at)&&now-Date.parse(x.at)<60000;
  if(valid(revisionMemo))return revisionMemo.sha;
  if(revisionPending)return revisionPending;
  if(now<revisionFailureUntil)throw Error('Evidence revision check is temporarily unavailable');
  revisionPending=(async()=>{
    const key=new Request('https://foreman-cockpit.pages.dev/__health_source_revision');
    if(cache)try{const hit=await cache.match(key),saved=hit&&await hit.json();if(valid(saved)){revisionMemo=saved;return saved.sha;}}catch{}
    const r=await fetcher('https://api.github.com/repos/tpruittguitar/forge-coordination/git/ref/heads/main',{headers:{Accept:'application/vnd.github+json','User-Agent':'forge-pipeline-health'},cache:'no-store',signal:AbortSignal.timeout(7000)});
    if(!r.ok)throw Error('Evidence revision HTTP '+r.status);const j=await r.json();
    if(j.ref!=='refs/heads/main'||j.object?.type!=='commit'||!/^[a-f0-9]{40}$/.test(j.object?.sha||''))throw Error('Invalid main revision');
    revisionMemo={sha:j.object.sha,at:new Date(now).toISOString()};
    if(cache)try{await cache.put(key,new Response(JSON.stringify(revisionMemo),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60'}}));}catch{}
    return revisionMemo.sha;
  })();
  try{return await revisionPending;}catch(e){revisionFailureUntil=now+60000;throw e;}finally{revisionPending=null;}
}
// Cache only fully verified results, keyed by both immutable revision and minute.
// A minute boundary expires client and server results together; cached observations
// never extend the existing freshness window, even after a source revision changes.
let healthMemo=null,healthPending=null;
const responseHeaders=remaining=>({'Content-Type':'application/json','Cache-Control':'public, max-age='+Math.max(0,Math.floor(remaining/1000))});
export async function healthResponse(fetcher=fetch,cache=null,now=Date.now()){
  const started=Date.now(),minute=Math.floor(now/60000);
  const headers=complete=>complete?responseHeaders((minute+1)*60000-now-(Date.now()-started)):{'Content-Type':'application/json','Cache-Control':'no-store'};
  let revision='main',error='';try{revision=await currentRevision(fetcher,cache,now);}catch{error='Could not verify current main revision';}
  const id=revision+'/'+minute;
  if(!error&&healthMemo?.id===id)return new Response(healthMemo.body,{headers:headers(true)});
  if(!error&&healthPending?.id===id){const result=await healthPending.result;return new Response(result.body,{headers:headers(result.complete)});}
  const key=new Request('https://foreman-cockpit.pages.dev/__health_response/v1/'+id);
  const build=async()=>{
    if(!error&&cache)try{
      const hit=await cache.match(key);
      if(hit){const body=await hit.text();healthMemo={id,body};return {body,complete:true};}
    }catch{}
    const result=await loadHealth(fetcher,now,revision);
    result.checks.revision={ok:!error,sha:error?null:revision,error:error||undefined};
    const body=JSON.stringify(result);
    const complete=!error&&Object.keys(FILES).every(k=>result.checks[k]?.ok===true);
    if(complete){
      healthMemo={id,body};
      if(cache)try{await cache.put(key,new Response(body,{headers:headers(true)}));}catch{}
    }
    return {body,complete};
  };
  // Share both cold summary builds and edge-cache hits within this isolate.
  const pending={id,result:build()};
  if(!error)healthPending=pending;
  try{const result=await pending.result;return new Response(result.body,{headers:headers(result.complete)});}
  finally{if(healthPending===pending)healthPending=null;}
}
export async function onRequestGet(){
  return healthResponse(fetch,globalThis.caches?.default||null);
}
