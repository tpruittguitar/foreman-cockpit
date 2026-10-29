import activity from '../../pipeline-writer-activity.js';

const SOURCE='https://raw.githubusercontent.com/tpruittguitar/forge-writer-state/main/PIPELINE_RECEIPT_INDEX.json';
const RECOVERY='https://raw.githubusercontent.com/tpruittguitar/forge-coordination/main/verify/recovery/latest.json';
const headers={'Content-Type':'application/json','Cache-Control':'public, max-age=60'};
export async function loadActivity(fetcher=fetch,now=Date.now()){
  const res=await fetcher(SOURCE+'?cb='+Math.floor(now/60000),{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  if(!res.ok)throw Error('Receipt source unavailable ('+res.status+')');
  const text=await res.text();if(text.length>8*1024*1024)throw Error('Receipt snapshot exceeds supported size');
  let recovery=null;
  try{const r=await fetcher(RECOVERY+'?cb='+Math.floor(now/60000),{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','Cache-Control':'no-cache'}});if(r.ok){const t=await r.text();if(t.length<=2*1024*1024)recovery=JSON.parse(t);}}catch{}
  return activity.aggregate(JSON.parse(text),now,recovery);
}
export async function onRequestGet(){
  try{return new Response(JSON.stringify(await loadActivity()),{headers});}
  catch(e){return new Response(JSON.stringify({ok:false,error:'Durable receipt activity unavailable'}),{status:503,headers:{...headers,'Cache-Control':'no-store'}});}
}
