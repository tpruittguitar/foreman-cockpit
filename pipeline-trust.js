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
function flex(p){
  p=p||{};var cls=String(p.FLEX_CLASS||'').toUpperCase(),classified=/^(HIGH_FLEX|SOFT_FLEX|NO_FLEX|STRICT)$/.test(cls);
  if(/ESTIMAT/i.test(p.FLEX_BASIS||''))return 'ESTIMATED';
  if(/^(VERIFIED|HIGH)$/i.test(p.FLEX_CONF||'')&&p.FLEX_BASIS)return 'VERIFIED';
  if(classified)return 'CLASSIFIED · UNVERIFIED';
  if(missing(p.FLEX)&&missing(p.FLEX_HINT))return 'UNKNOWN';
  if(missing(p.FLEX)&&!missing(p.FLEX_HINT))return 'HINT · UNVERIFIED';
  return 'UNVERIFIED';
}
function matches(r,ru){if(!r||!ru)return false;var k=ru.kind,p=r.payload||{};if(k==='NOTE')return !!ru.note&&String(p.TIM_NOTE||'').includes(ru.note);var buckets={APPLIED:'APPLIED',REJECTED_BY_EMPLOYER:'REJECTED_BY_EMPLOYER',DECLINE:'DECLINED_BY_TIM',MANUAL_RESEARCH:'MANUAL_RESEARCH',CLOSED_DEAD:'CLOSED_DEAD',INVALID_DISCOVERY:'INVALID_DISCOVERY',DUPLICATE:'DUPLICATE',APPLY_NOW:'READY_TO_PURSUE'};if(!buckets[k]||r.BUCKET!==buckets[k])return false;if(ru.code&&p.DECLINE_REASON_CODE!==ru.code)return false;if(k==='DUPLICATE'&&ru.dupOf&&p.DUP_OF!==ru.dupOf)return false;if(ru.note&&!String(p.TIM_NOTE||'').includes(ru.note))return false;if(k==='REJECTED_BY_EMPLOYER'&&ru.eventDate&&p.REJECTION_DATE!==ru.eventDate)return false;return true}
var api={salary:salary,flex:flex,matches:matches,missing:missing};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineTrust=api;
})(typeof window!=='undefined'?window:globalThis);
