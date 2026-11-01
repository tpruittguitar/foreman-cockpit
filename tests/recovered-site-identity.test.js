const test=require('node:test'),assert=require('node:assert/strict'),C=require('../apps-script/Code.gs');
const old='1 | V2I-OLD | Agency One | General Manager | APPLIED | CLOSED | - | LI4442875327 | NOT_STATED | ANTI_RESURRECTION=YES';
const rec={COMPANY:'Agency One',TITLE:'General Manager',LOCATION:'Connecticut, United States',SOURCE_URL:'https://www.linkedin.com/jobs/view/4478684281/',EMPLOYER_PRIMARY_BUSINESS:'RECRUITING_AGENCY',REMOTE_HYBRID:'On-site',IDENTITY_SITE_SOURCE_URL:'https://www.linkedin.com/jobs/view/4442875327/',IDENTITY_SITE_VALUE:'Reno, NV',IDENTITY_SITE_EVIDENCE:'The original saved posting lists Reno, NV.',IDENTITY_SITE_MODE:'On-site'};
test('source-bound recovered location evidence distinguishes another placement without editing a protected row',()=>{
 const idx=C.indexExisting([old]),m=C.matchExisting(C.sanitizeRecord(rec),idx,{holdRelistedProtected:true});assert.equal(m.by,'AGENCY_DISTINCT_STATES');assert.equal(m.kind,'none');assert.equal(idx[0].location,'NOT_STATED');assert.equal(idx[0].bucket,'APPLIED');
});
test('wrong posting, absent evidence and nonlocal statewide listings do not bypass the hold',()=>{
 const idx=C.indexExisting([old]);for(const extra of [{IDENTITY_SITE_SOURCE_URL:'https://www.linkedin.com/jobs/view/9999999999/'},{IDENTITY_SITE_EVIDENCE:''},{REMOTE_HYBRID:''},{IDENTITY_SITE_VALUE:'Seattle, WA'}])assert.notEqual(C.matchExisting(C.sanitizeRecord({...rec,...extra}),idx,{holdRelistedProtected:true}).kind,'none');
});
