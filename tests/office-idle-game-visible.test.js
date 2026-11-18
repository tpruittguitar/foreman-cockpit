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
  assert.match(office, /c\.idle\.sinceGame = L\.GAME_EVERY - 1 - chars\.size % L\.GAME_EVERY/);
  assert.match(draw, /if \(mode === 'game'\) return drawGame/);
});
