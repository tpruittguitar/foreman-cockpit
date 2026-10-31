/* Operation feedback survives view renders. Progress is counted work, never a timer. */
(function(root){
  'use strict';
  var current=0,timer;
  function start(title,total){
    var token=++current;clearTimeout(timer);
    var old=document.getElementById('action-progress');if(old)old.remove();
    var el=document.createElement('section');el.id='action-progress';el.className='action-progress';
    el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    el.innerHTML='<button type="button" aria-label="Hide progress">×</button><h2></h2><p class="ap-impact"></p><p class="ap-detail"></p><progress></progress><p class="ap-count"></p><div class="ap-actions"></div>';
    document.body.appendChild(el);el.querySelector('h2').textContent=title;
    el.querySelector('button').onclick=function(){el.hidden=true};
    function update(detail,count,max){if(token!==current)return;el.hidden=false;el.querySelector('.ap-detail').textContent=detail;var p=el.querySelector('progress');
      if(typeof count==='number'&&max>0){p.max=max;p.value=count;el.querySelector('.ap-count').textContent=count+' / '+max+' jobs'}
      else{p.removeAttribute('value');el.querySelector('.ap-count').textContent=total+' jobs in this operation'}
    }
    update('Preparing…');
    return {update:update,summary:function(text){el.querySelector('.ap-impact').textContent=text},finish:function(detail){update(detail,total,total);el.classList.add('ap-complete');el.querySelector('.ap-actions').replaceChildren();timer=setTimeout(function(){if(token===current)el.remove()},2400)},
      pending:function(detail,recheck,count,max){update(detail,count,max);el.classList.add('ap-pending');if(recheck){var b=document.createElement('button');b.textContent='Check saved results';b.onclick=function(){b.disabled=true;Promise.resolve().then(recheck).finally(function(){b.disabled=false})};el.querySelector('.ap-actions').replaceChildren(b)}}};
  }
  var buckets={DECLINE:'DECLINED_BY_TIM',APPLIED:'APPLIED',APPLY_NOW:'READY_TO_PURSUE',MANUAL_RESEARCH:'MANUAL_RESEARCH',CLOSED_DEAD:'CLOSED_DEAD',INVALID_DISCOVERY:'INVALID_DISCOVERY'};
  function proves(row,ruling){return !!(row&&row.PRIMARY_ID===ruling.primaryId&&row.BUCKET===buckets[ruling.kind]&&row.payload&&row.payload.STATE_SOURCE==='TIM:'+ruling.requestId)}
  var api={start:start,proves:proves};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PipelineActionProgress=api;
})(typeof window==='object'?window:globalThis);
