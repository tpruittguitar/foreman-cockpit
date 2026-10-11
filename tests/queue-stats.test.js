// queue_stats: hourly Writer throughput built only from WRITER_QUEUE_LOG.jsonl lines (pure; no Apps Script services).
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../apps-script/Automation.gs');

const H = 3600e3, NOW = Date.parse('2026-10-11T20:40:00Z');
// One request: file created at `arrive`, claimed `claimAfter` ms later, ran `run` ms.
const entry = (arrive, claimAfter, run, status) => {
  const a = Date.parse(arrive), st = a + claimAfter;
  return JSON.stringify({ file: 'F_' + arrive + '.json', startedAt: new Date(st).toISOString(), queueWaitMs: claimAfter, totalMs: run, finishedAt: new Date(st + run).toISOString(), terminalStatus: status || 'SUCCESS' });
};

test('buckets cover the window ending at the current hour, oldest first', () => {
  const r = A.queueStats_([], NOW, 3);
  assert.equal(r.ok, true);
  assert.equal(r.hours, 3);
  assert.deepEqual(r.buckets.map(b => b.start), ['2026-10-11T18:00:00.000Z', '2026-10-11T19:00:00.000Z', '2026-10-11T20:00:00.000Z']);
  assert.equal(r.to, '2026-10-11T21:00:00.000Z');
  assert.deepEqual(r.totals, { arrived: 0, finished: 0, failed: 0, held: 0, peakFinishedPerHour: 0, waitMsMax: 0 });
});

test('arrival is claim time minus queue wait; a request waiting across the hour counts in backlogAtEnd', () => {
  const lines = [
    entry('2026-10-11T19:50:00Z', 20 * 60e3, 40e3),          // arrives 19:50, finishes ~20:10:40
    entry('2026-10-11T19:10:00Z', 60e3, 40e3),               // arrives and finishes in the 19:00 hour
    entry('2026-10-11T20:05:00Z', 2 * 60e3, 30e3, 'FAILED'), // 20:00 hour, failed
  ];
  const r = A.queueStats_(lines, NOW, 2), [h19, h20] = r.buckets;
  assert.equal(h19.arrived, 2); assert.equal(h19.finished, 1); assert.equal(h19.backlogAtEnd, 1);
  assert.equal(h20.arrived, 1); assert.equal(h20.finished, 2); assert.equal(h20.failed, 1); assert.equal(h20.backlogAtEnd, 0);
  assert.equal(h20.waitMsMax, 20 * 60e3);
  assert.equal(h20.waitMsAvg, Math.round((20 * 60e3 + 2 * 60e3) / 2));
  assert.equal(h20.runMsAvg, 35e3);
  assert.equal(r.totals.finished, 3); assert.equal(r.totals.peakFinishedPerHour, 2);
});

test('older entries without startedAt fall back to finish minus run minus wait', () => {
  const l = JSON.stringify({ file: 'old.json', finishedAt: '2026-10-11T20:10:00Z', totalMs: 60e3, queueWaitMs: 15 * 60e3, ok: true });
  const r = A.queueStats_([l], NOW, 2);
  assert.equal(r.buckets[0].arrived, 1); // 19:54
  assert.equal(r.buckets[1].finished, 1);
});

test('unparseable lines and lines without finishedAt are skipped and counted, never thrown', () => {
  const r = A.queueStats_(['{bad', JSON.stringify({ file: 'x' }), entry('2026-10-11T20:00:00Z', 0, 1000)], NOW, 1);
  assert.equal(r.skippedLines, 2);
  assert.equal(r.buckets[0].finished, 1);
});

test('hours is clamped to 1..168 and defaults to 24', () => {
  assert.equal(A.queueStats_([], NOW).hours, 24);
  assert.equal(A.queueStats_([], NOW, 'abc').hours, 24);
  assert.equal(A.queueStats_([], NOW, 0).hours, 24);
  assert.equal(A.queueStats_([], NOW, 9999).hours, 168);
  assert.equal(A.queueStats_([], NOW, 6.9).hours, 6);
});

test('HOLD results are counted as held, not failed', () => {
  const r = A.queueStats_([entry('2026-10-11T20:00:00Z', 0, 1000, 'PARTIAL_HOLD')], NOW, 1);
  assert.equal(r.buckets[0].held, 1); assert.equal(r.buckets[0].failed, 0);
});
