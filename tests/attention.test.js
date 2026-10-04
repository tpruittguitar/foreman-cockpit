const assert=require('assert'),A=require('../pipeline-attention');
const row={id:'one',TITLE:'Director of Manufacturing',BUCKET:'READY_TO_PURSUE',compMid:230000,payload:{FLOOR_STATUS:'CLEARS_200K',FLEX:'YES',FIT_SCORE:'92',DOMAIN_FIT:'HIGH'}};
assert(A.evaluate(row).strong);
const change=p=>({...row,payload:{...row.payload,...p}});
assert(!A.evaluate(change({DOMAIN_FIT:''})).strong,'Unknown domain must not become a strong match');
assert(!A.evaluate(change({FLEX:'SOFT'})).strong,'Soft FLEX remains uncertain');
assert.equal(A.evaluate(change({FLEX:'STRICT_NO'})).signals[1],-1);
assert(!A.evaluate(change({FLOOR_STATUS:'BELOW_FLOOR'})).strong,'Pay floor failure blocks high pay');
assert(!A.evaluate(change({BLOCKER:'DEGREE'})).strong);assert(!A.evaluate(change({SALARY_CONF:'LOW'})).strong);assert(!A.evaluate(change({FLOOR_STATUS:'BELOW_FLOOR',PAY_MATCH:'HIGH'})).strong);
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
