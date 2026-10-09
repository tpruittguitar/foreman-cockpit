(function(root){
  'use strict';
  // Parse only the display outline. Preserve the original text and offsets for editing.
  function outline(text){text=String(text||'');var sections=[],current=null,offset=0;
    text.split(/\n/).forEach(function(line){var clean=line.replace(/\r$/,''),m=clean.match(/^\s*(?:SECTION\s*=\s*(.+)|#{1,4}\s+(.+)|\[([^\]]+)\])\s*$/);
      if(m){current={title:m[1]||m[2]||m[3],offset:offset,lines:[]};sections.push(current)}
      else {if(!current){current={title:'Ruleset overview',offset:0,lines:[]};sections.push(current)}current.lines.push(clean)}offset+=line.length+1;
    });return sections.filter(function(s){return s.lines.some(function(l){return l.trim()})||s.title!=='Ruleset overview'}).map(function(s,i){s.id='rule-section-'+i;return s});
  }
  var FLEX_DEFAULTS={
    HIGH_FLEX_MODIFIER:15,
    SOFT_FLEX_MODIFIER:6,
    NO_FLEX_MODIFIER:-10,
    STRICT_MODIFIER:-10,
    NOT_STATED_CLASS:'HIGH_FLEX',
    EQUIVALENCY_CLASS:'SOFT_FLEX',
    HARD_DEGREE_CLASS:'NO_FLEX',
    SINGLE_PATH_CLASS:'STRICT',
    FRESH_DEGREE_OVERRIDES_STALE_CLASS:'NO'
  };
  var FLEX_CLASSES=['HIGH_FLEX','SOFT_FLEX','NO_FLEX','STRICT','UNKNOWN'];
  function signed(n){n=Number(n);return (n>0?'+':'')+String(n)}
  function flexPolicyProse(p){
    if(p.FLEX_POLICY_VERSION==='RULES_V4_20261007')return [
      'FLEX_POLICY_PROSE_BEGIN',
      '- RULES_V4_20261007, Tim lock 2026-10-07 22:06 ET, supersedes RULES_V3. Class from the requirement text only; never invent equivalency.',
      '- HIGH_FLEX +15: no degree mentioned in the reviewed block, or an equivalent-experience path in that block.',
      '- SOFT_FLEX +6: degree listed with an alternate path that is not equivalent-experience language.',
      '- NO_FLEX -10: degree required without equivalency. Related field alone is not equivalency. Still pursue if adjusted fit is high and pay/title rules clear.',
      '- STRICT: degree required, no equivalency, single path only. Do not apply or mark APPLY NOW unless Tim explicitly overrides. The stored zero modifier is a transport sentinel, not eligibility.',
      '- HIGH_FLEX triggers: or equivalent experience; equivalent experience accepted; or equivalent combination of education and experience; preferred, or equivalent experience. Never SOFT_FLEX or +20 for this wording.',
      '- Scope/fit, then FLEX modifier, then pay floor and title rule. Adjusted fit = clamp(raw scope fit + FLEX modifier, 0, 100). Report class, modifier, adjusted score. Do not apply the modifier twice.',
      '- Blank/unresearched requirements remain UNKNOWN. Intake degree/FLEX inputs: DEGREE_TEXT, FLEX_CLASS, FLEX_BASIS only. Writer owns calculated outputs.',
      '- Tesla req 285047: Degree preferred, or equivalent experience => HIGH_FLEX +15.',
      'FLEX_POLICY_PROSE_END'
    ].join('\n');
    return [
      'FLEX_POLICY_PROSE_BEGIN',
      '- Degree not stated => '+p.NOT_STATED_CLASS+'.',
      '- Equivalent experience => '+p.EQUIVALENCY_CLASS+'.',
      '- Hard degree requirement without equivalency => '+p.HARD_DEGREE_CLASS+'.',
      '- Confirmed single required degree path => '+p.SINGLE_PATH_CLASS+'.',
      '- FLEX modifiers: HIGH_FLEX '+signed(p.HIGH_FLEX_MODIFIER)+', SOFT_FLEX '+signed(p.SOFT_FLEX_MODIFIER)+', NO_FLEX '+signed(p.NO_FLEX_MODIFIER)+', STRICT '+signed(p.STRICT_MODIFIER)+'.',
      '- Blank unresearched requirements remain UNKNOWN (modifier 0).',
      '- NO_FLEX: still pursue if adjusted fit is 80+ and pay/title rules clear.',
      '- STRICT: modifier is for reporting; do not pursue unless Tim overrides. Do not automatically convert NO_FLEX to STRICT.',
      '- Adjusted fit = clamp(raw scope fit + FLEX modifier, 0, 100). Report class, modifier, raw fit, adjusted fit, exact degree wording, and evidence. Apply pay and title rules afterward. Store unadjusted fit in SCOPE_FIT_RAW; do not apply the modifier twice.',
      '- Fresh degree evidence overrides stale FLEX = '+p.FRESH_DEGREE_OVERRIDES_STALE_CLASS+'. When enabled, only conclusive fresh degree evidence may replace a known class; inconclusive evidence preserves the known class.',
      '- Compatibility: YES=HIGH_FLEX, SOFT=SOFT_FLEX, NO=NO_FLEX, STRICT_NO=STRICT. FLEX concerns degree eligibility, not remote/hybrid work.',
      'FLEX_POLICY_PROSE_END'
    ].join('\n');
  }
  function flexPolicy(text){
    var out={};Object.keys(FLEX_DEFAULTS).forEach(function(k){out[k]=FLEX_DEFAULTS[k]});
    var sec=String(text||'').match(/(?:^|\n)SECTION=DEGREE_FLEX\s*\n([\s\S]*?)(?=\nSECTION=|$)/);
    if(!sec)return out;
    sec[1].split(/\r?\n/).forEach(function(line){
      var m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(!m||out[m[1]]===undefined)return;
      if(/_MODIFIER$/.test(m[1])){var n=Number(m[2]);if(isFinite(n)&&n>=-100&&n<=100)out[m[1]]=n}
      else if(m[1]==='FRESH_DEGREE_OVERRIDES_STALE_CLASS'){var b=String(m[2]||'').toUpperCase();if(/^(YES|NO)$/.test(b))out[m[1]]=b}
      else {var v=String(m[2]||'').toUpperCase();if(FLEX_CLASSES.indexOf(v)>=0)out[m[1]]=v}
    });
    if(/^FLEX_POLICY_VERSION=RULES_V4_20261007\s*$/m.test(sec[1]) || /^POLICY_VERSION=RULES_V4_20261007\s*$/m.test(String(text))){
      out.FLEX_POLICY_VERSION='RULES_V4_20261007';
      if(!/^HIGH_FLEX_MODIFIER=/m.test(sec[1]))out.HIGH_FLEX_MODIFIER=15;if(!/^SOFT_FLEX_MODIFIER=/m.test(sec[1]))out.SOFT_FLEX_MODIFIER=6;if(!/^NO_FLEX_MODIFIER=/m.test(sec[1]))out.NO_FLEX_MODIFIER=-10;if(!/^STRICT_MODIFIER=/m.test(sec[1]))out.STRICT_MODIFIER=-30;
      out.NOT_STATED_CLASS='HIGH_FLEX';out.EQUIVALENCY_CLASS='HIGH_FLEX';out.HARD_DEGREE_CLASS='NO_FLEX';out.SINGLE_PATH_CLASS='STRICT';out.FRESH_DEGREE_OVERRIDES_STALE_CLASS='YES';
    }
    return out;
  }
  function declineReasonCodes(text){
    var sec=String(text||'').match(/(?:^|\n)SECTION=DECLINE_RULES\s*\n([\s\S]*?)(?=\nSECTION=|$)/);
    if(!sec)return [];
    var m=sec[1].match(/Allowed reason codes:\s*([^\n]+)/i);
    if(!m)return [];
    return m[1].split(',').map(function(x){return x.trim().replace(/[.;:]+$/,'').toUpperCase()}).filter(function(x){return /^[A-Z][A-Z0-9_]+$/.test(x)});
  }
  function setFlexPolicy(text,policy){
    text=String(text||'');var p=flexPolicy(text),src=policy||{};
    Object.keys(FLEX_DEFAULTS).forEach(function(k){if(src[k]!==undefined)p[k]=src[k]});
    var block=[
      'FLEX_POLICY_VERSION='+(p.FLEX_POLICY_VERSION||'1'),
      'HIGH_FLEX_MODIFIER='+Number(p.HIGH_FLEX_MODIFIER),
      'SOFT_FLEX_MODIFIER='+Number(p.SOFT_FLEX_MODIFIER),
      'NO_FLEX_MODIFIER='+Number(p.NO_FLEX_MODIFIER),
      'STRICT_MODIFIER='+Number(p.STRICT_MODIFIER),
      'NOT_STATED_CLASS='+String(p.NOT_STATED_CLASS).toUpperCase(),
      'EQUIVALENCY_CLASS='+String(p.EQUIVALENCY_CLASS).toUpperCase(),
      'HARD_DEGREE_CLASS='+String(p.HARD_DEGREE_CLASS).toUpperCase(),
      'SINGLE_PATH_CLASS='+String(p.SINGLE_PATH_CLASS).toUpperCase(),
      'FRESH_DEGREE_OVERRIDES_STALE_CLASS='+String(p.FRESH_DEGREE_OVERRIDES_STALE_CLASS||FLEX_DEFAULTS.FRESH_DEGREE_OVERRIDES_STALE_CLASS).toUpperCase()
    ].join('\n');
    var sectionRe=/(^|\n)(SECTION=DEGREE_FLEX\s*\n)([\s\S]*?)(?=\nSECTION=|$)/;
    var m=text.match(sectionRe);
    if(!m)return text.replace(/\s*$/,'\n\n')+'SECTION=DEGREE_FLEX\n'+block+'\n'+flexPolicyProse(p)+'\n';
    var body=m[3]
      .replace(/^\s*(?:FLEX_POLICY_VERSION|HIGH_FLEX_MODIFIER|SOFT_FLEX_MODIFIER|NO_FLEX_MODIFIER|STRICT_MODIFIER|NOT_STATED_CLASS|EQUIVALENCY_CLASS|HARD_DEGREE_CLASS|SINGLE_PATH_CLASS|FRESH_DEGREE_OVERRIDES_STALE_CLASS)\s*=.*(?:\r?\n|$)/gm,'')
      .replace(/(?:^|\n)FLEX_POLICY_PROSE_BEGIN[\s\S]*?FLEX_POLICY_PROSE_END\s*(?=\n|$)/g,'\n')
      .replace(/^\s*-\s*(?:HIGH_FLEX:|SOFT_FLEX:|NO_FLEX:|STRICT:|Adjusted fit =|Compatibility:).*?(?:\r?\n|$)/gmi,'')
      .replace(/^\s+|\s+$/g,'');
    var generated=flexPolicyProse(p);
    var replacement=m[1]+m[2]+block+'\n'+generated+'\n'+(body?body+'\n':'');
    return text.slice(0,m.index)+replacement+text.slice(m.index+m[0].length);
  }
  var api={outline:outline,flexPolicy:flexPolicy,setFlexPolicy:setFlexPolicy,flexPolicyProse:flexPolicyProse,declineReasonCodes:declineReasonCodes,FLEX_DEFAULTS:FLEX_DEFAULTS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineRules=api;
})(typeof window!=='undefined'?window:globalThis);
