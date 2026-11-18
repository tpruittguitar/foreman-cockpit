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
test('idle-flagged screen (busy false) with a fresh activeAt: no screen signal, bot goes to the idle rotation; busy true stays at its desk; offline never counts', () => {
  const idle = screens({ activeAt: ago(1), busy: false }), busy = screens({ activeAt: ago(1), busy: true });
  assert.deepEqual(L.botSignals(ROOT, idle), []);
  assert.equal(L.botActivity(ROOT, NOW, idle).working, false);
  assert.equal(L.botActivity(ROOT, NOW, busy).working, true);
  const offline = screens({ activeAt: ago(1), busy: true, offline: true });
  assert.deepEqual(L.botSignals(ROOT, offline), [], 'offline screen gives no signal even when busy');
  assert.equal(L.botActivity(ROOT, NOW, offline).working, false, 'offline bot is not drawn typing');
  assert.deepEqual(L.botSignals(ROOT, screens({ offline: true })), [], 'offline without activeAt: no capture-time fallback either');
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
