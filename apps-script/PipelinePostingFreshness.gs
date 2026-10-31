(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelinePostingFreshness=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';var DAY=86400000,ACTIVE=['SCOUT_INTAKE','DISCOVERY_LEAD','MANUAL_RESEARCH','BLOCKED','READY_TO_PURSUE','TIM_DECISION_REQUIRED'];
 function stamp(v){v=String(v||'').trim();if(!/^\d{4}-\d{2}-\d{2}(?:$|[T ])/ .test(v))return 0;var s=v.slice(0,10),t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:0;}
 function latest(p,keys,now){return keys.reduce(function(n,k){var t=stamp(p[k]);return t&&t<=now?Math.max(n,t):n;},0);}
 function assess(row,now){now=typeof now==='number'?now:Date.parse(now||new Date().toISOString());var p=row.p||row.payload||{},bucket=row.BUCKET;
  if(ACTIVE.indexOf(bucket)<0||/^YES/i.test(p.ANTI_RESURRECTION||'')||p.DO_NOT_REWORK)return {state:'PROTECTED',due:false};
  if(/^CLOSED/.test(p.LIVENESS||'')||/^CLOSED/.test(p.ATS_CHECK_RESULT||''))return {state:'CLOSED',due:false};
  var posted=latest(p,['POSTING_DATE','POSTED_DATE'],now),dates=['DISCOVERED_AT_ET','DATE_ADDED','MASTER_LOADED_AT'].map(function(k){return stamp(p[k]);}).filter(function(t){return t&&t<=now;}),discovered=dates.length?Math.min.apply(null,dates):0,base=posted||discovered;
  if(!base)return {state:'UNDATED',due:false,reason:'Posting and discovery date unavailable'};
  var confirmed=0;if(/^LIVE(?:_|$)/.test(p.LIVENESS||''))confirmed=latest(p,['LIVENESS_ASOF'],now);if(p.ATS_CHECK_RESULT==='LIVE')confirmed=Math.max(confirmed,latest(p,['ATS_CHECK_ASOF'],now));
  var next=Math.max(base+7*DAY,confirmed?confirmed+7*DAY:0),attempt=latest(p,['LIVENESS_ATTEMPT_ASOF','ATS_CHECK_ASOF'],now);if(attempt>confirmed)next=Math.max(next,attempt+DAY);
  return {state:now>next?'DUE':'CURRENT',due:now>next,basis:posted?'POSTING_DATE':'FIRST_DISCOVERY',basisDate:new Date(base).toISOString().slice(0,10),nextCheckAt:new Date(next).toISOString(),reason:confirmed?'Reuse saved successful check for seven days':'Initial check only after job age exceeds seven days'};
 }
 return {assess:assess,stamp:stamp};
});
