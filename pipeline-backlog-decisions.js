/* User-initiated discovery decisions; no canonical mutations, optimistic removal, or POST retry. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PipelineBacklogDecisions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
var KEY=/^(linkedin:\d+|indeed:[a-f0-9]{16}|(?:url|unresolved):[a-f0-9]{24}|pid:V2[A-Z]-[A-Z0-9]+(?:-[A-Z0-9]+)*)$/;
function notAccepted(response,r){
 var o=response&&response.outcome;
 return !!(response&&response.ok===false&&o&&o.schema==='forge.manual-backlog-outcome.v2'&&o.scope==='SUBMISSION_ATTEMPT'&&typeof r.attemptId==='string'&&o.attemptId===r.attemptId&&o.status==='NOT_ACCEPTED'&&o.phase==='BEFORE_QUEUE'&&o.queueWrites===0&&o.requestId===r.requestId&&o.receiptId===r.receiptId);
}
function completeItemsMatch(j,r){return j.status!=='COMPLETE'||Array.isArray(j.items)&&j.items.length===r.keys.length&&j.items.map(function(i){return i&&i.key}).sort().every(function(k,n){return k===r.keys.slice().sort()[n]})}
function create(d){
 var stored=[],storageError='';
 try{stored=d.load()||[];if(!Array.isArray(stored)||stored.some(function(r){return !r||!Array.isArray(r.keys)||typeof r.requestId!=='string'||typeof r.receiptId!=='string'}))throw Error('Invalid receipt history')}
 catch(e){stored=[];storageError='Cannot read saved decision receipts. Restore browser storage before submitting.'}
 var state={capability:null,availabilityChecked:false,busy:false,error:storageError,requests:stored},authKey=null;
 function change(){d.change(state)}
 function save(){d.save(state.requests);change()}
 async function api(query,body){
  var key=d.key(),r=await d.fetch('/api/backlog-decisions?'+query,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-writer-key':key},body:body?JSON.stringify(body):undefined}),j=await r.json();
  if(key!==d.key())throw Error('Writer credentials changed; verify the existing request before proceeding');
  if(!r.ok||!j.ok){var e=Error(j.error||'Backlog decisions unavailable');e.response=j;throw e}return j;
 }
 async function capabilities(){if(state.busy)return;state.availabilityChecked=true;state.busy=true;state.error='';change();try{state.capability=await api('action=capabilities');authKey=d.key()}catch(e){state.error=e.message;state.capability=null}finally{state.busy=false;change()}}
 function pendingKeys(){var keys=new Set();state.requests.forEach(function(r){if(!['COMPLETE','NOT_ACCEPTED','NOT_SENT'].includes(r.status))(r.keys||[]).forEach(function(k){keys.add(k)})});return keys}
 async function submit(revision,decision,keys){
  if(storageError)throw Error(storageError);
  if(state.busy)throw Error('A request is already in progress');
  if(!state.capability||!state.capability.enabled||!(state.capability.supportedScopes||[]).includes('DISCOVERY_CARD_DISMISSAL')||authKey!==d.key())throw Error('Check decision availability first');
  if(!/^[a-f0-9]{40}$/.test(revision)||!['DECLINE','DELETE'].includes(decision)||!keys.length||keys.length>state.capability.maxBatch||new Set(keys).size!==keys.length)throw Error('Select 1–'+state.capability.maxBatch+' distinct candidates from one snapshot');
  if(keys.some(function(k){return typeof k!=='string'||!KEY.test(k)}))throw Error('Selection contains an unsupported discovery identity. Refresh the backlog before submitting.');
  var pending=pendingKeys();if(keys.some(function(k){return pending.has(k)}))throw Error('Selection includes a pending request. Check its receipt; do not repeat it.');
  state.busy=true;state.error='';change();var r,postStarted=false;
  try{
   // A rejection proof is safe only for a fresh identity and its single locally initiated POST.
   // Never use it to reconcile a stored request or replay a previous attempt.
   var requestId=d.uuid().toLowerCase(),attemptId=d.uuid().toLowerCase();
   if(state.requests.some(function(x){return x.requestId.toLowerCase()===requestId||(typeof x.attemptId==='string'&&x.attemptId.toLowerCase()===attemptId)}))throw Error('Submission identity was already used; no request was sent');
   var body={schema:'forge.manual-backlog-request.v1',requestId:requestId,snapshotRevision:revision,decision:decision,scope:'DISCOVERY_CARD_DISMISSAL',items:keys.slice().sort().map(function(k){return {key:k}})},bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body))),receiptId=Array.from(new Uint8Array(bytes)).map(function(b){return b.toString(16).padStart(2,'0')}).join('');
   r={receiptId:receiptId,requestId:requestId,attemptId:attemptId,snapshotRevision:revision,decision:decision,scope:'DISCOVERY_CARD_DISMISSAL',keys:keys.slice(),status:'UNCERTAIN',at:new Date().toISOString()};state.requests.push(r);
   save();postStarted=true;
   var j=await api('action=submit',{action:'submit',attemptId:attemptId,requestId:requestId,snapshotRevision:revision,decision:decision,scope:'DISCOVERY_CARD_DISMISSAL',items:keys.map(function(k){return {key:k}})});
   if(j.receiptId!==receiptId||j.requestId!==requestId||!['QUEUED','COMPLETE'].includes(j.status)||!completeItemsMatch(j,r))throw Error('Response did not match the saved request');
   r.status=j.status;r.items=j.items;save();return j;
  }catch(e){
   if(r){r.lastError=e.message;if(!postStarted)r.status='NOT_SENT';else if(state.requests.filter(function(x){return x.requestId===r.requestId||x.attemptId===r.attemptId}).length===1&&notAccepted(e.response,r))r.status='NOT_ACCEPTED';}
   state.error=e.message+(r&&r.status==='NOT_ACCEPTED'?' Nothing was queued. You may submit a new selection.':!postStarted?' Nothing was sent.':' Check the existing request receipt before any further submission.');
   try{save()}catch(storageFailure){state.error='Receipt storage failed; no automatic retry. '+state.error;change()}throw e;
  }finally{state.busy=false;change()}
 }
 async function check(requestId){
  if(state.busy)return;var r=state.requests.find(function(x){return x.requestId===requestId});if(!r)return;
  state.busy=true;state.error='';change();try{
   var j=await api('action=receipt&receiptId='+encodeURIComponent(r.receiptId));
   if(j.receiptId!==r.receiptId||j.requestId!==r.requestId||!['QUEUED','COMPLETE'].includes(j.status)||!completeItemsMatch(j,r))throw Error('Receipt did not match the saved request');
   r.status=j.status;r.items=j.items;r.sourceRevision=j.sourceRevision;save();
  }catch(e){state.error=e.message+' No request has been replayed.'}finally{state.busy=false;change()}
 }
 return {state:state,capabilities:capabilities,submit:submit,check:check,pendingKeys:pendingKeys};
}
return {create:create,notAccepted:notAccepted};
});
