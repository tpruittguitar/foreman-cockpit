import {createCodingService} from '../office-coding.mjs';
import {attachmentBinding,codexImageInput} from '../office-images.mjs';
import {seal,open,jobId,checkJob,b64,unb64,accessAuthenticator} from './crypto.mjs';
const record=(space,id)=>space+'/'+id+'.json';
const clock=()=>Math.floor(Date.now()/1000);
export function relayImages(mailbox){return {
 async put(binding,ref,bytes){const name=record('images',await jobId(binding)+'/'+ref.id),value={data:b64(bytes)};if(!await mailbox.put(name,value)){const old=await mailbox.get(name,true);if(old?.value.data!==value.data)throw Error('Immutable image conflict');}},
 async get(binding,ref){const result=await mailbox.get(record('images',await jobId(binding)+'/'+ref.id),true);if(!result||typeof result.value.data!=='string'||result.value.data.length!==Math.ceil(ref.size/3)*4||ref.size>4*1024*1024)throw Error('Missing private image');return unb64(result.value.data);}
};}
// Not wired by the deployed Pages route. Keys are supplied only by a trusted operator.
export function createHostedCoding({enabled=false,mailbox,config,access,jobSigningKey,jobVerificationKey,statusVerificationKey,now=clock}) {
 if(!enabled)return createCodingService();
 if(!mailbox||!jobSigningKey||!jobVerificationKey||!statusVerificationKey)throw Error('Relay trust configuration incomplete');
 const principal={owner:config.binding.owner,tenant:config.binding.tenant,role:'owner',sessions:{Dot:{[config.binding.conversationId]:Object.fromEntries(['sessionId','repository','base','branch'].map(k=>[k,config.binding[k]]))}}};
 const authenticate=accessAuthenticator({...access,principal,now});
 const images=relayImages(mailbox);
 async function admission(id){const r=await mailbox.get(record('jobs',id));if(!r)return null;const value=await open(r.value,'job',jobVerificationKey);const job=checkJob(value,config,now(),true);if(await jobId(job)!==id)throw Error('Job address mismatch');return {job,value,envelope:r.value};}
 const store={
  async claim(key,job){await mailbox.verifyPrivate();const id=await jobId(job),t=now();const value={job,workerId:config.workerId,createdAt:t,expiresAt:t+600};checkJob(value,config,t);if(await mailbox.put(record('jobs',id),await seal('job',value,jobSigningKey)))return {created:true};return {created:false,job:await this.get(key)};},
  async get(key){const id=await jobId(Object.fromEntries(['tenant','owner','provider','conversationId','requestId'].map((k,i)=>[k,JSON.parse(key)[i]]))),a=await admission(id);if(!a)return null;const ready=await mailbox.get(record('ready',id));if(ready&&JSON.stringify(ready.value)!==JSON.stringify(a.envelope))throw Error('Ready job changed');return {...a.job,status:ready?'queued':'unknown'};},
  async update(){/* Authority/status comes only from signed immutable jobs and signed worker results. */}
 };
 const adapter={supportsImages:true,
  async submit(job){const id=await jobId(job),a=await admission(id);if(!a||JSON.stringify(a.job)!==JSON.stringify(job))throw Error('Admission changed');checkJob(a.value,config,now());await codexImageInput(job,images);if(!await mailbox.put(record('ready',id),a.envelope)){const prior=await mailbox.get(record('ready',id));if(JSON.stringify(prior?.value)!==JSON.stringify(a.envelope))throw Error('Ready conflict');}},
  async status(binding){await mailbox.verifyPrivate();const id=await jobId(binding),a=await admission(id);if(!a||Object.entries(attachmentBinding(binding)).some(([k,v])=>a.job[k]!==v))throw Error('Status scope mismatch');const r=await mailbox.get(record('status',id));if(!r)return {...binding,status:a.value.expiresAt<=now()?'unknown':'queued'};const value=await open(r.value,'status',statusVerificationKey);if(value.jobId!==id||value.workerId!==config.workerId||value.jobSignature!==a.envelope.signature||value.expiresAt<=now()||value.issuedAt>now()+30)throw Error('Invalid worker result');return {...binding,...value.event};}
 };
 return createCodingService({authenticate,origin:config.origin,store,images,adapters:{Dot:adapter}});
}
