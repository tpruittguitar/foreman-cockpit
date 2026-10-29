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
  function aggregate(index,now){
    now=now==null?Date.now():now;
    if(!index||index.version!==1||!index.requests||typeof index.requests!=='object'||Array.isArray(index.requests)||!Number.isFinite(now))throw Error('Unsupported receipt index');
    var cut=now-24*HOUR,start=Math.floor(cut/HOUR)*HOUR,todayKey=day(now),groups=new Map(),olderConflicts=new Set(),pending=0,problems=0,legacy=0,unplaced=0,missingWriteIds=0;
    Object.keys(index.requests).forEach(function(id){
      var e=index.requests[id];if(!e||typeof e!=='object')return;
      if(/PENDING|VERIFYING/.test(e.s||''))pending++;
      if(/^(FALSE_COMPLETE|NOT_PERSISTED|NEEDS_RESOLUTION)$/.test(e.s||''))problems++;
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
    return {ok:true,now:new Date(now).toISOString(),indexUpdatedAt:index.updatedAt||null,from:new Date(cut).toISOString(),todayDate:todayKey,todayTimezone:'America/New_York',today:today,recent:recent,buckets:buckets,sources:sources,pendingReceipts:pending,problemReceipts:problems,coverage:{metadataGaps:metadataGaps,missingWriteIds:missingWriteIds,unplacedCompleteReceipts:unplaced,legacyReceiptsExcluded:legacy,conflictedWrites:conflicted},basis:'Current COMPLETE master-write receipts, deduplicated by write ID; inserts/updates deduplicated within each write. Not a complete historical event log.'};
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
