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
  assert.equal(p.FRESH_DEGREE_OVERRIDES_STALE_CLASS,'YES');
});

test('Rules editor round-trips structured FLEX policy in canonical DEGREE_FLEX section',()=>{
  const src='TIM_PIPELINE_RULES_CANONICAL\nSECTION=DEGREE_FLEX\n- prose stays here\nSECTION=TITLE_SCOPE_FIT\nX=1\n';
  const out=R.setFlexPolicy(src,{HIGH_FLEX_MODIFIER:12,SOFT_FLEX_MODIFIER:4,NO_FLEX_MODIFIER:-8,STRICT_MODIFIER:-20,NOT_STATED_CLASS:'SOFT_FLEX',EQUIVALENCY_CLASS:'HIGH_FLEX',HARD_DEGREE_CLASS:'STRICT',SINGLE_PATH_CLASS:'STRICT',FRESH_DEGREE_OVERRIDES_STALE_CLASS:'NO'});
  const p=R.flexPolicy(out);
  assert.equal(p.HIGH_FLEX_MODIFIER,12);
  assert.equal(p.SOFT_FLEX_MODIFIER,4);
  assert.equal(p.NO_FLEX_MODIFIER,-8);
  assert.equal(p.STRICT_MODIFIER,-20);
  assert.equal(p.NOT_STATED_CLASS,'SOFT_FLEX');
  assert.equal(p.EQUIVALENCY_CLASS,'HIGH_FLEX');
  assert.equal(p.HARD_DEGREE_CLASS,'STRICT');
  assert.equal(p.FRESH_DEGREE_OVERRIDES_STALE_CLASS,'NO');
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

test('Writer obeys app-managed fresh degree precedence switch',()=>{
  const row='1 | TEST-3 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ3 | TN | TEST; FLEX=SOFT; FLEX_CLASS=SOFT_FLEX; FLEX_MODIFIER=6';
  const base={HIGH_FLEX_MODIFIER:15,SOFT_FLEX_MODIFIER:6,NO_FLEX_MODIFIER:-10,STRICT_MODIFIER:-10,NOT_STATED_CLASS:'HIGH_FLEX',EQUIVALENCY_CLASS:'SOFT_FLEX',HARD_DEGREE_CLASS:'NO_FLEX',SINGLE_PATH_CLASS:'STRICT'};
  const yes=Object.assign({},base,{FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'});
  const no=Object.assign({},base,{FRESH_DEGREE_OVERRIDES_STALE_CLASS:'NO'});
  const fields={DEGREE_TEXT:"Bachelor's degree required",REQUIREMENTS_REVIEWED:'YES'};
  const ry=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T3Y',fields},yes);
  const py=W.parsePayload(ry.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal(py.FLEX_CLASS,'NO_FLEX');
  assert.equal(py.FLEX_MODIFIER,'-10');
  const rn=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T3N',fields},no);
  const pn=W.parsePayload(rn.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal(pn.FLEX_CLASS,'SOFT_FLEX');
  assert.equal(pn.FLEX_MODIFIER,'6');
});

test('Explicit FLEX in same write still wins over fresh degree precedence',()=>{
  const row='1 | TEST-4 | Test Co | Director | MANUAL_RESEARCH | OPEN | - | REQ4 | TN | TEST; FLEX_CLASS=NO_FLEX; FLEX_MODIFIER=-10';
  const cfg={FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'};
  const r=W.mutateRow(row,{kind:'ENRICH',actor:'CLAUDE',requestId:'T4',fields:{FLEX:'SOFT',DEGREE_TEXT:"Bachelor's degree required",REQUIREMENTS_REVIEWED:'YES'}},cfg);
  const p=W.parsePayload(r.after.split(' | ').slice(9).join(' | ')).payload;
  assert.equal(p.FLEX_CLASS,'SOFT_FLEX');
  assert.equal(p.FLEX_MODIFIER,'6');
});
