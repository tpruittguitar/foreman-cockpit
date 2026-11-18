'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const L = require('../pipeline-decision-labels.js');
const A = require('../pipeline-act-now.js');

const row = (id, o) => Object.assign({ id, PRIMARY_ID: id, COMPANY: 'Acme', TITLE: 'Director of Quality', LOCATION: 'Austin, TX', BUCKET: 'READY_TO_PURSUE', payload: { SALARY_BASIS: 'FORGE-ESTIMATE' }, compMid: 200000, dateAdded: new Date('2026-10-20T12:00:00Z') }, o || {});
const ctx = (scores, rulings, extra) => Object.assign({ now: Date.parse('2026-10-20T12:00:00Z'), ruling: r => (rulings || {})[r.id] || null, score: r => scores[r.id] == null ? null : scores[r.id], fitMeasured: r => scores[r.id] != null, snoozes: {}, posting: () => 'https://x.example/e' }, extra || {});

test('shared label table: Pursue · Research · Decline, plus Mark applied and desktop snooze; no Applied/Hold/Later', () => {
  assert.deepEqual(L.DECISION.map(x => x.label), ['Pursue', 'Research', 'Decline']);
  assert.equal(L.MARK_APPLIED, 'Mark applied');
  assert.equal(L.SNOOZE, 'Snooze 3 days (this device)');
  assert.equal(L.toast('pursue'), 'Pursue queued');
  assert.equal(L.toast('research'), 'Research queued');
  assert.equal(L.toast('decline'), 'Decline queued');
  assert.equal(L.toast('applied'), 'Mark applied queued');
  const h = A.html(A.pick([row('E')], ctx({ E: 60 })), { posting: () => 'https://x.example/e' });
  assert.match(h, />Pursue</);
  assert.match(h, />Research</);
  assert.match(h, />Decline</);
  assert.match(h, />Mark applied</);
  assert.match(h, /Snooze 3 days \(this device\)/);
  assert.match(h, /data-an-applied="E"/);
  assert.match(h, /data-an-later="E"/);
  assert.match(h, /data-an-pursue="E"/);
  assert.match(h, /data-an-research="E"/);
  assert.doesNotMatch(h, />Applied</);
  assert.doesNotMatch(h, />Hold</);
  assert.doesNotMatch(h, />Later</);
  L.FORBIDDEN.forEach(w => assert.equal(h.includes('>' + w + '<'), false, 'no ' + w + ' button'));
});

test('Act Now pay uses the shared figure and trust suffix', () => {
  const h = A.html(A.pick([row('E')], ctx({ E: 60 })), { posting: () => 'https://x.example/e' });
  assert.match(h, /\$200K low-confidence/);
  assert.doesNotMatch(h, /\$200k est\./);
  const range = row('R', { payload: { SALARY_BASE_LOW: '108000', SALARY_BASE_HIGH: '205000', SALARY_BASIS: 'EMPLOYER_POSTED', PAY_POSTED: '$108000-$205000', SALARY_CONF: 'VERIFIED' }, compMid: 156500 });
  const h2 = A.html(A.pick([range], ctx({ R: 60 })), { posting: () => 'https://x.example/r' });
  assert.match(h2, /\$108K–\$205K/);
});

test('write maps in pipeline.html keep main meanings: Applied=APPLIED, Pursue=APPLY_NOW YES, Research=MANUAL_RESEARCH, Later=device snooze', () => {
  const html = fs.readFileSync(path.join(__dirname, '../pipeline.html'), 'utf8');
  const mobile = fs.readFileSync(path.join(__dirname, '../pipeline-mobile.js'), 'utf8');
  const map = html.match(/K=\{pursue:\[([^\]]+)\],hold:\[([^\]]+)\],research:\[([^\]]+)\],decline:\[([^\]]+)\],applied:\[([^\]]+)\]\}/);
  assert.ok(map, 'phone decide map is still in pipeline.html');
  assert.match(map[0], /pursue:\['APPLY_NOW','YES','',''\]/);
  assert.match(map[0], /research:\['MANUAL_RESEARCH','','','Research requested by Tim · from the phone'\]/);
  assert.match(map[0], /decline:\['DECLINE','','TIM_EXPLICIT_DECLINE',''\]/);
  assert.match(map[0], /applied:\['APPLIED','','','Applied · from the phone'\]/);
  assert.match(html, /actDecide_\(b\.getAttribute\('data-an-applied'\),'APPLIED'\)/);
  assert.match(html, /actDecide_\(b\.getAttribute\('data-an-pursue'\),'APPLY_NOW'\)/);
  assert.match(html, /actDecide_\(b\.getAttribute\('data-an-research'\),'MANUAL_RESEARCH'\)/);
  assert.match(html, /S\.anSnooze\[b\.getAttribute\('data-an-later'\)\]=Date\.now\(\)/);
  assert.match(html, /value:kind==='APPLY_NOW'\?'YES':''/);
  assert.doesNotMatch(mobile, /data-m-do="hold"/);
  assert.doesNotMatch(mobile, />Hold</);
  assert.doesNotMatch(mobile, /data-m-do="applied"[^>]*>Applied</);
  assert.match(mobile, /data-m-do="applied"[^>]*>Mark applied</);
  assert.doesNotMatch(mobile, />Later</);
});
