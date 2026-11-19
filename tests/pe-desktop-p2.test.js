'use strict';
// Card P2 (Pipeline Explorer desktop): Writer-off banner + disabled decisions, Back closes the drawer.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const W = require('../pipeline-writer-off.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');

function btn(title) {
  const a = {}; if (title != null) a.title = title;
  return { disabled: false, attrs: a, hasAttribute: k => k in a, getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, removeAttribute: k => { delete a[k]; } };
}

test('Writer off disables decision buttons with a reason and restores them exactly when it is back', () => {
  const b1 = btn('Prepare READY_TO_PURSUE (1)'), b2 = btn();
  assert.equal(W.gate([b1, b2], true), 2);
  for (const b of [b1, b2]) { assert.equal(b.disabled, true); assert.equal(b.getAttribute('aria-disabled'), 'true'); assert.equal(b.getAttribute('title'), W.TITLE); }
  W.gate([b1], true);   // re-render while off keeps the original title
  W.gate([b1, b2], false);
  assert.equal(b1.disabled, false); assert.equal(b1.getAttribute('title'), 'Prepare READY_TO_PURSUE (1)'); assert.equal(b1.hasAttribute('aria-disabled'), false);
  assert.equal(b2.hasAttribute('title'), false);
  const other = btn('busy'); other.disabled = true;   // disabled for another reason: left alone
  W.gate([other], false); assert.equal(other.disabled, true);
});

test('Writer-off gate covers drawer decisions', () => {
  for (const s of ['[data-decide-key]', '#save-decision']) assert.ok(W.SELECTOR.includes(s), s);
  assert.match(W.bannerHtml(), /Writer not connected · decisions can’t be sent from this device/);
});

test('desktop wiring: banner in #writer-alert, gate after every decision render', () => {
  assert.ok(html.includes('<script src="pipeline-writer-off.js"></script>'));
  assert.match(html, /else if\(lvl==='off'&&typeof PipelineWriterOff!=='undefined'\)\{al\.className='on writer-off';al\.innerHTML=PipelineWriterOff\.bannerHtml\(\);\}/);
  assert.ok((html.match(/writerGate_\(\);/g) || []).length >= 4);
  assert.match(html, /b\.title=lvl==='off'\?'Writer not connected on this device/);
});

function runSheet(phone) {
  const start = html.indexOf('(function sheet_(){'), end = html.indexOf('sync();})();', start) + 'sync();})();'.length;
  assert.ok(start > 0 && end > start);
  const cls = new Set(), listeners = {}, stack = [null]; let idx = 0, observer;
  const d = { dataset: {}, parentElement: null, scrollTop: 0, classList: { contains: c => cls.has(c), add: c => { cls.add(c); observer(); }, remove: c => { cls.delete(c); observer(); }, toggle: (c, on) => { const had = cls.has(c); if (on) cls.add(c); else cls.delete(c); if (had !== !!on) observer(); } }, querySelector: () => null, getBoundingClientRect: () => ({ top: 0 }) };
  const history = { get state() { return stack[idx]; }, get length() { return stack.length; }, pushState(s) { stack.splice(idx + 1); stack.push(s); idx++; }, back() { if (idx > 0) { idx--; (listeners.popstate || []).forEach(f => f()); } } };
  const close = { click() { d.classList.remove('on'); } };
  const ctx = { S: {}, history, location: { href: 'x' }, innerHeight: 900, phoneLayout: () => phone, requestAnimationFrame: () => {}, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    $: id => (id === 'drawer' ? d : id === 'd-close' ? close : null), document: { documentElement: { style: {} }, body: { style: { setProperty() {} } } },
    MutationObserver: function (cb) { observer = () => cb(); this.observe = () => {}; }, window: { addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); } } };
  vm.runInNewContext(html.slice(start, end), ctx);
  return { d, cls, history, idx: () => idx };
}

test('desktop Back closes the open drawer and stays in the app', () => {
  const s = runSheet(false);
  s.d.classList.add('on');
  assert.equal(s.history.length, 2); assert.equal(s.history.state.peSheet, 1);
  s.d.classList.add('on');   // another job in the same drawer: no second entry
  assert.equal(s.history.length, 2);
  s.history.back();   // browser Back
  assert.equal(s.cls.has('on'), false); assert.equal(s.idx(), 0);
});

test('closing the drawer with ✕ pops its own entry once', () => {
  const s = runSheet(false);
  s.d.classList.add('on'); s.d.classList.remove('on');
  assert.equal(s.idx(), 0); assert.equal(s.cls.has('on'), false);
  s.d.classList.add('on'); assert.equal(s.idx(), 1);   // reopen pushes again
});

test('GUI 12: Writer off also gates phone decide buttons, undo and the decision fields', () => {
  for (const s of ['#undo-decision', '#edit-state', '#edit-reason', '#edit-dup', '#edit-note', '[data-m-do]', '[data-m-retry]']) assert.ok(W.SELECTOR.includes(s), s);
  const m = fs.readFileSync(path.join(__dirname, '..', 'pipeline-mobile.js'), 'utf8');
  assert.match(m, /wo\.apply\(el, !!\(b && b\.health && b\.health\(\)\.writer === false\)\)/);
});
