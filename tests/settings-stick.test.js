// Tim 2026-10-12: "My scoring and flex keeps getting reset" / "And my map geo changes".
// One regression test per root cause. Live-shaped values: HIGH +90, SOFT +30, NO -60, STRICT -100.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../pipeline-policy'),R=require('../pipeline-rules'),S=require('../pipeline-scoring'),W=require('../apps-script/Code.gs');

const LIVE='TIM_PIPELINE_RULES_CANONICAL\nPOLICY_VERSION=RULES_V4_20261007\nSECTION=DEGREE_FLEX\nFLEX_POLICY_VERSION=RULES_V4_20261007\nHIGH_FLEX_MODIFIER=90\nSOFT_FLEX_MODIFIER=30\nNO_FLEX_MODIFIER=-60\nSTRICT_MODIFIER=-100\nNOT_STATED_CLASS=HIGH_FLEX\nEQUIVALENCY_CLASS=HIGH_FLEX\nHARD_DEGREE_CLASS=NO_FLEX\nSINGLE_PATH_CLASS=STRICT\nFRESH_DEGREE_OVERRIDES_STALE_CLASS=YES\nFLEX_POLICY_PROSE_BEGIN\n- HIGH_FLEX +15: old\n- NO_FLEX -10: old\nFLEX_POLICY_PROSE_END\nSECTION=OWNERSHIP\nX=1\n';
const writerPolicyFrom=text=>{const parsed=R.flexPolicy(text);return Object.assign({},P.normalizeFlexPolicy(parsed),{_SCORING_MODEL:S.defaults()});};
const row='1 | V2I-STICK | Acme | Plant Director | SCOUT_INTAKE | INTAKE/AWAITING_ANALYSIS | - | 42 | Atlanta, GA | TEST; SCOPE_FIT_RAW=70';
const payload=line=>W.parsePayload(line.split(' | ').slice(9).join(' | ')).payload;

test('Defect 1: today\'s live Rules parse exactly as before (no silent score change)',()=>{
  const p=R.flexPolicy(LIVE);
  assert.equal(p.HIGH_FLEX_MODIFIER,90);assert.equal(p.NO_FLEX_MODIFIER,-60);assert.equal(p.STRICT_MODIFIER,-100);
  assert.equal(p.NOT_STATED_CLASS,'HIGH_FLEX');assert.equal(p.EQUIVALENCY_CLASS,'HIGH_FLEX');assert.equal(p.HARD_DEGREE_CLASS,'NO_FLEX');assert.equal(p.SINGLE_PATH_CLASS,'STRICT');assert.equal(p.FRESH_DEGREE_OVERRIDES_STALE_CLASS,'YES');
});

test('Defect 1: a FLEX class Tim saves under V4 sticks in the Explorer parser, the Writer policy and classification',()=>{
  const saved=R.setFlexPolicy(LIVE,Object.assign({},R.flexPolicy(LIVE),{EQUIVALENCY_CLASS:'SOFT_FLEX',HARD_DEGREE_CLASS:'STRICT'}));
  const p=R.flexPolicy(saved);
  assert.equal(p.EQUIVALENCY_CLASS,'SOFT_FLEX','Explorer reads back what Tim saved');assert.equal(p.HARD_DEGREE_CLASS,'STRICT');
  assert.equal(R.setFlexPolicy(saved,p),saved,'repeat save is byte-stable');
  const w=P.normalizeFlexPolicy({FLEX_POLICY_VERSION:'RULES_V4_20261007',EQUIVALENCY_CLASS:'SOFT_FLEX',HARD_DEGREE_CLASS:'STRICT'});
  assert.equal(w.EQUIVALENCY_CLASS,'SOFT_FLEX','Writer keeps the saved class');assert.equal(w.HARD_DEGREE_CLASS,'STRICT');
  assert.equal(w.NOT_STATED_CLASS,'HIGH_FLEX','absent keys still get V4 defaults');
  assert.equal(P.flex({DEGREE_TEXT:'Bachelor degree or equivalent experience'},w).class,'SOFT_FLEX','classification uses the saved mapping');
  assert.equal(P.flex({DEGREE_TEXT:'Bachelor degree in engineering required'},w).class,'STRICT');
});

test('Defect 1: V4 description text is generated from the saved numbers, never the old +15/-10',()=>{
  const out=R.setFlexPolicy(LIVE,R.flexPolicy(LIVE));
  const sec=out.match(/SECTION=DEGREE_FLEX\n([\s\S]*?)(?=\nSECTION=)/)[1];
  assert.match(sec,/FLEX modifiers: HIGH_FLEX \+90, SOFT_FLEX \+30, NO_FLEX -60, STRICT -100\./);
  assert.doesNotMatch(sec,/(?:^|\s)(?:\+15|-10|\+6|\+20)\b/m,'no stale numbers in prose');
  assert.match(out,/\nSECTION=OWNERSHIP\nX=1\n$/,'other sections untouched');
});

