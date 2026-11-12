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
if(typeof module==='object'&&module.exports)module.exports=businessContext_;
