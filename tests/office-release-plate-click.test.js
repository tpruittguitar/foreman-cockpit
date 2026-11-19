// Release plate under FORGE opens the Build details popup; the mobile start page "Walk in 3D" button shows the latest PR.
// Run: node --test tests/office-release-plate-click.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const office = fs.readFileSync(path.join(__dirname, '..', 'office', 'office.js'), 'utf8');

test('release plate mesh is tagged with the release pick id', () => {
  assert.equal(L.RELEASE_PLATE_BOARD, 'release');
  assert.match(office, /releasePlate = add\(new THREE\.PlaneGeometry\(2\.7, 0\.76\)/);
  assert.match(office, /releasePlate\.userData\.board = L\.RELEASE_PLATE_BOARD/);
});
test('release plate is in the existing pickables list (no second raycaster)', () => {
  assert.match(office, /const pickables = \(\) => \{[^\n]*if \(releasePlate\) a\.push\(releasePlate\)/);
  assert.equal((office.match(/new THREE\.Raycaster\(/g) || []).length, 1);
});
test('activating the release pick opens openBuildPopup; the corner badge still does too', () => {
  const act = office.slice(office.indexOf('function activate(p)'), office.indexOf('function setBrowse('));
  assert.match(act, /p\.board === L\.RELEASE_PLATE_BOARD\) openBuildPopup\(\)/);
  assert.match(office, /L\.wireBuildBadge\(el, openBuildPopup\)/);
});
test('pickRay maps a userData.board hit to { board } so the hover cursor turns to pointer', () => {
  assert.match(office, /if \(o\.userData\.board !== 'project'\) return \{ board: o\.userData\.board \}/);
  const hover = office.slice(office.indexOf('function setHover(p)'), office.indexOf('const canvas = renderer.domElement'));
  const cur = hover.indexOf("style.cursor = p ? 'pointer' : 'grab'"), early = hover.indexOf('if (nb === hoverBot && ni === hoverItem) return');
  assert.ok(cur > 0 && cur < early, 'pointer cursor is set before the bot/item early return so board hits get it');
});

const info = { pr: 480, prTitle: 'Office: release plate opens the latest PR popup', mergedAt: '2026-11-19T01:42:00Z', commitShort: 'abc1234', builtAt: '2026-11-19T01:45:00Z' };
test('start-page button line has PR number, short description and ET time', () => {
  const s = L.buildLaunchLine(info);
  assert.equal(s.pr, '#480');
  assert.equal(s.desc, 'Office: release plate opens the latest PR popup');
  assert.equal(s.when, 'Nov 18, 8:45 PM ET');
  assert.equal(s.text, '#480 Office: release plate opens the latest PR popup · Nov 18, 8:45 PM ET');
});
test('start-page button line truncates long titles and shows no summary text', () => {
  assert.ok(L.buildLaunchLine({ pr: 1, prTitle: 'x'.repeat(80) }, 20).desc.endsWith('…'));
  assert.equal(L.buildLaunchLine({ pr: 1, prTitle: 'x'.repeat(80) }, 20).desc.length, 20);
  const s = L.buildLaunchLine({ pr: 7, prSummary: 'First sentence. Second.', commitShort: 'abc1234', builtAt: '2026-07-04T16:00:00Z' });
  assert.equal(s.text, '#7 · Jul 4, 12:00 PM ET');
});
test('start-page button line is null when build-info is missing or empty', () => {
  for (const v of [null, undefined, 'x', {}, { commit: 'local', commitShort: 'local', builtAt: '' }]) assert.equal(L.buildLaunchLine(v), null);
});
test('office.js renders the start-page button from build-info and keeps the plain label as fallback', () => {
  assert.match(office, /function renderWalk3dBuild\(\)[\s\S]*L\.buildLaunchLine\(buildInfo\)/);
  assert.match(office, /'<span class="walk3d-main">Walk in 3D<\/span>'/);
  const fetchBlock = office.slice(office.indexOf("fetch('build-info.json'"), office.indexOf('const gate = L.createGate()'));
  assert.match(fetchBlock, /renderWalk3dBuild\(\)/);
});
