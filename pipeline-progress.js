/* Progress reflects requests, verified counts, and the actual Writer refresh deadline. */
(function(root){
  'use strict';
  var current=null,records=new Map(),clock={enabled:false,busy:false,deadline:0},frame=0;
  function escape(value){return String(value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}
  function locator(control){
    if(typeof control==='string')return control;
    if(!control)return '';
    if(control.id)return '#'+CSS.escape(control.id);
    var attrs=['data-approve','data-ops-refresh','data-ops-stage','data-ops-catchup','data-ops-ack'];
    for(var i=0;i<attrs.length;i++)if(control.hasAttribute(attrs[i]))return '['+attrs[i]+'="'+CSS.escape(control.getAttribute(attrs[i]))+'"]';
    if(!control.dataset.commandKey)control.dataset.commandKey='command-'+Math.random().toString(36).slice(2);
    return '[data-command-key="'+control.dataset.commandKey+'"]';
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button');
    if(!b||b.matches('[data-go],[data-tab],[data-group-btn],[data-dtab],[role=tab],#writer-badge,#menu-btn'))return;
    var key=locator(b);current=key;setTimeout(function(){if(current===key)current=null},0);
  },true);
  document.addEventListener('submit',function(e){var b=e.submitter||e.target.querySelector('[type=submit]');current=locator(b);var key=current;setTimeout(function(){if(current===key)current=null},0);},true);
  function mount(record){
    var control=document.querySelector(record.key);if(!control)return;
    var detail=control.closest('#d-body');
    if(record.scope&&(!detail||detail.dataset.detailKey!==record.scope))return;
    if(record.node&&record.node.parentNode===control)return;
    var node=document.createElement('span');node.className='command-progress';node.innerHTML='<span class="command-track" role="progressbar"><i></i></span><span class="command-elapsed"></span>';
    control.classList.add('has-command-progress');control.appendChild(node);record.node=node;
  }
  function paint(record){
    mount(record);if(!record.node||!record.node.isConnected)return;
    var active=record.count>0,elapsed=Math.floor((Date.now()-record.started)/1000),label=active?record.label:record.waiting?'Queued · awaiting AI':record.attention?'Check result':'Response received';
    var bar=record.node.firstChild,control=record.node.parentNode;
    record.node.dataset.state=active?'active':record.waiting?'waiting':record.attention?'attention':'received';
    bar.setAttribute('aria-label',label);bar.setAttribute('aria-valuetext',label+' · '+elapsed+' seconds elapsed');bar.removeAttribute('aria-valuenow');
    record.node.lastChild.textContent=active?elapsed+'s':record.waiting?'Queued':record.attention?'Check result':'Received';
    record.node.title=label+' · '+elapsed+' seconds elapsed';
    if(active)control.setAttribute('aria-busy','true');else control.removeAttribute('aria-busy');
  }
  function clear(record){
    if(records.get(record.key)!==record)return;
    records.delete(record.key);if(record.node){var b=record.node.parentNode;record.node.remove();if(b){b.classList.remove('has-command-progress');b.removeAttribute('aria-busy')}}
  }
  function begin(control,label){
    var key=locator(control||current);if(!key)return {finish:function(){},stage:function(){}};
    var r=records.get(key);
    if(!r||!r.count){if(r)clear(r);var el=document.querySelector(key),detail=el&&el.closest('#d-body');r={key:key,count:0,started:Date.now(),attention:false,waiting:false,scope:detail&&detail.dataset.detailKey};records.set(key,r);}
    r.count++;r.label=label||'Waiting for response';paint(r);var done=false;
    return {stage:function(text){r.label=text;paint(r)},finish:function(result){if(done)return;done=true;r.count--;r.attention=r.attention||!!(result&&result.attention);r.waiting=r.waiting||!!(result&&result.waiting);paint(r);if(!r.count&&!r.waiting)setTimeout(function(){clear(r)},r.attention?6000:1400);}};
  }
  function track(promise,options){
    options=options||{};var task=begin(options.control||current||options.fallback,options.label);
    return Promise.resolve(promise).then(function(j){task.finish({attention:!!j&&j.ok===false,waiting:!!options.queued&&!!j&&j.ok===true});return j},function(e){task.finish({attention:true});throw e});
  }
  function run(control,label,work){
    var task=begin(control,label),promise;
    try{promise=work(task)}catch(e){task.finish({attention:true});return Promise.reject(e)}
    return Promise.resolve(promise).then(function(j){task.finish({attention:!!j&&j.ok===false});return j},function(e){task.finish({attention:true});throw e});
  }
  function html(label,done,total,size,state){
    var known=Number.isFinite(done)&&Number.isFinite(total)&&total>0,pct=known?Math.max(0,Math.min(100,100*done/total)):null;
    return '<div class="work-progress '+escape(size||'medium')+'" data-state="'+escape(state||'active')+'"><div class="work-progress-label">'+escape(label)+(known?' · '+done+' / '+total:'')+'</div><div class="work-progress-track" role="progressbar" aria-label="'+escape(label)+'"'+(known?' aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+done+'"':'')+' aria-valuetext="'+escape(known?done+' of '+total:label+'; completion time unknown')+'"><i'+(known?' style="width:'+pct+'%"':'')+'></i></div></div>';
  }
  function paintClock(){
    var paused=document.hidden,seconds=Math.max(0,Math.ceil((clock.deadline-Date.now())/1000));
    var text=!clock.enabled?'Not connected':paused?'Refresh paused':clock.busy?'Checking…':clock.deadline?'Refresh · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'Refresh due';
    document.querySelectorAll('[data-writer-countdown]').forEach(function(el){
      var label=el.querySelector('span'),bar=el.querySelector('[role=progressbar]'),fill=bar.firstChild;
      if(label.textContent!==text)label.textContent=text;
      el.dataset.state=!clock.enabled||paused?'paused':clock.busy?'active':'countdown';
      bar.setAttribute('aria-label','Next automatic Writer status refresh');bar.setAttribute('aria-valuetext',!clock.enabled||paused||clock.busy?text:seconds+' seconds until next refresh');
      if(clock.enabled&&!paused&&!clock.busy&&clock.deadline){bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','60');bar.setAttribute('aria-valuenow',String(Math.min(60,seconds)));fill.style.width=Math.min(100,seconds/60*100)+'%';}
      else{bar.removeAttribute('aria-valuenow');fill.style.width='';}
      el.title='Writer status only. The job master refreshes separately.';
    });
  }
  function clockState(value){clock=Object.assign(clock,value);paintClock();}
  function tick(){if(document.hidden)return;paintClock();records.forEach(paint);}
  setInterval(tick,1000);document.addEventListener('visibilitychange',function(){document.body.classList.toggle('progress-paused',document.hidden);paintClock();if(!document.hidden)records.forEach(paint)});
  new MutationObserver(function(){if(frame)return;frame=requestAnimationFrame(function(){frame=0;records.forEach(function(r){if(!r.node||!r.node.isConnected)paint(r)});paintClock()})}).observe(document.body,{childList:true,subtree:true});
  root.PipelineProgress={begin:begin,track:track,run:run,html:html,clock:clockState};
})(window);
