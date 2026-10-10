/* Incident model for the System drawer and top-level health. A FAILURE EVENT is not an INCIDENT.
 *
 * Failure events come from two places:
 *  - Writer queue runs (writer_status recentRuns / recentHolds / recentFailed): one event per finished run
 *    whose terminal status is not SUCCESS. A later SUCCESS of the same normalized operation is recovery evidence.
 *  - Live conditions (Writer warnings such as TRIGGER_MISSING, master load problems): observed on each
 *    authoritative status read; a later authoritative read that no longer reports the condition is recovery evidence.
 *
 * Events are grouped into one incident while component, normalized failure class and normalized operation match
 * and no verified recovery has happened in between. A retry joins the open incident unless the earlier incident
 * was already resolved or the retry fails with a materially different (normalized) failure class.
 *
 * States: ACTIVE (unresolved; needs corrective action; never ages out), RECOVERED (a later verified result proves
 * the operation completed and no downstream consequence remains), ACKNOWLEDGED_UNRESOLVED (Tim saw it; resolution still required),
 * and HISTORICAL in the view: any resolved incident older than the display window.
 * Health counts ACTIVE and ACKNOWLEDGED_UNRESOLVED incidents: 0 critical + 0 warning = LIVE, 0 critical + >=1 warning = LIVE / WARNING,
 * >=1 critical = DEGRADED. Resolved incidents never degrade health.
 */
(function(root){'use strict';
var WINDOW_MS=24*3600e3,KEEP_RESOLVED_MS=30*24*3600e3,MAX_RESOLVED=150,MAX_EVENT_IDS=60;
var RUN_COMPONENT='writer-queue';

/* Normalized operation: the request file stem with retry suffixes removed. FOO_SCHED_R4, FOO_RETRY and foo_r2 are
 * the same operation as FOO_SCHED / FOO / foo; dates, run numbers and batch numbers (RUN2, B1) still distinguish runs. */
function normalizeOperation(file){
  var s=String(file||'').trim().replace(/^(RESULT__|PROCESSING__|HOLD__)+/,'').replace(/\.[A-Za-z0-9]{1,5}$/,''),prev;
  do{prev=s;s=s.replace(/[_\-. ](R\d+[A-Z]?|RETRY\d*|RERUN\d*|RESUBMIT\d*|CORRECTED|FIXED)$/i,'')}while(s!==prev);
  return s.toUpperCase();
}
/* Normalized failure class: terminal status + result mode + error text with timestamps, ids, positions and counts masked. */
function normalizeText(t){
  return String(t||'').toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}t[\d:.]+z?/g,'<t>')
    .replace(/\([^()]*<t>[^()]*\)/g,'')
    .replace(/\b[0-9a-f]{8,}\b/g,'<id>')
    .replace(/\d+(\.\d+)?/g,'#')
    .replace(/\s+([;,.:])/g,'$1').replace(/\s+/g,' ').trim().slice(0,160);
}
function normalizeFailureClass(status,action,error){
  return [String(status||'FAILED').toUpperCase(),String(action||'').toUpperCase(),normalizeText(error)||'(no error text)'].join(' · ');
}
function isFailureRun(r){var t=String(r&&r.terminalStatus||'');return !!t&&t!=='SUCCESS'}
function isHoldClass(status){return /HOLD/.test(String(status||''))}
function eventId(r){return String(r.fileId||r.file||'')+'|'+String(r.finishedAt||'')}
function ms(iso){var t=Date.parse(iso||'');return isNaN(t)?null:t}
function empty(){return {v:1,incidents:{}}}
function groupKey(component,cls,op){return component+'|'+cls+'|'+op}
function openIncident(store,gk){var list=Object.keys(store.incidents).map(function(k){return store.incidents[k]}).filter(function(i){return (i.status==='ACTIVE'||i.status==='ACKNOWLEDGED_UNRESOLVED')&&i.group===gk});return list[0]||null}
function knownEvent(store,id){return Object.keys(store.incidents).some(function(k){var e=store.incidents[k].eventIds;return e&&e.indexOf(id)>=0})}
function resolve(i,status,at,evidence,resolution){i.status=status;i.resolvedAt=at;i.recoveryEvidence=evidence||'';i.resolution=resolution||'';i.updatedAt=at}

