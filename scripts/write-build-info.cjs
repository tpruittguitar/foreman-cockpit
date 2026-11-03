const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
// Cloudflare Pages build variables (Netlify retired 2026-11-03).
const commit = process.env.CF_PAGES_COMMIT_SHA || 'local';
// The PR this build came from: a squash-merge subject ending "(#NN)"; preview builds carry their branch name.
let subject = '';
try { subject = execSync('git log -1 --format=%s', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { subject = ''; }
const subjectPr = (subject.match(/\(#(\d+)\)\s*$/) || [])[1];
const pr = subjectPr ? +subjectPr : null;
const branch = process.env.CF_PAGES_BRANCH || 'local';
const info = {
  app: 'Pipeline Explorer',
  release: process.env.PIPELINE_VERSION || 'main',
  commit,
  commitShort: commit === 'local' ? 'local' : commit.slice(0, 7),
  branch,
  pr,
  prSource: pr === null ? '' : 'merge-commit',
  subject: subject.slice(0, 160),
  context: commit === 'local' ? 'local' : branch === 'main' ? 'production' : 'preview',
  deployId: '',
  deployUrl: process.env.CF_PAGES_URL || '',
  siteUrl: 'https://foreman-cockpit.pages.dev',
  builtAt: new Date().toISOString(),
  source: commit === 'local' ? 'source' : 'cloudflare-pages'
};

fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Pipeline Explorer build ${info.commitShort}${pr ? ' PR #' + pr : ''} (${info.context})`);
