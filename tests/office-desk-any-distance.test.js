// Desk screens render once, at the desk, with the same content at every camera distance.
// Run: node --test tests/office-desk-any-distance.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
const draw = fs.readFileSync(path.join(__dirname, '../office/draw.js'), 'utf8');

test('desk screen materials are not transparent and have no distance-based variant', () => {
  const make = office.slice(office.indexOf('function makeDesk'), office.indexOf('function disposeDesk'));
  assert.match(make, /const monScr = screenMat\(scr\.t\);/);
  assert.match(make, /\[MAT\.dark, MAT\.dark, MAT\.dark, MAT\.dark, monScr, MAT\.dark\]/);
  assert.doesNotMatch(make, /transparent/);
  assert.doesNotMatch(office, /monFade|monMats|lodFor|mirrorAt|monDark/);
  assert.doesNotMatch(draw, /o\.lod|lod === ['"]far['"]|lod === ['"]mid['"]/);
});

test('distant game screens keep the slower redraw rate', () => {
  assert.match(office, /dist > L\.GAME_SLOW_M \? 400 : 120/);
});
