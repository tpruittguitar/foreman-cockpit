'use strict';
const {test} = require('node:test');
const a = require('node:assert/strict');
const W = require('../apps-script/Code.gs');

const lines = ['V2_CURRENT_POPULATION_MASTER', 'COUNTS: TOTAL=0', 'END V2_CURRENT_POPULATION_MASTER TOTAL=0'];
const rules = {status: 'ACTIVE', rules: [], activeIds: []};
const ctx = {run: {SCOUT_RUN_ID: 'TEST-EPB'}, now: '2026-11-14T01:00:00.000Z', nowET: '2026-11-13 20:00 ET'};
const SHORT = 'Aerospace engine components manufacturer';
const ROW = '1 | V2I-EPB | Helios Components | Director of Manufacturing | SCOUT_INTAKE | OPEN | - | REQ-EPB-1 | Austin, TX | SOURCE_URL=https://example.com/jobs/epb-1';

function intake(business, extra) {
  const rec = {COMPANY: 'Helios Components', TITLE: 'Director of Manufacturing', LOCATION: 'Austin, TX', SOURCE_URL: 'https://example.com/jobs/epb-' + (extra && extra.REQ_ID || '1'), REQ_ID: (extra && extra.REQ_ID) || 'REQ-EPB-1'};
  if (business !== undefined) rec.EMPLOYER_PRIMARY_BUSINESS = business;
  return W.planIntake(lines, [Object.assign(rec, extra || {})], rules, ctx);
}
function stored(plan, key) {
  a.equal(plan.newLines.length, 1);
  return W.parsePayload(plan.newLines[0].split(' | ').slice(9).join(' | ')).payload[key];
}
function apply(fields) {
  const payload = {}, order = [], set = (k, v) => { payload[k] = v; if (order.indexOf(k) < 0) order.push(k); };
  return {result: W.applyFields_(fields, payload, order, set, {}), payload};
}

