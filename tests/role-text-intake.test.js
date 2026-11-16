'use strict';
const {test} = require('node:test');
const a = require('node:assert/strict');
const W = require('../apps-script/Code.gs');
const S = require('../pipeline-scoring.js');

const lines = ['V2_CURRENT_POPULATION_MASTER', 'COUNTS: TOTAL=0', 'END V2_CURRENT_POPULATION_MASTER TOTAL=0'];
const rules = {status: 'ACTIVE', rules: [], activeIds: []};
const ctx = {run: {SCOUT_RUN_ID: 'TEST-RT'}, now: '2026-11-16T01:00:00.000Z', nowET: '2026-11-15 20:00 ET'};
const base = {COMPANY: 'Helios Components', TITLE: 'Director of Manufacturing', LOCATION: 'Austin, TX', SOURCE_URL: 'https://example.com/jobs/rt-1', REQ_ID: 'REQ-RT-1'};
const intake = extra => W.planIntake(lines, [Object.assign({}, base, extra)], rules, ctx);
const stored = (plan, key) => W.parsePayload(plan.newLines[0].split(' | ').slice(9).join(' | ')).payload[key];

test('ROLE_TEXT survives sanitizeRecord and reaches the master row', () => {
  const t = 'Lead plant launch and process engineering for a greenfield site.';
  a.equal(W.sanitizeRecord(Object.assign({}, base, {ROLE_TEXT: t})).ROLE_TEXT, t);
  const plan = intake({ROLE_TEXT: t});
  a.equal(plan.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  a.equal(stored(plan, 'ROLE_TEXT'), t);
});

test('ROLE_TEXT is capped at 4000 characters and the row is still written', () => {
  const exact = 'x'.repeat(4000);
  a.equal(W.sanitizeRecord(Object.assign({}, base, {ROLE_TEXT: exact})).ROLE_TEXT.length, 4000);
  a.equal(W.sanitizeRecord(Object.assign({}, base, {ROLE_TEXT: 'y'.repeat(9000)})).ROLE_TEXT.length, 4000);
  const plan = intake({ROLE_TEXT: 'z'.repeat(9000)});
  a.equal(plan.results[0].result, 'SCOUT_INTAKE_WRITTEN');
  a.equal(stored(plan, 'ROLE_TEXT').length, 4000);
});

test('ROLE_TEXT stays in the master and is not an evidence key', () => {
  a.equal(W.isEvidenceKey_('ROLE_TEXT'), false);
});

test('keywordScore sees ROLE_TEXT: posting text lifts the score of a title-only row', () => {
  const cfg = S.defaults();
  const bare = {COMPANY: 'Helios', TITLE: 'Director', LOCATION: 'Austin, TX', payload: {}};
  const withText = Object.assign({}, bare, {payload: {ROLE_TEXT: 'manufacturing quality operations production plant launch startup greenfield'}});
  const before = S.scoreRow(bare, cfg).parts.ats.score, after = S.scoreRow(withText, cfg).parts.ats.score;
  a.ok(after > before, 'ats ' + before + ' -> ' + after);
});
