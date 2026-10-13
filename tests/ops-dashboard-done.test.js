// Batch 2026-10-13-C: dashboard backlog must exclude finished obligations.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const O=require('../pipeline-operations');
function load(){const ctx={window:{},PipelineOperations:O,Date,Object,JSON,Math,Number,String};ctx.window=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','pipeline-operations-ui.js'),'utf8'),ctx);
  return ctx.PipelineOperationsUI.create({escape:String});}
const pf={independent:true,at:'2026-10-13T10:00:00Z',evidenceRef:'request_result:x'};
function store(){const ob={};
  for(let i=0;i<5;i++)ob['W-done-'+i]={state:'VERIFIED_COMPLETE',owner:'WRITER',proof:pf};
  for(let i=0;i<2;i++)ob['W-exist-'+i]={state:'EXISTING_VERIFIED',owner:'WRITER',proof:pf};
  ob['W-excl']={state:'EXCLUDED_VERIFIED',owner:'WRITER',proof:pf};
  ob['W-open']={state:'NEEDS_RESOLUTION',owner:'WRITER',error:'Complete receipt does not yet prove the exact intended row'};
  ob['Q-open']={state:'NEEDS_RESOLUTION',nextAction:'SALARY research'};
  ob['W-noproof']={state:'VERIFIED_COMPLETE',owner:'WRITER'};
  return {obligations:ob,runs:{}};}
test('verified obligations are not counted as open backlog',()=>{
  const s=store(),m=load().metrics(s,O.summary(s));
  assert.equal(m.total,11);
  assert.equal(m.open,3);
  assert.equal(m.writerBlocked,2);
  assert.equal(m.stages['Writer / verification'],2);
  assert.equal(m.stages['Qualification enrichment'],1);
});
test('dashboard open count matches PipelineOperations.summary',()=>{
  const s=store(),sum=O.summary(s),m=load().metrics(s,sum);
  assert.equal(m.open,sum.open.length);assert.equal(m.done,sum.done);
});
