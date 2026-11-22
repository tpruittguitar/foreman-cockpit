import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
const hash = value => createHash('sha256').update(value).digest('hex');

// A clean before-turn boundary plus native completed file-change paths attributes
// the exact diff to this turn. Ambiguous/unsupported changes stay local for review.
export function publicationPlanner(workspace, execute = execFileSync) {
  const root = realpathSync(workspace);
  const git = args => execute('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trimEnd();
  const list = args => git(args).split('\0').filter(Boolean);
  const capture = () => ({ head: git(['rev-parse','HEAD']), clean: git(['status','--porcelain=v1','-z','--untracked-files=all']) === '' });
  function prepare(before, changedPaths) {
    if (!before?.clean || capture().head !== before.head) return null;
    const tracked = list(['diff','--name-only','-z','HEAD','--']);
    const untracked = list(['ls-files','--others','--exclude-standard','-z']);
    const files = [...new Set([...tracked,...untracked])].sort();
    if (!files.length) return null;
    const intended = new Set(changedPaths.map(p => path.resolve(root,p)));
    const entries = [];
    for (const file of files) {
      const absolute = path.resolve(root,file);
      if (!/^[\w./-]+$/.test(file) || !absolute.startsWith(root+path.sep) || !intended.has(absolute) ||
          file.split('/').some(p => p.startsWith('.')) || /(^|[\/_.-])(credentials?|secrets?|tokens?|auth|id_rsa)([\/_.-]|$)/i.test(file)) return null;
      // New files must be native-attested source/docs, never an arbitrary artifact.
      if (untracked.includes(file) && !/\.(?:[cm]?[jt]sx?|css|html|md|txt|json|ya?ml|toml|py|sh|ps1|svg)$/.test(file)) return null;
      let cursor = absolute;
      while (cursor !== root) {
        try { if (lstatSync(cursor).isSymbolicLink() || !realpathSync(cursor).startsWith(root+path.sep)) return null; }
        catch (e) { if(e.code!=='ENOENT') throw e; }
        cursor = path.dirname(cursor);
      }
      const mode = git(['ls-files','--stage','--',file]).split(' ')[0];
      if (['120000','160000'].includes(mode)) return null;
      try {
        const stat=lstatSync(absolute);if(!stat.isFile() || stat.size>10*1024*1024)return null;
        entries.push([file,hash(readFileSync(absolute)),stat.mode & 0o111]);
      } catch(e) { if(e.code!=='ENOENT')throw e;entries.push([file,null]); }
    }
    return { before, files, changedPaths: [...changedPaths], digest: hash(JSON.stringify([before.head,entries])) };
  }
  const verify = plan => { const current=prepare(plan.before,plan.changedPaths);if(!current || current.digest!==plan.digest || JSON.stringify(current.files)!==JSON.stringify(plan.files))throw Error('Publication diff changed'); };
  return { capture, prepare, verify };
}
