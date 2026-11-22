const {test}=require('node:test'),assert=require('node:assert/strict');
const {image}=require('./fixtures/office-image-service.cjs');
const {fixture}=require('./fixtures/office-relay-service.cjs');
test('verified Access -> signed private mailbox image -> one competing outbound worker -> native adapter -> durable signed result',async()=>{const f=await fixture();try{
 const token=await f.signAccess();const admitted=await f.post(token);assert.equal(admitted.status,202);assert.equal((await f.post(token)).status,200);
 const results=await Promise.all([f.worker(),f.worker()]);assert.equal(results.reduce((n,r)=>n+r.dispatched,0),1);assert.equal(f.rpc.inputs.length,1);assert.equal(f.rpc.inputs[0][1].type,'image');assert.equal(f.rpc.inputs[0][1].url,image.data);
 const result=await(await f.get(token)).json();assert.equal(result.status,'finished');assert.match(result.outcome.summary,/synthetic screenshot/);assert.equal(result.attachments.length,1);assert.doesNotMatch(JSON.stringify(result),/base64|signature|privateKey/);
 const before=f.calls.filter(x=>x.method==='PUT').length;await f.get(token);assert.equal(f.calls.filter(x=>x.method==='PUT').length,before,'GET never publishes or dispatches');
 assert.equal((await f.worker()).dispatched,0);for(const name of f.files.keys())if(name.includes('/claims/'))f.files.delete(name);assert.equal((await f.worker()).dispatched,0,'local durable ledger survives remote claim deletion');assert.equal(f.rpc.inputs.length,1);assert.ok(f.calls.every(x=>!x.path.includes('/agent-chat/')));
 }finally{await f.close();}});
test('unsigned, wrong subject/audience/issuer, expired and algorithm-confused Access cannot create jobs; shared chat unlock is insufficient',async()=>{const f=await fixture();try{
 for(const token of [undefined,'shared-chat-token',await f.signAccess({sub:'third-party'}),await f.signAccess({aud:['foreign']}),await f.signAccess({iss:'https://foreign.cloudflareaccess.com'}),await f.signAccess({exp:1}),await f.signAccess({}, {alg:'none'})])assert.equal((await f.post(token)).status,401);
 assert.equal(f.files.size,0);assert.equal(f.rpc.inputs.length,0);
 }finally{await f.close();}});
test('expired jobs, tampered signatures/images, foreign path and public mailbox never dispatch',async()=>{
 for(const mode of ['expired','signature','image','path','public']){const f=await fixture();try{await f.post(await f.signAccess());if(mode==='expired')f.advance(601);if(mode==='public')f.makePublic();
 if(mode==='signature'){const [name,row]=[...f.files].find(([k])=>k.includes('/ready/'));const value=JSON.parse(Buffer.from(row.content,'base64'));value.signature=value.signature.slice(0,-4)+'AAAA';row.content=Buffer.from(JSON.stringify(value)).toString('base64');}
 if(mode==='image'){const [name,row]=[...f.files].find(([k])=>k.includes('/images/'));row.content=Buffer.from(JSON.stringify({data:'AQID'})).toString('base64');}
 if(mode==='path'){const [name,row]=[...f.files].find(([k])=>k.includes('/ready/'));f.files.delete(name);f.files.set('coding-v1/ready/'+'a'.repeat(64)+'.json',row);}
 if(mode==='public')await assert.rejects(f.worker,/Private mailbox/);else assert.equal((await f.worker()).dispatched,0);assert.equal(f.rpc.inputs.length,0);
 }finally{await f.close();}}
});
test('forged mailbox status cannot introduce a PR link and disabled factory ignores configured credentials',async()=>{const f=await fixture();try{
 const token=await f.signAccess();await f.post(token);const id=await f.c.jobId({...f.config.binding,requestId:f.body.requestId});f.files.set('coding-v1/status/'+id+'.json',{sha:'fake',content:Buffer.from(JSON.stringify({body:'forged',signature:'AAAA'})).toString('base64')});assert.equal((await f.get(token)).status,503);
 const {createHostedCoding}=await import('../lib/office-relay/hosted.mjs');const disabled=createHostedCoding({});assert.equal((await disabled(new Request('https://office.example/api/agent-coding'))).status,401);
 }finally{await f.close();}});
