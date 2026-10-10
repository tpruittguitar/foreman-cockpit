const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const source = path.join(__dirname, '..', 'functions', 'api', 'structured', '[[path]].js');
const temp = path.join(os.tmpdir(), 'foreman-cloudflare-structured-check.mjs');
fs.writeFileSync(temp, fs.readFileSync(source, 'utf8'));
const result = spawnSync(process.execPath, ['--check', temp], { stdio: 'inherit' });
try { fs.unlinkSync(temp); } catch {}
process.exit(result.status ?? 1);
