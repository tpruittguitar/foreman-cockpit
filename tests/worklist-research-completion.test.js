'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Writer = require('../apps-script/Code.gs');
const Worklists = require('../apps-script/PipelineWorklists.gs');
const { world } = require('./helpers/writer-world');
const NOW = '2026-11-08T12:00:00Z';
const row = (id, payload = '', bucket = 'SCOUT_INTAKE') =>
  `1 | ${id} | Acme | Director of Quality | ${bucket} | ANALYSIS_PENDING | - | R1 | Austin, TX | ${payload}`;
const ids = (lines, lane = 'FORGE_ENRICH_STRATEGIC') => Worklists.build(lines.join('\n'), { now: NOW }).lanes[lane].map(r => r.PRIMARY_ID);
const rec = (pid, v, base, f) => ({ pid, v, base, ts: NOW, src: 'TEST', f });

test('completion metadata stays inline through the evidence split; prose still moves losslessly', () => {
  for (const key of ['ANALYSIS_BY', 'ANALYSIS_ASOF', 'ANALYSIS_ACTOR', 'STRATEGIC_ASOF']) {
    assert.equal(Writer.isEvidenceKey_(key), false, key);
    const line = row('V2I-COMPLETE', `${key}=2026-11-08; ANALYSIS_NOTE=Completed source review`);
    const split = Writer.splitRowEvidence_(line, 1);
    assert.match(split.line, new RegExp(key + '=2026-11-08'));
    assert.deepEqual(split.fields, { ANALYSIS_NOTE: 'Completed source review' });
    assert.deepEqual(ids([split.line]), [], key);
    const hydrated = Writer.hydrateLines_([split.line], [], [rec('V2I-COMPLETE', 1, 0, split.fields)]);
    assert.match(hydrated[0], /ANALYSIS_NOTE=Completed source review/);
  }
});

test('Writer enrichment retains markers, externalizes narrative, and still requires independent verification', t => {
  const pid = 'V2I-RESEARCH', w = world(t, { rows: [row(pid)] });
  const folder = global.DriveApp.getRootFolder(), companion = folder.createFile('V2_EVIDENCE_COMPANION.jsonl', '');
  folder.createFile('PIPELINE_MIGRATION_STATE.json', JSON.stringify({ mode: 'LIVE', status: 'CUTOVER_COMPLETE', companionId: companion.getId() }));
  const result = w.post({ action: 'batch', requests: [{ action: 'ruling', ruling: { primaryId: pid, kind: 'ENRICH', actor: 'CHATGPT', requestId: 'RESEARCH-1', fields: {
    ANALYSIS_ASOF: NOW, ANALYSIS_ACTOR: 'CHATGPT', ANALYSIS_NOTE: 'Completed strategic source review'
  } } }] });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.verification, 'PENDING', 'research markers never promote Writer completion');
  const compact = w.row(pid);
  assert.match(compact, /ANALYSIS_ASOF=2026-11-08T12:00:00Z/);
  assert.match(compact, /ANALYSIS_ACTOR=CHATGPT/);
  assert.doesNotMatch(compact, /ANALYSIS_NOTE=/);
  assert.match(w.text('V2_EVIDENCE_COMPANION.jsonl'), /Completed strategic source review/);
  assert.deepEqual(ids([compact]), []);
  assert.deepEqual(ids([compact], 'FORGE_ENRICH_FEASIBILITY'), [pid], 'salary and degree remain unfinished');
  assert.equal(w.exec(() => Writer.verifyPendingWrites_()).decided[0].decision, 'COMPLETE');
});

