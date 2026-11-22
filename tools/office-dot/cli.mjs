import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, realpathSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { launchCodex } from './rpc.mjs';
import { PrivateStore } from './store.mjs';
import { DotAdapter } from './adapter.mjs';
import { startLocalServer, ownerIdentity } from './server.mjs';
import { draftPublisher } from './publish.mjs';
const [workspaceArg,stateArg,repository,branch]=process.argv.slice(2);
if(!workspaceArg||!stateArg||!repository||!/^office-coding\/[\w-]{16,80}$/.test(branch||''))throw Error('Usage: node tools/office-dot/cli.mjs WORKSPACE PRIVATE_STATE OWNER/REPO office-coding/BRANCH_ID');
const workspace=realpathSync(workspaceArg),stateDir=path.resolve(stateArg),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(stateDir===root||stateDir.startsWith(root+path.sep)||stateDir===workspace||stateDir.startsWith(workspace+path.sep))throw Error('Private state must be outside served source and coding workspace');
if(execFileSync('git',['branch','--show-current'],{cwd:workspace,encoding:'utf8'}).trim()!==branch)throw Error('Select a dedicated worktree on the exact pilot branch first');
mkdirSync(stateDir,{recursive:true,mode:0o700});const lock=path.join(stateDir,'owner.lock');const fd=openSync(lock,'wx',0o600);closeSync(fd);
let rpc,store,server;
const terminal=readline.createInterface({input:process.stdin,output:process.stdout});
async function close(){await server?.close();rpc?.close();store?.close();terminal.close();try{unlinkSync(lock);}catch{}}
try{
  rpc=launchCodex(process.env.OFFICE_CODEX_COMMAND||'codex');await rpc.initialize();const account=await rpc.includedAccount();
  const identity=ownerIdentity(account.userId,account.accountId);store=new PrivateStore(stateDir);
  const scope={repository,branch,base:'main',sessionId:'office_dot_session_01',conversationId:'office_dot_conversation_01'};
  const old=store.read('config','binding');const binding={workspace,identity,scope};if(store.hasUncertain())throw Error('Reconcile the prior uncertain native turn before starting another session');if(old&&JSON.stringify(old)!==JSON.stringify(binding))throw Error('Private state belongs to another owner/workspace');store.set('config','binding',binding);
  const adapter=new DotAdapter({rpc,store,workspace,identity,scope,verifyWorkspace:()=>{if(execFileSync('git',['branch','--show-current'],{cwd:workspace,encoding:'utf8'}).trim()!==branch)throw Error('Workspace branch changed');const remote=execFileSync('git',['remote','get-url','origin'],{cwd:workspace,encoding:'utf8'}).trim();if(!['https://github.com/'+repository+'.git','https://github.com/'+repository,'git@github.com:'+repository+'.git'].includes(remote))throw Error('Workspace repository changed');},approve:async p=>{
    console.log('Native Codex approval (one time only):',JSON.stringify(p));
    return (await terminal.question('Type accept, decline or cancel: ')).trim();
  },publishDraft:draftPublisher({workspace,stateDir,repository,branch})});
  server=await startLocalServer({root,adapter,store,identity,scope});
  console.log('Open this one-time local Office link:',server.launchUrl);
  console.log('Select ChatGPT Dot. /code sends a coding turn. /code /pr explicitly publishes a draft using existing git/gh login. Native approvals appear here. Ctrl+C stops this local pilot.');
  process.once('SIGINT',()=>close().then(()=>process.exit()));process.once('SIGTERM',()=>close().then(()=>process.exit()));
}catch(e){await close();throw e;}
