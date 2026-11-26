// Phone Decide: "Scores unavailable: N need a decision" when scores are withheld, never "0 need you · All caught up" (cs-d1de0de4).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const CR = require('../pipeline-control-room.js');
const SRC = fs.readFileSync(path.join(__dirname, '../pipeline-mobile.js'), 'utf8');

// require() path: the pure helper, loaded with a document stub that keeps the shell from mounting.
function loadHelper() {
  const saved = { document: global.document, matchMedia: global.matchMedia };
  global.document = { documentElement: { classList: { contains: c => c === 'force-desktop' } }, readyState: 'complete' };
  global.matchMedia = () => ({ matches: false });
  try { delete require.cache[require.resolve('../pipeline-mobile.js')]; return require('../pipeline-mobile.js'); }
  finally { global.document = saved.document; global.matchMedia = saved.matchMedia; }
}
const M = loadHelper();
const text = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('helper: scores missing + 64 need a decision -> Scores unavailable with a Jobs control, count 64', () => {
  const s = M.decideEmptyState({ decideCount: 0, needsCount: 64, eligibleScored: 0, queueView: 'ready' });
  assert.equal(s.kind, 'scores-unavailable');
  assert.equal(s.count, 64);   // feeds the Decide header and the Status "Need decision" tile
  assert.ok(text(s.html).includes('Scores unavailable: 64 need a decision'));
  assert.doesNotMatch(s.html, /All caught up|0 need you|No jobs need a decision/);
  assert.match(s.html, /data-m-browse/);
  assert.match(s.html, /m-pending/);   // caution glyph colour, not the success check
});

test('helper: nothing needs a decision -> All caught up stays', () => {
  const s = M.decideEmptyState({ decideCount: 0, needsCount: 0, eligibleScored: 0, queueView: 'ready' });
  assert.equal(s.kind, 'caught-up');
  assert.equal(s.count, 0);
  assert.match(s.html, /All caught up/);
  assert.match(s.html, /Browse all jobs/);
  assert.doesNotMatch(s.html, /Scores unavailable/);
});

test('helper: scored jobs exist -> no scores-unavailable state; queue rows -> count is the queue', () => {
  assert.equal(M.decideEmptyState({ decideCount: 0, needsCount: 64, eligibleScored: 120, queueView: 'ready' }).kind, 'caught-up');
  const q = M.decideEmptyState({ decideCount: 3, needsCount: 64, eligibleScored: 0, queueView: 'ready' });
  assert.equal(q.kind, 'queue'); assert.equal(q.count, 3);
});

test('helper: loading and unavailable are unchanged', () => {
  const l = M.decideEmptyState({ decideCount: 0, needsCount: 64, eligibleScored: 0, queueView: 'loading' });
  assert.equal(l.kind, 'loading'); assert.match(l.html, /Decision queue loading/); assert.doesNotMatch(l.html, /Scores unavailable/);
  const u = M.decideEmptyState({ decideCount: 0, needsCount: 64, eligibleScored: 0, queueView: 'unavailable' });
  assert.equal(u.kind, 'unavailable'); assert.equal(u.count, '—'); assert.equal(u.html, '');
});

// Browser path: the mounted shell paints the Decide pane and the Status tile from the bridge.
function mountShell(bridge) {
  const byId = Object.create(null);
  function el(tag) {
    let stored = '';
    const e = {
      tagName: String(tag || 'div').toUpperCase(), id: '', className: '', style: {}, _attrs: {}, children: [], textContent: '', value: '',
      classList: { _s: new Set(), add(...a) { a.forEach(x => this._s.add(x)); }, remove(...a) { a.forEach(x => this._s.delete(x)); }, contains(x) { return this._s.has(x); }, toggle(x, on) { if (on === false || (on == null && this._s.has(x))) this._s.delete(x); else this._s.add(x); } },
      setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'id') { this.id = String(v); byId[v] = e; } },
      getAttribute(k) { return this._attrs[k] == null ? null : this._attrs[k]; },
      hasAttribute(k) { return this._attrs[k] != null; },
      appendChild(c) { this.children.push(c); return c; },
      contains() { return false; }, querySelector() { return null; }, querySelectorAll() { return []; },
      addEventListener() {}, focus() {}, getClientRects() { return [{}]; }
    };
    Object.defineProperty(e, 'innerHTML', { get() { return stored; }, set(v) { stored = String(v); String(v).replace(/\bid="([^"]+)"/g, (_, id) => { if (!byId[id]) { const n = el('div'); n.id = id; byId[id] = n; } }); }, configurable: true });
    return e;
  }
  const docEl = el('html'), body = el('body');
  const document = {
    documentElement: docEl, body, readyState: 'complete', hidden: false, activeElement: null,
    getElementById(id) { if (!byId[id]) { const n = el(id === 'm-q' ? 'input' : 'div'); n.id = id; byId[id] = n; } return byId[id]; },
    createElement: tag => el(tag), querySelector: () => el('div'), querySelectorAll: () => [], addEventListener() {}
  };
  const root = {
    PipelineControlRoom: CR, PEMobileBridge: bridge,
    matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: fn => { fn(); return 0; }, setInterval() { return 0; }, addEventListener() {}, scrollTo() {},
    document, Date, Number, String, Math, Object, Array, JSON
  };
  root.window = root;
  const ctx = vm.createContext(root);
  ctx.globalThis = ctx;
  vm.runInContext('document = globalThis.document; window = globalThis; setTimeout = globalThis.setTimeout || function(){};', ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, byId };
}
function statusSummary() {
  const at = new Date(Date.now() - 5 * 60000).toISOString();
  return CR.summary(CR.model({
    now: Date.now(),
    health: { ok: true, processFlow: { at, population: { total: 3, reconciled: true }, queues: { verification: 0, enrichment: 2, readyForReview: 0, blockedClosed: 0 },
      completion: { enrichment: { available: true, perHour: 2.2, count36: 79, last24h: 50 } } } },
    master: { loaded: true, freshness: 'FRESH', rows: [] }, activity: { ok: true, today: { writes: 0 } }
  }), {});
}
function bridge(needs, scored) {
  const at = new Date().toISOString();
  return {
    ready: () => true, status: statusSummary, health: () => ({ state: 'OK', lastRead: at, writer: true }),
    decideRows: () => [], jobsRows: () => [], decideState: () => ({ status: 'ready', have: true, loadedAt: Date.now(), error: '', staleLabel: '' }),
    needsDecisionCount: () => needs, eligibleScoreCount: () => scored,
    view: r => r, notSaved: () => false, openDesktop() {}
  };
}

test('shell: Decide pane and Status tile show 64 when scores are withheld', () => {
  const { ctx, byId } = mountShell(bridge(64, 0));
  const decide = byId['m-pane-decide'].innerHTML;
  assert.ok(text(decide).includes('Scores unavailable: 64 need a decision'));
  assert.match(decide, /<b class="m-num m-attn">64<\/b> need you/);
  assert.doesNotMatch(decide, /All caught up|>0<\/b> need you/);
  assert.match(decide, /data-m-browse/);
  ctx.PEMobile.setTab('status');
  const status = byId['m-pane-status'].innerHTML;
  assert.match(status, /<b class="m-num">64<\/b><span class="m-label">Need decision<\/span>/);
});

test('shell: nothing to decide still shows All caught up and 0', () => {
  const { byId } = mountShell(bridge(0, 0));
  const decide = byId['m-pane-decide'].innerHTML;
  assert.match(decide, /All caught up/);
  assert.match(decide, /<b class="m-num m-attn">0<\/b> need you/);
  assert.doesNotMatch(decide, /Scores unavailable/);
});
