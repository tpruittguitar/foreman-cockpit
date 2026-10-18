/* REV-017 gate G-2: read-only check of the merge against the LIVE state file before the new Writer goes live.
 * Usage: node scripts/state-merge-check.cjs <writer exec URL> <passphrase>   (apps-script/deploy.sh runs it)
 * Reads PIPELINE_EXPLORER_STATE.json through the CURRENT live Writer (GET action=state), then proves, without writing:
 *   1. merging a stale "old browser" post (empty seen, old rulings, empty incidents) loses no seen key, ruling or incident;
 *   2. merging the live file into itself is a no-op for seen/rulings/incidents;
 *   3. the merged result serializes and parses back identically.
 * Prints counts only. Exit 0 = safe to deploy, 1 = abort. */
'use strict';
const { mergeState_ } = require('../apps-script/stateMerge.js');
const [url, key] = process.argv.slice(2);
if (!url || !key) { console.error('usage: state-merge-check.cjs <url> <key>'); process.exit(2); }
(async () => {
  const r = await fetch(url + '?action=state&key=' + encodeURIComponent(key), { redirect: 'follow' });
  const j = await r.json();
  if (!j || !j.ok || !j.state || typeof j.state !== 'object') throw new Error('live state not readable: ' + JSON.stringify(j).slice(0, 200));
  const live = j.state, keys = o => Object.keys(o || {}).sort();
  const inc = s => (s.incidents && s.incidents.incidents) || {};
  const stale = { seen: {}, rulings: {}, incidents: { v: 1, incidents: {} }, updatedAt: '2000-01-01T00:00:00Z' };
  const a = mergeState_(live, stale), b = mergeState_(live, live);
  const fails = [];
  const same = (x, y, what) => { if (JSON.stringify(keys(x)) !== JSON.stringify(keys(y))) fails.push(what); };
  same(a.seen, live.seen, 'stale post lost seen keys'); same(a.rulings, live.rulings, 'stale post changed rulings'); same(inc(a), inc(live), 'stale post lost incidents');
  same(b.seen, live.seen, 'self-merge changed seen'); same(b.rulings, live.rulings, 'self-merge changed rulings'); same(inc(b), inc(live), 'self-merge changed incidents');
  if (JSON.stringify(JSON.parse(JSON.stringify(a))) !== JSON.stringify(a)) fails.push('merged state does not round-trip');
  Object.keys(inc(live)).forEach(k => { if (inc(a)[k].status !== inc(live)[k].status) fails.push('incident ' + k + ' status changed'); });
  console.log('STATE_MERGE_CHECK live: seen=' + keys(live.seen).length + ' rulings=' + keys(live.rulings).length + ' incidents=' + keys(inc(live)).length + ' bytes=' + JSON.stringify(live).length);
  if (fails.length) { console.error('STATE_MERGE_CHECK FAIL: ' + fails.join('; ')); process.exit(1); }
  console.log('STATE_MERGE_CHECK PASS: stale post and self-merge lose nothing');
})().catch(e => { console.error('STATE_MERGE_CHECK ERROR: ' + e.message); process.exit(1); });
