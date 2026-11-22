// Test-only stdio peer for the installed 0.169.0 JSON schema. No network or AI.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
let cwd,turn=0;const thread='fixture-native-thread-0169',approvals=new Map();
const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
const reply=(m,result)=>send({id:m.id,result});
const native=()=>({modelProvider:'openai',cwd,thread:{id:thread},sandbox:{type:'workspaceWrite',networkAccess:false},approvalPolicy:'on-request',approvalsReviewer:'user'});
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line),p=m.params;
 if(!m.method){const complete=approvals.get(m.id);if(complete){approvals.delete(m.id);complete(m.result?.decision==='accept');}return;}
 if(m.method==='initialized')return;
 if(m.method==='initialize')return reply(m,{userAgent:'codex/0.169.0'});
 if(m.method==='account/read')return reply(m,{account:{type:'chatgpt',email:null,planType:'prolite'},userId:'fixture-native-owner',requiresOpenaiAuth:true});
 if(m.method==='account/rateLimits/read')return reply(m,{accountId:'fixture-native-account',ordinaryUsageAllowed:true,rateLimits:{credits:{hasCredits:false,unlimited:false,balance:'0'}}});
 if(['thread/start','thread/resume'].includes(m.method)){
  if(p.sandbox!=='workspace-write'||p.approvalsReviewer!=='user'||p.approvalPolicy!=='on-request'||m.method==='thread/resume'&&p.threadId!==thread)throw Error('Native scope mismatch');
  cwd=p.cwd;return reply(m,native());
 }
 if(m.method==='turn/start'){
  if(p.threadId!==thread||p.cwd!==cwd||p.sandboxPolicy.networkAccess!==false||p.input[0].type!=='text')throw Error('Bad turn translation');
  const id='native-turn-'+(++turn),text=p.input[0].text;
  const finish=accepted=>{if(accepted){fs.appendFileSync(path.join(cwd,'proof.txt'),'turn-'+turn+'\n');send({method:'item/completed',params:{threadId:thread,turnId:id,item:{type:'fileChange',status:'completed',changes:[{path:path.join(cwd,'proof.txt')}]}}});}send({method:'turn/completed',params:{threadId:thread,turn:{id,status:accepted?'completed':'interrupted'}}});};
  reply(m,{turn:{id,status:'inProgress'}});
  if(text.includes('approval')){const aid='approval-'+turn;approvals.set(aid,finish);send({id:aid,method:'item/fileChange/requestApproval',params:{threadId:thread,turnId:id,itemId:'file-'+turn,startedAtMs:Date.now()}});}else setTimeout(()=>finish(true),10);
  return;
 }
 send({id:m.id,error:{code:-32601,message:'Unsupported fixture method'}});
});
