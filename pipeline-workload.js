/* Capacity is learned from comparable measured requests, never from a job-count timer. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineWorkload=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function percentile(values,p){var v=values.filter(Number.isFinite).sort(function(a,b){return a-b;});return v.length?v[Math.max(0,Math.ceil(v.length*p)-1)]:null;}
  function summarize(samples){var valid=(samples||[]).filter(function(s){return Number.isFinite(s.elapsedMs)&&s.elapsedMs>0&&Number.isInteger(s.records)&&s.records>0;}),groups={};
    valid.forEach(function(s){(groups[s.records]=groups[s.records]||[]).push(s);});
    return {samples:valid.length,groups:Object.keys(groups).map(function(size){var list=groups[size];return {records:+size,samples:list.length,p50Ms:percentile(list.map(function(s){return s.elapsedMs;}),.5),p95Ms:percentile(list.map(function(s){return s.elapsedMs;}),.95),failureRate:list.filter(function(s){return s.ok!==true;}).length/list.length,maxBytes:Math.max.apply(null,list.map(function(s){return s.payloadBytes||0;})),layers:list.reduce(function(out,s){if(s.failureLayer)out[s.failureLayer]=(out[s.failureLayer]||0)+1;return out;},{})};}).sort(function(a,b){return a.records-b.records;})};
  }
  function admit(samples,context){
    context=context||{};
    if(context.pendingVerification||context.locked||context.freeze)return {state:'BLOCKED',reason:'Resolve verification, lock or freeze before admitting new work',records:0};
    if(!context.profile||context.profile.productionVerified!==true)return {state:'UNKNOWN',reason:'Production capacity profile has not been independently verified',records:0};
    var p=context.profile;
    if(!Number.isFinite(p.budgetMs)||!Number.isInteger(p.minSamples)||p.minSamples<1||!Number.isFinite(p.maxFailureRate)||!Number.isFinite(p.maxPayloadBytes))return {state:'UNKNOWN',reason:'Approved capacity bounds are incomplete',records:0};
    var comparable=(samples||[]).filter(function(s){return s.environment==='production'&&s.operation===context.operation&&s.build===context.build&&s.storageModel===context.storageModel;});
    var measured=summarize(comparable),left=p.budgetMs-(context.elapsedMs||0),choices=measured.groups.filter(function(g){return g.samples>=p.minSamples&&g.p95Ms<=left&&g.failureRate<=p.maxFailureRate&&g.maxBytes<=p.maxPayloadBytes;});
    var best=choices[choices.length-1];
    return best?{state:'MEASURED',records:best.records,p95Ms:best.p95Ms,budgetRemainingMs:left,evidence:best}:{state:'BLOCKED',records:0,reason:'No measured batch fits the approved remaining budget',measured:measured};
  }
  return {percentile:percentile,summarize:summarize,admit:admit};
});
