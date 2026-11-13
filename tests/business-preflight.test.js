'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const B=require('../pipeline-business');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function fixture(){
 const definition='- Exclude employers whose primary business is pharmaceuticals.',rule={id:'TEST',section:'GLOBAL_TEST',category:'PHARMACEUTICALS',definition,definitionSha256:hash(definition)};
 const canonical={ok:true,exists:true,sha:'a'.repeat(40),text:'STATUS=ACTIVE\nSECTION=GLOBAL_TEST\nRULING_ID=TEST\n'+definition};
 const quote='The company develops and manufactures pharmaceutical medicines.';
 const fact={company:'Example',category:rule.category,scope:'EMPLOYER_PRIMARY_BUSINESS',status:'CONFIRMED',confidence:'HIGH',verifiedAt:new Date().toISOString(),policyRevision:canonical.sha,ruleId:rule.id,definitionSha256:rule.definitionSha256,sources:[{url:'https://example.test/about',quote,capturedText:quote,contentSha256:hash(quote)}]};
 return {canonical,bundle:{schema:'forge.employer-business-classifications.v1',policyRevision:canonical.sha,ruleBindings:[rule],entries:[fact]}};
}
function runtime(props={}){
 const f=fixture(),calls=[],box={Date,JSON,PipelineBusiness:B,PropertiesService:{getScriptProperties:()=>({getProperties:()=>props,setProperty(){throw Error('unexpected mutation');}})},policyConfig_:()=>({source:'GITHUB',repo:'tpruittguitar/forge-policy',branch:'main',rulesPath:'rules/TIM_PIPELINE_RULES_CANONICAL.txt',token:'secret-test-token'}),githubPolicyRead_:(cfg,path,fresh)=>{calls.push({repo:cfg.repo,branch:cfg.branch,path,fresh});return path.startsWith('rules/')?f.canonical:{ok:true,exists:true,sha:'b'.repeat(40),text:JSON.stringify(f.bundle)};}};
 vm.createContext(box);vm.runInContext(fs.readFileSync('apps-script/PipelineBusinessRuntime.gs','utf8'),box);return {box,calls,f,props};
}
test('disabled preflight reads fresh authenticated sources but never activates or fills runtime cache',()=>{
 const r=runtime(),result=r.box.businessPreflight_();a.equal(result.ready,true);a.equal(result.enabled,false);a.equal(result.canonicalWrites,0);a.equal(result.counts.eligible,1);a.equal(r.calls.length,2);a.equal(r.calls[0].fresh,true);a.deepEqual(r.calls[1],{repo:'tpruittguitar/forge-coordination',branch:'main',path:'reference/EMPLOYER_BUSINESS_CLASSIFICATIONS.json',fresh:true});a.equal(r.box.BUSINESS_CONTEXT_CACHE_,null);a.equal(r.box.businessContext_().status,'DISABLED');a.equal(r.calls.length,2);a.deepEqual(r.props,{});
 const safe=JSON.stringify(result);for(const s of ['secret-test-token','Example','pharmaceutical','capturedText','https://'])a.ok(!safe.includes(s));
});
test('preflight is fresh each invocation and leaves active context cache untouched',()=>{
 const r=runtime({COMPANY_BUSINESS_EXCLUSIONS_ENABLED:'true'}),cached={enabled:true,sentinel:true};r.box.BUSINESS_CONTEXT_CACHE_=cached;r.box.businessPreflight_();r.box.businessPreflight_();a.equal(r.calls.length,4);a.equal(r.box.BUSINESS_CONTEXT_CACHE_,cached);a.equal(r.props.COMPANY_BUSINESS_EXCLUSIONS_ENABLED,'true');
});
test('missing authentication and unreadable source fail with safe readiness reasons',()=>{
 for(const cfg of [{source:'DRIVE',token:'x'},{source:'GITHUB',token:''}]){const r=runtime();r.box.policyConfig_=()=>cfg;a.equal(r.box.businessPreflight_().reason,'AUTHENTICATED_POLICY_REQUIRED');a.equal(r.calls.length,0);}
 for(const failAt of [1,2]){const r=runtime();let n=0;const read=r.box.githubPolicyRead_;r.box.githubPolicyRead_=(...args)=>++n===failAt?{ok:false,error:'secret URL'}:read(...args);const out=r.box.businessPreflight_();a.equal(out.ready,false);a.equal(out.reason,failAt===1?'CANONICAL_POLICY_UNAVAILABLE':'REVIEWED_EMPLOYER_FACTS_UNAVAILABLE');a.ok(!JSON.stringify(out).includes('secret URL'));}
 const r=runtime();r.box.githubPolicyRead_=()=>{throw Error('secret token detail')};a.equal(r.box.businessPreflight_().reason,'BUSINESS_PREFLIGHT_UNAVAILABLE');
});
test('changed policy bindings, bad evidence, stale and duplicate facts cannot pass preflight',()=>{
 for(const change of [f=>f.bundle.policyRevision='old',f=>f.bundle.entries[0].sources[0].contentSha256='0'.repeat(64),f=>f.bundle.entries[0].verifiedAt='2020-01-01',f=>f.bundle.entries.push(f.bundle.entries[0]),f=>f.bundle.entries=[]]){const r=runtime();change(r.f);a.equal(r.box.businessPreflight_().ready,false);a.equal(r.box.businessContext_().status,'DISABLED');}
});
test('preflight route authenticates before source reads and ignores supplied context',()=>{
 const box={PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-key'})}};vm.createContext(box);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),box);box.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType(){return this},getContent:()=>text})};let n=0;box.businessPreflight_=function(){a.equal(arguments.length,0);n++;return {ok:true,ready:false};};
 a.equal(JSON.parse(box.doGet({parameter:{action:'business_preflight',key:'bad'}}).getContent()).ok,false);a.equal(n,0);a.equal(JSON.parse(box.doGet({parameter:{action:'business_preflight',key:'test-key',enabled:true,repo:'evil'}}).getContent()).ready,false);a.equal(n,1);
});
