/* Reviewed company-business decisions. Pure; runtime activation is explicit. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineBusiness=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function hash(value){if(typeof module==='object'&&module.exports)return require('node:crypto').createHash('sha256').update(value).digest('hex');return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
const EXCLUDED = new Set(['PHARMACEUTICALS', 'MEDICAL_DEVICES', 'HEALTHCARE_DELIVERY', 'DIAGNOSTICS_THERAPEUTICS', 'BULK_CHEMICALS', 'REFINING', 'RAW_MATERIAL_PRODUCTION']);
const PROTECTED = new Set(['INDUSTRIAL_SUPPLIER', 'DIVERSIFIED_INDUSTRIAL', 'DISCRETE_STAMPING', 'DISCRETE_MOLDING', 'DISCRETE_MACHINING']);
const TERMINAL = new Set(['APPLIED', 'REJECTED_BY_EMPLOYER', 'DECLINED_BY_TIM', 'CLOSED_DEAD', 'DUPLICATE', 'WITHDRAWN']);
const exact = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
function review(row, {fact, policy, now = Date.now()} = {}) {
  const result = (status, reason, details = {}) => ({schema:'forge.company-business-review.v1',status,reason,canonicalWrites:0,requiresNewResearch:false,...details});
  if (!row || !row.COMPANY) return result('REVIEW_NEEDED','EMPLOYER_UNIDENTIFIED');
  const p = row.p || row.payload || {};
  const agency = p.EMPLOYER_PRIMARY_BUSINESS === 'RECRUITING_AGENCY';
  const employer = agency ? p.CLIENT_EMPLOYER : row.COMPANY;
  if (!employer || /^unknown$/i.test(employer)) return result('REVIEW_NEEDED','CLIENT_UNIDENTIFIED');
  if (agency && (!p.CLIENT_EMPLOYER_EVIDENCE_URL || !p.CLIENT_EMPLOYER_ASOF)) return result('REVIEW_NEEDED','CLIENT_IDENTITY_UNVERIFIED');
  if (!fact || exact(fact.company) !== exact(employer)) return result('REVIEW_NEEDED','EXACT_EMPLOYER_FACT_UNAVAILABLE');
  if (fact.scope !== 'EMPLOYER_PRIMARY_BUSINESS' || fact.status !== 'CONFIRMED' || fact.confidence !== 'HIGH' || fact.conflict === true) return result('REVIEW_NEEDED','PRIMARY_BUSINESS_UNCONFIRMED');
  const at = Date.parse(fact.verifiedAt);
  if (!Number.isFinite(now) || !Number.isFinite(at) || at > now || now-at > 180*86400000) return result('REVIEW_NEEDED','BUSINESS_FACT_STALE');
  if (!Array.isArray(fact.sources) || !fact.sources.length || !fact.sources.every(s => s && /^https:\/\//.test(s.url || '') && typeof s.quote === 'string' && s.quote.trim().length >= 30 && /^[a-f0-9]{64}$/.test(s.contentSha256 || ''))) return result('REVIEW_NEEDED','SOURCE_BOUND_EVIDENCE_REQUIRED');
  if (PROTECTED.has(fact.category)) return result('NO_EXCLUSION','PROTECTED_BUSINESS_CLASS');
  if (!EXCLUDED.has(fact.category)) return result('REVIEW_NEEDED','BUSINESS_CLASS_UNRESOLVED');
  const rules = policy && Array.isArray(policy.rules) ? policy.rules.filter(r => r.category === fact.category && r.active === true) : [];
  if (!policy || policy.status !== 'ACTIVE' || !policy.revision || rules.length !== 1) return result('REVIEW_NEEDED','CURRENT_POLICY_BINDING_REQUIRED');
  const rule = rules[0];
  if (!rule.id || !rule.definition || hash(rule.definition) !== rule.definitionSha256 || fact.policyRevision !== policy.revision || fact.ruleId !== rule.id || fact.definitionSha256 !== rule.definitionSha256) return result('REVIEW_NEEDED','RULE_OR_FACT_BINDING_CHANGED');
  const binding = {employer,category:fact.category,ruleId:rule.id,policyRevision:policy.revision,factSha256:hash(JSON.stringify(fact)),suppressActiveConsideration:true};
  if (TERMINAL.has(row.BUCKET) || /^(YES|TRUE)$/i.test(p.ANTI_RESURRECTION || '') || /^(YES|TRUE)$/i.test(p.DO_NOT_REWORK || '')) return result('PRESERVE_HISTORY','CONFIRMED_EXCLUDED_EMPLOYER',binding);
  if (p.TIM_OVERRIDE || p.TIM_RULING || p.TIM_NOTE || row.BUCKET === 'TIM_DECISION_REQUIRED' || row.BUCKET === 'BLOCKED') return result('REVIEW_PROTECTED_DECISION','EXPLICIT_TIM_DECISION_REQUIRES_ADJUDICATION',{...binding,suppressActiveConsideration:false});
  return result(row.PRIMARY_ID ? 'PROPOSE_WRITER_DISPOSITION' : 'PROPOSE_INTAKE_EXCLUSION','CONFIRMED_EXCLUDED_EMPLOYER',binding);
}


function assess(row,context){
 if(!context||context.enabled!==true)return {status:'DISABLED',canonicalWrites:0,requiresNewResearch:false,suppressActiveConsideration:false};
 const p=row.p||row.payload||row;
 const employer=p.EMPLOYER_PRIMARY_BUSINESS==='RECRUITING_AGENCY'?p.CLIENT_EMPLOYER:row.COMPANY;
 const matches=(Array.isArray(context.facts)?context.facts:[]).filter(f=>exact(f.company)===exact(employer));
 if(matches.length!==1)return {status:'REVIEW_NEEDED',reason:matches.length?'AMBIGUOUS_EMPLOYER_FACTS':'EXACT_EMPLOYER_FACT_UNAVAILABLE',canonicalWrites:0,requiresNewResearch:false,suppressActiveConsideration:false};
 return review({...row,p},{fact:matches[0],policy:context.policy,now:context.now});
}
function partition(rows,context){const kept=[],suppressed=[],review=[];for(const row of rows){const decision=assess(row,context);if(decision.suppressActiveConsideration)suppressed.push({row,decision});else {kept.push(row);if(decision.status!=='DISABLED'&&decision.status!=='NO_EXCLUSION')review.push({row,decision});}}return {kept,suppressed,review,canonicalWrites:0};}
return {review,assess,partition};
});