test('legacy projection follows only the canonical evidence chain and leaves sources unchanged', () => {
  const lines = [row('V2I-DONE', 'EVIDENCE_REF=EVC1:2'), row('V2I-OFFCHAIN', 'EVIDENCE_REF=EVC1:1')];
  const records = [
    rec('V2I-DONE', 1, 0, { ANALYSIS_ASOF: NOW, ANALYSIS_NOTE: 'Long source narrative', SALARY_BASE_EST: '250000' }),
    rec('V2I-DONE', 2, 1, { ANALYSIS_ACTOR: 'CHATGPT' }),
    rec('V2I-DONE', 3, 2, { ANALYSIS_ASOF: 'UNKNOWN' }),
    rec('V2I-OFFCHAIN', 1, 0, { ANALYSIS_NOTE: 'Partial notes only' }),
    rec('V2I-OFFCHAIN', 2, 1, { ANALYSIS_ASOF: NOW })
  ];
  const before = JSON.stringify({ lines, records });
  const projected = Writer.worklistResearchLines_(lines, records);
  assert.deepEqual(ids(projected), ['V2I-OFFCHAIN']);
  assert.deepEqual(ids(projected, 'FORGE_ENRICH_FEASIBILITY').sort(), ['V2I-DONE', 'V2I-OFFCHAIN']);
  assert.doesNotMatch(projected.join('\n'), /ANALYSIS_NOTE|SALARY_BASE_EST/);
  assert.equal(JSON.stringify({ lines, records }), before);
});

test('missing/broken/cyclic chains, pointer-only rows, notes and attempts never establish completion', () => {
  const lines = ['MISSING', 'BROKEN', 'CYCLE', 'PARTIAL'].map(id => row('V2I-' + id, 'EVIDENCE_REF=EVC1:2; STRATEGIC_ATTEMPT_ASOF=2026-11-07'));
  const records = [rec('V2I-BROKEN', 2, 1, { ANALYSIS_ASOF: NOW }), rec('V2I-CYCLE', 2, 2, { ANALYSIS_ASOF: NOW }),
    rec('V2I-PARTIAL', 2, 0, { ANALYSIS_NOTE: 'Still need the posting', ANALYSIS_BASIS: 'Partial', ANALYSIS_CONFIDENCE: 'LOW' })];
  assert.deepEqual(ids(Writer.worklistResearchLines_(lines, records)).sort(), lines.map(l => l.split(' | ')[1]).sort());
});

test('equal evidence versions belonging to other jobs cannot complete this job', () => {
  const lines = [row('V2I-UNFINISHED', 'EVIDENCE_REF=EVC1:1')];
  const records = [rec('V2I-OTHER', 1, 0, { ANALYSIS_ASOF: NOW }), rec('V2I-UNFINISHED', 1, 0, { ANALYSIS_NOTE: 'Partial only' })];
  assert.deepEqual(ids(Writer.worklistResearchLines_(lines, records)), ['V2I-UNFINISHED']);
});

test('inline values override history, chain updates clear legacy markers, and unknown markers remain unfinished', () => {
  const lines = [row('V2I-INLINE', 'ANALYSIS_ASOF=UNKNOWN; EVIDENCE_REF=EVC1:1'), row('V2I-CLEARED', 'EVIDENCE_REF=EVC1:2'),
    row('V2I-UNKNOWN', 'ANALYSIS_ACTOR=UNVERIFIED; ANALYSIS_ASOF=TBD'), row('V2I-NOPOINTER'), row('V2I-NONSTRING', 'EVIDENCE_REF=EVC1:1')];
  const records = [rec('V2I-INLINE', 1, 0, { ANALYSIS_ASOF: NOW }), rec('V2I-CLEARED', 1, 0, { ANALYSIS_ASOF: NOW }),
    rec('V2I-CLEARED', 2, 1, { ANALYSIS_ASOF: 'UNKNOWN' }), rec('V2I-NOPOINTER', 1, 0, { ANALYSIS_ASOF: NOW }), rec('V2I-NONSTRING', 1, 0, { ANALYSIS_ACTOR: { completed: true } })];
  const projected = Writer.worklistResearchLines_(lines, records);
  assert.match(projected[0], /ANALYSIS_ASOF=UNKNOWN/);
  assert.equal(ids(projected).length, lines.length);
});

test('research completion never hides feasibility/posting work or reopens protected jobs', () => {
  const lines = [row('V2I-DONE', 'EVIDENCE_REF=EVC1:1; DATE_ADDED=2026-10-01'), row('V2I-PROTECTED', 'EVIDENCE_REF=EVC1:1', 'DECLINED_BY_TIM'), row('V2I-LOCKED', 'EVIDENCE_REF=EVC1:1; ANTI_RESURRECTION=YES')];
  const records = lines.map(l => rec(l.split(' | ')[1], 1, 0, { ANALYSIS_ASOF: NOW }));
  const projected = Writer.worklistResearchLines_(lines, records);
  assert.deepEqual(ids(projected), []);
  assert.deepEqual(ids(projected, 'FORGE_ENRICH_FEASIBILITY'), ['V2I-DONE']);
  assert.deepEqual(ids(projected, 'FORGE_POSTING_VALIDATION'), ['V2I-DONE']);
});

