/* Desktop list/map split: device preference, independent of canonical job data.
   Two arrangements share one handle. Stacked (list over map) splits rows; wide desktops (PE build step 6, PDF p40)
   put the list, the map and the drawer side by side and the same handle splits columns. Each arrangement keeps its
   own saved ratio (options.load(axis) / options.save(ratio, axis)). */
(function(root){
  'use strict';
  var WIDE='(min-width:2300px) and (min-height:900px)';
  var DEFAULTS={y:.55,x:1112/1913};   // x: golden table 1112 / (table 1112 + map 801), tokens.css --pe-col-table / --pe-col-map
  function create(options){
    var view=options.view,handle=options.handle,frame=0,drag=null,axis=null,preferred=DEFAULTS.y;
    function desktop(){return matchMedia('(min-width:981px), (min-width:761px) and (pointer:fine)').matches}
    function wantAxis(){return desktop()&&matchMedia(WIDE).matches?'x':'y'}
    function clampSaved(v,a){return typeof v==='number'&&isFinite(v)?Math.max(.2,Math.min(.85,v)):DEFAULTS[a]}
    function loadAxis(a){var v=null;try{v=options.load(a)}catch(e){}return clampSaved(v,a)}
    function setAxis(a){if(a===axis)return;axis=a;preferred=loadAxis(a);document.body.classList.toggle('pe-three-col',a==='x');
      handle.setAttribute('aria-orientation',a==='x'?'vertical':'horizontal');
      handle.setAttribute('aria-label',a==='x'?'Resize job list and map (side by side)':'Resize job list and map');
      handle.title=a==='x'?'Drag to resize. Left / right arrow keys adjust; double-click restores the default split.':'Drag to resize. Arrow keys adjust; double-click restores 55% list / 45% map.';}
    function active(){return desktop()&&view.classList.contains('on')&&!document.body.classList.contains('map-full');}
    function geometry(){var table=view.querySelector('#worksplit'),tb=table.getBoundingClientRect();
      if(axis==='x'){var map=view.querySelector('#job-map-card'),mb=map?map.getBoundingClientRect():tb,hw=handle.getBoundingClientRect().width||16;
        var totalX=Math.max(1,mb.right-tb.left-hw),minX=Math.min(.5,760/totalX),maxX=Math.max(minX,1-480/totalX);   // table >= 760 px, map >= 480 px
        return {start:tb.left+hw/2,total:totalX,min:Math.max(.2,minX),max:Math.min(.85,maxX)};}
      var box=view.getBoundingClientRect(),style=getComputedStyle(view);
      var top=tb.top,total=box.bottom-parseFloat(style.paddingBottom)-top-10;
      var min=.25,max=.8;if(total>=390){min=Math.max(min,160/total);max=Math.min(max,230/total>1?min:1-230/total);}
      if(max<min){min=.25;max=.8;}return {start:top,total:Math.max(1,total),min:min,max:max};}
    function apply(){frame=0;setAxis(wantAxis());if(!active())return;var g=geometry(),ratio=Math.max(g.min,Math.min(g.max,preferred));
      view.style.setProperty('--list-track',ratio+'fr');view.style.setProperty('--map-track',(1-ratio)+'fr');
      var percent=Math.round(ratio*100);handle.setAttribute('aria-valuemin',Math.ceil(g.min*100));handle.setAttribute('aria-valuemax',Math.floor(g.max*100));handle.setAttribute('aria-valuenow',percent);
      handle.setAttribute('aria-valuetext','List '+percent+'%, map '+(100-percent)+'%');handle.dataset.split=percent+'% list / '+(100-percent)+'% map';
      if(options.onResize)options.onResize();}
    function sync(){if(!frame)frame=requestAnimationFrame(apply);}
    function persist(){try{options.save(preferred,axis);}catch(e){}}
    function finish(event,canceled){if(!drag||event&&event.pointerId!==drag.id)return;var id=drag.id;if(canceled)preferred=drag.before;drag=null;
      document.body.classList.remove('pane-resizing');if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);if(!canceled)persist();sync();}
    handle.addEventListener('pointerdown',function(e){if(e.button!==0||!active())return;e.preventDefault();drag={id:e.pointerId,before:preferred};handle.setPointerCapture(e.pointerId);handle.focus({preventScroll:true});document.body.classList.add('pane-resizing');});
    handle.addEventListener('pointermove',function(e){if(!drag||e.pointerId!==drag.id)return;var g=geometry(),pos=axis==='x'?e.clientX:e.clientY;preferred=Math.max(g.min,Math.min(g.max,(pos-g.start)/g.total));sync();});
    handle.addEventListener('pointerup',function(e){finish(e,false);});handle.addEventListener('pointercancel',function(e){finish(e,true);});handle.addEventListener('lostpointercapture',function(e){finish(e,true);});
    handle.addEventListener('dblclick',function(){preferred=DEFAULTS[axis];persist();sync();});
    handle.addEventListener('keydown',function(e){if(!active())return;var g=geometry(),current=Math.max(g.min,Math.min(g.max,preferred)),step=e.shiftKey ? .05 : .02;
      var less=axis==='x'?'ArrowLeft':'ArrowUp',more=axis==='x'?'ArrowRight':'ArrowDown';
      if(e.key===less)preferred=Math.max(g.min,current-step);else if(e.key===more)preferred=Math.min(g.max,current+step);else if(e.key==='Home')preferred=g.min;else if(e.key==='End')preferred=g.max;else return;
      e.preventDefault();persist();sync();});
    var observer=new ResizeObserver(sync);observer.observe(view);observer.observe(view.querySelector('#worksplit'));
    // Content selections redraw the dashboard; only geometry changes resize the panes.
    window.addEventListener('resize',sync);setAxis(wantAxis());sync();return {sync:sync,axis:function(){return axis}};
  }
  /* REV-077 (Tim 21:26 ET): the map / drawer gutter on wide desktops sets the drawer width in px (--work-track).
     Default the golden --pe-col-work (508); range 480 px (decision row still fits on one line) up to what keeps the map
     >= 480 px and the table >= 760 px. Saved per device; double-click restores the default; arrows +/-16 px (Shift 48). */
  var WORK_DEFAULT=508,WORK_MIN=480;
  function createWork(options){
    var view=options.view,handle=options.handle,frame=0,drag=null,preferred=null;
    function wide(){return matchMedia('(min-width:981px), (min-width:761px) and (pointer:fine)').matches&&matchMedia(WIDE).matches}
    function active(){return wide()&&view.classList.contains('on')&&!document.body.classList.contains('map-full');}
    function saved(){var v=null;try{v=options.load()}catch(e){}return typeof v==='number'&&isFinite(v)&&v>0?v:WORK_DEFAULT}
    function range(){var vb=view.getBoundingClientRect(),cs=getComputedStyle(view),inner=vb.width-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),gut=2*(handle.getBoundingClientRect().width||16);
      return {min:WORK_MIN,max:Math.max(WORK_MIN,Math.floor(inner-gut-760-480))};}
    function apply(){frame=0;if(!active())return;var g=range(),w=Math.round(Math.max(g.min,Math.min(g.max,preferred==null?saved():preferred)));
      view.style.setProperty('--work-track',w+'px');handle.setAttribute('aria-valuemin',g.min);handle.setAttribute('aria-valuemax',g.max);handle.setAttribute('aria-valuenow',w);
      handle.setAttribute('aria-valuetext','Job drawer '+w+' px');handle.dataset.split='drawer '+w+' px';if(options.onResize)options.onResize();}
    function sync(){if(!frame)frame=requestAnimationFrame(apply);}
    function persist(){try{options.save(preferred)}catch(e){}}
    function clampNow(v){var g=range();return Math.max(g.min,Math.min(g.max,v));}
    function finish(event,canceled){if(!drag||event&&event.pointerId!==drag.id)return;var id=drag.id;if(canceled)preferred=drag.before;drag=null;
      document.body.classList.remove('pane-resizing');if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);if(!canceled)persist();sync();}
    handle.addEventListener('pointerdown',function(e){if(e.button!==0||!active())return;e.preventDefault();preferred=preferred==null?saved():preferred;drag={id:e.pointerId,before:preferred,x:e.clientX,w:clampNow(preferred)};
      handle.setPointerCapture(e.pointerId);handle.focus({preventScroll:true});document.body.classList.add('pane-resizing');});
    handle.addEventListener('pointermove',function(e){if(!drag||e.pointerId!==drag.id)return;preferred=clampNow(drag.w-(e.clientX-drag.x));sync();});   // drag left widens the drawer
    handle.addEventListener('pointerup',function(e){finish(e,false);});handle.addEventListener('pointercancel',function(e){finish(e,true);});handle.addEventListener('lostpointercapture',function(e){finish(e,true);});
    handle.addEventListener('dblclick',function(){preferred=WORK_DEFAULT;persist();sync();});
    handle.addEventListener('keydown',function(e){if(!active())return;var cur=clampNow(preferred==null?saved():preferred),step=e.shiftKey?48:16;
      if(e.key==='ArrowLeft')preferred=clampNow(cur+step);else if(e.key==='ArrowRight')preferred=clampNow(cur-step);else if(e.key==='Home')preferred=range().max;else if(e.key==='End')preferred=WORK_MIN;else return;
      e.preventDefault();persist();sync();});
    new ResizeObserver(sync).observe(view);window.addEventListener('resize',sync);sync();return {sync:sync};
  }
  root.PipelinePaneSplit={create:create,createWork:createWork,WIDE:WIDE,DEFAULTS:DEFAULTS,WORK_DEFAULT:WORK_DEFAULT,WORK_MIN:WORK_MIN};
})(window);

