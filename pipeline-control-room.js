(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineControlRoom=factory();})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  function date(t){return formatter.format(new Date(t));}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function age(t,now){var ms=now-Date.parse(t||'');if(!Number.isFinite(ms))return 'age unknown';var h=Math.max(0,ms/3600000);return h<1?Math.floor(h*60)+' min':h<48?Math.floor(h)+' h':Math.floor(h/24)+' d '+Math.floor(h%24)+' h';}
  function source(r){var p=r.payload||{},s=[p.SCOUT_RUN_ID,p.DISCOVERY_SOURCE,p.SOURCE_PROVIDER].join(' ');if(/FORGE-(AUTO|SOURCE)-/.test(s))return 'Automatic sources';if(/EMAIL|GMAIL/i.test(s))return 'Email';if(/MANUAL|MI-/i.test(s))return 'Manual';return 'Other / legacy';}
  function recordedDay(r){var p=r.payload||{},s=p.DATE_ADDED||'';if(!/^\d{4}-\d{2}-\d{2}/.test(s))s=p.DISCOVERED_AT_ET||'';if(!/^\d{4}-\d{2}-\d{2}/.test(s))return null;var key=s.slice(0,10),t=Date.parse(key+'T12:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==key)return null;return /T.*(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s))?date(Date.parse(s)):key;}
  function model(input){
    input=input||{};var now=input.now||Date.now(),h=input.health,checks=h&&h.ok&&h.checks||{},warnings=[],blocks=[],rows=null,counts={},daily=[],byId=new Map(),undated=0;
    function warn(title,detail,action){warnings.push({title:title,detail:detail||'',action:action||'Check the evidence before trusting this stage',level:'UNKNOWN'});}
    var att=checks.attention,attFresh=att&&att.ok&&now-Date.parse(att.at||'')<90*60000&&now>=Date.parse(att.at||'');
    if(!attFresh||input.healthError)warn('Incident feed is not current',input.healthError||'No fresh incident readback; absence of alerts does not mean healthy');
    (h&&h.issues||[]).forEach(function(i){if(i.level==='BLOCKING')blocks.push(Object.assign({},i,{stale:!attFresh}));});
    ['sources','boards'].forEach(function(k){var c=checks[k];if(!c||!c.ok)warn(k==='sources'?'Source discovery not reported':'Board discovery not reported');else if(now-Date.parse(c.at||'')>6*3600000||!Number.isFinite(Date.parse(c.at||'')))warn(k==='sources'?'Source discovery is overdue':'Board discovery is overdue','Latest report '+age(c.at,now),'Inspect the scheduled workflow and its latest failed/pending run');else if(c.failedBoards)warnings.push({title:c.failedBoards+' employer boards failed in the latest pass',detail:'Other boards may have succeeded',action:'Review discovery errors and carry unfinished sources forward',level:'ACTION'});});
    var master=input.master||{};
    if(master.loaded&&Array.isArray(master.rows)){rows=[];master.rows.forEach(function(r){if(!r.PRIMARY_ID)return;var prior=byId.get(r.PRIMARY_ID);if(!prior||prior.ARCHIVED_TERMINAL&&!r.ARCHIVED_TERMINAL)byId.set(r.PRIMARY_ID,r);});rows=Array.from(byId.values());rows.forEach(function(r){counts[r.BUCKET]=(counts[r.BUCKET]||0)+1;});}
    if(!rows||/STALE|NONE/.test(master.freshness||''))warn('Master population is unavailable or stale','Job counts may be incomplete','Refresh the canonical master connection');
    var today=date(now);for(var d=6;d>=0;d--){var key=date(Date.parse(today+'T12:00:00Z')-d*86400000);daily.push({date:key,sources:{},total:0});}
    if(rows)rows.forEach(function(r){var dt=recordedDay(r);if(!dt){undated++;return;}var b=daily.find(function(x){return x.date===dt;});if(b){var s=source(r);b.sources[s]=(b.sources[s]||0)+1;b.total++;}});
    var a=input.activity,ops=input.operations,coverageRuns=ops&&ops.runs?Object.keys(ops.runs).length:null;
    if(!a||!a.ok||input.activityError)warn('Writer completion evidence is unavailable',input.activityError||'No current receipt snapshot');
    if(coverageRuns===0||coverageRuns===null)warn('Email/source coverage is not reported','No durable source-window records were loaded; this is not zero reviewed work','The discovery runner must publish durable coverage checkpoints');
    if(a&&a.problemReceipts)warnings.push({title:a.problemReceipts+' receipt states need resolution',detail:'Current FALSE_COMPLETE / NOT_PERSISTED / NEEDS_RESOLUTION receipts; not a new-job count',action:'Gofer: reconcile each receipt with exact-row evidence',level:'ACTION'});
    var w=input.writer;if(w&&w.fetchError)blocks.unshift({title:'Writer is not answering',detail:w.fetchError,action:'Check the Writer connection and retry read-only health checks',level:'BLOCKING'});
    if(w&&(w.freeze&&(w.freeze.active||w.freeze.frozen)||w.triggerInstalled===false))blocks.unshift({title:w.triggerInstalled===false?'Writer queue trigger is missing':'Writer is frozen',detail:'Production work cannot be assumed to proceed',action:'Resolve the Writer health gate before any new submissions',level:'BLOCKING'});
    if(w&&w.queue&&w.queue.pending>0&&now-Date.parse(w.queue.oldestPendingAt||'')>45*60000)warnings.push({title:'Writer queue has waited longer than 45 minutes',detail:'Oldest waiting request: '+age(w.queue.oldestPendingAt,now),action:'Inspect the queue processor and its held/failed requests',level:'ACTION'});
    var sched=checks.schedules;
    if(!sched||!sched.ok||now-Date.parse(sched.at||'')>86400000)warn('Native schedule state is unverified','No current native configuration readback');
    else if(!sched.executionVerified)warn('Scheduled execution is not yet verified',sched.configured+' active local schedules were saved; configuration is not proof of a successful run','Check each first terminal receipt and live Writer proofs');
    var decisions=(h&&h.issues||[]).filter(function(i){return /^(DECIDE|JOBS)$/.test(i.section);}).length;
    if(decisions)warnings.push({title:decisions+' decisions or questions are waiting on you',detail:'These can hold up individual jobs even while other stages work',action:'Open System → Needs you for the decision and its evidence',level:'ACTION'});
    var primary=blocks[0]||warnings[0]||null,sev=blocks.length?'blocked':warnings.length?'attention':'healthy';
    return {now:now,health:h,checks:checks,blocks:blocks,warnings:warnings,primary:primary,severity:sev,rowsKnown:!!rows,counts:counts,daily:daily,undated:undated,totalRows:rows&&rows.length,intakeToday:rows?daily[6].total:null,activity:a,coverageRuns:coverageRuns,decisions:decisions,opsOpen:ops&&ops.obligations?Object.values(ops.obligations).filter(function(o){return !/^(VERIFIED_COMPLETE|EXCLUDED_VERIFIED|EXISTING_VERIFIED|CANCELED_VERIFIED)$/.test(o.state);}).length:null};
  }
  var COLORS={'Email':'#61cdbb','Automatic sources':'#3da5ff','Manual':'#c9aa77','Other / legacy':'#97a7bb'};
  function intakeChart(m){
    if(!m.rowsKnown)return '<p class="cr-unknown">Intake is unknown until the canonical job population loads.</p>';
    var max=Math.max.apply(null,[1].concat(m.daily.map(function(d){return d.total;}))),svg='<svg viewBox="0 0 760 190" role="img" aria-label="Combined intake from all sources, last seven Eastern calendar days"><title>New jobs entered by recorded intake day; all sources combined</title>';
    m.daily.forEach(function(d,i){var x=48+i*99,y=147;Object.keys(COLORS).forEach(function(s){var n=d.sources[s]||0,bh=115*n/max;svg+='<rect x="'+x+'" y="'+(y-bh)+'" width="62" height="'+bh+'" fill="'+COLORS[s]+'"><title>'+esc(d.date+' · '+s+': '+n)+'</title></rect>';y-=bh;});svg+='<text x="'+(x+31)+'" y="'+(y-8)+'" text-anchor="middle" fill="#e3eee9" font-size="14">'+d.total+'</text><text x="'+(x+31)+'" y="174" text-anchor="middle" fill="#a8b8b0" font-size="12">'+d.date.slice(5)+'</text>';});
    return svg+'</svg><div class="cr-legend">'+Object.keys(COLORS).map(function(s){return '<span><i style="background:'+COLORS[s]+'"></i>'+esc(s)+'</span>';}).join('')+'</div>';
  }
  function html(m){
    var a=m.activity,c=m.counts,unknown='Not reported',v=function(n){return n==null?unknown:n;},enrich=a&&a.sources?Object.keys(a.sources).filter(function(k){return /enrichment/i.test(k);}).reduce(function(n,k){return n+a.sources[k].updates;},0):null;
    var intakeBlock=m.blocks.some(function(x){return /intake/i.test(x.title);}),stages=[
      ['Discovery',v(m.health&&m.health.candidates),'potential candidates in latest source passes','Reports are not admitted jobs',!m.checks.sources||!m.checks.sources.ok?'unknown':'working'],
      ['Intake',v(m.intakeToday),'new jobs today · all sources',intakeBlock?'Automatic path blocked; other paths may still write':'Recorded intake day · Eastern time',intakeBlock?'blocked':m.rowsKnown?'working':'unknown'],
      ['Verification',v(a&&a.today.writes),'writes confirmed today',a?a.pendingReceipts+' pending · '+a.problemReceipts+' problem receipts':unknown,a&&a.problemReceipts?'attention':a?'working':'unknown'],
      ['Enrichment',v(enrich),'enrichment updates · last 24 h',m.rowsKnown?(c.MANUAL_RESEARCH||0)+' jobs in the current research queue':unknown,enrich==null?'unknown':'working'],
      ['Your decisions',m.rowsKnown?(c.APPLIED||0)+' / '+(c.DECLINED_BY_TIM||0):unknown,'applied / declined · current jobs',m.decisions+' questions · '+(m.rowsKnown?((c.READY_TO_PURSUE||0)+(c.TIM_DECISION_REQUIRED||0))+' ready or waiting on you':'population not loaded'),m.decisions?'attention':m.rowsKnown?'working':'unknown']
    ];
    var headline=m.severity==='blocked'?'Action required — part of the pipeline is blocked':m.severity==='attention'?'Attention needed — coverage or work is unresolved':'All observed stages are current';
    var h='<section class="pipeline-control-room"><div class="cr-status '+m.severity+'" role="status"><div><span class="cr-eyebrow">SYSTEM STATUS</span><h2>'+headline+'</h2><p>'+esc(m.primary&&m.primary.title||'No blocking or stale evidence in the current checks')+'</p></div><span class="cr-stamp">Checked '+esc(new Date(m.now).toLocaleTimeString('en-US',{timeZone:'America/New_York'}))+' ET<br>Refreshes every minute while open</span></div>';
    h+='<section class="cr-panel"><div class="cr-panel-title"><h3>1 · Is work moving through the pipeline?</h3><span>Activity and current queues · not a conversion funnel</span></div><ol class="cr-flow">'+stages.map(function(s,i){return '<li class="'+s[4]+'"><span class="cr-stage-number">0'+(i+1)+'</span><h4>'+s[0]+'</h4><b>'+esc(s[1])+'</b><p>'+esc(s[2])+'</p><small>'+esc(s[3])+'</small></li>';}).join('')+'</ol><div class="cr-intake-title"><h4>Intake from every source · one chart</h4><span>New jobs, not Writer updates</span></div>'+intakeChart(m)+'<p class="cr-note">Eastern calendar days. '+esc(m.undated)+' loaded jobs lack a usable intake date and are not placed on this chart. Applied and declined are final decisions; research stays open.</p></section>';
    h+='<section class="cr-panel"><div class="cr-panel-title"><h3>2 · What is stopped, late, or unknown?</h3><span>'+m.blocks.length+' blocking · '+m.warnings.length+' other signals</span></div>';
    var items=m.blocks.concat(m.warnings);
    h+=items.length?'<div class="cr-issues">'+items.map(function(x,i){return '<article class="cr-issue '+(x.level==='BLOCKING'?'blocked':'attention')+'"><div><span class="cr-signal">'+(x.level==='BLOCKING'?'BLOCKED':x.level==='UNKNOWN'?'UNKNOWN':'ACTION')+'</span><b>'+esc(x.title)+'</b><small>'+esc(x.at?'Open '+age(x.at,m.now):'Timing not reported')+(x.stale?' · source report stale':'')+'</small></div><p>'+esc(x.detail)+'</p><p class="cr-next"><strong>Next:</strong> '+esc(x.action||'Inspect supporting evidence')+'</p>'+(x.sourceUrl?'<a href="'+esc(x.sourceUrl)+'" target="_blank" rel="noopener">Open evidence ↗</a>':'')+'</article>';}).join('')+'</div>':'<p class="cr-note">No problems detected in the observed evidence. This does not certify unreported sources.</p>';
    h+='<p class="cr-note">'+esc(v(m.opsOpen))+' open tracked obligations. Source candidates, job rows, receipt writes and row updates have different units; counts are never added together.</p></section></section>';
    return h;
  }
  function banner(m){if(m.severity==='healthy')return '';return (m.severity==='blocked'?'PIPELINE BLOCKED':'PIPELINE NEEDS ATTENTION')+' · '+(m.primary&&m.primary.title||'Health evidence is not current')+(m.primary&&m.primary.at?' · '+age(m.primary.at,m.now):'')+' · View system health';}
  return {model:model,html:html,banner:banner,recordedDay:recordedDay};
});
