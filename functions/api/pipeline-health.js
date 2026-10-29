const BASE='https://raw.githubusercontent.com/tpruittguitar/forge-coordination/main/';
const FILES={attention:'attention/NEEDS_TIM.json',sources:'state/source-trial-report.json',boards:'state/board-discovery-report.json',schedules:'state/AUTOMATION_SCHEDULE_READBACK.json'};
export async function loadHealth(fetcher=fetch,now=Date.now()){
  const output={ok:true,observedAt:new Date(now).toISOString(),checks:{},issues:[],candidates:null};
  const urls=new Set();let reports=0;
  await Promise.all(Object.entries(FILES).map(async([key,file])=>{
    try{
      const res=await fetcher(BASE+file+'?cb='+Math.floor(now/60000),{signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw Error('HTTP '+res.status);
      const text=await res.text();if(text.length>8*1024*1024)throw Error('Snapshot too large');
      const j=JSON.parse(text);
      if(key==='attention'){
        if(j.schema!=='forge.needs-tim.v1'||!Array.isArray(j.items))throw Error('Unsupported incident feed');
        output.checks[key]={ok:true,at:j.builtAt};
        output.issues=j.items.filter(x=>x&&['BLOCKING','ACTION'].includes(x.level)).map(x=>({id:String(x.id||''),section:x.section||'',level:x.level,title:String(x.title||''),detail:String(x.detail||''),action:String(x.action||''),at:x.at||null,sourceUrl:/^https:\/\/github.com\/tpruittguitar\//.test(x.sourceUrl||'')?x.sourceUrl:null}));
      }else if(key==='schedules'){
        if(j.schema!=='forge.schedule-readback.v1'||!Array.isArray(j.local))throw Error('Unsupported schedule readback');
        output.checks[key]={ok:true,at:j.at,configured:j.local.filter(x=>x.status==='ACTIVE').length,executionVerified:j.executionVerified===true};
      }else{
        if(!j.summary||!j.summary.at||!Array.isArray(j.new_roles))throw Error('Unsupported discovery report');
        output.checks[key]={ok:true,at:j.summary.at,failedBoards:j.summary.boards?.failed||0,candidates:j.new_roles.length};
        j.new_roles.forEach(x=>{if(x&&typeof x.url==='string'&&/^https:\/\//.test(x.url))urls.add(x.url.replace(/#.*$/,''));});reports++;
      }
    }catch(e){output.checks[key]={ok:false,error:key==='schedules'?'Schedule execution not reported':'Could not read '+key+' evidence'};}
  }));
  if(reports)output.candidates=urls.size;
  return output;
}
export async function onRequestGet(){
  return new Response(JSON.stringify(await loadHealth()),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=60'}});
}
