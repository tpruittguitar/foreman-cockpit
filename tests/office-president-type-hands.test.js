// President typing: hands rest on the keyboard, not hover above it. Run: node --test tests/office-president-type-hands.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

test('president type pose lowers the arms so the fingertips meet the keyboard top', () => {
  const src = fs.readFileSync(path.join(__dirname, '../office/chars.js'), 'utf8');
  const block = src.match(/if \(pose === 'type' && c\.kind === 'president'\) \{[\s\S]*?armR\.x = ([^;]+);/);
  assert.ok(block, 'president type pose is present');
  assert.match(block[1], /^-1\.72 \+ tap$/);
  const sitLift = -0.07, hip = 0.52, armY = 0.275, fingerLen = 0.484, keyboardTop = 0.785 + 0.0125, armX = -1.72;
  const shoulderY = sitLift + hip + armY;
  const fingerY = shoulderY + Math.sin(-armX - Math.PI / 2) * fingerLen;
  assert.ok(Math.abs(fingerY - keyboardTop) < 0.02, 'fingertips at keyboard top: fingerY=' + fingerY.toFixed(3) + ' kb=' + keyboardTop);
  const hovered = shoulderY + Math.sin(1.9 - Math.PI / 2) * fingerLen;
  assert.ok(hovered - keyboardTop > 0.05, 'the previous -1.9 angle hovered above the keys: ' + hovered.toFixed(3));
});
