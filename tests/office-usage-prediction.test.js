'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const A = require('../pipeline-ai-usage.js');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('brief gives the flat view verdict in short words (card 7077752)', () => {
  assert.equal(A.brief({ verdict: 'LASTS' }), 'lasts to reset');
  assert.equal(A.brief({ verdict: 'OUT' }), 'out until reset');
  assert.match(A.brief({ verdict: 'BEFORE_RESET', runOutAt: Date.parse('2026-11-19T20:00:00Z') }), /^runs out ~\S+ \d/);
  assert.equal(A.brief({ verdict: 'UNKNOWN' }), '');
  const now = Date.parse('2026-11-18T15:00:00Z'), reset = '2026-11-22T16:00:00Z';
  const rs = [{ provider: 'GROK', meter: 'weekly', usedPct: 40, at: '2026-11-18T10:00:00Z', resetsAt: reset, status: 'OK' },
    { provider: 'GROK', meter: 'weekly', usedPct: 60, at: '2026-11-18T14:00:00Z', resetsAt: reset, status: 'OK' }];
  assert.match(A.brief(A.project(rs, now)[0]), /^runs out ~/);
});

test('3D usage screen reuses the flat view projection, not a copy', () => {
  assert.match(read('office.html'), /<script src="pipeline-ai-usage\.js"><\/script>/);
  const js = read('office/office.js');
  assert.match(js, /A\.project\(A\.parse\(S\.readingsText\), Date\.now\(\)\)/);
  assert.match(js, /pred: usagePred\(\)/);
  assert.match(read('office/draw.js'), /o\.pred && o\.pred\[String\(u\.name\)\.toUpperCase\(\)\]/);
  assert.doesNotMatch(read('pipeline.html'), /every 3 h at :05/);
});
