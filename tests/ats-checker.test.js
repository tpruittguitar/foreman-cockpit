const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../apps-script/PipelineAts.gs');
const W = require('../apps-script/PipelineWorklists.gs');

const NOW = '2026-10-13T19:00:00.000Z';
const row = (p, title = 'Director of Manufacturing', bucket = 'SCOUT_INTAKE', id = 'V2I-000000000001') => ({ PRIMARY_ID: id, TITLE: title, BUCKET: bucket, INV_NUM: 1, COMPANY: 'Co', p: {DATE_ADDED:'2026-09-01',...p} });

test('detects each provider from stored URLs, byte-for-byte host and slug', () => {
  const wd = A.detectUrl('https://entegris.wd1.myworkdayjobs.com/EntegrisCareers/job/Aurora-IL/Vice-President--Operations--North-America_REQ-11621');
  assert.equal(wd.provider, 'WORKDAY');
  assert.equal(wd.api, 'https://entegris.wd1.myworkdayjobs.com/wday/cxs/entegris/EntegrisCareers/job/Aurora-IL/Vice-President--Operations--North-America_REQ-11621');
  const wdLocale = A.detectUrl('https://blueorigin.wd5.myworkdayjobs.com/en-US/BlueOrigin/job/Huntsville-AL/Director-of-Manufacturing-Engineering_R53294');
  assert.equal(wdLocale.api, 'https://blueorigin.wd5.myworkdayjobs.com/wday/cxs/blueorigin/BlueOrigin/job/Huntsville-AL/Director-of-Manufacturing-Engineering_R53294');
  const cxs = 'https://blueorigin.wd5.myworkdayjobs.com/wday/cxs/blueorigin/BlueOrigin/job/Director--Quality-Assurance_R72133';
  assert.equal(A.detectUrl(cxs).api, cxs);
  assert.equal(A.detectUrl('https://job-boards.greenhouse.io/vulcanelements/jobs/5434413008').api, 'https://boards-api.greenhouse.io/v1/boards/vulcanelements/jobs/5434413008?pay_transparency=true');
  assert.equal(A.detectUrl('https://boards-api.greenhouse.io/v1/boards/vulcanelements/jobs/5434413008').provider, 'GREENHOUSE');
  assert.equal(A.detectUrl('https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply').api, 'https://api.lever.co/v0/postings/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd');
  assert.equal(A.detectUrl('https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245').api, 'https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true');
  const ora = A.detectUrl('https://apply.ford.com/en/sites/CX_1/job/67990/apply/email');
  assert.equal(ora.provider, 'ORACLE_HCM'); assert.match(ora.api, /^https:\/\/apply\.ford\.com\/hcmRestApi\/.*Id%3D%2267990%22%2CsiteNumber%3DCX_1$/);
  const oraRest = 'https://edwa.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById%3BId%3D%224621%22%2CsiteNumber%3DCX_2';
  assert.equal(A.detectUrl(oraRest).api, oraRest);
  // A named Oracle site cannot be mapped to its CX code: not detected, stays with the AI lane.
  assert.equal(A.detectUrl('https://eese.fa.us8.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CentrusEnergyCareers/job/748'), null);
  assert.equal(A.detectUrl('https://jobs.smartrecruiters.com/BoschGroup/744000012345678-director').provider, 'SMARTRECRUITERS');
  assert.equal(A.detectUrl('https://flyio.bamboohr.com/careers/63').api, 'https://flyio.bamboohr.com/careers/list');
  for (const u of ['https://www.linkedin.com/jobs/view/4469962649', 'https://www.indeed.com/viewjob?jk=fd96b4308e0aa9d7', 'https://www.tesla.com/careers/search/job/269209', 'https://careers-novelis.icims.com/jobs/53024/x/job'])
    assert.equal(A.detectUrl(u), null, u);
});

test('row detection follows key priority and skips non-ATS URLs', () => {
  const d = A.detect({ SOURCE_URL: 'https://www.linkedin.com/jobs/view/1', COMPANY_SOURCE_URL: 'https://job-boards.greenhouse.io/acme/jobs/1234567', INITIATING_URL: 'https://jobs.lever.co/x/6ed76ce8-4156-4b60-b120-403538bd66cd' });
  assert.equal(d.provider, 'GREENHOUSE'); assert.equal(d.fromKey, 'COMPANY_SOURCE_URL');
  assert.equal(A.detect({ SOURCE_URL: 'https://www.linkedin.com/jobs/view/1' }), null);
});

