const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const commit = process.env.COMMIT_REF || 'local';
// The PR this build came from: Netlify's REVIEW_ID on a deploy preview, else a squash-merge subject ending "(#NN)".
let subject = '';
try { subject = execSync('git log -1 --format=%s', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { subject = ''; }
const subjectPr = (subject.match(/\(#(\d+)\)\s*$/) || [])[1];
const pr = /^\d+$/.test(process.env.REVIEW_ID || '') ? +process.env.REVIEW_ID : subjectPr ? +subjectPr : null;
const info = {
  app: 'Pipeline Explorer',
  release: process.env.PIPELINE_VERSION || 'main',
  commit,
  commitShort: commit === 'local' ? 'local' : commit.slice(0, 7),
  branch: process.env.BRANCH || 'local',
  pr,
  prSource: pr === null ? '' : /^\d+$/.test(process.env.REVIEW_ID || '') ? 'deploy-preview' : 'merge-commit',
  subject: subject.slice(0, 160),
  context: process.env.CONTEXT || 'local',
  deployId: process.env.DEPLOY_ID || '',
  deployUrl: process.env.DEPLOY_URL || '',
  siteUrl: process.env.URL || '',
  builtAt: new Date().toISOString(),
  source: commit === 'local' ? 'source' : 'netlify'
};

fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Pipeline Explorer build ${info.commitShort}${pr ? ' PR #' + pr : ''} (${info.context})`);
