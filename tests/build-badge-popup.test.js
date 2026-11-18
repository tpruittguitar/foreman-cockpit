const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../office/office-logic.js');

test('build PR popup renders title summary time and link', () => {
  const p = L.buildPrPopup({ pr: 12, prTitle: 'Add build badge popup', prSummary: 'Adds the popup for build badge. Reuses the existing card dialog style.', mergedAt: '2026-11-17T03:05:00Z' });
  assert.equal(p.title, 'Add build badge popup');
  assert.equal(p.summary, 'Adds the popup for build badge. Reuses the existing card dialog style.');
  assert.equal(p.when, 'Nov 16, 10:05 PM ET');
  assert.equal(p.url, 'https://github.com/tpruittguitar/foreman-cockpit/pull/12');
  assert.equal(p.desc, '');
});

test('build PR popup falls back to no description', () => {
  assert.equal(L.buildPrPopup({}).desc, 'No description for this build');
});

test('wireBuildBadge click opens popup', () => {
  const el = { onclick: null };
  let called = 0;
  L.wireBuildBadge(el, () => { called++; });
  el.onclick({ stopPropagation() {} });
  assert.equal(called, 1);
});
