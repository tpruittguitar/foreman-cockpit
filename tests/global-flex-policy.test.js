const test=require('node:test'),assert=require('node:assert/strict');
const R=require('../pipeline-rules');
const P=require('../pipeline-policy');
const W=require('../apps-script/Code.gs');

test('FLEX policy defaults preserve current production behavior',()=>{
  const p=R.flexPolicy('SECTION=OTHER\nX=1\n');
  assert.equal(p.HIGH_FLEX_MODIFIER,15);
  assert.equal(p.SOFT_FLEX_MODIFIER,6);
  assert.equal(p.NO_FLEX_MODIFIER,-10);
  assert.equal(p.STRICT_MODIFIER,-10);
  assert.equal(p.NOT_STATED_CLASS,'HIGH_FLEX');
  assert.equal(p.EQUIVALENCY_CLASS,'SOFT_FLEX');
  assert.equal(p.HARD_DEGREE_CLASS,'NO_FLEX');
  assert.equal(p.SINGLE_PATH_CLASS,'STRICT');
});

test('Rules editor round-trips structured FLEX policy in canonical DEGREE_FLEX section',()=>{
  const src='TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\n- prose stays here\nSECTION=TITLE_SCOPE_FIT\nX=1\n';
  const out=R.setFlexPolicy(src,{HIGH_FLEX_MODIFIER:12,SOFT_FLEX_MODIFIER:4,NO_FLEX_MODIFIER:-8,STRICT_MODIFIER:-20,NOT_STATED_CLASS:'SOFT_FLEX',EQUIVALENCY_CLASS:'HIGH_FLEX',HARD_DEGREE_CLASS:'STRICT',SINGLE_PATH_CLASS:'STRICT'});
  const p=R.flexPolicy(out);
  assert.equal(p.HIGH_FLEX_MODIFIER,12);
  assert.equal(p.SOFT_FLEX_MODIFIER,4);
  assert.equal(p.NO_FLEX_MODIFIER,-8);
  assert.equal(p.STRICT_MODIFIER,-20);
  assert.equal(p.NOT_STATED_CLASS,'SOFT_FLEX');
  assert.equal(p.EQUIVALENCY_CLASS,'HIGH_FLEX');
  assert.equal(p.HARD_DEGREE_CLASS,'STRICT');
  assert.match(out,/- prose stays here/);
  assert.equal((out.match(/HIGH_FLEX_MODIFIER=/g)||[]).length,1);
});

test('PipelinePolicy consumes canonical FLEX class mappings and modifiers',()=>{
  const cfg={HIGH_FLEX_MODIFIER:11,SOFT_FLEX_MODIFIER:3,NO_FLEX_MODIFIER:-7,STRICT_MODIFIER:-25,NOT_STATED_CLASS:'SOFT_FLEX',EQUIVALENCY_CLASS:'HIGH_FLEX',HARD_DEGREE_CLASS:'STRICT',SINGLE_PATH_CLASS:'STRICT'};
  let f=P.flex({DEGREE_TEXT:'Degree not stated'},cfg);
  assert.equal(f.class,'SOFT_FLEX');assert.equal(f.modifier,3);
  f=P.flex({DEGREE_TEXT:"Bachelor's degree or equivalent experience"},cfg);
  assert.equal(f.class,'HIGH_FLEX');assert.equal(f.modifier,11);
  f=P.flex({REQUIREMENTS_REVIEWED:'YES',DEGREE_TEXT:"Bachelor's degree required"},cfg);
  assert.equal(f.class,'STRICT');assert.equal(f.modifier,-25);assert.equal(f.blocked,true);
});

test('Writer mutation uses supplied canonical FLEX policy',()=>{
  const row='1 | TEST-1 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ1 | TN | TEST';
  const cfg={HIGH_FLEX_MODIFIER:9,SOFT_FLEX_MODIFIER:2,NO_FLEX_MODIFIER:-5,STRICT_MODIFIER:-30,NOT_STATED_CLASS:'HIGH_FLEX',EQUIVALENCY_CLASS:'SOFT_FLEX',HARD_DEGREE_CLASS:'STRICT',SINGLE_PATH_CLASS:'STRICT'};
  const r=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T1',fields:{DEGREE_TEXT:"Bachelor's degree required",REQUIREMENTS_REVIEWED:'YES'}},cfg);
  assert.equal(r.ok,true,r.error);
  const payload=W.parsePayload(r.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal(payload.FLEX_CLASS,'STRICT');
  assert.equal(payload.FLEX_MODIFIER,'-30');
});

test('Unrelated ENRICH still does not create FLEX fields under custom policy',()=>{
  const row='1 | TEST-2 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ2 | TN | TEST';
  const cfg={HIGH_FLEX_MODIFIER:99,NOT_STATED_CLASS:'STRICT'};
  const r=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T2',fields:{SALARY_BASE_EST:'$200000-$240000'}},cfg);
  const payload=W.parsePayload(r.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal('FLEX_CLASS' in payload,false);
  assert.equal('FLEX_MODIFIER' in payload,false);
});
