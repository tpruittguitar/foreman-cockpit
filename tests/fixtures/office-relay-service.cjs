const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,image,scope,identity}=require('./office-image-service.cjs');
async function fixture({origin='https://office.example'}={}){
 const c=await import('../../lib/office-relay/crypto.mjs'),{CodingMailbox}=await import('../../lib/office-relay/mailbox.mjs'),{createHostedCoding,relayImages}=await import('../../lib/office-relay/hosted.mjs'),{runMailboxOnce}=await import('../../tools/office-dot/outbound.mjs');
 const f=await setup(),files=new Map(),calls=[];let sequence=0,t=1800000000,privateRepo=true;
 const request=async q=>{calls.push(q);if(q.path==='/repos/tpruittguitar/office-mailbox')return Response.json({private:privateRepo,full_name:'tpruittguitar/office-mailbox',default_branch:'main'});
 const name=q.path.split('/contents/')[1]?.split('?')[0];assert.ok(name.startsWith('coding-v1/'));
 if(q.method==='GET'&&name==='coding-v1/ready')return Response.json([...files.keys()].filter(k=>/^coding-v1\/ready\/[a-f0-9]{64}\.json$/.test(k)).map(k=>({type:'file',name:k.split('/').at(-1)})));
 if(q.method==='GET'){const row=files.get(name);if(!row)return new Response('',{status:404});return q.accept==='application/vnd.github.raw+json'?new Response(Buffer.from(row.content,'base64')):Response.json({...row,type:'file',encoding:'base64'});}
 assert.equal(q.method,'PUT');assert.equal(q.body.branch,'main');const old=files.get(name);if(old?old.sha!==q.body.sha:!!q.body.sha)return new Response('',{status:409});files.set(name,{sha:String(++sequence),content:q.body.content});return Response.json({},{status:old?200:201});};
 const mailbox=new CodingMailbox(request),jobs=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),status=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),accessKeys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',accessKeys.publicKey);jwk.kid='fixture-key';
 const config={origin,workerId:'designated-worker',binding:{owner:identity.owner,tenant:identity.tenant,provider:'Dot',...scope}};
 const access={issuer:'https://fixture.cloudflareaccess.com',audience:'fixture-audience',subject:'verified-owner',fetcher:async url=>{assert.equal(url,'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});}};
 const signAccess=async(extra={},header={})=>{const h=c.url64(new TextEncoder().encode(JSON.stringify({alg:'RS256',kid:'fixture-key',...header}))),b=c.url64(new TextEncoder().encode(JSON.stringify({iss:access.issuer,sub:access.subject,aud:[access.audience],type:'app',iat:t,exp:t+300,...extra})));const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',accessKeys.privateKey,new TextEncoder().encode(h+'.'+b));return h+'.'+b+'.'+c.url64(new Uint8Array(sig));};
 const handle=createHostedCoding({enabled:true,mailbox,config,access,jobSigningKey:jobs.privateKey,jobVerificationKey:jobs.publicKey,statusVerificationKey:status.publicKey,now:()=>t});
 f.adapter.images=relayImages(mailbox);
 const worker=(ledger=f.store)=>runMailboxOnce({mailbox,config,jobVerificationKey:jobs.publicKey,statusSigningKey:status.privateKey,ledger,adapter:f.adapter,now:()=>t,pollMs:1});
 const body={provider:'Dot',conversationId:scope.conversationId,requestId:'request00000000001',intent:'owner_coding_request',text:'Inspect this synthetic image',attachments:[image]};
 const post=async(token,b=body)=>handle(new Request(config.origin+'/api/agent-coding',{method:'POST',headers:{Origin:config.origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...(token?{'Cf-Access-Jwt-Assertion':token}:{})},body:JSON.stringify(b)}));
 const get=async token=>handle(new Request(config.origin+'/api/agent-coding?'+new URLSearchParams({provider:'Dot',conversationId:scope.conversationId,requestId:body.requestId}),{headers:{'Cf-Access-Jwt-Assertion':token}}));
 return {...f,c,files,calls,mailbox,worker,handle,post,get,signAccess,body,config,jobs,status,advance:n=>t+=n,makePublic:()=>privateRepo=false};
}

async function browserFixture(options) {
 const f=await fixture(options);let expired=false;
 f.service=async request=>{const headers=new Headers(request.headers);headers.set('Cf-Access-Jwt-Assertion',await f.signAccess(expired?{exp:1}:{}));const result=await f.handle(new Request(request,{headers}));if(request.method==='POST'&&result.status===202)f.workerRun=f.worker();return result;};
 f.expire=()=>{expired=true;};return f;
}
module.exports={fixture,browserFixture};
