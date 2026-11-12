/* Status display only: never wrap writes, receipt verification or mutation preflights. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineStatusReads=factory();})(this,function(){
  'use strict';
  var ACTIONS=new Set(['writer_status','operations']);
  var QUOTA=/Service invoked too many times for one day:\s*urlfetch/i;
  var COOLDOWN=15*60*1000;
  function quota(value){return QUOTA.test(value instanceof Error?value.message:JSON.stringify(value||''));}
  function create(read,identity,now){
    now=now||Date.now;
    var scope='',pending=new Map(),blocked=new Map();
    function sync(){var next=identity();if(next!==scope){scope=next;pending.clear();blocked.clear();}}
    function remaining(action){sync();return Math.max(0,(blocked.get(action)||0)-now());}
    function get(action,extra){
      sync();
      if(!ACTIONS.has(action))return read(action,extra);
      var wait=remaining(action);
      if(wait){var error=new Error('Daily URL Fetch quota exhausted; status evidence unavailable. Next check in '+Math.ceil(wait/60000)+' min.');error.retryAfterMs=wait;return Promise.reject(error);}
      var key=JSON.stringify([action,extra||'']),current=scope;
      if(pending.has(key))return pending.get(key);
      var p=Promise.resolve().then(function(){return read(action,extra);}).then(function(value){
        if(current===scope&&quota(value)){blocked.set(action,now()+COOLDOWN);var error=new Error('Daily URL Fetch quota exhausted; status evidence unavailable. Next check in 15 min.');error.retryAfterMs=COOLDOWN;throw error;}
        return value;
      },function(error){if(current===scope&&quota(error))blocked.set(action,now()+COOLDOWN);throw error;}).finally(function(){if(pending.get(key)===p)pending.delete(key);});
      pending.set(key,p);return p;
    }
    return {get:get,remaining:remaining};
  }
  return {create:create,COOLDOWN:COOLDOWN};
});
