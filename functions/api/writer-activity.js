import activity from '../../pipeline-writer-activity.js';

const SOURCE='https://raw.githubusercontent.com/tpruittguitar/forge-writer-state/main/PIPELINE_RECEIPT_INDEX.json';
const headers={'Content-Type':'application/json','Cache-Control':'public, max-age=60'};
export async function loadActivity(fetcher=fetch,now=Date.now()){
  const res=await fetcher(SOURCE+'?cb='+Math.floor(now/60000),{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  if(!res.ok)throw Error('Receipt source unavailable ('+res.status+')');
  const text=await res.text();if(text.length>8*1024*1024)throw Error('Receipt snapshot exceeds supported size');
  return activity.aggregate(JSON.parse(text),now);
}
export async function onRequestGet(){
  try{return new Response(JSON.stringify(await loadActivity()),{headers});}
  catch(e){return new Response(JSON.stringify({ok:false,error:'Durable receipt activity unavailable'}),{status:503,headers:{...headers,'Cache-Control':'no-store'}});}
}