test('80 characters pass intake and are stored in full', () => {
  const value = 'a'.repeat(80);
  const plan = intake(value);
  a.equal(plan.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  a.equal(stored(plan, 'EMPLOYER_PRIMARY_BUSINESS'), value);
});

test('81 characters are refused on intake with EMPLOYER_PRIMARY_BUSINESS_TOO_LONG', () => {
  const plan = intake('b'.repeat(81));
  a.equal(plan.results[0].result, 'WRITE_FAILED');
  a.equal(plan.results[0].detail, 'EMPLOYER_PRIMARY_BUSINESS_TOO_LONG');
  a.equal(plan.summary.WRITE_FAILED, 1);
  a.equal(plan.summary.ENTERED_MASTER, 0);
  a.equal(plan.newLines.length, 0);
});

test('empty and whitespace-only values pass intake', () => {
  for (const value of ['', ' '.repeat(81)]) {
    const plan = intake(value);
    a.equal(plan.results[0].result, 'SCOUT_INTAKE_WRITTEN', JSON.stringify(value));
    a.equal(stored(plan, 'EMPLOYER_PRIMARY_BUSINESS'), undefined);
  }
  const omitted = intake(undefined);
  a.equal(omitted.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  a.equal(stored(omitted, 'EMPLOYER_PRIMARY_BUSINESS'), undefined);
});

test('a normal short business description passes intake', () => {
  const plan = intake(SHORT);
  a.equal(plan.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  a.equal(stored(plan, 'EMPLOYER_PRIMARY_BUSINESS'), SHORT);
});

test('intake length is the length after clean_', () => {
  const atLimit = 'c'.repeat(40) + '\r\n' + 'c'.repeat(39);
  a.equal(atLimit.length, 81);
  const pass = intake(atLimit);
  a.equal(pass.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  a.equal(stored(pass, 'EMPLOYER_PRIMARY_BUSINESS'), 'c'.repeat(40) + ' ' + 'c'.repeat(39));
  const stillOver = '\n' + 'd'.repeat(81);
  const fail = intake(stillOver);
  a.equal(fail.results[0].result, 'WRITE_FAILED');
  a.equal(fail.results[0].detail, 'EMPLOYER_PRIMARY_BUSINESS_TOO_LONG');
  a.equal(fail.newLines.length, 0);
});

test('applyFields_ passes 80, refuses 81, and passes empty and short values', () => {
  const ok80 = apply({EMPLOYER_PRIMARY_BUSINESS: 'a'.repeat(80)});
  a.equal(ok80.result.ok, true);
  a.equal(ok80.payload.EMPLOYER_PRIMARY_BUSINESS, 'a'.repeat(80));
  const trimmed = apply({EMPLOYER_PRIMARY_BUSINESS: '  ' + 'a'.repeat(80) + ' \r\n'});
  a.equal(trimmed.result.ok, true);
  a.equal(trimmed.payload.EMPLOYER_PRIMARY_BUSINESS, 'a'.repeat(80));
  const no = apply({EMPLOYER_PRIMARY_BUSINESS: 'b'.repeat(81)});
  a.equal(no.result.ok, false);
  a.equal(no.result.result, 'WRITE_FAILED');
  a.equal(no.result.detail, 'EMPLOYER_PRIMARY_BUSINESS_TOO_LONG');
  a.equal(no.result.error, 'EMPLOYER_PRIMARY_BUSINESS_TOO_LONG');
  a.equal(no.payload.EMPLOYER_PRIMARY_BUSINESS, undefined);
  const blank = apply({EMPLOYER_PRIMARY_BUSINESS: ''});
  a.equal(blank.result.ok, true);
  a.equal(blank.payload.EMPLOYER_PRIMARY_BUSINESS, undefined);
  const spaces = apply({EMPLOYER_PRIMARY_BUSINESS: ' '.repeat(81)});
  a.equal(spaces.result.ok, true);
  a.equal(spaces.payload.EMPLOYER_PRIMARY_BUSINESS, undefined);
  const short = apply({EMPLOYER_PRIMARY_BUSINESS: SHORT});
  a.equal(short.result.ok, true);
  a.equal(short.payload.EMPLOYER_PRIMARY_BUSINESS, SHORT);
  const kept = W.mutateRow(ROW, {kind: 'ENRICH', fields: {EMPLOYER_PRIMARY_BUSINESS: 'a'.repeat(80)}, ts: '2026-11-14T01:00:00.000Z'});
  a.equal(kept.ok, true);
  a.equal(W.parsePayload(kept.after.split(' | ').slice(9).join(' | ')).payload.EMPLOYER_PRIMARY_BUSINESS, 'a'.repeat(80));
  const ruled = W.mutateRow(ROW, {kind: 'ENRICH', fields: {EMPLOYER_PRIMARY_BUSINESS: 'b'.repeat(81)}, ts: '2026-11-14T01:00:00.000Z'});
  a.equal(ruled.ok, false);
  a.equal(ruled.result, 'WRITE_FAILED');
  a.equal(ruled.detail, 'EMPLOYER_PRIMARY_BUSINESS_TOO_LONG');
  a.equal(ruled.after, undefined);
});

test('DEGREE_TEXT refusal is unchanged', () => {
  const exact = 'e'.repeat(12000), over = 'e'.repeat(12001), padded = ' ' + exact;
  const planOk = intake(undefined, {DEGREE_TEXT: exact, COMPANY: 'Degree Ok Co', REQ_ID: 'REQ-DEG-OK'});
  a.equal(planOk.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  a.equal(stored(planOk, 'DEGREE_TEXT'), exact);
  const planNo = intake(undefined, {DEGREE_TEXT: over, COMPANY: 'Degree Over Co', REQ_ID: 'REQ-DEG-OVER'});
  a.equal(planNo.results[0].result, 'WRITE_FAILED');
  a.equal(planNo.results[0].detail, 'DEGREE_TEXT_TOO_LONG');
  a.equal(planNo.newLines.length, 0);
  const planPad = intake(undefined, {DEGREE_TEXT: padded, COMPANY: 'Degree Pad Co', REQ_ID: 'REQ-DEG-PAD'});
  a.equal(planPad.results[0].result, 'WRITE_FAILED');
  a.equal(planPad.results[0].detail, 'DEGREE_TEXT_TOO_LONG');
  const appliedOk = apply({DEGREE_TEXT: exact});
  a.equal(appliedOk.result.ok, true);
  a.equal(appliedOk.result.detail, undefined);
  a.equal(appliedOk.payload.DEGREE_TEXT, exact);
  const appliedNo = apply({DEGREE_TEXT: over});
  a.deepEqual(appliedNo.result, {ok: false, error: 'DEGREE_TEXT_TOO_LONG: send the complete requirements block within 12000 characters'});
  const appliedPad = apply({DEGREE_TEXT: padded});
  a.equal(appliedPad.result.ok, true);
  a.equal(appliedPad.payload.DEGREE_TEXT, exact);
  const ruled = W.mutateRow(ROW, {kind: 'ENRICH', fields: {DEGREE_TEXT: over}, ts: '2026-11-14T01:00:00.000Z'});
  a.deepEqual(ruled, {ok: false, error: 'DEGREE_TEXT_TOO_LONG: send the complete requirements block within 12000 characters'});
});

test('other fields keep their silent caps and a long business value is not clipped', () => {
  const notes = 'n'.repeat(500);
  const plan = intake(SHORT, {SCOUT_NOTES: notes, REQ_ID: 'REQ-NOTES'});
  a.equal(plan.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  a.equal(stored(plan, 'SCOUT_NOTES').length, 400);
  a.equal(stored(plan, 'EMPLOYER_PRIMARY_BUSINESS'), SHORT);
  const longNotes = apply({SCOUT_NOTES: 'n'.repeat(1600)});
  a.equal(longNotes.result.ok, true);
  a.equal(longNotes.payload.SCOUT_NOTES.length, 1500);
  const raw = 'p'.repeat(81);
  const out = W.sanitizeRecord({COMPANY: 'Acme', TITLE: 'T'.repeat(500), EMPLOYER_PRIMARY_BUSINESS: raw, SCOUT_NOTES: 's'.repeat(450), DEGREE_TEXT: 'd'.repeat(13000)});
  a.equal(out.EMPLOYER_PRIMARY_BUSINESS, raw);
  a.equal(out.TITLE.length, 400);
  a.equal(out.SCOUT_NOTES.length, 400);
  a.equal(out.DEGREE_TEXT.length, 12000);
  const formerlyClipped = intake('q'.repeat(400), {REQ_ID: 'REQ-CLIP'});
  a.equal(formerlyClipped.results[0].result, 'WRITE_FAILED');
  a.equal(formerlyClipped.results[0].detail, 'EMPLOYER_PRIMARY_BUSINESS_TOO_LONG');
  a.equal(formerlyClipped.newLines.length, 0);
});
