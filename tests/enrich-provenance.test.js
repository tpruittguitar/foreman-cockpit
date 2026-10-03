// ENRICH provenance: data-only enrichment must not rewrite a row's state provenance; state-changing writes still stamp it.
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../apps-script/Code.gs');

const TS = '2026-10-03T10:00:00.000Z';
// Shaped like row 293: latest state decision is Tim's.
const timRow = '293 | V2F-BBD6E922F6C8 | Ladders | Head of Product Quality | MANUAL_RESEARCH | RESOLVED/NEEDS_RESOLUTION | TIM_RESEARCH_2026-10-03 | LI-4467365988 | Remote, US | RESEARCH_OK; NOTIFICATION_SOURCE=LinkedIn; DATE_ADDED=PRE-EXISTING / EXACT DATE NOT ESTABLISHED; TIM_RULING=MANUAL_RESEARCH; RESEARCH_REQUEST=Not currently accepting applications [Tim 2026-10-03]; STATE_SOURCE=TIM:PX-20261003015939-22F6C8; STATE_UPDATED_AT=2026-10-03T01:59:39.220Z';
// Shaped like row 18: legacy Tim disposition with no state provenance fields at all.
const bareRow = '18 | V2F-DB36EDB4478C | 3D Systems Corporation | Vice President, Quality | CLOSED_DEAD | RESOLVED/TIM_DISPOSITION | TIM_PASS_2026-09-28_DOMAIN_FIT | LI 4469926579 | Littleton, CO | DO_NOT_REWORK (TIM PASS/CLOSED); FLEX=NO; TIM_DISPOSITION=TIM_PASS_2026-09-28_DOMAIN_FIT; ANTI_RESURRECTION=YES; NOTIFICATION_SOURCE=LinkedIn';

const payload = line => W.parsePayload(line.split(' | ').slice(9).join(' | ')).payload;
const enrich = (line, fields, extra) => W.mutateRow(line, Object.assign({ kind: 'ENRICH', ts: TS, actor: 'grok', requestId: 'GROK-E-1', fields }, extra || {}));

test('1. ENRICH preserves an existing Tim STATE_SOURCE', () => {
  const r = enrich(timRow, { GROK_SALARY: 'POSTED $175,000-$265,000' });
  assert.equal(r.ok, true, r.error);
  assert.equal(payload(r.after).STATE_SOURCE, 'TIM:PX-20261003015939-22F6C8');
});

test('2. ENRICH preserves an existing STATE_UPDATED_AT', () => {
  const r = enrich(timRow, { GROK_SALARY: 'POSTED $175,000-$265,000' });
  assert.equal(payload(r.after).STATE_UPDATED_AT, '2026-10-03T01:59:39.220Z');
});

test('3. ENRICH does not create state fields when they were absent', () => {
  const r = enrich(bareRow, { CLAUDE_QUEUE_VERIFY: 'check' });
  assert.equal(r.ok, true, r.error);
  const p = payload(r.after);
  assert.equal('STATE_SOURCE' in p, false);
  assert.equal('STATE_UPDATED_AT' in p, false);
  assert.doesNotMatch(r.after, /STATE_SOURCE=|STATE_UPDATED_AT=/);
});

test('4. ENRICH writes ENRICH_SOURCE and ENRICH_UPDATED_AT, and updates them on the next enrichment', () => {
  const r = enrich(timRow, { GROK_SALARY: 'POSTED $175,000-$265,000' });
  let p = payload(r.after);
  assert.equal(p.ENRICH_SOURCE, 'GROK:GROK-E-1');
  assert.equal(p.ENRICH_UPDATED_AT, TS);
  const r2 = W.mutateRow(r.after, { kind: 'ENRICH', ts: '2026-10-03T11:00:00.000Z', actor: 'claude', requestId: 'FOREMAN-2', fields: { CLAUDE_FIT: 'HIGH' } });
  p = payload(r2.after);
  assert.equal(p.ENRICH_SOURCE, 'CLAUDE:FOREMAN-2');
  assert.equal(p.ENRICH_UPDATED_AT, '2026-10-03T11:00:00.000Z');
  assert.equal((r2.after.match(/ENRICH_SOURCE=/g) || []).length, 1, 'updated in place, not appended');
  assert.equal(p.STATE_SOURCE, 'TIM:PX-20261003015939-22F6C8');
});