test('a lost claim response or process crash never permits a retry dispatch',async()=>{const f=await fixture();try{
 await f.post(await f.signAccess());const original=f.mailbox.request;let lose=true;f.mailbox.request=async q=>{const r=await original(q);if(lose&&q.method==='PUT'&&q.path.includes('/claims/')){lose=false;throw Error('lost response');}return r;};
 await assert.rejects(f.worker,/lost response/);assert.equal(f.rpc.inputs.length,0);assert.equal((await f.worker()).dispatched,0);assert.equal(f.rpc.inputs.length,0);
 const lock=f.store.acquireWorkerLock(f.config.workerId);assert.ok(lock);assert.equal((await f.worker()).busy,true);f.store.releaseWorkerLock(f.config.workerId,'wrong-token');assert.equal((await f.worker()).busy,true);f.store.releaseWorkerLock(f.config.workerId,lock);
 }finally{await f.close();}});
test('a correctly signed foreign repository/worker job is still rejected by the pinned worker binding',async()=>{const f=await fixture();try{
 await f.post(await f.signAccess());const [name,row]=[...f.files].find(([k])=>k.includes('/ready/'));const env=JSON.parse(Buffer.from(row.content,'base64')),value=await f.c.open(env,'job',f.jobs.publicKey);value.job.repository='foreign/repository';const changed=await f.c.seal('job',value,f.jobs.privateKey);row.content=Buffer.from(JSON.stringify(changed)).toString('base64');const admission=[...f.files].find(([k])=>k.includes('/jobs/'))[1];admission.content=row.content;
 assert.equal((await f.worker()).dispatched,0);assert.equal(f.rpc.inputs.length,0);
 }finally{await f.close();}});
test('independent local workers racing the GitHub create-only claim dispatch exactly once',async()=>{const f=await fixture();const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-second-'));const {PrivateStore}=await import('../tools/office-dot/store.mjs');const second=new PrivateStore(dir);try{
 await f.post(await f.signAccess());const results=await Promise.all([f.worker(),f.worker(second)]);assert.equal(results.reduce((n,r)=>n+r.dispatched,0),1);assert.equal(f.rpc.inputs.length,1);assert.equal([...f.files.keys()].filter(k=>k.includes('/claims/')).length,1);
 }finally{await f.close();second.close();fs.rmSync(dir,{recursive:true,force:true});}});
