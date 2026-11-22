const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
async function fixture(){
 const [{CodexRPC},{PrivateStore},{DotAdapter},{startLocalServer,ownerIdentity}]=await Promise.all(['rpc','store','adapter','server'].map(n=>import('../tools/office-dot/'+n+'.mjs')));
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'office-local-test-')),workspace=path.join(tmp,'workspace');fs.mkdirSync(workspace);
 const rpc=new CodexRPC(spawn(process.execPath,[path.join(__dirname,'fixtures/office-dot/codex-0169.cjs')],{stdio:['pipe','pipe','pipe']}));await rpc.initialize();
 const account=await rpc.includedAccount();const identity=ownerIdentity(account.userId,account.accountId),store=new PrivateStore(path.join(tmp,'private'));
 const scope={repository:'example/project',base:'main',branch:'office-coding/fixture_branch_01',sessionId:'fixture_session_01',conversationId:'fixture_conversation_01'};
 const approvals=[],publications=[];
 const adapter=new DotAdapter({rpc,store,workspace,identity,scope,approve:async p=>{approvals.push(p);return 'accept';},publishDraft:async()=>{publications.push(1);return {draft:true,head:scope.branch,base:'main',url:'https://github.com/example/project/pull/123'};}});
 const server=await startLocalServer({root:path.join(__dirname,'..'),adapter,store,identity,scope});
 return {...server,rpc,adapter,store,workspace,scope,approvals,publications,tmp,async cleanup(){await adapter.queue;await server.close();rpc.close();store.close();fs.rmSync(tmp,{recursive:true,force:true});}};
}
module.exports={fixture};
if(require.main===module || process.env.NODE_TEST_CONTEXT){
 test('local page -> owner session -> 0.169 adapter -> resumed turn -> draft PR; private durable deduplication',async()=>{
  const f=await fixture();try{
   assert.equal((await fetch(f.origin+'/api/agent-coding')).status,401);
   const launched=await fetch(f.launchUrl,{redirect:'manual'});const cookie=launched.headers.get('set-cookie').split(';')[0];assert.equal(launched.status,303);
   assert.equal((await fetch(f.launchUrl,{redirect:'manual'})).status,403);
   const headers={Cookie:cookie,Origin:f.origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'};
   assert.match(await (await fetch(f.origin+'/office',{headers})).text(),/local-display-only/);
   const caps=await (await fetch(f.origin+'/api/agent-coding',{headers})).json();assert.equal(caps.providers.find(x=>x.provider==='Dot').connected,true);assert.equal(caps.providers.find(x=>x.provider==='Claude').connected,false);
   async function send(id,text,extra={}){return fetch(f.origin+'/api/agent-coding',{method:'POST',headers,body:JSON.stringify({provider:'Dot',conversationId:f.scope.conversationId,requestId:id,intent:'owner_coding_request',text,...extra})});}
   const first='request_fixture_0001';assert.equal((await send(first,'first edit with approval')).status,202);await f.adapter.queue;
   assert.equal((await send(first,'first edit with approval')).status,200);await f.adapter.queue;assert.equal(fs.readFileSync(path.join(f.workspace,'proof.txt'),'utf8'),'turn-1\n');assert.equal(f.approvals.length,1);
   assert.equal((await send('request_fixture_0002','resume and append')).status,202);await f.adapter.queue;assert.equal(fs.readFileSync(path.join(f.workspace,'proof.txt'),'utf8'),'turn-1\nturn-2\n');
   const q=new URLSearchParams({provider:'Dot',conversationId:f.scope.conversationId,requestId:'request_fixture_0002'});assert.equal((await (await fetch(f.origin+'/api/agent-coding?'+q,{headers})).json()).status,'awaiting_review');
   await send('request_fixture_0003','/pr');await f.adapter.queue;q.set('requestId','request_fixture_0003');const j=await(await fetch(f.origin+'/api/agent-coding?'+q,{headers})).json();assert.equal(j.status,'completed');assert.equal(j.draftUrl,'https://github.com/example/project/pull/123');assert.equal(f.publications.length,1);
   assert.equal((await send('request_fixture_0004','attack',{provider:'ALL'})).status,400);
   assert.equal((await send('request_fixture_0004','attack',{repository:'evil/repo'})).status,400);
   assert.equal((await fetch(f.origin+'/api/agent-coding',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
   assert.equal(await new Promise(resolve=>require('node:http').get(f.origin+'/api/agent-coding',{headers:{...headers,Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);})),403);
   assert.equal((await fetch(f.origin+'/api/agent-chat',{method:'POST',headers,body:'{}'})).status,503);
   assert.equal((await fetch(f.origin+'/tools/office-dot/cli.mjs',{headers})).status,404);
  }finally{await f.cleanup();}
 });
 test('private store survives restart, quarantines uncertain native turns and never re-admits the request',async()=>{
  const {PrivateStore}=await import('../tools/office-dot/store.mjs');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'office-store-'));let s=new PrivateStore(tmp);
  await s.claim('request',{text:'original',status:'queued'});s.set('native','request',{status:'running',threadId:'private-thread',turnId:'private-turn'});s.close();s=new PrivateStore(tmp);
  assert.equal((await s.claim('request',{text:'retry'})).created,false);assert.equal(s.read('native','request').status,'unknown');assert.equal(s.read('native','request').turnId,'private-turn');s.close();fs.rmSync(tmp,{recursive:true,force:true});
 });
}
if(require.main===module || process.env.NODE_TEST_CONTEXT){
 test('native account guard rejects API keys, paid credits, unknown included usage and missing account identity',async()=>{
  const {CodexRPC}=await import('../tools/office-dot/rpc.mjs');
  for(const [account,usage] of [
   [{type:'apiKey'},{ordinaryUsageAllowed:true,accountId:'a',rateLimits:{credits:{hasCredits:false,unlimited:false}}}],
   [{type:'chatgpt'},{ordinaryUsageAllowed:true,accountId:'a',rateLimits:{credits:{hasCredits:true,unlimited:false}}}],
   [{type:'chatgpt'},{ordinaryUsageAllowed:null,accountId:'a',rateLimits:{credits:{hasCredits:false,unlimited:false}}}],
   [{type:'chatgpt'},{ordinaryUsageAllowed:true,rateLimits:{credits:{hasCredits:false,unlimited:false}}}]
  ])await assert.rejects(()=>CodexRPC.prototype.includedAccount.call({request:async m=>m==='account/read'?{account,userId:'user'}:usage}),/Included ChatGPT subscription/);
 });
 test('native approvals cannot broaden access or apply to a different native thread',async()=>{
  const f=await fixture();try{
   const sent=[];f.rpc.send=m=>sent.push(m);const active={key:'test',threadId:'ours',turnId:'turn',job:{}};f.adapter.active=active;
   for(const params of [{threadId:'other',turnId:'turn'},{threadId:'ours',turnId:'turn',grantRoot:'/outside'},{threadId:'ours',turnId:'turn',proposedExecpolicyAmendment:['anything']}])await f.adapter.onApproval({id:'approval',method:'item/commandExecution/requestApproval',params});
   assert.ok(sent.every(x=>x.result.decision==='cancel'));assert.equal(f.approvals.length,0);f.adapter.active=null;
  }finally{await f.cleanup();}
 });
}
if(require.main===module || process.env.NODE_TEST_CONTEXT){
 test('draft publisher rejects a non-draft before push and uses only the bound remote/head/base',async()=>{
  const {draftPublisher}=await import('../tools/office-dot/publish.mjs');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'office-publish-'));const workspace=path.join(tmp,'work'),stateDir=path.join(tmp,'private');fs.mkdirSync(workspace);fs.mkdirSync(stateDir);fs.writeFileSync(path.join(workspace,'change.txt'),'fixture');
  const branch='office-coding/fixture_branch_01',repository='example/project',calls=[];let isDraft=false,existing=true;
  const execute=(cmd,args)=>{calls.push([cmd,...args]);if(cmd==='git'){
   const a=args.slice(2);if(a[0]==='branch')return branch;if(a[0]==='remote')return 'https://github.com/'+repository+'.git';if(a[0]==='diff')return 'change.txt';return '';
  }const pr={number:123,isDraft,headRefName:branch,baseRefName:'main',url:'https://github.com/example/project/pull/123'};if(args[1]==='list')return JSON.stringify(existing?[pr]:[]);if(args[1]==='create'){isDraft=true;return pr.url;}return JSON.stringify(pr);};
  const publish=draftPublisher({workspace,stateDir,repository,branch,execute});
  await assert.rejects(publish,/draft/);assert.ok(!calls.some(c=>c[0]==='git'&&c.includes('push')));
  existing=false;calls.length=0;const pr=await publish();assert.equal(pr.draft,true);assert.ok(calls.find(c=>c[0]==='gh'&&c[2]==='create').includes('--draft'));
  assert.ok(calls.some(c=>c[0]==='git'&&c.includes('HEAD:refs/heads/'+branch)));assert.ok(calls.every(c=>!c.includes('merge')&&!c.includes('--force')));
  fs.rmSync(tmp,{recursive:true,force:true});
 });
}
