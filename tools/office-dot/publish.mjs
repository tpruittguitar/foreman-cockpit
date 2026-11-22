import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { publicationPlanner } from './publication-plan.mjs';
// Called after a verified owner edit or explicit legacy /code /pr. Codex receives no GitHub token.
export function draftPublisher({workspace,stateDir,repository,branch,base='main',label='Dot',execute=execFileSync}) {
  if(!/^[\w-]+\/[\w.-]+$/.test(repository)||!/^office-coding\/[\w-]{16,80}$/.test(branch)||base!=='main')throw Error('Invalid publication scope');
  const run=(cmd,args)=>execute(cmd,args,{cwd:workspace,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
  const git=args=>run('git',['-c','core.hooksPath='+path.join(stateDir,'empty-hooks'),...args]);
  mkdirSync(path.join(stateDir,'empty-hooks'),{recursive:true});
  const planner=publicationPlanner(workspace,execute);
  const publish=async(plan)=>{
    if(plan)planner.verify(plan);
    if(git(['branch','--show-current'])!==branch)throw Error('Branch changed');
    const remote=git(['remote','get-url','origin']);
    if(!['https://github.com/'+repository+'.git','https://github.com/'+repository,'git@github.com:'+repository+'.git'].includes(remote))throw Error('Repository changed');
    const existing=JSON.parse(run('gh',['pr','list','--repo',repository,'--head',branch,'--base',base,'--state','open','--json','number,isDraft,headRefName,baseRefName,url']));
    if(existing.length>1||existing.some(p=>!p.isDraft || p.headRefName!==branch || p.baseRefName!==base))throw Error('Existing PR is not an unambiguous draft');
    // Exclude credential-bearing URLs, submodules, links and path escapes.
    const files=git(['diff','--name-only','HEAD','--']).split('\n').filter(Boolean);
    const untracked=git(['ls-files','--others','--exclude-standard']).split('\n').filter(Boolean);
    for(const file of [...files,...untracked]){
      const resolved=path.resolve(workspace,file);if(!resolved.startsWith(realpathSync(workspace)+path.sep)||/^(\.git|\.env)(\/|$)/.test(file))throw Error('Unsafe publication path');
      try{if(lstatSync(resolved).isSymbolicLink()||!realpathSync(resolved).startsWith(realpathSync(workspace)+path.sep))throw Error('Links cannot be published');}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    if(plan)planner.verify(plan);
    if([...files,...untracked].length){
      const selected=plan?plan.files:[...files,...untracked];
      git(['add','--',...selected]);
      if(plan)planner.verify(plan);
      const stagedTree=plan?git(['write-tree']):null;
      // Preserve configured identity, or use a clearly synthetic command-local author.
      let authorName='',authorEmail='';try{authorName=git(['config','--get','user.name']);}catch{}try{authorEmail=git(['config','--get','user.email']);}catch{}
      if(!authorName || /[\r\n]/.test(authorName))authorName=label==='Dot'?'ChatGPT Dot':label;
      if(!/^[^\s@]+@[^\s@]+$/.test(authorEmail))authorEmail='office-dot@localhost.invalid';
      git(['-c','user.name='+authorName,'-c','user.email='+authorEmail,'commit','-m',label+': owner-requested Office coding change']);
      if(plan && git(['rev-parse','HEAD^{tree}'])!==stagedTree)throw Error('Committed tree changed');
      if(plan && git(['status','--porcelain=v1','--untracked-files=all']))throw Error('Workspace changed during commit');
    }
    git(['push','origin','HEAD:refs/heads/'+branch]);
    if(!existing.length){
      const body=path.join(stateDir,'pr-body.md');writeFileSync(body,'Owner-requested changes from the isolated Office '+label+' workspace. Review the diff and checks before merging. No merge or deployment requested.\n',{mode:0o600});
      run('gh',['pr','create','--repo',repository,'--head',branch,'--base',base,'--draft','--title',label+': Office coding changes','--body-file',body]);
    }
    const p=JSON.parse(run('gh',['pr','view',branch,'--repo',repository,'--json','number,isDraft,headRefName,headRefOid,baseRefName,url']));
    const head=git(['rev-parse','HEAD']);
    const remoteHead=git(['ls-remote','origin','refs/heads/'+branch]).split(/\s/)[0];
    if(p.headRefOid!==head || remoteHead!==head)throw Error('Remote publication head mismatch');
    if(!p.isDraft||p.headRefName!==branch||p.baseRefName!==base||p.url!=='https://github.com/'+repository+'/pull/'+p.number)throw Error('Draft PR verification failed');
    run('gh',['api','--method','PATCH','repos/'+repository+'/pulls/'+p.number,'-f','title='+label+' #'+p.number+': Office coding changes']);
    return {draft:true,head:branch,base,url:p.url};
  };
  return Object.assign(publish,{capture:planner.capture,prepare:planner.prepare});
}