function refreshFixture(text, records, opts = {}) {
  const writes = [], props = {}, counts = { companionReads: 0, routingReads: 0 };
  const context = {
    PipelineEvidence: require('../apps-script/PipelineEvidence.gs'), PipelineAts: require('../apps-script/PipelineAts.gs'),
    PipelinePostingFreshness: require('../apps-script/PipelinePostingFreshness.gs'),
    MASTER_ID: 'MASTER', readMasterText_: () => text,
    evidenceRouting_: () => { counts.routingReads++; return { active: opts.active !== false }; },
    loadCompanionRecs_: () => { counts.companionReads++; if (opts.failure) throw Error(opts.failure); return records; },
    worklistResearchLines_: Writer.worklistResearchLines_,
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props[key], setProperty: (key, value) => { props[key] = value; } }) },
    DriveApp: { getFileById: id => ({ getLastUpdated: () => new Date(NOW), setContent: body => { assert.notEqual(id, 'MASTER'); writes.push({ id, body }); } }) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/PipelineWorklists.gs'), 'utf8'), context);
  return { refresh: () => context.refreshWorklists_(true), writes, props, counts };
}

test('scheduled refresh projects legacy markers with one companion read and zero master writes', () => {
  const fixture = refreshFixture(row('V2I-DONE', 'EVIDENCE_REF=EVC1:1'), [rec('V2I-DONE', 1, 0, { ANALYSIS_ASOF: NOW })]);
  const result = fixture.refresh();
  assert.equal(result.lanes.FORGE_ENRICH_STRATEGIC.eligible, 0);
  assert.equal(result.lanes.FORGE_ENRICH_FEASIBILITY.eligible, 1);
  assert.equal(fixture.counts.companionReads, 1);
  assert.equal(fixture.writes.length, 3);
  assert.ok(fixture.props.WORKLISTS_BUILT_AT);
});

test('legacy projection considers the full backlog before applying the rendered worklist limit', () => {
  const lines = Array.from({ length: Worklists.LIMIT }, (_, n) => row('V2I-PENDING-' + n));
  lines.push(row('V2I-LEGACY-LAST', 'EVIDENCE_REF=EVC1:1'));
  const fixture = refreshFixture(lines.join('\n'), [rec('V2I-LEGACY-LAST', 1, 0, { ANALYSIS_ASOF: NOW })]);
  assert.equal(fixture.refresh().lanes.FORGE_ENRICH_STRATEGIC.eligible, Worklists.LIMIT);
  assert.equal(fixture.counts.companionReads, 1);
  assert.match(fixture.writes[0].body, /ELIGIBLE_TOTAL=80 SHOWN=80/);
});

test('refresh skips unnecessary companion reads and publishes nothing after an evidence read failure', () => {
  for (const text of [row('V2I-INLINE', 'ANALYSIS_ASOF=' + NOW + '; EVIDENCE_REF=EVC1:1'), row('V2I-FIT', 'SCOPE_FIT_RAW=80; EVIDENCE_REF=EVC1:1'), row('V2I-NEW'), row('V2I-DECLINED', 'EVIDENCE_REF=EVC1:1', 'DECLINED_BY_TIM')]) {
    const fixture = refreshFixture(text, [], { failure: 'should not read' });
    fixture.refresh();
    assert.equal(fixture.counts.companionReads, 0);
    assert.equal(fixture.counts.routingReads, 0);
  }
  const inactive = refreshFixture(row('V2I-OLD', 'EVIDENCE_REF=EVC1:1'), [], { active: false });
  assert.equal(inactive.refresh().lanes.FORGE_ENRICH_STRATEGIC.eligible, 1);
  assert.equal(inactive.counts.companionReads, 0);
  const failed = refreshFixture(row('V2I-OLD', 'EVIDENCE_REF=EVC1:1'), [], { failure: 'companion unavailable' });
  assert.throws(failed.refresh, /companion unavailable/);
  assert.equal(failed.writes.length, 0);
  assert.equal(failed.props.WORKLISTS_BUILT_AT, undefined);
});
