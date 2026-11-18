// Desk screens show their full content from anywhere in the office (Tim, Nov 17). Run: node --test tests/office-desk-any-distance.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
test('a desk screen is at full (near) content at the farthest point of the room', () => {
  const m = /const RW = (\d+(?:\.\d+)?), RD = (\d+(?:\.\d+)?), RH = (\d+(?:\.\d+)?);/.exec(office);
  assert.ok(m, 'room size found in office.js');
  const [RW, RD, RH] = m.slice(1).map(Number), max = Math.hypot(RW, RD, RH);
  assert.equal(L.lodFor(max), 'near', 'room diagonal ' + max.toFixed(2) + ' m');
  assert.equal(L.lodFor(0), 'near');
});
test('distant game screens keep the slower redraw rate', () => {
  assert.match(office, /dist > L\.GAME_SLOW_M \? 400 : 120/);
});
