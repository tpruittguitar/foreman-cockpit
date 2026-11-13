var BUSINESS_CONTEXT_CACHE_=null;
/** Default-off, authenticated fixed-repository facts. Never use request-supplied context. */
function businessContext_(){
 if(BUSINESS_CONTEXT_CACHE_)return BUSINESS_CONTEXT_CACHE_;
 var disabled={enabled:false,status:'DISABLED',facts:[],now:Date.now()};
 try{
  var props=typeof PropertiesService!=='undefined'?PropertiesService.getScriptProperties().getProperties():{};
  if(props.COMPANY_BUSINESS_EXCLUSIONS_ENABLED!=='true')return disabled;
  var cfg=policyConfig_();
  if(cfg.source!=='GITHUB'||!cfg.token)return {enabled:false,status:'REVIEW_NEEDED',reason:'AUTHENTICATED_POLICY_REQUIRED',facts:[],now:Date.now()};
  var canonical=canonicalRulesText_();
  var source=githubPolicyRead_({repo:'tpruittguitar/forge-coordination',branch:'main',token:cfg.token},'reference/EMPLOYER_BUSINESS_CLASSIFICATIONS.json',false);
  if(!source.ok||!source.exists||!source.sha)throw new Error('REVIEWED_EMPLOYER_FACTS_UNAVAILABLE');
  var businessModule=typeof module==='object'&&module.exports?require('../pipeline-business'):PipelineBusiness;
  var context=businessModule.fromTrustedSources(canonical,JSON.parse(source.text),Date.now());
  context.referenceSha=source.sha;BUSINESS_CONTEXT_CACHE_=context;return context;
 }catch(e){return {enabled:false,status:'REVIEW_NEEDED',reason:'BUSINESS_CONTEXT_UNAVAILABLE',facts:[],now:Date.now()};}
}
/** Read-only readiness check, including while activation is off. Never populates runtime context. */
function businessPreflight_(){
 var out={ok:true,ready:false,status:'REVIEW_NEEDED',reason:'BUSINESS_PREFLIGHT_UNAVAILABLE',enabled:false,policyRevision:'',referenceRevision:'',counts:{facts:0,eligible:0,retained:0,needsReview:0},canonicalWrites:0};
 try{
  var props=typeof PropertiesService!=='undefined'?PropertiesService.getScriptProperties().getProperties():{};
  out.enabled=props.COMPANY_BUSINESS_EXCLUSIONS_ENABLED==='true';
  var cfg=policyConfig_();
  if(cfg.source!=='GITHUB'||!cfg.token){out.reason='AUTHENTICATED_POLICY_REQUIRED';return out;}
  var canonical=githubPolicyRead_(cfg,cfg.rulesPath,true);
  if(!canonical.ok||!canonical.exists||!canonical.sha){out.reason='CANONICAL_POLICY_UNAVAILABLE';return out;}
  out.policyRevision=/^[a-f0-9]{40}$/.test(canonical.sha)?canonical.sha:'';
  var source=githubPolicyRead_({repo:'tpruittguitar/forge-coordination',branch:'main',token:cfg.token},'reference/EMPLOYER_BUSINESS_CLASSIFICATIONS.json',true);
  if(!source.ok||!source.exists||!source.sha){out.reason='REVIEWED_EMPLOYER_FACTS_UNAVAILABLE';return out;}
  out.referenceRevision=/^[a-f0-9]{40}$/.test(source.sha)?source.sha:'';
  var businessModule=typeof module==='object'&&module.exports?require('../pipeline-business'):PipelineBusiness;
  var context=businessModule.fromTrustedSources(canonical,JSON.parse(source.text),Date.now());
  if(context.enabled!==true){out.reason=context.reason;return out;}
  out.counts.facts=context.facts.length;
  context.facts.forEach(function(f){
   var result=businessModule.assess({COMPANY:f&&f.company},context);
   if(result.status==='PROPOSE_INTAKE_EXCLUSION')out.counts.eligible++;
   else if(result.status==='NO_EXCLUSION')out.counts.retained++;
   else out.counts.needsReview++;
  });
  out.ready=out.counts.facts>0&&out.counts.needsReview===0;
  out.status=out.ready?'READY':'REVIEW_NEEDED';
  out.reason=out.ready?'REVIEWED_SOURCE_READY':out.counts.facts?'FACT_REVIEW_REQUIRED':'NO_REVIEWED_EMPLOYER_FACTS';
  return out;
 }catch(e){return out;}
}
if(typeof module==='object'&&module.exports){module.exports=businessContext_;module.exports.preflight=businessPreflight_;}