const wdBody = (o = {}) => JSON.stringify({ jobPostingInfo: Object.assign({ title: 'Vice President, Operations- North America', posted: true, canApply: true, startDate: '2026-05-15', jobDescription: '<p><b>What we seek:</b></p><ul><li>Bachelor&rsquo;s degree in engineering, preferably chemical engineering; an advanced degree (MBA or MS) or equivalent executive experience is preferred.</li></ul><li>Compensation: $275,000.00-$330,00.00 per year range</li>' }, o) });

test('Workday: live, closed by flags, closed by 404, malformed pay is never guessed', () => {
  const t = A.detectUrl('https://entegris.wd1.myworkdayjobs.com/EntegrisCareers/job/Aurora-IL/Vice-President--Operations--North-America_REQ-11621');
  const r = row({}, 'Vice President, Operations- North America');
  const live = A.interpret(t, 200, wdBody(), r, { now: NOW });
  assert.equal(live.result, 'LIVE'); assert.equal(live.liveness, 'LIVE_EMPLOYER_ATS');
  assert.equal(live.pay, null, 'employer typo $330,00.00 must not produce a range');
  assert.match(live.degree, /^Bachelor.s degree in engineering/);
  assert.equal(A.interpret(t, 200, wdBody({ canApply: false }), r).liveness, 'CLOSED_EMPLOYER_ATS');
  assert.equal(A.interpret(t, 404, '', r).liveness, 'CLOSED_EMPLOYER_404');
  for (const code of [0, 403, 429, 500, 503]) { const x = A.interpret(t, code, '', r); assert.equal(x.liveness, undefined); assert.match(x.result, /^ERROR_/); }
  assert.equal(A.interpret(t, 200, '<html>blocked</html>', r).result, 'UNREADABLE');
});

test('title mismatch never stamps LIVE', () => {
  const t = A.detectUrl('https://entegris.wd1.myworkdayjobs.com/EntegrisCareers/job/X/Y_REQ-1');
  const x = A.interpret(t, 200, wdBody({ title: 'Payroll Specialist' }), row({}, 'Vice President, Operations North America'));
  assert.equal(x.result, 'TITLE_MISMATCH'); assert.equal(x.liveness, undefined);
});

