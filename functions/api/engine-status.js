// cs-32ab60a7 PR 2: read-only engine status (forge.engine-status.v1). GET only, no writes of any kind.
// Validation, constraint, queue growth, age bands and copy all come from the PR 1 logic module; this file only reads and keeps.
import EngineStatusModule from '../../pipeline-engine-status.js';
const E=EngineStatusModule&&typeof EngineStatusModule.evaluate==='function'?EngineStatusModule:EngineStatusModule.default;

// The one feed path. Rebuild 2 writes this file; Pages serves it as a same-origin static asset (pages_build_output_dir = ".").
export const FEED_PATH='tools/pipeline-v2/out/engine-status.json';
const MAX_FEED_BYTES=512*1024;
const headers={'Content-Type':'application/json','Cache-Control':'private, no-store'};

// Default reader: same-origin GET of '/' + FEED_PATH, through the Pages asset binding when present.
export function sameOriginReader(request,env,fetcher=fetch){
 return async function readFeed(path){
  const url=new URL('/'+path,request.url).toString();
  const get=env&&env.ASSETS&&typeof env.ASSETS.fetch==='function'?u=>env.ASSETS.fetch(u):u=>fetcher(u,{cache:'no-store',headers:{Accept:'application/json'}});
  const res=await get(url);
  if(!res.ok)throw Error('Engine status feed unavailable ('+res.status+')');
  const text=await res.text();
  if(text.length>MAX_FEED_BYTES)throw Error('Engine status feed exceeds size budget');
  return text;
 };
}

const atMs=env=>env&&typeof env.at==='string'?Date.parse(env.at):NaN;

// One serve. kept.value holds the last good RAW envelope (never an evaluated snapshot), so age and copy are recomputed each time.
export async function loadEngineStatus(readFeed,now=Date.now(),kept={value:null}){
 const t=now instanceof Date?now.getTime():now;
 let live=null;
 try{const raw=await readFeed(FEED_PATH);live=typeof raw==='string'?JSON.parse(raw):raw;}catch{live=null;}
 if(live!=null){
  const r=E.evaluate(live,t);
  if(r.status!=='error'){
   const k=kept.value;
   if(!k||!(atMs(k)>atMs(live)))kept.value=live;
   return {body:r,source:'live'};
  }
 }
 // Live read failed, was missing, or was not a valid v1 envelope: serve the last good copy through evaluate.
 // Under 90 min that is ok, 90 min to 24 h is stale with its numbers, 24 h or older is expired with no current steps.
 if(kept.value)return {body:E.evaluate(kept.value,t),source:'last-good'};
 return {body:E.evaluate(live,t),source:'none'};
}

export function respond(result){
 return new Response(JSON.stringify(result.body),{status:200,headers:{...headers,'X-Engine-Status-Source':result.source}});
}

const KEPT={value:null};
// Injectable clock, last-good holder and fetcher for tests; production uses the module-level holder.
export async function handleGet(context,{now=Date.now,kept=KEPT,fetcher=fetch}={}){
 const readFeed=sameOriginReader(context.request,context.env,fetcher);
 return respond(await loadEngineStatus(readFeed,now(),kept));
}
export function onRequestGet(context){return handleGet(context);}
