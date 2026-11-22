const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const defaultOrigin='http://127.0.0.1:12481',scope={repository:'example/project',branch:'office-coding/image_fixture_001',base:'main',sessionId:'session00000000001',conversationId:'conversation00001'};
const identity={owner:'owner000000000001',tenant:'tenant00000000001',userId:'fixture',accountId:'fixture'};
// Generated single-pixel PNG fixture, never an owner attachment.
const image={name:'synthetic.png',type:'image/png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTf8AAAAASUVORK5CYII='};
async function setup({origin=defaultOrigin}={}){
 const [{PrivateStore},{privateImages},{DotAdapter},{createCodingService}]=await Promise.all([import('../../tools/office-dot/store.mjs'),import('../../tools/office-dot/images.mjs'),import('../../tools/office-dot/adapter.mjs'),import('../../lib/office-coding.mjs')]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-image-')),store=new PrivateStore(dir),images=privateImages(store),rpc=new EventEmitter();rpc.inputs=[];rpc.send=()=>{};rpc.includedAccount=async()=>identity;
 rpc.request=async(method,p)=>{if(method==='thread/start'||method==='thread/resume')return {thread:{id:'thread'},modelProvider:'openai',cwd:dir,sandbox:{type:'workspaceWrite',networkAccess:false},approvalsReviewer:'user',approvalPolicy:'on-request'};if(method==='turn/start'){rpc.inputs.push(p.input);setTimeout(()=>{for(const stage of ['approach','outcome'])rpc.emit('approval',{id:stage,method:'item/tool/call',params:{threadId:'thread',turnId:'turn',callId:stage,tool:'office_route',arguments:{stage,route:'diagnose',summary:stage==='approach'?'I will inspect the screenshot and explain the finding.':'Inspected the synthetic screenshot.'}}});rpc.emit('notification',{method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}});},0);return {turn:{id:'turn'}};}throw Error(method);};
 const adapter=new DotAdapter({rpc,store,images,workspace:dir,identity,scope});let authenticated=true;
 const principal={...identity,role:'owner',sessions:{Dot:{[scope.conversationId]:scope}}};
 const service=createCodingService({origin,authenticate:async()=>authenticated?principal:null,store,images,adapters:{Dot:adapter}});
 const body={provider:'Dot',conversationId:scope.conversationId,requestId:'request00000000001',intent:'owner_coding_request',text:'Explain the marked screenshot; no edit needed',attachments:[image]};
 const post=(b=body)=>service(new Request(origin+'/api/agent-coding',{method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify(b)}));
 return {body,store,images,adapter,rpc,post,service,principal,expire:()=>authenticated=false,async close(){await adapter.queue;store.close();fs.rmSync(dir,{recursive:true,force:true});}};
}

module.exports={setup,image,scope,identity,origin:defaultOrigin};
