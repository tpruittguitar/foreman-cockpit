const BASE='https://raw.githubusercontent.com/tpruittguitar/forge-coordination/';
const FILES={emailRecovery:'state/EMAIL_RECOVERY_SUMMARY.json',attention:'attention/NEEDS_TIM.json',sources:'state/source-trial-report.json',boards:'state/board-discovery-report.json',schedules:'state/AUTOMATION_SCHEDULE_READBACK.json',boardHealth:'state/board-health.json',execution:'state/AUTOMATION_EXECUTION_EVIDENCE.json'};
async function readSnapshot(fetcher,url){
  for(let attempt=0;attempt<2;attempt++){
    try{const r=await fetcher(url,{cache:'no-store',headers:{'Accept':'application/json'},signal:AbortSignal.timeout(7000)});if(attempt===0&&[408,500,502,503,504].includes(r.status))continue;return r;}
    catch(e){if(attempt)throw e;}
  }
}
export async function loadHealth(fetcher=fetch,now=Date.now(),revision='main'){
  if(revision!=='main'&&!/^[a-f0-9]{40}$/.test(revision))throw Error('Invalid evidence revision');
  const output={ok:true,sourceRevision:revision,observedAt:new Date(now).toISOString(),checks:{},issues:[],candidates:null};
  const urls=new Set();let reports=0;
  await Promise.all(Object.entries(FILES).map(async([key,file])=>{
    try{
      const res=await readSnapshot(fetcher,BASE+revision+'/'+file+'?cb='+Math.floor(now/60000));
      if(!res.ok)throw Error('HTTP '+res.status);
      const text=await res.text();if(text.length>8*1024*1024)throw Error('Snapshot too large');
      const j=JSON.parse(text);
      if(key==='emailRecovery'){
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
        const c=j.emailCoverage;
        if(c&&c.writerProofsVerified===true&&Number.isFinite(Date.parse(c.at))&&/^receipts\/EMAIL_FINAL_FORGE-EMAIL-CHATGPT-/.test(c.sourceFile||''))output.checks.emailCoverage={ok:true,...c};
      }else if(key==='boardHealth'){
        if(j.schema!=='forge.board-health.v1'||!j.boards||Array.isArray(j.boards))throw Error('Unsupported board history');
        output.boardHealth=Object.values(j.boards).filter(x=>x&&!x.paused&&typeof x.key==='string').map(x=>({key:x.key,companies:Array.isArray(x.companies)?x.companies.slice(0,10).map(c=>String(c).slice(0,150)):[],status:String(x.status||'UNKNOWN'),error:String(x.error||'').slice(0,150),httpStatus:Number.isInteger(x.httpStatus)?x.httpStatus:null,lastAttemptAt:x.lastAttemptAt||null,lastSuccessAt:x.lastSuccessAt||null,retryAt:x.retryAt||null,consecutiveFailures:Math.max(0,+x.consecutiveFailures||0)}));
        output.checks[key]={ok:true,at:j.at,tracked:output.boardHealth.length,pending:output.boardHealth.filter(x=>x.status!=='OK').length};
      }else if(key==='schedules'){
        if(j.schema!=='forge.schedule-readback.v1'||!Array.isArray(j.local))throw Error('Unsupported schedule readback');
        output.checks[key]={ok:true,at:j.at,configured:j.local.filter(x=>x.status==='ACTIVE').length,ids:j.local.filter(x=>x.status==='ACTIVE').map(x=>x.id),executionVerified:j.executionVerified===true};
      }else{
        if(!j.summary||!j.summary.at||!Array.isArray(j.new_roles))throw Error('Unsupported discovery report');
        output.checks[key]={ok:true,at:j.summary.at,failedBoards:j.summary.boards?.failed||0,candidates:j.new_roles.length};
        j.new_roles.forEach(x=>{if(x&&typeof x.url==='string'&&/^https:\/\//.test(x.url))urls.add(x.url.replace(/#.*$/,''));});reports++;
      }
    }catch(e){output.checks[key]={ok:false,error:key==='schedules'?'Schedule execution not reported':'Could not read '+key+' evidence'};}
  }));
  // Configuration and execution are different evidence. Never promote configuration alone.
  const e=output.execution,s=output.checks.schedules;
  if(e&&s?.ok&&now-Date.parse(e.at)<90*60000&&now>=Date.parse(e.at)){
    const active=e.schedules.active;
    output.checks.schedules={...s,executionVerified:active.length===s.configured&&active.length>0&&new Set(active.map(x=>x.id)).size===s.configured&&active.every(x=>s.ids.includes(x.id)&&x.executionVerified===true),executionAt:e.at,unverified:active.filter(x=>x.executionVerified!==true).map(x=>x.id)};
  }
  if(reports)output.candidates=urls.size;
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
export async function onRequestGet(){
  let revision='main',error='';try{revision=await currentRevision(fetch,globalThis.caches?.default||null);}catch(e){error='Could not verify current main revision';}
  const result=await loadHealth(fetch,Date.now(),revision);result.checks.revision={ok:!error,sha:error?null:revision,error:error||undefined};
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60'}});
}
