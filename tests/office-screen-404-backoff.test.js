const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
test('desk screenshot: a 404 is not retried every frame; it waits 5 min', () => {
  const js = fs.readFileSync(__dirname + '/../office/office.js', 'utf8');
  assert.ok(js.includes("if (!(now - d.imgAt <= (d.imgBad ? 300000 : 60000))) {"));
  assert.ok(js.includes("im.onerror = () => { d.img = null; d.imgBad = true; };"));
  assert.ok(!js.includes("if (!d.img || now - d.imgAt > 60000)"), 'old retry-every-frame check is gone');
});
