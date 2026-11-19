const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
// PR number from a commit subject: squash-merge "... (#NNN)" or a leading "#NNN ..."; null when neither is present.
function prFromSubject(subject) {
  const s = String(subject || '').trim();
  const m = s.match(/\(#(\d+)\)\s*$/) || s.match(/^#(\d+)\b/);
  return m ? +m[1] : null;
}
function prTitleFromSubject(subject) {
  return String(subject || '').replace(/\s*\(#\d+\)\s*$/, '').trim();
}
function parseGitLog(subject, body, commitAt) {
  return {
    pr: prFromSubject(subject),
    prTitle: prTitleFromSubject(subject),
    mergedAt: commitAt && !Number.isNaN(Date.parse(commitAt)) ? new Date(commitAt).toISOString() : ''
  };
}
module.exports = { prFromSubject, prTitleFromSubject, parseGitLog };
if (require.main !== module) return;

const commit = process.env.CF_PAGES_COMMIT_SHA || 'local';
let subject = '';
let body = '';
let mergedAt = '';
try {
  const out = execSync('git log -1 --format=%s%x00%b%x00%cI', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const parts = out.split('\x00');
  subject = parts[0] || '';
  body = parts[1] || '';
  mergedAt = (parts[2] || '').trim();
} catch (e) {
  subject = '';
  body = '';
  mergedAt = '';
}
const parsed = parseGitLog(subject, body, mergedAt);
const branch = process.env.CF_PAGES_BRANCH || 'local';
const info = {
  app: 'Pipeline Explorer',
  release: process.env.PIPELINE_VERSION || 'main',
  commit,
  commitShort: commit === 'local' ? 'local' : commit.slice(0, 7),
  branch,
  pr: parsed.pr,
  prSource: parsed.pr === null ? '' : 'merge-commit',
  prTitle: parsed.prTitle,
  mergedAt: parsed.mergedAt,
  subject: subject.slice(0, 160),
  context: commit === 'local' ? 'source' : branch === 'main' ? 'production' : 'preview',
  deployId: '',
  deployUrl: process.env.CF_PAGES_URL || '',
  siteUrl: 'https://foreman-cockpit.pages.dev',
  builtAt: new Date().toISOString(),
  source: commit === 'local' ? 'source' : 'cloudflare-pages'
};

fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Pipeline Explorer build ${info.commitShort}${parsed.pr ? ' PR #' + parsed.pr : ''} (${info.context})`);