test('Greenhouse structured pay, Lever salaryRange, Ashby compensation and absence', () => {
  const gh = A.detectUrl('https://job-boards.greenhouse.io/vulcanelements/jobs/5434413008');
  const g = A.interpret(gh, 200, JSON.stringify({ id: 5434413008, title: 'Sr. Manager, Quality', first_published: '2026-09-25T14:15:41-04:00', content: '&lt;li&gt;Bachelor&#39;s degree in Materials Science or a related technical discipline.&lt;/li&gt;', pay_input_ranges: [{ min_cents: 15000000, max_cents: 19000000, currency_type: 'USD' }] }), row({}, 'Sr. Manager, Quality'));
  assert.equal(g.result, 'LIVE'); assert.deepEqual(g.pay, { low: 150000, high: 190000 }); assert.match(g.degree, /^Bachelor's degree in Materials Science/);
  assert.equal(A.interpret(gh, 404, '{}', row({})).liveness, 'CLOSED_EMPLOYER_404');

  const lv = A.detectUrl('https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd');
  const l = A.interpret(lv, 200, JSON.stringify({ id: '6ed76ce8-4156-4b60-b120-403538bd66cd', text: 'Director, Production', createdAt: 1786469891368, descriptionPlain: 'x', lists: [{ text: 'What We Require', content: '<li>BS in engineering or equivalent experience.</li>' }], salaryRange: { min: 210000, max: 260000, currency: 'USD', interval: 'per-year-salary' } }), row({}, 'Director of Production'));
  assert.equal(l.result, 'LIVE'); assert.deepEqual(l.pay, { low: 210000, high: 260000 });

  const ab = A.detectUrl('https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245');
  const board = { jobs: [{ id: '34413f8d-26bf-4bbc-8ade-eb309a0e2245', title: 'Head of Manufacturing', publishedAt: '2026-04-07T17:12:35Z', descriptionPlain: 'No degree stated.', compensation: { summaryComponents: [{ compensationType: 'EquityPercentage', interval: 'NONE' }, { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'USD', minValue: 211400, maxValue: 290600 }] } }] };
  const a = A.interpret(ab, 200, JSON.stringify(board), row({}, 'Head of Manufacturing'));
  assert.equal(a.result, 'LIVE'); assert.deepEqual(a.pay, { low: 211400, high: 290600 });
  const gone = A.interpret(ab, 200, JSON.stringify({ jobs: [] }), row({}, 'Head of Manufacturing'));
  assert.equal(gone.result, 'NOT_IN_PUBLIC_BOARD'); assert.equal(gone.liveness, undefined, 'absence from an Ashby board never closes a row');
  assert.equal(A.interpret(ab, 404, '', row({})).liveness, undefined);
});

test('Oracle HCM: live, expired end date closes, empty items does not', () => {
  const t = A.detectUrl('https://edwa.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById%3BId%3D%224621%22%2CsiteNumber%3DCX_2');
  const item = { Title: 'Plant General Manager', ExternalPostedStartDate: '2026-09-28T13:38:53+00:00', ExternalPostedEndDate: null, ExternalDescriptionStr: '<li>Bachelor’s Degree in a Technical field preferred, and 10 plus years of experience in manufacturing.</li><p>This position has a base salary range of $185,000 – 200,000 plus eligibility for an annual incentive bonus.</p>' };
  const r = row({}, 'Plant General Manager');
  const live = A.interpret(t, 200, JSON.stringify({ items: [item], count: 1 }), r, { now: NOW });
  assert.equal(live.result, 'LIVE'); assert.deepEqual(live.pay, { low: 185000, high: 200000 }); assert.match(live.degree, /Technical field preferred/);
  assert.equal(A.interpret(t, 200, JSON.stringify({ items: [Object.assign({}, item, { ExternalPostedEndDate: '2026-10-01T00:00:00Z' })] }), r, { now: NOW }).liveness, 'CLOSED_EMPLOYER_ATS');
  assert.equal(A.interpret(t, 200, JSON.stringify({ items: [], count: 0 }), r, { now: NOW }).liveness, undefined);
});

test('positive-only providers never close', () => {
  const b = A.detectUrl('https://flyio.bamboohr.com/careers/63');
  assert.equal(A.interpret(b, 200, JSON.stringify({ result: [{ id: '63', jobOpeningName: 'VP Finance' }] }), row({}, 'VP Finance')).result, 'LIVE');
  assert.equal(A.interpret(b, 200, JSON.stringify({ result: [] }), row({}, 'VP Finance')).liveness, undefined);
  const s = A.detectUrl('https://jobs.smartrecruiters.com/BoschGroup/744000012345678');
  assert.equal(A.interpret(s, 404, '', row({})).liveness, undefined);
});

test('pay text: one plausible range only', () => {
  assert.deepEqual(A.payFromText('Pay: $156,352-260,586. Incentive eligible.'), { low: 156352, high: 260586 });
  assert.deepEqual(A.payFromText('$180K – $220K base'), { low: 180000, high: 220000 });
  assert.equal(A.payFromText('Analyst: $108,000 to $148,000; Associate: $140,000 to $192,000'), null, 'tiered ranges are ambiguous');
  assert.equal(A.payFromText('$20 - $25 per hour'), null);
  assert.equal(A.payFromText('$275,000.00-$330,00.00 per year'), null);
});

test('fields: liveness only when decisive, degree text only when the row lacks it, never state keys', () => {
  const t = A.detectUrl('https://job-boards.greenhouse.io/acme/jobs/1234567');
  const live = { result: 'LIVE', liveness: 'LIVE_EMPLOYER_ATS', postedAt: '2026-09-25T00:00:00Z', pay: { low: 150000, high: 190000 }, payFromText: false, degree: 'Bachelor degree or equivalent experience.' };
  const f1 = A.fieldsFor(row({}), t, live, { now: NOW });
  assert.equal(f1.LIVENESS, 'LIVE_EMPLOYER_ATS'); assert.equal(f1.LIVENESS_ASOF, '2026-10-13'); assert.equal(f1.LIVENESS_METHOD, 'ATS_API:GREENHOUSE');
  assert.equal(f1.PAY_POSTED, '$150,000 - $190,000'); assert.equal(f1.DEGREE_TEXT, 'Bachelor degree or equivalent experience.');
  const f2 = A.fieldsFor(row({ DEGREE_TEXT: 'Bachelor in engineering required (from JD)' }), t, live, { now: NOW });
  assert.equal(f2.DEGREE_TEXT, undefined); assert.equal(f2.ATS_DEGREE_TEXT, live.degree);
  const f3 = A.fieldsFor(row({ LIVENESS: 'LIVE_EMPLOYER_ATS' }), t, { result: 'ERROR_503' }, { now: NOW });
  assert.deepEqual(Object.keys(f3).sort(), ['ATS_CHECK_ASOF', 'ATS_CHECK_RESULT', 'ATS_POSTING_URL', 'ATS_PROVIDER']);
  for (const f of [f1, f2, f3]) for (const k of Object.keys(f)) assert.ok(!['BUCKET', 'DISPOSITION', 'POSTING_STATE', 'APPLICATION_STATUS'].includes(k) && !/^TIM_/.test(k), k);
  const body = A.batchBody([{ row: row({}), target: t, result: live, fields: f1 }], '20261013190000');
  assert.equal(body.action, 'batch'); assert.equal(body.requests[0].action, 'ruling');
  assert.equal(body.requests[0].ruling.kind, 'ENRICH'); assert.equal(body.requests[0].ruling.actor, 'WRITER_ATS');
  assert.equal(body.requests[0].ruling.requestId, 'ATSCHK-20261013190000-V2I-000000000001');
});

test('selection: active, detectable, due; never-checked and READY first; capped', () => {
  const gh = n => 'COMPANY_SOURCE_URL=https://job-boards.greenhouse.io/acme/jobs/100000' + n;
  const rows = [
    Object.assign(row({ COMPANY_SOURCE_URL: 'https://job-boards.greenhouse.io/acme/jobs/1000001', ATS_CHECK_ASOF: '2026-10-13T10:00:00Z', ATS_CHECK_RESULT: 'LIVE' }), { PRIMARY_ID: 'A' }),
    Object.assign(row({ COMPANY_SOURCE_URL: 'https://job-boards.greenhouse.io/acme/jobs/1000002', ATS_CHECK_ASOF: '2026-10-05T10:00:00Z', ATS_CHECK_RESULT: 'LIVE' }), { PRIMARY_ID: 'B' }),
    Object.assign(row({ COMPANY_SOURCE_URL: 'https://job-boards.greenhouse.io/acme/jobs/1000003' }, 'Director', 'READY_TO_PURSUE'), { PRIMARY_ID: 'C' }),
    Object.assign(row({ COMPANY_SOURCE_URL: 'https://job-boards.greenhouse.io/acme/jobs/1000004' }), { PRIMARY_ID: 'D' }),
    Object.assign(row({ COMPANY_SOURCE_URL: 'https://job-boards.greenhouse.io/acme/jobs/1000005' }, 'Director', 'APPLIED'), { PRIMARY_ID: 'E' }),
    Object.assign(row({ COMPANY_SOURCE_URL: 'https://job-boards.greenhouse.io/acme/jobs/1000006', ANTI_RESURRECTION: 'YES' }), { PRIMARY_ID: 'F' }),
    Object.assign(row({ SOURCE_URL: 'https://www.linkedin.com/jobs/view/9' }), { PRIMARY_ID: 'G' }),
  ];
  assert.deepEqual(A.select(rows, { now: NOW }).map(x => x.row.PRIMARY_ID), ['C', 'D', 'B']);
  assert.equal(A.select(rows, { now: NOW, limit: 1 }).length, 1);
});

test('posting-validation worklist leaves checker-owned rows to the checker, keeps residue', () => {
  const head = 'V2_CURRENT_POPULATION_MASTER\nCOUNTS: TOTAL=0\n================================================================\n';
  const line = (inv, id, payload) => `${inv} | ${id} | Co | Director of Manufacturing | SCOUT_INTAKE | OPEN | - | R1 | Austin, TX | ${payload}`;
  const text = head + [
    line(1, 'V2I-0000000000A1', 'SOURCE_URL=https://www.linkedin.com/jobs/view/1; DATE_ADDED=2026-09-12'),
    line(2, 'V2I-0000000000A2', 'SOURCE_URL=https://job-boards.greenhouse.io/acme/jobs/1234567; DATE_ADDED=2026-09-12'),
    line(3, 'V2I-0000000000A3', 'SOURCE_URL=https://job-boards.greenhouse.io/acme/jobs/7654321; ATS_CHECK_RESULT=ERROR_403; ATS_CHECK_ASOF=2026-10-13T10:00:00Z; DATE_ADDED=2026-09-11'),
    line(4, 'V2I-0000000000A4', 'SOURCE_URL=https://jobs.ashbyhq.com/acme/34413f8d-26bf-4bbc-8ade-eb309a0e2245; ATS_CHECK_RESULT=NOT_IN_PUBLIC_BOARD; DATE_ADDED=2026-09-10'),
  ].join('\n') + '\n';
  const ids = W.build(text, { now: NOW }).lanes.FORGE_POSTING_VALIDATION.map(r => r.PRIMARY_ID);
  assert.deepEqual(ids, ['V2I-0000000000A1', 'V2I-0000000000A4']);
});