test('5. state-changing writes still stamp STATE_SOURCE and STATE_UPDATED_AT normally', () => {
  const d = W.mutateRow(timRow, { kind: 'DECLINE', code: 'PAY_BELOW_FLOOR', note: 'below floor', ts: TS, actor: 'forge', requestId: 'F-1' });
  assert.equal(d.ok, true, d.error);
  assert.equal(payload(d.after).STATE_SOURCE, 'FORGE:F-1');
  assert.equal(payload(d.after).STATE_UPDATED_AT, TS);
  assert.equal('ENRICH_SOURCE' in payload(d.after), false);
  const a = W.mutateRow(bareRow, { kind: 'APPLIED', ts: TS, eventDate: '2026-10-02', evidence: 'Gmail 1ab confirmation', requestId: 'PX-2' });
  assert.equal(payload(a.after).STATE_SOURCE, 'TIM_EXPLORER:PX-2');
  assert.equal(payload(a.after).STATE_UPDATED_AT, TS);
  // Application upsert into an existing row goes through the same stamping.
  const lines = ['COUNTS: TOTAL=1', timRow];
  const u = W.planUpsertApplication(lines, { TARGET_PRIMARY_ID: 'V2F-BBD6E922F6C8', STATE: 'APPLIED', EVENT_DATE: '2026-10-02', EVIDENCE: 'Gmail 1cd "Thanks for applying"', actor: 'FORGE', requestId: 'U-1' }, { now: TS });
  assert.equal(u.ok, true, u.error);
  assert.equal(payload(u.after).STATE_SOURCE, 'FORGE:U-1');
});

test('ENRICH still recalculates FLEX_CLASS and FLEX_MODIFIER when FLEX changes', () => {
  const r = enrich(timRow, { FLEX: 'YES', FLEX_CONF: 'HIGH' });
  assert.equal(r.ok, true, r.error);
  assert.equal(payload(r.after).FLEX_CLASS, 'HIGH_FLEX');
  assert.equal(payload(r.after).FLEX_MODIFIER, '15');
  const r2 = W.mutateRow(r.after, { kind: 'ENRICH', ts: TS, actor: 'tim', requestId: 'PX-ENRICH-1', fields: { FLEX: 'NO' } });
  assert.equal(payload(r2.after).FLEX_CLASS, 'NO_FLEX');
  assert.equal(payload(r2.after).FLEX_MODIFIER, '-10');
});

test('ENRICH refuses bucket, disposition, application-state and Tim ruling fields (whole request, nothing written)', () => {
  for (const k of ['BUCKET', 'DISPOSITION', 'STATE_SOURCE', 'STATE_UPDATED_AT', 'ENRICH_SOURCE', 'ENRICH_UPDATED_AT',
    'TIM_RULING', 'TIM_DISPOSITION', 'TIM_NOTE', 'TIM_FLEX_OVERRIDE', 'tim_ruling', 'DECLINE_REASON_CODE', 'REOPEN_TRIGGER', 'DUP_OF', 'RESEARCH_REQUEST',
    'APP_DATE', 'APP_STATUS_EVIDENCE', 'APPLICATION_STATUS', 'REJECTION_DATE', 'ANTI_RESURRECTION', 'UPSERT_KEY']) {
    const r = enrich(timRow, { GROK_NOTE: 'x', [k]: 'y' });
    assert.equal(r.ok, false, k + ' must be refused');
    assert.equal(r.after, undefined);
  }
  const ok = enrich(timRow, { GROK_NOTE: 'x' });
  assert.equal(ok.after.split(' | ')[4], 'MANUAL_RESEARCH');
  assert.equal(ok.after.split(' | ')[5], 'RESOLVED/NEEDS_RESOLUTION');
});

test('Explorer enrichment fields are still accepted', () => {
  const r = enrich(bareRow, { INITIATING_URL: 'https://example.test/job/1', SOURCE_URL: 'https://example.test/job/1', SOURCE_URL_CONF: 'VERIFIED', SALARY_BASE_POSTED: '$200k', SALARY_BASIS: 'EMPLOYER_POSTED', SALARY_CONF: 'VERIFIED', SALARY_ASOF: '2026-10-03', PAY_POSTED: '$200k', FLEX: 'SOFT', FLEX_CONF: 'HIGH', FLEX_BASIS: 'or equivalent experience', DEGREE_TEXT: 'or equivalent experience', REMOTE_HYBRID: 'REMOTE', ENRICH_NOTE: 'n' }, { actor: 'TIM', requestId: 'PX-ENRICH-2' });
  assert.equal(r.ok, true, r.error);
  assert.equal(payload(r.after).ENRICH_SOURCE, 'TIM:PX-ENRICH-2');
});
