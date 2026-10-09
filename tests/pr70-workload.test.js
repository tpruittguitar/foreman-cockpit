'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),W=require('../pipeline-workload');
const profile={productionVerified:true,budgetMs:1000,minSamples:3,maxFailureRate:0,maxPayloadBytes:10000};
const sample=(records,elapsedMs,extra)=>({...extra,records,elapsedMs,ok:true,environment:'production',operation:'intake',build:'test',storageModel:'text/plain',payloadBytes:1000});
const context={profile,operation:'intake',build:'test',storageModel:'text/plain'};
test('capacity is selected from measured p95 latency and remaining budget',()=>{
 const samples=[5,10,20,30].flatMap(n=>[sample(n,n*30),sample(n,n*31),sample(n,n*32)]);
 assert.equal(W.admit(samples,context).records,30);assert.equal(W.admit(samples,{...context,elapsedMs:400}).records,10);
 assert.equal(W.admit(samples,{...context,elapsedMs:900}).state,'BLOCKED');
});
test('unknown profiles and incomparable synthetic runs cannot approve production capacity',()=>{
 assert.equal(W.admit([],{}).state,'UNKNOWN');
 const synthetic=Array.from({length:4},()=>({...sample(30,100),environment:'local-synthetic'}));
 assert.equal(W.admit(synthetic,context).state,'BLOCKED');assert.equal(W.admit(synthetic,{...context,pendingVerification:1}).records,0);
 assert.equal(W.admit([sample(30,100)],context).state,'BLOCKED');
});
test('batch evidence reports failure layers separately from latency',()=>{
 const report=W.summarize([{records:10,elapsedMs:100,ok:true,payloadBytes:1000},{records:10,elapsedMs:200,ok:false,failureLayer:'AUTH_OR_PERMISSION',payloadBytes:1500}]);
 assert.equal(report.groups[0].p95Ms,200);assert.equal(report.groups[0].failureRate,.5);assert.equal(report.groups[0].layers.AUTH_OR_PERMISSION,1);
});
