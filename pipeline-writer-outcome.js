/* Versioned Writer response semantics used by the live ruling outbox. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineWriterOutcome=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function scope(body){return body.requests?body.requests.map(function(q){return q.ruling&&q.ruling.requestId||q.requestId;}):[body.ruling&&body.ruling.requestId||body.requestId];}
 function notAccepted(response,ids){var o=response&&response.outcome,planned=response&&response.mode==='BATCH_RULING_RETRY'&&Array.isArray(response.results)&&response.results.length===ids.length&&response.results.every(function(x){return x.ok===true&&x.mode==='PLANNED';})&&response.results.map(function(x){return x.requestId;}).sort().every(function(id,n){return id===ids.slice().sort()[n];});
  var terminal=o&&/^(REJECTED_SCHEMA|REJECTED_INPUT|UNSUPPORTED_ACTION)$/.test(o.code),rejected=terminal&&Array.isArray(response.results)&&response.results.every(function(x){return x.ok===false&&!/PENDING|APPLIED/.test(x.mode||'');});
  return !!(response&&response.ok===false&&!response.writeId&&!response.WRITE_ACCEPTED&&(!response.results||response.results.length===0||planned||rejected)&&o&&o.schema==='forge.writer-outcome.v1'&&o.status==='NOT_ACCEPTED'&&o.phase==='BEFORE_MUTATION'&&o.masterMutations===0&&(/^(WRITER_BUSY|WRITE_FENCE)$/.test(o.code)||terminal)&&Array.isArray(o.requestIds)&&o.requestIds.length===ids.length&&ids.every(function(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{3,160}$/.test(id);})&&new Set(o.requestIds).size===ids.length&&o.requestIds.slice().sort().every(function(id,n){return id===ids.slice().sort()[n];}));
 }
 function decision(result,proof,requestId){
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{3,160}$/.test(requestId))return 'unknown';
  if(result&&result.ok===true&&result.requestId===requestId&&result.found&&/^(COMPLETE|PENDING)$/.test(String(result.status||'')))return 'landed';
  if(proof&&notAccepted(proof.response,proof.requestIds)&&proof.requestIds.indexOf(requestId)>=0)return retryable(proof.response,proof.requestIds)?'send':'refused';
  return 'unknown';
 }
 function retryable(response,ids){return notAccepted(response,ids)&&/^(WRITER_BUSY|WRITE_FENCE)$/.test(response.outcome.code);}
 return{scope:scope,notAccepted:notAccepted,retryable:retryable,decision:decision};
});
