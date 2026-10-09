/* Durable research/verification obligations. Supporting telemetry, never a job population. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineOperations=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var FINAL=['VERIFIED_COMPLETE','EXCLUDED_VERIFIED','EXISTING_VERIFIED','CANCELED_VERIFIED'];
  var STATES=['NOT_ATTEMPTED','RESEARCHING','QUEUED','PROCESSING','PENDING_VERIFICATION','WRITER_TRANSPORT_BLOCKED','BLOCKED','NEEDS_RESOLUTION','UNSYNCED'].concat(FINAL);
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function empty(){return {schema:1,revision:0,updatedAt:'',obligations:{},runs:{},catchUps:{},acceptance:{}};}
  function proof(p){return !!p&&p.independent===true&&p.at&&p.evidenceRef;}
  function complete(o){return FINAL.indexOf(o.state)>=0&&proof(o.proof);}
  function update(store,patch,at){
    var out=copy(store||empty());
    if(!patch||patch.baseRevision!==out.revision)throw new Error('REVISION_CONFLICT: reload before saving');
    (patch.obligations||[]).forEach(function(next){
      if(!next.id||STATES.indexOf(next.state)<0)throw new Error('INVALID_OBLIGATION');
      if(FINAL.indexOf(next.state)>=0&&!proof(next.proof))throw new Error('INDEPENDENT_PROOF_REQUIRED');
      var old=out.obligations[next.id];
      if(old&&complete(old)&&!complete(next))throw new Error('VERIFIED_OBLIGATION_REOPEN_REQUIRES_NEW_ID');
      var item=Object.assign({},old||{},copy(next));
      item.source=old&&old.source?old.source:copy(next.source||{});
      item.createdAt=old&&old.createdAt||at;item.updatedAt=at;
      item.attempts=(old&&old.attempts||[]).slice();
      (next.attempts||[]).forEach(function(a){if(!a.id)throw new Error('ATTEMPT_ID_REQUIRED');if(!item.attempts.some(function(x){return x.id===a.id;}))item.attempts.push(copy(a));});
      out.obligations[next.id]=item;
    });
    (patch.runs||[]).forEach(function(next){
      if(!next.id)throw new Error('RUN_ID_REQUIRED');
      var old=out.runs[next.id]||{id:next.id,messages:{},pages:{},candidates:{},sources:{}};
      var run=copy(old);
      ['messages','pages','candidates','sources'].forEach(function(kind){
        Object.keys(next[kind]||{}).forEach(function(id){
          var prev=run[kind][id]||{},value=next[kind][id];
          if(kind==='messages'&&prev.reviewed===true&&value.reviewed===false)throw new Error('REVIEWED_MESSAGE_REGRESSION');
          run[kind][id]=Object.assign({},prev,copy(value));
        });
      });
      ['windowStart','windowEnd','owner','provider','authorityRevision','finishedAt','error'].forEach(function(k){if(next[k]!==undefined)run[k]=next[k];});
      run.updatedAt=at;out.runs[next.id]=run;
      if(next.watermark){var coverage=emailCoverage(run,out.obligations);if(coverage.state!=='CLEAR')throw new Error('INCOMPLETE_WINDOW_CANNOT_ADVANCE_WATERMARK');run.watermark=next.watermark;}
    });
    out.revision++;out.updatedAt=at;return out;
  }
  function emailCoverage(run,obligations){
    if(!run)return {state:'UNKNOWN',found:null,reviewed:null,unreviewed:null,denominator:null};
    var messages=Object.keys(run.messages||{}),reviewed=messages.filter(function(id){return run.messages[id].reviewed===true&&run.messages[id].bodyEvidence;});
    var sources=Object.keys(run.sources||{}),pages=Object.keys(run.pages||{}),candidates=Object.keys(run.candidates||{});
    var failed=pages.filter(function(id){return run.pages[id].error;}).length+messages.filter(function(id){return run.messages[id].error;}).length;
    var gaps=sources.filter(function(id){var s=run.sources[id];return !s.planned||!s.paginationExhausted||!s.evidenceRef;});
    var pending=candidates.filter(function(id){var c=run.candidates[id];return !complete((obligations||{})[c.obligationId]||{});});
    var digestIncomplete=messages.some(function(id){var m=run.messages[id];return m.reviewed&&m.digestComplete!==true;});
    var oldest=messages.filter(function(id){return reviewed.indexOf(id)<0;}).map(function(id){return run.messages[id].at;}).filter(Boolean).sort()[0]||'';
    var clear=!!sources.length&&!gaps.length&&!failed&&!digestIncomplete&&!pending.length&&reviewed.length===messages.length;
    return {state:failed?'BLOCKED':clear?'CLEAR':'BACKLOG',found:messages.length,reviewed:reviewed.length,unreviewed:messages.length-reviewed.length,
      failed:failed,scopeGaps:gaps.length,digestIncomplete:digestIncomplete,extracted:candidates.length,unprocessed:pending.length,oldest:oldest,
      verified:candidates.filter(function(id){return ((obligations||{})[run.candidates[id].obligationId]||{}).state==='VERIFIED_COMPLETE';}).length,
      watermark:run.watermark||'',denominator:messages.length};
  }
  function progress(done,total){return total==null?{state:'INDETERMINATE',done:done||0,total:null,percent:null}:{state:'KNOWN',done:done,total:total,percent:total?100*done/total:0};}
  function summary(store){
    var all=Object.keys(store.obligations||{}).map(function(k){return store.obligations[k];}),counts={};
    STATES.forEach(function(s){counts[s]=0;});all.forEach(function(o){counts[o.state]=(counts[o.state]||0)+1;});
    var done=all.filter(complete).length,open=all.filter(function(o){return !complete(o);});
    return {counts:counts,open:open,total:all.length,done:done,progress:progress(done,all.length),updatedAt:store.updatedAt||'',revision:store.revision||0};
  }
  function classify(error,context){
    var text=String(error&&error.message||error||''),code=Number(error&&error.status||error&&error.code||0);
    if(context&&context.possiblyCommitted)return {layer:'POSTCOMMIT_UNKNOWN',retry:false,next:'Reconcile original request and master'};
    if(/policy|safety.*block|connector.*den/i.test(text))return {layer:'CONNECTOR_POLICY_BLOCK',retry:false};
    if(code===401||code===403&&!/rateLimit|quota/i.test(text)||/unauthorized|bad key|permission|forbidden/i.test(text))return {layer:'AUTH_OR_PERMISSION',retry:false};
    if(code===400||/malformed|invalid|syntax|parsing|expected pattern|invalid url/i.test(text))return {layer:'CLIENT_INPUT_OR_PARSE',retry:false};
    if(/identity|revision.conflict|lock timeout|write.fence/i.test(text))return {layer:'DATA_OR_LOCK',retry:false};
    if(code===429||code>=500||/service error|backend|temporarily|rate.?limit|quota.*minute/i.test(text))return {layer:'PROVIDER_API_ERROR',retry:true};
    if(/network|fetch|timeout|connection/i.test(text))return {layer:'NETWORK_OR_TRANSPORT',retry:true};
    return {layer:'UNKNOWN',retry:false};
  }
  function catchUp(store,id,scope,at){var out=copy(store);if(!id||!scope)throw new Error('CATCH_UP_SCOPE_REQUIRED');if(out.catchUps[id])return out;out.catchUps[id]={id:id,scope:copy(scope),state:'REQUESTED',providerStatus:'PENDING_MANUAL',at:at,nextAction:'Authorized email automation must acknowledge this request through its native scheduler'};out.revision++;out.updatedAt=at;return out;}
  function acknowledge(store,id,at){var out=copy(store),o=out.obligations[id];if(!o)throw new Error('OBLIGATION_NOT_FOUND');o.acknowledgedAt=at;out.revision++;out.updatedAt=at;return out;}
  return {empty:empty,update:update,summary:summary,emailCoverage:emailCoverage,progress:progress,classify:classify,catchUp:catchUp,acknowledge:acknowledge,complete:complete,proof:proof,STATES:STATES};
});
