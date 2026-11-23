'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const A = require('../pipeline-ai-usage.js');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('brief gives the flat view verdict in short words (card 7077752)', () => {
  assert.equal(A.brief({ verdict: 'LASTS' }), 'lasts to reset');
  assert.equal(A.brief({ verdict: 'OUT' }), 'out until reset');
  assert.match(A.brief({ verdict: 'BEFORE_RESET', runOutAt: Date.parse('2026-11-19T20:00:00Z') }), /^runs out ~\S+ \d/);
  assert.equal(A.brief({ verdict: 'UNKNOWN' }), 'needs 2 readings');
  assert.equal(A.brief({ verdict: 'NO_READING' }), 'no reading');
  assert.equal(A.brief({ verdict: 'RESET_PASSED' }), 'reset passed');
  assert.equal(A.brief({ verdict: 'SOMETHING_NEW' }), '');
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

test('AI USAGE row: used under the %, prediction right of it, no next-check line (card bd3ecea)', () => {
  const d = read('office/draw.js');
  assert.match(d, /ctx\.fillText\('used', px, y \+ 130 \* s\)/);
  assert.match(d, /px \+ 18 \* s, y \+ \(62 \+ j \* 28\) \* s/);
  assert.doesNotMatch(d, /u\.next/);
  assert.doesNotMatch(read('office/office.js'), /r\.next\)|USAGE_CHECK_SCHEDULE_ET\.join/);
});

test('card 94dfd7f489: 3D AI USAGE rows show each plan reset day and time', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'office', 'draw.js'), 'utf8');
  assert.match(src, /u\.measured \+ \(u\.resets_at \? ' · resets ' \+ resetClock\(u\.resets_at\)/);
  assert.match(src, /function resetClock\(iso\)/);
});

test('card eee3a384: a WATCH reading is a real reading, so Grok at 98% gets a prediction in both views', () => {
  const reset = '2026-11-22T21:41:00Z', now = Date.parse('2026-11-21T04:30:00Z');
  const rs = A.parse([
    { at: '2026-11-20T05:00:00Z', provider: 'GROK', meter: 'weekly', usedPct: 96, resetsAt: reset, status: 'WATCH', windowHours: 168 },
    { at: '2026-11-21T03:08:00Z', provider: 'GROK', meter: 'weekly', usedPct: 98, resetsAt: reset, status: 'WATCH', windowHours: 168 },
    { at: '2026-11-21T03:08:00Z', provider: 'CHATGPT', meter: 'weekly', usedPct: 0, resetsAt: '2026-11-28T03:08:00Z', status: 'OK', windowHours: 168 },
    { at: '2026-11-21T03:08:00Z', provider: 'CLAUDE', meter: 'weekly', usedPct: null, resetsAt: '', status: 'CHROME_UNAVAILABLE', windowHours: 168 }
  ].map(r => JSON.stringify(r)).join('\n'));
  const by = Object.fromEntries(A.project(rs, now).map(p => [p.provider, p]));
  assert.equal(by.GROK.verdict, 'BEFORE_RESET'); assert.match(by.GROK.basis, /last 22 h/);
  assert.match(A.brief(by.GROK), /^runs out ~/);
  assert.equal(by.CHATGPT.verdict, 'UNKNOWN'); assert.equal(A.brief(by.CHATGPT), 'needs 2 readings');
  assert.equal(by.CLAUDE.verdict, 'NO_READING'); assert.equal(A.brief(by.CLAUDE), 'no reading');
  assert.match(A.html(A.project(rs, now)), /RUNS OUT BEFORE RESET/, 'flat view pill agrees');
  /* 97 -> 98 over 22 h leaves ~44 h of room against 41 h to reset: both views say lasts */
  rs[0].usedPct = 97;
  const g = A.project(rs, now).find(p => p.provider === 'GROK');
  assert.equal(g.verdict, 'LASTS'); assert.equal(A.brief(g), 'lasts to reset');
});
