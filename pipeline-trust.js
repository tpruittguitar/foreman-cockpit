/* Evidence labels and readback checks: neither a value nor a receipt implies verification. */
(function(root){'use strict';
var Evidence=typeof module==='object'&&module.exports?require('./pipeline-evidence'):root.PipelineEvidence;
function missing(v){return !v||/^(UNKNOWN|NOT_STATED|NOT STATED|TBD|—|-)$/i.test(String(v).trim())}
// Tim's ruling, 2026-10-05: salary posted in a job description is verified, whoever hosted the posting (employer, recruiter
// or aggregator copy). A posted value is recognised from the posted fields, or from an explicit EMPLOYER_POSTED basis / POSTED label (even when the figure sits in an estimate field).
// Fail closed: conflicting evidence (a posted value on a row also marked as an estimate, or a 'posted' field whose own
// text says estimate / not posted / claimed, e.g. 'Ladders estimate') or recorded doubt in SALARY_CONF
// shows POSTED · UNVERIFIED unless SALARY_CONF is explicitly VERIFIED, and an estimate with no posted value stays ESTIMATED.
function salary(p){
  p=p||{};var ev=Evidence&&Evidence.salary?Evidence.salary(p):{mid:null,source:''};if(ev.mid==null)return 'UNKNOWN';
  var basis=String(p.SALARY_BASIS||''),label=String(p.SALARY_LABEL||'').trim(),estimateMarked=/ESTIMAT|COMPARABLE/i.test(basis)||/ESTIMAT/i.test(label)||/ESTIMAT|NOT[ _]?POSTED|CLAIMED/i.test([p.SALARY_BASE_POSTED,p.PAY_POSTED,p.SALARY_POSTED].join(' ')),doubt=/UNVERIFIED|LOW|DISPUT|CONFLICT/i.test(p.SALARY_CONF||'');
  var postedValue=!missing(p.SALARY_BASE_POSTED)||!missing(p.PAY_POSTED)||ev.source==='SALARY_POSTED'||(ev.source==='GROK_SALARY'&&/\bPOSTED\b/i.test(p.GROK_SALARY)&&!/NOT POSTED|ESTIMAT/i.test(p.GROK_SALARY));
  var postedMarker=/^EMPLOYER_POSTED/i.test(basis)||/^POSTED$/i.test(label);
  if(postedValue)return /^VERIFIED$/i.test(p.SALARY_CONF||'')||!(estimateMarked||doubt)?'VERIFIED':'POSTED · UNVERIFIED';
  if(postedMarker&&!estimateMarked)return doubt?'POSTED · UNVERIFIED':'VERIFIED';
  return 'ESTIMATED'+(p.SALARY_CONF?' · '+String(p.SALARY_CONF).replace(/VERIFIED/gi,'CONFIDENCE UNCONFIRMED'):'');
}
// The figures to show for a row's base pay: a compact range such as "$189k–$284k" (or a single figure / midpoint),
// taken from whichever field the salary evidence uses. approx marks anything that is not VERIFIED; label keeps the
// full trust label for a tooltip.
function salaryRange(p){
  p=p||{};var ev=Evidence&&Evidence.salary?Evidence.salary(p):{mid:null,source:''},label=salary(p);
  if(ev.mid==null)return {text:'',approx:false,label:label,source:''};
  var num=Evidence.moneyNumbers,k=function(n){return '$'+Math.round(n/1000)+'k'},lo=num(p.SALARY_BASE_LOW)[0],hi=num(p.SALARY_BASE_HIGH)[0],nums;
  if(ev.source==='SALARY_MIDPOINT'||ev.source==='SALARY_BASE_LOW/HIGH')nums=lo!=null&&hi!=null?[lo,hi]:[];
  else nums=num(p[ev.source]);
  nums=nums.filter(function(n){return n>=1000});
  var text=ev.mid<1000?String(p[ev.source]||'').slice(0,24):nums.length>=2&&nums[1]>nums[0]?k(nums[0])+'–'+k(nums[1]):nums.length?k(nums[0]):k(ev.mid)+' mid';
  return {text:text,approx:label!=='VERIFIED',label:label,source:ev.source};
}

// Tim's ruling, 2026-10-05: FLEX known from the job description is verified. That is a FLEX class plus degree / FLEX
// evidence recorded from the posting (DEGREE_TEXT, DEGREE_REQ, a degree quote, or a FLEX_BASIS). Fail closed: an
// estimated basis stays ESTIMATED; recorded doubt in FLEX_CONF, no posting evidence, or evidence that says the wording
// was not retrieved / not found / inferred stays unverified.
var FLEX_CLASSES=/^(HIGH_FLEX|SOFT_FLEX|NO_FLEX|STRICT)$/;
function flexClass(p){
  p=p||{};var cls=String(p.FLEX_CLASS||'').trim().toUpperCase();if(FLEX_CLASSES.test(cls))return cls;
  var f=String(p.FLEX||'').trim().toUpperCase();
  if(FLEX_CLASSES.test(f))return f;if(/^YES\b/.test(f))return 'HIGH_FLEX';if(/^SOFT\b/.test(f))return 'SOFT_FLEX';if(/^NO\b/.test(f))return 'NO_FLEX';
  return '';
}
function flex(p){
  p=p||{};var cls=flexClass(p),known=function(v){return v!=null&&!/^(|UNKNOWN|TBD|—|-)$/i.test(String(v).trim())};
  if(/ESTIMAT/i.test(p.FLEX_BASIS||''))return 'ESTIMATED';
  if(/^(VERIFIED|HIGH)$/i.test(p.FLEX_CONF||'')&&p.FLEX_BASIS)return 'VERIFIED';
  var evidence=[p.DEGREE_TEXT,p.DEGREE_REQ,p.DEGREE_EVIDENCE_QUOTE,p.DEGREE_EVIDENCE,p.GROK_DEGREE_TEXT,p.FLEX_BASIS],
    notFromPosting=/NOT RETRIEVED|NOT RECOVERED|NOT FOUND|NOT LOCATED|NOT AVAILABLE|NOT CONFIRMED|NOT READ\b|UNAVAILABLE|COULD NOT|UNKNOWN PRESERVED|\bLEANS\b|NO (FIRST-PARTY |EMPLOYER |)POSTING|INFERRED|ASSUMED|ESTIMAT/i,
    fromPosting=evidence.some(known)&&!evidence.some(function(v){return v&&notFromPosting.test(String(v))});
  if(cls&&fromPosting&&!/LOW|UNVERIFIED|DISPUT|CONFLICT/i.test(p.FLEX_CONF||''))return 'VERIFIED';
  if(FLEX_CLASSES.test(String(p.FLEX_CLASS||'').trim().toUpperCase()))return 'CLASSIFIED · UNVERIFIED';
  if(missing(p.FLEX)&&missing(p.FLEX_HINT))return 'UNKNOWN';
  if(missing(p.FLEX)&&!missing(p.FLEX_HINT))return 'HINT · UNVERIFIED';
  return 'UNVERIFIED';
}
// What to show in a FLEX cell: the class (or the raw FLEX / hint text), approx when not VERIFIED, and the trust label.
function flexInfo(p){p=p||{};var label=flex(p),cls=flexClass(p),text=cls||(!missing(p.FLEX)?String(p.FLEX).slice(0,24):!missing(p.FLEX_HINT)?String(p.FLEX_HINT).slice(0,24):'');return {text:text,approx:label!=='VERIFIED',label:label}}
function matches(r,ru){if(!r||!ru)return false;var k=ru.kind,p=r.payload||{};if(k==='NOTE')return !!ru.note&&String(p.TIM_NOTE||'').includes(ru.note);var buckets={APPLIED:'APPLIED',REJECTED_BY_EMPLOYER:'REJECTED_BY_EMPLOYER',DECLINE:'DECLINED_BY_TIM',MANUAL_RESEARCH:'MANUAL_RESEARCH',CLOSED_DEAD:'CLOSED_DEAD',INVALID_DISCOVERY:'INVALID_DISCOVERY',DUPLICATE:'DUPLICATE',APPLY_NOW:'READY_TO_PURSUE'};if(!buckets[k]||r.BUCKET!==buckets[k])return false;if(ru.code&&p.DECLINE_REASON_CODE!==ru.code)return false;if(k==='DUPLICATE'&&ru.dupOf&&p.DUP_OF!==ru.dupOf)return false;if(ru.note&&!String(p.TIM_NOTE||'').includes(ru.note))return false;if(k==='REJECTED_BY_EMPLOYER'&&ru.eventDate&&p.REJECTION_DATE!==ru.eventDate)return false;return true}
var api={salary:salary,salaryRange:salaryRange,flex:flex,flexClass:flexClass,flexInfo:flexInfo,matches:matches,missing:missing};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineTrust=api;
})(typeof window!=='undefined'?window:globalThis);
