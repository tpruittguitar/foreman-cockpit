/* Authorized Writer endpoint adapter. A possibly delivered request is reconciled, never blindly resent. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PipelineWriterTransport=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(adapter){
    if(!adapter.persist||!adapter.load)throw new Error('DURABLE_CHECKPOINT_ADAPTER_REQUIRED');
    async function reconcile(item){
      var result=await adapter.result(item.requestId);
      item.result=result;item.updatedAt=new Date().toISOString();
      if(!result||result.status!=='COMPLETE'||result.durable!==true){item.state='PENDING_VERIFICATION';await adapter.persist(item);return item;}
      var rows=await adapter.master(),proof=await adapter.verify(item,rows,result);
      if(!proof||proof.matches!==true){item.state='NEEDS_RESOLUTION';item.error='Complete receipt does not yet prove the exact intended row';}
      else{item.state='VERIFIED_COMPLETE';item.proof={independent:true,at:item.updatedAt,evidenceRef:'request_result:'+item.requestId,readback:proof};}
      await adapter.persist(item);return item;
    }
    async function submit(requestId,body,source){
      if(!requestId||!body||!source||!source.initiatingUrl)throw new Error('REQUEST_ID_AND_ORIGINAL_SOURCE_REQUIRED');
      var old=await adapter.load(requestId);
      if(old&&old.state==='VERIFIED_COMPLETE')return old;
      if(old&&old.deliveryAttempted)return reconcile(old);
      var item=old||{requestId:requestId,body:JSON.parse(JSON.stringify(body)),source:JSON.parse(JSON.stringify(source)),state:'NOT_ATTEMPTED',createdAt:new Date().toISOString()};
      await adapter.persist(item);
      if(!adapter.post||!adapter.result||!adapter.master||!adapter.verify){item.state='WRITER_TRANSPORT_BLOCKED';item.error='Supported endpoint/queue adapter and readback capability required';await adapter.persist(item);return item;}
      // Persist before the call. A crash here cannot result in an untracked replay.
      item.deliveryAttempted=true;item.state='PENDING_VERIFICATION';await adapter.persist(item);
      try{item.response=await adapter.post(item.body,{contentType:'text/plain',requestId:requestId});}
      catch(error){item.error=String(error.message||error);item.state='PENDING_VERIFICATION';await adapter.persist(item);return item;}
      await adapter.persist(item);return reconcile(item);
    }
    return {submit:submit,reconcile:reconcile};
  }
  return {create:create};
});
