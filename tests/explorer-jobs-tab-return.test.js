'use strict';
// GUI-16 (cs-519fcdc3): after Review queue, Decline candidates or My rulings, the Jobs tab returns to the job list.
// Jobs has no preset of its own, so clicking it must reset a decision preset (the [data-st-reset] OPEN button).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function el(extra) {
  const e = Object.assign({ dataset: {}, style: {}, hidden: false, innerHTML: '', textContent: '', id: '', attrs: {},
    classList: { toggle() {}, contains: () => false, add() {}, remove() {} },
    querySelector: () => el(), querySelectorAll: () => [], replaceChildren() {}, appendChild() {}, insertBefore() {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener() {}, getBoundingClientRect: () => ({ left: 0, right: 0, width: 0 }) }, extra);
  e.parentNode = e; return e;
}
function load() {
  let onClick = null, resets = 0;
  const reset = el({ click() { resets++; location.hash = '#' + encodeURIComponent(JSON.stringify({ t: 'pipeline', p: 'OPEN' })); } });
  const strip = el({ querySelector: s => (s === '[data-st-reset]' ? reset : el()) });
  const location = { hash: '' };
  const document = { readyState: 'complete', head: el(), body: el(),
    querySelector: s => (/rail|sheet/.test(s) ? el() : null), querySelectorAll: () => [],
    createElement: tag => (tag === 'nav' ? strip : el()), addEventListener: (type, fn) => { if (type === 'click') onClick = fn; },
    getElementById: id => (id === 'bottombar' || id === 'filters' || id === 'search' ? el() : null) };
  const window = { addEventListener() {} };
  vm.runInNewContext(read('pipeline-navigation.js'), { window, document, location, setTimeout: fn => { fn(); return 0; }, setInterval: () => 0,
    addEventListener() {}, MutationObserver: function () { this.observe = () => {}; }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 0, console });
  const tab = attrs => { const b = el(); b.dataset.stKey = 'pipeline:0'; Object.assign(b.attrs, attrs); b.closest = () => b; return b; };
  return { location, resets: () => resets, click: b => onClick({ target: b }), tab };
}
const hash = p => '#' + encodeURIComponent(JSON.stringify({ t: 'pipeline', p }));

test('Jobs after each decision view resets to the job list', () => {
  for (const preset of ['NEEDS_TIM', 'DECLINE_CANDIDATES', 'RULED']) {
    const nav = load();
    nav.location.hash = hash(preset);   // Review queue / Decline candidates / My rulings is open
    nav.click(nav.tab({ 'data-go': 'pipeline' }));   // click JOBS
    assert.equal(nav.resets(), 1, 'Jobs resets the ' + preset + ' preset');
    assert.equal(JSON.parse(decodeURIComponent(nav.location.hash.slice(1))).p, 'OPEN', 'the jobs view shows after ' + preset);
  }
});
test('Jobs leaves a non-decision preset alone, and the decision tabs never reset', () => {
  const nav = load();
  nav.location.hash = hash('APPLY_NOW');nav.click(nav.tab({ 'data-go': 'pipeline' }));assert.equal(nav.resets(), 0);
  nav.location.hash = hash('NEEDS_TIM');nav.click(nav.tab({ 'data-go': 'pipeline', 'data-preset': 'RULED' }));assert.equal(nav.resets(), 0);
});
