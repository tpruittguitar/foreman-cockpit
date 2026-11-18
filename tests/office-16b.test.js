// Item 16b: each bot's pose follows the freshest real signal; stale after 2 h. Run: node --test tests/office-16b.test.js
// Fixtures are EXAMPLE data only.
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const NOW = Date.parse('2026-11-16T07:10:00Z');
const MIN = 60000;
const ago = m => new Date(NOW - m * MIN).toISOString();
const bot = (name, status, mins, extra) => Object.assign({ bot: name, bot_id: 'id-' + name, status, last_action: 'EXAMPLE step', last_action_at: mins == null ? '' : ago(mins) }, extra);
const plan = list => L.planOffice(list, [], NOW, 'live', Object.fromEntries(list.map(b => [b.bot, L.freshness(b, NOW)]))).plans;

test('fresh working bot keeps the working pose', () => {
  const b = bot('Claude', 'working', 5), f = L.freshness(b, NOW);
  assert.deepEqual([f.stale, f.ageMin, f.label], [false, 5, '']);
  assert.ok(['work', 'stretch', 'coffee', 'fridge', 'visitdesk', 'wander'].includes(plan([b]).Claude.act));
  assert.notEqual(plan([b]).Claude.act, 'stale');
});

test('working but 3 h old: stale wins, not typing, label says so', () => {
  const b = bot('Claude', 'working', 180), f = L.freshness(b, NOW);
  assert.equal(f.stale, true);
  assert.equal(f.label, 'stale · last seen 3 h ago');
  assert.equal(plan([b]).Claude.act, 'stale');
  // just over the 2 h line is stale, exactly 2 h is still fresh
  assert.equal(L.freshness(bot('A', 'working', 120), NOW).stale, false);
  assert.equal(L.freshness(bot('A', 'working', 121), NOW).stale, true);
});

test('newest of several signals wins (row, screen, work, PR, Actions, terminal mirror)', () => {
  const b = bot('Comp', 'working', 300, { screen: { title: 't', lines: [], updated_at: ago(200) }, work: [{ at: ago(150) }] });
  assert.equal(L.freshness(b, NOW).ageMin, 150);
  assert.equal(L.freshness(b, NOW, [ago(400), ago(30)]).ageMin, 30, 'an extra signal can make it fresh');
  assert.equal(L.freshness(b, NOW, [ago(30)]).stale, false);
  assert.equal(L.freshness(b, NOW, [new Date(NOW + 60 * MIN).toISOString()]).ageMin, 150, 'future times are ignored');
  // extra signals gathered from data the page already reads
  const prs = L.prTimes('o', 'r', [{ number: 7, updated_at: ago(20) }, { number: 8, updated_at: ago(1) }]);
  const ctx = {
    items: [{ owner: 'Comp', link: 'https://github.com/o/r/pull/7' }, { owner: 'Other', link: 'https://github.com/o/r/pull/8' }],
    prTimes: prs, screens: { screens: { 'id-Comp': { at: ago(40), paused: false } } },
    auto: { rows: [{ ai: 'Comp', last_run_at: ago(60), running: false, started_at: '' }] }
  };
  const sig = L.botSignals(b, ctx);
  assert.equal(L.freshness(b, NOW, sig).ageMin, 20, 'own PR activity (not another bot\'s) is the newest');
  assert.equal(plan([b])['Comp'].act, 'stale', 'row signals alone are stale');
});

test('missing timestamps and no other signal: stale with "no activity feed" (Root, Nov 17)', () => {
  const f = L.freshness(bot('GUI', 'working', null), NOW);
  assert.deepEqual([f.stale, f.lastSeen, f.ageMin, f.label], [true, null, null, 'no activity feed']);
  assert.equal(L.freshness(null, NOW).label, 'no activity feed');
  assert.equal(L.freshness({ bot: 'x', last_action_at: 'not a date' }, NOW).stale, true);
  assert.equal(plan([bot('GUI', 'idle', null)]).GUI.act, 'stale');
});

test('alert (Needs Tim) bots are unaffected by staleness', () => {
  const b = bot('Root', 'needs_tim', 600, { question: 'EXAMPLE: merge?' }), p = L.parseStatus({ bots: [b] }).bots[0];
  assert.equal(L.freshness(p, NOW).stale, true);
  assert.equal(L.planOffice([p], [], NOW, 'live', { Root: L.freshness(p, NOW) }).plans.Root.act, 'wave');
});

test('without freshness data planOffice behaves as before', () => {
  assert.equal(L.planOffice([bot('Claude', 'working', 600)], [], NOW, 'live').plans.Claude.act !== 'stale', true);
});
