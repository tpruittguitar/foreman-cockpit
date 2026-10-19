const assert=require('assert'),A=require('../pipeline-attention');
const row={id:'one',TITLE:'Director of Manufacturing',BUCKET:'READY_TO_PURSUE',compMid:230000,payload:{FLOOR_STATUS:'CLEARS_200K',FLEX:'YES',FIT_SCORE:'92',DOMAIN_FIT:'HIGH'}};
assert(A.evaluate(row).strong);
const change=p=>({...row,payload:{...row.payload,...p}});
assert(!A.evaluate(change({DOMAIN_FIT:''})).strong,'Unknown domain must not become a strong match');
assert(!A.evaluate(change({FLEX:'SOFT'})).strong,'Soft FLEX remains uncertain');
assert.equal(A.evaluate(change({FLEX:'STRICT_NO'})).signals[1],-1);
assert(!A.evaluate(change({FLOOR_STATUS:'BELOW_FLOOR'})).strong,'Pay floor failure blocks high pay');
assert(!A.evaluate(change({BLOCKER:'DEGREE'})).strong);assert(A.evaluate(change({SALARY_CONF:'LOW'})).strong,'SALARY RULE: LOW salary confidence never lowers the pay signal');assert(!A.evaluate(change({FLOOR_STATUS:'BELOW_FLOOR',PAY_MATCH:'HIGH'})).strong);
assert(A.evaluate(change({BLOCKER:'NONE',ANTI_RESURRECTION:'NO'})).strong);
for(const BUCKET of ['APPLIED','REJECTED_BY_EMPLOYER','DECLINED_BY_TIM','CLOSED_DEAD','DUPLICATE'])assert(!A.evaluate({...row,BUCKET}).strong);
assert.equal(A.grade('101'),0);assert.equal(A.grade('great manufacturing work'),0,'Prose must not invent numeric fit');
assert.equal(A.ranked([{...row,id:'missing',payload:{}},row])[0].row.id,'one');
console.log('PASS: attention signals preserve unknowns, gates, protected states, and recorded match evidence');

const current={...row,payload:{FLOOR_STATUS:'CLEARS_200K',FLEX_CLASS:'HIGH_FLEX',SCOPE_FIT_RAW:'92',DOMAIN_FIT:'HIGH'}};
assert(A.evaluate(current).strong,'Current FLEX_CLASS + SCOPE_FIT_RAW fields must drive attention');
assert.equal(A.evaluate({...current,payload:{...current.payload,FLEX_CLASS:'NO_FLEX'}}).signals[1],-1);

const grokOnly={...row,payload:{FLOOR_STATUS:'CLEARS_200K',FLEX_CLASS:'HIGH_FLEX',GROK_SCOPE_FIT_RAW:'92',DOMAIN_FIT:'HIGH'}};
assert(A.evaluate(grokOnly).strong,'GROK_SCOPE_FIT_RAW must count as measured/current fit evidence');

// SALARY RULE (Tim 2026-10-19 01:34, Grok Q1): an estimated salary that clears the floor counts as pay +1, so the job can be hot.
const est={id:'est',TITLE:'Director of Manufacturing',BUCKET:'READY_TO_PURSUE',compMid:230000,compSource:'SALARY_BASE_EST',payload:{SALARY_BASE_EST:'$210,000-$250,000',SALARY_BASIS:'EMPLOYER_COMPARABLE_ESTIMATE',SALARY_CONF:'LOW',FLOOR_STATUS:'CLEARS_200K',FLEX:'YES',FIT_SCORE:'92',DOMAIN_FIT:'HIGH'}};
assert.equal(A.evaluate(est).signals[0],1,'estimated pay above the floor is pay +1');
assert(A.evaluate(est).strong,'estimated pay above the floor can be hot');
assert.equal(A.evaluate({...est,payload:{...est.payload,SALARY_CONF:'UNVERIFIED'}}).signals[0],1,'UNVERIFIED confidence keeps pay +1');
assert.equal(A.evaluate({...est,payload:{...est.payload,FLOOR_STATUS:'BELOW_FLOOR'}}).signals[0],-1,'the floor check still holds pay');
console.log('PASS: SALARY RULE — estimated pay above the floor is real pay');

// REV-066 (spec v1.5.2 B-4, R-3): a recorded middle value is soft evidence; a missing one is unknown; signals unchanged
{const base={id:'s',TITLE:'Director of Manufacturing',BUCKET:'READY_TO_PURSUE',compMid:230000,payload:{FLOOR_STATUS:'CLEARS_200K',FLEX:'YES',FIT_SCORE:'92',DOMAIN_FIT:'HIGH'}};
 const ev=p=>A.evaluate({...base,payload:{...base.payload,...p}});
 assert.deepEqual(ev({}).soft,[false,false,false,false,false],'all decided: nothing soft');
 assert.equal(ev({FLEX:'SOFT'}).signals[1],0);assert.equal(ev({FLEX:'SOFT'}).soft[1],true,'FLEX SOFT is soft');
 assert.equal(ev({FLEX_CLASS:'SOFT_FLEX'}).soft[1],true,'FLEX_CLASS SOFT_FLEX is soft');
 assert.equal(ev({FLEX:'',FLEX_CLASS:''}).soft[1],false,'missing FLEX is unknown');
 assert.equal(ev({FIT_SCORE:'70'}).signals[2],0);assert.equal(ev({FIT_SCORE:'70'}).soft[2],true,'fit 70 is soft');
 assert.equal(ev({FIT_SCORE:''}).soft[2],false,'missing fit is unknown');
 assert.equal(ev({DOMAIN_FIT:'MEDIUM'}).soft[4],true,'MEDIUM domain is soft');
 assert.equal(ev({FIT_SCORE:'70',FIT_CONF:'LOW'}).soft[2],true,'low confidence on a middle score stays soft');
 assert.equal(ev({FIT_SCORE:'92',FIT_CONF:'LOW'}).soft[2],false,'low confidence on a high score is unknown, never soft');
 assert.equal(ev({FLEX:'SOFT'}).strong,false,'soft never makes a job hot');}
console.log('PASS: soft evidence is told apart from unknown without changing any signal');
