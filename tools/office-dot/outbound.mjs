import {open,seal,jobId,checkJob} from '../../lib/office-relay/crypto.mjs';
import {relayImages} from '../../lib/office-relay/hosted.mjs';
import {codexImageInput,attachmentBinding} from '../../lib/office-images.mjs';
import {validRoute} from '../../lib/office-route.mjs';
const terminal=new Set(['completed','finished','awaiting_review','failed','unknown']);
// One outbound polling pass; no listener, timer installation, auth bypass or lease reclaim.
export async function runMailboxOnce({mailbox,config,jobVerificationKey,statusSigningKey,ledger,adapter,now=()=>Math.floor(Date.now()/1000),pollMs=2000}) {
 await mailbox.verifyPrivate();const lock=ledger.acquireWorkerLock(config.workerId);if(!lock)return {dispatched:0,busy:true};
 try { let dispatched=0;
 for(const id of await mailbox.listReady()) {
  const ready=await mailbox.get('ready/'+id+'.json');if(!ready)continue;
  let value,job;
  try {value=await open(ready.value,'job',jobVerificationKey);job=checkJob(value,config,now());if(await jobId(job)!==id)continue;const source=await mailbox.get('jobs/'+id+'.json');if(JSON.stringify(source?.value)!==JSON.stringify(ready.value))continue;await codexImageInput(job,relayImages(mailbox));}catch{continue;}
  // A permanent create-only marker wins once. No expiry/reclaim, even after a crash.
  if(!await mailbox.put('claims/'+id+'.json',{workerId:config.workerId,jobSignature:ready.value.signature}))continue;
  // Trusted local SQLite ledger also prevents replay after a mailbox marker is deleted.
  const claimed=await ledger.claim('outbound:'+id,{status:'claimed',jobSignature:ready.value.signature});if(!claimed.created)continue;
  // Validate expiry and bytes again after the claim and before native dispatch.
  checkJob(value,config,now());await codexImageInput(job,relayImages(mailbox));
  let previous='',revision;
  async function publish(event){
   const safe={status:event.status};if(!['queued','running','awaiting_approval',...terminal].includes(safe.status))throw Error('Invalid native status');
   for(const field of ['approach','outcome'])if(event[field]){if(!validRoute(event[field]))throw Error('Invalid native route');safe[field]=event[field];}
   if(event.pullRequest)safe.pullRequest=event.pullRequest;
   const serialized=JSON.stringify(safe);if(serialized===previous)return;
   const t=now(),signed=await seal('status',{jobId:id,workerId:config.workerId,jobSignature:ready.value.signature,issuedAt:t,expiresAt:t+86400,event:safe},statusSigningKey);
   if(!await mailbox.put('status/'+id+'.json',signed,revision))throw Error('Status conflict; do not replay');
   const saved=await mailbox.get('status/'+id+'.json');if(JSON.stringify(saved?.value)!==JSON.stringify(signed))throw Error('Status write uncertain');revision=saved.sha;previous=serialized;
  }
  // No error path retries a native turn or resets an execution claim.
  checkJob(value,config,now());await adapter.submit(job);dispatched++;
  let complete=false;const work=Promise.resolve(adapter.queue).finally(()=>{complete=true;});
  while(!complete){await publish(await adapter.status(attachmentBinding(job)));await Promise.race([work,new Promise(r=>setTimeout(r,pollMs))]);}
  await work;await publish(await adapter.status(attachmentBinding(job)));
 }
 return {dispatched};
 } finally { await adapter.queue;ledger.releaseWorkerLock(config.workerId,lock); }
}
