const test=require('node:test'),assert=require('node:assert/strict'),C=require('../apps-script/Code.gs');
const row=(id,title,req='UNCAPTURED',payload='')=>`1 | ${id} | EY | ${title} | DECLINED_BY_TIM | CLOSED | - | ${req} | Charlotte, NC | ${payload}`;
test('senior and ordinary roles remain distinct; abbreviated senior titles still match',()=>{
 const title='Life Sciences Supply Chain Manufacturing Ops & AI Transformation Delivery- Manager';
 const idx=C.indexExisting([row('V2I-OLD',title)]);
 const rec={COMPANY:'EY',TITLE:title.replace('- Manager','- Senior Manager'),LOCATION:'Austin, TX',SOURCE_URL:'https://www.linkedin.com/jobs/view/4474805196/'};
 assert.equal(C.matchExisting(rec,idx,{holdRelistedProtected:true}).kind,'none');
 assert.equal(C.normTitle('Sr. Manager, Manufacturing Engineering'),C.normTitle('Senior Manager, Manufacturing Engineering'));
 assert.notEqual(C.normTitle('Senior Director Quality'),C.normTitle('Director Quality'));
});
test('a verified payload requisition participates in identity after enrichment without erasing original intake',()=>{
 const idx=C.indexExisting([row('V2I-OLD','Supply Chain Manager','UNCAPTURED','REQ_ID=A10590729; SOURCE_URL=https://www.linkedin.com/jobs/view/4484449806/')]);
 assert.equal(C.matchExisting({COMPANY:'EY',TITLE:'Supply Chain Manager',LOCATION:'Charlotte, NC',REQ_ID:'A10590729'},idx).by,'REQ_ID');
 assert.deepEqual(idx[0].employerReqCores,['A10590729']);
 const changed=C.matchExisting({COMPANY:'EY',TITLE:'Supply Chain Manager',LOCATION:'Charlotte, NC',REQ_ID:'A10590730'},idx,{holdRelistedProtected:true});
 assert.equal(changed.by,'PROTECTED_IDENTITY_REQ_CONFLICT');
});
