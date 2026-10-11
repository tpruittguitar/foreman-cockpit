/* Phase 3 AI Operations dashboard. Readable views of Writer-owned supporting records.
   This is presentation/supporting evidence only: no canonical state, scoring, Writer, or master mutation logic changes. */
(function(root){
  'use strict';
  function create(api){
    var snapshot=null,schedules=null,error='',busy=false,tab='dashboard',loadedAt='',message='';
    var tabLabels={dashboard:'Dashboard',backlog:'Work queue',email:'Intake coverage',recovery:'Verification & recovery',schedules:'Schedules',acceptance:'Diagnostics'};
    var esc=api.escape;
    function cell(value){return esc(value==null?'UNKNOWN':String(value));}
    function table(head,rows){return '<div class="ops-table"><table><thead><tr>'+head.map(function(v){return '<th>'+cell(v)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(v){return '<td>'+cell(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
    function pct(done,total){return total?Math.round(done/total*100):0;}
    function ageText(iso){var t=Date.parse(iso||'');if(!Number.isFinite(t))return 'UNKNOWN';var m=Math.max(0,Math.round((Date.now()-t)/60000));if(m<90)return m+' min';if(m<2880)return (m/60).toFixed(1)+' h';return Math.round(m/1440)+' d';}
    function obligationList(store){return store&&store.obligations?Object.keys(store.obligations).map(function(id){var o=store.obligations[id]||{};o.id=id;return o;}):[];}
    function isDone(o){return /^(VERIFIED|COMPLETE|DONE|RESOLVED|WRITE_VERIFIED|VERIFIED_MASTER)$/i.test(String(o.state||o.outcome||''));}
    function isOpen(o){return !isDone(o);}
    function stageOf(o){var s=[o.id,o.state,o.owner,o.source&&JSON.stringify(o.source),o.outcome,o.nextAction,o.error].join(' ').toUpperCase();
      if(/WRITER|WRITE|RECEIPT|RESULT|VERIFY|VERIFICATION|UNVERIFIED/.test(s))return 'Writer / verification';
      if(/SALARY|COMP|PAY|FLEX|DEGREE|QUALIFICATION|LOCATION|LIVENESS/.test(s))return 'Qualification enrichment';
      if(/FIT|SCOPE|STRATEGIC|MANUFACTURING|DOMAIN|OWNERSHIP|TEAM/.test(s))return 'Strategic enrichment';
      if(/EMAIL|GMAIL|LINKEDIN|INDEED|GLASSDOOR|ZIP|INTAKE|DISCOVERY|SCOUT/.test(s))return 'Intake / discovery';
      if(/IDENTITY|DUPLICATE|REQ|URL/.test(s))return 'Identity / dedupe';
      return 'Other open work';
    }
    function runList(store){return store&&store.runs?Object.keys(store.runs).map(function(id){return Object.assign({id:id},store.runs[id]||{});}):[];}
    function dashboardMetrics(store,summary){
      var obligations=obligationList(store),open=obligations.filter(isOpen),done=obligations.length-open.length,stages={},oldest=null;
      open.forEach(function(o){var st=stageOf(o);stages[st]=(stages[st]||0)+1;var candidates=[o.createdAt,o.updatedAt,o.at,o.source&&o.source.timestamp].filter(Boolean);candidates.forEach(function(v){var t=Date.parse(v);if(Number.isFinite(t)&&(!oldest||t<oldest.t))oldest={t:t,iso:v,o:o};});});
      var runs=runList(store),intakeFound=0,intakeReviewed=0,intakeUnprocessed=0;
      runs.forEach(function(r){try{var c=PipelineOperations.emailCoverage(r,store.obligations);intakeFound+=+c.found||0;intakeReviewed+=+c.reviewed||0;intakeUnprocessed+=+c.unprocessed||0;}catch(e){}});
      var writerBlocked=open.filter(function(o){return stageOf(o)==='Writer / verification';}).length;
      var next='Refresh Writer evidence';
      if(writerBlocked)next='Resolve '+writerBlocked+' Writer / verification blocker'+(writerBlocked===1?'':'s');
      else if(open.length)next='Work oldest open obligation: '+(oldest&&oldest.o&&oldest.o.id||open[0].id);
      else if(intakeUnprocessed)next='Finish '+intakeUnprocessed+' unprocessed intake candidate'+(intakeUnprocessed===1?'':'s');
      else if(summary&&summary.total)next='No open tracked obligations in current snapshot';
      return {total:obligations.length,done:done,open:open.length,openList:open,stages:stages,oldest:oldest,intakeFound:intakeFound,intakeReviewed:intakeReviewed,intakeUnprocessed:intakeUnprocessed,writerBlocked:writerBlocked,next:next};
    }
    function metricCard(label,value,sub,cls){return '<article class="dash-card ops-kpi '+(cls||'')+'"><h4>'+cell(label)+'</h4><b>'+cell(value)+'</b><span class="tip">'+cell(sub||'')+'</span></article>';}
    function chartCard(title,svg,caption,span){return '<article class="chart-card ops-chart"'+(span?' style="grid-column:span '+span+'"':'')+'><h3>'+cell(title)+'</h3>'+svg+'<p class="tip">'+cell(caption||'')+'</p></article>';}
    function intakeProcessChartsHtml(store,summary,m){
      var runs=runList(store),found=0,reviewed=0,verified=0,unprocessed=0,blocked=0,clear=0,backlog=0,unknown=0;
      runs.forEach(function(r){try{var c=PipelineOperations.emailCoverage(r,store.obligations);found+=+c.found||0;reviewed+=+c.reviewed||0;verified+=+c.verified||0;unprocessed+=+c.unprocessed||0;if(c.state==='CLEAR')clear++;else if(c.state==='BACKLOG')backlog++;else if(c.state==='BLOCKED')blocked++;else unknown++;}catch(e){unknown++;}});
      var open=m&&m.openList?m.openList:obligationList(store).filter(isOpen),stageRows=Object.keys(m.stages).sort(function(a,b){return m.stages[b]-m.stages[a];}).map(function(k){return {label:k,value:m.stages[k]};});
      var states=summary&&summary.counts?Object.keys(summary.counts).filter(function(k){return summary.counts[k]>0;}).map(function(k){return {label:k.replace(/_/g,' ').toLowerCase(),value:summary.counts[k]};}):[];
      var lane={intake:0,strategic:0,feasibility:0,writer:0,other:0};
      open.forEach(function(o){var st=stageOf(o);if(st==='Intake / discovery')lane.intake++;else if(st==='Strategic enrichment')lane.strategic++;else if(st==='Qualification enrichment')lane.feasibility++;else if(st==='Writer / verification')lane.writer++;else lane.other++;});
      var h='<div class="chart-intro ops-flow-intro"><h2>Intake vs Processing</h2><p>One operations view for discovery intake, processing backlog, Writer verification, and unresolved work. Unknowns stay visible; they are not assumed zero.</p></div><div class="chart-grid ops-flow-grid">';
      h+=chartCard('Intake funnel',PipelineCharts.bars('Intake funnel',[{label:'Found messages',value:found},{label:'Reviewed bodies',value:reviewed},{label:'Verified candidates',value:verified},{label:'Unprocessed candidates',value:unprocessed}],{compact:true}),'Email/source-window coverage reported by durable operations runs.',1);
      h+=chartCard('Processing backlog by stage',PipelineCharts.bars('Processing backlog by stage',stageRows,{compact:true}),'Open obligations grouped by current blocking stage.',1);
      h+=chartCard('Obligation state mix',PipelineCharts.donut('Obligation state mix',states,{compact:true,unit:'obligations'}),'All tracked operation obligations, including completed and unresolved states.',1);
      h+=chartCard('Open work by lane',PipelineCharts.columns('Open work by lane',[{label:'Intake',value:lane.intake},{label:'Strategic',value:lane.strategic},{label:'Feasibility',value:lane.feasibility},{label:'Writer',value:lane.writer},{label:'Other',value:lane.other}]),'Open work split by the five-lane operating model.',1);
      h+=chartCard('Source-window status',PipelineCharts.donut('Source-window status',[{label:'Clear',value:clear},{label:'Backlog',value:backlog},{label:'Blocked',value:blocked},{label:'Unknown',value:unknown}],{compact:true,unit:'runs'}),'Durable source windows by coverage state; blocked and unknown remain explicit.',1);
      h+=chartCard('Resolved vs open',PipelineCharts.columns('Resolved vs open',[{label:'Resolved',value:summary?summary.done:0},{label:'Open',value:summary?summary.open.length:0}]),'Independent-proof completion ratio for tracked obligations.',1);
      return h+'</div>';
    }
    function runtimeReadHealth(){
      var v=api.loadStatus?api.loadStatus():{},conn=api.connection?api.connection():{},a=v.archive||{},e=v.evidence||{},items=[];
      function label(x){return x==='OK'?'OK':x==='PENDING'?'PENDING':x==='NOT_APPLICABLE'?'N/A':x==='FAILED'?'FAILED':(x||'UNKNOWN');}
      if(v.freshness==='STALE'||v.freshness==='NONE')items.push({area:'Active master',state:v.freshness||'UNKNOWN',detail:v.error||conn.error||'canonical master is not live',bad:true});
      else items.push({area:'Active master',state:v.freshness||conn.state||'UNKNOWN',detail:conn.lastRead?'last read '+conn.lastRead:(conn.state||'not verified'),bad:false});
      items.push({area:'Terminal archive',state:label(a.state),detail:a.error||('archive rows '+(a.rows?a.rows.length:'not loaded')),bad:a.state==='FAILED'});
      items.push({area:'Evidence companion',state:label(e.state),detail:e.error||('evidence records '+(e.recs?e.recs.length:'not loaded')),bad:e.state==='FAILED'});
      if(v.meta&&v.meta.source==='structured-runtime'){
        var sm=v.meta.structured||{},generated=sm.generatedAt||v.meta.modifiedTime||'',age=generated?ageText(generated):'UNKNOWN',rows=v.meta.total||v.meta.rows||'UNKNOWN';
        items.push({area:'Structured snapshot',state:sm.source?'OK':'UNKNOWN',detail:'rows '+rows+' · generated '+(generated||'UNKNOWN')+' · age '+age,bad:false});
      }
      var bad=items.filter(function(x){return x.bad;}).length,pending=items.filter(function(x){return x.state==='PENDING';}).length;
      return {items:items,state:bad?'DEGRADED':pending?'LOADING':'OK'};
    }
    function runtimeHealthHtml(){
      var rh=runtimeReadHealth();
      return '<div class="panel"><h3>Runtime read health</h3><p class="tip">Active master must stay live. In structured production mode, the snapshot age and row count are shown here. Archive and evidence support reads must be visible and degraded, not silent.</p>'+table(['Runtime read','State','Detail'],rh.items.map(function(x){return [x.area,x.state,x.detail];}))+'<div class="row"><span class="chip">Runtime status: '+cell(rh.state)+'</span></div></div>';
    }
    function dashboardHtml(store,summary,observed){
      var m=dashboardMetrics(store,summary),stageRows=Object.keys(m.stages).sort(function(a,b){return m.stages[b]-m.stages[a];}).map(function(k){return [k,m.stages[k]];});
      var h='<section class="ops-dashboard"><div class="ops-next-priority"><span class="u">Next Priority</span><b>'+cell(m.next)+'</b><small>Based on current Writer-owned supporting evidence. This does not replace canonical master state.</small></div>';
      h+='<div class="dash-grid ops-kpis">'+metricCard('Open enrichment backlog',m.open,m.total?m.done+' complete of '+m.total:'No snapshot',m.open?'warn':'')+metricCard('Completion ratio',m.total?pct(m.done,m.total)+'%':'UNKNOWN',m.total?m.done+'/'+m.total+' obligations':'Writer snapshot unavailable')+metricCard('Writer blocked',m.writerBlocked,m.writerBlocked?'Requires verification/recovery':'No tracked writer blockers',m.writerBlocked?'bad':'')+metricCard('Intake reviewed',m.intakeReviewed,m.intakeFound?m.intakeFound+' found · '+m.intakeUnprocessed+' unprocessed':'No email/source run coverage read')+metricCard('Oldest open age',m.oldest?ageText(m.oldest.iso):'NONE',m.oldest?m.oldest.o.id:'No open tracked obligation')+'</div>';
      h+=intakeProcessChartsHtml(store,summary,m);
      if(m.total)h+=PipelineProgress.html('Tracked obligations independently resolved',m.done,m.total,'large');
      h+='<div class="panel"><h3>Enrichment backlog by stage</h3>'+(stageRows.length?table(['Stage','Open count'],stageRows):'<p class="tip">No open tracked obligations in the current snapshot.</p>')+'</div>';
      h+=runtimeHealthHtml();
      h+='<div class="panel"><h3>Coverage limits</h3><p class="tip">Current dashboard can show tracked obligations, current source-window coverage, verification blockers, oldest unresolved work, and runtime read health. Historical intake-vs-enrichment trend lines require durable per-run history in the Writer snapshot; absent history remains UNKNOWN, not assumed zero.</p><div class="row"><span class="chip">Observed: '+cell(observed||'UNKNOWN')+'</span><span class="chip">Dashboard status: '+cell(error?'DEGRADED':'LIVE SNAPSHOT')+'</span></div></div></section>';
      return h;
    }
    async function refresh(view){
      if(busy)return;busy=true;paint(view);
      var progress=PipelineProgress.begin('[data-ops-refresh]','Reading Writer evidence');
      var results=await Promise.allSettled([api.get('operations'),api.get('schedules')]);
      var problems=[];
      results.forEach(function(r,i){var j=r.status==='fulfilled'&&r.value;
        if(!j||!j.ok||!(i===0?j.store&&j.store.schema===1:j.manifest&&j.manifest.schema===1))problems.push((i===0?'Operations':'Scheduler')+': '+(j&&j.error||r.reason&&r.reason.message||'Writer does not expose a supported snapshot'));
        else if(i===0)snapshot=j;else schedules=j;
      });
      error=problems.join(' · ');loadedAt=new Date().toISOString();busy=false;paint(view);progress.finish({attention:!!error});
    }
    function paint(view){
      var store=snapshot&&snapshot.store,summary=store&&PipelineOperations.summary(store),observed=snapshot&&snapshot.observedAt;
      var h='<section class="panel ops-console"><h2>AI Operations</h2><div class="row"><button data-ops-refresh'+(busy?' disabled':'')+'>Refresh evidence</button><span class="tip">'+cell(busy?'Reading Writer…':error?'BLOCKED / UNKNOWN':observed?'Writer observation '+observed:'UNKNOWN · no durable snapshot loaded')+'</span></div>';
      if(error)h+='<p class="ops-warning">'+cell(error)+(store?' · Last successful snapshot retained; its freshness is unverified.':'')+'</p>';
      h+='<div class="row ops-tabs" role="tablist">'+['dashboard','backlog','email','recovery','schedules','acceptance'].map(function(t){return '<button role="tab" aria-selected="'+(tab===t)+'" data-ops-tab="'+t+'">'+tabLabels[t]+'</button>';}).join('')+'</div><div role="tabpanel">';
      if(tab==='dashboard'){
        h+=store?dashboardHtml(store,summary,observed):'<div class="ops-next-priority"><span class="u">Next Priority</span><b>Refresh Writer evidence</b><small>No durable operations snapshot loaded yet.</small></div>'+runtimeHealthHtml();
      }else if(tab==='backlog'){
        h+='<h3>Research and verification obligations</h3><p class="tip">'+(summary?'Tracked '+summary.total+' · verified dispositions '+summary.done+' · unresolved '+summary.open.length:'UNKNOWN · tracked population has not been read')+'. This is supporting evidence, not a second job master.</p>';
        if(summary&&summary.total)h+=PipelineProgress.html('Tracked obligations independently resolved',summary.done,summary.total,'large');
        if(store)h+=table(['Obligation','Stage','State','Owner','Source','Outcome','Next action'],obligationList(store).map(function(o){return [o.id,stageOf(o),o.state,o.owner,o.source&&((o.source.INITIATING_URL||o.source.initiatingUrl||o.source.SOURCE_URL)||''),o.outcome,o.nextAction||o.error];}));
      }else if(tab==='email'){
        h+='<h3>Email and source coverage</h3><p class="tip">Completion requires message bodies, digest cards, pagination and independent candidate disposition evidence. A finished task alone does not clear the window.</p>';
        if(store){var runs=Object.keys(store.runs);h+=runs.length?table(['Window / run','Coverage','Found','Reviewed','Unreviewed','Unprocessed candidates','Oldest unreviewed','Watermark'],runs.map(function(id){var c=PipelineOperations.emailCoverage(store.runs[id],store.obligations);return [id,c.state,c.found,c.reviewed,c.unreviewed,c.unprocessed,c.oldest||'UNKNOWN',c.watermark||'Not advanced'];})):'<p>UNKNOWN · no durable source windows have been reported.</p>';
          runs.forEach(function(id){var c=PipelineOperations.emailCoverage(store.runs[id],store.obligations);if(c.found)h+=PipelineProgress.html(id+' · message bodies reviewed',c.reviewed,c.found,'medium');});
          h+='<div class="row"><label>Window start <input data-ops-start type="datetime-local"></label><label>Window end <input data-ops-end type="datetime-local"></label><button data-ops-catchup>Request Catch Up</button></div><p class="tip">Stores a bounded request. Provider acknowledgement is required before RUNNING can be shown.</p>';
          h+=table(['Catch Up request','Request state','Provider state','Next action'],Object.keys(store.catchUps).map(function(id){var r=store.catchUps[id];return [id,r.state,r.providerStatus,r.nextAction];}));
          Object.keys(store.catchUps).forEach(function(id){var r=store.catchUps[id];if(r.state==='REQUESTED'||r.providerStatus==='PENDING_MANUAL')h+=PipelineProgress.html(id+' · awaiting provider acknowledgement',null,null,'medium','waiting');});
        }else h+='<p>UNKNOWN · Writer coverage snapshot unavailable.</p>';
      }else if(tab==='recovery'){
        h+='<h3>Unresolved obligations</h3><p class="tip">Acknowledgement records that you saw an item. It retains the obligation until independent resolution evidence exists. Writer service incidents are available in System status.</p>';
        if(summary)summary.open.forEach(function(o){h+='<article class="ops-obligation"><b>'+cell(o.id)+' · '+cell(stageOf(o))+' · '+cell(o.state)+'</b><p>'+cell(o.error||o.nextAction||'Resolution evidence required')+'</p><span class="tip">'+cell(o.acknowledgedAt?'Acknowledged '+o.acknowledgedAt:'Unacknowledged')+'</span> <button data-ops-ack="'+esc(o.id)+'">Acknowledge</button></article>';});
      }else if(tab==='schedules'){
        var manifest=schedules&&schedules.manifest;
        h+='<h3>Desired schedules and native provider evidence</h3><p class="tip">Native control: '+cell(schedules&&schedules.nativeControl||'UNKNOWN')+'. Saving stages a proposal; provider changes require the native scheduler. Writer + Forge are active. Claude and Grok are deferred. Freeze remains 07:00 America/New_York. Paused tasks stay paused.</p>';
        if(manifest){h+=manifest.tasks.length?table(['Task','Owner','Provider','Desired clock','Native state','Next desired occurrence'],manifest.tasks.map(function(t){var next;try{next=PipelineScheduler.upcoming(t,Date.now(),1)[0];}catch(e){next=e.message;}return [t.key,t.owner,t.provider,t.time+' '+t.timezone,PipelineScheduler.status(t,Date.now()),next||'None'];})):'<p>UNKNOWN · no native task registry has been imported.</p>';
          h+='<details><summary>Stage a schedule proposal</summary><p class="tip">Required: key, provider, owner, enabled, timezone, time, days. Preview validates local clock and dependencies; saving does not start a task.</p><textarea data-ops-task class="cfg" aria-label="Desired schedule JSON" placeholder=\'{"key":"email","provider":"ChatGPT","owner":"SCOUT","enabled":true,"timezone":"America/New_York","time":"09:00","days":["MO","TU","WE","TH","FR"]}\'></textarea><div class="row"><button data-ops-preview>Preview proposal</button><button data-ops-stage disabled>Stage proposal</button></div><pre data-ops-preview-result></pre></details>';
        }
      }else{
        h+='<h3>PR70 production acceptance</h3><p>INDETERMINATE · local regressions do not certify production deployment or native automation. No production completion percentage is available.</p>';
        if(store)h+=table(['Criterion','State','Evidence'],Object.keys(store.acceptance||{}).map(function(id){var a=store.acceptance[id];return [id,a.state,a.evidenceRef];}));
      }
      h+='</div><p data-ops-message aria-live="polite">'+cell(message)+'</p></section>';view.innerHTML=h;
      var refreshBtn=view.querySelector('[data-ops-refresh]');if(refreshBtn)refreshBtn.onclick=function(){refresh(view);};
      view.querySelectorAll('[data-ops-tab]').forEach(function(b){b.onclick=function(){tab=b.dataset.opsTab;paint(view);};});
      async function write(body){try{if(error)throw new Error('Refresh a complete current Writer snapshot before saving');var j=await api.post(body);if(!j||!j.ok)throw new Error(j&&j.error||j&&j.mode||'Writer request failed');message='Saved supporting state; native execution is not verified.';await refresh(view);}catch(e){message=e.message;paint(view);}}
      view.querySelectorAll('[data-ops-ack]').forEach(function(b){b.onclick=function(){write({action:'acknowledge_obligation',id:b.dataset.opsAck,baseRevision:store.revision});};});
      var catchup=view.querySelector('[data-ops-catchup]');if(catchup)catchup.onclick=function(){var start=new Date(view.querySelector('[data-ops-start]').value),end=new Date(view.querySelector('[data-ops-end]').value);if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start){message='Choose a valid bounded window.';paint(view);return;}write({action:'catch_up',requestId:'catchup-'+crypto.randomUUID(),baseRevision:store.revision,scope:{windowStart:start.toISOString(),windowEnd:end.toISOString()}});};
      var preview=view.querySelector('[data-ops-preview]'),stage=view.querySelector('[data-ops-stage]'),draft=null;
      if(preview){var input=view.querySelector('[data-ops-task]');input.oninput=function(){draft=null;stage.disabled=true;};preview.onclick=function(){var result=view.querySelector('[data-ops-preview-result]');try{draft=JSON.parse(input.value);var proposed=PipelineScheduler.edit(schedules.manifest,draft,schedules.manifest.revision,new Date().toISOString());result.textContent=JSON.stringify({desiredOccurrences:PipelineScheduler.upcoming(draft,Date.now(),5),warnings:PipelineScheduler.warnings(proposed,Date.now()),providerStatus:'PENDING_MANUAL',applied:false},null,2);stage.disabled=false;}catch(e){draft=null;stage.disabled=true;result.textContent=e.message;}};stage.onclick=function(){if(draft)write({action:'save_schedule_proposal',task:draft,baseRevision:schedules.manifest.revision});};}
    }
    return {render:function(view){paint(view);if(!loadedAt&&!busy)refresh(view);},refresh:refresh};
  }
  root.PipelineOperationsUI={create:create};
})(window);
