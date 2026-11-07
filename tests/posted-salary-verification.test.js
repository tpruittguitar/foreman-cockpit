'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../pipeline-evidence'),Server=require('../apps-script/PipelineEvidence.gs'),T=require('../pipeline-trust'),S=require('../pipeline-scoring'),W=require('../apps-script/Code.gs'),Worklists=require('../apps-script/PipelineWorklists.gs');
const posted='Estimated annual base salary USD $180,000-$220,000.',old={SALARY_BASIS:'FORGE-ESTIMATE',SALARY_BASE_LOW:100000,SALARY_BASE_HIGH:140000};
test('server and client use employer posted wording ahead of stale estimated band',()=>{
 assert.equal(fs.readFileSync(require.resolve('../pipeline-evidence'),'utf8'),fs.readFileSync(require.resolve('../apps-script/PipelineEvidence.gs'),'utf8'));
 for(const evidence of [E,Server]){const p={...old,PAY_POSTED:posted},before=JSON.stringify(p);assert.equal(evidence.salary(p).low,180000);assert.equal(evidence.salary(p).source,'PAY_POSTED');assert.equal(JSON.stringify(p),before);
 for(const v of ['Indeed estimated base salary USD $180,000-$220,000.','Glassdoor estimate $180,000-$220,000.','Estimated base salary USD $180,000-$220,000 by Lensa.','UNVERIFIED estimated base salary $180,000-$220,000.'])assert.equal(evidence.salary({...old,PAY_POSTED:v}).low,100000,v);}
});
test('verified employer estimated base wording stays verified while salary-site labels stay estimates',()=>{
 assert.equal(T.salary({PAY_POSTED:posted,SALARY_BASIS:'EMPLOYER_POSTED',SALARY_CONF:'HIGH'}),'VERIFIED');
 assert.equal(T.salary({...old,PAY_POSTED:posted}),'VERIFIED');
 for(const doubt of ['UNVERIFIED','CONFLICT','LOW'])assert.equal(T.salary({...old,PAY_POSTED:posted,SALARY_CONF:doubt}),'POSTED · UNVERIFIED');
 assert.equal(T.salary({...old,PAY_POSTED:posted,SALARY_LABEL:'ESTIMATED'}),'POSTED · UNVERIFIED');
 assert.equal(T.salary({PAY_POSTED:'Indeed estimated base salary $180,000-$220,000.'}),'POSTED · UNVERIFIED');
 assert.match(T.salary({SALARY_BASE_EST:'$180,000-$220,000',SALARY_BASIS:'THIRD_PARTY_ESTIMATE'}),/^ESTIMATED/);
});
test('server and client scoring consume same corrected posted range',()=>{
 const ctx={PipelineEvidence:Server,PipelinePolicy:require('../pipeline-policy')};vm.runInNewContext(fs.readFileSync(require.resolve('../apps-script/PipelineScoring.gs'),'utf8'),ctx);
 const row={TITLE:'Quality Director',COMPANY:'Acme',LOCATION:'Austin, TX',payload:{...old,PAY_POSTED:posted}},p=S.payWorth(row,S.defaults()),q=ctx.PipelineScoring.payWorth(row,ctx.PipelineScoring.defaults());
 assert.equal(p.mid,200000);assert.equal(p.scorePoint,210000);assert.equal(q.mid,p.mid);assert.equal(q.scorePoint,p.scorePoint);assert.equal(q.score,p.score);assert.equal(p.lowConfidence,false);assert.equal(q.lowConfidence,false);
 const estimate={...row,payload:{...old,PAY_POSTED:'Indeed estimated base salary USD $180,000-$220,000.'}};assert.equal(S.payWorth(estimate,S.defaults()).lowConfidence,true);assert.equal(S.payWorth(estimate,S.defaults()).mid,120000);
});
test('canonical intake accepts posted numeric fields and worklist requires no second salary verification',()=>{
 const fields={SALARY_BASE_LOW:180000,SALARY_BASE_HIGH:220000,SALARY_MIDPOINT:200000,SALARY_BASIS:'EMPLOYER_POSTED',SALARY_SOURCE:'https://careers.example/jobs/1',SALARY_ASOF:'2026-11-07',SALARY_CONF:'HIGH'},got=W.sanitizeRecord({COMPANY:'Acme',TITLE:'Quality Director',LOCATION:'Austin, TX',SOURCE_URL:fields.SALARY_SOURCE,...fields});
 for(const [key,value] of Object.entries(fields))assert.equal(got[key],String(value));
 const line='1 | V2I-POSTED | Acme | Quality Director | SCOUT_INTAKE | - | - | - | Austin, TX | '+Object.entries({...fields,DEGREE_REQ:'REQUIRED'}).map(([k,v])=>k+'='+v).join('; ');
 assert.equal(Worklists.build(line).lanes.FORGE_ENRICH_FEASIBILITY.length,0);
});
