'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),O=require('../pipeline-writer-outcome'),contract=require('../reference/WRITER_OUTCOME_CONTRACT.json'),W=require('../apps-script/Code.gs');
test('live browser and Writer share request-bound pre-mutation outcome contract',()=>{
 for(const c of contract.cases)a.equal(O.notAccepted(c.response,contract.childRequestIds),c.notAccepted,c.name);
 const html=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8');a.match(html,/<script src="pipeline-writer-outcome.js"><\/script>/);a.match(html,/PipelineWriterOutcome\.decision\(j,ru\.notAccepted,ru\.requestId\)/);
});
test('unknown/unreadable request results never authorize a second ruling POST',()=>{
 for(const r of [null,{ok:false},{ok:true,found:false},{ok:true,found:true,status:'NEEDS_RESOLUTION'}])a.equal(O.decision(r,null,'TEST-R1'),'unknown');
 a.equal(O.decision({ok:true,requestId:'TEST-R1',found:true,status:'PENDING'},null,'TEST-R1'),'landed');a.equal(O.decision({ok:true,requestId:'OTHER',found:true,status:'COMPLETE'},null,'TEST-R1'),'unknown');
 const proof={response:contract.cases[0].response,requestIds:contract.childRequestIds};a.equal(O.decision(null,proof,'TEST-R1'),'send');a.equal(O.decision(null,proof,'FOREIGN'),'unknown');
});
test('batch, single ruling and intake lock refusals emit the same contract before any document work',t=>{
 const prior=global.LockService;t.after(()=>{global.LockService=prior;});let acquired=0;
 global.LockService={getScriptLock:()=>({waitLock(){acquired++;throw Error('Lock timeout: another process was holding the lock for too long.');},releaseLock(){throw Error('never acquired');}})};
 for(const request of [{action:'batch',requests:[{action:'ruling',ruling:{requestId:'TEST-R1',primaryId:'V2I-TEST',kind:'ENRICH',fields:{DEGREE_REQ:'REQUIRED'}}}]},{action:'ruling',ruling:{requestId:'TEST-R1',primaryId:'V2I-TEST',kind:'ENRICH',fields:{DEGREE_REQ:'REQUIRED'}}},{action:'intake',requestId:'TEST-R1',records:[]}]){
  const response=W.dispatchWrite_(request);a.equal(O.notAccepted(response,['TEST-R1']),true);a.equal(response.writeId,undefined);a.equal(response.outcome.masterMutations,0);
 }
 a.equal(acquired,3);
});

