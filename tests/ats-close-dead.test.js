// cs-d6a472cd: a per-posting 404/410 from the Workday, Greenhouse or Lever API closes the row (CLOSED_DEAD, actor WRITER_ATS).
const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../apps-script/PipelineAts.gs');
const W = require('../apps-script/Code.gs');
const P = require('../pipeline-parser.js');

const NOW = '2026-11-27T23:00:00.000Z';
const URLS = {
  GREENHOUSE: 'https://job-boards.greenhouse.io/acme/jobs/1234567',
  LEVER: 'https://jobs.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd',
  WORKDAY: 'https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Austin-TX/Director-of-Operations_R12345',
  ASHBY: 'https://jobs.ashbyhq.com/acme/34413f8d-26bf-4bbc-8ade-eb309a0e2245'
};
const row = (p, bucket = 'SCOUT_INTAKE', id = 'V2I-00000000C10S') => ({ PRIMARY_ID: id, TITLE: 'Director of Operations', BUCKET: bucket, INV_NUM: 1, COMPANY: 'Acme', p: Object.assign({ DATE_ADDED: '2026-10-01' }, p) });
const line = (bucket, payload) => '7 | V2I-00000000C10S | Acme | Director of Operations | ' + bucket + ' | OPEN | - | R1 | Austin, TX | ' + payload;
const ruling = body => body.requests[0].ruling;

function checked(provider, code) {
  const t = A.detectUrl(URLS[provider]);
  const r = A.interpret(t, code, '', { TITLE: 'Director of Operations' }, { now: NOW });
  return { row: row({ COMPANY_SOURCE_URL: URLS[provider] }), target: t, result: r, fields: A.fieldsFor(row({}), t, r, { now: NOW }) };
}

test('Greenhouse, Lever and Workday per-posting 404 or 410 queue a CLOSED_DEAD ruling with the ATS fields', () => {
  for (const provider of ['GREENHOUSE', 'LEVER', 'WORKDAY']) for (const code of [404, 410]) {
    const x = checked(provider, code), ru = ruling(A.batchBody([x], '20261127230000'));
    assert.equal(ru.kind, 'CLOSED_DEAD', provider + ' ' + code);
    assert.equal(ru.actor, 'WRITER_ATS');
    assert.equal(ru.fields.LIVENESS, 'CLOSED_EMPLOYER_404');
    assert.equal(ru.fields.LIVENESS_METHOD, 'ATS_API:' + provider);
    assert.match(ru.note, new RegExp('^ATS API ' + provider + ' 404 2026-11-27 https://'));
  }
});

test('Ashby NOT_IN_PUBLIC_BOARD and NOT_FOUND_404, errors and TinyFish answers stay ENRICH', () => {
  const t = A.detectUrl(URLS.ASHBY);
  const miss = A.interpret(t, 200, JSON.stringify({ jobs: [] }), { TITLE: 'Director of Operations' }, { now: NOW });
  const nf = A.interpret(t, 404, '', { TITLE: 'Director of Operations' }, { now: NOW });
  assert.equal(miss.result, 'NOT_IN_PUBLIC_BOARD'); assert.equal(nf.result, 'NOT_FOUND_404');
  for (const r of [miss, nf]) assert.equal(ruling(A.batchBody([{ row: row({}), target: t, result: r, fields: A.fieldsFor(row({}), t, r, { now: NOW }) }], 's')).kind, 'ENRICH');
  const err = checked('GREENHOUSE', 503);
  assert.equal(ruling(A.batchBody([err], 's')).kind, 'ENRICH');
  const tf = checked('WORKDAY', 404); tf.fields.LIVENESS_METHOD = 'TINYFISH_FETCH:WORKDAY';
  assert.equal(ruling(A.batchBody([tf], 's')).kind, 'ENRICH');
  assert.equal(A.closedByApi({ LIVENESS: 'CLOSED_EMPLOYER_404', LIVENESS_METHOD: 'ATS_API:ASHBY' }), false);
});

