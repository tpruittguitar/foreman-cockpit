const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../pipeline-policy'),R=require('../pipeline-rules'),S=require('../pipeline-scoring'),W=require('../apps-script/Code.gs');
const v4={FLEX_POLICY_VERSION:'RULES_V4_20261007'};
const writerPolicy=Object.assign({},P.normalizeFlexPolicy(v4),{_SCORING_MODEL:S.defaults()});
const row='1 | V2I-REFERENCE | Tesla | Sr. Manager, Optimus Operations | SCOUT_INTAKE | INTAKE/AWAITING_ANALYSIS | - | 285047 | Austin, TX | TEST; SCOPE_FIT_RAW=70; FLOOR_STATUS=PASS; TITLE_RULE_STATUS=PASS';
const payload=line=>W.parsePayload(line.split(' | ').slice(9).join(' | ')).payload;
test('all Tim equivalency triggers override stale classes and never emit +20',()=>{
  for(const text of ['Degree preferred, or equivalent experience','Bachelor degree required, or equivalent experience','Bachelor degree; equivalent experience accepted','Bachelor degree or equivalent combination of education and experience']){
    for(const stale of ['SOFT_FLEX','NO_FLEX','STRICT']){
      const a=P.assess({DEGREE_TEXT:text,FLEX_CLASS:stale},70,v4);
      assert.equal(a.flex.class,'HIGH_FLEX',text);assert.equal(a.flex.modifier,15);assert.equal(a.adjustedFit,85);
    }
  }
});
test('requirement-only classification distinguishes alternate paths, related field, negation and unknown',()=>{
  const cases=[['10 years leading production operations','HIGH_FLEX',15],['Degree: not stated','HIGH_FLEX',15],['Bachelor degree or 12 years of production experience','SOFT_FLEX',6],["Bachelor degree or Master's degree",'SOFT_FLEX',6],['Bachelor degree in engineering or related field required, plus 10 years experience','NO_FLEX',-10],['Bachelor degree required; equivalent experience not accepted','NO_FLEX',-10],['Bachelor degree required; single path only; no substitutions','STRICT',-30],['','UNKNOWN',0],['Requirements unavailable','UNKNOWN',0],['Degree preferred','UNKNOWN',0]];
  for(const [text,cls,mod]of cases){const f=P.flex({DEGREE_TEXT:text,FLEX_CLASS:'HIGH_FLEX'},v4);assert.equal(f.class,cls,text);assert.equal(f.modifier,mod,text);}
});
test('STRICT blocks APPLY_NOW including new evidence in the same request; only Tim override releases it',()=>{
  const fields={DEGREE_TEXT:'Bachelor degree required; single path only',SCOPE_FIT_RAW:'99'};
  const held=W.mutateRow(row,{kind:'APPLY_NOW',value:'YES',actor:'FORGE',fields},writerPolicy);
  assert.equal(held.ok,false);assert.match(held.error,/STRICT/);
  const tim=W.mutateRow(row,{kind:'APPLY_NOW',value:'YES',actor:'TIM',fields},writerPolicy);
  assert.equal(tim.ok,true,tim.error);assert.equal(payload(tim.after).TIM_FLEX_OVERRIDE,'YES');
  assert.equal(P.flex({FLEX_CLASS:'STRICT'},v4).blocked,true,'missing requirements cannot silently remove a stored STRICT hold');
  const stillHeld=W.mutateRow(row+'; FLEX_CLASS=STRICT',{kind:'ENRICH',fields:{DEGREE_TEXT:'Requirements unavailable'}},writerPolicy);
  assert.equal(stillHeld.ok,true,stillHeld.error);assert.equal(payload(stillHeld.after).FLEX_CLASS,'STRICT');assert.equal(payload(stillHeld.after).PURSUIT_STATUS,'STRICT_HOLD');
});
test('SITE and LARGE_PART are equally valid only with accountable plan, execution and results',()=>{
  const evidence={OWNERSHIP_UNSHARED:'YES',OWNERSHIP_PLAN:'YES',OWNERSHIP_EXECUTION:'YES',OWNERSHIP_RESULTS:'YES',OWNERSHIP_SCOPE:'Battery module shop',OWNERSHIP_BASIS:'Accountable for the area plan, execution and safety, people, quality, delivery and cost results'};
  const scores=['SITE','LARGE_PART'].map(form=>S.scoreRow({TITLE:'Senior Manager',payload:Object.assign({},evidence,{OWNERSHIP_FORM:form,DEGREE_TEXT:'No degree mentioned',SCOPE_FIT_RAW:85})},{...S.defaults(),flexPolicy:v4}));
  assert.equal(scores[0].parts.ownership.score,100);assert.equal(scores[1].parts.ownership.score,100);assert.equal(scores[0].overall,scores[1].overall);
  assert.equal(P.ownership({OWNERSHIP_FORM:'SITE',OWNERSHIP_SCORE:100}).known,false);
  assert.equal(P.ownership({...evidence,OWNERSHIP_FORM:'LARGE_PART',OWNERSHIP_UNSHARED:'NO'}).form,'NOT_OWNERSHIP');
  assert.equal(P.assess({...evidence,OWNERSHIP_FORM:'NOT_OWNERSHIP',DEGREE_TEXT:'No degree mentioned',FLOOR_STATUS:'PASS',TITLE_RULE_STATUS:'PASS'},90,v4).decision,'OWNERSHIP_HOLD');
});
test('Writer derives outputs on the requested evidence row, preserves identity, bucket and application history',()=>{
  const applied=row.replace('SCOUT_INTAKE | INTAKE/AWAITING_ANALYSIS','APPLIED | RESOLVED/APPLIED_CONFIRMED')+'; APP_DATE=2026-09-01; REJECTION_EVIDENCE=historic';
  const r=W.mutateRow(applied,{kind:'ENRICH',actor:'FORGE',fields:{DEGREE_TEXT:'Degree preferred, or equivalent experience',FLEX_CLASS:'SOFT_FLEX',FLEX_BASIS:'Verbatim requirements'}},writerPolicy);
  assert.equal(r.ok,true,r.error);assert.deepEqual(r.after.split(' | ').slice(0,9),applied.split(' | ').slice(0,9));
  const p=payload(r.after);assert.equal(p.FLEX_CLASS,'HIGH_FLEX');assert.equal(p.FLEX_MODIFIER,'15');assert.equal(p.ADJUSTED_FIT,'85');assert.equal(p.APP_DATE,'2026-09-01');assert.equal(p.REJECTION_EVIDENCE,'historic');
  for(const key of ['OVERALL','EXPERIENCE_FIT','GEO','NET_COMP','RATING_CONFIDENCE','FLEX_RATING_IMPACT','PURSUIT_STATUS'])assert.ok(Object.hasOwn(p,key),key);
  const cfg={...S.defaults(),flexPolicy:writerPolicy};
  const score=S.scoreRow({COMPANY:'Tesla',TITLE:'Sr. Manager, Optimus Operations',LOCATION:'Austin, TX',payload:{SCOPE_FIT_RAW:70,DEGREE_TEXT:'Degree preferred, or equivalent experience',FLOOR_STATUS:'PASS',TITLE_RULE_STATUS:'PASS'}},cfg);
  assert.equal(p.OVERALL,String(score.overall));
  for(const key of ['OVERALL','EXPERIENCE_FIT','GEO','NET_COMP','RATING_CONFIDENCE','FLEX_RATING_IMPACT','FLEX_MODIFIER','ADJUSTED_FIT','PURSUIT_STATUS']){
    const bad=W.mutateRow(row,{kind:'ENRICH',fields:{[key]:'99'}},writerPolicy);assert.equal(bad.ok,false,key);assert.match(bad.error,/SCORE_OUTPUT_FIELD/);
  }
  assert.equal(W.mutateRow(row,{kind:'ENRICH',fields:{DEGREE_TEXT:'Degree preferred, or equivalent experience'}},v4).ok,false,'missing scoring model fails before writing');
});
test('intake retains the three FLEX facts and derives outputs; no Tesla identity merge',()=>{
  const old=row.replace('V2I-REFERENCE','V2I-628904CF5172').replace('Optimus','CyberCab').replace('285047','285131');
  const rec={COMPANY:'Tesla',TITLE:'Sr. Manager, Optimus Operations',LOCATION:'Austin, TX',REQ_ID:'285047',SOURCE_URL:'https://www.tesla.com/careers/search/job/sr-manager-optimus-operations--285047',DEGREE_TEXT:'Degree preferred, or equivalent experience',FLEX_CLASS:'SOFT_FLEX',FLEX_BASIS:'Target requirement block',FLEX_MODIFIER:'20',ADJUSTED_FIT:'100',FLEX_HINT:'SOFT'};
  const plan=W.planIntake([old],[rec],{status:'ACTIVE',rules:[]},{flexPolicy:writerPolicy});
  assert.equal(plan.newLines.length,1);assert.notEqual(plan.results[0].PRIMARY_ID,'V2I-628904CF5172');
  const p=payload(plan.newLines[0]);assert.equal(p.DEGREE_TEXT,rec.DEGREE_TEXT);assert.equal(p.FLEX_CLASS,'HIGH_FLEX');assert.equal(p.FLEX_BASIS,rec.FLEX_BASIS);assert.equal(p.FLEX_MODIFIER,'15');assert.equal(p.FLEX_HINT,undefined);
});
test('canonical V4 parsing and repeated form saves preserve the version and unrelated sections',()=>{
  const text='TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\nFLEX_POLICY_VERSION=RULES_V4_20261007\nHIGH_FLEX_MODIFIER=30\nSOFT_FLEX_MODIFIER=20\nSECTION=OWNERSHIP\nOWNERSHIP_VERSION=OWNERSHIP_20261007\nSECTION=TARGET_COMPANIES\nTARGET_COMPANY=untouched';
  const policy=R.flexPolicy(text);assert.equal(policy.HIGH_FLEX_MODIFIER,30);assert.equal(policy.SOFT_FLEX_MODIFIER,20);assert.equal(policy.EQUIVALENCY_CLASS,'HIGH_FLEX');
  const saved=R.setFlexPolicy(text,policy);assert.match(saved,/FLEX_POLICY_VERSION=RULES_V4_20261007/);assert.ok(saved.endsWith(text.slice(text.indexOf('SECTION=OWNERSHIP'))));assert.equal(R.setFlexPolicy(saved,policy),saved);
  assert.equal(R.setFlexPolicy(saved,{SOFT_FLEX_MODIFIER:20}),saved,'saving the owner-confirmed current values is stable');
});
test('Apps Script shared modules execute without Node or browser globals',()=>{
  const ctx=vm.createContext({});
  for(const [src,target]of [['pipeline-policy.js','PipelinePolicy.gs'],['pipeline-evidence.js','PipelineEvidence.gs'],['pipeline-scoring.js','PipelineScoring.gs']]){
    assert.equal(fs.readFileSync(src,'utf8'),fs.readFileSync('apps-script/'+target,'utf8'));vm.runInContext(fs.readFileSync('apps-script/'+target,'utf8'),ctx);
  }
  assert.equal(ctx.PipelineScoring.scoreRow({TITLE:'Manager',payload:{DEGREE_TEXT:'Degree preferred, or equivalent experience',SCOPE_FIT_RAW:70}},{...S.defaults(),flexPolicy:v4}).assessment.adjustedFit,85);
});
