// Tim's full idle activity list (IDLE_ACTIVITIES.md, 2026-11-16): waterfall, coffee, energy drink, HR invites, group chat, video games.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../office/office-logic.js');

test('idle bag holds all 11 activities incl. waterfall_view, get_coffee, get_energy_drink; each comes round before a repeat', () => {
  for (const a of ['waterfall_view', 'get_coffee', 'get_energy_drink']) assert.ok(L.IDLE_ACTIVITIES.includes(a), a);
  assert.equal(L.IDLE_ACTIVITIES.length, 11);
  for (const seed of [1, 2, 3]) {
    const rng = L.makeRng(seed), st = L.createIdleState(), seq = []; let t = 0;
    for (let i = 0; i < 33; i++) { seq.push(L.idleTick(st, rng, t, { restock: 'ok' })); t = st.until + 0.1; }
    const other = seq.filter(x => x !== 'video_game');
    for (let k = 0; k < 2; k++) assert.equal(new Set(other.slice(k * 10, k * 10 + 10)).size, 10, 'one full bag = every other activity once');
    for (let k = 0; k + 5 <= seq.length; k += 5) assert.equal(seq.slice(k, k + 5).filter(x => x === 'video_game').length, 1, 'video games are 1 in 5 (Tim, Nov 17)');
    for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1]);
  }
});
test('idle bag: a blocked hr_training (no HR free) is never chosen', () => {
  const rng = L.makeRng(5), st = L.createIdleState(); let t = 0; const seen = new Set();
  for (let i = 0; i < 40; i++) { seen.add(L.idleTick(st, rng, t, { restock: 'ok', blocked: ['hr_training'] })); t = st.until + 0.1; }
  assert.ok(!seen.has('hr_training')); assert.equal(seen.size, 10);
});

test('group chat: groups of 2 or 3, never 1 (unless alone) or 4+, every bot in exactly one group', () => {
  for (let n = 2; n <= 12; n++) {
    const names = Array.from({ length: n }, (_, i) => 'Bot' + i), g = L.chatGroups(names);
    assert.equal(Object.keys(g).length, n);
    const sizes = {}; for (const m of names) { assert.ok(g[m].n === 2 || g[m].n === 3, n + ' bots -> group of ' + g[m].n); sizes[g[m].group] = g[m].n; assert.equal(g[m].members[g[m].i], m); }
    assert.equal(Object.values(sizes).reduce((a, b) => a + b, 0), n);
  }
  assert.equal(L.chatGroups(['Solo']).Solo.n, 1);
  assert.deepEqual(L.chatGroups(['a', 'b', 'c']), L.chatGroups(['c', 'a', 'b']), 'stable regardless of input order');
});
test('group chat: one speaker per tick, takes turns, each bot faces the next; lines are short enough for BUBBLE_MAX', () => {
  const m = ['A', 'B', 'C'];
  assert.deepEqual([0, 1, 2, 3].map(t => L.groupSpeaker(m, t)), ['A', 'B', 'C', 'A']);
  assert.equal(L.groupFace(m, 'C'), 'A'); assert.equal(L.groupFace(['A', 'B'], 'A'), 'B'); assert.equal(L.groupFace(['A'], 'A'), null);
  for (let t = 0; t < 20; t++) { const line = L.ambientLine('group', 'A|B|C', t); assert.ok(line && line.length <= L.BUBBLE_MAX, line); }
  const slots = L.groupChatSlots(0, 0, 3, 0.6);
  for (const s of slots) assert.ok(Math.abs(Math.atan2(-s.x, -s.z) - s.face) < 1e-2, 'each slot faces the middle');
});

