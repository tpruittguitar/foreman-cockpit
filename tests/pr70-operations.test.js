'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),O=require('../pipeline-operations'),S=require('../pipeline-scheduler'),T=require('../pipeline-writer-transport');
const at='2026-10-09T12:00:00Z';
test('103 identified emails, 12 reviewed bodies: 91 unreviewed; overlapping scans and partial digests survive reload',()=>{
 let store=O.empty(),messages={};for(let i=0;i<103;i++)messages['GMAIL-'+i]={at,reviewed:i<12,bodyEvidence:i<12?'body:'+i:'',digestComplete:i<12};
 store=O.update(store,{baseRevision:0,runs:[{id:'EMAIL',messages,sources:{alerts:{planned:true,paginationExhausted:true,evidenceRef:'page:last'}}}]},at);
 store=O.update(JSON.parse(JSON.stringify(store)),{baseRevision:1,runs:[{id:'EMAIL',messages:{'GMAIL-1':messages['GMAIL-1']}}]},at);
 const coverage=O.emailCoverage(store.runs.EMAIL,store.obligations);assert.equal(coverage.found,103);assert.equal(coverage.reviewed,12);assert.equal(coverage.unreviewed,91);assert.equal(coverage.state,'BACKLOG');
 assert.throws(()=>O.update(store,{baseRevision:2,runs:[{id:'EMAIL',watermark:at}]},at),/INCOMPLETE/);
});
test('30 obligations: 10 verified, five verifying, five blocked, ten unattempted; acknowledgment cannot clear work',()=>{
 const states=Array(10).fill('VERIFIED_COMPLETE').concat(Array(5).fill('PENDING_VERIFICATION'),Array(5).fill('BLOCKED'),Array(10).fill('NOT_ATTEMPTED'));
 const obligations=states.map((state,i)=>({id:'O'+i,state,source:{url:'https://example.invalid/'+i},proof:state==='VERIFIED_COMPLETE'?{independent:true,at,evidenceRef:'receipt:'+i}:null}));
 let d=O.update(O.empty(),{baseRevision:0,obligations},at);d=O.acknowledge(d,'O15',at);const s=O.summary(d);assert.equal(s.open.length,20);assert.equal(s.progress.done,10);assert.equal(s.progress.total,30);assert.equal(s.counts.BLOCKED,5);assert.equal(O.progress(0,null).state,'INDETERMINATE');
 assert.throws(()=>O.update(d,{baseRevision:0,obligations:[]},at),/REVISION_CONFLICT/);
});
test('completed run cannot hide missed pages, unparsed digest jobs or unverified Writer dispositions',()=>{
 const r={id:'R',finishedAt:at,messages:{m:{reviewed:true,bodyEvidence:'body',digestComplete:false}},sources:{alerts:{planned:true,paginationExhausted:false}},pages:{p:{error:'API unavailable'}},candidates:{c:{obligationId:'o'}}};
 const c=O.emailCoverage(r,{o:{state:'PENDING_VERIFICATION'}});assert.equal(c.state,'BLOCKED');assert.equal(c.unreviewed,0);assert.equal(c.unprocessed,1);assert.equal(c.scopeGaps,1);
});
test('catch up remains REQUESTED/PENDING_MANUAL without native scheduler acknowledgment',()=>{
 const d=O.catchUp(O.empty(),'CATCH-1',{run:'EMAIL'},at);assert.equal(d.catchUps['CATCH-1'].state,'REQUESTED');assert.equal(d.catchUps['CATCH-1'].providerStatus,'PENDING_MANUAL');assert.deepEqual(O.catchUp(d,'CATCH-1',{run:'EMAIL'},at),d);
});
test('failure layers separate parse, policy, permission, quota and ambiguous postcommit',()=>{
 assert.equal(O.classify(new Error('The string did not match the expected pattern')).layer,'CLIENT_INPUT_OR_PARSE');
 assert.equal(O.classify(new Error('connector policy blocked')).retry,false);assert.equal(O.classify({status:403,message:'permission denied'}).retry,false);
 assert.equal(O.classify({status:429,message:'rateLimitExceeded'}).retry,true);assert.equal(O.classify({status:500},{possiblyCommitted:true}).retry,false);
});
const task={key:'test-email',provider:'ChatGPT',owner:'FORGE',enabled:true,timezone:'America/New_York',time:'07:00',days:['SU','MO','TU','WE','TH','FR','SA'],dependencies:[]};
test('schedule revisions, protected freeze, disabled tasks and truthful provider drift',()=>{
 const d=S.edit(S.empty(),task,0,at);assert.equal(S.status(d.tasks[0],Date.parse(at)),'PENDING_MANUAL');assert.throws(()=>S.edit(d,task,0,at),/REVISION_CONFLICT/);
 assert.throws(()=>S.validate({...task,key:'recovery-relay'}),/DEFERRED/);assert.throws(()=>S.validate({...task,lane:'freeze',time:'07:30'}),/PROTECTED/);
 const disabled=S.edit(S.empty(),{...task,enabled:false},0,at);assert.throws(()=>S.edit(disabled,task,1,at),/REACTIVATION/);
 const observed={...task,approvedRevision:1,actual:{...task,readbackAt:at,providerEvidence:'native:test'}};assert.equal(S.status(observed,Date.parse(at)),'VERIFIED_SYNC');observed.actual.time='08:00';assert.equal(S.status(observed,Date.parse(at)),'DRIFT');
});
test('schedule preview follows DST, skips nonexistent local clock and stops at expiration',()=>{
 const occurrences=S.upcoming(task,Date.parse('2026-10-31T00:00:00Z'),4);assert.equal(occurrences[0],'2026-10-31T11:00:00.000Z');assert.equal(occurrences[1],'2026-11-01T12:00:00.000Z');
 assert.equal(S.upcoming({...task,time:'02:30'},Date.parse('2026-03-08T00:00:00Z'),1)[0],'2026-03-09T06:30:00.000Z');
 assert.equal(S.upcoming({...task,expiresAt:'2026-10-31T12:00:00Z'},Date.parse('2026-10-31T00:00:00Z'),4).length,1);
});
test('transport preserves source and never resends after an ambiguous delivered request or restart',async()=>{
 const durable=new Map();let posts=0;
 const adapter={persist:async x=>durable.set(x.requestId,JSON.parse(JSON.stringify(x))),load:async id=>durable.get(id),post:async(body,meta)=>{posts++;assert.equal(meta.contentType,'text/plain');throw new Error('response lost after delivery');},result:async()=>({status:'COMPLETE',durable:true}),master:async()=>['exact row'],verify:async()=>({matches:true,hash:'fixture'})};
 let transport=T.create(adapter),r=await transport.submit('RID',{action:'intake'},{initiatingUrl:'https://example.invalid/email',gmailId:'original'});assert.equal(r.state,'PENDING_VERIFICATION');
 transport=T.create(adapter);r=await transport.submit('RID',{action:'intake'},{initiatingUrl:'https://different.invalid'});assert.equal(r.state,'VERIFIED_COMPLETE');assert.equal(posts,1);assert.equal(r.source.gmailId,'original');
});
test('unsupported transport retains candidate; completed receipt alone cannot certify a mismatching row',async()=>{
 let saved;const persist=async x=>{saved=JSON.parse(JSON.stringify(x));},load=async()=>null;
 let r=await T.create({persist,load}).submit('R',{action:'intake'},{initiatingUrl:'https://example.invalid'});assert.equal(r.state,'WRITER_TRANSPORT_BLOCKED');assert.ok(saved.source);
 r=await T.create({persist,load,post:async()=>({ok:true}),result:async()=>({status:'COMPLETE',durable:true}),master:async()=>[],verify:async()=>({matches:false})}).submit('R2',{action:'intake'},{initiatingUrl:'https://example.invalid'});assert.equal(r.state,'NEEDS_RESOLUTION');
});
