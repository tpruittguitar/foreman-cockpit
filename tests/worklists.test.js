const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const W = require('../apps-script/PipelineWorklists.gs');

const NOW = '2026-10-13T05:00:00Z';
const head = 'V2_CURRENT_POPULATION_MASTER\nCOUNTS: TOTAL=0\n================================================================\n';
const row = (inv, id, bucket, payload, co = 'Co', title = 'Director of Manufacturing') =>
  `${inv} | ${id} | ${co} | ${title} | ${bucket} | OPEN | - | R1 | Austin, TX | ${payload}`;

test('payload parser splits space-joined keys after a URL', () => {
  const p = W.parsePayload('SOURCE=https://x.invalid/j/1 LIVENESS=LIVE_FIRST_PARTY_2026-09-29; SALARY_BASE_EST=$200000-$250000; NOTE=a; b');
  assert.equal(p.SOURCE, 'https://x.invalid/j/1');
  assert.equal(p.LIVENESS, 'LIVE_FIRST_PARTY_2026-09-29');
  assert.equal(p.SALARY_BASE_EST, '$200000-$250000');
  assert.equal(p.NOTE, 'a; b');
});

test('lanes select the right rows and exclude protected states', () => {
  const text = head + [
    row(1, 'V2I-000000000001', 'SCOUT_INTAKE', 'SOURCE_URL=https://a.invalid; DATE_ADDED=2026-10-12'),
    row(2, 'V2I-000000000002', 'SCOUT_INTAKE', 'SOURCE_URL=https://b.invalid; LIVENESS=LIVE_EMPLOYER_ATS; LIVENESS_ASOF=2026-10-12; SCOPE_FIT_RAW=72; SALARY_BASE_LOW=$250000; SALARY_BASE_HIGH=$300000; DEGREE_REQ=NOT_STATED; FLEX_CLASS=HIGH_FLEX'),
    row(3, 'V2I-000000000003', 'APPLIED', 'ANTI_RESURRECTION=YES'),
    row(4, 'V2I-000000000004', 'DECLINED_BY_TIM', ''),
    row(5, 'V2I-000000000005', 'READY_TO_PURSUE', 'ANALYSIS_BY=CLAUDE_X; SALARY_MIDPOINT=$250000; DEGREE_TEXT=not stated in alert; FLEX_CLASS=HIGH_FLEX'),
    row(6, 'V2I-000000000006', 'SCOUT_INTAKE', 'LIVENESS=UNCONFIRMED; LIVENESS_ASOF=2026-10-12; DATE_ADDED=2026-10-01'),
    row(7, 'V2I-000000000007', 'SCOUT_INTAKE', 'LIVENESS=UNCONFIRMED; LIVENESS_ASOF=2026-09-20; DATE_ADDED=2026-09-15'),
  ].join('\n') + '\nEND V2_CURRENT_POPULATION_MASTER (7 rows)\n';
  const b = W.build(text, { now: NOW });
  const ids = lane => b.lanes[lane].map(r => r.PRIMARY_ID);
  assert.deepEqual(ids('FORGE_ENRICH_STRATEGIC'), ['V2I-000000000001', 'V2I-000000000006', 'V2I-000000000007']);
  // analyzed row 5 comes first despite being older
  assert.equal(ids('FORGE_ENRICH_FEASIBILITY')[0], 'V2I-000000000005');
  assert.ok(!ids('FORGE_ENRICH_FEASIBILITY').includes('V2I-000000000002'));
  // fresh UNCONFIRMED (row 6) waits; stale UNCONFIRMED (row 7) and missing (row 1) are listed
  assert.deepEqual(ids('FORGE_POSTING_VALIDATION'), ['V2I-000000000001', 'V2I-000000000007']);
  for (const lane of W.LANES) for (const id of ids(lane)) assert.ok(!['V2I-000000000003', 'V2I-000000000004'].includes(id));
});

test('alert-derived degree text and unreadable pay count as missing', () => {
  const text = head + [
    row(1, 'V2I-0000000000C1', 'SCOUT_INTAKE', 'PAY_POSTED=UNKNOWN; DEGREE_TEXT=not stated in alert; SCOPE_FIT_RAW=60'),
    row(2, 'V2I-0000000000C2', 'SCOUT_INTAKE', 'PAY_POSTED=$150,000 - $175,000 a year; DEGREE_TEXT=Bachelor degree in engineering required; SCOPE_FIT_RAW=60'),
  ].join('\n');
  const fe = W.build(text, { now: NOW }).lanes.FORGE_ENRICH_FEASIBILITY;
  assert.deepEqual(fe.map(r => r.PRIMARY_ID), ['V2I-0000000000C1']);
  assert.match(W.render('FORGE_ENRICH_FEASIBILITY', { rows: 2, lanes: { FORGE_ENRICH_FEASIBILITY: fe } }), /NEED=SALARY,DEGREE/);
  assert.equal(W.build(text, { now: NOW }).lanes.FORGE_ENRICH_STRATEGIC.length, 0);
});

test('recent attempt stamps push a row to the end', () => {
  const text = head + [
    row(1, 'V2I-00000000000A', 'SCOUT_INTAKE', 'DATE_ADDED=2026-10-12; STRATEGIC_ATTEMPT_ASOF=2026-10-12'),
    row(2, 'V2I-00000000000B', 'SCOUT_INTAKE', 'DATE_ADDED=2026-10-01'),
  ].join('\n');
  assert.deepEqual(W.build(text, { now: NOW }).lanes.FORGE_ENRICH_STRATEGIC.map(r => r.PRIMARY_ID), ['V2I-00000000000B', 'V2I-00000000000A']);
});

test('render is small, capped and well formed on the scrubbed fixture', () => {
  const text = fs.readFileSync(path.join(__dirname, 'fixtures/master.sample.txt'), 'utf8');
  const b = W.build(text, { now: NOW });
  for (const lane of W.LANES) {
    const out = W.render(lane, b, { generatedAt: NOW, masterId: 'M', masterModified: NOW });
    assert.match(out, new RegExp('^WORKLIST ' + lane + '\\n'));
    assert.match(out, /\nEND WORKLIST\n$/);
    assert.ok(out.length < 16000, lane + ' too large: ' + out.length);
    const lines = out.split('\n').filter(l => /^\d+\. V2/.test(l));
    assert.ok(lines.length <= W.LIMIT);
    for (const l of lines) assert.ok(!/\| (APPLIED|REJECTED_BY_EMPLOYER|DECLINED_BY_TIM|DUPLICATE|CLOSED_DEAD|INVALID_DISCOVERY) \|/.test(l), l);
  }
});
