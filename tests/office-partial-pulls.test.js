// Card 3fb0e44: a 403 on one repo's /api/gh pulls must not drop merges from the other repos, or Cursor stays
// "stale · last seen 38 h ago" from its status row while a cursor/ or cursor- merge is minutes old.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../office/office-logic.js');

const office = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.js'), 'utf8');
const MIN = 60000, NOW = Date.parse('2026-11-18T05:31:00Z'), ago = m => new Date(NOW - m * MIN).toISOString();
const cursor = { bot: 'Cursor', status: 'idle', last_action: 'Queued 9:35 job', last_action_at: ago(38 * 60) };

test('without merges, the 38 h status row is stale last-seen; a minutes-old coordination merge makes Cursor working', () => {
  const row = L.botActivity(cursor, NOW, {});
  assert.equal(row.working, false);
  assert.equal(row.source, 'status row');
  assert.equal(row.ageMin, 38 * 60);
  assert.equal(row.label, 'stale · last seen 38 h ago');

  const folded = L.foldRepoPulls(null, { repo: 'foreman-cockpit', error: 'GitHub rate limit reached' }, 'tpruittguitar');
  L.foldRepoPulls(folded, { repo: 'forge-coordination', list: [{ head: { ref: 'cursor-obsfix-fatalerror-this-run' }, merged_at: ago(2), state: 'closed' }] }, 'tpruittguitar');
  L.foldRepoPulls(folded, { repo: 'forge-policy', list: [] }, 'tpruittguitar');
  assert.match(folded.errors.join('; '), /foreman-cockpit/);
  assert.equal(folded.merges.get('cursor'), ago(2));
  const a = L.botActivity(cursor, NOW, { merges: folded.merges });
  assert.equal(a.working, true);
  assert.equal(a.source, 'PR merge');
  assert.equal(a.ageMin, 2);
  assert.equal(a.label, '');
});

test('keepNewerTimes keeps a prior cockpit merge when a later load only gets the other repos', () => {
  const prev = L.prMerges([{ head: { ref: 'cursor/office-break-walk-time' }, merged_at: ago(3) }]);
  const into = L.keepNewerTimes(new Map(), prev);
  const later = L.prMerges([{ head: { ref: 'claude/x' }, merged_at: ago(1) }]);
  L.keepNewerTimes(into, later);
  assert.equal(into.get('cursor'), ago(3));
  assert.equal(into.get('claude'), ago(1));
});

test('loadPulls folds each repo in a try/catch and still fetches when the gate is closed', () => {
  const load = office.slice(office.indexOf('async function loadPulls()'), office.indexOf('function slowLoads'));
  assert.match(load, /L\.foldRepoPulls\(/);
  assert.match(load, /L\.keepNewerTimes\(/);
  assert.match(load, /catch \(e\) \{ L\.foldRepoPulls\(/);
  assert.doesNotMatch(load, /for \(const repo of PR_REPOS\) \{\s*const list = await api\(/);
  const api = office.slice(office.indexOf('async function api(url)'), office.indexOf('async function rawText'));
  assert.doesNotMatch(api, /if \(!gate\.open/);
  assert.match(api, /await fetch\(url/);
});
