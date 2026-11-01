const test=require('node:test'),assert=require('node:assert/strict'),C=require('../apps-script/Code.gs');
const row=(company,location)=>`1 | V2I-OLD | ${company} | Director of Operations | DECLINED_BY_TIM | CLOSED | - | UNKNOWN | ${location} | SOURCE_URL=https://www.linkedin.com/jobs/view/1111111111/`;
const rec={COMPANY:'Agency One',TITLE:'Director of Operations',LOCATION:'Detroit, MI',SOURCE_URL:'https://www.linkedin.com/jobs/view/2222222222/',EMPLOYER_PRIMARY_BUSINESS:'RECRUITING_AGENCY'};
test('an agency generic title at a distinct explicit state is not the old client opportunity',()=>{
 const m=C.matchExisting(rec,C.indexExisting([row('Agency One','Nashville, TN')]),{holdRelistedProtected:true});assert.equal(m.kind,'none');assert.equal(m.by,'AGENCY_DISTINCT_STATES');
});
test('agency protection stays decisive for same, missing, regional or remote sites and unconfirmed business type',()=>{
 for(const location of ['Detroit, MI','Ann Arbor, MI','NOT_STATED','Greater Nashville Area','Nashville, TN (Remote)'])assert.notEqual(C.matchExisting(rec,C.indexExisting([row('Agency One',location)]),{holdRelistedProtected:true}).kind,'none',location);
 assert.notEqual(C.matchExisting({...rec,EMPLOYER_PRIMARY_BUSINESS:''},C.indexExisting([row('Agency One','Nashville, TN')]),{holdRelistedProtected:true}).kind,'none');
});
test('Confidential is a placeholder, not one employer spanning unrelated jobs',()=>{
 const idx=C.indexExisting([row('Confidential','Santa Monica, CA')]);
 assert.equal(C.matchExisting({...rec,COMPANY:'Confidential',LOCATION:'Miami, FL'},idx,{holdRelistedProtected:true}).kind,'none');
 const exact=C.matchExisting({...rec,COMPANY:'Confidential',LOCATION:'Santa Monica, CA',SOURCE_URL:'https://www.linkedin.com/jobs/view/1111111111/'},idx,{holdRelistedProtected:true});assert.equal(exact.kind,'exact');
});
