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
    return [
      'FLEX_POLICY_PROSE_BEGIN',
      '- Degree not stated => '+p.NOT_STATED_CLASS+'.',
      '- Equivalent experience => '+p.EQUIVALENCY_CLASS+'.',
      '- Hard degree requirement without equivalency => '+p.HARD_DEGREE_CLASS+'.',
      '- Confirmed single required degree path => '+p.SINGLE_PATH_CLASS+'.',
      '- FLEX modifiers: HIGH_FLEX '+signed(p.HIGH_FLEX_MODIFIER)+', SOFT_FLEX '+signed(p.SOFT_FLEX_MODIFIER)+', NO_FLEX '+signed(p.NO_FLEX_MODIFIER)+', STRICT '+signed(p.STRICT_MODIFIER)+'.',
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
    return out;
  }
  function setFlexPolicy(text,policy){
    text=String(text||'');var p=flexPolicy(text),src=policy||{};
    Object.keys(FLEX_DEFAULTS).forEach(function(k){if(src[k]!==undefined)p[k]=src[k]});
    var block=[
      'FLEX_POLICY_VERSION=1',
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
    if(!m)return text.replace(/\s*$/,'\n\n')+'SECTION=DEGREE_FLEX\n'+block+'\n';
    var body=m[3]
      .replace(/^\s*(?:FLEX_POLICY_VERSION|HIGH_FLEX_MODIFIER|SOFT_FLEX_MODIFIER|NO_FLEX_MODIFIER|STRICT_MODIFIER|NOT_STATED_CLASS|EQUIVALENCY_CLASS|HARD_DEGREE_CLASS|SINGLE_PATH_CLASS|FRESH_DEGREE_OVERRIDES_STALE_CLASS)\s*=.*(?:\r?\n|$)/gm,'')
      .replace(/(?:^|\n)FLEX_POLICY_PROSE_BEGIN[\s\S]*?FLEX_POLICY_PROSE_END\s*(?=\n|$)/g,'\n')
      .replace(/^\s*-\s*(?:HIGH_FLEX:|SOFT_FLEX:|NO_FLEX:|STRICT:|Adjusted fit =|Compatibility:).*?(?:\r?\n|$)/gmi,'')
      .replace(/^\s+|\s+$/g,'');
    var generated=flexPolicyProse(p);
    var replacement=m[1]+m[2]+block+'\n'+generated+'\n'+(body?body+'\n':'');
    return text.slice(0,m.index)+replacement+text.slice(m.index+m[0].length);
  }
  var api={outline:outline,flexPolicy:flexPolicy,setFlexPolicy:setFlexPolicy,flexPolicyProse:flexPolicyProse,FLEX_DEFAULTS:FLEX_DEFAULTS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineRules=api;
})(typeof window!=='undefined'?window:globalThis);
