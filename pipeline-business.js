/* Reviewed company-business decisions. Pure; runtime activation is explicit. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineBusiness=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const browserHashes=new Map();
function hash(value){if(typeof module==='object'&&module.exports)return require('node:crypto').createHash('sha256').update(value).digest('hex');if(typeof Utilities==='undefined')return browserHashes.get(value)||'';return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
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
 if(context.expiresAt&&Date.now()>context.expiresAt)return {status:'REVIEW_NEEDED',reason:'BUSINESS_CONTEXT_EXPIRED',canonicalWrites:0,requiresNewResearch:false,suppressActiveConsideration:false};
 const p=row.p||row.payload||row;
 const employer=p.EMPLOYER_PRIMARY_BUSINESS==='RECRUITING_AGENCY'?p.CLIENT_EMPLOYER:row.COMPANY;
 const matches=(Array.isArray(context.facts)?context.facts:[]).filter(f=>exact(f.company)===exact(employer));
 if(matches.length!==1)return {status:'REVIEW_NEEDED',reason:matches.length?'AMBIGUOUS_EMPLOYER_FACTS':'EXACT_EMPLOYER_FACT_UNAVAILABLE',canonicalWrites:0,requiresNewResearch:false,suppressActiveConsideration:false};
 return review({...row,p},{fact:matches[0],policy:context.policy,now:context.now});
}
function partition(rows,context){const kept=[],suppressed=[],review=[];for(const row of rows){const decision=assess(row,context);if(decision.suppressActiveConsideration)suppressed.push({row,decision});else {kept.push(row);if(decision.status!=='DISABLED'&&decision.status!=='NO_EXCLUSION')review.push({row,decision});}}return {kept,suppressed,review,canonicalWrites:0};}
function fromTrustedSources(canonical,bundle,now){
 const inactive=reason=>({enabled:false,status:'REVIEW_NEEDED',reason,now,facts:[]});
 if(!canonical||!canonical.sha||typeof canonical.text!=='string'||!/^STATUS=ACTIVE$/m.test(canonical.text.split(/^SECTION=/m)[0]))return inactive('CURRENT_CANONICAL_POLICY_UNAVAILABLE');
 if(!bundle||bundle.schema!=='forge.employer-business-classifications.v1'||bundle.policyRevision!==canonical.sha||!Array.isArray(bundle.ruleBindings)||!Array.isArray(bundle.entries))return inactive('REVIEWED_FACT_BUNDLE_OR_POLICY_REVISION_UNAVAILABLE');
 const rules=[];
 for(const b of bundle.ruleBindings){
  if(!b||!EXCLUDED.has(b.category)||!b.id||!b.section||!b.definition||hash(b.definition)!==b.definitionSha256)return inactive('INVALID_RULE_BINDING');
  const header='SECTION='+b.section,parts=canonical.text.split(/\r?\n/),start=parts.indexOf(header);if(start<0)return inactive('CANONICAL_SECTION_MISSING');
  let end=start+1;while(end<parts.length&&!/^SECTION=/.test(parts[end]))end++;
  const section=parts.slice(start+1,end).join('\n');
  const definitions=parts.slice(start+1,end).filter(line=>line===b.definition);
  if(definitions.length!==1||!(section.includes('RULING_ID='+b.id)||b.definition.startsWith('- '+b.id+' ')))return inactive('RULE_DEFINITION_CHANGED');
  rules.push({id:b.id,category:b.category,active:true,definition:b.definition,definitionSha256:b.definitionSha256});
 }
 if(!rules.length||new Set(rules.map(r=>r.category)).size!==rules.length)return inactive('UNIQUE_REVIEWED_RULES_REQUIRED');
 // Every record is separately assessed for freshness, exact employer, scope and evidence.
 // The source adapter must establish this bundle came from the controlled repository.
 return {enabled:true,status:'ACTIVE',now,expiresAt:now+15*60000,policy:{status:'ACTIVE',revision:canonical.sha,rules},facts:bundle.entries.map(f=>{const valid=Array.isArray(f.sources)&&f.sources.length&&f.sources.every(s=>typeof s.capturedText==='string'&&s.capturedText.includes(s.quote)&&hash(s.capturedText)===s.contentSha256);return valid?f:{...f,status:'EVIDENCE_UNVERIFIED'};})};
}
async function prepareContext(context){
 if(!context||context.enabled!==true||typeof module==='object'&&module.exports||typeof Utilities!=='undefined')return context;
 if(typeof crypto==='undefined'||!crypto.subtle)return {enabled:false,status:'REVIEW_NEEDED',reason:'BROWSER_EVIDENCE_CHECK_UNAVAILABLE',facts:[]};
 const texts=[...(context.policy&&context.policy.rules||[]).map(r=>r.definition),...(context.facts||[]).map(f=>JSON.stringify(f))].filter(t=>typeof t==='string');
 for(const text of texts){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));browserHashes.set(text,Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join(''));}
 return context;
}
return {review,assess,partition,fromTrustedSources,prepareContext};
});
