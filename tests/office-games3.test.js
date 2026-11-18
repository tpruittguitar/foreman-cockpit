// games3 (QA fail on #385; Tim, Nov 17 9:48 PM ET, final): a bot looks working ONLY with a fresh real activity signal
// (freshness() over its row, PR, screen and automation times, newest within BOT_STALE_MIN). Status or an assigned card alone never
// makes it look working; every other bot lives the idle rotation. Run: node --test tests/office-games3.test.js
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
const MIN = 60000, NOW = Date.parse('2026-11-18T05:00:00Z'), ago = m => new Date(NOW - m * MIN).toISOString();
const ROSTER = ['President', 'Root', 'Cursor', 'GUI', 'QA bot', 'Sniffer', 'Comp', 'Archive', 'Claude', 'ChatGPT', 'Usage Budget', 'HR', 'Gauge', 'Edgar'];
const IDS = { President: '431e8cf1-f077-4548-82b7-46c1959dc4c9', 'Usage Budget': 'f1a70b7a-6051-45d7-8031-e46a4cba066f' };
const row = (n, status, min) => ({ bot: n, bot_id: IDS[n] || '', status, last_action: min == null ? 'seeded' : 'did a thing', last_action_at: min == null ? ago(2 * 1440) : ago(min) });
const plan = (rows, at) => L.planOffice(rows, [], at || NOW, 'live', Object.fromEntries(rows.map(b => [b.bot, L.freshness(b, at || NOW)]))).plans;
const IDLE_LIFE = new Set(['wander', 'coffee', 'chat', 'fridge', 'lounge', 'bike', 'sleep', 'visitdesk', 'game']);

test('(1) no fresh signal: every bot gets idle life, and video_game comes up in the first rotation', () => {
  const rows = ROSTER.map((n, i) => row(n, i % 2 ? 'working' : 'idle', i % 3 ? null : 300));
  const p = plan(rows);
  for (const n of ROSTER) if (n !== 'HR') assert.ok(IDLE_LIFE.has(p[n].act) || ['train', 'listen'].includes(p[n].act), n + ' -> ' + p[n].act);
  let gamers = 0, firstGame = Infinity;
  ROSTER.forEach((n, i) => {
    const b = row(n, 'idle', null), st = L.createIdleState(); st.sinceGame = L.firstGameSlot(b, gamers); if (L.showsGame(b)) gamers++;
    if (L.idleTick(st, L.makeRng(i + 1), 0, {}) === 'video_game') firstGame = 0;
  });
  assert.equal(firstGame, 0, 'at least one bot games on its first idle activity (well inside ~2 min)');
  assert.match(office, /if \(!p\.brk && IDLE_PLAN\.has\(p\.act\)\) return idleGoal\(c, d, slotted\);/, 'status "working" no longer blocks the idle rotation');
});

test('(2) a fresh activity signal never shows idle or asleep, whatever the status says', () => {
  for (const status of ['working', 'idle', '']) {
    const rows = ROSTER.map(n => row(n, status, 5));
    for (let s = 0; s < 3600; s += 7) {
      const p = plan(rows, NOW + s * 1000);
      for (const n of ROSTER) {
        if (n === 'HR' || ['replay', 'replay_board'].includes(p[n].act)) continue;
        assert.ok(!['sleep', 'game', 'lounge', 'chat'].includes(p[n].act), n + ' ' + status + ' -> ' + p[n].act);
        assert.ok(p[n].act === 'work' || p[n].brk, n + ' only short work breaks: ' + p[n].act);
      }
    }
  }
});

test('(3) owning an open checksheet card without a fresh signal still shows idle; an assignment never starts a work walk', () => {
  const owner = Object.assign(row('Comp', 'working', 400), { work: [{ id: 'cs-1', at: '' }] });
  const p = L.planOffice([owner], [], NOW, 'live', { Comp: L.freshness(owner, NOW, L.botSignals(owner, { items: [{ owner: 'Comp', id: 'cs-1', link: '' }] })) }).plans;
  assert.ok(IDLE_LIFE.has(p.Comp.act), p.Comp.act);
  assert.doesNotMatch(office, /S\.fresh\[p\.bot\]/, 'a stale bot still carries a new card (#408): the job is only board -> desk, never typing');
  assert.match(office, /if \(j\.phase === 'deliver'\) return \{ key, spot: d\.seat, pose: 'sit' \};/);
  assert.doesNotMatch(office, /IDLE_PLAN\.has\(p\.act\) && L\.statusStyle\(b\.status\)\.behavior !== 'work'/);
});

test('offline screen label ends with ET', () => {
  assert.match(L.offlineSinceLabel('2026-11-18T01:50:00Z'), / ET$/);
});
