const test=require('node:test'),assert=require('node:assert/strict'),C=require('../apps-script/Code.gs');
test('LinkedIn email comm links are the same posting identity as ordinary view links',()=>{
 assert.equal(C.canonUrl('https://www.linkedin.com/comm/jobs/view/4471822178/?trk=mail'),C.canonUrl('https://www.linkedin.com/jobs/view/4471822178/'));
});
test('Workday JR requisitions participate in the same employer-scoped exact identity checks as R requisitions',()=>{
 const line='1 | V2I-OLD | Copart | General Manager | SCOUT_INTAKE | OPEN | - | JR111583 | Ocala, FL | SOURCE_URL=https://copart.wd12.myworkdayjobs.com/Copart/job/Ocala-FL/General-Manager_JR111583';
 assert.equal(C.matchExisting({COMPANY:'Copart',TITLE:'General Manager',LOCATION:'Florida',SOURCE_URL:'https://copart.wd12.myworkdayjobs.com/en-US/Copart/job/Ocala-FL/General-Manager_JR111583'},C.indexExisting([line])).by,'ATS_JOB_ID');
});
test('a Jobleads listing hash cannot become an employer requisition through a numeric substring',()=>{
 const hash='e72e38fa43f801e658de3988031f1fc12';
 const idx=C.indexExisting([`1 | V2I-OLD | EY | Manager | DECLINED_BY_TIM | CLOSED | - | ${hash} | Charlotte, NC | SOURCE_URL=https://www.jobleads.com/job/${hash}`]);
 assert.deepEqual(idx[0].employerReqCores,[]);
});
