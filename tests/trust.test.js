const test=require('node:test'),assert=require('node:assert/strict'),T=require('../pipeline-trust');
test('Pay estimates never become verified from value presence or an inconsistent confidence flag',()=>{assert.match(T.salary({SALARY_BASE_EST:'$210k-$260k'}),/^ESTIMATED/);assert.match(T.salary({SALARY_BASE_EST:'$210k',SALARY_CONF:'VERIFIED'}),/^ESTIMATED/);assert.equal(T.salary({PAY_POSTED:'$200k'}),'VERIFIED');assert.equal(T.salary({PAY_POSTED:'$200k',SALARY_CONF:'VERIFIED'}),'VERIFIED');assert.equal(T.salary({PAY_POSTED:'UNKNOWN'}),'UNKNOWN')});
test('FLEX hints remain unverified; explicit confidence requires a basis',()=>{assert.equal(T.flex({FLEX_HINT:'YES'}),'HINT · UNVERIFIED');assert.equal(T.flex({FLEX:'YES'}),'UNVERIFIED');assert.equal(T.flex({FLEX:'YES',FLEX_CONF:'HIGH'}),'UNVERIFIED');assert.equal(T.flex({FLEX:'YES',FLEX_CONF:'HIGH',FLEX_BASIS:'JD explicitly allows equivalent experience'}),'VERIFIED')});
test('Canonical FLEX_CLASS is recognized even when legacy FLEX/FLEX_HINT are absent',()=>{assert.equal(T.flex({FLEX_CLASS:'HIGH_FLEX'}),'CLASSIFIED · UNVERIFIED');assert.equal(T.flex({FLEX_CLASS:'SOFT_FLEX'}),'CLASSIFIED · UNVERIFIED');assert.equal(T.flex({FLEX_CLASS:'NO_FLEX'}),'CLASSIFIED · UNVERIFIED');assert.equal(T.flex({FLEX_CLASS:'UNKNOWN'}),'UNKNOWN')});
test('Readback checks intended state, note, decline reason and rejection date',()=>{let r={BUCKET:'DECLINED_BY_TIM',payload:{DECLINE_REASON_CODE:'PAY_BELOW_FLOOR',TIM_NOTE:'Tim: declined for pay'}};assert(T.matches(r,{kind:'DECLINE',code:'PAY_BELOW_FLOOR',note:'declined for pay'}));assert(!T.matches(r,{kind:'DECLINE',code:'FLEX_STRICT_NO'}));assert(!T.matches(r,{kind:'NOTE',note:'not actually present'}));assert(!T.matches({BUCKET:'APPLIED',payload:{}},{kind:'REJECTED_BY_EMPLOYER'}));assert(!T.matches({BUCKET:'REJECTED_BY_EMPLOYER',payload:{REJECTION_DATE:'2026-09-01'}},{kind:'REJECTED_BY_EMPLOYER',eventDate:'2026-10-02'}))});
test('Public master and legacy feed are closed before any upstream request',async()=>{for(const path of ['../netlify/functions/master','../netlify/functions/feed']){const r=await require(path).handler();assert.equal(r.statusCode,410);assert.equal(JSON.parse(r.body).ok,false);assert(!r.body.includes('19y5xt'))}});
test("Tim's ruling: salary posted in the job description is verified; doubt and estimate markers fail closed",()=>{
  // live Caterpillar row 838: posted fields from the employer posting, no SALARY_CONF
  assert.equal(T.salary({PAY_POSTED:'$189,080-$283,630 base (employer posting)',SALARY_POSTED:'$189,080 - $283,630 base + incentive bonus',SALARY_CONFIDENCE:'POSTED'}),'VERIFIED');
  // live Caterpillar row 778: employer-posted range recorded in the estimate field, with an explicit EMPLOYER_POSTED basis
  assert.equal(T.salary({SALARY_LABEL:'POSTED',SALARY_BASE_EST:'$147760-$221640',SALARY_BASIS:'EMPLOYER_POSTED',SALARY_CONF:'HIGH'}),'VERIFIED');
  assert.equal(T.salary({SALARY_BASE_POSTED:'$150k-$190k',SALARY_BASIS:'EMPLOYER_POSTED'}),'VERIFIED');
  // explicit doubt on a posted value keeps it unverified
  assert.equal(T.salary({PAY_POSTED:'$200k',SALARY_CONF:'LOW'}),'POSTED · UNVERIFIED');
  assert.equal(T.salary({PAY_POSTED:'$200k',SALARY_CONF:'UNVERIFIED'}),'POSTED · UNVERIFIED');
  // an estimate stays an estimate: no posted field, or a conflicting estimate marker
  assert.match(T.salary({SALARY_LABEL:'ESTIMATED',SALARY_BASE_LOW:'140000',SALARY_BASE_HIGH:'190000',SALARY_CONF:'LOW'}),/^ESTIMATED/);
  assert.match(T.salary({SALARY_BASE_EST:'$150k',SALARY_BASIS:'EMPLOYER_POSTED',SALARY_LABEL:'ESTIMATED'}),/^ESTIMATED/);
  assert.match(T.salary({SALARY_BASE_EST:'$150k',SALARY_BASIS:'EMPLOYER_COMPARABLE_ESTIMATE',SALARY_LABEL:'POSTED'}),/^ESTIMATED/);
  assert.match(T.salary({GROK_SALARY:'NOT POSTED; estimate $180k-$220k'}),/^ESTIMATED/);
  // any posted job description counts, including a recruiter's ad or an aggregator copy
  assert.equal(T.salary({PAY_POSTED:'$150,000-$180,000',SALARY_BASIS:'RECRUITER_POSTED (GPAC board)',SALARY_LABEL:'POSTED'}),'VERIFIED');
  assert.equal(T.salary({SALARY_BASE_POSTED:'$140k-$170k',SALARY_BASIS:'AGGREGATOR_QUOTED (TheLadders mirror)',SALARY_LABEL:'POSTED'}),'VERIFIED');
  // a row that contradicts itself (posted value, but labelled an estimate) is not verified
  assert.equal(T.salary({PAY_POSTED:'$200k-$240k',SALARY_BASIS:'AGGREGATOR_MIRRORED_EMPLOYER_RANGE',SALARY_LABEL:'ESTIMATED'}),'POSTED · UNVERIFIED');
  // an aggregator estimate filed in a posted field is not a posted job-description salary
  assert.equal(T.salary({PAY_POSTED:'$250000-$275000 Ladders estimate'}),'POSTED · UNVERIFIED');
  assert.equal(T.salary({PAY_POSTED:'about $150K/yr ESTIMATED BY LENSA'}),'POSTED · UNVERIFIED');
  assert.equal(T.salary({PAY_POSTED:'$125K-$150K Ladders-claimed (not employer-posted)'}),'POSTED · UNVERIFIED');
  // an explicit SALARY_CONF=VERIFIED is never downgraded (live QinetiQ row shape)
  assert.equal(T.salary({PAY_POSTED:'$189,000-$238,000',SALARY_BASE_POSTED:'$189,000-$238,000',SALARY_LABEL:'ESTIMATED',SALARY_BASIS:'EMPLOYER_POSTED',SALARY_CONF:'VERIFIED'}),'VERIFIED');
});
