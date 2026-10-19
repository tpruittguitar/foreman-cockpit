/* Refresh of the policy-derived values the master already stores: FLEX_MODIFIER, ADJUSTED_FIT, PURSUIT_STATUS.
 * The Writer derives them from the canonical FLEX policy only when it writes FLEX or fit evidence for a row, so after a policy
 * change the stored copies drift (the Explorer recalculates for display, but agents read the master). This module only PLANS: it
 * finds rows whose stored values differ from what the current policy gives, mirrors the Writer's own derivation (same
 * pipeline-policy code), and builds the requests that make the Writer re-derive them. It never writes anything itself.
 * Calculated ratings (OVERALL_RATING and the component scores) are not stored in the master and are out of scope here. */
(function(root){'use strict';
var Policy=typeof module==='object'&&module.exports?require('./pipeline-policy'):root.PipelinePolicy;
var Scoring=typeof module==='object'&&module.exports?require('./pipeline-scoring'):root.PipelineScoring;
var Evidence=typeof module==='object'&&module.exports?require('./pipeline-evidence'):root.PipelineEvidence;
/* PAY WORTH backfill (Tim 2026-10-19 02:31 ET, REV-039): live jobs with a salary figure whose stored PAY_WORTH, Writer-derived
 * FLOOR_STATUS or PURSUIT_STATUS differ from the current scoring, or whose one-site US city has not been looked up yet, are sent
 * through the same receipt-verified ENRICH batches. The ENRICH repeats a value the row already holds (FLEX_CLASS, else the salary
 * key the pay comes from), so nothing changes but the Writer's re-derivation (deriveWriterScores_: city lookup, PAY_WORTH,
 * FLOOR_STATUS, PURSUIT_STATUS). Mirrors the Writer: it scores the payload without the Writer-owned score keys. */
var LIVE_PAY_BUCKETS=['READY_TO_PURSUE','SCOUT_INTAKE','DISCOVERY_LEAD','MANUAL_RESEARCH','TIM_DECISION_REQUIRED','BLOCKED'];
var WRITER_OWNED=['OVERALL','GEO','NET_COMP','OVERALL_RATING','EXPERIENCE_FIT','GEO_SCORE','NET_COMP_SCORE','RATING_CONFIDENCE','FLEX_RATING_IMPACT','PAY_WORTH','PAY_WORTH_BASIS','FLEX_MODIFIER','ADJUSTED_FIT','PURSUIT_STATUS'];
var ACTIVE_BUCKETS=['READY_TO_PURSUE','SCOUT_INTAKE','DISCOVERY_LEAD','MANUAL_RESEARCH','TIM_DECISION_REQUIRED','BLOCKED','APPLIED','DECLINED_BY_TIM'];
var CHUNK=25;
function str(v){return v==null?'':String(v).trim()}
function same(a,b){a=str(a);b=str(b);if(a===''||b==='')return a===b;var x=Number(a),y=Number(b);return isFinite(x)&&isFinite(y)?x===y:a===b}
/* Mirrors Writer applyFields_: the raw fit is SCOPE_FIT_RAW, else RAW_FIT; adjusted fit and decision follow assess(). */
function derive(p,policy){
  var f=Policy.flex(p,policy),rawVal=p.SCOPE_FIT_RAW||p.RAW_FIT,out={cls:f.class,modifier:String(f.modifier),adjusted:null,decision:null};
  if(rawVal!==undefined){var raw=Number(rawVal);if(isFinite(raw)){var a=Policy.assess(p,raw,policy);out.adjusted=String(a.adjustedFit);out.decision=a.decision}}
  return out;
}
function hash6(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return ('000000'+(h>>>0).toString(16)).slice(-6)}
function policyId(policy){var p=policy||{};return hash6(JSON.stringify([p.HIGH_FLEX_MODIFIER,p.SOFT_FLEX_MODIFIER,p.NO_FLEX_MODIFIER,p.STRICT_MODIFIER,p.NOT_STATED_CLASS,p.EQUIVALENCY_CLASS,p.HARD_DEGREE_CLASS,p.SINGLE_PATH_CLASS,p.FRESH_DEGREE_OVERRIDES_STALE_CLASS]))}

/* rows: parsed rows ({id, PRIMARY_ID, BUCKET, COMPANY, TITLE, payload}). policyRaw: the canonical FLEX policy object. */
function plan(rows,policyRaw,opts){
  opts=opts||{};var buckets=opts.buckets||ACTIVE_BUCKETS,policy=Policy.normalizeFlexPolicy(policyRaw||{});
  var out={policyId:policyId(policy),policy:{HIGH_FLEX:policy.HIGH_FLEX_MODIFIER,SOFT_FLEX:policy.SOFT_FLEX_MODIFIER,NO_FLEX:policy.NO_FLEX_MODIFIER,STRICT:policy.STRICT_MODIFIER},
    scanned:0,inScope:0,upToDate:0,noClass:0,classConflict:[],stale:[],outOfScopeStale:0,byClass:{}};
  (rows||[]).forEach(function(r){var p=r.payload||{};if(!str(p.FLEX_CLASS)&&!str(p.FLEX_MODIFIER)&&!str(p.ADJUSTED_FIT))return;out.scanned++;
    var inScope=buckets.indexOf(r.BUCKET)>=0&&!str(p.ARCHIVE_STATE),cls=str(p.FLEX_CLASS);
    if(!cls){if(inScope){out.inScope++;out.noClass++}return}
    var d=derive(p,policy);
    if(d.cls!==cls){if(inScope){out.inScope++;out.classConflict.push({id:r.id,primaryId:r.PRIMARY_ID,company:r.COMPANY,title:r.TITLE,stored:cls,derived:d.cls})}return}
    var changes=[],drift=false;
    function check(field,before,after){if(after==null)return;if(!same(before,after)){changes.push({field:field,before:str(before),after:after});if(str(before)!=='')drift=true}}
    check('FLEX_MODIFIER',p.FLEX_MODIFIER,d.modifier);check('ADJUSTED_FIT',p.ADJUSTED_FIT,d.adjusted);check('PURSUIT_STATUS',p.PURSUIT_STATUS,d.decision);
    if(!inScope){if(drift)out.outOfScopeStale++;return}
    out.inScope++;
    if(!drift){out.upToDate++;return}
    out.byClass[cls]=(out.byClass[cls]||0)+1;
    out.stale.push({id:r.id,primaryId:r.PRIMARY_ID,company:r.COMPANY,title:r.TITLE,bucket:r.BUCKET,flexClass:cls,changes:changes});
  });
  return out;
}

/* The Writer re-derives the pair whenever FLEX evidence is part of an ENRICH, so repeating the stored class is enough; the class itself
 * is never changed (a conflicting class is reported for review, not touched). Request ids are stable per policy and row, so a rerun after
 * a partial failure cannot write a row twice. */
function requests(stale,policyIdValue,note){
  return stale.map(function(s){var pay=s.kind==='PAY';return {action:'ruling',ruling:{primaryId:s.primaryId,kind:'ENRICH',fields:s.fields||{FLEX_CLASS:s.flexClass},actor:'EXPLORER',
    note:pay?'Refresh PAY_WORTH, pay status and city location to the current scoring (Pipeline Explorer, Tim-approved REV-039)':note||'Refresh policy-derived FLEX values to the current canonical policy (Pipeline Explorer, Tim-approved)',
    requestId:(pay?'PX-PAYWORTH-'+(s.payId||policyIdValue):'PX-REFRESH-'+policyIdValue)+'-'+s.primaryId}}});
}
function payId(scoring,policy){var c=Scoring.normalize(scoring||{});return hash6(JSON.stringify([Scoring.payWorthCfg(c),c.geo&&c.geo.controlPoints,policyId(policy)]))}
function needsLookup(r){var p=r.payload||{},loc=str(r.LOCATION||p.LOCATION);return !!loc&&!(str(p.LATITUDE)&&str(p.LONGITUDE))&&!str(p.GEOCODE_STATUS)&&!/\bremote\b|\/|;|\||\s+or\s+/i.test(loc)&&!Scoring.isNonUs(loc)}
/* rows: parsed rows. scoring: the published scoring model. policyRaw: canonical FLEX policy. skip: primary ids already planned. */
function payPlan(rows,scoring,policyRaw,skip){
  var policy=Policy.normalizeFlexPolicy(policyRaw||{}),cfg=Object.assign({},Scoring.normalize(scoring||{}),{flexPolicy:policy}),id=payId(scoring,policy),out={payId:id,scanned:0,upToDate:0,stale:[]};
  (rows||[]).forEach(function(r){var p=r.payload||{};if(LIVE_PAY_BUCKETS.indexOf(r.BUCKET)<0||str(p.ARCHIVE_STATE))return;var ev=Evidence.salary(p);if(ev.mid==null)return;out.scanned++;
    if(skip&&skip[r.PRIMARY_ID])return;
    var input={};Object.keys(p).forEach(function(k){if(WRITER_OWNED.indexOf(k)<0)input[k]=p[k]});
    var sc=Scoring.scoreRow({COMPANY:r.COMPANY,TITLE:r.TITLE,LOCATION:r.LOCATION,payload:input},cfg),pw=sc.payWorth,changes=[];
    function check(field,before,after){if(after==null)return;if(!same(before,after))changes.push({field:field,before:str(before),after:String(after)})}
    if(pw&&pw.score!=null)check('PAY_WORTH',p.PAY_WORTH,pw.score);
    if(sc.floor&&sc.floor.derived&&sc.floor.status)check('FLOOR_STATUS',p.FLOOR_STATUS,sc.floor.status);
    if(Policy.isV4(policy))check('PURSUIT_STATUS',p.PURSUIT_STATUS,sc.assessment.decision);
    if(needsLookup(r))changes.push({field:'LATITUDE / LONGITUDE',before:'',after:'city lookup'});
    if(!changes.length){out.upToDate++;return}
    var key=ev.source==='SALARY_BASE_LOW/HIGH'?'SALARY_BASE_LOW':ev.source,fields=str(p.FLEX_CLASS)?{FLEX_CLASS:str(p.FLEX_CLASS)}:{};if(!fields.FLEX_CLASS)fields[key]=str(p[key]);
    out.stale.push({id:r.id,primaryId:r.PRIMARY_ID,company:r.COMPANY,title:r.TITLE,bucket:r.BUCKET,flexClass:str(p.FLEX_CLASS)||'PAY',kind:'PAY',payId:id,fields:fields,changes:changes});
  });
  return out;
}
/* FLEX plan plus the PAY WORTH backfill in one list; a row stale on both goes once (its FLEX ENRICH re-derives pay as well). */
function fullPlan(rows,policyRaw,scoring,opts){var p=plan(rows,policyRaw,opts);if(!scoring)return p;var skip={};p.stale.forEach(function(s){skip[s.primaryId]=1});
  var pp=payPlan(rows,scoring,policyRaw,skip);p.payId=pp.payId;p.payScanned=pp.scanned;p.payUpToDate=pp.upToDate;p.payStale=pp.stale.length;p.flexStale=p.stale.length;p.stale=p.stale.concat(pp.stale);return p}
function chunk(list,size){size=size||CHUNK;var out=[];for(var i=0;i<list.length;i+=size)out.push(list.slice(i,i+size));return out}

var api={ACTIVE_BUCKETS:ACTIVE_BUCKETS,LIVE_PAY_BUCKETS:LIVE_PAY_BUCKETS,CHUNK:CHUNK,derive:derive,plan:plan,payPlan:payPlan,fullPlan:fullPlan,payId:payId,needsLookup:needsLookup,requests:requests,chunk:chunk,policyId:policyId,same:same};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineDerivedRefresh=api;
})(typeof window!=='undefined'?window:globalThis);
