/* Refresh of the policy-derived values the master already stores: FLEX_MODIFIER, ADJUSTED_FIT, PURSUIT_STATUS.
 * The Writer derives them from the canonical FLEX policy only when it writes FLEX or fit evidence for a row, so after a policy
 * change the stored copies drift (the Explorer recalculates for display, but agents read the master). This module only PLANS: it
 * finds rows whose stored values differ from what the current policy gives, mirrors the Writer's own derivation (same
 * pipeline-policy code), and builds the requests that make the Writer re-derive them. It never writes anything itself.
 * Calculated ratings (OVERALL_RATING and the component scores) are not stored in the master and are out of scope here. */
(function(root){'use strict';
var Policy=typeof module==='object'&&module.exports?require('./pipeline-policy'):root.PipelinePolicy;
var ACTIVE_BUCKETS=['READY_TO_PURSUE','SCOUT_INTAKE','DISCOVERY_LEAD','MANUAL_RESEARCH','TIM_DECISION_REQUIRED','BLOCKED'];
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
    var inScope=buckets.indexOf(r.BUCKET)>=0,cls=str(p.FLEX_CLASS);
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
  return stale.map(function(s){return {action:'ruling',ruling:{primaryId:s.primaryId,kind:'ENRICH',fields:{FLEX_CLASS:s.flexClass},actor:'EXPLORER',
    note:note||'Refresh policy-derived FLEX values to the current canonical policy (Pipeline Explorer, Tim-approved)',requestId:'PX-REFRESH-'+policyIdValue+'-'+s.primaryId}}});
}
function chunk(list,size){size=size||CHUNK;var out=[];for(var i=0;i<list.length;i+=size)out.push(list.slice(i,i+size));return out}

var api={ACTIVE_BUCKETS:ACTIVE_BUCKETS,CHUNK:CHUNK,derive:derive,plan:plan,requests:requests,chunk:chunk,policyId:policyId,same:same};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineDerivedRefresh=api;
})(typeof window!=='undefined'?window:globalThis);
