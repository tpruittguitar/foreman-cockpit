'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../pipeline-decision-labels.js');
const F = require('../pipeline-pay-format.js');
const T = require('../pipeline-trust.js');

test('shared label table: Pursue · Research · Decline, plus Mark applied; drawer and phone use those words', () => {
  assert.deepEqual(L.DECISION.map(x => x.label), ['Pursue', 'Research', 'Decline']);
  assert.equal(L.MARK_APPLIED, 'Mark applied');
  assert.equal(L.toast('pursue'), 'Pursue queued');
  assert.equal(L.toast('research'), 'Research queued');
  assert.equal(L.toast('decline'), 'Decline queued');
  assert.equal(L.toast('applied'), 'Mark applied queued');
  const html = fs.readFileSync(path.join(__dirname, '../pipeline.html'), 'utf8');
  const mobile = fs.readFileSync(path.join(__dirname, '../pipeline-mobile.js'), 'utf8');
  const row = html.slice(html.indexOf('function decideRow_()'), html.indexOf('function breakdownHtml_'));
  assert.match(row, />✓ Pursue/);
  assert.match(row, />Research/);
  assert.match(row, />⊖ Decline/);
  assert.match(row, />Mark applied/);
  assert.doesNotMatch(row, />Applied</);
  assert.doesNotMatch(row, />Hold</);
  assert.doesNotMatch(row, />Later</);
  assert.match(mobile, /data-m-do="pursue"[^>]*>[^<]*Pursue/);
  assert.match(mobile, /data-m-do="research"[^>]*>Research/);
  assert.match(mobile, /data-m-do="decline"[^>]*>[^<]*Decline/);
  assert.match(mobile, /data-m-do="applied"[^>]*>Mark applied/);
  L.FORBIDDEN.forEach(w => assert.equal(row.includes('>' + w + '<'), false, 'no ' + w + ' button'));
});

test('shared pay figure keeps the trust suffix', () => {
  const est = { SALARY_BASIS: 'FORGE-ESTIMATE' };
  assert.match(F.display(est, 200000, T.salaryRange(est)), /\$200K low-confidence/);
  assert.doesNotMatch(F.display(est, 200000, T.salaryRange(est)), /\$200k est\./);
  const range = { SALARY_BASE_LOW: '108000', SALARY_BASE_HIGH: '205000', SALARY_BASIS: 'EMPLOYER_POSTED', PAY_POSTED: '$108000-$205000', SALARY_CONF: 'VERIFIED' };
  assert.match(F.display(range, 156500, T.salaryRange(range)), /\$108K–\$205K/);
});

test('write maps in pipeline.html keep main meanings: Applied=APPLIED, Pursue=APPLY_NOW YES, Research=MANUAL_RESEARCH', () => {
  const html = fs.readFileSync(path.join(__dirname, '../pipeline.html'), 'utf8');
  const mobile = fs.readFileSync(path.join(__dirname, '../pipeline-mobile.js'), 'utf8');
  const map = html.match(/K=\{pursue:\[([^\]]+)\],hold:\[([^\]]+)\],research:\[([^\]]+)\],decline:\[([^\]]+)\],applied:\[([^\]]+)\]\}/);
  assert.ok(map, 'phone decide map is still in pipeline.html');
  assert.match(map[0], /pursue:\['APPLY_NOW','YES','',''\]/);
  assert.match(map[0], /research:\['MANUAL_RESEARCH','','','Research requested by Tim · from the phone'\]/);
  assert.match(map[0], /decline:\['DECLINE','','TIM_EXPLICIT_DECLINE',''\]/);
  assert.match(map[0], /applied:\['APPLIED','','','Applied · from the phone'\]/);
  assert.match(html, /if\(state==='READY_TO_PURSUE'\)\{kind='APPLY_NOW';value='YES'\}/);
  assert.match(html, /else if\(state==='DECLINED_BY_TIM'\)\{kind='DECLINE'\}/);
  assert.doesNotMatch(mobile, /data-m-do="hold"/);
  assert.doesNotMatch(mobile, />Hold</);
  assert.doesNotMatch(mobile, /data-m-do="applied"[^>]*>Applied</);
  assert.match(mobile, /data-m-do="applied"[^>]*>Mark applied</);
  assert.doesNotMatch(mobile, />Later</);
  assert.doesNotMatch(mobile, /Act now/);
});