test('HR invite: HR visits each waiting bot, says the invite, then the guests go to the training room', () => {
  assert.equal(L.inviteStart([], 0), null);
  let inv = L.inviteStart(['A', 'B', 'C'], 10);
  assert.deepEqual(inv.guests, ['A', 'B'], 'at most 2 guests'); assert.equal(inv.phase, 'invite');
  assert.equal(L.inviteCurrent(inv), 'A'); assert.equal(L.inviteGoesToRoom(inv, 'A'), false);
  const active = ['A', 'B', 'C'];
  inv = L.inviteStep(inv, { active, heldFor: -1, now: 11 }); assert.equal(L.inviteCurrent(inv), 'A', 'HR still walking');
  inv = L.inviteStep(inv, { active, heldFor: L.INVITE_SAY_S - 0.1, now: 12 }); assert.equal(L.inviteCurrent(inv), 'A', 'bubble still showing');
  inv = L.inviteStep(inv, { active, heldFor: L.INVITE_SAY_S, now: 15 });
  assert.equal(L.inviteGoesToRoom(inv, 'A'), true); assert.equal(L.inviteGoesToRoom(inv, 'B'), false); assert.equal(L.inviteCurrent(inv), 'B');
  inv = L.inviteStep(inv, { active, heldFor: L.INVITE_SAY_S, now: 20 });
  assert.equal(inv.phase, 'train'); assert.equal(L.inviteGoesToRoom(inv, 'B'), true); assert.equal(L.inviteCurrent(inv), null);
  inv = L.inviteStep(inv, { active: ['B'], now: 60 }); assert.deepEqual(inv.guests, ['B'], 'a guest that left hr_training is dropped');
  assert.equal(L.inviteStep(inv, { active: [], now: 61 }), null, 'ends when nobody is in training');
});
test('HR invite: a second waiting bot can join before HR has finished, not after; capped at 2 and time-limited', () => {
  let inv = L.inviteStart(['A'], 0);
  inv = L.inviteStep(inv, { active: ['A', 'B'], add: ['B'], heldFor: -1, now: 1 }); assert.deepEqual(inv.guests, ['A', 'B']);
  inv = L.inviteStep(inv, { active: ['A', 'B', 'C'], add: ['C'], heldFor: -1, now: 2 }); assert.deepEqual(inv.guests, ['A', 'B'], 'cap');
  assert.equal(L.inviteStep(inv, { active: ['A', 'B'], now: 1000 }), null, 'safety timeout');
});
test('HR invite: short white bubble text "Training in 5? Room B" style, within BUBBLE_MAX', () => {
  assert.ok(/Room B/.test(L.inviteText('A')));
  for (const n of ['A', 'B', 'GUI', 'Root']) assert.ok(L.inviteText(n).length <= L.BUBBLE_MAX);
  assert.ok(['A', 'B', 'GUI', 'Root', 'Comp', 'Gauge'].some(n => L.inviteText(n) === 'Training in 5? Room B'));
});

test('video game: each bot picks one of three original styles, stable per bot, all three used', () => {
  assert.deepEqual(L.GAME_STYLES.slice().sort(), ['corridor', 'dungeon', 'squad']);
  const names = ['Root', 'GUI', 'Comp', 'Sniffer', 'Gauge', 'Claude', 'HR', 'Usage', 'Scout', 'Writer', 'Forge', 'Nova'];
  const styles = names.map(L.gameStyleFor);
  for (const n of names) assert.equal(L.gameStyleFor(n), L.gameStyleFor(n));
  assert.equal(new Set(styles).size, 3, 'a dozen bots show all three screens');
  assert.equal(L.monitorMode({ bot: 'Root' }, 'game', {}), 'game');
});
test('video game: drawGame has the three styles and no real brand names', () => {
  const src = fs.readFileSync(require('node:path').join(__dirname, '../office/draw.js'), 'utf8');
  for (const f of ['gameCorridor', 'gameSquad', 'gameDungeon']) assert.ok(src.includes('function ' + f), f);
  const a = src.indexOf('function drawGame'), b = src.indexOf('Conference whiteboard'), game = src.slice(a, b);
  for (const brand of [/doom/i, /helldiver/i, /d&d/i, /dungeons\s*&?\s*dragons/i, /warcraft/i, /super\s*earth/i]) assert.ok(!brand.test(game), String(brand));
});
