'use strict';
// cs-bfacaacf: the AI USAGE wall keeps the newest GOOD reading, with its age, when the newest attempt failed.
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const NOW = Date.parse('2026-11-24T22:00:00Z');
const at = h => new Date(NOW - h * 3600000).toISOString();
const good = (h, pct) => ({ provider: 'CLAUDE', meter: 'weekly', label: 'Weekly', status: 'OK', usedPct: pct, at: at(h), resetsAt: '2026-11-29T16:00:00Z' });
const bad = (h, reason) => ({ provider: 'CLAUDE', meter: 'weekly', label: 'Weekly', status: 'CHROME_UNAVAILABLE', at: at(h), reason });

test('newest failed with an older good reading: show the good reading, its age and the failed run', () => {
  const rs = [good(5, 40), good(2, 47), bad(0.5, 'Chrome not connected')];
  const lg = L.lastGoodUsage(rs, 'CLAUDE');
  assert.equal(lg.good.usedPct, 47); assert.equal(lg.failed.status, 'CHROME_UNAVAILABLE');
  const row = L.usageRows(rs, NOW, null)[0];
  assert.equal(row.pct_used, 47, 'the last good reading, not NO READING');
  assert.notEqual(L.usageWord(row.pct_used).word, 'NO READING');
  assert.match(row.measured, /^Measured \d{1,2}:\d\d (AM|PM) ET · 2h ago$/);
  assert.match(row.failed.text, /^Latest run failed \d{1,2}:\d\d (AM|PM) ET · CHROME_UNAVAILABLE · Chrome not connected$/);
});
test('all attempts failed: NO READING', () => {
  const rs = [bad(3), bad(1)];
  assert.deepEqual(L.lastGoodUsage(rs, 'CLAUDE'), { good: null, failed: rs[1] });
  const row = L.usageRows(rs, NOW, null)[0];
  assert.equal(row.pct_used, null); assert.equal(L.usageWord(row.pct_used).word, 'NO READING'); assert.equal(row.failed, undefined);
});
test('newest reading good: shown as before, no failed note', () => {
  const rs = [bad(3), good(1, 52)];
  assert.deepEqual(L.lastGoodUsage(rs, 'CLAUDE'), { good: rs[1], failed: null });
  const row = L.usageRows(rs, NOW, null)[0];
  assert.equal(row.pct_used, 52); assert.equal(row.failed, undefined); assert.match(row.measured, /^Measured \d{1,2}:\d\d (AM|PM) ET$/);
});
test('no readings: nothing to pick', () => {
  assert.deepEqual(L.lastGoodUsage([], 'CLAUDE'), { good: null, failed: null });
  assert.deepEqual(L.lastGoodUsage(undefined, 'CLAUDE'), { good: null, failed: null });
});
