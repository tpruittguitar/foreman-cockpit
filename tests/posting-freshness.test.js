const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../apps-script/PipelinePostingFreshness.gs');
const now = Date.parse('2026-10-31T12:00:00Z'), r = p => ({ BUCKET: 'SCOUT_INTAKE', p });

function boundary(payload, next) {
  const at = Date.parse(next);
  assert.equal(P.assess(r(payload), at).due, false, 'exact boundary still waits');
  assert.equal(P.assess(r(payload), at + 1).due, true, 'due after the boundary');
}

test('young jobs skip freshness even if liveness is absent', () => {
  assert.equal(P.assess(r({ POSTING_DATE: '2026-10-30', DATE_ADDED: '2026-10-01' }), now).due, false);
});

test('posting date takes precedence over discovery and keeps its label', () => {
  const a = P.assess(r({ POSTING_DATE: '2026-10-01', DATE_ADDED: '2026-10-30' }), now);
  assert.equal(a.due, true);
  assert.equal(a.basis, 'POSTING_DATE');
  assert.equal(a.basisDate, '2026-10-01');
  assert.equal(P.assess(r({ POSTED_DATE: '2026-10-01' }), now).basis, 'POSTING_DATE');
  boundary({ POSTING_DATE: '2026-10-24' }, '2026-10-31T00:00:00Z');
});

test('unknown posting date uses earliest valid discovery without relabeling or writing a posting date', () => {
  const payload = Object.freeze({ POSTING_DATE: 'UNKNOWN', DISCOVERED_AT_ET: '2026-10-20T11:30:00-04:00', DATE_ADDED: '2026-10-22', MASTER_LOADED_AT: '2026-10-23' });
  const a = P.assess(r(payload), now);
  assert.equal(a.due, true);
  assert.equal(a.basis, 'FIRST_DISCOVERY');
  assert.equal(a.basisDate, '2026-10-20');
  assert.equal(a.nextCheckAt, '2026-10-27T00:00:00.000Z');
  assert.equal(payload.POSTING_DATE, 'UNKNOWN');
  for (const key of ['DISCOVERED_AT_ET', 'DATE_ADDED', 'MASTER_LOADED_AT']) {
    const p = { POSTING_DATE: 'UNKNOWN', [key]: '2026-10-30' };
    assert.equal(P.assess(r(p), now).due, false, key + ' keeps the seven-day initial wait');
    boundary(p, '2026-11-06T00:00:00Z');
  }
});

test('invalid and future posting/discovery dates never become an age basis', () => {
  const invalid = { POSTING_DATE: '2026-02-30', POSTED_DATE: '2026-12-01', DISCOVERED_AT_ET: 'UNKNOWN', DATE_ADDED: '2026-10-32', MASTER_LOADED_AT: '2026-12-01' };
  const a = P.assess(r(invalid), now);
  assert.equal(a.due, true);
  assert.equal(a.basis, 'UNDATED');
  assert.equal(a.basisDate, null);
  assert.equal(a.nextCheckAt, null);
  const fallback = P.assess(r({ ...invalid, DATE_ADDED: '2026-10-20' }), now);
  assert.equal(fallback.basis, 'FIRST_DISCOVERY');
  assert.equal(fallback.basisDate, '2026-10-20');
});

test('rows missing both dates get an initial check without inventing or mutating dates', () => {
  for (const p of [{}, { DATE_ADDED: 'UNKNOWN' }]) {
    const before = JSON.stringify(p);
    const a = P.assess(r(Object.freeze(p)), now);
    assert.equal(a.state, 'DUE');
    assert.equal(a.due, true);
    assert.equal(a.basis, 'UNDATED');
    assert.equal(a.basisDate, null);
    assert.equal(a.nextCheckAt, null);
    assert.match(a.reason, /Initial check.*unavailable/);
    assert.equal(JSON.stringify(p), before);
  }
});

test('dated and undated rows reuse successful evidence for seven days', () => {
  for (const base of [{}, { DATE_ADDED: '2026-10-01' }]) {
    for (const evidence of [
      { LIVENESS: 'LIVE_SECONDARY', LIVENESS_ASOF: '2026-10-30' },
      { ATS_CHECK_RESULT: 'LIVE', ATS_CHECK_ASOF: '2026-10-30' }
    ]) {
      const p = { ...base, ...evidence };
      assert.equal(P.assess(r(p), now).due, false);
      assert.equal(P.assess(r(p), now).nextCheckAt, '2026-11-06T00:00:00.000Z');
      boundary(p, '2026-11-06T00:00:00Z');
    }
  }
});

test('dated and undated rows keep one-day failed-attempt backoff', () => {
  for (const base of [{}, { DATE_ADDED: '2026-10-01' }]) {
    for (const evidence of [
      { LIVENESS_ATTEMPT_ASOF: '2026-10-31' },
      { ATS_CHECK_RESULT: 'ERROR_403', ATS_CHECK_ASOF: '2026-10-31' }
    ]) {
      const p = { ...base, ...evidence };
      assert.equal(P.assess(r(p), now).due, false);
      assert.equal(P.assess(r(p), now).nextCheckAt, '2026-11-01T00:00:00.000Z');
      boundary(p, '2026-11-01T00:00:00Z');
    }
  }
});

test('later attempt and saved success use the later existing retry window', () => {
  const p = { LIVENESS: 'LIVE_SECONDARY', LIVENESS_ASOF: '2026-10-25', ATS_CHECK_RESULT: 'ERROR_403', ATS_CHECK_ASOF: '2026-10-31' };
  assert.equal(P.assess(r(p), now).due, false);
  assert.equal(P.assess(r(p), now).nextCheckAt, '2026-11-01T00:00:00.000Z');
  boundary(p, '2026-11-01T00:00:00Z');
  boundary({ ...p, ATS_CHECK_ASOF: '2026-11-02' }, '2026-11-03T00:00:00Z');
});

test('unknown, invalid, and future check evidence cannot postpone an initial undated check', () => {
  for (const p of [
    { LIVENESS: 'UNCONFIRMED', LIVENESS_ASOF: '2026-10-30' },
    { LIVENESS: 'LIVE_SECONDARY', LIVENESS_ASOF: 'UNKNOWN', LIVENESS_ATTEMPT_ASOF: '2026-02-30' },
    { ATS_CHECK_RESULT: 'LIVE', ATS_CHECK_ASOF: '2026-12-01' }
  ]) assert.equal(P.assess(r(p), now).due, true);
});

test('protected and closed jobs remain excluded even with no dates', () => {
  for (const bucket of ['APPLIED', 'REJECTED_BY_EMPLOYER', 'DECLINED_BY_TIM', 'DUPLICATE', 'CLOSED_DEAD']) {
    assert.equal(P.assess({ BUCKET: bucket, p: {} }, now).state, 'PROTECTED');
  }
  for (const p of [{ ANTI_RESURRECTION: 'YES' }, { DO_NOT_REWORK: 'YES' }]) assert.equal(P.assess(r(p), now).due, false);
  for (const p of [{ LIVENESS: 'CLOSED' }, { ATS_CHECK_RESULT: 'CLOSED_EMPLOYER_404' }]) assert.equal(P.assess(r(p), now).state, 'CLOSED');
});

test('background checks cover research buckets too', () => {
  assert.equal(P.assess({ BUCKET: 'MANUAL_RESEARCH', p: { DATE_ADDED: '2026-10-01' } }, now).due, true);
});
