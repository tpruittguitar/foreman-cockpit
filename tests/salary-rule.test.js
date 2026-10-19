// SALARY RULE (Tim 2026-10-19 01:34; Grok Q2): an ESTIMATED save keeps its basis note, prefilled from what the row records.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
const i = src.indexOf('function estBasisDefault_'), j = src.indexOf('function researchCard_', i);
const estBasisDefault_ = new Function(src.slice(i, j) + '; return estBasisDefault_;')();

test('estimate basis prefill: "Comp estimate, <source>, <date>" from the row, empty when nothing is recorded', () => {
  assert.equal(estBasisDefault_({ SALARY_BASIS: 'EMPLOYER_COMPARABLE_ESTIMATE', SALARY_ANCHORS: 'Levels.fyi + 3 peer postings', SALARY_ASOF: '2026-10-12' }), 'Comp estimate, Levels.fyi + 3 peer postings, 2026-10-12');
  assert.equal(estBasisDefault_({ SALARY_SOURCE: 'Recruiter call', SALARY_ASOF: '2026-10-01' }), 'Comp estimate, Recruiter call, 2026-10-01');
  assert.equal(estBasisDefault_({ SALARY_BASIS: 'GLASSDOOR_RANGE' }), 'Comp estimate, GLASSDOOR_RANGE');
  assert.equal(estBasisDefault_({ SALARY_BASIS: 'EMPLOYER_COMPARABLE_ESTIMATE' }), '', 'the generic basis code is not a source');
  assert.equal(estBasisDefault_({}), '');
});

test('the note requirement only gates saving an estimate; it never touches the job (no hold, no bucket)', () => {
  const k = src.indexOf("if(salary&&salaryKind==='ESTIMATED'&&!note)"), line = src.slice(k, src.indexOf('\n', k));
  assert.ok(k > 0);
  assert.ok(!/BUCKET|HOLD|BLOCK/.test(line), line);
});