test('actual live outbox retains single and multiple unknown rulings on unreadable or absent results',async()=>{
 const vm=require('node:vm'),html=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8'),start=html.indexOf('var OUTBOX_RETRY_RE_='),end=html.indexOf('/* ---------- Act Now',start),code=html.slice(start,end);
 for(const count of [1,2])for(const unreadable of [true,false]){
  let posts=0;const rulings=Object.fromEntries(Array.from({length:count},(_,n)=>['ROW'+n,{requestId:'REQ'+n,writeStatus:'RESULT_UNKNOWN',error:'network timeout'}]));
  const c={PipelineWriterOutcome:O,S:{rulings,load:{freshness:'LIVE'}},RULING_BATCH_:{MAX:25},canSend:()=>true,rowById:id=>({id}),gsGet:async()=>{if(unreadable)throw Error('network');return{ok:true,found:false};},rulingEnqueue_:()=>{posts++;return Promise.resolve();},rulingFlush_:()=>{},LS:{set(){}},render(){},setTimeout:()=>0,clearTimeout(){}};
  vm.runInNewContext(code,c);c.outboxTick_(true);await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  a.equal(posts,0,'no POST when '+(unreadable?'read failed':'absence is unproven')+' for '+count+' rulings');for(const r of Object.values(rulings)){a.equal(r.writeStatus,'RESULT_UNKNOWN');a.match(r.error,/original request retained/);a.ok(r.outbox.nextAt>Date.now());}
 }
});

test('actual ruling send consumes refusal proof before a new attempt can lose its response',async()=>{
 const vm=require('node:vm'),html=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8'),code=html.slice(html.indexOf('function rulingSend_(items)'),html.indexOf('function rulingDone_(items)'));
 const ru={requestId:'TEST-R1',primaryId:'V2I-TEST'},item={r:{id:'ROW'},ru,say(){},res(){}};let posts=0;
 const c={PipelineWriterOutcome:O,S:{rulings:{ROW:ru}},rulingWire_:x=>({...x}),LS:{set(){}},gsPostRetryBusy_:async()=>{posts++;if(posts===1)return contract.cases[0].response;throw Error('reply lost after the next delivery');},rulingSettle_:(it,ok)=>{it.ru.writeStatus=ok===null?'RESULT_UNKNOWN':'WRITE_FAILED';},rulingDone_(){},outboxSchedule_(){},render(){},reloadAfterWrite_(){}};
 vm.runInNewContext(code,c);await c.rulingSend_([item]);a.ok(ru.notAccepted);await c.rulingSend_([item]);a.equal(posts,2);a.equal(ru.notAccepted,undefined);a.equal(ru.notAcceptedHistory.length,1);a.equal(O.decision(null,ru.notAccepted,ru.requestId),'unknown');
});
test('actual Undo never treats unknown, refused or foreign results as a landed ruling',async()=>{
 const vm=require('node:vm'),html=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8'),code=html.slice(html.indexOf('function undoRuling_(r,say)'),html.indexOf('/* REV-131',html.indexOf('function undoRuling_(r,say)')));
 for(const result of [null,{ok:true,requestId:'OUTER',found:true,status:'COMPLETE'}]){
  let posts=0;const ru={requestId:'OUTER',primaryId:'V2I-TEST',deliveryAttempted:true,writeStatus:'RESULT_UNKNOWN'},flying={requestId:'INNER',primaryId:'V2I-TEST',writeStatus:'RESULT_UNKNOWN'};
  const c={PipelineWriterOutcome:O,PipelineActNow:{saveState:()=> 'NOT_SAVED'},S:{rulings:{ROW:ru}},RULING_BATCH_:{q:[],rows:{ROW:[flying]},chain:Promise.resolve()},OUTBOX_:{inflight:{}},LS:{set(){}},render(){},outboxRetryable_:()=>true,outboxDeferUnknown_(){},outboxSchedule_(){},gsGet:async()=>{if(result===null)throw Error('read unavailable');return result;},gsPost:async()=>{posts++;return{ok:true};},reloadAfterWrite_(){}};
  vm.runInNewContext(code,c);await c.undoRuling_({id:'ROW',PRIMARY_ID:'V2I-TEST'},()=>{});a.equal(posts,0);a.equal(c.S.rulings.ROW.undoRequested,true);
 }
});
test('live immediate retries and outbox backoff honor the Writer retry-after',async()=>{
 const vm=require('node:vm'),html=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8'),code=html.slice(html.indexOf('var WRITER_BUSY_RE_='),html.indexOf('function setText_',html.indexOf('var WRITER_BUSY_RE_=')));let posts=0;const waits=[];
 const c={PipelineWriterOutcome:O,gsPost:async()=>{posts++;return posts===1?contract.cases[0].response:{ok:true};},setTimeout:(cb,ms)=>{waits.push(ms);cb();}};
 vm.runInNewContext(code,c);await c.gsPostRetryBusy_({action:'ruling',ruling:{requestId:'TEST-R1'}},()=>{});a.deepEqual(waits,[60000]);a.equal(posts,2);
});

test('local readiness failures prove no delivery and never become an uncertain original',async()=>{
 const vm=require('node:vm'),html=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8'),code=html.slice(html.indexOf('function localWriteRefusal_'),html.indexOf('var Source=',html.indexOf('function localWriteRefusal_')));let posts=0;
 const c={PipelineWriterOutcome:O,canSend:()=>false,S:{load:{freshness:'LIVE'},cfg:{key:'TEST_ONLY'}},fetch:()=>{posts++;throw Error('must not POST');}};vm.runInNewContext(code,c);const body={action:'ruling',ruling:{requestId:'TEST-R1'}};
 a.equal(O.notAccepted(await c.gsPost(body),['TEST-R1']),true);c.canSend=()=>true;c.S.load.freshness='STALE';a.equal(O.notAccepted(await c.gsPost(body),['TEST-R1']),true);a.equal(posts,0);
});
test('each automatic busy retry persists then consumes its own proof before a later transport loss',async()=>{
 const vm=require('node:vm'),html=fs.readFileSync(path.join(__dirname,'../pipeline.html'),'utf8'),retry=html.slice(html.indexOf('var WRITER_BUSY_RE_='),html.indexOf('function setText_',html.indexOf('var WRITER_BUSY_RE_='))),send=html.slice(html.indexOf('function rulingSend_(items)'),html.indexOf('function rulingDone_(items)'));
 const ru={requestId:'TEST-R1',primaryId:'V2I-TEST'},item={r:{id:'ROW'},ru,say(){},res(){}},snapshots=[];let posts=0;
 const c={PipelineWriterOutcome:O,S:{rulings:{ROW:ru}},rulingWire_:x=>({...x}),LS:{set(){snapshots.push(JSON.parse(JSON.stringify(ru)));}},gsPost:async()=>{posts++;if(posts===1)return contract.cases[0].response;a.equal(ru.notAccepted,undefined,'proof consumed before second delivery');throw Error('reply lost');},rulingSettle_:(it,ok)=>{it.ru.writeStatus=ok===null?'RESULT_UNKNOWN':'WRITE_FAILED';},rulingDone_(){},outboxSchedule_(){},render(){},reloadAfterWrite_(){},setTimeout:cb=>{cb();}};
 vm.runInNewContext(retry+'\n'+send,c);await c.rulingSend_([item]);a.equal(posts,2);a.ok(snapshots.some(x=>x.notAccepted));a.equal(ru.notAccepted,undefined);a.equal(ru.notAcceptedHistory.length,1);a.equal(ru.writeStatus,'RESULT_UNKNOWN');a.equal(O.decision(null,ru.notAccepted,ru.requestId),'unknown');
});
