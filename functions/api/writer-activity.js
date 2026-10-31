// Read a bounded background-built summary. Never parse the full growing receipt ledger on a web request.
const BASE='https://raw.githubusercontent.com/tpruittguitar/forge-coordination/';
const headers={'Content-Type':'application/json','Cache-Control':'public, max-age=60'};
export async function loadActivity(fetcher=fetch,now=Date.now(),revision='main'){
 if(revision!=='main'&&!/^[a-f0-9]{40}$/.test(revision))throw Error('Invalid evidence revision');
 const SOURCE=BASE+revision+'/state/WRITER_ACTIVITY.json';
 let res;
 for(let attempt=0;attempt<2;attempt++){
  res=await fetcher(SOURCE+'?cb='+Math.floor(now/60000)+'&attempt='+attempt,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','Cache-Control':'no-cache'}});
  if(res.ok)break;if(res.status<500)break;
 }
 if(!res.ok)throw Error('Receipt summary unavailable ('+res.status+')');
 if(Number(res.headers.get('Content-Length'))>256*1024)throw Error('Receipt summary exceeds size budget');
 const reader=res.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>256*1024)throw Error('Receipt summary exceeds size budget');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel();}
 const j=JSON.parse(text),at=Date.parse(j.publishedAt),indexAt=Date.parse(j.indexUpdatedAt);
 if(j.schema!=='forge.writer-activity.v1'||j.ok!==true||j.source?.repo!=='tpruittguitar/forge-writer-state'||!/^[a-f0-9]{40}$/.test(j.source.sha||'')||!j.today||!j.recent||!Array.isArray(j.buckets)||!Number.isFinite(at)||!Number.isFinite(indexAt)||at>now+120000||now-at>30*60000||now-indexAt>40*60000||indexAt>at+120000)throw Error('Receipt summary stale or invalid');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 if(j.todayDate!==today)throw Error('Receipt summary awaits Eastern day rollover');
 return {...j,servedAt:new Date(now).toISOString(),summaryAgeSeconds:Math.max(0,Math.floor((now-at)/1000))};
}
export async function onRequestGet(){
 try{const {currentRevision}=await import('./pipeline-health.js');let revision='main';try{revision=await currentRevision(fetch,globalThis.caches?.default||null);}catch{}
  return new Response(JSON.stringify(await loadActivity(fetch,Date.now(),revision)),{headers});}
 catch(e){return new Response(JSON.stringify({ok:false,error:'Durable receipt activity unavailable: '+e.message}),{status:503,headers:{...headers,'Cache-Control':'no-store'}});}
}
