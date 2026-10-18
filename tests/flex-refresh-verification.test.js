const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the actual Explorer orchestration with controlled Writer responses and time.
const html = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
const source = html.slice(html.indexOf('function waitRefreshVerification_('), html.indexOf('/* One-button section updates'));
function harness(options = {}) {
  let clock = 0, polls = 0, loads = 0, writes = 0;
  const events = [], rf = {busy: false, stop: false};
  const plan = n => ({stale: Array.from({length: n}, (_, i) => ({primaryId: String(i)})), policyId: 'test'});
  const initial = plan(2), remaining = options.remaining || [0];
  const status = options.status || (() => ({ok: true, unverified: {count: ++polls === 1 ? 2 : 0}}));
  const context = {
    Date: {now: () => clock},
    setTimeout: (fn, ms) => { clock += ms; options.onWait?.(rf); fn(); },
    S: {load: {freshness: 'LIVE'}}, rf_: () => rf,
    // Deliberately leave page state stale: subsequent passes must use the load result.
    refreshPlan_: () => initial,
    refreshChecks_: () => [{ok: true}], refreshAdmission_: () => ({records: 25}),
    paintRefresh_: () => {}, renderWriterStatus_: () => {}, esc: s => s,
    refreshReport_: (title, lines) => [title, ...lines].join('\n'),
    PipelineDerivedRefresh: {
      requests: rows => rows.map(r => ({ruling: {requestId: r.primaryId}})),
      chunk: rows => [rows]
    },
    gsPost: async () => {events.push('write'); writes++; return {ok: true};},
    recoverWriteResult_: async () => ({ok: true}),
    gsGet: async action => {assert.equal(action, 'writer_status'); events.push('status'); return status();},
    load: async () => {
      events.push('master');
      const n = remaining[Math.min(loads++, remaining.length - 1)];
      return {freshness: 'LIVE', plan: plan(n)};
    },
    viewPlan_: view => view.plan
  };
  vm.createContext(context); vm.runInContext(source, context);
  return {context, rf, events, run: () => context.applyRefresh_(), writes: () => writes, loads: () => loads};
}

test('FLEX refresh waits for zero unverified writes before reading the master', async () => {
  const h = harness(); await h.run();
  assert.deepEqual(h.events, ['write', 'status', 'status', 'master']);
  assert.match(h.rf.report, /Refresh complete/);
  assert.match(h.rf.report, /2 jobs/);
  assert.equal(h.rf.busy, false);
});

test('next pass uses the fresh master plan even when page state is older', async () => {
  const h = harness({remaining: [1, 0]}); await h.run();
  assert.equal(h.writes(), 2);
  assert.equal(h.loads(), 2);
  assert.match(h.rf.report, /Refresh complete/);
});

test('a genuinely unchanged master still stops before resubmission', async () => {
  const h = harness({remaining: [2]}); await h.run();
  assert.equal(h.writes(), 1);
  assert.match(h.rf.report, /No reduction in outstanding jobs after master verification/);
  assert.doesNotMatch(h.rf.report, /Refresh complete/);
});

test('pending verification times out without another submission or completion claim', async () => {
  const h = harness({status: () => ({ok: true, unverified: {count: 1}})}); await h.run();
  assert.equal(h.writes(), 1);
  assert.match(h.rf.report, /still pending after five minutes/);
  assert.doesNotMatch(h.rf.report, /Refresh complete/);
  // The only master read is the paused report's informational read.
  assert.equal(h.loads(), 1);
});

test('unknown, invalid, frozen and failed status cannot certify completion', async () => {
  const cases = [null, {ok: true}, {ok: false, unverified: {count: 0}},
    {ok: true, unverified: {count: '0'}}, {ok: true, unverified: {count: -1}},
    {ok: true, unverified: {count: 0.5}}, {ok: true, fetchError: 'offline', unverified: {count: 0}},
    {ok: true, freeze: {frozen: true}, unverified: {count: 0}}];
  for (const response of cases) {
    const h = harness({status: () => response}); await h.run();
    assert.equal(h.writes(), 1);
    assert.match(h.rf.report, /Refresh paused/);
    assert.doesNotMatch(h.rf.report, /Refresh complete/);
  }
  const h = harness({status: () => {throw new Error('network failure');}}); await h.run();
  assert.match(h.rf.report, /network failure/);
  assert.doesNotMatch(h.rf.report, /Refresh complete/);
});

test('Stop during verification exits without another submission', async () => {
  const h = harness({onWait: rf => {rf.stop = true;}}); await h.run();
  assert.equal(h.writes(), 1);
  assert.deepEqual(h.events, ['write', 'status', 'master']);
  assert.match(h.rf.report, /Refresh stopped/);
  assert.doesNotMatch(h.rf.report, /Refresh complete/);
});