function applyRuns(store,runs,unverifiedCount){
  var seen={},events=(runs||[]).filter(function(r){if(!r||!r.file)return false;var id=eventId(r);if(seen[id])return false;seen[id]=1;return true})
    .map(function(r){return {r:r,id:eventId(r),at:ms(r.finishedAt)}}).filter(function(e){return e.at!=null})
    .sort(function(a,b){return a.at-b.at});
  var changed=false;
  events.forEach(function(e){
    var r=e.r,op=normalizeOperation(r.file),iso=new Date(e.at).toISOString();
    if(!isFailureRun(r)){
      if(r.recovered!==true)return; // A task success alone cannot certify its downstream effects.
      // Verified success of the same operation recovers every open queue incident for it that failed earlier.
      // A HOLD-type failure may have written part of a batch: it recovers only when no master write is left unverified.
      Object.keys(store.incidents).forEach(function(k){var i=store.incidents[k];
        if((i.status!=='ACTIVE'&&i.status!=='ACKNOWLEDGED_UNRESOLVED')||i.kind!=='event'||i.component!==RUN_COMPONENT||i.operation!==op||ms(i.latestAt)>e.at)return;
        if(isHoldClass(i.terminalStatus)&&unverifiedCount!==0)return;
        resolve(i,'RECOVERED',iso,'SUCCESS · '+r.file+' at '+iso,'Recovered by a later successful run of the same operation');changed=true});
      return;
    }
    if(knownEvent(store,e.id))return;
    var cls=normalizeFailureClass(r.terminalStatus,r.action,r.error),gk=groupKey(RUN_COMPONENT,cls,op),i=openIncident(store,gk);
    if(i){i.attempts++;i.latestAt=iso;i.latestError=String(r.error||'');i.latestFile=r.file;i.eventIds.push(e.id);if(i.eventIds.length>MAX_EVENT_IDS)i.eventIds.splice(0,i.eventIds.length-MAX_EVENT_IDS);i.updatedAt=iso}
    else{i={id:gk+'|'+iso,group:gk,kind:'event',component:RUN_COMPONENT,failureClass:cls,operation:op,terminalStatus:String(r.terminalStatus||''),
      severity:'warning',title:String(r.terminalStatus||'FAILED')+' · '+op,attempts:1,firstAt:iso,latestAt:iso,latestError:String(r.error||''),latestFile:r.file,
      eventIds:[e.id],status:'ACTIVE',updatedAt:iso};store.incidents[i.id]=i}
    i.timeline=(i.timeline||[]).concat([{at:iso,eventId:e.id,file:r.file,status:r.terminalStatus,error:String(r.error||''),docAccess:r.docAccess||null}]).slice(-MAX_EVENT_IDS);
    // The Writer's own receipt check: every request in a PARTIAL_HOLD batch is COMPLETE in the durable receipt index.
    if(r.recovered===true)resolve(i,'RECOVERED',iso,'Receipt index: every request in '+r.file+' is COMPLETE','Recovered: all requests completed (verified by the Writer)');
    changed=true;
  });
  return changed;
}

/* source: {name, authoritative, token?, at?, conditions:[{component, code, severity:'critical'|'warning', title, text, operation?}]}.
 * token identifies one status read (re-renders of the same read do not count as new checks); at is when it was read.
 * Only an authoritative read may recover a condition; a non-authoritative one can only add or refresh. */
function applyConditions(store,source,now){
  if(!source)return false;var iso=new Date(source.at!=null&&!isNaN(source.at)?source.at:now).toISOString(),token=source.token!=null?String(source.token):iso,present={},changed=false;
  (source.conditions||[]).forEach(function(c){if(!c||(c.severity!=='critical'&&c.severity!=='warning'))return;
    var comp=c.component||source.name,op=normalizeText(c.operation!=null?c.operation:c.text),cls=String(c.code||'CONDITION').toUpperCase(),gk=groupKey(comp,cls,op);present[gk]=1;
    var i=openIncident(store,gk);
    if(i){if(i.lastToken!==token){i.checks=(i.checks||1)+1;i.lastToken=token}i.latestAt=iso;i.latestError=String(c.text||'');if(i.severity!==c.severity){i.severity=c.severity;changed=true}i.title=c.title||i.title}
    else{store.incidents[gk+'|'+iso]={id:gk+'|'+iso,group:gk,kind:'condition',source:source.name,component:comp,failureClass:cls,operation:op,severity:c.severity,
      title:c.title||cls,attempts:1,checks:1,lastToken:token,firstAt:iso,latestAt:iso,latestError:String(c.text||''),status:'ACTIVE',updatedAt:iso};changed=true}});
  if(source.authoritative)Object.keys(store.incidents).forEach(function(k){var i=store.incidents[k];
    if((i.status!=='ACTIVE'&&i.status!=='ACKNOWLEDGED_UNRESOLVED')||i.kind!=='condition'||i.source!==source.name||present[i.group])return;
    resolve(i,'RECOVERED',iso,(source.evidence||'Status read')+' at '+iso+' no longer reports it','Condition cleared');changed=true});
  return changed;
}

function prune(store,now){
  var resolved=Object.keys(store.incidents).map(function(k){return store.incidents[k]}).filter(function(i){return (i.status!=='ACTIVE'&&i.status!=='ACKNOWLEDGED_UNRESOLVED')})
    .sort(function(a,b){return (ms(b.resolvedAt)||0)-(ms(a.resolvedAt)||0)});
  // Incident History retains verified recoveries; never discard forensic records by age or count.
}