test('deployment adapter is inert by default and refuses incomplete activation config',async()=>{const {configuredHostedCoding}=await import('../lib/office-relay/configured.mjs');const handle=await configuredHostedCoding({OFFICE_MAILBOX_TOKEN:'not-a-coding-credential'});assert.equal((await handle(new Request('https://foreman-cockpit.pages.dev/api/agent-coding'))).status,401);await assert.rejects(()=>configuredHostedCoding({OFFICE_CODING_RELAY_ENABLED:'reviewed-v1'}),/scope/);});
test('outbound GitHub CLI transport has fixed host/repository and sends payload through stdin',async()=>{const {ghRequest}=await import('../tools/office-dot/run-relay.mjs');let call;const request=ghRequest((command,args,options)=>{call={command,args,options};return 'HTTP/2.0 201 Created\r\ncontent-type: application/json\r\n\r\n{"content":{"sha":"abc"}}';});const r=await request({method:'PUT',path:'/repos/tpruittguitar/office-mailbox/contents/coding-v1/jobs/example.json',body:{content:'synthetic'}});assert.equal(r.status,201);assert.equal(call.command,'gh');assert.ok(call.args.includes('github.com'));assert.equal(call.options.input,'{"content":"synthetic"}');assert.ok(!call.args.some(a=>a.includes('synthetic')));await assert.rejects(()=>request({method:'POST',path:'/repos/foreign/repo'}));});
test('chosen completed draft returns a signed verified link once through the relay; status polling cannot publish',async()=>{const f=await fixture();try{
 let publications=0;const emit=f.rpc.emit.bind(f.rpc);f.rpc.emit=(event,m)=>{if(event==='approval'&&m.method==='item/tool/call'){m.params.arguments.route='draft_pr';if(m.params.arguments.stage==='outcome')emit('notification',{method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'fileChange',status:'completed',changes:[{path:f.adapter.workspace+'/fixture.js'}]}}});}return emit(event,m);};
 f.adapter.publishDraft=Object.assign(async()=>{publications++;return {draft:true,head:f.config.binding.branch,base:'main',url:'https://github.com/example/project/pull/42'};},{capture:()=>({clean:true}),prepare:(before,paths)=>paths.length?{digest:'mock-intended-diff',files:['fixture.js']}:null});
 const token=await f.signAccess();await f.post(token);await f.worker();const result=await(await f.get(token)).json();assert.equal(result.status,'completed');assert.equal(result.draftUrl,'https://github.com/example/project/pull/42');await f.get(token);await f.post(token);await f.worker();assert.equal(publications,1);assert.equal(f.rpc.inputs.length,1);
 }finally{await f.close();}});
test('complete deployment config imports distinct signing roles and still requires a verified Access assertion',async()=>{const f=await fixture({origin:'https://foreman-cockpit.pages.dev'});const original=global.fetch;try{
 const {configuredHostedCoding}=await import('../lib/office-relay/configured.mjs');
 const config={...f.config,binding:{...f.config.binding,repository:'tpruittguitar/foreman-cockpit'},access:{issuer:'https://fixture.cloudflareaccess.com',audience:'fixture-audience',subject:'verified-owner'}};
 const env={OFFICE_CODING_RELAY_ENABLED:'reviewed-v1',OFFICE_CODING_RELAY_CONFIG:JSON.stringify(config),OFFICE_CODING_JOB_SIGNING_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',f.jobs.privateKey)),OFFICE_CODING_WORKER_PUBLIC_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',f.status.publicKey)),OFFICE_MAILBOX_TOKEN:'fixture-only'};
 const handle=await configuredHostedCoding(env);assert.equal((await handle(new Request(config.origin+'/api/agent-coding'))).status,401);assert.equal(f.files.size,0);
 }finally{global.fetch=original;await f.close();}});
test('a second outbound process cannot rewrite the first native turn before acquiring its SQLite lock',async()=>{const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{PrivateStore}=await import('../tools/office-dot/store.mjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'relay-lock-'));const first=new PrivateStore(dir,{recoverNative:false});let second;try{const lock=first.acquireWorkerLock('worker');first.set('native','synthetic',{status:'running'});second=new PrivateStore(dir,{recoverNative:false});assert.equal(second.acquireWorkerLock('worker'),null);assert.equal(first.read('native','synthetic').status,'running');first.releaseWorkerLock('worker',lock);}finally{second?.close();first.close();fs.rmSync(dir,{recursive:true,force:true});}});
test('owner can be pinned by the signed Access email claim instead of subject',async()=>{const f=await fixture({accessIdentity:{subject:undefined,email:'owner@example.com'}});try{
 assert.equal((await f.post(await f.signAccess({sub:'idp-assigned',email:'other@example.com'}))).status,401);
 assert.equal((await f.post(await f.signAccess({sub:'idp-assigned'}))).status,401,'missing email claim is refused');
 assert.equal((await f.post(await f.signAccess({sub:'idp-assigned',email:'Owner@Example.com'}))).status,202);
 }finally{await f.close();}});
