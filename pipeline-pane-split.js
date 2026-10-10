/* Desktop list/map split: device preference, independent of canonical job data. */
(function(root){
  'use strict';
  function create(options){
    var view=options.view,handle=options.handle,frame=0,drag=null,preferred=.55;
    try{var saved=options.load();if(typeof saved==='number'&&isFinite(saved))preferred=Math.max(.25,Math.min(.8,saved));}catch(e){}
    function active(){return matchMedia('(min-width:981px), (min-width:761px) and (pointer:fine)').matches&&view.classList.contains('on')&&!document.body.classList.contains('map-full');}
    function geometry(){var table=view.querySelector('#worksplit'),box=view.getBoundingClientRect(),style=getComputedStyle(view);
      var top=table.getBoundingClientRect().top,total=box.bottom-parseFloat(style.paddingBottom)-top-10;
      var min=.25,max=.8;if(total>=390){min=Math.max(min,160/total);max=Math.min(max,230/total>1?min:1-230/total);}
      if(max<min){min=.25;max=.8;}return {top:top,total:Math.max(1,total),min:min,max:max};}
    function apply(){frame=0;if(!active())return;var g=geometry(),ratio=Math.max(g.min,Math.min(g.max,preferred));
      view.style.setProperty('--list-track',ratio+'fr');view.style.setProperty('--map-track',(1-ratio)+'fr');
      var percent=Math.round(ratio*100);handle.setAttribute('aria-valuemin',Math.ceil(g.min*100));handle.setAttribute('aria-valuemax',Math.floor(g.max*100));handle.setAttribute('aria-valuenow',percent);
      handle.setAttribute('aria-valuetext','List '+percent+'%, map '+(100-percent)+'%');handle.dataset.split=percent+'% list / '+(100-percent)+'% map';
      if(options.onResize)options.onResize();}
    function sync(){if(!frame)frame=requestAnimationFrame(apply);}
    function persist(){try{options.save(preferred);}catch(e){}}
    function finish(event,canceled){if(!drag||event&&event.pointerId!==drag.id)return;var id=drag.id;if(canceled)preferred=drag.before;drag=null;
      document.body.classList.remove('pane-resizing');if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);if(!canceled)persist();sync();}
    handle.addEventListener('pointerdown',function(e){if(e.button!==0||!active())return;e.preventDefault();drag={id:e.pointerId,before:preferred};handle.setPointerCapture(e.pointerId);handle.focus({preventScroll:true});document.body.classList.add('pane-resizing');});
    handle.addEventListener('pointermove',function(e){if(!drag||e.pointerId!==drag.id)return;var g=geometry();preferred=Math.max(g.min,Math.min(g.max,(e.clientY-g.top)/g.total));sync();});
    handle.addEventListener('pointerup',function(e){finish(e,false);});handle.addEventListener('pointercancel',function(e){finish(e,true);});handle.addEventListener('lostpointercapture',function(e){finish(e,true);});
    handle.addEventListener('dblclick',function(){preferred=.55;persist();sync();});
    handle.addEventListener('keydown',function(e){if(!active())return;var g=geometry(),current=Math.max(g.min,Math.min(g.max,preferred)),step=e.shiftKey ? .05 : .02;
      if(e.key==='ArrowUp')preferred=Math.max(g.min,current-step);else if(e.key==='ArrowDown')preferred=Math.min(g.max,current+step);else if(e.key==='Home')preferred=g.min;else if(e.key==='End')preferred=g.max;else return;
      e.preventDefault();persist();sync();});
    var observer=new ResizeObserver(sync);observer.observe(view);observer.observe(view.querySelector('#worksplit'));
    // Content selections redraw the dashboard; only geometry changes resize the panes.
    window.addEventListener('resize',sync);sync();return {sync:sync};
  }
  root.PipelinePaneSplit={create:create};
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
  function injectCss(){if($('workspace-layout-css'))return;var css=document.createElement('style');css.id='workspace-layout-css';css.textContent='\n#workspace-layout-toolbar{position:fixed;right:14px;bottom:calc(78px + env(safe-area-inset-bottom));z-index:120;display:flex;gap:6px;align-items:center;padding:6px;background:rgba(3,3,3,.92);border:1px solid var(--line2);box-shadow:0 14px 40px #000;border-radius:6px}\n#workspace-layout-toolbar button{min-height:30px;padding:4px 8px;font:10.5px var(--mono);letter-spacing:.8px}\n#workspace-layout-toolbar .ws-mode{color:var(--dim);font:10px var(--mono);letter-spacing:1px;text-transform:uppercase;padding:0 4px}\nbody.workspace-layout-edit .layout-panel{outline:1px dashed rgba(47,230,255,.42);outline-offset:-2px;position:relative!important;transition:outline-color 160ms var(--ease)}\nbody.workspace-layout-edit .layout-panel.layout-locked{outline-color:rgba(255,207,77,.55)}\n.layout-panel .layout-grip,.layout-panel .layout-resize{display:none}\nbody.workspace-layout-edit .layout-panel>.layout-grip{display:block;position:absolute;left:6px;top:6px;z-index:20;min-width:52px;min-height:22px;padding:3px 7px;background:#050505;border:1px solid var(--focus);color:#fff;font:10px var(--mono);letter-spacing:1px;cursor:move;user-select:none;text-transform:uppercase;box-shadow:0 8px 24px #000b}\nbody.workspace-layout-edit .layout-panel.layout-locked>.layout-grip{border-color:var(--caution);color:var(--caution);cursor:not-allowed}\nbody.workspace-layout-edit .layout-panel>.layout-resize{display:block;position:absolute;right:4px;bottom:4px;z-index:20;width:16px;height:16px;border-right:2px solid var(--focus);border-bottom:2px solid var(--focus);cursor:nwse-resize}\nbody.workspace-layout-edit .layout-panel.layout-locked>.layout-resize{border-color:var(--caution);cursor:not-allowed}\nbody.workspace-layout-edit.workspace-dragging{cursor:grabbing!important}\n@media(max-width:760px),(pointer:coarse) and (max-width:980px){#workspace-layout-toolbar{left:8px;right:8px;bottom:calc(70px + env(safe-area-inset-bottom));justify-content:center;flex-wrap:wrap}.layout-panel>.layout-resize{display:none!important}}\n';document.head.appendChild(css)}
  function panelRecord(v,el,i){var rec=viewRecord(v),k=keyFor(el,i);rec.panels[k]=rec.panels[k]||{};return rec.panels[k]}
  function applyPanel(v,el,i){var r=panelRecord(v,el,i);el.classList.add('layout-panel');el.dataset.layoutKey=keyFor(el,i);el.classList.toggle('layout-locked',!!r.locked);
    if(r.x||r.y)el.style.transform='translate('+Math.round(r.x||0)+'px,'+Math.round(r.y||0)+'px)';
    if(r.w)el.style.width=Math.max(160,Math.round(r.w))+'px';if(r.h)el.style.height=Math.max(90,Math.round(r.h))+'px';
    if(!el.querySelector(':scope>.layout-grip')){var g=document.createElement('span');g.className='layout-grip';g.textContent='MOVE';el.appendChild(g)}
    if(!el.querySelector(':scope>.layout-resize')){var z=document.createElement('span');z.className='layout-resize';el.appendChild(z)} }
  function refresh(){injectCss();var v=view();if(!v)return;var rec=viewRecord(v);state.locked=!!rec.locked;targets(v).forEach(function(el,i){applyPanel(v,el,i)});document.body.classList.toggle('workspace-layout-edit',state.editing);document.body.classList.toggle('workspace-layout-locked',state.locked);toolbar();}
  function toolbar(){var bar=$('workspace-layout-toolbar');if(!bar){bar=document.createElement('div');bar.id='workspace-layout-toolbar';document.body.appendChild(bar)}var v=view(),rec=v?viewRecord(v):{locked:false};bar.innerHTML='<span class="ws-mode">'+(state.editing?'LAYOUT EDIT':'LAYOUT')+'</span><button data-ws-toggle>'+(state.editing?'Done':'Layout')+'</button><button data-ws-lock>'+(rec.locked?'Unlock view':'Lock view')+'</button><button data-ws-save>Save</button><button data-ws-reset>Reset view</button>';
    bar.querySelector('[data-ws-toggle]').onclick=function(){state.editing=!state.editing;try{localStorage.setItem(EDIT,state.editing?'1':'0')}catch(e){}refresh()};
    bar.querySelector('[data-ws-lock]').onclick=function(){var v=view(),rec=viewRecord(v);rec.locked=!rec.locked;save();refresh()};
    bar.querySelector('[data-ws-save]').onclick=function(){save();refresh()};
    bar.querySelector('[data-ws-reset]').onclick=function(){var v=view(),rec=viewRecord(v);rec.panels={};rec.locked=false;targets(v).forEach(function(el){el.style.transform='';el.style.width='';el.style.height='';el.classList.remove('layout-locked')});save();refresh()};}
  function start(e,kind){if(!state.editing||!desktop())return;var el=e.target.closest('.layout-panel'),v=view();if(!el||!v)return;var panels=targets(v),i=panels.indexOf(el),r=panelRecord(v,el,i);if(r.locked||viewRecord(v).locked)return;e.preventDefault();e.stopPropagation();var box=el.getBoundingClientRect();state.drag={id:e.pointerId,kind:kind,el:el,v:v,i:i,r:r,sx:e.clientX,sy:e.clientY,x:r.x||0,y:r.y||0,w:box.width,h:box.height};e.target.setPointerCapture(e.pointerId);document.body.classList.add('workspace-dragging')}
  document.addEventListener('pointerdown',function(e){if(e.target.classList.contains('layout-grip'))start(e,'move');else if(e.target.classList.contains('layout-resize'))start(e,'resize')},true);
  document.addEventListener('pointermove',function(e){var d=state.drag;if(!d||e.pointerId!==d.id)return;var dx=e.clientX-d.sx,dy=e.clientY-d.sy;if(d.kind==='move'){d.r.x=d.x+dx;d.r.y=d.y+dy;d.el.style.transform='translate('+Math.round(d.r.x)+'px,'+Math.round(d.r.y)+'px)'}else{d.r.w=Math.max(160,d.w+dx);d.r.h=Math.max(90,d.h+dy);d.el.style.width=Math.round(d.r.w)+'px';d.el.style.height=Math.round(d.r.h)+'px'}});
  function end(e){var d=state.drag;if(!d||e.pointerId!==d.id)return;state.drag=null;document.body.classList.remove('workspace-dragging');save()}
  document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
  function boot(){state.store=load();try{state.editing=localStorage.getItem(EDIT)==='1'}catch(e){}refresh();var obs=new MutationObserver(function(){if(state.editing)requestAnimationFrame(refresh)});obs.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});window.addEventListener('resize',function(){requestAnimationFrame(refresh)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  root.PipelineWorkspaceLayout={refresh:refresh,load:load};
})(window);
