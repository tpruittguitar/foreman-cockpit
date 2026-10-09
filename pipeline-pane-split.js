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
