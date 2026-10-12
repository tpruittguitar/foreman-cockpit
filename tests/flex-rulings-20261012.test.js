// Tim's FLEX rulings, 2026-10-12 12:55 ET (forge-coordination directives/FORGE_DIRECTIVE_Feasibility_Priority_and_FLEX_Rulings_2026-10-12.txt).
// Live-shaped V4 policy: HIGH +90, SOFT +30, NO -60, STRICT -100; EQUIVALENCY_CLASS=HIGH_FLEX.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../pipeline-policy');
const pol=P.normalizeFlexPolicy({FLEX_POLICY_VERSION:'RULES_V4_20261007',HIGH_FLEX_MODIFIER:90,SOFT_FLEX_MODIFIER:30,NO_FLEX_MODIFIER:-60,STRICT_MODIFIER:-100,NOT_STATED_CLASS:'HIGH_FLEX',EQUIVALENCY_CLASS:'HIGH_FLEX',HARD_DEGREE_CLASS:'NO_FLEX',SINGLE_PATH_CLASS:'STRICT'});
const cls=t=>P.flex({DEGREE_TEXT:t},pol).class;

test('(a) degree preferred, or equivalent education and experience -> HIGH_FLEX (Metromont, Virnig)',()=>{
  assert.equal(cls("Bachelor's degree in Engineering, Business or related field preferred, or equivalent form of combined education and experience."),'HIGH_FLEX');
  assert.equal(cls("Bachelor's degree preferred or equivalent education and experience"),'HIGH_FLEX');
  assert.equal(cls('Bachelor degree or equivalent experience'),'HIGH_FLEX','existing equivalency wording unchanged');
});
test('(b) hard engineering degree with no experience alternative -> NO_FLEX (Scout Motors, Vertex)',()=>{
  assert.equal(cls("Bachelor's or Master's degree in engineering"),'NO_FLEX');
  assert.equal(cls("Bachelor's degree with 10 years, Master's degree with 8 years, or PhD with 6 years of experience"),'NO_FLEX');
  assert.equal(cls('BS or MS in Mechanical Engineering'),'NO_FLEX');
  assert.equal(cls('Bachelor degree or 12 years of production experience'),'SOFT_FLEX','a years-of-experience alternative is still SOFT_FLEX');
});
test('(c) B.S. in a field or an equivalent technical field -> NO_FLEX (Shield AI)',()=>{
  assert.equal(cls('B.S. in Electrical Engineering or an equivalent technical field'),'NO_FLEX');
  assert.equal(cls('B.S. in Electrical Engineering or an equivalent technical field and 10+ years of experience'),'NO_FLEX','equivalent field plus years is not equivalent experience');
});
test('unchanged edges: preferred-only, no degree, no degree required, MS Office',()=>{
  assert.equal(cls("Bachelor's degree preferred"),'SOFT_FLEX'); // REV-006
  assert.equal(cls('10+ years manufacturing leadership'),'HIGH_FLEX');
  assert.equal(cls('No degree required'),'HIGH_FLEX');
  assert.equal(cls('Proficient in MS Office; 10 years experience'),'HIGH_FLEX','MS Office is not a degree');
});
test('Writer copy of the policy module is identical to the Explorer copy',()=>{
  assert.equal(fs.readFileSync(__dirname+'/../apps-script/PipelinePolicy.gs','utf8'),fs.readFileSync(__dirname+'/../pipeline-policy.js','utf8'));
});

test('REV-006 (Tim 2026-10-12): a degree named only in preferred wording is SOFT_FLEX',()=>{
  for(const t of ["Preferred only: Bachelor's or Master's in technical field","Bachelors or Masters in ME/EE/IE desired","Bachelor's degree in Engineering, Business Administration, or related field preferred, MBA or Master's strongly preferred","Preferred bachelor or master's in technical field","Bachelor's degree preferred"])assert.equal(cls(t),'SOFT_FLEX',t);
  // A degree stated outside the preferred clause stays hard.
  assert.equal(cls("Bachelor's degree in supply chain, engineering, or related technical field. Preferred: MBA or Master's degree in supply chain."),'NO_FLEX');
  assert.equal(cls("Bachelor's degree in Engineering, Business Administration, or a related field"),'NO_FLEX');
  assert.equal(cls("Bachelor's degree preferred, or equivalent education and experience"),'HIGH_FLEX');
});

test('REV-006: preferred-only wording does not release a recorded STRICT hold',()=>{
  const f=P.flex({DEGREE_TEXT:"Bachelor's degree preferred",FLEX_CLASS:'STRICT'},pol);
  assert.equal(f.class,'STRICT');
});
