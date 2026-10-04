const test=require('node:test'),assert=require('node:assert/strict'),E=require('../pipeline-evidence'),S=require('../pipeline-scoring'),T=require('../pipeline-trust');

test('legacy Grok fit is preserved as measured evidence',()=>{
  assert.deepEqual(E.fit({GROK_SCOPE_FIT_RAW:'82'}),{value:82,source:'GROK_SCOPE_FIT_RAW',legacy:true});
  const row={TITLE:'Director of Manufacturing',COMPANY:'X',LOCATION:'Austin, TX',payload:{GROK_SCOPE_FIT_RAW:'82',FLEX_CLASS:'HIGH_FLEX'}};
  const scored=S.scoreRow(row,S.defaults());
  assert.equal(scored.parts.experience.rawScore,82);
  assert.equal(scored.parts.experience.evidenceSource,'GROK_SCOPE_FIT_RAW');
  assert.equal(scored.parts.experience.legacyEvidence,true);
});

test('current fit fields outrank legacy aliases without deleting legacy evidence',()=>{
  const ev=E.fit({SCOPE_FIT_RAW:'76',GROK_SCOPE_FIT_RAW:'82'});
  assert.equal(ev.value,76);assert.equal(ev.source,'SCOPE_FIT_RAW');assert.equal(ev.legacy,false);
});

test('legacy salary midpoint and low/high remain usable compensation evidence',()=>{
  assert.equal(E.salary({SALARY_MIDPOINT:'$195,000'}).mid,195000);
  assert.equal(E.salary({SALARY_BASE_LOW:'150000',SALARY_BASE_HIGH:'250000'}).mid,200000);
  assert.notEqual(T.salary({SALARY_MIDPOINT:'$195,000'}),'UNKNOWN');
});

test('current salary fields outrank legacy aliases',()=>{
  const ev=E.salary({SALARY_BASE_POSTED:'$180,000-$220,000',SALARY_MIDPOINT:'$150,000'});
  assert.equal(ev.mid,200000);assert.equal(ev.source,'SALARY_BASE_POSTED');assert.equal(ev.legacy,false);
});

test('legacy Grok salary remains usable when newer salary fields are absent',()=>{
  const ev=E.salary({GROK_SALARY:'POSTED $169,800-$355,400 base/yr'});
  assert.equal(ev.mid,262600);assert.equal(ev.source,'GROK_SALARY');assert.equal(ev.legacy,true);
  assert.notEqual(T.salary({GROK_SALARY:'POSTED $169,800-$355,400 base/yr'}),'UNKNOWN');
});
