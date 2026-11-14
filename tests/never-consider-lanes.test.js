// Never-consider runs at the start of each Writer lane. A match is declined and does not reach pay, enrichment, or ATS.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const Scoring = require('../pipeline-scoring');
const Writer = require('../apps-script/Code.gs');
const Worklists = require('../apps-script/PipelineWorklists.gs');
const Ats = require('../apps-script/PipelineAts.gs');

const NOW = '2026-10-13T19:00:00.000Z';
const canonical = fs.readFileSync(path.join(__dirname, 'fixtures', 'TIM_PIPELINE_RULES_CANONICAL.sample.txt'), 'utf8');
const NC_020 = '- NC-020 IC_ENGINEER: titles containing Engineer, Technician, Inspector, Analyst, Scientist or Specialist with no manager or leadership level. Titles containing Staff Engineer, Senior Staff Engineer or Principal Engineer stay exempt and must never be declined by this rule. ruling=TIM-20261114 (Root declined-jobs review). title_any=engineer|technician|inspector|analyst|scientist|specialist; title_exempt=staff engineer|senior staff engineer|principal engineer; level_exempt=manager|senior manager|director|sr director|senior director|vp|vice president|head|chief|executive|general manager|plant manager|leader';
const rules = Writer.parseCanonicalNeverConsiderRules(canonical.replace('SECTION=COMPENSATION_GEOGRAPHY', NC_020 + '\nSECTION=COMPENSATION_GEOGRAPHY'));
const head = 'V2_CURRENT_POPULATION_MASTER\nCOUNTS: TOTAL=0\n================================================================\n';
const line = (inv, id, title, payload) => `${inv} | ${id} | Acme | ${title} | SCOUT_INTAKE | OPEN | - | R1 | Austin, TX | ${payload}`;
const LIST = 'SOURCE_URL=https://www.linkedin.com/jobs/view/1; DATE_ADDED=2026-09-01';
const ATS = 'COMPANY_SOURCE_URL=https://job-boards.greenhouse.io/acme/jobs/1234567; DATE_ADDED=2026-09-01';
const text = head + [
  line(1, 'V2I-LIST', 'Quality Engineer', LIST),
  line(2, 'V2I-ATS', 'Quality Engineer', ATS),
  line(3, 'V2I-DIR', 'Director of Quality', LIST),
  line(4, 'V2I-STAFF', 'Senior Staff Engineer Quality', ATS),
  line(5, 'V2I-PRIN', 'Principal Engineer', LIST)
].join('\n') + '\n';

test('a matching row is declined before pay, enrichment, liveness, or ATS', () => {
  const open = Worklists.build(text, { now: NOW });
  assert.ok(open.lanes.FORGE_ENRICH_FEASIBILITY.some(r => r.PRIMARY_ID === 'V2I-LIST'));
  assert.ok(open.lanes.FORGE_ENRICH_STRATEGIC.some(r => r.PRIMARY_ID === 'V2I-LIST'));
  assert.ok(open.lanes.FORGE_POSTING_VALIDATION.some(r => r.PRIMARY_ID === 'V2I-LIST'));
  assert.deepEqual(Ats.select(Worklists.parseRows(text), { now: NOW }).map(x => x.row.PRIMARY_ID), ['V2I-STAFF', 'V2I-ATS']);

  const scored = Scoring.scoreRow;
  let scores = 0;
  Scoring.scoreRow = function () { scores++; return scored.apply(this, arguments); };
  try {
    const built = Worklists.build(text, { now: NOW, rules: rules });
    for (const lane of ['FORGE_ENRICH_FEASIBILITY', 'FORGE_ENRICH_STRATEGIC', 'FORGE_POSTING_VALIDATION']) {
      assert.ok(!built.lanes[lane].some(r => r.PRIMARY_ID === 'V2I-LIST' || r.PRIMARY_ID === 'V2I-ATS'), lane);
    }
    const declined = built.declines.filter(d => d.primaryId === 'V2I-LIST' || d.primaryId === 'V2I-ATS');
    assert.equal(declined.length, 2);
    for (const d of declined) {
      assert.equal(d.ok, true);
      assert.equal(d.ruling.kind, 'DECLINE');
      assert.equal(d.ruling.code, 'NEVER_CONSIDER');
      assert.match(d.after, /\| DECLINED_BY_TIM \|/);
      assert.match(d.after, /DECLINE_REASON_CODE=NEVER_CONSIDER/);
      assert.doesNotMatch(d.after, /SALARY_BASE_POSTED/);
    }
    const picked = Ats.select(Worklists.parseRows(text), { now: NOW, rules: rules });
    assert.deepEqual(picked.map(x => x.row.PRIMARY_ID), ['V2I-STAFF']);
    assert.ok(picked.declines.some(d => d.primaryId === 'V2I-ATS' && d.ok && /DECLINED_BY_TIM/.test(d.after)));

    const row = line(1, 'V2I-LIST', 'Quality Engineer', LIST);
    const pol = { FLEX_POLICY_VERSION: 'RULES_V4_20261007', _SCORING_MODEL: Scoring.defaults(), _NEVER_CONSIDER: rules };
    const enrich = Writer.mutateRow(row, { kind: 'ENRICH', actor: 'FORGE', requestId: 'E-1', fields: { SALARY_BASE_POSTED: '$180,000' } }, pol);
    assert.equal(enrich.ok, true);
    assert.match(enrich.after, /\| DECLINED_BY_TIM \|/);
    assert.doesNotMatch(enrich.after, /SALARY_BASE_POSTED/);
    assert.equal(scores, 0);
  } finally {
    Scoring.scoreRow = scored;
  }
});

test('Director of Quality, Senior Staff Engineer Quality, and Principal Engineer pass the lanes', () => {
  const built = Worklists.build(text, { now: NOW, rules: rules });
  for (const id of ['V2I-DIR', 'V2I-PRIN']) {
    for (const lane of ['FORGE_ENRICH_FEASIBILITY', 'FORGE_ENRICH_STRATEGIC', 'FORGE_POSTING_VALIDATION']) {
      assert.ok(built.lanes[lane].some(r => r.PRIMARY_ID === id), id + ' ' + lane);
    }
  }
  assert.ok(built.lanes.FORGE_ENRICH_FEASIBILITY.some(r => r.PRIMARY_ID === 'V2I-STAFF'));
  assert.ok(built.lanes.FORGE_ENRICH_STRATEGIC.some(r => r.PRIMARY_ID === 'V2I-STAFF'));
  assert.ok(!built.declines.some(d => ['V2I-DIR', 'V2I-STAFF', 'V2I-PRIN'].includes(d.primaryId)));
  const titles = ['Staff Engineer', 'Senior Staff Engineer', 'Senior Staff Engineer Quality', 'Principal Engineer', 'Director of Quality'];
  for (const title of titles) {
    const hit = Writer.classifyNeverConsider({ COMPANY: 'Acme', TITLE: title, LOCATION: 'Austin, TX', REMOTE_HYBRID: 'On-site' }, rules);
    assert.equal(hit.outcome, 'ALLOW', title + ' ' + hit.outcome + ' ' + hit.ruleId);
    assert.notEqual(hit.ruleId, 'NC-020');
  }
});
