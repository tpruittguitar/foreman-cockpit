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

// cs-9e5be547 #1 and #2: disabled Pursue matches Research / Decline; the drawer body reserves the sticky decide bar's height.
const oct15 = fs.readFileSync(path.join(__dirname, '..', 'pipeline-ui-oct15.css'), 'utf8'), desk = fs.readFileSync(path.join(__dirname, '..', 'pipeline-ui-desktop.css'), 'utf8');
const decl = (css, sel) => { const i = css.indexOf(sel + ' {'); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };
test('cs-9e5be547 #1: disabled Pursue takes the Research / Decline chrome; enabled Pursue stays green with its glow', () => {
  const dis = '#drawer .wh-decide [data-decide-key="1"]:disabled, #drawer .wh-decide [data-decide-key="1"][aria-disabled="true"]';
  const both = oct15.split(dis + ' {');
  assert.equal(both.length, 3, 'desktop and phone blocks');
  const base = decl(oct15, '  #drawer .wh-decide button');
  for (const part of both.slice(1)) {
    const r = part.slice(0, part.indexOf('}'));
    for (const t of ['border-color: var(--pe-outline) !important', 'background: var(--pe-hull) !important', 'color: var(--pe-text-primary) !important', 'box-shadow: none !important']) assert.ok(r.includes(t), t);
    assert.doesNotMatch(r, /pe-green|pe-glow|#4ade80/i);
  }
  for (const t of ['var(--pe-outline)', 'background: var(--pe-hull)', 'box-shadow: none', 'color: var(--pe-text-primary)']) assert.ok(base.includes(t), 'Research shares ' + t);
  assert.match(html, /#drawer #d-body \.wh-decide \[data-decide-key="3"\]\{color:var\(--pe-text-primary\)!important\}/, 'Decline is primary text');
  const on = decl(oct15, '  #drawer .wh-decide [data-decide-key="1"]');
  assert.match(on, /border-color: var\(--pe-green\) !important;[^}]*color: var\(--pe-green\) !important;[^}]*box-shadow: var\(--pe-glow-green\) !important/, 'enabled Pursue unchanged');
  assert.ok(oct15.indexOf(dis) > oct15.indexOf('#drawer .wh-decide [data-decide-key="1"] {'), 'the disabled rule comes after, and its extra selector part makes it win');
  assert.equal(typeof W.TITLE, 'string'); assert.ok(W.TITLE.length > 0, 'the Writer-off title still explains the state');
});
test('cs-9e5be547 #2: the content above the sticky decide bar reserves at least the bar height', () => {
  const tok = fs.readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8'), decH = Number(/--pe-dec-h: (\d+)px/.exec(tok)[1]);
  const bar = /#drawer #d-body>\.wh-decide\{[^}]*padding:(\d+)px 0 (\d+)px/.exec(desk), barH = decH + Number(bar[1]) + Number(bar[2]);
  const m = /#drawer #d-body>:not\(\.wh-decide\):has\(\+ \.wh-decide\)\{padding-bottom:calc\(var\(--pe-dec-h,50px\) \+ (\d+)px\)\}/.exec(desk);
  assert.ok(m, 'reserved space on the content above the bar');
  assert.ok(decH + Number(m[1]) >= barH + 12, 'reserve ' + (decH + Number(m[1])) + ' >= bar ' + barH + ' + 12 gap');
  assert.match(desk, /#drawer #d-body\{[^}]*scroll-padding-bottom:calc\(var\(--pe-dec-h,50px\) \+ 24px\)/);
  assert.match(desk, /#drawer #d-body>\.wh-decide\{position:sticky;bottom:0/, 'the bar stays sticky');
  assert.match(html, /function pinDecideRow_\(\)\{var body=\$\('d-body'\),dec=body&&body\.querySelector\('\.wh-decide'\);if\(dec\)body\.appendChild\(dec\);\}/);
});

test('cs-9755c866: at 768 the brand keeps its type and cannot shrink under PIPELINE EXPLORER', () => {
  const i = desk.indexOf('@media(max-width:1023px) and (min-width:761px){');
  assert.ok(i >= 0, '1023-761 header block');
  const block = desk.slice(i, desk.indexOf('\n}', i) + 2);
  assert.match(block, /header \.brand\{[^}]*flex:0 0 auto;min-width:max-content;overflow:visible/);
  assert.doesNotMatch(block, /font-size:\s*var\(--pe-fs-brand\)/);
  assert.match(desk, /@media\(min-width:1400px\)\{header \.brand,header \.writer-identity,header \.hstat,header \[data-refresh-now\]\{flex:none\}/);
  const octBrand = decl(oct15, '  header .brand');
  assert.match(octBrand, /font-size: var\(--pe-fs-brand\)/);
  assert.match(octBrand, /letter-spacing: var\(--pe-label-tracking\)/);
});
