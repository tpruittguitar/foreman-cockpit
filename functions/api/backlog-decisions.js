// Discovery-only decisions. No canonical Writer mutation and no optimistic removal.
const PREFIX = 'backlog-decisions/v1/';
const RAW = 'https://raw.githubusercontent.com/tpruittguitar/forge-coordination/main/';
const WRITER = 'https://script.google.com/macros/s/AKfycbwShspSkto70NeFWjgTuyIf-W3EDgUmKmoWevE-jZq95pm6SAulrJYHX1HmiPg8tx3i/exec';
const headers = {'content-type':'application/json','cache-control':'private, no-store','vary':'x-writer-key'};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
function normalize(body) {
  if (!/^[0-9a-f-]{36}$/i.test(body.requestId||'') || !/^[0-9a-f]{40}$/.test(body.snapshotRevision||'') || !['DECLINE','DELETE'].includes(body.decision)) throw Error('INVALID_REQUEST');
  if (!Array.isArray(body.items)||!body.items.length||body.items.length>100) throw Error('SELECT_1_TO_100_CANDIDATES');
  const keys=body.items.map(i=>i.key);
  if(keys.some(k=>typeof k!=='string'||! /^(linkedin:\d+|url:[a-f0-9]{24})$/.test(k))||new Set(keys).size!==keys.length) throw Error('UNIQUE_DISCOVERY_KEYS_REQUIRED');
  return {schema:'forge.manual-backlog-request.v1',requestId:body.requestId.toLowerCase(),snapshotRevision:body.snapshotRevision,decision:body.decision,items:keys.sort().map(key=>({key}))};
}
async function read(path) {
  const r=await fetch(RAW+path,{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(r.status===404)return null;
  if(!r.ok)throw Error('COORDINATION_READ_UNAVAILABLE');
  return r.json();
}
async function capabilities() {
  const m=await read('state/PIPELINE_WAITING_QUEUES.json');
  const age=Date.now()-Date.parse(m?.at);
  const enabled=m?.manualDecisions?.version===1 && Number.isFinite(age) && age>=0 && age<30*60000;
  return {ok:true,enabled,maxBatch:100,reason:enabled?'Existing observer processes authenticated selections; removal requires committed receipt.':'Manual decision observer is not yet available or current.'};
}
export async function onRequest({request,env}) {
 try {
  const url=new URL(request.url),method=request.method;
  if(!['GET','POST'].includes(method))return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  const raw=method==='POST'?await request.text():'';
  if(raw.length>20000)return json({ok:false,error:'REQUEST_TOO_LARGE'},413);
  const body=raw?JSON.parse(raw):{},action=body.action||url.searchParams.get('action')||'capabilities';
  if(method==='GET'&&action==='capabilities')return json(await capabilities());
  const key=request.headers.get('x-writer-key');
  if(!key||key.length>2048)return json({ok:false,error:'WRITER_KEY_REQUIRED'},401);
  const auth=await fetch(WRITER+'?action=ping&key='+encodeURIComponent(key),{signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!auth.ok||(await auth.json()).ok!==true)return json({ok:false,error:'WRITER_KEY_REJECTED'},401);
  const kv=env?.PIPELINE_SNAPSHOT_KV;
  if(!kv)return json({ok:false,error:'KV_NOT_BOUND'},503);
  if(method==='GET'&&action==='receipt') {
   const id=url.searchParams.get('receiptId');
   if(!/^[a-f0-9]{64}$/.test(id||''))throw Error('INVALID_RECEIPT_ID');
   const receipt=await read('receipts/manual-backlog/'+id+'.json');
   if(receipt)return json({ok:true,...receipt});
   const queued=await kv.get(PREFIX+id,'json');
   return queued?json({ok:true,status:'QUEUED',receiptId:id,requestId:queued.requestId,items:queued.items.map(i=>({...i,status:'QUEUED'}))}):json({ok:false,status:'UNKNOWN',error:'REQUEST_NOT_YET_OBSERVED',receiptId:id},404);
  }
  if(method==='GET'&&action==='queue') {
   const page=await kv.list({prefix:PREFIX,limit:100,cursor:url.searchParams.get('cursor')||undefined});
   const requests=(await Promise.all(page.keys.map(k=>kv.get(k.name,'json')))).filter(Boolean);
   return json({ok:true,requests,cursor:page.list_complete?null:page.cursor});
  }
  if(method!=='POST'||action!=='submit')throw Error('UNSUPPORTED_ACTION');
  if(!(await capabilities()).enabled)return json({ok:false,error:'OBSERVER_NOT_READY'},503);
  const normalized=normalize(body),receiptId=await hash(JSON.stringify(normalized));
  // Content addressing means concurrent/double clicks cannot overwrite a different request.
  const existing=await kv.get(PREFIX+receiptId,'json');
  if(!existing)await kv.put(PREFIX+receiptId,JSON.stringify({...normalized,receiptId,submittedAt:new Date().toISOString()}));
  return json({ok:true,status:'QUEUED',receiptId,requestId:normalized.requestId,items:normalized.items.map(i=>({...i,status:'QUEUED'})),canonicalWrites:0},202);
 }catch(e){return json({ok:false,error:String(e.message||e)},400);}
}
