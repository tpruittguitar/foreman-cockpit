const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../pipeline-scoring');
const html=fs.readFileSync(path.join(__dirname,'..','pipeline.html'),'utf8');

test('2026-10-14 defaults: title folded into experience, culture 5, total 100',()=>{
  const w=S.defaults().weights;
  assert.deepEqual(w,{experience:40,flex:30,compensation:15,geo:10,ats:0,title:0,culture:5,ownership:0});
  assert.equal(S.weightTotal(S.defaults()),100);
  assert.equal(S.modelVersion,'2026-10-14.1');
});

test('compensation curve: 0 at floor, 50 at target, 100 at ceiling',()=>{
  const f=v=>S.compCurve(v,160000,220000,320000);
  assert.equal(f(150000),0);assert.equal(f(160000),0);assert.equal(f(190000),25);
  assert.equal(f(220000),50);assert.equal(f(270000),75);assert.equal(f(320000),100);assert.equal(f(500000),100);
  const r=S.scoreRow({COMPANY:'X',TITLE:'Director',LOCATION:'Chattanooga, TN',payload:{SALARY_BASE_LOW:'200000',SALARY_BASE_HIGH:'240000'}},S.defaults());
  assert.equal(r.parts.compensation.score,50);
});

test('culture reads the Target Companies list from canonical rules',()=>{
  const rules='SECTION=TARGET_COMPANIES\nTARGET_COMPANY={"company":"Anduril","aliases":["Anduril Industries"],"priority":"P2"}\nTARGET_COMPANY={"company":"Pyka","priority":"P3"}\nTARGET_COMPANY={"company":"GITAI","priority":"PAUSED"}\nSECTION=OTHER\nTARGET_COMPANY={"company":"Ignored","priority":"P1"}\n';
  const list=S.targetCompaniesFromRules(rules);
  assert.deepEqual(list.map(c=>c.company),['Anduril','Pyka','GITAI']);
  const cfg=S.normalize({targetCompanies:list});
  const cul=co=>S.scoreRow({COMPANY:co,TITLE:'Director',LOCATION:'Austin, TX',payload:{}},cfg).parts.culture;
  assert.equal(cul('Anduril Industries').score,90);
  assert.equal(cul('Pyka, Inc.').score,75);
  assert.equal(cul('GITAI USA').score,40);
  assert.equal(cul('Raytheon').score,40);
  assert.equal(cul('Andurilx').score,40);
  assert.equal(cul('FPC of Brighton (recruiter, hidden client)').known,false);
  assert.equal(S.scoreRow({COMPANY:'Raytheon',TITLE:'D',LOCATION:'Austin, TX',payload:{CULTURE_SCORE:'77'}},cfg).parts.culture.score,77);
  assert.equal(S.scoreRow({COMPANY:'Raytheon',TITLE:'D',LOCATION:'Austin, TX',payload:{}},S.defaults()).parts.culture.known,false);
  assert.notEqual(S.fingerprint(cfg),S.fingerprint(S.defaults()));
});

test('viewer feeds targets from rules and never publishes them in the model',()=>{
  assert.match(html,/targetCompanies:PipelineScoring\.targetCompaniesFromRules\(text\)/);
  assert.match(html,/delete draft\.targetCompanies;/);
});

test('Writer scoring copy is byte-identical and receives the target list',()=>{
  assert.equal(fs.readFileSync(path.join(__dirname,'..','apps-script','PipelineScoring.gs'),'utf8'),fs.readFileSync(path.join(__dirname,'..','pipeline-scoring.js'),'utf8'));
  const code=fs.readFileSync(path.join(__dirname,'..','apps-script','Code.gs'),'utf8');
  assert.match(code,/policy\._TARGET_COMPANIES = PipelineScoring\.targetCompaniesFromRules\(text\)/);
  assert.match(code,/targetCompanies:policy\._TARGET_COMPANIES\|\|\[\]/);
});

test('Open roles is the default view and hides Applied; All live keeps it',()=>{
  assert.match(html,/OPEN:\{label:'Open roles',[^\n]*fn:function\(r\)\{return !terminalJob_\(r\)&&r\.BUCKET!=='APPLIED'\}\}/);
  assert.match(html,/ALL:\{label:'All live'/);
  assert.match(html,/if\(!LS\.get\('openDefaultV1',false\)\)\{if\(S\.preset==='ALL'\)S\.preset='OPEN';LS\.set\('openDefaultV1',true\)\}/);
});

test('structured runtime loads the published model and canonical rules',()=>{
  assert.match(html,/function loadScoringGovernance_\(\)\{\s*if\(!hasWriter\(\)\)return;\s*loadCanonicalScoring_\(\)/);
  assert.match(html,/readout\('<b>fetching structured runtime\.<\/b>'\);loadScoringGovernance_\(\);/);
  assert.match(html,/if\(hasWriter\(\)\)\{syncStateDown\(\);loadScoringGovernance_\(\);/);
});
