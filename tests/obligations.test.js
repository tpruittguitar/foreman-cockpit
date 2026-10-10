const test=require('node:test'),assert=require('node:assert/strict'),P=require('../pipeline-incidents');
const at=(n)=>new Date(Date.parse('2026-10-10T03:00:00Z')+n*60000).toISOString();
function run(file,status,error,n,recovered){
 return {file,finishedAt:at(n),terminalStatus:status,error:error||'',recovered:!!recovered};
}
test('a failed JSON intake creates a visible, actionable unfinished-work entry',()=>{
 const s=P.empty();P.observe(s,{runs:[run('FORGE-EMAIL-BATCH02.json','FAILED','invalid JSON at line 300',1)]});
 const a=P.workQueue(s);assert.equal(a.length,1);assert.equal(a[0].status,'REPAIR_OR_RECONCILE');assert.match(a[0].nextStep,/source candidates/);
 assert.equal(P.health(s).warning,0,'past attempt is not current Writer malfunction');
});
test('retry failures group into one original operation and remain pending',()=>{
 const s=P.empty();P.observe(s,{runs:[run('BATCH_R2.json','FAILED','Lock timeout',1),run('BATCH_R3.json','PARTIAL_HOLD','PARTIAL: ran 2 of 4 requests',2)]});
 const a=P.workQueue(s);assert.equal(a.length,1);assert.equal(a[0].attempts,2);assert.equal(a[0].incidentCount,2);
 assert.equal(a[0].status,'CHECK_PARTIAL_COMPLETION');
});
test('a later unverified SUCCESS does not close unfinished work',()=>{
 const s=P.empty();P.observe(s,{runs:[run('JOB.json','FAILED','invalid JSON',1),run('JOB_R2.json','SUCCESS','',2,false)]});
 assert.equal(P.workQueue(s).length,1);
});
test('verified completion closes obligation but retains original failure history',()=>{
 const s=P.empty();P.observe(s,{runs:[run('JOB.json','FAILED','invalid JSON',1),run('JOB_R2.json','SUCCESS','',2,true)]});
 assert.equal(P.workQueue(s).length,0);assert.equal(P.view(s,Date.parse(at(3))).recovered.length,1);
});
test('a partial held write with pending subrequests stays open despite retry until verified',()=>{
 const s=P.empty();P.observe(s,{runs:[run('TASK.json','PARTIAL_HOLD','PARTIAL 1 of 2',1),run('TASK_R2.json','SUCCESS','',2,true)],unverifiedCount:1});
 assert.equal(P.workQueue(s).length,1);assert.equal(P.workQueue(s)[0].status,'CHECK_PARTIAL_COMPLETION');
});
test('different operations are distinct obligations',()=>{
 const s=P.empty();P.observe(s,{runs:[run('A.json','FAILED','bad',1),run('B.json','FAILED','bad',2)]});
 assert.equal(P.workQueue(s).length,2);
});