/* obs: {runs:[], unverifiedCount:number|null, writer:source|null, load:source|null}. Returns true when the store changed. */
function observe(store,obs,now){
  now=now==null?Date.now():now;obs=obs||{};if(!store.incidents)store.incidents={};
  Object.keys(store.incidents).forEach(function(k){var i=store.incidents[k];if(i.status==='ACKNOWLEDGED'){i.status='ACKNOWLEDGED_UNRESOLVED';i.acknowledgedAt=i.resolvedAt||i.updatedAt;delete i.resolvedAt;i.resolution='Historical acknowledgement has no verified resolution evidence';}});
  store.healthySince=store.healthySince||{};[obs.writer,obs.load].forEach(function(source){if(!source||!source.authoritative)return;if((source.conditions||[]).length)delete store.healthySince[source.name];else if(!store.healthySince[source.name])store.healthySince[source.name]=source.at||now;});
  var a=applyRuns(store,obs.runs,obs.unverifiedCount),b=applyConditions(store,obs.writer,now),c=applyConditions(store,obs.load,now);
  var before=Object.keys(store.incidents).length;prune(store,now);
  return a||b||c||Object.keys(store.incidents).length!==before;
}

/* Tim acknowledges an unresolved queue incident while retaining its obligation. Live conditions cannot be acknowledged away:
 * they clear only when a status read verifies them gone. */
function acknowledge(store,id,by,now){
  var i=store.incidents[id];if(!i||(i.status!=='ACTIVE'&&i.status!=='ACKNOWLEDGED_UNRESOLVED')||i.kind!=='event')return false;var iso=new Date(now==null?Date.now():now).toISOString();
  i.status='ACKNOWLEDGED_UNRESOLVED';i.acknowledgedAt=iso;i.updatedAt=iso;i.resolution='Acknowledged by '+(by||'TIM')+' · awaiting verified recovery';i.ackBy=by||'TIM';return true;
}

function byLatest(a,b){return (ms(b.latestAt)||0)-(ms(a.latestAt)||0)}
function sevRank(i){return i.severity==='critical'?0:1}
function view(store,now,windowMs){
  now=now==null?Date.now():now;windowMs=windowMs||WINDOW_MS;var out={active:[],recovered:[],historical:[]};
  Object.keys((store&&store.incidents)||{}).forEach(function(k){var i=store.incidents[k];
    if((i.status==='ACTIVE'||i.status==='ACKNOWLEDGED_UNRESOLVED'))out.active.push(i);else if(now-(ms(i.resolvedAt)||0)<=windowMs)out.recovered.push(i);else out.historical.push(i)});
  out.active.sort(function(a,b){return sevRank(a)-sevRank(b)||byLatest(a,b)});
  out.recovered.sort(function(a,b){return (ms(b.resolvedAt)||0)-(ms(a.resolvedAt)||0)});out.historical.sort(function(a,b){return (ms(b.resolvedAt)||0)-(ms(a.resolvedAt)||0)});
  return out;
}
/* Derive the unfinished-work register from the EXISTING incident ledger, not a
 * second independently mutable task database. A failed attempt is an open
 * obligation to reconcile its original intent even when Writer is now healthy.
 * Count unique normalized operations, while retaining every failure class/attempt.
 * The observed error determines the NEXT CHECK, not proof that a job was lost.
 */
