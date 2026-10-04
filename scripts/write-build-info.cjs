const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const commit = process.env.COMMIT_REF || 'local';
const info = {
  app: 'Pipeline Explorer',
  release: process.env.PIPELINE_VERSION || 'main',
  commit,
  commitShort: commit === 'local' ? 'local' : commit.slice(0, 7),
  branch: process.env.BRANCH || 'local',
  context: process.env.CONTEXT || 'local',
  deployId: process.env.DEPLOY_ID || '',
  deployUrl: process.env.DEPLOY_URL || '',
  siteUrl: process.env.URL || '',
  builtAt: new Date().toISOString(),
  source: commit === 'local' ? 'source' : 'netlify'
};

fs.writeFileSync(path.join(root, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Pipeline Explorer build ${info.commitShort} (${info.context})`);
