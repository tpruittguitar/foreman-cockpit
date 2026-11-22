// Manual outbound pass only: node tools/office-dot/run-relay.mjs <private-config.json>
// No scheduled service, public listener or production configuration is installed.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import readline from 'node:readline/promises';
import {pathToFileURL} from 'node:url';
import {CodingMailbox,REPO} from '../../lib/office-relay/mailbox.mjs';
import {relayImages} from '../../lib/office-relay/hosted.mjs';
import {runMailboxOnce} from './outbound.mjs';
import {PrivateStore} from './store.mjs';
import {DotAdapter} from './adapter.mjs';
import {launchCodex} from './rpc.mjs';
import {draftPublisher} from './publish.mjs';
export function ghRequest(execute=execFileSync){return async({method,path:apiPath,accept,body})=>{
 if(!(apiPath==='/repos/'+REPO||apiPath.startsWith('/repos/'+REPO+'/contents/coding-v1/')) || !['GET','PUT'].includes(method))throw Error('Fixed private mailbox only');
 const args=['api','--hostname','github.com','--include','--method',method,apiPath,'-H','Accept: '+(accept||'application/vnd.github+json'),'-H','X-GitHub-Api-Version: 2022-11-28',...(body?['--input','-']:[])];
 let output;try{output=execute('gh',args,{input:body?JSON.stringify(body):undefined,encoding:'utf8',maxBuffer:32*1024*1024,timeout:60000,stdio:['pipe','pipe','pipe']});}catch(e){output=e.stdout;if(!output)throw Error('Mailbox request uncertain');}
 const split=String(output).search(/\r?\n\r?\n/),status=Number(String(output).match(/^HTTP\/[\d.]+\s+(\d+)/)?.[1]);if(split<0||!status)throw Error('Invalid GitHub response');
 const text=String(output).slice(split).replace(/^\r?\n\r?\n/,'');return new Response(text,{status});
};}
export async function runConfiguredRelay(config) {
 if(config.binding?.repository!=='tpruittguitar/foreman-cockpit'||config.binding?.base!=='main'||!/^office-coding\/[\w-]{16,80}$/.test(config.binding?.branch||'')||!config.nativeUserId||!config.nativeAccountId||config.jobPublicJwk?.d||!config.statusSigningJwk?.d||(config.jobPublicJwk?.x===config.statusSigningJwk?.x&&config.jobPublicJwk?.y===config.statusSigningJwk?.y))throw Error('Explicit owner/workspace/key binding required');
 const workspace=fs.realpathSync(config.workspace),stateDir=path.resolve(config.stateDir);
 if(stateDir===workspace||stateDir.startsWith(workspace+path.sep))throw Error('Private state must be outside project workspace');
 const verifyWorkspace=()=>{if(fs.realpathSync(config.workspace)!==workspace)throw Error('Workspace moved');const git=args=>execFileSync('git',args,{cwd:workspace,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();if(git(['branch','--show-current'])!==config.binding.branch||!['https://github.com/'+config.binding.repository+'.git','https://github.com/'+config.binding.repository,'git@github.com:'+config.binding.repository+'.git'].includes(git(['remote','get-url','origin'])))throw Error('Workspace repository/branch changed');};
 verifyWorkspace();const alg={name:'ECDSA',namedCurve:'P-256'},jobVerificationKey=await crypto.subtle.importKey('jwk',config.jobPublicJwk,alg,false,['verify']),statusSigningKey=await crypto.subtle.importKey('jwk',config.statusSigningJwk,alg,false,['sign']);
 const mailbox=new CodingMailbox(ghRequest());await mailbox.verifyPrivate();const store=new PrivateStore(stateDir,{recoverNative:false}),rpc=launchCodex('codex',workspace),terminal=readline.createInterface({input:process.stdin,output:process.stdout});
 try {
  await rpc.initialize();const account=await rpc.includedAccount();if(account.userId!==config.nativeUserId||account.accountId!==config.nativeAccountId)throw Error('Native account binding changed');
  const scope=Object.fromEntries(['sessionId','repository','base','branch','conversationId'].map(k=>[k,config.binding[k]]));
  const adapter=new DotAdapter({rpc,store,workspace,verifyWorkspace,scope,identity:{owner:config.binding.owner,tenant:config.binding.tenant,...account},images:relayImages(mailbox),publishDraft:draftPublisher({workspace,stateDir,...scope}),approve:async p=>{
   if(!process.stdin.isTTY)return 'decline'; // unattended: the step is skipped and the turn continues (cancel aborts the whole turn)
   const answer=await terminal.question('Native approval for this turn: '+JSON.stringify(p)+'\nType accept for this action once, or cancel: ');return answer==='accept'?'accept':'cancel';
  }});
  return await runMailboxOnce({mailbox,config,jobVerificationKey,statusSigningKey,ledger:store,adapter});
 }finally{terminal.close();rpc.close();store.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{if(!process.argv[2])throw Error('Private operator configuration path required');console.log(JSON.stringify(await runConfiguredRelay(JSON.parse(fs.readFileSync(process.argv[2],'utf8')))));}catch{console.error('Outbound coding pass stopped; preserve the private ledger and reconcile before retrying.');process.exitCode=1;}
}