/* Phase 5 workspace layout foundation.
   Presentation-only: saves local panel transforms/sizes; never mutates job data, Writer, scoring, rules, or master state. */
(function(root){
  'use strict';
  var KEY='px.workspace.layouts.v1',EDIT='px.workspace.editing',state={editing:false,locked:false,store:null,drag:null};
  function $(id){return document.getElementById(id)}
  function desktop(){return matchMedia('(min-width:981px), (min-width:761px) and (pointer:fine)').matches}
  function device(){return desktop()?'desktop':(innerWidth>innerHeight?'phone-landscape':'phone-portrait')}
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{"views":{}}')}catch(e){return {views:{}}}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state.store))}catch(e){}}
  function view(){return document.querySelector('.view.on')}
  function viewId(v){return v&&v.id||'unknown'}
  function keyFor(el,i){return el.id||el.getAttribute('data-layout-key')||((el.className||el.tagName).toString().replace(/\s+/g,'.')+'-'+i)}
  function viewRecord(v){state.store=state.store||load();var id=viewId(v),d=device();state.store.views[id]=state.store.views[id]||{};state.store.views[id][d]=state.store.views[id][d]||{locked:false,panels:{}};return state.store.views[id][d]}
  function targets(v){if(!v)return[];var list=[].slice.call(v.querySelectorAll('#job-map-card,#worksplit,#drawer,.dash-card,.detail-card,.chart-card,.panel,.docbox,.doc-editor,.ops-card,.ops-kpi,.ops-priority,.ops-stage,.inc-work-item'));
    return list.filter(function(el){return el.offsetParent!==null&&!el.closest('#pop,#sheet,#bottombar,header,#rail')});}
  function injectCss(){if($('workspace-layout-css'))return;var css=document.createElement('style');css.id='workspace-layout-css';css.textContent='\n#workspace-layout-toolbar{position:fixed;right:14px;bottom:calc(78px + env(safe-area-inset-bottom));z-index:120;display:flex;gap:6px;align-items:center;padding:6px;background:rgba(3,3,3,.92);border:1px solid var(--line2);box-shadow:0 14px 40px #000;border-radius:6px}\n#workspace-layout-toolbar button{min-height:30px;padding:4px 8px;font:10.5px var(--mono);letter-spacing:.8px}\n#workspace-layout-toolbar .ws-mode{color:var(--dim);font:10px var(--mono);letter-spacing:1px;text-transform:uppercase;padding:0 4px}\n#workspace-layout-toolbar.ws-docked{order:7;position:static;z-index:auto;padding:0;gap:6px;background:none;border:0;box-shadow:none;border-radius:0;flex:none}\n#workspace-layout-toolbar.ws-docked button{min-height:34px;padding:0 10px;font:11px var(--sans);letter-spacing:normal;background:transparent;border:1px solid var(--forge-line,var(--line2));color:var(--forge-dim,var(--dim));opacity:.72}\n#workspace-layout-toolbar.ws-docked button:hover,#workspace-layout-toolbar.ws-docked button:focus-visible,body.workspace-layout-edit #workspace-layout-toolbar.ws-docked [data-ws-toggle]{opacity:1}\nbody.workspace-layout-edit #workspace-layout-toolbar.ws-docked [data-ws-toggle]{border-color:var(--focus);color:#fff}\n#workspace-layout-toolbar.ws-docked .ws-mode{display:none}\nbody.workspace-layout-edit header{flex-wrap:wrap;row-gap:6px;padding-top:6px;padding-bottom:6px}\nbody:not(.workspace-layout-edit) #workspace-layout-toolbar .ws-mode,body:not(.workspace-layout-edit) #workspace-layout-toolbar [data-ws-lock],body:not(.workspace-layout-edit) #workspace-layout-toolbar [data-ws-save],body:not(.workspace-layout-edit) #workspace-layout-toolbar [data-ws-reset]{display:none}\nbody.workspace-layout-edit .layout-panel{outline:1px dashed rgba(57,255,136,.42);outline-offset:-2px;position:relative!important;transition:outline-color 160ms var(--ease)}\nbody.workspace-layout-edit .layout-panel.layout-locked{outline-color:rgba(255,207,77,.55)}\n.layout-panel .layout-grip,.layout-panel .layout-resize{display:none}\nbody.workspace-layout-edit .layout-panel>.layout-grip{display:block;position:absolute;left:6px;top:6px;z-index:20;min-width:52px;min-height:22px;padding:3px 7px;background:#050505;border:1px solid var(--focus);color:#fff;font:10px var(--mono);letter-spacing:1px;cursor:move;user-select:none;text-transform:uppercase;box-shadow:0 8px 24px #000b}\nbody.workspace-layout-edit .layout-panel.layout-locked>.layout-grip{border-color:var(--caution);color:var(--caution);cursor:not-allowed}\nbody.workspace-layout-edit .layout-panel>.layout-resize{display:block;position:absolute;right:4px;bottom:4px;z-index:20;width:16px;height:16px;border-right:2px solid var(--focus);border-bottom:2px solid var(--focus);cursor:nwse-resize}\nbody.workspace-layout-edit .layout-panel.layout-locked>.layout-resize{border-color:var(--caution);cursor:not-allowed}\nbody.workspace-layout-edit.workspace-dragging{cursor:grabbing!important}\n@media(max-width:760px),(pointer:coarse) and (max-width:980px){#workspace-layout-toolbar{left:8px;right:8px;bottom:calc(70px + env(safe-area-inset-bottom));justify-content:center;flex-wrap:wrap}.layout-panel>.layout-resize{display:none!important}}\n';document.head.appendChild(css)}
  function panelRecord(v,el,i){var rec=viewRecord(v),k=keyFor(el,i);rec.panels[k]=rec.panels[k]||{};return rec.panels[k]}
  // Every DOM write below is skipped when the value is already in place: unconditional writes queue mutation records,
  // and the body observer turns those into another refresh (the 2026-10-11 layout-mode lock-in).
  function applyPanel(v,el,i){var r=panelRecord(v,el,i),k=keyFor(el,i);if(!el.classList.contains('layout-panel'))el.classList.add('layout-panel');if(el.dataset.layoutKey!==k)el.dataset.layoutKey=k;el.classList.toggle('layout-locked',!!r.locked);
    if(r.x||r.y)el.style.transform='translate('+Math.round(r.x||0)+'px,'+Math.round(r.y||0)+'px)';
    if(r.w)el.style.width=Math.max(160,Math.round(r.w))+'px';if(r.h)el.style.height=Math.max(90,Math.round(r.h))+'px';
    if(!el.querySelector(':scope>.layout-grip')){var g=document.createElement('span');g.className='layout-grip';g.textContent='MOVE';el.appendChild(g)}
    if(!el.querySelector(':scope>.layout-resize')){var z=document.createElement('span');z.className='layout-resize';el.appendChild(z)} }
  function refresh(){injectCss();var v=view();if(!v)return;var rec=viewRecord(v);state.locked=!!rec.locked;targets(v).forEach(function(el,i){applyPanel(v,el,i)});document.body.classList.toggle('workspace-layout-edit',state.editing);document.body.classList.toggle('workspace-layout-locked',state.locked);toolbar();}
  // Layout edit mode is a session state: it is never written to storage and never restored on load.
  function setEditing(on){state.editing=!!on;try{localStorage.removeItem(EDIT)}catch(e){}refresh()}
  function setText(el,t){if(el&&el.textContent!==t)el.textContent=t}
  // The toolbar is built once and only its labels change. Rebuilding it with innerHTML on every refresh replaced the
  // buttons each frame while editing, so a click on Done never landed on the same element it started on.
  function toolbar(){var bar=$('workspace-layout-toolbar');if(!desktop()&&!state.editing){if(bar)bar.remove();return;}
    if(!bar){bar=document.createElement('div');bar.id='workspace-layout-toolbar';bar.innerHTML='<span class="ws-mode"></span><button data-ws-toggle></button><button data-ws-lock></button><button data-ws-save>Save</button><button data-ws-reset>Reset view</button>';
      bar.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var v=view(),rec;
        if(b.hasAttribute('data-ws-toggle'))setEditing(!state.editing);
        else if(b.hasAttribute('data-ws-lock')){rec=viewRecord(v);rec.locked=!rec.locked;save();refresh()}
        else if(b.hasAttribute('data-ws-save')){save();refresh()}
        else if(b.hasAttribute('data-ws-reset')){rec=viewRecord(v);rec.panels={};rec.locked=false;targets(v).forEach(function(el){el.style.transform='';el.style.width='';el.style.height='';el.classList.remove('layout-locked')});save();refresh()}});
      document.body.appendChild(bar)}
    // Docked in the header beside Compact so it never covers panel content (it floated over the job drawer's
    // Open posting / Copy packet buttons). Moves are guarded so an unchanged position queues no mutation.
    var anchor=$('density-toggle'),dock=desktop()&&anchor&&anchor.parentElement;
    if(dock){if(anchor.nextElementSibling!==bar)anchor.after(bar);if(!bar.classList.contains('ws-docked'))bar.classList.add('ws-docked');}
    else{if(bar.parentElement!==document.body)document.body.appendChild(bar);if(bar.classList.contains('ws-docked'))bar.classList.remove('ws-docked');}
    var v=view(),rec=v?viewRecord(v):{locked:false};
    setText(bar.querySelector('.ws-mode'),state.editing?'LAYOUT EDIT':'LAYOUT');setText(bar.querySelector('[data-ws-toggle]'),state.editing?'Done':'Layout');setText(bar.querySelector('[data-ws-lock]'),rec.locked?'Unlock view':'Lock view');}
  function start(e,kind){if(!state.editing||!desktop())return;var el=e.target.closest('.layout-panel'),v=view();if(!el||!v)return;var panels=targets(v),i=panels.indexOf(el),r=panelRecord(v,el,i);if(r.locked||viewRecord(v).locked)return;e.preventDefault();e.stopPropagation();var box=el.getBoundingClientRect();state.drag={id:e.pointerId,kind:kind,el:el,v:v,i:i,r:r,sx:e.clientX,sy:e.clientY,x:r.x||0,y:r.y||0,w:box.width,h:box.height};e.target.setPointerCapture(e.pointerId);document.body.classList.add('workspace-dragging')}
  document.addEventListener('pointerdown',function(e){if(e.target.classList.contains('layout-grip'))start(e,'move');else if(e.target.classList.contains('layout-resize'))start(e,'resize')},true);
  document.addEventListener('pointermove',function(e){var d=state.drag;if(!d||e.pointerId!==d.id)return;var dx=e.clientX-d.sx,dy=e.clientY-d.sy;if(d.kind==='move'){d.r.x=d.x+dx;d.r.y=d.y+dy;d.el.style.transform='translate('+Math.round(d.r.x)+'px,'+Math.round(d.r.y)+'px)'}else{d.r.w=Math.max(160,d.w+dx);d.r.h=Math.max(90,d.h+dy);d.el.style.width=Math.round(d.r.w)+'px';d.el.style.height=Math.round(d.r.h)+'px'}});
  function end(e){var d=state.drag;if(!d||e.pointerId!==d.id)return;state.drag=null;document.body.classList.remove('workspace-dragging');save()}
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
  function own(n){n=n&&n.nodeType===1?n:n&&n.parentElement;return !!(n&&n.closest&&n.closest('#workspace-layout-toolbar,.layout-grip,.layout-resize'))}
  function boot(){state.store=load();state.editing=false;try{localStorage.removeItem(EDIT)}catch(e){}refresh();var pending=false;
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&state.editing)setEditing(false)});
    var obs=new MutationObserver(function(recs){if(!state.editing||pending)return;for(var i=0;i<recs.length;i++){if(!own(recs[i].target)){pending=true;requestAnimationFrame(function(){pending=false;refresh()});return}}});obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});window.addEventListener('resize',function(){requestAnimationFrame(refresh)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  root.PipelineWorkspaceLayout={refresh:refresh,load:load};
})(window);
