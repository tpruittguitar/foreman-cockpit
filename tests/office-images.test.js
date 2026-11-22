const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,image,scope,identity,origin}=require('./fixtures/office-image-service.cjs');
test('prompt and exact image bytes reach native image input; durable refs survive polling, no replay and no PR for diagnosis',async()=>{const f=await setup();try{
 const response=await f.post();assert.equal(response.status,202);const accepted=await response.json();assert.equal(accepted.attachments.length,1);assert.equal(accepted.attachments[0].name,image.name);assert.doesNotMatch(JSON.stringify(accepted),/base64/);
 await f.adapter.queue;const {TURN_GUIDANCE}=await import('../tools/office-dot/adapter.mjs');assert.deepEqual(f.rpc.inputs,[[{type:'text',text:f.body.text},{type:'image',url:image.data},{type:'text',text:TURN_GUIDANCE}]]);
 const q=new URLSearchParams({provider:'Dot',conversationId:scope.conversationId,requestId:f.body.requestId});const status=await(await f.service(new Request(origin+'/api/agent-coding?'+q))).json();assert.equal(status.status,'finished');assert.equal(status.approach.route,'diagnose');assert.equal(status.draftUrl,undefined);assert.deepEqual(status.attachments,accepted.attachments);
 await f.post();await f.adapter.queue;assert.equal(f.rpc.inputs.length,1);
 assert.equal((await f.post({...f.body,attachments:[{...image,name:'different.png'}]})).status,409);
 const binding={...identity,...scope,provider:'Dot',requestId:f.body.requestId};
 for(const field of ['owner','tenant','provider','conversationId','requestId','sessionId','repository','branch'])await assert.rejects(()=>f.images.get({...binding,[field]:'foreign'},accepted.attachments[0]),/unavailable/);
 f.expire();assert.equal((await f.post()).status,401);assert.equal((await f.service(new Request(origin+'/api/agent-coding?'+q))).status,401);assert.equal(f.rpc.inputs.length,1);
 }finally{await f.close();}});
test('invalid and unsupported images fail before dispatch; persistence failure never drops image and sends text alone',async()=>{const f=await setup();try{
 for(const bad of [{...image,type:'image/svg+xml'}, {...image,data:'https://example.test/private.png'}, {...image,data:'data:image/png;base64,SGVsbG8='}, {...image,name:'../secret.png'}, {...image,extra:'path'}])assert.equal((await f.post({...f.body,attachments:[bad]})).status,400);
 assert.equal(f.rpc.inputs.length,0);f.images.put=async()=>{throw Error('disk failed');};const r=await f.post();assert.equal(r.status,503);assert.equal((await r.json()).status,'rejected');await f.adapter.queue;assert.equal(f.rpc.inputs.length,0);
 }finally{await f.close();}});
test('client preserves images on rejection, retry identity includes exact attachments, and never falls back to ordinary chat',async()=>{const {createCodingClient}=await import('../office/coding-client.mjs');let count=0;const calls=[];const client=createCodingClient(async(url,o)=>{calls.push({url,o});if(!o.body)return Response.json({providers:[{provider:'Dot',connected:true,conversationId:scope.conversationId}]});return Response.json({...JSON.parse(o.body),status:'unknown'});},()=>('request'+(++count)).padEnd(16,'0'));
 const a=await client.send('Dot','inspect',[image]),b=await client.send('Dot','inspect',[image]),c=await client.send('Dot','inspect',[{...image,name:'changed.png'}]);assert.equal(a.requestId,b.requestId);assert.notEqual(a.requestId,c.requestId);assert.deepEqual(a.attachments,[image]);assert.ok(calls.every(c=>c.url==='/api/agent-coding'));assert.equal((await client.send('Dot','inspect',[{...image,data:''}])).status,'rejected');
});
test('unsupported native image transport and foreign origin/scope reject without private writes',async()=>{const f=await setup();try{
 f.adapter.supportsImages=false;assert.equal((await f.post()).status,503);assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM records').get().n,0);
 f.adapter.supportsImages=true;assert.equal((await f.post({...f.body,provider:'ALL'})).status,400);assert.equal((await f.post({...f.body,conversationId:'foreign000000001'})).status,503);
 const response=await f.service(new Request(origin+'/api/agent-coding',{method:'POST',headers:{Origin:'https://foreign.example','Sec-Fetch-Site':'cross-site','Content-Type':'application/json'},body:JSON.stringify(f.body)}));assert.equal(response.status,403);assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM records').get().n,0);
 }finally{await f.close();}});
test('modified private image bytes cannot become a text-only native turn',async()=>{const f=await setup();try{f.images.get=async()=>new Uint8Array([1,2,3]);assert.equal((await f.post()).status,202);await f.adapter.queue;assert.equal(f.rpc.inputs.length,0);assert.equal(f.store.hasUncertain(),true);}finally{await f.close();}});
