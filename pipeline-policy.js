/* Tim's standing FLEX and source-provenance rule, 2026-10-02. Shared with Writer. */
var PipelinePolicy = (function () {
  'use strict';
  function validUrl(v) { return /^https?:\/\/[^\s<>]+$/i.test(String(v || '').trim()); }
  function links(r) {
    var p=r.payload||r, found=[];
    ['INITIATING_URL','INTAKE_SOURCE_URL','MANUAL_INTAKE_URL','SOURCE_URL','COMPANY_SOURCE_URL','CANONICAL_URL','JOB_URL','SOURCE','REQ','raw'].forEach(function(k){
      var t=String(p[k]||r[k]||'');
      (t.match(/https?:\/\/[^\s<>|]+/gi)||[]).forEach(function(u){u=u.replace(/[;,.)]+$/,'');if(validUrl(u)&&found.indexOf(u)<0)found.push(u)});
    });
    return {all:found,initiating:validUrl(p.INITIATING_URL)?p.INITIATING_URL:found[0]||'',preferred:validUrl(p.COMPANY_SOURCE_URL)?p.COMPANY_SOURCE_URL:validUrl(p.SOURCE_URL)?p.SOURCE_URL:found[0]||'',companyConfirmed:validUrl(p.COMPANY_SOURCE_URL)&&/^(VERIFIED|HIGH)$/i.test(p.COMPANY_SOURCE_URL_CONF||'')};
  }
  var FLEX_POLICY_DEFAULTS={HIGH_FLEX_MODIFIER:15,SOFT_FLEX_MODIFIER:6,NO_FLEX_MODIFIER:-10,STRICT_MODIFIER:-10,NOT_STATED_CLASS:'HIGH_FLEX',EQUIVALENCY_CLASS:'SOFT_FLEX',HARD_DEGREE_CLASS:'NO_FLEX',SINGLE_PATH_CLASS:'STRICT',FRESH_DEGREE_OVERRIDES_STALE_CLASS:'NO'};
  var V4='RULES_V4_20261007';
  function isV4(c){return !!c&&c.FLEX_POLICY_VERSION===V4;}
  function normalizeFlexPolicy(c){
    c=c||{};var out={},classes={HIGH_FLEX:1,SOFT_FLEX:1,NO_FLEX:1,STRICT:1,UNKNOWN:1};
    Object.keys(FLEX_POLICY_DEFAULTS).forEach(function(k){out[k]=c[k]!==undefined?c[k]:FLEX_POLICY_DEFAULTS[k]});
    ['HIGH_FLEX_MODIFIER','SOFT_FLEX_MODIFIER','NO_FLEX_MODIFIER','STRICT_MODIFIER'].forEach(function(k){var n=Number(out[k]);out[k]=isFinite(n)&&n>=-100&&n<=100?n:FLEX_POLICY_DEFAULTS[k]});
    ['NOT_STATED_CLASS','EQUIVALENCY_CLASS','HARD_DEGREE_CLASS','SINGLE_PATH_CLASS'].forEach(function(k){var v=String(out[k]||'').toUpperCase();out[k]=classes[v]?v:FLEX_POLICY_DEFAULTS[k]});
    var fresh=String(out.FRESH_DEGREE_OVERRIDES_STALE_CLASS||'').toUpperCase();out.FRESH_DEGREE_OVERRIDES_STALE_CLASS=/^(YES|NO)$/.test(fresh)?fresh:FLEX_POLICY_DEFAULTS.FRESH_DEGREE_OVERRIDES_STALE_CLASS;
    if(isV4(c)){
      out.FLEX_POLICY_VERSION=V4;
      out.HIGH_FLEX_MODIFIER=15;out.SOFT_FLEX_MODIFIER=6;out.NO_FLEX_MODIFIER=-10;out.STRICT_MODIFIER=0;
      out.NOT_STATED_CLASS='HIGH_FLEX';out.EQUIVALENCY_CLASS='HIGH_FLEX';out.HARD_DEGREE_CLASS='NO_FLEX';out.SINGLE_PATH_CLASS='STRICT';out.FRESH_DEGREE_OVERRIDES_STALE_CLASS='YES';
    }
    return out;
  }
  // DEGREE_TEXT contains the requirement block, not an analyst's interpretation.
  function flexV4(p,policy){
    var text=String(p.DEGREE_TEXT||p.DEGREE_REQ||p.DEGREE||'').trim(),cls='UNKNOWN';
    var unavailable=!text||/^(UNKNOWN|UNVERIFIED|FETCH_BLOCKED|NOT_RESEARCHED|TBD)$/i.test(text)||/requirements? (?:unavailable|not (?:reviewed|verified|retrieved))|fetch blocked/i.test(text);
    var degree=/\b(degree|bachelor\w*|master\w*|doctorate|ph\.?d)\b/i.test(text);
    var equiv=/\bequivalent\s+(?:(?:work|professional|practical|relevant)\s+)?experience\b|\bequivalent\s+combination\s+of\s+education\s+and\s+experience\b|\bexperience\s+in\s+lieu\s+of\b/i.test(text);
    var negated=/\b(?:no|not|without)\s+(?:\w+\s+){0,3}equivalent\s+(?:work\s+)?experience\b|equivalent\s+(?:work\s+)?experience\s+(?:is\s+)?not\s+(?:accepted|allowed|considered)/i.test(text);
    var required=/\brequired\b|\bmust have\b|\bminimum\b/i.test(text);
    var alternate=/\balternatively\b|\bor\s+(?:(?:an?|at least|minimum of)\s+)?(?:\d+\+?\s*years?\b|(?:extensive|relevant|additional|professional)\s+experience\b|(?:certification|diploma|bachelor\w*|master\w*|associate\w*|doctorate)\b)/i.test(text);
    if(!unavailable){
      if(equiv&&!negated)cls='HIGH_FLEX';
      else if(/^(?:degree\s*:\s*)?(?:not[_ ]stated|not mentioned|no degree mentioned)$/i.test(text)||!degree)cls='HIGH_FLEX';
      else if(alternate&&!negated)cls='SOFT_FLEX';
      else if(required)cls=/\b(?:single|only)\s+(?:degree\s+)?path\b|\bno\s+(?:alternatives|substitutions)\b/i.test(text)||/^YES$/i.test(p.DEGREE_SINGLE_PATH_CONFIRMED||'')?'STRICT':'NO_FLEX';
    }
    var override=/^YES$/i.test(p.TIM_FLEX_OVERRIDE||''),mods={HIGH_FLEX:15,SOFT_FLEX:6,NO_FLEX:-10,STRICT:0,UNKNOWN:0};
    var priorStrict=/^(STRICT|STRICT_NO)$/i.test(p.FLEX_CLASS||p.FLEX||p.FLEX_HINT||'');
    if(cls==='UNKNOWN'&&priorStrict)cls='STRICT'; // Preserve the recorded hold until conclusive replacement evidence arrives.
    return {class:cls,modifier:mods[cls],known:cls!=='UNKNOWN',blocked:cls==='STRICT'&&!override,override:override,policy:policy};
  }
  // Evidence fields must describe the seat's actual accountabilities. A title alone never proves ownership.
  function ownership(p){
    p=p||{};var form=String(p.OWNERSHIP_FORM||'').toUpperCase(),basis=String(p.OWNERSHIP_BASIS||''),scope=String(p.OWNERSHIP_SCOPE||'').trim();
    if(form==='NOT_OWNERSHIP'||/^NO$/i.test(p.OWNERSHIP_UNSHARED||''))return {form:'NOT_OWNERSHIP',known:true,score:0,basis:basis||'Shared or supporting responsibility',version:'OWNERSHIP_20261007'};
    var proven=['OWNERSHIP_UNSHARED','OWNERSHIP_PLAN','OWNERSHIP_EXECUTION','OWNERSHIP_RESULTS'].every(function(k){return /^YES$/i.test(p[k]||'')});
    if(proven&&basis&&scope&&/^(SITE|LARGE_PART)$/.test(form))return {form:form,known:true,score:100,basis:basis,scope:scope,version:'OWNERSHIP_20261007'};
    return {form:'',known:false,score:null,basis:'Ownership evidence incomplete',version:'OWNERSHIP_20261007'};
  }
  function flex(p,cfg) {
    p=p||{};var policy=normalizeFlexPolicy(cfg),cls=String(p.FLEX_CLASS||p.FLEX||p.FLEX_HINT||'UNKNOWN').toUpperCase().replace(/[ -]+/g,'_');
    if(isV4(policy))return flexV4(p,policy);
    var degree=String(p.DEGREE_TEXT||p.DEGREE_REQ||p.DEGREE||'').trim();
    var aliases={YES:'HIGH_FLEX',HIGH:'HIGH_FLEX',SOFT:'SOFT_FLEX',NO:'NO_FLEX',STRICT_NO:'STRICT',NOT_STATED:policy.NOT_STATED_CLASS};
    cls=aliases[cls]||cls;
    var degreeNotStated=/not[_ ]stated|not mentioned|no degree(?: requirement)?|degree not (?:mentioned|required)/i.test(degree);
    var degreeEquiv=/equivalent experience|equivalent combination|experience in lieu|degree[^.]{0,120}\bor\b[^.]{0,120}experience|or extensive .*experience/i.test(degree);
    if(degreeNotStated)cls=policy.NOT_STATED_CLASS;
    else if(degreeEquiv)cls=policy.EQUIVALENCY_CLASS;
    if(!/^(HIGH_FLEX|SOFT_FLEX|NO_FLEX|STRICT)$/.test(cls)){
      cls='UNKNOWN';
      if(/^YES$/i.test(p.REQUIREMENTS_REVIEWED||'')&&degree){
        if(!/degree|bachelor|master|doctorate|ph\.?d/i.test(degree))cls=policy.NOT_STATED_CLASS;
        else if(/equivalent experience|equivalent combination|experience in lieu|or.*experience/i.test(degree))cls=policy.EQUIVALENCY_CLASS;
        else if(/^YES$/i.test(p.DEGREE_SINGLE_PATH_CONFIRMED||''))cls=policy.SINGLE_PATH_CLASS;
        else if(/required|must have|minimum/i.test(degree))cls=policy.HARD_DEGREE_CLASS;
      }
    }
    var override=/^YES$/i.test(p.TIM_FLEX_OVERRIDE||''),mods={HIGH_FLEX:policy.HIGH_FLEX_MODIFIER,SOFT_FLEX:policy.SOFT_FLEX_MODIFIER,NO_FLEX:policy.NO_FLEX_MODIFIER,STRICT:policy.STRICT_MODIFIER,UNKNOWN:0};
    return {class:cls,modifier:mods[cls],known:cls!=='UNKNOWN',blocked:cls==='STRICT'&&!override,override:override,policy:policy};
  }
  function assess(p,raw,cfg) {
    var f=flex(p,cfg),adjusted=raw==null?null:Math.max(0,Math.min(100,raw+f.modifier));
    var pay=String(p.FLOOR_STATUS||'').toUpperCase(),title=String(p.TITLE_RULE_STATUS||p.TITLE_STATUS||'').toUpperCase();
    var fail=/BELOW|FAIL/.test(pay)||/FAIL|BELOW/.test(title),clear=/CLEAR|PASS/.test(pay)&&/CLEAR|PASS/.test(title);
    var decision=f.blocked?'STRICT_HOLD':fail?'PAY_OR_TITLE_HOLD':adjusted==null||!f.known?'NEEDS_EVIDENCE':f.class==='NO_FLEX'&&adjusted<80?'LOW_ADJUSTED_FIT':!clear?'CHECK_PAY_AND_TITLE':'PURSUE_CANDIDATE';
    var own=isV4(f.policy)?ownership(p):null;
    if(own&&own.known&&own.form==='NOT_OWNERSHIP'&&!f.blocked)decision='OWNERSHIP_HOLD';
    return {flex:f,rawFit:raw,adjustedFit:adjusted,decision:decision,ownership:own};
  }
  return {validUrl:validUrl,links:links,flex:flex,assess:assess,ownership:ownership,isV4:isV4,V4:V4,normalizeFlexPolicy:normalizeFlexPolicy,FLEX_POLICY_DEFAULTS:FLEX_POLICY_DEFAULTS};
}());
if(typeof module==='object'&&module.exports)module.exports=PipelinePolicy;