test('active rows already carrying closed API proof are closed on the next run, protected and terminal rows are never picked', () => {
  const proof = { COMPANY_SOURCE_URL: URLS.GREENHOUSE, LIVENESS: 'CLOSED_EMPLOYER_404', LIVENESS_METHOD: 'ATS_API:GREENHOUSE', LIVENESS_ASOF: '2026-11-10', LIVENESS_EVIDENCE_URL: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/1234567', ATS_CHECK_RESULT: 'CLOSED' };
  const rows = [row(proof, 'SCOUT_INTAKE', 'A1'), row(proof, 'MANUAL_RESEARCH', 'A2'), row(proof, 'APPLIED', 'P1'), row(proof, 'REJECTED_BY_EMPLOYER', 'P2'), row(proof, 'DECLINED_BY_TIM', 'P3'), row(proof, 'CLOSED_DEAD', 'P4'),
    row(Object.assign({}, proof, { ANTI_RESURRECTION: 'YES' }), 'SCOUT_INTAKE', 'P5'),
    row(Object.assign({}, proof, { LIVENESS: 'CLOSED', LIVENESS_METHOD: 'AI_LANE' }), 'SCOUT_INTAKE', 'N1'),
    row({ COMPANY_SOURCE_URL: URLS.ASHBY, ATS_CHECK_RESULT: 'NOT_IN_PUBLIC_BOARD', LIVENESS_METHOD: 'ATS_API:ASHBY' }, 'SCOUT_INTAKE', 'N2')];
  const picked = A.select(rows, { now: NOW });
  assert.deepEqual(picked.closes.map(r => r.PRIMARY_ID), ['A1', 'A2']);
  assert.ok(!picked.some(x => ['A1', 'A2'].includes(x.row.PRIMARY_ID)), 'stored-proof rows are not refetched');
  const body = A.batchBody([], '20261127230000', picked.closes);
  assert.deepEqual(body.requests.map(q => [q.ruling.primaryId, q.ruling.kind, q.ruling.actor]), [['A1', 'CLOSED_DEAD', 'WRITER_ATS'], ['A2', 'CLOSED_DEAD', 'WRITER_ATS']]);
  assert.equal(body.requests[0].ruling.note, 'ATS API GREENHOUSE 404 2026-11-10 https://boards-api.greenhouse.io/v1/boards/acme/jobs/1234567');
});

test('Writer: WRITER_ATS CLOSED_DEAD moves an active row without stamping a Tim ruling, and refuses APPLIED and REJECTED rows', () => {
  const ru = { kind: 'CLOSED_DEAD', actor: 'WRITER_ATS', requestId: 'ATSCHK-1-V2I-00000000C10S', note: 'ATS API LEVER 404 2026-11-27 https://api.lever.co/v0/postings/acme/x', ts: NOW, fields: { LIVENESS: 'CLOSED_EMPLOYER_404', LIVENESS_METHOD: 'ATS_API:LEVER' } };
  const r = W.mutateRow(line('SCOUT_INTAKE', 'SOURCE=LinkedIn'), ru);
  assert.ok(r.ok, r.error);
  const after = P.parseRow(r.after, 1, null);
  assert.equal(after.BUCKET, 'CLOSED_DEAD'); assert.equal(after.DISPOSITION, 'RESOLVED/CLOSED_DEAD');
  assert.equal(after.payload.POSTING_STATE, ru.note); assert.equal(after.payload.LIVENESS, 'CLOSED_EMPLOYER_404');
  assert.equal(after.payload.STATE_SOURCE, 'WRITER_ATS:ATSCHK-1-V2I-00000000C10S');
  assert.equal(after.payload.TIM_RULING, undefined); assert.equal(after.payload.TIM_DISPOSITION, undefined);
  assert.match(after.TAGS, /ATS_CLOSED_2026-11-27/);
  for (const b of ['APPLIED', 'REJECTED_BY_EMPLOYER']) {
    const g = W.mutateRow(line(b, 'SOURCE=LinkedIn'), ru);
    assert.equal(g.ok, false); assert.match(g.error, /protected applicant state/);
  }
  const tim = P.parseRow(W.mutateRow(line('SCOUT_INTAKE', 'SOURCE=LinkedIn'), { kind: 'CLOSED_DEAD', note: 'gone', ts: NOW, requestId: 'PX-9' }).after, 1, null);
  assert.equal(tim.payload.TIM_RULING, 'CLOSED_DEAD'); assert.match(tim.payload.TIM_DISPOSITION, /^TIM_CLOSED_2026-11-27_EXPLORER$/);
});
