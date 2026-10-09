/* Interaction cues follow real UI state; all motion is optional. */
(function(root){
  'use strict';
  var preference=matchMedia('(prefers-reduced-motion:reduce)'),lastJob=null,lastTab=null,lastPage=null,running=[],lockTimer;
  function allowed(){return !preference.matches&&!document.hidden;}
  function animate(element,frames,options){if(!element||!allowed()||!element.animate)return null;var a=element.animate(frames,options);running.push(a);a.finished.then(function(){running=running.filter(function(x){return x!==a})},function(){running=running.filter(function(x){return x!==a})});return a;}
  function cancel(){running.slice().forEach(function(a){a.cancel()});running=[];document.querySelector('#drawer')?.classList.remove('motion-lock');clearTimeout(lockTimer);}
  preference.addEventListener('change',function(){if(preference.matches)cancel()});
  document.addEventListener('visibilitychange',function(){if(document.hidden)cancel()});
  try{if(root.CSS&&CSS.registerProperty)CSS.registerProperty({name:'--pct',syntax:'<number>',inherits:false,initialValue:'0'})}catch(e){}
  function workspace(id,tab){
    var changed=id!==lastJob,tabChanged=tab!==lastTab;lastJob=id;lastTab=tab;
    if(!changed&&!tabChanged)return;
    cancel();if(!allowed())return;
    var drawer=document.querySelector('#drawer');if(!drawer||!drawer.classList.contains('on'))return;
    if(changed){
      drawer.classList.add('motion-lock');lockTimer=setTimeout(function(){drawer.classList.remove('motion-lock')},720);
      animate(drawer.querySelector('.wh-title'),[{opacity:.65,transform:'translateX(8px)'},{opacity:1,transform:'translateX(0)'}],{duration:280,easing:'cubic-bezier(.2,.7,.2,1)'});
      var ring=drawer.querySelector('.ws-ring'),value=ring&&parseFloat(ring.style.getPropertyValue('--pct'));
      if(ring&&isFinite(value))animate(ring,[{'--pct':'0'},{'--pct':String(value)}],{duration:650,easing:'cubic-bezier(.16,1,.3,1)'});
    }
    var panels=drawer.querySelectorAll('#d-body .detail-card,#d-body .ck-kd,#d-body .ck-ev,#d-body .ck-next,#d-body .ck-sum');
    Array.prototype.slice.call(panels,0,6).forEach(function(panel,i){animate(panel,[{opacity:.65,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:changed?300:180,delay:changed?i*35:0,fill:'backwards',easing:'cubic-bezier(.2,.7,.2,1)'});});
  }
  function page(name){if(lastPage===name)return;lastPage=name;animate(document.getElementById('view-'+name),[{opacity:.8},{opacity:1}],{duration:180,easing:'ease-out'});}
  function mapTarget(label,leader,key){if(label.dataset.motionTarget===key)return;label.dataset.motionTarget=key;
    animate(label,[{opacity:.3},{opacity:1}],{duration:220,easing:'ease-out'});
    animate(leader,[{opacity:.25,boxShadow:'0 0 8px #8cdbff'},{opacity:1,boxShadow:'0 0 0 transparent'}],{duration:400,easing:'ease-out'});
  }
  function loading(busy){var grid=document.getElementById('gridpane');if(grid)grid.setAttribute('aria-busy',String(busy));}
  function inviteDivider(handle,hasSaved){if(hasSaved||!allowed())return;handle.classList.add('motion-invite');setTimeout(function(){handle.classList.remove('motion-invite')},2600);}
  root.PipelineMotion={workspace:workspace,page:page,mapTarget:mapTarget,loading:loading,inviteDivider:inviteDivider};
})(window);
