// Snapshot age uses one threshold, structuredMeta.generatedAt only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { Date, Math, Number, String, Object };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'pipeline-data-age.js'), 'utf8'), ctx);
const A = ctx.PipelineDataAge;
const MIN = 60000;

function ageAt(ms, now) {
  return A.from(new Date(now - ms).toISOString(), now);
}

test('DATA_STALE_MS is one hour and 59, 60, 61 min and a missing time use that constant', () => {
  assert.equal(A.DATA_STALE_MS, 60 * MIN);
  const now = Date.parse('2026-11-14T18:00:00Z');
  const fresh = ageAt(A.DATA_STALE_MS - MIN, now);
  const atHour = ageAt(A.DATA_STALE_MS, now);
  const over = ageAt(A.DATA_STALE_MS + MIN, now);
  assert.equal(fresh.stale, false);
  assert.equal(fresh.unknown, false);
  assert.equal(+fresh.asOf, now - (A.DATA_STALE_MS - MIN));
  assert.equal(atHour.stale, true);
  assert.equal(atHour.unknown, false);
  assert.equal(over.stale, true);
  assert.equal(over.unknown, false);
  for (const missing of [undefined, null, '', 'not-a-time']) {
    const u = A.from(missing, now);
    assert.equal(u.stale, true);
    assert.equal(u.unknown, true);
    assert.equal(u.asOf, null);
    assert.equal(A.words(u).word, '? DATA AGE UNKNOWN');
    assert.equal(A.words(u).aria, 'Data age unknown');
  }
  assert.equal(A.words(fresh), null);
  const said = A.words(over);
  assert.match(said.word, /^DATA AS OF \d{1,2}:\d{2} [AP]M$/);
  assert.match(said.aria, /^Data may be out of date, as of \d{1,2}:\d{2} [AP]M$/);
  assert.equal(said.word, 'DATA AS OF ' + A.clock(over.asOf));
});

test('the clock is local h:mm AM/PM', () => {
  assert.equal(A.clock(new Date(2026, 10, 14, 15, 5)), '3:05 PM');
  assert.equal(A.clock(new Date(2026, 10, 14, 0, 7)), '12:07 AM');
  assert.equal(A.clock(new Date(2026, 10, 14, 12, 0)), '12:00 PM');
});

function ops(load) {
  const box = {
    Date, Math, Number, String, Object, JSON, Promise,
    document: { activeElement: null, visibilityState: 'hidden', addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    PipelineProgress: { begin() { return { finish() {} }; }, html() { return ''; } },
    PipelineCharts: { bars() { return ''; }, donut() { return ''; }, columns() { return ''; } },
    PipelineDataAge: A
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'pipeline-operations-ui.js'), 'utf8'), box);
  const ui = box.PipelineOperationsUI.create({
    escape(s) { return String(s == null ? '' : s); },
    get: async () => ({ ok: false, error: 'none' }),
    loadStatus: () => load,
    connection: () => ({ state: 'Connected structured runtime', lastRead: new Date().toISOString() })
  });
  const view = {
    innerHTML: '',
    isConnected: true,
    getClientRects: () => [{}],
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false
  };
  ui.render(view);
  return view.innerHTML;
}

function snapRow(html) {
  const m = html.match(/Structured snapshot<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>/);
  assert.ok(m, 'structured snapshot row missing');
  return { state: m[1], detail: m[2] };
}

test('operations shows OK only when generatedAt is fresh and never reads fetchedAt', () => {
  const now = Date.now();
  const freshAt = new Date(now - (A.DATA_STALE_MS - MIN)).toISOString();
  const staleAt = new Date(now - (A.DATA_STALE_MS + MIN)).toISOString();
  const fetchedAt = new Date(now).toISOString();
  function load(generatedAt) {
    return {
      freshness: 'LIVE',
      meta: {
        source: 'structured-runtime',
        fetchedAt: fetchedAt,
        modifiedTime: fetchedAt,
        total: 12,
        structured: { source: 'writer-master', generatedAt: generatedAt }
      },
      archive: { state: 'OK', rows: [1] },
      evidence: { state: 'OK', recs: [1] }
    };
  }
  const fresh = snapRow(ops(load(freshAt)));
  assert.equal(fresh.state, 'OK');
  assert.match(fresh.detail, new RegExp('^rows 12 · generated ' + freshAt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' · age \\d+ min$'));
  const stale = snapRow(ops(load(staleAt)));
  assert.equal(stale.state, 'STALE');
  assert.match(stale.detail, /^rows 12 · generated .+ · age \d+ min$/);
  assert.ok(stale.detail.includes(staleAt));
  assert.equal(stale.detail.includes(fetchedAt), false);
  const missing = snapRow(ops(load(undefined)));
  assert.equal(missing.state, 'STALE');
  assert.equal(missing.detail, 'rows 12 · generated UNKNOWN · age UNKNOWN');
  assert.equal(ops(load(undefined)).includes('Runtime status: DEGRADED'), true);
  assert.equal(ops(load(freshAt)).includes('Runtime status: OK'), true);
});
