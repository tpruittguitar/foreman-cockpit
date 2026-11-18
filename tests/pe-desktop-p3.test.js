'use strict';
// Card P3 (Pipeline Explorer desktop): header fits at 1440 with one refresh control; the map and the Jobs tab follow the search.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('pipeline.html'), css = read('pipeline-ui-desktop.css');

function el() {
  const e = { dataset: {}, style: {}, children: [], hidden: false, innerHTML: '', textContent: '', id: '',
    classList: { toggle() {}, contains: () => false, add() {}, remove() {} },
    querySelector: () => el(), querySelectorAll: () => [], replaceChildren() {}, appendChild() {}, insertBefore() {}, setAttribute() {}, getAttribute: () => null,
    addEventListener() {}, getBoundingClientRect: () => ({ left: 0, right: 0, width: 0 }) };
  e.parentNode = e; return e;
}
function loadNav(searchValue) {
  const search = Object.assign(el(), { value: searchValue });
  const document = { readyState: 'complete', head: el(), body: Object.assign(el(), { classList: { contains: () => false, toggle() {} } }),
    querySelector: s => (/rail|sheet/.test(s) ? el() : null), querySelectorAll: () => [], createElement: () => el(), addEventListener() {},
    getElementById: id => (id === 'search' ? search : id === 'bottombar' || id === 'filters' ? el() : null) };
  const window = {}; const ctx = { window, document, location: { hash: '' }, setTimeout: () => 0, setInterval: () => 0, addEventListener() {}, MutationObserver: function () { this.observe = () => {}; }, matchMedia: () => ({ matches: false, addEventListener() {} }), requestAnimationFrame: () => 0, console, localStorage: { getItem: () => null, setItem() {} } };
  window.addEventListener = () => {};
  vm.runInNewContext(read('pipeline-navigation.js'), ctx);
  return window.PipelineSectionNav;
}
const item = (nav, label) => nav.groups[0].items.find(x => x[0] === label);

test('a search makes Jobs the current Pipeline tab, whatever the preset', () => {
  const nav = loadNav('quality');
  for (const preset of ['', 'OPEN', 'NEEDS_TIM', 'SCOUT_INTAKE']) {
    const st = { tab: 'pipeline', preset, map: false, search: 'quality' };
    assert.equal(nav.groupFor(st), 'pipeline');
    assert.equal(nav.matches(item(nav, 'Jobs'), st), true, preset);
    for (const other of ['Act now', 'Review queue', 'Decline candidates', 'My rulings', 'Map', 'Compare']) assert.equal(nav.matches(item(nav, other), st), false, other + ' ' + preset);
  }
});

test('with no search the tab rules are unchanged', () => {
  const nav = loadNav('');
  assert.equal(nav.matches(item(nav, 'Review queue'), { tab: 'pipeline', preset: 'NEEDS_TIM', map: false, search: '' }), true);
  assert.equal(nav.matches(item(nav, 'Jobs'), { tab: 'pipeline', preset: 'NEEDS_TIM', map: false, search: '' }), false);
  assert.equal(nav.matches(item(nav, 'Act now'), { tab: 'act-now', preset: '', map: false, search: '' }), true);
});

test('search input re-marks the current tab', () => {
  assert.match(html, /\$\('search'\)\.oninput=function\(\)\{S\.search=this\.value;if\(S\.tab!=='pipeline'\)switchTab\('pipeline'\);render\(\);if\(window\.PipelineSectionNav\)PipelineSectionNav\.update\(\)\};/);
});

test('map follows the search: a hidden open job yields to the filtered view, and an empty map still updates its count', () => {
  const start = html.indexOf('function mapAutoMode_(){'), end = html.indexOf('\nfunction renderJobMap(){');
  const src = html.slice(start, end);
  const run = (S, filtered) => { const ctx = { S, mapView: {}, mapDesktop_: () => true, checkedRows_: () => [], filteredRows: () => filtered, mapSnapshot_: () => ({}) }; vm.runInNewContext(src + ';mapAutoMode_()', ctx); return S; };
  assert.equal(run({ focus: 'J1', search: 'zzzqqq', mapMode: 'selected' }, []).mapMode, 'visible');
  assert.equal(run({ focus: 'J1', search: 'acme', mapMode: 'selected' }, [{ id: 'J1' }]).mapMode, 'selected');
  const back = run({ focus: 'J1', search: '', mapMode: 'visible', mapAutoFiltered: true }, [{ id: 'J1' }]);
  assert.equal(back.mapMode, 'selected');
  assert.match(html, /stat\.textContent='NO LOCATION';try\{renderMapHud_\(\)\}catch\(e\)\{\}return\}/);
});

test('desktop header: one refresh control (countdown chip) and shrinkable middle items', () => {
  assert.match(css, /header #refresh,#rail-refresh\{display:none!important\}/);
  assert.match(css, /header \.brand,header \.writer-identity,header \.hstat,header #crumb\{flex:0 1 auto;min-width:0;overflow:hidden\}/);
  assert.match(css, /header #bell,header #settings,header \.menu-btn\{flex:none\}/);
  assert.match(html, /data-writer-countdown data-refresh-now role="button" tabindex="0" aria-label="Refresh now"/);
  assert.match(html, /querySelector\('header \[data-refresh-now\]'\);if\(!c\)return;function go\(\)\{load\(\);loadWriterStatus_\(true\)\}/);
});
