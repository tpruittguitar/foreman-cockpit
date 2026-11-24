// QA #407 fix-up: one activity function (L.botActivity) feeds the list view, the name tags and the 3D plan; PR merges count as a
// fresh signal; a fresh bot holds the work plan and is off work no more than WORK_BREAK_MAX_S in any 3 minutes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../office/office-logic.js');

const office = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.js'), 'utf8');
const MIN = 60000, NOW = Date.parse('2026-11-18T05:15:00Z'), ago = m => new Date(NOW - m * MIN).toISOString();
const NAMES = ['President', 'QA', 'Claude', 'ChatGPT', 'Root', 'Usage', 'Cursor', 'Comp', 'Archive', 'Gauge'];

test('a fresh bot is off work no more than 45 s in any simulated 3 min, whatever its status says', () => {
  assert.equal(L.WORK_BREAK_MAX_S, 45);
  for (let start = 0; start < 6 * 3600; start += 997) {
    const off = Object.fromEntries(NAMES.map(n => [n, 0]));
    const rows = NAMES.map((n, i) => ({ bot: n, bot_id: '00000000-0000-4000-8000-' + String(100000000000 + i).slice(-12), status: i % 2 ? 'idle' : 'working', last_action: 'Pinned a card on the board', last_action_at: new Date(NOW + start * 1000 - (6 + i * 2) * MIN).toISOString() }));
    for (let s = 0; s < 180; s++) {
      const at = NOW + (start + s) * 1000;
      const ctx = { screens: L.parseScreensIndex({ updated_at: new Date(at).toISOString(), screens: Object.fromEntries(rows.map((b, i) => [b.bot_id, { at: new Date(at - (3 + i) * MIN).toISOString(), busy: true, activeAt: new Date(at - (3 + i) * MIN).toISOString(), task: 'card ' + b.bot }])) }) };
      const fresh = Object.fromEntries(rows.map(b => [b.bot, L.botActivity(b, at, ctx)]));
      const p = L.planOffice(rows, [], at, 'live', fresh).plans;
      for (const n of NAMES) if (p[n].act !== 'work') { off[n]++; assert.ok(p[n].brk, n + ' off work without a break: ' + p[n].act); }
    }
    for (const n of NAMES) assert.ok(off[n] <= L.WORK_BREAK_MAX_S, `${n} off work ${off[n]} s from +${start} s`);
  }
});

test('the list view, the name tags and the 3D plan read the same activity function', () => {
  assert.match(office, /function freshOf\(b, now, ctx\) \{ return L\.botActivity\(withRoutine\(b\), now \|\| Date\.now\(\), ctx \|\| signalCtx\(\)\); \}/);
  assert.match(office, /function stWord\(b\) \{ const act = freshOf\(b\), st = act\.blocked/);
  assert.match(office, /S\.fresh = Object\.fromEntries\(list\.map\(b => \[b\.bot, freshOf\(b, now, ctx\)\]\)\);/);
  assert.doesNotMatch(office, /L\.freshness\(|L\.botSignals\(/, 'no second copy of the activity read');
  assert.match(office, /activity: Object\.fromEntries\(Object\.entries\(S\.fresh\)/, '__office.info() exposes plan and signal per bot');
  const rootId = '70f0889b-ecd4-457b-a69c-304cd2aff540', usageId = 'f1a70b7a-6051-45d7-8031-e46a4cba066f';
  const rows = [{ bot: 'Root', bot_id: rootId, status: 'idle', last_action_at: ago(5) }, { bot: 'Usage', bot_id: usageId, status: 'idle', last_action_at: ago(200) }];
  const ctx = { screens: L.parseScreensIndex({ updated_at: ago(0), screens: { [rootId]: { at: ago(5), busy: true, activeAt: ago(5), task: 'live card' } } }) };
  const fresh = Object.fromEntries(rows.map(b => [b.bot, L.botActivity(b, NOW, ctx)])), p = L.planOffice(rows, [], NOW, 'live', fresh).plans;
  assert.equal(fresh.Root.working, true); assert.ok(p.Root.act === 'work' || p.Root.brk, p.Root.act);
  assert.equal(fresh.Usage.working, false); assert.ok(!['work'].includes(p.Usage.act) && !p.Usage.brk, p.Usage.act);
});

test('a PR merge by the bot\'s branch is a fresh signal, across repos, newest wins', () => {
  const m = L.prMerges([{ head: { ref: 'cursor-obsfix-publish-progress' }, merged_at: ago(80) }, { head: { ref: 'claude/office-x' }, merged_at: null }]);
  L.prMerges([{ head: { ref: 'cursor/office-one-activity' }, merged_at: ago(20) }, { head: { ref: 'fix/thing' }, merged_at: ago(1) }], m);
  assert.equal(m.get('cursor'), ago(20)); assert.equal(m.has('claude'), false);
  const cursor = { bot: 'Cursor', status: 'idle', last_action_at: ago(38 * 60) };
  assert.equal(L.botActivity(cursor, NOW, {}).working, false);
  const a = L.botActivity(cursor, NOW, { merges: m });
  assert.equal(a.working, false, 'cs-ffe2ed7d: a merge is a freshness signal, not a working pose');
  assert.equal(a.state, 'idle');
  assert.equal(a.source, 'PR merge'); assert.equal(a.ageMin, 20);
});
