const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
const nav = fs.readFileSync(path.join(__dirname, '..', 'pipeline-navigation.js'), 'utf8');

test('scoring page says the model is shared, not local to this browser', () => {
  assert.match(html, /Scoring model · shared by every viewer and agent/);
  assert.doesNotMatch(html, /ranks the current rows on this browser/);
  assert.doesNotMatch(html, /derived viewer (assessment|model)/);
  assert.match(html, /Ranking weights · shared · total must equal 100 \(FLEX included\)/);
});

test('weights grid keeps a visible FLEX row so the shown total adds up', () => {
  assert.match(html, /score-flex-mirror/);
  assert.match(html, /flex \(set in FLEX card\)/);
  assert.match(html, /mirror\.textContent=weight\.value/);
});

test('settings shell no longer labels the scoring page presentation-only', () => {
  assert.doesNotMatch(nav, /PRESENTATION ONLY/);
  assert.doesNotMatch(nav, /Scoring edits remain local/);
  assert.match(nav, /shared scoring model for every viewer and agent/);
});
