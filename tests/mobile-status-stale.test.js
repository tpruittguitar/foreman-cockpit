// Mobile Status: a fresh load with flow >90 min old keeps last numbers marked STALE (cs-5ae582a6).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const CR = require('../pipeline-control-room.js');

function el(tag) {
  const e = {
    tagName: String(tag || 'div').toUpperCase(), id: '', className: '', hidden: false, innerHTML: '', textContent: '', value: '',
    children: [], parentNode: null, style: {}, disabled: false, _attrs: {}, _mHtml: undefined, open: false,
    classList: {
      _s: new Set(),
      add(...a) { a.forEach(x => { this._s.add(x); }); e.className = [...this._s].join(' '); },
      remove(...a) { a.forEach(x => { this._s.delete(x); }); e.className = [...this._s].join(' '); },
      contains(x) { return this._s.has(x); },
      toggle(x, on) { if (on === false || (on == null && this._s.has(x))) this.remove(x); else this.add(x); }
    },
    setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute(k) { return this._attrs[k] == null ? (k === 'id' ? this.id : null) : this._attrs[k]; },
    hasAttribute(k) { return this.getAttribute(k) != null; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    contains(n) { if (n === this) return true; return this.children.some(c => c.contains && c.contains(n)); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return collect(this, sel); },
    addEventListener() {}, focus() {}, getClientRects() { return [{}]; }
  };
  return e;
}
function collect(node, sel) {
  const out = [];
  const wantId = (sel.match(/^#([\w-]+)$/) || [])[1];
  const wantClass = (sel.match(/^\.([\w-]+)$/) || [])[1];
  const wantAttr = (sel.match(/^\[([^=\]]+?)(?:="([^"]*)")?\]$/) || []);
  function walk(n) {
    const classes = (n.className || '').split(/\s+/);
    if (wantId && n.id === wantId) out.push(n);
    else if (wantClass && (n.classList && n.classList.contains(wantClass) || classes.includes(wantClass))) out.push(n);
    else if (wantAttr[1] && n.getAttribute && n.getAttribute(wantAttr[1]) != null && (wantAttr[2] == null || n.getAttribute(wantAttr[1]) === wantAttr[2])) out.push(n);
    else if (sel === 'details' && n.tagName === 'DETAILS') out.push(n);
    else if (sel === 'button,a[href],input,summary,[tabindex]:not([tabindex="-1"])' && /^(BUTTON|A|INPUT|SUMMARY)$/.test(n.tagName)) out.push(n);
    (n.children || []).forEach(walk);
  }
  walk(node);
  return out;
}
function indexIds(node, html, registry) {
  String(html || '').replace(/<([a-z0-9]+)([^>]*)>/gi, (_, tag, attrs) => {
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    const cls = (attrs.match(/\bclass="([^"]+)"/) || [])[1] || '';
    if (!id && !cls) return;
    const n = (id && registry[id]) || el(tag);
    if (id) { n.id = id; n.setAttribute('id', id); registry[id] = n; }
    if (cls) { cls.split(/\s+/).forEach(c => n.classList.add(c)); }
    if (!node.children.includes(n)) node.children.push(n);
  });
}

test('fresh load with flow older than 90 min keeps last Status numbers marked STALE (cs-5ae582a6)', () => {
  const now = Date.parse('2026-10-29T00:00:00Z'), at = new Date(now - 120 * 60000).toISOString();
  const modelInput = {
    now,
    health: {
      ok: true,
      processFlow: {
        at,
        population: { total: 3, reconciled: true },
        queues: { verification: 0, enrichment: 2, readyForReview: 1, blockedClosed: 0 },
        completion: { enrichment: { available: true, perHour: 2.2, count36: 79, last24h: 50 } },
        upstream: {
          at, reconciled: true, total: 2, accounted: 2, waiting: 2,
          counts: { WAITING: 2, PRESENT: 0, EXCLUDED: 0, HELD: 0, IDENTITY_HOLD: 0, MISSING_PREVIOUSLY_PRESENT: 0 },
          rates: { discovery: { perHour: 9.1, available: true, unit: 'candidate identities' }, intake: { perHour: 4.1, available: true } }
        }
      }
    },
    master: { loaded: true, freshness: 'FRESH', rows: [] },
    activity: { ok: true, today: { writes: 0 } }
  };
  const sum = CR.summary(CR.model(modelInput), {});
  assert.equal(sum.stale, true);
  assert.equal(sum.stages[2].perHour, 2.2);

  const byId = Object.create(null);
  const docEl = el('html');
  const body = el('body');
  const document = {
    documentElement: docEl,
    body,
    readyState: 'complete',
    hidden: false,
    activeElement: null,
    visibilityState: 'visible',
    getElementById(id) { return byId[id] || null; },
    createElement: tag => el(tag),
    querySelector: sel => collect({ children: [docEl, body, ...Object.values(byId)] }, sel)[0] || null,
    querySelectorAll: sel => collect({ children: [docEl, body, ...Object.values(byId)] }, sel),
    addEventListener() {}
  };
  const origAppend = body.appendChild.bind(body);
  body.appendChild = function (c) {
    origAppend(c);
    if (c.id) byId[c.id] = c;
    const raw = Object.getOwnPropertyDescriptor(c, 'innerHTML') ? null : c;
    return c;
  };
  // Parse ids out of innerHTML assignments (shell mount and pane paints).
  function hookInnerHTML(node) {
    let stored = '';
    Object.defineProperty(node, 'innerHTML', {
      get() { return stored; },
      set(v) {
        stored = String(v);
        node.textContent = stored.replace(/<[^>]+>/g, ' ');
        node.children = [];
        indexIds(node, stored, byId);
      },
      configurable: true
    });
  }
  hookInnerHTML(body);
  document.getElementById = function (id) {
    if (!byId[id]) { const n = el(id === 'm-q' ? 'input' : 'div'); n.id = id; n.value = ''; n.setAttribute('id', id); hookInnerHTML(n); byId[id] = n; }
    return byId[id];
  };
  const createElement = document.createElement;
  document.createElement = function (tag) {
    const n = createElement(tag);
    hookInnerHTML(n);
    const setId = n.setAttribute.bind(n);
    n.setAttribute = function (k, v) { setId(k, v); if (k === 'id') byId[v] = n; };
    return n;
  };

  const root = {
    PEMobileBridge: {
      ready: () => true,
      status: () => sum,
      health: () => ({ state: 'OK', lastRead: at, writer: true }),
      decideRows: () => [],
      jobsRows: () => [],
      decideState: () => ({ status: 'ready', have: true, loadedAt: at, error: '' }),
      view: r => r,
      notSaved: () => false,
      openDesktop() {}
    },
    matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: fn => { fn(); return 0; },
    setInterval() { return 0; },
    addEventListener() {},
    scrollTo() {},
    document,
    Date,
    Number,
    String,
    Math,
    Object,
    Array,
    JSON
  };
  // bind document/global like a browser
  root.window = root;
  root.document = document;
  const ctx = vm.createContext(root);
  ctx.globalThis = ctx;
  // pipeline-mobile uses `document` and `window` as free bindings; also `typeof window`
  vm.runInContext('document = globalThis.document; window = globalThis; setTimeout = globalThis.setTimeout || function(){};', ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../pipeline-mobile.js'), 'utf8'), ctx);

  assert.ok(ctx.PEMobile, 'mobile shell mounted');
  ctx.PEMobile.setTab('status');
  const pane = byId['m-pane-status'];
  assert.ok(pane, 'Status pane exists');
  const html = pane.innerHTML || '';
  assert.match(html, /\bSTALE\b/);
  assert.match(html, /as of /);
  assert.match(html, /2\.2/);
  assert.match(html, /Enrichment/);
  assert.doesNotMatch(html, /Pipeline evidence is not available yet/);
  assert.doesNotMatch(html, /Rate not measured/);
});
