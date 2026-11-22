const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const origin = 'https://office.example';
const conversationId = 'conversation_00001', requestId = 'request_000000001';
const scope = { sessionId: 'session_000000001', repository: 'example/project', base: 'main', branch: 'office-coding/branch_000000001' };
const owner = { owner: 'owner_00000000001', tenant: 'tenant_000000001', role: 'owner', sessions: Object.fromEntries(['Claude','Hermes','Dot','Grok'].map(p => [p, { [conversationId]: scope }])) };
const body = (provider = 'Dot') => ({ provider, conversationId, requestId, intent: 'owner_coding_request', text: 'Implement the example change' });
const req = (b, headers = {}) => new Request(origin + '/api/agent-coding', { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(b) });
const get = b => new Request(origin + '/api/agent-coding?' + new URLSearchParams({ provider: b.provider, conversationId: b.conversationId, requestId: b.requestId }));
async function fixture(principal = owner) {
  const { createCodingService } = await import('../lib/office-coding.mjs');
  const jobs = new Map(), calls = [];
  // Test-only atomic store; NOT a production queue.
  const store = { claim: async (k,j) => { if(jobs.has(k)) return { created:false,job:jobs.get(k) }; jobs.set(k,j); return { created:true }; }, get: async k => jobs.get(k), update: async (k,j) => jobs.set(k,{...jobs.get(k),...j}) };
  const adapters = Object.fromEntries(['Claude','Hermes','Dot','Grok'].map(provider => [provider, {
    submit: async job => { calls.push(job); }, status: async binding => ({ ...binding, status:'running' })
  }]));
  const service = createCodingService({ authenticate: async () => principal, origin, adapters, store });
  return { service, jobs, calls, adapters, store, createCodingService };
}
test('production is disabled: public, forged identity, shared chat token and POST cannot dispatch', async () => {
  const { createCodingService } = await import('../lib/office-coding.mjs');
  const service = createCodingService();
  for (const r of [new Request(origin+'/api/agent-coding'), req(body()), req({...body(),role:'owner'},{'X-Agent-Chat-Token':'shared','X-Office-Key':'shared','Cf-Access-Authenticated-User-Email':'owner@example.test'})]) {
    const result = await service(r); assert.equal(result.status,401); assert.equal(result.headers.get('cache-control'),'no-store');
  }
  const source = fs.readFileSync('functions/api/agent-coding.js','utf8');
  assert.match(source,/const handle = createCodingService\(\)/);
});
test('nonowners, cross-origin, missing fetch metadata, ALL, injected repo/branch and log author cannot dispatch', async () => {
  const f = await fixture();
  for (const b of [{...body(),provider:'ALL'},{...body(),intent:'chat'},{...body(),repository:'evil/repo'}, {...body(),branch:'main'}, {...body(),from:'Tim'}, {...body(),files:[]}]) assert.equal((await f.service(req(b))).status,400);
  for (const headers of [{Origin:'https://evil.example'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':''}]) assert.equal((await f.service(req(body(),headers))).status,403);
  assert.equal((await (await fixture({...owner,role:'member'})).service(req(body()))).status,401);
  assert.equal(f.calls.length,0);
});
test('all four missing adapters fail closed, no fallback and no storage write', async () => {
  const f = await fixture();
  for (const provider of ['Claude','Hermes','Dot','Grok']) {
    delete f.adapters[provider]; const r = await f.service(req(body(provider))); assert.equal(r.status,503); assert.equal((await r.json()).label,'Not connected');
  }
  assert.equal(f.calls.length,0); assert.equal(f.jobs.size,0);
});
test('mock translations for each provider preserve scope; concurrent repeated sends dispatch only once', async () => {
  const f = await fixture();
  for (const provider of ['Claude','Hermes','Dot','Grok']) {
    const b = body(provider);
    const results = await Promise.all(Array.from({length:4},()=>f.service(req(b))));
    assert.equal(results.filter(r=>r.status===202).length,1);
    assert.equal((await f.service(req({...b,text:'changed'}))).status,409);
    assert.equal((await f.service(req({...b,requestId:'request_000000002'}))).status,202);
  }
  assert.equal(f.calls.length,8);
  for (const job of f.calls) { assert.equal(job.repository,scope.repository); assert.equal(job.sessionId,scope.sessionId); assert.deepEqual(job.policy,{draftOnly:true,merge:false,deploy:false,expandAccess:false}); assert.equal(job.tenant,owner.tenant); }
});
test('tenant, owner, provider and conversation isolation prevents status disclosure', async () => {
  const f = await fixture(); await f.service(req(body()));
  for (const principal of [{...owner,tenant:'tenant_000000002'},{...owner,owner:'owner_00000000002'}]) {
    const other = f.createCodingService({authenticate:async()=>principal,origin,adapters:f.adapters,store:f.store});
    assert.equal((await other(get(body()))).status,404);
  }
  assert.equal((await f.service(get(body('Claude')))).status,404);
  assert.equal((await f.service(get({...body(),conversationId:'conversation_00002'}))).status,503);
  f.adapters.Dot.status = async binding => ({...binding,provider:'Claude',status:'running',secret:'private transcript'});
  const r = await f.service(get(body())); assert.equal(r.status,502); assert.doesNotMatch(await r.text(),/private transcript/);
});
test('status and verified draft link are returned in the same request; foreign PRs and raw output are rejected', async () => {
  const f = await fixture(); await f.service(req(body()));
  assert.equal((await (await f.service(get(body()))).json()).status,'running');
  for (const pr of [{draft:false,head:scope.branch,base:'main',url:'https://github.com/example/project/pull/1'}, {draft:true,head:'main',base:'main',url:'https://github.com/example/project/pull/1'}, {draft:true,head:scope.branch,base:'main',url:'https://evil.example/pull/1'}, {draft:true,head:scope.branch,base:'main',url:'https://github.com/example/project/pull/1?token=secret'}]) {
    f.adapters.Dot.status = async binding => ({...binding,status:'completed',pullRequest:pr}); assert.equal((await f.service(get(body()))).status,502);
  }
  f.adapters.Dot.status = async binding => ({...binding,status:'completed',pullRequest:{draft:true,head:scope.branch,base:'main',url:'https://github.com/example/project/pull/12'},logs:'secret'});
  const result = await (await f.service(get(body()))).json(); assert.deepEqual(result,{provider:'Dot',conversationId,requestId,status:'completed',draftUrl:'https://github.com/example/project/pull/12'});
});
test('ambiguous dispatch never automatically retries or exposes provider errors', async () => {
  const f = await fixture(); f.adapters.Dot.submit = async job => { f.calls.push(job); throw Error('secret'); };
  assert.equal((await (await f.service(req(body()))).json()).status,'unknown');
  assert.equal((await (await f.service(req(body()))).json()).status,'unknown');
  assert.equal(f.calls.length,1);
});
test('client retries reuse identity, providers isolate conversations, and lock discards late replies', async () => {
  const { createCodingClient,codingText } = await import('../office/coding-client.mjs');
  assert.equal(codingText('please fix this'),null); assert.equal(codingText('/code fix this'),'fix this');
  const calls=[]; let n=0;
  const client=createCodingClient(async (url,o)=>{ if(!o.body) return Response.json({providers:['Claude','Hermes','Dot','Grok'].map(provider=>({provider,connected:true,conversationId:provider.padEnd(16,'0')}))}); const b=JSON.parse(o.body); calls.push(b); return Response.json({...b,status:'queued'}); },()=>String(++n).padStart(16,'0'));
  await client.send('ALL','fix'); assert.equal(calls.length,0);
  await client.send('Dot','fix'); await client.send('Dot','fix'); await client.send('Dot','other'); await client.send('Claude','fix');
  assert.equal(calls[0].requestId,calls[1].requestId); assert.notEqual(calls[1].requestId,calls[2].requestId); assert.notEqual(calls[0].conversationId,calls[3].conversationId);
  let resolve; const slow=createCodingClient(()=>new Promise(r=>{resolve=r;}),()=>requestId); const pending=slow.send('Dot','fix'); slow.clear(); resolve(Response.json({status:'queued'})); assert.equal(await pending,null);
});
test('panel smoke: /code never enters ordinary chat, repeated disconnected sends, All, lock and status', async () => {
  const {createCodingClient,codingText,CODING_STORE,keepCodingJobs,restoreCodingJobs,etClock}=await import('../office/coding-client.mjs');
  const source=fs.readFileSync('office/office.js','utf8');
  const code=source.slice(source.indexOf("const AGENT_URL ="),source.indexOf('function openBot(name)'));
  const calls=[]; let result='disconnected';
  const ctx={createCodingClient,codingText,CODING_STORE,keepCodingJobs,restoreCodingJobs,etClock,Intl,crypto:require('node:crypto').webcrypto, URLSearchParams,Date,Map,JSON,FileReader:function(){},DEMO:false,
    document:{hidden:false,createElement:()=>({setAttribute(){},addEventListener(){},focus(){}}),body:{append(){}}},localStorage:{getItem(){},removeItem(){}},setInterval(){},setTimeout(){},
    L:{parseAgentChat:()=>[],agentName:x=>x},fetch:async(url,o)=>{ calls.push({url,body:o?.body&&JSON.parse(o.body)}); if(url==='/api/agent-chat')return Response.json({ok:true,lines:[]}); const b=o?.body&&JSON.parse(o.body); if(!b && !url.includes('?')) return Response.json({providers:[{provider:'Dot',connected:true,conversationId:'conversation_00001'}]}); if(!b)return Response.json({provider:'Dot',conversationId:ctx.job.conversationId,requestId:ctx.job.requestId,status:'completed',draftUrl:'https://github.com/example/project/pull/12'}); if(result==='disconnected')return Response.json({status:'not_connected'},{status:401});return Response.json({...b,status:'queued'}); }};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  const run=s=>vm.runInContext(s,ctx);
  run("AC.token='chat-only'; AC.exp=Date.now()+100000; AC.to='Dot'; AC.draft='/code implement';");
  await run('agentSend()'); await run('agentSend()'); assert.equal(calls.filter(c=>c.body).length,2); assert.ok(calls.every(c=>c.url==='/api/agent-coding')); assert.equal(calls[1].body.requestId,calls[2].body.requestId); assert.match(run('AC.note'),/Not connected/);
  run("AC.to='ALL'"); await run('agentSend()'); assert.equal(calls.filter(c=>c.body).length,2);
  result='queued'; run("AC.to='Dot'"); await run('agentSend()'); ctx.job=run('[...codingJobs.values()][0]'); await run('codingRefresh()'); assert.equal(run('[...codingJobs.values()][0].status'),'completed'); assert.equal(run('codingMessage([...codingJobs.values()][0]).draftUrl'),'https://github.com/example/project/pull/12');
  run("AC.draft='ordinary chat'"); await run('agentSend()'); assert.ok(calls.some(c=>c.url==='/api/agent-chat'&&c.body?.text==='ordinary chat'));
  run('agentLock()'); assert.equal(run('codingJobs.size'),0); assert.equal(run('AC.msgs.length'),0);
});
test('client and service integrate with one server-authorized conversation and mock adapter', async () => {
  const f=await fixture();const {createCodingClient}=await import('../office/coding-client.mjs');
  const client=createCodingClient((path,options={})=>f.service(new Request(origin+path,{...options,headers:{...options.headers,Origin:origin,'Sec-Fetch-Site':'same-origin'}})),()=>requestId);
  const job=await client.send('Dot','Implement the example change');assert.equal(job.status,'queued');assert.equal(job.conversationId,conversationId);
  await client.send('Dot','Implement the example change');assert.equal(f.calls.length,1);
  const status=await client.status(job);assert.equal(status.status,'running');
});
