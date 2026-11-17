// Office revision badge: pure formatter + PR-number parsing. Run: node --test tests/office-build-badge.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../office/office-logic.js');
const { prFromSubject } = require('../scripts/write-build-info.cjs');

test('badge renders PR, short SHA and ET build time', () => {
  const info = { commit: 'c1c7628aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', commitShort: 'c1c7628', pr: 321, builtAt: '2026-11-17T03:05:00Z' };
  assert.equal(L.buildBadge(info), 'PR #321 · c1c7628 · Nov 16, 10:05 PM ET');
});
test('badge derives short SHA from commit and shows — without a PR', () => {
  assert.equal(L.buildBadge({ commit: 'abcdef1234567', pr: null, builtAt: '2026-07-04T16:00:00Z' }), 'PR — · abcdef1 · Jul 4, 12:00 PM ET');
});
test('badge falls back to "build unknown" when build-info is missing or empty', () => {
  for (const v of [null, undefined, 'x', {}, { commit: '', builtAt: '' }]) assert.equal(L.buildBadge(v), 'build unknown');
});
test('PR number parsed from commit subject', () => {
  assert.equal(prFromSubject('Office: stuff (#321)'), 321);
  assert.equal(prFromSubject('#321 Office: stuff'), 321);
  assert.equal(prFromSubject('#321 Office: stuff (#320)'), 320);
  assert.equal(prFromSubject('Fix issue #12 in parser'), null);
  assert.equal(prFromSubject(''), null);
});

test('wall plate shows PR, ET release time, short SHA and version details', () => {
  const info = { commit: 'c1c7628aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', commitShort: 'c1c7628', pr: 321, builtAt: '2026-11-17T03:05:00Z', release: 'main', branch: 'main', deployId: 'abcdef123456', app: 'Pipeline Explorer' };
  assert.deepEqual(L.buildPlate(info), { title: 'PR #321', when: 'Nov 16, 10:05 PM ET', sha: 'c1c7628', detail: 'main · deploy abcdef12 · Pipeline Explorer' });
});
test('wall plate matches the corner badge data and falls back when unknown', () => {
  const info = { commit: 'abcdef1234567', builtAt: '2026-07-04T16:00:00Z' };
  const p = L.buildPlate(info);
  assert.equal(L.buildBadge(info), p.title + ' · ' + p.sha + ' · ' + p.when);
  assert.equal(L.buildPlate(null).title, 'BUILD UNKNOWN');
});
