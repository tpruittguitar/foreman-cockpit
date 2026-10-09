/* Provider capabilities are injected; unsupported native integrations never become verified. */
'use strict';
const Alignment=require('./pipeline-alignment');
function create(io){
 const now=()=>new Date(io.now?io.now():Date.now()).toISOString();
 async function checkpoint(record){
  if(!io.persist||!io.readCheckpoint)throw new Error('UNSYNCED: durable checkpoint/readback unavailable');
  await io.persist(record);const back=await io.readCheckpoint(record.attemptId);
  if(Alignment.stable(back)!==Alignment.stable(record))throw new Error('UNSYNCED: checkpoint readback differs');
 }
 async function inspect(taskKey,scope,approvedSchedule,attemptId){
  const task=Alignment.task(taskKey),nativeTaskId=task.nativeId||(io.nativeTaskIds||{})[taskKey];let authorities={},native=null;
  try{authorities=await io.readAuthorities()}catch(e){authorities={common:{error:e.message}}}
  if(io.provider&&io.provider.getTask&&nativeTaskId){try{native=await io.provider.getTask(nativeTaskId);native.readbackAt=now()}catch(e){native={error:e.message}}}
  const input={taskKey,nativeTaskId,scope,approvedSchedule,attemptId,at:now(),authorities,native,capabilities:{checkpoint:!!(io.persist&&io.readCheckpoint),writerTransport:!!(io.submitWriter&&io.reconcileWriter),coverageReadback:!!io.verifyCoverage,artifactReadback:!!io.artifactReadback}};
  const result=Alignment.preflight(input);await checkpoint({...result,input});return result;
 }
 async function updatePrompt(taskKey,scope,attemptId){
  const task=Alignment.task(taskKey),nativeTaskId=task.nativeId||(io.nativeTaskIds||{})[taskKey],desired=Alignment.prompt(task,scope);
  if(!nativeTaskId||!io.provider||!io.provider.getTask||!io.provider.updatePrompt)return {state:'NATIVE_CONTROL_UNSUPPORTED',taskKey,prompt:desired,applied:false};
  const before=await io.provider.getTask(nativeTaskId);
  if(before.enabled!==true)throw new Error('PAUSED_TASK_REACTIVATION_FORBIDDEN');
  if(!before.revision||!before.schedule||before.provider!==task.provider||before.taskId!==nativeTaskId)throw new Error('NATIVE_IDENTITY_AND_REVISION_REQUIRED');
  const assessment=await inspect(taskKey,scope,before.schedule,attemptId+':pre-update');
  if(assessment.issues.some(i=>!(i.code==='PAUSED_CONFLICT'&&i.source==='native-prompt')))throw new Error('PROMPT_UPDATE_BLOCKED: '+assessment.state);
  const intent={attemptId,taskKey,state:'PROMPT_UPDATE_INTENT',before,desired,at:now()};await checkpoint(intent);
  // Never resend an ambiguous prompt update. Independent readback decides whether it landed.
  let error='';try{await io.provider.updatePrompt(nativeTaskId,{prompt:desired,expectedRevision:before.revision})}catch(e){error=e.message}
  let after;try{after=await io.provider.getTask(nativeTaskId)}catch(e){const r={...intent,state:'POSTCOMMIT_UNKNOWN',error:error||e.message,applied:null};await checkpoint(r);return r}
  const sameSchedule=Alignment.stable(before.schedule)===Alignment.stable(after.schedule)&&before.enabled===after.enabled;
  const r={...intent,state:after.prompt===desired&&sameSchedule?'PROMPT_READBACK_MATCH':'PAUSED_CONFLICT',applied:after.prompt===desired&&sameSchedule,after,error,nativeAdoption:'PROMPT_ONLY_NOT_RUN_ACCEPTANCE'};
  await checkpoint(r);return r;
 }
 async function execute(config,work){
  const preflight=await inspect(config.taskKey,config.scope,config.approvedSchedule,config.attemptId);
  if(!preflight.allowed)return preflight;
  const verifiedRequests=[];
  const context={
   submit:async body=>{
    // Re-read authority and native intent immediately before every new canonical instruction.
    const fresh=await inspect(config.taskKey,config.scope,config.approvedSchedule,config.attemptId);Alignment.assertRequest(fresh,body);
    if(!body.requestId)throw new Error('STABLE_REQUEST_ID_REQUIRED');
    const id='writer:'+body.requestId,old=await io.readCheckpoint(id);
    if(old){if(Alignment.stable(old.body)!==Alignment.stable(body))throw new Error('REQUEST_ID_BODY_CONFLICT');const result=await io.reconcileWriter(old);await checkpoint({...old,result,state:'RECONCILED'});verifiedRequests.push(result);return result}
    const intent={attemptId:id,taskKey:config.taskKey,state:'WRITER_INTENT',body,preflight:fresh,at:now()};await checkpoint(intent);
    let response;try{response=await io.submitWriter({...body,automation:{taskKey:config.taskKey,attemptId:config.attemptId,authorityFingerprints:fresh.authorityFingerprints}})}catch(e){const r={...intent,state:'POSTCOMMIT_UNKNOWN',error:e.message};await checkpoint(r);verifiedRequests.push(r);return r}
    const r={...intent,state:'PENDING_VERIFICATION',response};await checkpoint(r);const result=await io.reconcileWriter(r);await checkpoint({...r,result,state:'RECONCILED'});verifiedRequests.push(result);return result;
   }
  };
  const report=await work(context),coverage=await io.verifyCoverage(report,config);
  if(!coverage||coverage.verified!==true||!coverage.evidenceRef)report.scopeKnown=false;else report.coverageEvidenceRef=coverage.evidenceRef;
  if(Alignment.task(config.taskKey).lane==='freeze')report.requiredArtifactVerified=await io.artifactReadback(report,config)===true;
  if(verifiedRequests.some(r=>r.state!=='VERIFIED_COMPLETE'||!r.receiptId||!r.masterReadbackRef))report.independentDispositions=false;
  const completion=Alignment.completion(report),result={...preflight,...completion,report,at:now()};await checkpoint(result);return result;
 }
 return {inspect,updatePrompt,execute};
}
module.exports={create};
