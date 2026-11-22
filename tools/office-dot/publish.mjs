import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
// Only the explicit owner command /code /pr calls this. Codex receives no GitHub token.
export function draftPublisher({workspace,stateDir,repository,branch,base='main',execute=execFileSync}) {
  if(!/^[\w-]+\/[\w.-]+$/.test(repository)||!/^office-coding\/[\w-]{16,80}$/.test(branch)||base!=='main')throw Error('Invalid publication scope');
  const run=(cmd,args)=>execute(cmd,args,{cwd:workspace,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
  const git=args=>run('git',['-c','core.hooksPath='+path.join(stateDir,'empty-hooks'),...args]);
  mkdirSync(path.join(stateDir,'empty-hooks'),{recursive:true});
  return async()=>{
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
    if([...files,...untracked].length){git(['add','--',...files,...untracked]);git(['commit','-m','Dot: owner-requested Office coding change']);}
    git(['push','origin','HEAD:refs/heads/'+branch]);
    if(!existing.length){
      const body=path.join(stateDir,'pr-body.md');writeFileSync(body,'Owner-requested changes from the isolated Office Dot workspace. Review the diff and checks before merging. No merge or deployment requested.\n',{mode:0o600});
      run('gh',['pr','create','--repo',repository,'--head',branch,'--base',base,'--draft','--title','Dot: Office coding changes','--body-file',body]);
    }
    const p=JSON.parse(run('gh',['pr','view',branch,'--repo',repository,'--json','number,isDraft,headRefName,baseRefName,url']));
    if(!p.isDraft||p.headRefName!==branch||p.baseRefName!==base||p.url!=='https://github.com/'+repository+'/pull/'+p.number)throw Error('Draft PR verification failed');
    return {draft:true,head:branch,base,url:p.url};
  };
}
