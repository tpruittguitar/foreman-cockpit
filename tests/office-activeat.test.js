// Root's spec (Nov 17, 10:00 PM ET): botSignals reads the office-screens activeAt (when the bot last really worked) instead of the
// capture time, and a row with no signal source says "no activity feed". Run: node --test tests/office-activeat.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const MIN = 60000, NOW = Date.parse('2026-11-18T05:00:00Z'), ago = m => new Date(NOW - m * MIN).toISOString();
const ROOT = { bot: 'Root', bot_id: '70f0889b-ecd4-457b-a69c-304cd2aff540', status: 'idle', last_action: 'Added usage summary', last_action_at: ago(2 * 1440) };
const screens = entry => ({ screens: L.parseScreensIndex({ updated_at: ago(1), screens: { [ROOT.bot_id]: Object.assign({ at: ago(1), paused: false, busy: false }, entry) } }) });

test('activeAt present: the screen signal is activeAt, not the capture time', () => {
  const ctx = screens({ activeAt: ago(300), busy: true });
  assert.deepEqual(L.botSignals(ROOT, ctx), [ago(300)]);
  const f = L.freshness(ROOT, NOW, L.botSignals(ROOT, ctx));
  assert.equal(f.stale, true, 'a fresh capture alone no longer makes Root look active'); assert.equal(f.label, 'stale · last seen 5 h ago');
  assert.equal(L.freshness(ROOT, NOW, L.botSignals(ROOT, screens({ activeAt: ago(10), busy: true }))).ageMin, 10);
  assert.deepEqual(L.botSignals(ROOT, screens({ activeAt: null, busy: true })), [''], 'activeAt written as null: no screen activity at all');
});
test('activeAt absent (until Claude ships it): falls back to the capture time, as before', () => {
  assert.deepEqual(L.botSignals(ROOT, screens({})), [ago(1)]);
  assert.equal(L.freshness(ROOT, NOW, L.botSignals(ROOT, screens({}))).stale, false);
  assert.deepEqual(L.botSignals(ROOT, screens({ paused: true, activeAt: ago(5) })), [], 'paused screens still give nothing');
});
test('"no activity feed" for seeded or never-written rows with no other signal; real old rows keep the hour count', () => {
  const seeded = { bot: 'Sniffer', status: 'idle', last_action: 'seeded', last_action_at: ago(2 * 1440 + 120) };
  assert.equal(L.freshness(seeded, NOW).label, 'no activity feed');
  assert.equal(L.freshness(seeded, NOW).noFeed, true);
  assert.equal(L.freshness({ bot: 'Edgar', status: 'idle', last_action: '', last_action_at: null }, NOW).label, 'no activity feed');
  assert.equal(L.freshness(ROOT, NOW).label, 'stale · last seen 2 d ago', 'a real last action keeps the stale age');
  assert.equal(L.freshness(seeded, NOW, [ago(400)]).label, 'stale · last seen 6 h ago', 'any other signal is a feed');
  assert.deepEqual([L.freshness(seeded, NOW, [ago(30)]).stale, L.freshness(seeded, NOW, [ago(30)]).label], [false, '']);
});
test('idle or blocked task files win over fresh status-row time; working needs a real screen activeAt', () => {
  const idle = screens({ activeAt: ago(1), busy: false, task: 'idle' });
  assert.deepEqual([L.botActivity(ROOT, NOW, idle).working, L.botActivity(ROOT, NOW, idle).state], [false, 'idle']);
  const busy = screens({ activeAt: ago(4), busy: true, task: 'my card' });
  assert.deepEqual([L.botActivity(ROOT, NOW, busy).working, L.botActivity(ROOT, NOW, busy).state, L.botActivity(ROOT, NOW, busy).task], [true, 'working', 'my card']);
  const blocked = screens({ activeAt: ago(35 * 60), busy: true, blocked: true, task: 'blocked: card-pickup webhook needs Tim to copy URL/key into gauge.env' });
  assert.deepEqual([L.botActivity(ROOT, NOW, blocked).working, L.botActivity(ROOT, NOW, blocked).blocked, L.botActivity(ROOT, NOW, blocked).state, L.botActivity(ROOT, NOW, blocked).task], [false, true, 'blocked', 'card-pickup webhook needs Tim to copy URL/key into gauge.env']);
  const statusOnly = L.botActivity(ROOT, NOW, screens({ activeAt: ago(1), busy: false, task: 'idle' }));
  assert.equal(statusOnly.working, false);
  const batchAt = ago(4);
  const other = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const batch = { screens: L.parseScreensIndex({ updated_at: batchAt, screens: {
    [ROOT.bot_id]: { at: batchAt, activeAt: batchAt, busy: true, task: 'board card title' },
    [other]: { at: batchAt, activeAt: batchAt, busy: true, task: 'another board card' }
  } }) };
  assert.equal(L.botActivity(ROOT, NOW, batch).working, false, 'shared batch activeAt equal to updated_at is not a real per-screen time');
  assert.equal(L.botActivity({ bot: 'HR', bot_id: other, status: 'idle' }, NOW, batch).working, false);
});
test("Tim's 2:28 AM screenshot: idle or offline screens tag idle/offline with their age, never 'no activity feed' or a status-row stale age", () => {
  const seeded = { bot: 'HR', bot_id: ROOT.bot_id, status: 'idle', last_action: 'seeded', last_action_at: ago(2 * 1440) };
  const idle = L.botActivity(seeded, NOW, screens({ activeAt: ago(8), busy: false }));
  assert.deepEqual([idle.working, idle.noFeed, idle.label], [false, false, 'idle · last active 8 min ago']);
  const off = L.botActivity(ROOT, NOW, screens({ activeAt: ago(80), busy: false, offline: true, lastSeen: ago(80) }));
  assert.deepEqual([off.working, off.label], [false, 'offline · last seen 1 h ago']);
  assert.equal(L.botActivity(ROOT, NOW, screens({ activeAt: ago(5), busy: true })).working, true);
  assert.deepEqual(L.botSignals(ROOT, screens({ activeAt: ago(1), busy: false })), [], 'untagged signals unchanged');
});
test('QA #434: screen busy:false or offline:true wins over a fresh PR merge or status row, so the bot is not drawn typing', () => {
  const merges = new Map([['root', ago(58)]]), fresh = Object.assign({}, ROOT, { last_action_at: ago(10) });
  const idle = Object.assign(screens({ activeAt: ago(30), busy: false }), { merges });
  assert.deepEqual([L.botActivity(fresh, NOW, idle).working, L.botActivity(fresh, NOW, idle).label], [false, 'idle · last active 30 min ago']);
  const off = Object.assign(screens({ activeAt: ago(70), busy: false, offline: true, lastSeen: ago(70) }), { merges });
  assert.deepEqual([L.botActivity(fresh, NOW, off).working, L.botActivity(fresh, NOW, off).label], [false, 'offline · last seen 1 h ago']);
  const offOld = Object.assign(screens({ activeAt: ago(150), busy: true, offline: true, lastSeen: ago(150) }), { merges });
  assert.deepEqual([L.botActivity(fresh, NOW, offOld).working, L.botActivity(fresh, NOW, offOld).label], [false, 'offline · last seen 2 h ago'], 'busy but activeAt past 2 h: offline still wins over the merge');
  assert.equal(L.botActivity(fresh, NOW, Object.assign(screens({ activeAt: ago(30), busy: true }), { merges })).working, true, 'busy screen keeps the merge signal');
  const mergeOnly = L.botActivity(fresh, NOW, { merges });
  assert.equal(mergeOnly.working, false, 'cs-ffe2ed7d: a merge alone does not mark working; the task file / real screen time does');
  assert.equal(mergeOnly.state, 'idle');
});
test('cs-366c0fe4 (President fix b): fresh busy:true outranks offline for the working pose and tag; the screen keeps its offline caption', () => {
  const ix = screens({ at: ago(1), activeAt: ago(1), busy: true, offline: true, lastSeen: ago(1), task: 'Pipeline Explorer dashboard' });
  const a = L.botActivity(ROOT, NOW, ix);
  assert.deepEqual([a.working, a.stale, a.label], [true, false, '']);
  assert.equal(L.botActivity(ROOT, NOW, screens({ activeAt: ago(119), busy: true, offline: true, lastSeen: ago(119) })).working, true, 'inside 120 min');
  const old = L.botActivity(ROOT, NOW, screens({ activeAt: ago(121), busy: true, offline: true, lastSeen: ago(121) }));
  assert.deepEqual([old.working, old.label], [false, 'offline · last seen 2 h ago'], 'past 120 min: offline label as before');
  assert.equal(L.botActivity(ROOT, NOW, screens({ activeAt: ago(1), busy: true, offline: true, paused: true })).working, false, 'paused never counts');
  assert.equal(L.screenState({ screens: ix.screens.screens }, ROOT.bot_id, NOW).offline, true, 'screen mirror keeps its offline state');
});
