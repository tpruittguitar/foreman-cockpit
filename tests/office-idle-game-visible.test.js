// Tim (Nov 17, 9:11 PM ET): idle bots must visibly play a game within a minute or two, incl. from the start camera (far LOD).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../office/office-logic.js');

test('a staggered idle state (sinceGame = GAME_EVERY - 1 - k) games after k other activities, then keeps 1 in 5', () => {
  for (let k = 0; k < L.GAME_EVERY; k++) {
    const rng = L.makeRng(7 + k), st = L.createIdleState(); st.sinceGame = L.GAME_EVERY - 1 - k;
    const seq = []; let t = 0;
    for (let i = 0; i < 12; i++) { seq.push(L.idleTick(st, rng, t, { restock: 'ok' })); t = st.until + 0.1; }
    assert.equal(seq.indexOf('video_game'), k);
    assert.equal(seq[k + L.GAME_EVERY], 'video_game');
  }
});
test('office wiring: bots get a staggered game slot and the game screen draws at every LOD', () => {
  const office = fs.readFileSync(__dirname + '/../office/office.js', 'utf8'), draw = fs.readFileSync(__dirname + '/../office/draw.js', 'utf8');
  assert.match(office, /c\.idle\.sinceGame = L\.firstGameSlot\(b, \[\.\.\.chars\.values\(\)\]\.filter\(o => o\.gamer\)\.length\)/);
  assert.match(office, /c\.gamer = L\.showsGame\(b\)/);
  assert.match(draw, /if \(mode === 'game'\) return drawGame/);
});
test('QA #376: President (created first) does not take the first game slot; the next normal-monitor bot games at once', () => {
  const pres = { bot: 'President' }, usage = { bot: 'Usage' }, a = { bot: 'Writer' }, b = { bot: 'Gauge' };
  assert.equal(L.monitorMode(pres, 'game', {}), 'president'); // why: President's monitor never shows a game
  assert.equal(L.showsGame(pres), false); assert.equal(L.showsGame(usage), false); assert.equal(L.showsGame(a), true);
  assert.equal(L.firstGameSlot(pres, 0), 0); assert.equal(L.firstGameSlot(usage, 0), 0);
  assert.equal(L.firstGameSlot(a, 0), L.GAME_EVERY - 1); // first gamer plays right away
  assert.equal(L.firstGameSlot(b, 1), L.GAME_EVERY - 2);
  assert.equal(L.showsGame({ bot: 'Writer', routine: 'x', audit: {} }), true); // only identity-fixed monitors are skipped
});
