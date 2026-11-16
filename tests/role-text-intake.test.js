'use strict';
const {test} = require('node:test');
const a = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const S = require('../pipeline-scoring');

const lines = ['V2_CURRENT_POPULATION_MASTER', 'COUNTS: TOTAL=0', 'END V2_CURRENT_POPULATION_MASTER TOTAL=0'];
const rules = {status: 'ACTIVE', rules: [], activeIds: []};
const ctx = {run: {SCOUT_RUN_ID: 'TEST-ROLE-TEXT'}, now: '2026-11-16T01:00:00.000Z', nowET: '2026-11-15 20:00 ET'};
const base = {COMPANY: 'Helios Components', TITLE: 'Director', LOCATION: 'Austin, TX', SOURCE_URL: 'https://example.com/jobs/rt-1', REQ_ID: 'REQ-RT-1'};
const POSTING = 'Lead plant quality systems, lean manufacturing, six sigma and ISO 9001 audits across production lines.';

function storedPayload(plan) {
  a.equal(plan.newLines.length, 1);
  return W.parsePayload(plan.newLines[0].split(' | ').slice(9).join(' | ')).payload;
}

test('ROLE_TEXT survives sanitizeRecord', () => {
  a.equal(W.sanitizeRecord(Object.assign({ROLE_TEXT: POSTING}, base)).ROLE_TEXT, POSTING);
});

test('ROLE_TEXT is capped at 4000 characters by sanitizeRecord and intake still writes the row', () => {
  const long = 'q'.repeat(5000);
  a.equal(W.sanitizeRecord(Object.assign({ROLE_TEXT: long}, base)).ROLE_TEXT.length, 4000);
  const plan = W.planIntake(lines, [Object.assign({ROLE_TEXT: long}, base)], rules, ctx);
  a.equal(plan.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  a.equal(storedPayload(plan).ROLE_TEXT, 'q'.repeat(4000));
});

test('ROLE_TEXT set through fields is clipped at 4000 characters', () => {
  const payload = {}, order = [], set = (k, v) => { payload[k] = v; if (order.indexOf(k) < 0) order.push(k); };
  const out = W.applyFields_({ROLE_TEXT: 'r'.repeat(4500)}, payload, order, set, {});
  a.equal(out.ok, true);
  a.equal(payload.ROLE_TEXT.length, 4000);
});

test('ROLE_TEXT stays in the master row (it is not an evidence key)', () => {
  a.equal(W.isEvidenceKey_('ROLE_TEXT'), false);
  const plan = W.planIntake(lines, [Object.assign({ROLE_TEXT: POSTING}, base)], rules, ctx);
  a.equal(W.splitRowEvidence_(plan.newLines[0], 1).count, 0);
  a.equal(storedPayload(plan).ROLE_TEXT, POSTING);
});

test('the keyword scorer sees ROLE_TEXT in the stored payload', () => {
  const cfg = S.defaults();
  const row = {COMPANY: base.COMPANY, TITLE: base.TITLE, LOCATION: base.LOCATION, payload: {}};
  const without = S.scoreRow(row, cfg).parts.experience;
  const plan = W.planIntake(lines, [Object.assign({ROLE_TEXT: POSTING}, base)], rules, ctx);
  const withText = S.scoreRow(Object.assign({}, row, {payload: storedPayload(plan)}), cfg).parts.experience;
  a.equal(withText.evidenceSource, 'KEYWORD_PROXY');
  a.ok(withText.score > without.score, `expected ${withText.score} > ${without.score}`);
  a.match(withText.basis, /quality|lean|six sigma|iso/);
});