function workQueue(store){
  var groups={};
  Object.keys((store&&store.incidents)||{}).forEach(function(k){
    var i=store.incidents[k];
    if(i.kind!=='event'||(i.status!=='ACTIVE'&&i.status!=='ACKNOWLEDGED_UNRESOLVED'))return;
    var op=String(i.operation||normalizeOperation(i.latestFile||'')||i.id);
    var g=groups[op]||(groups[op]={operation:op,incidents:[],attempts:0,latestAt:'',latestError:'',latestFile:'',status:'VERIFY_OUTCOME'});
    g.incidents.push(i.id);g.attempts+=i.attempts||1;
    if(!g.latestAt||ms(i.latestAt)>ms(g.latestAt)){g.latestAt=i.latestAt;g.latestFile=i.latestFile||'';g.latestError=i.latestError||'';}
    var detail=String(i.latestError||'').toLowerCase(),terminal=String(i.terminalStatus||'').toUpperCase();
    if(/invalid json|json parse|no json object|rejected_schema|source_url_required|missing required|schema error|must be valid json/.test(detail)||terminal==='REJECTED_SCHEMA'){
      g.status='REPAIR_OR_RECONCILE';
    }else if(/partial|hold/.test(detail)||/HOLD/.test(terminal)){
      if(g.status!=='REPAIR_OR_RECONCILE')g.status='CHECK_PARTIAL_COMPLETION';
    }
  });
  return Object.keys(groups).map(function(k){
    var g=groups[k];g.incidentCount=g.incidents.length;
    g.nextStep=g.status==='REPAIR_OR_RECONCILE'
      ?'Check the rejected original payload and source candidates; correct the cause, dedupe and submit only work proven missing.'
      :g.status==='CHECK_PARTIAL_COMPLETION'
      ?'Reconcile each original subrequest against RESULT, receipt index and exact master outcome; retain any unfinished part.'
      :'Check original intent, retries, Writer RESULT, COMPLETE receipt and exact master outcome before considering a safe retry.';
    return g;
  }).sort(function(a,b){return (ms(b.latestAt)||0)-(ms(a.latestAt)||0)});
}
function recurrence(store,now,config){
  now=now==null?Date.now():now;config=Object.assign({windowMs:3600000,episodes:3,clearMs:900000,experimental:true},config||{});
  var groups={};Object.keys((store&&store.incidents)||{}).forEach(function(k){var i=store.incidents[k],at=ms(i.latestAt);if(at==null||now-at>config.windowMs)return;(groups[i.group]=groups[i.group]||[]).push(i);});
  return Object.keys(groups).filter(function(k){var list=groups[k],last=Math.max.apply(null,list.map(function(i){return ms(i.latestAt);})),healthy=(store.healthySince||{})[list[0].source];return list.length>=config.episodes&&!(healthy&&now-healthy>=config.clearMs&&healthy>last);}).map(function(k){return {group:k,episodes:groups[k].length,experimental:config.experimental};});
}
/* Health is current operability, not the number of historical failed attempts.
 * A queue failure with no independent completion proof remains VERIFICATION_REQUIRED
 * in the existing incident ledger and history, but does not prove an active fault.
 * No incident is deleted, acknowledged, or declared recovered by this classification. */
function triage(store) {
  var out={critical:0,warning:0,verification:0,recoveryRequired:0};
  Object.keys((store&&store.incidents)||{}).forEach(function(k){
    var i=store.incidents[k],unresolved=i.status==='ACTIVE'||i.status==='ACKNOWLEDGED_UNRESOLVED';
    if(!unresolved)return;
    if(i.kind==='event'){
      if(i.recoveryRequired===true && i.recoveryEvidence)out.recoveryRequired++;
      else out.verification++;
    }else if(i.severity==='critical')out.critical++;
    else out.warning++;
  });
  return out;
}
function health(store,now,config){
  var t=triage(store),recurring=recurrence(store,now,config);
  return {state:t.critical||recurring.length?'DEGRADED':t.warning?'LIVE / WARNING':'LIVE',
    critical:t.critical,warning:t.warning,verification:t.verification,recoveryRequired:t.recoveryRequired,recurring:recurring};
}

/* Shared state across devices: only queue incidents are synced (their ids derive from event times, so every device
 * computes the same id). Live conditions are recomputed from the current status on each device. */
function forSync(store){var out={v:1,incidents:{}};Object.keys((store&&store.incidents)||{}).forEach(function(k){var i=store.incidents[k];if(i.kind==='event')out.incidents[k]=i});return out}
function merge(local,remote){
  var out={v:1,incidents:{},healthySince:Object.assign({},local&&local.healthySince||{})},changed=false;Object.keys((local&&local.incidents)||{}).forEach(function(k){out.incidents[k]=local.incidents[k]});
  Object.keys((remote&&remote.incidents)||{}).forEach(function(k){var r=remote.incidents[k],l=out.incidents[k];if(!r||r.kind!=='event')return;
    if(!l){out.incidents[k]=r;changed=true;return}
    var pick=l;if(l.status==='ACTIVE'&&r.status!=='ACTIVE')pick=r;else if(l.status===r.status&&(r.attempts||0)>(l.attempts||0))pick=r;
    if(pick!==l){var ids=(l.eventIds||[]).concat(r.eventIds||[]).filter(function(x,n,a){return a.indexOf(x)===n}).slice(-MAX_EVENT_IDS);
      out.incidents[k]=Object.assign({},pick,{eventIds:ids,attempts:Math.max(l.attempts||0,r.attempts||0)});changed=true}});
  return {store:out,changed:changed};
}

var api={WINDOW_MS:WINDOW_MS,normalizeOperation:normalizeOperation,normalizeFailureClass:normalizeFailureClass,normalizeText:normalizeText,
  empty:empty,recurrence:recurrence,triage:triage,workQueue:workQueue,observe:observe,acknowledge:acknowledge,view:view,health:health,forSync:forSync,merge:merge};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PipelineIncidents=api;
})(typeof window!=='undefined'?window:globalThis);
