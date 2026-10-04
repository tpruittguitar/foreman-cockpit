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
  var FLEX_POLICY_DEFAULTS={HIGH_FLEX_MODIFIER:15,SOFT_FLEX_MODIFIER:6,NO_FLEX_MODIFIER:-10,STRICT_MODIFIER:-10,NOT_STATED_CLASS:'HIGH_FLEX',EQUIVALENCY_CLASS:'SOFT_FLEX',HARD_DEGREE_CLASS:'NO_FLEX',SINGLE_PATH_CLASS:'STRICT',FRESH_DEGREE_OVERRIDES_STALE_CLASS:'YES'};
  function normalizeFlexPolicy(c){
    c=c||{};var out={},classes={HIGH_FLEX:1,SOFT_FLEX:1,NO_FLEX:1,STRICT:1,UNKNOWN:1};
    Object.keys(FLEX_POLICY_DEFAULTS).forEach(function(k){out[k]=c[k]!==undefined?c[k]:FLEX_POLICY_DEFAULTS[k]});
    ['HIGH_FLEX_MODIFIER','SOFT_FLEX_MODIFIER','NO_FLEX_MODIFIER','STRICT_MODIFIER'].forEach(function(k){var n=Number(out[k]);out[k]=isFinite(n)&&n>=-100&&n<=100?n:FLEX_POLICY_DEFAULTS[k]});
    ['NOT_STATED_CLASS','EQUIVALENCY_CLASS','HARD_DEGREE_CLASS','SINGLE_PATH_CLASS'].forEach(function(k){var v=String(out[k]||'').toUpperCase();out[k]=classes[v]?v:FLEX_POLICY_DEFAULTS[k]});
    out.FRESH_DEGREE_OVERRIDES_STALE_CLASS=/^NO$/i.test(out.FRESH_DEGREE_OVERRIDES_STALE_CLASS)?'NO':'YES';
    return out;
  }
  function flex(p,cfg) {
    p=p||{};var policy=normalizeFlexPolicy(cfg),cls=String(p.FLEX_CLASS||p.FLEX||p.FLEX_HINT||'UNKNOWN').toUpperCase().replace(/[ -]+/g,'_');
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
    return {flex:f,rawFit:raw,adjustedFit:adjusted,decision:decision};
  }
  return {validUrl:validUrl,links:links,flex:flex,assess:assess,normalizeFlexPolicy:normalizeFlexPolicy,FLEX_POLICY_DEFAULTS:FLEX_POLICY_DEFAULTS};
}());
if(typeof module==='object'&&module.exports)module.exports=PipelinePolicy;