test('Defect 2: Tim\'s row FLEX choice is locked against text re-derivation and later unrelated writes',()=>{
  const pol=writerPolicyFrom(LIVE);
  const r1=W.mutateRow(row,{kind:'ENRICH',actor:'TIM',fields:{FLEX:'NO',DEGREE_TEXT:'Bachelor degree or equivalent experience'}},pol);
  assert.equal(r1.ok,true,r1.error);
  let p=payload(r1.after);assert.equal(p.TIM_FLEX_CLASS,'NO_FLEX');assert.equal(p.FLEX_CLASS,'NO_FLEX','Tim\'s pick beats the equivalency wording');assert.equal(p.FLEX_MODIFIER,'-60');
  const r2=W.mutateRow(r1.after,{kind:'ENRICH',actor:'FORGE',fields:{SALARY_BASE_POSTED:'$250,000'}},pol);
  assert.equal(r2.ok,true,r2.error);p=payload(r2.after);assert.equal(p.FLEX_CLASS,'NO_FLEX','unrelated lane write keeps it');
  const r3=W.mutateRow(r2.after,{kind:'ENRICH',actor:'FORGE',fields:{DEGREE_TEXT:'No degree required'}},pol);
  assert.equal(r3.ok,true,r3.error);assert.equal(payload(r3.after).FLEX_CLASS,'NO_FLEX','a lane\'s new degree text does not override Tim');
  const r4=W.mutateRow(r3.after,{kind:'ENRICH',actor:'TIM',fields:{FLEX:'UNKNOWN'}},pol);
  assert.equal(r4.ok,true,r4.error);p=payload(r4.after);assert.equal(p.TIM_FLEX_CLASS,undefined,'Tim setting UNKNOWN releases the lock');assert.equal(p.FLEX_CLASS,'HIGH_FLEX','text classification resumes');
});

test('Defect 2: agents cannot write the Tim lock; non-Tim FLEX is not locked',()=>{
  const pol=writerPolicyFrom(LIVE);
  const bad=W.mutateRow(row,{kind:'ENRICH',actor:'GROK',fields:{TIM_FLEX_CLASS:'HIGH_FLEX'}},pol);
  assert.equal(bad.ok,false);assert.match(bad.error,/TIM_FLEX_CLASS/);
  const ok=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',fields:{FLEX:'NO'}},pol);
  assert.equal(ok.ok,true,ok.error);assert.equal(payload(ok.after).TIM_FLEX_CLASS,undefined);
  assert.equal(W.timFlexChoice_({actor:'TIM',fields:{FLEX_CLASS:'strict no'}}),'STRICT');
  assert.equal(W.timFlexChoice_({actor:'TIM',fields:{SALARY_BASE_POSTED:'1'}}),null);
});

test('Defect 2: placeholder degree text is unresearched, never "degree not stated" HIGH_FLEX',()=>{
  const v4={FLEX_POLICY_VERSION:'RULES_V4_20261007'};
  for(const t of ['not stated in email alert excerpt','UNKNOWN (degree requirements not extracted verbatim this run; feasibility to capture)','UNKNOWN (no explicit degree requirement stated in posting summary; first-party JD emphasizes experience)','Degree requirement to be captured'])
    assert.equal(P.flex({DEGREE_TEXT:t},v4).class,'UNKNOWN',t);
  assert.equal(P.flex({DEGREE_TEXT:'Degree: not stated'},v4).class,'HIGH_FLEX','a reviewed "not stated" still counts');
  assert.equal(P.flex({DEGREE_TEXT:'No degree required'},v4).class,'HIGH_FLEX','"No degree required" is not a hard degree requirement');
  assert.equal(P.flex({DEGREE_TEXT:'A degree is not required'},v4).class,'HIGH_FLEX');
  assert.equal(P.flex({DEGREE_TEXT:'not stated in email alert excerpt',FLEX_CLASS:'STRICT'},v4).class,'STRICT','a recorded STRICT hold survives a placeholder');
});

test('Defect 2: the browser and Writer policy modules stay byte-identical',()=>{
  assert.equal(fs.readFileSync('pipeline-policy.js','utf8'),fs.readFileSync('apps-script/PipelinePolicy.gs','utf8'));
});

test('Defect 3: every map edit marks the local draft as edited, and Reset asks first',()=>{
  const html=fs.readFileSync('pipeline.html','utf8');
  const handlers=[/controlPoints\.splice\(\+b\.dataset\.pointRemove,1\);[^}]*/, /controlPoints\.push\(\{name:'New point'[^}]*\}\);[^}]*/, /else p\[e\.dataset\.point\]=\+e\.value\|\|0\}\);[^}]*/, /if\(lat\)lat\.value=p\.lat;[^}]*/];
  for(const re of handlers){const m=html.match(re);assert.ok(m,String(re));assert.match(m[0],/LS\.set\('scoringLocalEdited',true\)/,String(re));}
  assert.match(html,/\$\('score-reset'\)\.onclick=function\(\)\{if\(typeof confirm==='function'&&!confirm\(/);
});

test('Defect 4: stale scoring publishes are rejected; first publish and matching base pass',()=>{
  assert.equal(W.scoringPublishConflict_(0,{}),null,'first ever publish');
  assert.equal(W.scoringPublishConflict_(20,{baseRevision:20}),null);
  const stale=W.scoringPublishConflict_(20,{baseRevision:18});
  assert.equal(stale.ok,false);assert.equal(stale.mode,'REVISION_CONFLICT');assert.equal(stale.currentRevision,20);assert.match(stale.error,/revision 18.*revision 20/);
  assert.equal(W.scoringPublishConflict_(20,{}).mode,'REVISION_CONFLICT','old cached pages without a base revision are refused');
  const html=fs.readFileSync('pipeline.html','utf8');
  assert.match(html,/publishedBy:'TIM',baseRevision:baseRevision\}/,'Explorer sends the revision it edited from');
  assert.match(html,/j\.mode==='REVISION_CONFLICT'/,'Explorer keeps the draft on conflict');
});

test('Defect 4 (minor): exact duplicate map points are removed on publish',()=>{
  const m={geo:{controlPoints:[{name:'Seattle, WA',lat:47.6062,lon:-122.3321,score:20},{name:'Atlanta, GA',lat:33.749,lon:-84.388,score:80},{name:'Seattle, WA',lat:47.6062,lon:-122.3321,score:20}]}};
  assert.equal(W.dedupeControlPoints_(m),1);assert.deepEqual(m.geo.controlPoints.map(p=>p.name),['Seattle, WA','Atlanta, GA']);
});
