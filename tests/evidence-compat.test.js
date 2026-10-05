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

const deepFreeze=o=>{Object.values(o).forEach(v=>v&&typeof v==='object'&&deepFreeze(v));return Object.freeze(o)};

test('full fit precedence: each recognized field outranks every field after it; legacy = anything but SCOPE_FIT_RAW',()=>{
  const keys=['SCOPE_FIT_RAW','GROK_SCOPE_FIT_RAW','RAW_FIT','EXPERIENCE_FIT_SCORE','EXPERIENCE_FIT','FIT_SCORE','FIT_PCT','WORK_CONTENT_FIT','FIT'];
  keys.forEach((k,i)=>{const p={};keys.slice(i).forEach((kk,j)=>{p[kk]=String(90-j)});const ev=E.fit(deepFreeze(p));assert.equal(ev.source,k);assert.equal(ev.value,90);assert.equal(ev.legacy,k!=='SCOPE_FIT_RAW')});
  assert.deepEqual(E.fit({SCOPE_FIT_RAW:'UNKNOWN',GROK_SCOPE_FIT_RAW:'82'}),{value:82,source:'GROK_SCOPE_FIT_RAW',legacy:true});
  assert.deepEqual(E.fit({}),{value:null,source:'',legacy:false});
});

test('full salary precedence: current fields first, then historical aliases in order',()=>{
  const order=[['SALARY_BASE_POSTED','$300,000'],['PAY_POSTED','$290,000'],['SALARY_BASE_EST','$280,000'],['SALARY_MIDPOINT','$270,000'],['SALARY_BASE_LOW','260000'],['GROK_SALARY','POSTED $250,000'],['SALARY_POSTED','$240,000'],['PAY','$230K'],['SALARY_ESTIMATED','$220,000'],['SALARY_RECRUITER_RANGE','$210,000'],['SALARY_AGGREGATOR_RANGE','$200,000']];
  order.forEach(([k],i)=>{const p={};order.slice(i).forEach(([kk,v])=>{p[kk]=v});if(p.SALARY_BASE_LOW)p.SALARY_BASE_HIGH='260000';const ev=E.salary(deepFreeze(p));assert.equal(ev.source,k==='SALARY_BASE_LOW'?'SALARY_BASE_LOW/HIGH':k);assert.equal(ev.legacy,i>=3)});
});

test('compatibility reads never mutate the row and keep both conflicting values',()=>{
  const p={SCOPE_FIT_RAW:'76',GROK_SCOPE_FIT_RAW:'82',SALARY_BASE_POSTED:'$180,000-$220,000',SALARY_MIDPOINT:'$150,000'},snap=JSON.stringify(p);
  const row=deepFreeze({TITLE:'Director of Quality',COMPANY:'X',LOCATION:'Austin, TX',payload:p});
  E.fit(p);E.salary(p);T.salary(p);const s=S.scoreRow(row,S.defaults());
  assert.equal(JSON.stringify(p),snap);assert.equal(s.parts.experience.rawScore,76);assert.equal(s.parts.experience.evidenceSource,'SCOPE_FIT_RAW');assert.equal(s.parts.experience.legacyEvidence,false);
});

test('Grok historical fit is used as stored, never replaced by the keyword heuristic',()=>{
  const cfg=S.defaults();cfg.resumeKeywords='quality, manufacturing, director, lean, six sigma, plant';
  const p={GROK_SCOPE_FIT_RAW:'82',GROK_FIT_BASIS:'Grok scope review',GROK_FIT_EVIDENCE:'quality manufacturing director lean six sigma plant'};
  const row={TITLE:'Director of Quality',COMPANY:'X',LOCATION:'Austin, TX',payload:p};
  const legacy=S.scoreRow(row,cfg).parts.experience,keyword=S.scoreRow({...row,payload:{GROK_FIT_EVIDENCE:p.GROK_FIT_EVIDENCE}},cfg).parts.experience;
  assert.equal(legacy.rawScore,82);assert.equal(legacy.evidenceSource,'GROK_SCOPE_FIT_RAW');assert.equal(legacy.legacyEvidence,true);
  assert.equal(keyword.evidenceSource,'KEYWORD_PROXY');assert.notEqual(keyword.rawScore,82,'fixture proves the heuristic would differ');
});

test('URLs inside legacy salary text never become pay numbers',()=>{
  assert.equal(E.salary({GROK_SALARY:'POSTED $156,352-$260,586 base/yr, midpoint $208,469, source https://x.example/hcmUI/requisitions/748000/apply'}).mid,208469);
});

test('trust labels: legacy pay is known but never silently VERIFIED; estimates stay estimates; current posted wins',()=>{
  assert.equal(T.salary({GROK_SALARY:'POSTED $169,800-$355,400 base/yr'}),'VERIFIED');
  assert.match(T.salary({GROK_SALARY:'ESTIMATE $180K-$220K (aggregator)'}),/^ESTIMATED/);
  assert.match(T.salary({SALARY_MIDPOINT:'$195,000'}),/^ESTIMATED/);
  assert.match(T.salary({SALARY_MIDPOINT:'$195,000',SALARY_CONF:'VERIFIED'}),/^ESTIMATED · CONFIDENCE UNCONFIRMED/);
  assert.equal(T.salary({SALARY_BASE_POSTED:'$200,000-$240,000',SALARY_CONF:'VERIFIED',SALARY_MIDPOINT:'$150,000'}),'VERIFIED');
  assert.equal(T.salary({}),'UNKNOWN');
});

test('a stored qualitative fit label is still stored evidence, not a keyword recompute',()=>{
  const e=S.scoreRow({TITLE:'Director',COMPANY:'X',LOCATION:'Austin, TX',payload:{FIT:'HIGH sUAS sustaining+NPI'}},S.defaults()).parts.experience;
  assert.equal(e.rawScore,90);assert.equal(e.evidenceSource,'FIT');
  assert.equal(E.fit({FIT:'HIGH sUAS sustaining+NPI'}).value,null,'Fit bar keeps counting numeric measurements only, as before');
});
