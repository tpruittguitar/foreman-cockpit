// President typing: hands rest on the keyboard, not hover above it. Run: node --test tests/office-president-type-hands.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../office/chars.js'), 'utf8');
const RIG = Function('return ' + src.match(/export const PRES_RIG = (\{[\s\S]*?\}\s*\}\s*);/)[1])();
const KEYS = Function('return ' + src.match(/export const KEYS = (\{[^}]*\});/)[1])();

test('president type pose keeps the typing branch and the straight-arm reach onto the keys (#430)', () => {
  assert.match(src, /if \(pose === 'type' && c\.kind === 'president'\) \{[\s\S]*?armR\.x = -1\.72 \+ tap;/);
  assert.match(src, /if \(pose === 'type' && c\.kind === 'president' && c\.armR\.userData\.tip\) typeHands\(c,/);
  assert.match(src, /a\.userData\.tip = R\.armTip;/, 'arm bones carry the shoulder-to-fingertip length');
});

test("Tim's arm reaches the keyboard top from the seated shoulder with a small lean-in", () => {
  const shoulderY = RIG.sitLift + RIG.shoulder[1], dy = KEYS.top - shoulderY, dx = KEYS.x - RIG.shoulder[0];
  const reach2 = RIG.armTip ** 2 - dx * dx - dy * dy;
  assert.ok(reach2 > 0, 'a straight arm can get down to the keys');
  const slide = KEYS.near - RIG.shoulder[2] - Math.sqrt(reach2);
  assert.ok(slide >= 0 && slide < 0.22, 'body slides in ' + slide.toFixed(3) + ' m (torso stays clear of the desk edge)');
});

test('the legs follow the body when it slides in to type (no stretched hips on the skinned mesh)', () => {
  assert.match(src, /if \(c\.hips\) c\.hips\.position\.z = c\.body\.position\.z;/);
  assert.match(src, /if \(fit\) \{ c\.body\.position\.z \+= fit; if \(c\.hips\) c\.hips\.position\.z = c\.body\.position\.z;/);
});
