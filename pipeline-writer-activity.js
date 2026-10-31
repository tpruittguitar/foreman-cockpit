/* Durable master-write activity across all transports. Receipt aliases share a write ID and count once. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineWriterActivity=factory();})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var HOUR=3600000;
  var dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  function day(t){return dayFormatter.format(new Date(t));}
  function source(id){
    if(/^FORGE-ENRICH_ATS-ATSBOT-/.test(id))return 'Pay enrichment (GitHub)';
    if(/^FORGE-SOURCE-/.test(id))return 'Automatic intake (GitHub)';
    if(/^ATSCHK-/.test(id))return 'Automatic posting checks';
    if(/^FORGE-EMAIL-/.test(id))return 'Email intake';
    if(/^FORGE-POSTVAL-/.test(id))return 'Posting validation';
    return 'Other work';
  }
  function empty(){return {writes:0,inserts:0,updates:0,otherChanges:0,jobs:0};}
  function canonical(x){return JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(function(v){return JSON.parse(canonical(v));}):Object.fromEntries(Object.keys(x).sort().map(function(k){return [k,JSON.parse(canonical(x[k]))];})):x);}
  function recoveryStatus(index,report,now){
    var at=Date.parse(report&&report.at||''),valid=report&&report.schema==='forge.receipt-recovery.v1'&&!report.inProgress&&report.writerSubmissions===0&&report.masterMutations===0&&report.canonicalReceiptMutations===0&&report.source&&report.source.repo==='tpruittguitar/forge-writer-state'&&report.source.path==='PIPELINE_RECEIPT_INDEX.json'&&/^[a-f0-9]{40}$/.test(report.source.sha||'')&&Array.isArray(report.cases)&&report.cases.length<=100&&report.cases.every(function(c){return c&&typeof c==='object'&&typeof c.requestId==='string';})&&new Set(report.cases.map(function(c){return c.requestId;})).size===report.cases.length&&Number.isFinite(at)&&at<=now+120000;
    var fresh=valid&&now-at<=2*HOUR,recovered=new Set(),closedRequests=new Set(),cases=[],groups=new Map(),badWrites=new Set();
    Object.values(index.requests).forEach(function(e){if(e&&e.s!=='COMPLETE'&&e.w)badWrites.add(e.w);});
    function proves(c,e){
      var pending=(index.pending||[]).find(function(p){return p.writeId===e.w&&(p.requestIds||[]).includes(c.requestId);}),items=e.items;if(!items&&pending&&c.pendingBinding&&canonical(c.pendingBinding.items)===canonical(pending.items)&&c.pendingBinding.writeId===pending.writeId)items=pending.items;
      if(!e||!Array.isArray(items)||!items.length||!Array.isArray(c.rows)||c.rows.length!==items.length||!c.rows.every(function(r){return r&&typeof r.primaryId==='string';})||!items.every(function(i){return i&&typeof i.pid==='string';})||new Set(c.rows.map(function(r){return r.primaryId;})).size!==c.rows.length)return false;
      return items.every(function(i){var r=c.rows.find(function(r){return r.primaryId===i.pid;}),time=Date.parse(r&&r.readAt||'');if(!r||r.expectedAfter!==i.a||!/^[a-f0-9]{64}$/.test(r.sha256||'')||!Number.isFinite(time)||time<=Date.parse(e.at)||time>at+120000)return false;
        if(r.status==='EXACT_AFTER_IMAGE')return r.observedHash===i.a;
        if(r.status!=='LATER_VERIFIED_HASH_CHAIN'||!Array.isArray(r.chain)||!r.chain.length||r.chain.length>32)return false;
        var history=c.historicalResolution===true&&c.source&&c.source.repo==='tpruittguitar/forge-writer-state'&&/^[a-f0-9]{40}$/.test(c.source.sha||'')&&/^verify\/recovery\/resolutions\/[a-f0-9]{64}\.json$/.test(c.evidenceFile||'');var hash=i.a,last=Date.parse(e.at),ok=r.chain.every(function(link){var v=index.requests[link.requestId],t=Date.parse(link.at);if(!v||v.s!=='COMPLETE'||v.w!==link.writeId||v.w===e.w||badWrites.has(v.w)||v.at!==link.at||!Number.isFinite(t)||t<last||t>time||link.from!==hash||!(history&&!v.items)&&!(v.items||[]).some(function(j){return j.pid===i.pid&&j.op==='REPLACE'&&j.b===link.from&&j.a===link.to;}))return false;hash=link.to;last=t;return true;});return ok&&hash===r.observedHash;
      });
    }
    if(valid)report.cases.forEach(function(c){var e=index.requests[c.requestId]||null;if(canonical(c.sourceEntry)!==canonical(e))return;
      var proven=c.status==='PROVEN_PERSISTED'&&e&&proves(c,e);
      if(proven&&/^(FALSE_COMPLETE|NOT_PERSISTED|NEEDS_RESOLUTION)$/.test(e.s||''))recovered.add(c.requestId);
      // Closing an obsolete work obligation does not turn its failed write into a success.
      var closed=c.status==='CLOSED_NO_ACTIVE_WORK'&&e&&/^(FALSE_COMPLETE|NOT_PERSISTED|NEEDS_RESOLUTION)$/.test(e.s||'')&&c.closure&&(
        c.closure.kind==='CONFIRMED_NO_MASTER_WRITE'&&e.s==='NOT_PERSISTED'&&c.closure.error==='INTENT_READBACK_FAILED: no master write attempted'||
        c.closure.kind==='CURRENT_OBLIGATION_SATISFIED'&&Array.isArray(c.rows)&&c.rows.length>0&&c.rows.every(function(r){
          if(!r||!/^V2[A-Z]-/.test(r.primaryId||'')||!/^[a-f0-9]{64}$/.test(r.sha256||'')||!(Date.parse(r.readAt)>Date.parse(e.at)))return false;
          if(r.status==='TERMINAL_NO_REWORK')return /^(APPLIED|REJECTED_BY_EMPLOYER|DECLINED_BY_TIM|CLOSED_DEAD|DUPLICATE)$/.test(r.bucket||'');
          if(!/^(CURRENT_INTENT_ALREADY_PRESENT|SUPERSEDED_BY_VERIFIED_REFRESH)$/.test(r.status)||!r.fieldProofs||!Object.keys(r.fieldProofs).length||!Object.values(r.fieldProofs).every(function(v){return v===true;}))return false;
          if(r.status==='SUPERSEDED_BY_VERIFIED_REFRESH'){var peer=index.requests[r.successor&&r.successor.requestId];return peer&&peer.s==='COMPLETE'&&peer.w===r.successor.writeId&&Date.parse(peer.at)>Date.parse(e.at);}
          return true;
        }));
      if(closed){closedRequests.add(c.requestId);return;}
      var status=c.status==='PROVEN_PERSISTED'&&!proven?'ESCALATED':c.status;
      if(!/^(PROVEN_PERSISTED|VERIFIED_RECEIPT_AND_ROWS|ESCALATED|CHECK_FAILED)$/.test(status))return;
      if(status==='PROVEN_PERSISTED'||status==='VERIFIED_RECEIPT_AND_ROWS')return;
      // An envelope without a canonical transaction is a legacy lookup obligation, not a failed write incident.
      if(!e||! /^(FALSE_COMPLETE|NOT_PERSISTED|NEEDS_RESOLUTION|PENDING|PENDING_DELIVERY|VERIFYING)$/.test(e.s||''))return;
      var key=e&&e.w||c.requestId,g=groups.get(key);if(!g){g={writeId:key,receiptCount:0,status:status,reason:String(c.reason||'').slice(0,120),nextAction:String(c.nextAction||'').slice(0,400),evidenceFile:/^verify\/recovery\/(resolutions|escalations)\/[a-f0-9]{64}\.json$/.test(c.evidenceFile||'')?c.evidenceFile:null};groups.set(key,g);}g.receiptCount++;if(/ESCALATED|CHECK_FAILED/.test(status))g.status=status;
      cases.push({requestId:c.requestId,status:status});
    });
    return {status:fresh?'CURRENT':valid?'STALE':report?'STALE_OR_INVALID':'UNAVAILABLE',at:valid?report.at:null,recovered:recovered,closed:closedRequests,cases:cases,groups:Array.from(groups.values()),deferred:valid?+report.deferred||0:null};
  }
  function aggregate(index,now,recoveryReport){
    now=now==null?Date.now():now;
    if(!index||index.version!==1||!index.requests||typeof index.requests!=='object'||Array.isArray(index.requests)||!Number.isFinite(now))throw Error('Unsupported receipt index');
    var recovery=recoveryStatus(index,recoveryReport,now),problemGroups=new Set(),rawProblems=0;
    var cut=now-24*HOUR,start=Math.floor(cut/HOUR)*HOUR,todayKey=day(now),groups=new Map(),olderConflicts=new Set(),pending=0,problems=0,legacy=0,unplaced=0,missingWriteIds=0;
    Object.keys(index.requests).forEach(function(id){
      var e=index.requests[id];if(!e||typeof e!=='object')return;
      if(/PENDING|VERIFYING/.test(e.s||''))pending++;
      if(/^(FALSE_COMPLETE|NOT_PERSISTED|NEEDS_RESOLUTION)$/.test(e.s||'')){rawProblems++;if(!recovery.recovered.has(id)&&!recovery.closed.has(id)){problems++;problemGroups.add(e.w||id);}}
      if(e.src==='LEGACY_RECEIPTS'){legacy++;return;}
      var t=Date.parse(e.at||'');
      if(!Number.isFinite(t)||t>now){if(e.s==='COMPLETE')unplaced++;return;}
      if(e.s==='COMPLETE'&&!e.w){if(t>=cut||day(t)===todayKey)missingWriteIds++;return;}
      if(!e.w)return;
      if(t<now-26*HOUR){if(e.s!=='COMPLETE')olderConflicts.add(e.w);return;}
      var g=groups.get(e.w);
      if(!g){g={at:t,complete:true,items:new Map(),sources:new Set(),metadata:false};groups.set(e.w,g);}
      g.at=Math.max(g.at,t);g.complete=g.complete&&e.s==='COMPLETE';g.sources.add(source(id));
      if(t>=now-26*HOUR&&Array.isArray(e.items)){g.metadata=true;e.items.forEach(function(i){if(i&&i.pid&&i.op)g.items.set(JSON.stringify([i.pid,i.op,i.b||'',i.a||'']),i);});}
    });
    var buckets=[];for(var t=start;t<=now;t+=HOUR)buckets.push(Object.assign({start:new Date(t).toISOString()},empty()));
    var recent=empty(),today=empty(),sources={},sourceJobs={},bucketJobs={},recentJobs=new Set(),todayJobs=new Set(),metadataGaps=0,conflicted=0;
    function add(sum,g,jobs){sum.writes++;g.items.forEach(function(i){jobs.add(i.pid);if(i.op==='INSERT')sum.inserts++;else if(i.op==='REPLACE')sum.updates++;else sum.otherChanges++;});sum.jobs=jobs.size;}
    groups.forEach(function(g,writeId){
      if(g.at<now-26*HOUR)return;
      if(!g.complete||olderConflicts.has(writeId)){if(g.at>=cut)conflicted++;return;}
      var inRecent=g.at>=cut,inToday=day(g.at)===todayKey;if(!inRecent&&!inToday)return;
      if(!g.metadata)metadataGaps++;
      if(inToday)add(today,g,todayJobs);
      if(!inRecent)return;
      add(recent,g,recentJobs);
      var bi=Math.floor((g.at-start)/HOUR),b=buckets[bi];bucketJobs[bi]=bucketJobs[bi]||new Set();add(b,g,bucketJobs[bi]);
      var ss=Array.from(g.sources).filter(function(s){return s!=='Other work';}),s=ss.length===1?ss[0]:'Other work';
      sources[s]=sources[s]||empty();sourceJobs[s]=sourceJobs[s]||new Set();add(sources[s],g,sourceJobs[s]);
    });
    return {ok:true,now:new Date(now).toISOString(),indexUpdatedAt:index.updatedAt||null,from:new Date(cut).toISOString(),todayDate:todayKey,todayTimezone:'America/New_York',today:today,recent:recent,buckets:buckets,sources:sources,pendingReceipts:pending,problemReceipts:problems,rawProblemReceipts:rawProblems,problemWriteIncidents:problemGroups.size,recoveredReceipts:recovery.recovered.size,closedObligations:recovery.closed.size,recovery:{status:recovery.status,at:recovery.at,groups:recovery.groups,deferred:recovery.deferred},coverage:{metadataGaps:metadataGaps,missingWriteIds:missingWriteIds,unplacedCompleteReceipts:unplaced,legacyReceiptsExcluded:legacy,conflictedWrites:conflicted},basis:'Current COMPLETE master-write receipts, deduplicated by write ID; inserts/updates deduplicated within each write. Recovery evidence never changes throughput or canonical receipt states.'};
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function html(state,charts){
    state=state||{};var d=state.data;
    var head='<section class="writer-activity"><div class="chart-intro ops-flow-intro"><h2>Writer work · all sources</h2><p>Verified master changes from GitHub automation, AI lanes and automatic posting checks. New jobs and updates are counted separately.</p></div>';
    if(!d||!d.ok)return head+'<div class="panel"><p class="tip">'+esc(state.loading?'Reading durable Writer receipts…':'Writer activity unavailable: '+(state.error||'no supported receipt snapshot'))+'</p></div></section>';
    function tile(label,n,sub){return '<article class="dash-card ops-kpi"><h4>'+label+'</h4><b>'+esc(n)+'</b><span class="tip">'+sub+'</span></article>';}
    var h=head+'<div class="dash-grid ops-kpis">'+tile('New job inserts · today',d.today.inserts,'Recorded insert operations · Eastern day')+tile('Job updates · today',d.today.updates,'Recorded update operations · repeat updates count')+tile('Completed writes · today',d.today.writes,'One batch counts as one write')+tile('Jobs touched · today',d.today.jobs,'Distinct job IDs across completed writes')+'</div>';
    var cols=d.buckets.map(function(b,i){return {label:i%3===0||i===d.buckets.length-1?new Date(b.start).toLocaleTimeString('en-US',{hour:'numeric',timeZone:'America/New_York'}):'',value:b.writes,color:'#61cdbb'};});
    var bySource=Object.keys(d.sources).sort().map(function(s){return {label:s,value:d.sources[s].inserts+d.sources[s].updates+d.sources[s].otherChanges};});
    h+='<div class="chart-grid ops-flow-grid"><article class="chart-card ops-chart"><h3>Completed writes · last 24 h</h3>'+charts.columns('Completed master writes per hour, Eastern time',cols)+'<p class="tip">'+esc(d.recent.writes)+' writes · '+esc(d.recent.inserts)+' insert operations · '+esc(d.recent.updates)+' update operations. Counted when durable verification completes.</p></article><article class="chart-card ops-chart"><h3>Recorded row changes · by source</h3>'+charts.bars('Recorded row changes by source',bySource)+'<p class="tip">Insert and update operations, not unique jobs. Repeat updates count; shared batch receipt aliases do not.</p></article></div>';
    h+='<p class="tip">Today: '+esc(d.todayDate)+' America/New_York. Current receipt states: '+esc(d.pendingReceipts)+' pending · '+esc(d.problemReceipts)+' unresolved/problem receipts. Index updated '+esc(d.indexUpdatedAt||'unknown')+'. Queue charts below are a separate view; their counts are not added to these totals.</p>';
    var c=d.coverage||{};
    if(c.metadataGaps||c.missingWriteIds||c.conflictedWrites)h+='<p class="tip warn">Coverage incomplete: '+esc(c.metadataGaps||0)+' writes lack row-change metadata; '+esc(c.missingWriteIds||0)+' recent complete receipts lack a write ID; '+esc(c.conflictedWrites||0)+' writes have conflicting receipt states. Displayed row counts include only recorded changes.</p>';
    h+='<details><summary>Exact Writer activity counts</summary><div class="ops-table"><table><thead><tr><th>Eastern hour</th><th>Completed writes</th><th>Inserts</th><th>Updates</th></tr></thead><tbody>'+d.buckets.map(function(b){return '<tr><td>'+esc(new Date(b.start).toLocaleString('en-US',{timeZone:'America/New_York'}))+'</td><td>'+b.writes+'</td><td>'+b.inserts+'</td><td>'+b.updates+'</td></tr>';}).join('')+'</tbody></table></div></details></section>';
    if(state.error)h+='<p class="tip warn">Refresh failed; showing the previous snapshot: '+esc(state.error)+'</p>';
    return h;
  }
  return {aggregate:aggregate,html:html,source:source};
});

