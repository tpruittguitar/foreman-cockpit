/* Pipeline Explorer: Constraints, Steps and Engine health pages (card cs-32ab60a7 PR 3, UI only).
   Renders the GET /api/engine-status body, which is already PipelineEngineStatus.evaluate()'s result. Validation, the
   constraint, queue growth, age bands and banner copy all come from that result; nothing here recomputes them, and a
   missing field shows an em dash or UNKNOWN, never a number. All classes are ex- prefixed and scoped under .ex-root. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineExplorerTabs=factory();})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var ROUTES=['constraints','steps','engine-health'];
  var STAGES=['DISCOVERY','INTAKE','ENRICHMENT'];
  var API='/api/engine-status';
  var FIXTURE='tests/fixtures/engine-status/populated.json';
  var FIXTURE_NOW=Date.parse('2026-11-24T14:15:00-05:00')+5*60000;   /* AT + 5 min, dev-only GUI review */
  var WORD={ok:'OK',degraded:'DEGRADED',constraint:'CONSTRAINT',not_needed:'NOT NEEDED',idle:'IDLE',failed:'FAILED',missed:'MISSED RUN',unknown:'UNKNOWN'};
  var DASH='—';
  var timeFmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',hour12:true});
  var dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(v){return typeof v==='number'&&Number.isFinite(v);}
  function show(v){return num(v)?String(v):DASH;}
  function txt(v){return typeof v==='string'&&v.trim()?v:DASH;}
  function nn(n){return num(n)?String(n).padStart(2,'0'):DASH;}
  function ms(iso){return typeof iso==='string'?Date.parse(iso):NaN;}
  /* Last run / next labels from ISO times, America/New_York: clock time on the as-of day, "Nov 23, 1:40 PM" otherwise. */
  function when(iso,asOf){
    var t=ms(iso);if(!Number.isFinite(t))return DASH;
    var a=ms(asOf),d=new Date(t);
    if(Number.isFinite(a)&&dayFmt.format(d)===dayFmt.format(new Date(a))){var p={};timeFmt.formatToParts(d).forEach(function(x){p[x.type]=x.value;});return et(p.hour+':'+p.minute+' '+String(p.dayPeriod||'').toUpperCase());}
    var E=engine();return E&&E.boardTime?et(E.boardTime(t)):d.toISOString();
  }
  /* Every clock time shown here is America/New_York, so it says ET. Copy that already ends in ET is left alone. */
  function et(s){s=String(s);return /\bET$/.test(s)?s:s+' ET';}
  function asOfEt(s){return String(s==null?'':s).replace(/\(as of ([^)]*)\)/g,function(m,x){return '(as of '+et(x)+')';}).replace(/as of ([^()]*?)$/,function(m,x){return 'as of '+et(x);});}
  function engine(){return typeof PipelineEngineStatus!=='undefined'?PipelineEngineStatus:(typeof require==='function'?safeRequire():null);}
  function safeRequire(){try{return require('./pipeline-engine-status');}catch(e){return null;}}

  /* Display state of one annotated step. evaluate() marks unknown and isConstraint; nothing is inferred here. */
  function stateOf(s){if(!s||s.unknown)return 'unknown';if(s.isConstraint)return 'constraint';return WORD[s.state]?s.state:'unknown';}
  function sq(st,cls){return '<i class="ex-sq ex-s-'+st+(cls?' '+cls:'')+'" aria-hidden="true"></i>';}
  function byStage(steps,stage){return steps.filter(function(s){return s&&s.stage===stage;});}
  function strays(steps){return steps.filter(function(s){return !s||STAGES.indexOf(s.stage)<0;});}
  function groupsOf(steps){var g=STAGES.map(function(st){return {stage:st,steps:byStage(steps,st)};});var x=strays(steps);if(x.length)g.push({stage:'STAGE UNKNOWN',steps:x});return g;}

  /* Banner from the evaluate() copy only. ok has none. */
  function banner(r){
    if(r.status==='ok')return '';
    if(r.status==='stale')return '<div class="ex-banner ex-b-stale" role="status"><b class="ex-glyph">'+esc(asOfEt(r.copy))+'</b></div>';
    if(r.status==='expired')return '<div class="ex-banner ex-b-stale" role="status"><b class="ex-glyph">'+esc(r.copy)+'</b><p>'+esc(asOfEt(r.copyDetail))+'</p></div>';
    if(r.status==='empty')return '<div class="ex-banner ex-b-empty" role="status"><b class="ex-glyph">'+DASH+'</b><p>'+esc(r.copy)+'</p></div>';
    return '<div class="ex-banner ex-b-error" role="alert"><b class="ex-glyph">'+esc(r.copy)+'</b></div>';
  }

  /* ---------- Constraints ---------- */
  function constraints(r){
    var steps=r.steps||[],stale=r.status==='stale';
    function plate(stage){
      var list=byStage(steps,stage),first=list[0],last=list[list.length-1];
      var known=function(s){return s&&!s.unknown;};
      var out=known(last)?show(last.rateOut):DASH,inn=known(first)?show(first.rateIn):DASH;
      var isC=list.some(function(s){return s&&s.isConstraint;}),cls=!list.length?'ex-p-unknown':stale?'ex-p-stale':isC?'ex-p-constraint':'ex-p-ok';
      var chips=list.map(function(s){var st=stateOf(s);return '<li aria-label="'+esc(nn(s.n)+' '+txt(s.name)+', '+txt(s.method)+', '+WORD[st])+'" data-ex-step="'+esc(s.id)+'" data-ex-state="'+st+'">'+sq(st)+'<span><span class="ex-n">'+nn(s.n)+'</span>'+esc(txt(s.name))+'</span><span class="ex-m">'+esc(txt(s.method))+'</span></li>';}).join('');
      return '<section class="ex-plate '+cls+'" data-ex-stage="'+stage+'" aria-label="'+esc(stage+', '+(out===DASH?'rate unknown':out+' jobs per hour out, '+inn+' per hour in')+(isC?', CONSTRAINT':'')+(stale?', STALE':''))+'">'+
        '<div class="ex-plate-head"><span class="ex-label">'+stage+'</span>'+(isC?'<span class="ex-badge ex-badge-red">CONSTRAINT</span>':'')+(stale?'<span class="ex-badge ex-badge-stale">STALE</span>':'')+'</div>'+
        '<div class="ex-kpi-row"><div><div class="ex-kpi">'+out+'</div><span class="ex-unit">JOBS/H OUT</span></div><span class="ex-in">IN '+inn+'/H</span></div>'+
        '<ul class="ex-chips">'+chips+'</ul></section>';
    }
    function queue(stage){
      var s=byStage(steps,stage)[0];
      if(!s||s.unknown||!num(s.queue)||!num(s.queueDeltaPerHour))return '<div class="ex-queue" data-ex-queue="'+stage+'" aria-label="Queue unknown"><span class="ex-label">QUEUE</span><span class="ex-qv">'+DASH+'</span><span class="ex-qd">UNKNOWN</span><span class="ex-arrow" aria-hidden="true">→</span></div>';
      var grow=s.queueTrend==='GROWING',d=s.queueDeltaPerHour;
      return '<div class="ex-queue'+(grow?' ex-grow':'')+'" data-ex-queue="'+stage+'" data-ex-step="'+esc(s.id)+'" data-ex-trend="'+esc(s.queueTrend)+'" aria-label="'+esc('Queue '+s.queue+', '+(grow?'GROWING, up '+d+' per hour':'STEADY'))+'"><span class="ex-label">QUEUE</span><span class="ex-qv">'+s.queue+'</span><span class="ex-qd">'+(d>=0?'+':'')+d+'/h</span><span class="ex-qd">'+(grow?'▲ GROWING':'STEADY')+'</span><span class="ex-arrow" aria-hidden="true">→</span></div>';
    }
    var enr=byStage(steps,'ENRICHMENT'),lastE=enr[enr.length-1],scored=lastE&&!lastE.unknown?show(lastE.rateOut):DASH;
    var rd=r.readyForDecision||{},hasReady=!!r.readyForDecision;
    var ready='<section class="ex-plate '+(stale?'ex-p-stale':hasReady?'ex-p-ready':'ex-p-unknown')+'" data-ex-ready aria-label="'+esc('READY FOR DECISION, '+(num(rd.count)?rd.count+' jobs waiting on you':'count unknown')+(stale?', STALE':''))+'">'+
      '<div class="ex-plate-head"><span class="ex-label">READY FOR DECISION</span>'+(stale?'<span class="ex-badge ex-badge-stale">STALE</span>':'')+'</div>'+
      '<div class="ex-kpi-row"><div><div class="ex-kpi">'+show(rd.count)+'</div><span class="ex-unit">JOBS WAITING ON YOU</span></div></div>'+
      '<ul class="ex-ready-rows"><li><span>Applied</span><b>'+show(rd.applied)+'</b></li><li><span>Declined</span><b>'+show(rd.declined)+'</b></li></ul>'+
      '<button type="button" class="ex-btn" data-go="pipeline" data-preset="DECISION_READY"'+(hasReady?'':' disabled')+'>VIEW WAITING JOBS</button></section>';
    var scoredBox='<div class="ex-queue" data-ex-scored aria-label="'+esc(scored===DASH?'Scored rate unknown':scored+' per hour scored')+'"><span class="ex-qv">'+scored+(scored===DASH?'':'/h')+'</span><span class="ex-label">SCORED</span><span class="ex-arrow" aria-hidden="true">→</span></div>';
    var w=r.writer||{},rate=num(w.ratePerHour)?w.ratePerHour+' ROWS/H SAVED':DASH+' ROWS/H';
    var writer='<div class="ex-writer'+(stale?' ex-w-stale':'')+'" data-ex-writer aria-label="'+esc('Writer, saves rows, not a stage, '+(num(w.ratePerHour)?w.ratePerHour+' rows per hour saved':'rate unknown'))+'"><span class="ex-label">WRITER - SAVES ROWS, NOT A STAGE</span><span class="ex-label ex-strong">'+rate+'</span><span class="ex-key"><span class="ex-k-script">SCRIPT</span><span class="ex-k-ai">AI</span></span></div>';
    var foot='<p class="ex-foot">The queue between boxes is jobs waiting for the next stage, and ▲ in red means it is growing. Only one red: the first step that moves slower than what feeds it. Ready for decision is the work waiting on you and sits outside the constraint check. A missed run or a failure turns its engine row red.</p>';
    return banner(r)+'<div class="ex-flow">'+plate('DISCOVERY')+queue('INTAKE')+plate('INTAKE')+queue('ENRICHMENT')+plate('ENRICHMENT')+scoredBox+ready+'</div>'+writer+foot;
  }

  /* ---------- Steps ---------- */
  function steps(r){
    var list=r.steps||[];
    var legend='<div class="ex-legend" aria-label="Legend: OK, DEGRADED, CONSTRAINT, NOT NEEDED, IDLE">'+['ok','degraded','constraint','not_needed','idle'].map(function(s){return '<span>'+sq(s)+WORD[s]+'</span>';}).join('')+'</div>';
    var head='<div class="ex-steps-head"><span class="ex-label ex-strong">'+(list.length?list.length+' ':'')+'STEPS — CURRENT STATE</span>'+legend+'</div>';
    var groups=groupsOf(list).map(function(g){
      var items=g.steps.map(function(s){var st=stateOf(s);return '<li data-ex-step="'+esc(s&&s.id)+'" data-ex-state="'+st+'" aria-label="'+esc(nn(s&&s.n)+' '+txt(s&&s.name)+', '+WORD[st]+(s&&typeof s.result==='string'?', '+s.result:''))+'"><span class="ex-big ex-s-'+st+'">'+nn(s&&s.n)+'</span><span class="ex-name">'+esc(txt(s&&s.name))+'</span></li>';}).join('');
      return '<div class="ex-stage-group"><span class="ex-label">'+esc(g.stage)+'</span><ul class="ex-squares">'+(items||'<li class="ex-none">'+DASH+'</li>')+'</ul></div>';
    }).join('');
    return banner(r)+head+'<div class="ex-stage-groups'+(r.status==='stale'?' ex-muted':'')+'">'+groups+'</div>';
  }

  /* ---------- Engine health ---------- */
  function resultCell(s,st){var red=st==='constraint'||st==='failed'||st==='missed',amber=st==='degraded';return '<span class="ex-res'+(red?' ex-red':amber?' ex-amber':'')+'">'+sq(st)+esc(txt(s.result))+'<span class="ex-sr">, '+WORD[st]+'</span></span>';}
  function summary(list){
    var c=function(st){return list.filter(function(s){return stateOf(s)===st;}).length;};
    var parts=['<span class="ex-green">'+c('ok')+' OK</span>','<span class="ex-amber">'+c('degraded')+' DEGRADED</span>','<span class="ex-red">'+c('constraint')+' CONSTRAINT</span>','<span'+(c('failed')?' class="ex-red"':'')+'>'+c('failed')+' FAILED</span>','<span'+(c('missed')?' class="ex-red"':'')+'>'+c('missed')+' MISSED RUNS</span>'];
    if(c('idle'))parts.push('<span>'+c('idle')+' IDLE</span>');
    if(c('unknown'))parts.push('<span>'+c('unknown')+' UNKNOWN</span>');
    return '<span class="ex-summary">'+parts.join(' · ')+'</span>';
  }
  function health(r){
    var list=r.steps||[],asOf=r.asOf;
    var head='<div class="ex-health-head"><span class="ex-label ex-strong">ENGINE HEALTH · SCRIPTS AND AUTOMATIONS</span>'+(list.length?summary(list):'')+'</div>';
    if(!list.length)return banner(r)+head+'<div class="ex-empty-plate" aria-label="No steps">'+DASH+'</div>';
    var tint=function(st){return st==='constraint'||st==='failed'||st==='missed'?' ex-r-red':st==='degraded'?' ex-r-amber':'';};
    var w=r.writer,writerRow=w?{name:'Writer',runsAs:DASH,method:'SAVES ROWS',schedule:DASH,lastRunAt:w.lastWriteAt,result:num(w.ratePerHour)?w.ratePerHour+' rows/h':DASH,nextRunAt:null}:null;
    function row(s){var st=stateOf(s);return '<tr class="'+tint(st).trim()+'" data-ex-step="'+esc(s.id)+'" data-ex-state="'+st+'"><td><span class="ex-n">'+nn(s.n)+'</span> '+esc(txt(s.name))+'</td><td class="ex-mono">'+esc(txt(s.runsAs))+'</td><td class="ex-mono">'+esc(txt(s.method))+'</td><td class="ex-mono">'+esc(txt(s.schedule))+'</td><td class="ex-mono">'+when(s.lastRunAt,asOf)+'</td><td>'+resultCell(s,st)+'</td><td class="ex-mono">'+when(s.nextRunAt,asOf)+'</td></tr>';}
    function writerTr(){return '<tr data-ex-writer><td>'+esc(writerRow.name)+'</td><td class="ex-mono">'+DASH+'</td><td class="ex-mono">'+writerRow.method+'</td><td class="ex-mono">'+DASH+'</td><td class="ex-mono">'+when(writerRow.lastRunAt,asOf)+'</td><td><span class="ex-res">'+esc(writerRow.result)+'</span></td><td class="ex-mono">'+DASH+'</td></tr>';}
    function card(s){var st=stateOf(s),cc=st==='constraint'||st==='failed'||st==='missed'?'ex-c-red':st==='degraded'?'ex-c-degraded':st==='ok'?'ex-c-ok':'ex-c-plain';return '<article class="ex-card '+cc+'" data-ex-step="'+esc(s.id)+'" data-ex-state="'+st+'" aria-label="'+esc(nn(s.n)+' '+txt(s.name)+', '+WORD[st]+', '+txt(s.result))+'"><span class="ex-t"><span class="ex-n">'+nn(s.n)+'</span> '+esc(txt(s.name))+'</span><span class="ex-meth">'+esc(txt(s.method))+'</span><span class="ex-r">'+resultCell(s,st)+'</span><span class="ex-lt">'+esc(txt(s.runsAs)+' · '+txt(s.schedule)+' · last '+when(s.lastRunAt,asOf)+' · next '+when(s.nextRunAt,asOf))+'</span></article>';}
    function writerCard(){return '<article class="ex-card ex-c-neutral" data-ex-writer aria-label="'+esc('Writer, '+writerRow.result)+'"><span class="ex-t">Writer</span><span class="ex-meth">SAVES ROWS</span><span class="ex-r"><span class="ex-res">'+esc(writerRow.result)+'</span></span><span class="ex-lt">'+esc('last '+when(writerRow.lastRunAt,asOf))+'</span></article>';}
    var gs=groupsOf(list);
    var table='<table class="ex-health"><thead><tr>'+['ENGINE','RUNS AS','METHOD','SCHEDULE','LAST RUN','RESULT','NEXT'].map(function(h){return '<th scope="col">'+h+'</th>';}).join('')+'</tr></thead><tbody>'+
      gs.map(function(g){return '<tr class="ex-group"><td colspan="7">'+esc(g.stage)+'</td></tr>'+g.steps.map(row).join('');}).join('')+
      (writerRow?'<tr class="ex-group"><td colspan="7">OUTSIDE THE FLOW</td></tr>'+writerTr():'')+'</tbody></table>';
    var cards='<div class="ex-cards">'+gs.map(function(g){return '<p class="ex-group">'+esc(g.stage)+'</p>'+g.steps.map(card).join('');}).join('')+(writerRow?'<p class="ex-group">OUTSIDE THE FLOW</p>'+writerCard():'')+'</div>';
    return banner(r)+head+'<div class="ex-health-wrap'+(r.status==='stale'?' ex-muted':'')+'">'+table+cards+'</div>';
  }

  var PAGES={constraints:constraints,steps:steps,'engine-health':health};
  /* Pure render of one page from an evaluate() result (or the API body). Unit tests call this; no network. */
  function render(tab,result){
    var r=result&&typeof result==='object'&&typeof result.status==='string'?result:errorResult();
    var page=PAGES[tab]||constraints;
    return '<div class="ex-root ex-'+(PAGES[tab]?tab:'constraints')+' ex-st-'+esc(r.status)+'" data-ex-page="'+esc(tab)+'" data-ex-status="'+esc(r.status)+'">'+page(r)+'</div>';
  }
  /* The error state comes from evaluate() itself, so the copy is never written here. */
  function errorResult(){var E=engine();return E?E.evaluate(null,Date.now()):{status:'error',copy:'',steps:[],constraint:null,growingQueues:[],writer:null,readyForDecision:null};}

  /* fixture=mockup in the query loads the committed populated fixture and evaluates it at AT + 5 min. Dev-only; never the default. */
  function isFixture(loc){try{return new URLSearchParams((loc&&loc.search)||'').get('fixture')==='mockup';}catch(e){return false;}}
  function load(opts){
    opts=opts||{};var f=opts.fetch||(typeof fetch==='function'?fetch.bind(typeof self!=='undefined'?self:null):null),E=opts.evaluate?{evaluate:opts.evaluate}:engine();
    if(!f)return Promise.resolve(errorResult());
    if(isFixture(opts.location||(typeof location!=='undefined'?location:null))){
      return f(FIXTURE,{cache:'no-store'}).then(function(res){if(!res.ok)throw Error('fixture '+res.status);return res.json();}).then(function(env){return E.evaluate(env,FIXTURE_NOW);}).catch(function(){return errorResult();});
    }
    return f(API,{cache:'no-store',headers:{Accept:'application/json'}}).then(function(res){return res.json();}).then(function(body){return body&&typeof body==='object'&&typeof body.status==='string'?body:errorResult();}).catch(function(){return errorResult();});
  }

  var last=null,timer=null;
  /* Called from pipeline.html switchTab for the three routes. opts.mount is #view-<route>; opts.go(route, preset) is the app's own route handler. */
  function open(tab,opts){
    opts=opts||{};var mount=opts.mount;if(!mount)return Promise.resolve(null);
    if(!mount.dataset.exBound){mount.dataset.exBound='1';mount.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.ex-root [data-go]');if(!b||typeof opts.go!=='function')return;opts.go(b.getAttribute('data-go'),b.getAttribute('data-preset'));});}
    if(last)mount.innerHTML=render(tab,last);else if(!mount.firstChild)mount.innerHTML='<div class="ex-root" aria-busy="true"></div>';
    if(timer)clearInterval(timer);
    timer=setInterval(function(){if(!mount.classList.contains('on')){clearInterval(timer);timer=null;return;}refresh();},60000);
    function refresh(){return load(opts).then(function(r){last=r;mount.innerHTML=render(tab,r);return r;});}
    return refresh();
  }

  /* The route a pipeline.html hash ({"t":"steps",...}) names, when it is one of these three pages; null otherwise. The phone
     shell uses it so a shared link opens the page, not Decide. */
  function routeFromHash(hash){try{var h=String(hash||'');if(h.charAt(0)==='#')h=h.slice(1);if(!h)return null;var o=JSON.parse(decodeURIComponent(h));return o&&ROUTES.indexOf(o.t)>=0?o.t:null;}catch(e){return null;}}
  /* Labels for the phone More sheet, in the order of the desktop section tabs. */
  var PHONE_MORE=[['constraints','Constraints','The one step that limits the flow'],['steps','Steps','All 19 steps and their state'],['engine-health','Engine health','Scripts and automations, last and next run']];

  return {ROUTES:ROUTES,API:API,FIXTURE:FIXTURE,FIXTURE_NOW:FIXTURE_NOW,PHONE_MORE:PHONE_MORE,render:render,load:load,open:open,stateOf:stateOf,routeFromHash:routeFromHash,asOfEt:asOfEt};
});
