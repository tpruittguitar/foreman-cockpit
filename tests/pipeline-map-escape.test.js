const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Escape leaves the full map even when a drawer is open underneath it (QA on #460)', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
  const line = h.split('\n').find(l => /GUI 11: Escape leaves the map/.test(l));
  assert.ok(line, 'Escape handler present');
  assert.match(line, /getComputedStyle\(d\)\.zIndex>80/);
  assert.doesNotMatch(line, /\$\('drawer'\)\.classList\.contains\('on'\)\)\)return/);
});
