const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Status=require('../pipeline-status-reads');
const Q='Service invoked too many times for one day: urlfetch.';
test('status requests coalesce only while in flight; successful observations never cached',async()=>{
 let n=0,resolve;const s=Status.create(()=>{n++;return new Promise(r=>resolve=r)},()=> 'a');
 const a=s.get('operations'),b=s.get('operations');await Promise.resolve();assert.equal(n,1);resolve({ok:true});await Promise.all([a,b]);
 const c=s.get('operations');await Promise.resolve();assert.equal(n,2);resolve({ok:true});await c;
});
test('partial status quota response backs off without representing old evidence as fresh',async()=>{
 let t=10,n=0;const s=Status.create(async()=>{n++;return {ok:true,errors:['unverified: '+Q]}},()=> 'a',()=>t);
 await assert.rejects(s.get('writer_status'),/evidence unavailable/);assert.equal(s.remaining('writer_status'),Status.COOLDOWN);
 await assert.rejects(s.get('writer_status'),/evidence unavailable/);assert.equal(n,1);
 t+=Status.COOLDOWN;await assert.rejects(s.get('writer_status'),/evidence unavailable/);assert.equal(n,2);
});
test('thrown daily quota backs off; transient errors and unrelated actions do not',async()=>{
 let n=0;const s=Status.create(async a=>{n++;throw Error(a==='operations'?Q:'network error')},()=> 'a');
 await assert.rejects(s.get('operations'));await assert.rejects(s.get('operations'));assert.equal(n,1);
 for(const a of ['writer_status','writer_status','request_result','request_result','row_readback','row_readback'])await assert.rejects(s.get(a));
 assert.equal(n,7);assert.equal(s.remaining('writer_status'),0);
});
test('credential changes reset status cooldown and stale inflight failure cannot poison new identity',async()=>{
 let id='a',reject;const s=Status.create(()=>new Promise((_,r)=>reject=r),()=>id);
 const p=s.get('writer_status');await Promise.resolve();id='b';assert.equal(s.remaining('writer_status'),0);reject(Error(Q));await assert.rejects(p);assert.equal(s.remaining('writer_status'),0);
});
test('writer status shares exactly one fresh receipt index, including failure, only within invocation',()=>{
 const source=fs.readFileSync('apps-script/Automation.gs','utf8');let n=0,fail=false;
 const c={Date,readFreeze_:()=>null,readMigrationState_:()=>null,queueFolders_:()=>({queue:{getFiles:()=>({hasNext:()=>false})}}),ScriptApp:{getProjectTriggers:()=>[]},findOrCreate_:()=>({getBlob:()=>({getDataAsString:()=>JSON.stringify({terminalStatus:'SUCCESS',file:'x'})})}),readIndex_:()=>{n++;if(fail)throw Error(Q);return {requests:{},pending:[]}}};vm.createContext(c);vm.runInContext(source,c);
 const first=c.writerStatus_();assert.equal(n,1);assert.equal(first.unverified.count,0);
 fail=true;const second=c.writerStatus_();assert.equal(n,2);assert.equal(second.errors.filter(e=>e.includes(Q)).length,2);
});
test('only status display call sites use adapter; direct preflight reads remain unchanged',()=>{
 const html=fs.readFileSync('pipeline.html','utf8');assert.match(html,/writerRefreshPromise_=statusReads_\.get\('writer_status'\)/);assert.match(html,/return gsGet\('writer_status'\)\.then/);assert.match(html,/PipelineOperationsUI.create\(\{get:statusReads_.get/);
 const code=fs.readFileSync('apps-script/Code.gs','utf8');assert.match(code,/function readIndex_\(\)/);assert.doesNotMatch(code,/statusIndex\(/);
});
