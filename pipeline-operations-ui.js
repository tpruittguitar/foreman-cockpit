/* Readable views of Writer-owned supporting records. Missing evidence stays unknown. */
(function(root){
  'use strict';
  function create(api){
    var snapshot=null,schedules=null,error='',busy=false,tab='backlog',loadedAt='',message='';
    var tabLabels={backlog:'Work queue',email:'Intake coverage',recovery:'Verification & recovery',schedules:'Schedules',acceptance:'Diagnostics'};
    var esc=api.escape;
    function cell(value){return esc(value==null?'UNKNOWN':String(value));}
    function table(head,rows){return '<div class="ops-table"><table><thead><tr>'+head.map(function(v){return '<th>'+cell(v)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(v){return '<td>'+cell(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';}
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
      var h='<section class="panel ops-console"><h2>Operations</h2><div class="row"><button data-ops-refresh'+(busy?' disabled':'')+'>Refresh evidence</button><span class="tip">'+cell(busy?'Reading Writer…':error?'BLOCKED / UNKNOWN':observed?'Writer observation '+observed:'UNKNOWN · no durable snapshot loaded')+'</span></div>';
      if(error)h+='<p class="ops-warning">'+cell(error)+(store?' · Last successful snapshot retained; its freshness is unverified.':'')+'</p>';
      h+='<div class="row ops-tabs" role="tablist">'+['backlog','email','recovery','schedules','acceptance'].map(function(t){return '<button role="tab" aria-selected="'+(tab===t)+'" data-ops-tab="'+t+'">'+tabLabels[t]+'</button>';}).join('')+'</div><div role="tabpanel">';
      if(tab==='backlog'){
        h+='<h3>Research and verification obligations</h3><p class="tip">'+(summary?'Tracked '+summary.total+' · verified dispositions '+summary.done+' · unresolved '+summary.open.length:'UNKNOWN · tracked population has not been read')+'. This is supporting evidence, not a second job master.</p>';
        if(summary&&summary.total)h+=PipelineProgress.html('Tracked obligations independently resolved',summary.done,summary.total,'large');
        if(store)h+=table(['Obligation','State','Owner','Source','Outcome','Next action'],Object.keys(store.obligations).map(function(id){var o=store.obligations[id];return [id,o.state,o.owner,o.source.INITIATING_URL||o.source.initiatingUrl||o.source.SOURCE_URL,o.outcome,o.nextAction||o.error];}));
      }else if(tab==='email'){
        h+='<h3>Email coverage</h3><p class="tip">Completion requires message bodies, digest cards, pagination and independent candidate disposition evidence. A finished task alone does not clear the window.</p>';
        if(store){var runs=Object.keys(store.runs);h+=runs.length?table(['Window / run','Coverage','Found','Reviewed','Unreviewed','Unprocessed candidates','Oldest unreviewed','Watermark'],runs.map(function(id){var c=PipelineOperations.emailCoverage(store.runs[id],store.obligations);return [id,c.state,c.found,c.reviewed,c.unreviewed,c.unprocessed,c.oldest||'UNKNOWN',c.watermark||'Not advanced'];})):'<p>UNKNOWN · no durable source windows have been reported.</p>';
          runs.forEach(function(id){var c=PipelineOperations.emailCoverage(store.runs[id],store.obligations);if(c.found)h+=PipelineProgress.html(id+' · message bodies reviewed',c.reviewed,c.found,'medium');});
          h+='<div class="row"><label>Window start <input data-ops-start type="datetime-local"></label><label>Window end <input data-ops-end type="datetime-local"></label><button data-ops-catchup>Request Catch Up</button></div><p class="tip">Stores a bounded request. Provider acknowledgement is required before RUNNING can be shown.</p>';
          h+=table(['Catch Up request','Request state','Provider state','Next action'],Object.keys(store.catchUps).map(function(id){var r=store.catchUps[id];return [id,r.state,r.providerStatus,r.nextAction];}));
          Object.keys(store.catchUps).forEach(function(id){var r=store.catchUps[id];if(r.state==='REQUESTED'||r.providerStatus==='PENDING_MANUAL')h+=PipelineProgress.html(id+' · awaiting provider acknowledgement',null,null,'medium','waiting');});
        }else h+='<p>UNKNOWN · Writer coverage snapshot unavailable.</p>';
      }else if(tab==='recovery'){
        h+='<h3>Unresolved obligations</h3><p class="tip">Acknowledgement records that you saw an item. It retains the obligation until independent resolution evidence exists. Writer service incidents are available in System status.</p>';
        if(summary)summary.open.forEach(function(o){h+='<article class="ops-obligation"><b>'+cell(o.id)+' · '+cell(o.state)+'</b><p>'+cell(o.error||o.nextAction||'Resolution evidence required')+'</p><span class="tip">'+cell(o.acknowledgedAt?'Acknowledged '+o.acknowledgedAt:'Unacknowledged')+'</span> <button data-ops-ack="'+esc(o.id)+'">Acknowledge</button></article>';});
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
      view.querySelector('[data-ops-refresh]').onclick=function(){refresh(view);};
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
