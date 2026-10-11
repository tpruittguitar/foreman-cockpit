// Writer throughput charts: model math and rendered states (pure; no DOM).
const test = require('node:test'), assert = require('node:assert/strict');
const T = require('../pipeline-throughput.js');

const start = Date.parse('2026-10-11T18:00:00Z');
const bucket = (i, o) => Object.assign({ start: new Date(start + i * 3600e3).toISOString(), arrived: 0, finished: 0, failed: 0, held: 0, backlogAtEnd: 0, waitMsAvg: 0, waitMsMax: 0, runMsAvg: 0 }, o);
const stats = { ok: true, now: '2026-10-11T21:40:00Z', skippedLines: 1, buckets: [
  bucket(0, { arrived: 26, finished: 15, failed: 1, backlogAtEnd: 11, waitMsMax: 18 * 60e3, waitMsAvg: 8 * 60e3, runMsAvg: 44e3 }),
  bucket(1, { arrived: 29, finished: 31, failed: 2, backlogAtEnd: 9, waitMsMax: 23 * 60e3 }),
  bucket(2, { arrived: 25, finished: 25, backlogAtEnd: 9, waitMsMax: 50 * 60e3 }),
  bucket(3, { arrived: 5, finished: 14 }),
] };

test('model totals, peak and longest wait come from the buckets', () => {
  const m = T.model(stats, { queue: { pending: 10, oldestPendingAt: new Date(Date.now() - 12 * 60e3).toISOString() } });
  assert.equal(m.ok, true);
  assert.deepEqual(m.totals, { arrived: 85, finished: 85, failed: 3, peak: 31, waitMax: 50 });
  assert.equal(m.pending, 10);
  assert.ok(m.oldestPendingMin >= 11 && m.oldestPendingMin <= 13);
  assert.equal(m.hours[0].runAvgS, 44);
  assert.equal(m.skipped, 1);
});

test('missing live status leaves "now" unknown instead of zero', () => {
  const m = T.model(stats, null);
  assert.equal(m.pending, null); assert.equal(m.oldestPendingMin, null);
  assert.match(T.html({ stats }), /Waiting now<\/h4><b>UNKNOWN/);
});

test('rendered section has three labelled charts, a 45-minute action line and an exact-number table', () => {
  const h = T.html({ stats, status: { queue: { pending: 10 } } });
  assert.equal((h.match(/<svg /g) || []).length, 3);
  assert.match(h, /aria-label="Writer requests arrived vs finished per hour"/);
  assert.match(h, /45 min = act/);
  assert.match(h, /<summary>Hourly numbers<\/summary>/);
  assert.match(h, /<td>26<\/td><td>15<\/td><td>1<\/td><td>11<\/td><td>18<\/td>/);
  assert.match(h, /at or over 45 min: act/);       // 50-minute hour trips the warning
  assert.match(h, /1 unreadable log line\(s\) skipped/);
});

test('every hour carries a text title so values are readable without colour', () => {
  const h = T.html({ stats });
  assert.match(h, /<title>[^<]*: 26 arrived, 15 finished, 1 failed, 11 still waiting at end of hour<\/title>/);
});

test('loading, error and old-Writer states render a message, never a chart of zeros', () => {
  assert.match(T.html({ loading: true }), /Reading Writer queue statistics/);
  assert.match(T.html({ error: 'bad key' }), /Throughput unavailable: bad key/);
  assert.match(T.html({ unsupported: true }), /predates queue_stats/);
  assert.match(T.html({ stats: { ok: false, error: 'x' } }), /Throughput unavailable: x/);
  [{ loading: true }, { error: 'e' }, { unsupported: true }].forEach(s => assert.doesNotMatch(T.html(s), /<svg /));
});

test('text from the Writer is escaped', () => {
  assert.doesNotMatch(T.html({ error: '<img src=x onerror=1>' }), /<img/);
});
