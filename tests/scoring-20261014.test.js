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

test('each scoring section has one Update button with a confirming progress bar',()=>{
  for(const id of ['score-update-weights','score-update-map','fp-weight-update','rules-flex-save'])assert.match(html,new RegExp('id=\\\\?"'+id+'\\\\?"'));
  for(const id of ['score-update-weights-bar','score-update-map-bar','fp-weight-bar','rules-flex-bar'])assert.match(html,new RegExp('id=\\\\?"'+id+'\\\\?" class=\\\\?"upd-bar\\\\?" hidden'));
  assert.match(html,/function updateBar_\(host\)/);
  assert.match(html,/function updateScoringSection_\(sectionLabel,barHost,draftOverride\)/);
  assert.match(html,/bar\.step\(75,'Reading back to confirm…'\)/);
  assert.match(html,/scoringSameAsDraft_\(rb\.model,dedupePointsForCompare_\(draft\)\)/);
  assert.match(html,/LS\.set\('scoringLocalEdited',false\)/);
  assert.doesNotMatch(html,/Save weight on this device/);
  assert.match(html,/save\.dataset\.scoreEnhanced='1';save\.hidden=true;/);
});

test('FLEX modifiers outside -100..100 are refused in the panel and clamped by both parsers',()=>{
  const R=require('../pipeline-rules'),P=require('../pipeline-policy');
  assert.equal(R.flexPolicy('SECTION=DEGREE_FLEX\nHIGH_FLEX_MODIFIER=200\nNO_FLEX_MODIFIER=-160\n').HIGH_FLEX_MODIFIER,100);
  assert.equal(R.flexPolicy('SECTION=DEGREE_FLEX\nHIGH_FLEX_MODIFIER=200\nNO_FLEX_MODIFIER=-160\n').NO_FLEX_MODIFIER,-100);
  assert.equal(P.normalizeFlexPolicy({HIGH_FLEX_MODIFIER:'200'}).HIGH_FLEX_MODIFIER,100);
  assert.equal(fs.readFileSync(path.join(__dirname,'..','apps-script','PipelinePolicy.gs'),'utf8'),fs.readFileSync(path.join(__dirname,'..','pipeline-policy.js'),'utf8'));
  assert.match(html,/each modifier must be a number from -100 to 100/);
  assert.match(html,/reads back as '\+got\[k\]\+', expected '\+policy\[k\]/);
});

test('one-job model tester previews live and saves the whole model through the same update path',()=>{
  assert.match(html,/id="score-tester-open" class="neon">Test on one job…/);
  assert.match(html,/function openScoreTester_\(\)/);
  assert.match(html,/updateScoringSection_\('the whole model',\$\('st-bar'\),live\)/);
  assert.match(html,/function updateScoringSection_\(sectionLabel,barHost,draftOverride\)/);
  assert.match(html,/Rank among '\+rows\.length\+' open roles/);
});

test('tester button is wired only after the shared-model row creates it',()=>{
  const fn=html.slice(html.indexOf('function enhanceScoringControls_(){'));
  const body=fn.slice(0,fn.indexOf('\n}\n'));
  assert.ok(body.indexOf("insertAdjacentHTML('afterbegin'")<body.indexOf("$('score-tester-open')"),'button created before wiring');
  assert.doesNotMatch(body,/\$\('score-tester-open'\)\.onclick/);
});

test('scoring config is memoized; rules text is not re-parsed per row',()=>{
  assert.match(html,/function buildScoringCfg_\(\)/);
  assert.match(html,/if\(m\.cfg&&scoreCache\.fp!==''&&m\.scoring===S\.scoring&&m\.text===text&&m\.rev===rev\)return m\.cfg;/);
  assert.match(html,/function scoreFor_\(r\)\{if\(!r\)return null;var cfg=scoringCfg_\(\),fp=scoringCfgMemo_\.fp;/);
});

test('writes retry on Writer lock timeout and the default view re-reads a fresh copy after writes',()=>{
  assert.match(html,/var WRITER_BUSY_RE_=\/lock timeout\|writer busy\|another process was holding the lock\/i/);
  assert.match(html,/function gsPostRetryBusy_\(body,onRetry\)/);
  assert.match(html,/gsPostRetryBusy_\(\{action:'ruling',ruling:ru\}/);
  assert.match(html,/gsPostRetryBusy_\(\{action:'batch',requests:chunk\}\)/);
  assert.match(html,/function reloadAfterWrite_\(\)\{if\(S\.structuredBase&&S\.cfg\.key\)return importStructuredFromWriter_\(S\.structuredBase\)/);
  assert.match(html,/if\(j\.ok\)\{setText_\('edit-status','Saved · refreshing the master to confirm…'\);reloadAfterWrite_\(\)\}/);
  assert.match(html,/S\.structuredBase=base;\s*if\(S\.cfg\.key&&!S\.structuredSyncing&&Date\.now\(\)-\(S\.structuredSyncedAt\|\|0\)>60000\)/);
  assert.doesNotMatch(html,/gsPost\(\{action:'ruling',ruling:ru\}\)\.then\(function\(j\)\{ru\.receipt/);
});

test('readback confirms by state; notes compare the way the Writer stores them',()=>{
  const T=require('../pipeline-trust');
  const row=(bucket,p)=>({BUCKET:bucket,payload:p||{}});
  assert.equal(T.matches(row('CLOSED_DEAD',{}),{kind:'CLOSED_DEAD',code:'NO_LONGER_AVAILABLE',note:'gone'}),true);
  assert.equal(T.matches(row('DECLINED_BY_TIM',{DECLINE_REASON_CODE:'FLEX_STRICT_NO'}),{kind:'DECLINE',code:'FLEX_STRICT_NO'}),true);
  assert.equal(T.matches(row('DECLINED_BY_TIM',{DECLINE_REASON_CODE:'PAY_BELOW_FLOOR'}),{kind:'DECLINE',code:'FLEX_STRICT_NO'}),false);
  assert.equal(T.matches(row('APPLIED',{}),{kind:'DECLINE',code:'FLEX_STRICT_NO'}),false);
  assert.equal(T.matches(row('APPLIED',{TIM_NOTE:'Hello Tim, Thanks, team / ops [Tim 2026-10-14]'}),{kind:'NOTE',note:'Hello Tim;\n\nThanks; team | ops'}),true);
  assert.equal(T.matches(row('APPLIED',{TIM_NOTE:'Something else [Tim 2026-10-14]'}),{kind:'NOTE',note:'Hello Tim'}),false);
  assert.equal(T.matches(row('APPLIED',{TIM_NOTE:'Hello Tim, Thanks, team / ops [Tim 2026-10-14]'}),{kind:'NOTE',note:'Hello Tim; Thanks; team | ops'}),true);
  assert.equal(T.matches(row('APPLIED',{TIM_NOTE:'Line one Line two [Tim 2026-10-14]'}),{kind:'NOTE',note:'Line one\n\nLine two'}),true);
});
