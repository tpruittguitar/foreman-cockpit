import path from 'node:path';
const key = b => JSON.stringify([b.tenant,b.owner,b.provider,b.conversationId,b.requestId]);
const fixed = b => Object.fromEntries(['tenant','owner','provider','conversationId','requestId','sessionId','repository','base','branch'].map(k=>[k,b[k]]));

export class DotAdapter {
  constructor({ rpc, store, workspace, identity, scope, approve = async () => 'cancel', publishDraft, verifyWorkspace = () => {} }) {
    Object.assign(this,{rpc,store,workspace:path.resolve(workspace),identity,scope,approve,publishDraft,verifyWorkspace});
    this.queue=Promise.resolve(); this.active=null; this.blocked=false; this.finished=new Map(); this.earlyApprovals=[];
    rpc.on('notification', m => {
      if(m.method==='turn/completed' && this.active && m.params.threadId===this.active.threadId) {
        this.finished.set(m.params.turn.id,m.params.turn.status); this.active.wake?.();
      }
    });
    rpc.on('approval', m => this.onApproval(m));
    rpc.on('disconnected',()=>{ if(this.active){this.active.disconnected=true;this.active.wake?.();} });
  }
  verify(b) {
    if (b.provider!=='Dot' || b.owner!==this.identity.owner || b.tenant!==this.identity.tenant || Object.keys(this.scope).some(k=>b[k]!==this.scope[k])) throw Error('Scope mismatch');
  }
  async submit(job) {
    this.verify(job); this.verifyWorkspace(); if(this.blocked || this.store.hasUncertain())throw Error('Reconcile the uncertain native turn first'); const k=key(job); if(this.store.read('native',k)) return;
    this.store.set('native',k,{...fixed(job),status:'queued'});
    this.queue=this.queue.then(()=>this.run(job)).catch(()=>{this.blocked=true;this.store.set('native',k,{...fixed(job),status:'unknown'});});
  }
  async status(b) { this.verify(b); const j=this.store.read('native',key(b)); if(!j)throw Error('Unknown native request'); return j; }
  async onApproval(m) {
    const p=m.params||{}, a=this.active;
    // An approval must belong to this exact active native turn. No permission grants,
    // persistent approval amendments, other roots, provider substitutions or auto-accept.
    if(a && p.threadId===a.threadId && !a.turnId) { this.earlyApprovals.push(m); return; }
    const supported=['item/fileChange/requestApproval','item/commandExecution/requestApproval'].includes(m.method);
    if(!a || p.threadId!==a.threadId || p.turnId!==a.turnId || !supported || p.grantRoot || p.networkApprovalContext ||
       p.proposedExecpolicyAmendment || p.proposedNetworkPolicyAmendments || (p.cwd && path.resolve(p.cwd)!==this.workspace)) {
      this.rpc.send({id:m.id,...(supported?{result:{decision:'cancel'}}:{error:{code:-32601,message:'Permission expansion unavailable'}})});return;
    }
    this.store.set('native',a.key,{...fixed(a.job),threadId:a.threadId,turnId:a.turnId,status:'awaiting_approval'});
    const approvalKey=JSON.stringify([a.key,m.id]);
    this.store.set('approval',approvalKey,{method:m.method,threadId:p.threadId,turnId:p.turnId,itemId:p.itemId,decision:'pending'});
    let decision='cancel';
    try { decision=await this.approve({method:m.method,itemId:p.itemId,threadId:p.threadId,turnId:p.turnId,command:p.command,reason:p.reason,cwd:p.cwd}); } catch {}
    if(!['accept','decline','cancel'].includes(decision))decision='cancel';
    if(this.active!==a || a.disconnected) decision='cancel';
    this.store.set('approval',approvalKey,{method:m.method,threadId:p.threadId,turnId:p.turnId,itemId:p.itemId,decision});
    this.rpc.send({id:m.id,result:{decision}});
  }
  async run(job) {
    this.verifyWorkspace(); if(this.blocked || this.store.hasUncertain())throw Error('Reconcile the uncertain native turn first');
    const k=key(job); const prior=this.store.read('native',k); if(prior.status!=='queued')return;
    if(job.text.trim()==='/pr') {
      if(!this.publishDraft) {this.store.set('native',k,{...fixed(job),status:'awaiting_review'});return;}
      const pr=await this.publishDraft();this.store.set('native',k,{...fixed(job),status:'completed',pullRequest:pr});return;
    }
    const account=await this.rpc.includedAccount(); if(account.userId!==this.identity.userId || account.accountId!==this.identity.accountId)throw Error('Native account changed');
    const saved=this.store.read('session',this.scope.sessionId);
    const options={modelProvider:'openai',cwd:this.workspace,sandbox:'workspace-write',approvalPolicy:'on-request',approvalsReviewer:'user',config:{
      'allow_login_shell':false,'sandbox_workspace_write.network_access':false,'sandbox_workspace_write.exclude_slash_tmp':true,
      'sandbox_workspace_write.exclude_tmpdir_env_var':true,'web_search':'disabled','features.apps':false,'mcp_servers':{}
    }};
    const native=await this.rpc.request(saved?'thread/resume':'thread/start',saved?{...options,threadId:saved.threadId}:{...options,ephemeral:false,developerInstructions:'Work only in this dedicated coding workspace. Do not read credentials or private chat logs. Do not push, publish, merge, deploy, change permissions or use external services. The owner-controlled local bridge handles draft PR publication.'});
    if(native.modelProvider!=='openai' || path.resolve(native.cwd)!==this.workspace || native.sandbox?.type!=='workspaceWrite' || native.sandbox.networkAccess!==false || (native.sandbox.writableRoots||[]).some(p=>path.resolve(p)!==this.workspace) || native.approvalsReviewer!=='user' || native.approvalPolicy!=='on-request' || !native.thread?.id || (saved && saved.threadId!==native.thread.id))throw Error('Native scope not enforced');
    const threadId=native.thread.id;this.store.set('session',this.scope.sessionId,{threadId});
    const active=this.active={key:k,threadId,job,turnId:null};
    // Persist before sending. An interrupted dispatch stays unknown, never replayed.
    this.store.set('native',k,{...fixed(job),threadId,status:'running'});
    const r=await this.rpc.request('turn/start',{threadId,cwd:this.workspace,input:[{type:'text',text:job.text}],approvalPolicy:'on-request',approvalsReviewer:'user',
      sandboxPolicy:{type:'workspaceWrite',writableRoots:[this.workspace],networkAccess:false,excludeSlashTmp:true,excludeTmpdirEnvVar:true}});
    active.turnId=r.turn.id; this.store.set('native',k,{...fixed(job),threadId,turnId:r.turn.id,status:'running'});
    for(const message of this.earlyApprovals.splice(0)) this.onApproval(message);
    const deadline=Date.now()+10*60*1000;
    while(!this.finished.has(r.turn.id)&&!active.disconnected&&Date.now()<deadline)await new Promise(resolve=>{active.wake=resolve;setTimeout(resolve,250);});
    const result=this.finished.get(r.turn.id);if(!result)this.blocked=true;this.finished.delete(r.turn.id);this.active=null;
    this.store.set('native',k,{...fixed(job),threadId,turnId:r.turn.id,status:result==='completed'?'awaiting_review':result?'failed':'unknown'});
  }
}
