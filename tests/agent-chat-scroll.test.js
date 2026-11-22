// Canvas chat and input handlers with synthetic messages only. No network or private chat access.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const L = require('../office/office-logic.js');
const source = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
const draw = fs.readFileSync(path.join(__dirname, '../office/draw.js'), 'utf8')
  .replace(/^import .*$/mg, '').replace(/^export (async )?(function|const|let)/mg, '$1$2');
const renderer = { window: { OfficeLogic: L } };
vm.runInNewContext(draw, renderer);

function render(options, width = 1024) {
  const text = [], stack = []; let rect, clip;
  const ctx = new Proxy({
    font: '', measureText(t) { return { width: String(t).length * (parseFloat(this.font.match(/[\d.]+px/)?.[0]) || 23) * 0.5 }; },
    save() { stack.push(clip); }, restore() { clip = stack.pop(); },
    rect(x, y, w, h) { rect = { x, y, w, h }; }, clip() { clip = rect; },
    fillText(t, x, y) { if (!clip || y > clip.y && y <= clip.y + clip.h) text.push({ text: t, x, y }); }
  }, { get: (o, k) => k in o ? o[k] : () => {} });
  const hits = renderer.drawAgentChat(ctx, width, width * 683 / 1024, options);
  return { hits, text: text.map(t => t.text), runs: text };
}
const message = text => ({ from: 'Dot', to: 'Tim', time: '12:30', text });

test('all lines of long messages and older messages are reachable; composer stays fixed', () => {
  const scroll = { offset: 0 }, lines = Array.from({ length: 36 }, (_, i) => 'Example line ' + i);
  const opts = { msgs: [message('Oldest example'), message(lines.join('\n'))], scroll, draft: 'Example draft' };
  const first = render(opts), input = first.hits.find(h => h.act === 'input');
  assert.ok(scroll.max > 0); assert.ok(first.text.includes(lines[0])); assert.ok(!first.text.includes(lines[35]));
  const seen = new Set(first.text);
  for (let offset = 150; offset < scroll.max + 150; offset += 150) {
    scroll.offset = Math.min(offset, scroll.max);
    const result = render(opts); result.text.forEach(t => seen.add(t));
    assert.deepEqual(result.hits.find(h => h.act === 'input'), input);
  }
  for (const line of [...lines, 'Oldest example']) assert.ok(seen.has(line), line);
  assert.ok(render(opts).hits.some(h => h.act === 'scroll' && h.dir === 0), 'Latest control');
});

test('refresh anchors older text, latest follows replies, offsets clamp, and resolution is independent', () => {
  const scroll = { offset: 0 }, msgs = Array.from({ length: 20 }, (_, i) => message('Example ' + i));
  render({ msgs, scroll }); scroll.offset = 400;
  const before = render({ msgs, scroll }).runs.filter(r => /^Example \d+$/.test(r.text));
  msgs.push(message('New example reply'));
  const after = render({ msgs, scroll }).runs.filter(r => /^Example \d+$/.test(r.text));
  assert.deepEqual(after, before);
  const offset = scroll.offset; render({ msgs, scroll }, 640); assert.ok(Math.abs(scroll.offset - offset) < 1e-8);
  scroll.offset = 1e9; render({ msgs, scroll }); assert.equal(scroll.offset, scroll.max);
  scroll.offset = 0; msgs.push(message('Latest example')); assert.ok(render({ msgs, scroll }).text.includes('Latest example'));
});

test('long unbroken text wraps losslessly and blank lines survive', () => {
  const ctx = { measureText: t => ({ width: t.length }) };
  const wrapped = renderer.wrapLines(ctx, 'x'.repeat(73), 10);
  assert.equal(wrapped.join(''), 'x'.repeat(73)); assert.ok(wrapped.every(t => t.length <= 10));
  assert.deepEqual(Array.from(renderer.wrapLines(ctx, 'a\n\nb', 10)), ['a', '', 'b']);
});

test('draft link hitboxes are clipped to history and never intercept composer or footer', () => {
  const scroll = { offset: 0 }, opts = { msgs: [message('Older'), { ...message('Newer'), draftUrl: 'https://github.com/example/project/pull/12' }], scroll };
  const first = render(opts), history = first.hits.find(h => h.act === 'history');
  assert.ok(first.hits.some(h => h.act === 'draft'));
  opts.msgs[1].text = Array(30).fill('Example long reply').join('\n');
  const long = render(opts); assert.ok(!long.hits.some(h => h.act === 'draft'));
  scroll.offset = scroll.max;
  for (const h of render(opts).hits.filter(h => h.act === 'draft')) {
    assert.ok(h.y >= history.y); assert.ok(h.y + h.h <= history.y + history.h + 1e-10);
  }
  assert.ok(!render({ ...opts, locked: true }).hits.some(h => ['history', 'scroll', 'draft'].includes(h.act)));
});

function controls() {
  const events = {}, ctx = {
    L, DEMO: false, createCodingClient: () => ({ clear() {} }), localStorage: { getItem() {}, removeItem() {} },
    document: { createElement: () => ({ setAttribute() {}, addEventListener() {} }), body: { append() {} } },
    setInterval() {}, setTimeout() {}, canvas: { addEventListener: (name, fn) => { events[name] = fn; } },
    innerWidth: 1000, innerHeight: 800, panelOpen: false, performance: { now: () => 100 },
    camera: { updateMatrixWorld() {} }, pick: () => ctx.picked, pickRay: () => ctx.picked,
    ndc: { set() {} }, ray: { setFromCamera() {}, intersectObject: () => [], intersectObjects: () => [] }, pickables: () => [], dimPlate: {},
    turn() { ctx.turns++; }, turns: 0, activate() { ctx.activations++; }, activations: 0,
    picked: { board: 'agentchat', ac: { act: 'history' } }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('const AGENT_URL ='), source.indexOf('function openBot(name)')), ctx);
  vm.runInContext("AC.token='synthetic'; AC.exp=Date.now()+60000; AC.scroll={offset:0,max:1000,view:400}; let lastInput=0,glide=null;", ctx);
  vm.runInContext(source.slice(source.indexOf("  canvas.addEventListener('wheel'"), source.indexOf('  const look =')), ctx);
  const touchStart = source.indexOf('    const looks = new Map(), dims = new Map(), chats = new Map();');
  const touchEnd = source.indexOf("    canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);", touchStart);
  vm.runInContext(source.slice(touchStart, source.indexOf('\n', touchEnd)), ctx);
  return { ctx, events, run: code => vm.runInContext(code, ctx) };
}

test('wheel supports pixel, line and page units, ignores outside chat and preserves zoom', () => {
  const { ctx, events, run } = controls(); let prevented = 0;
  const wheel = extra => events.wheel({ clientX: 100, clientY: 100, deltaY: 2, deltaMode: 0, preventDefault() { prevented++; }, ...extra });
  wheel(); assert.equal(run('AC.scroll.offset'), 2);
  wheel({ deltaMode: 1 }); assert.equal(run('AC.scroll.offset'), 62);
  wheel({ deltaMode: 2 }); assert.equal(run('AC.scroll.offset'), 862);
  wheel({ deltaY: 9999 }); assert.equal(run('AC.scroll.offset'), 1000);
  wheel({ ctrlKey: true }); ctx.picked = { board: 'project' }; wheel(); assert.equal(prevented, 4);
  run('agentScroll(-9999)'); assert.equal(run('AC.scroll.offset'), 0);
  run('agentLock()'); assert.equal(run('AC.scroll.offset'), 0); assert.equal(run('AC.scroll.max'), undefined);
});

test('touch swipe scrolls chat without turning camera or activating links; taps still work', () => {
  const { ctx, events, run } = controls();
  const touch = (type, y) => events[type]({ type, preventDefault() {}, changedTouches: [{ identifier: 1, clientX: 100, clientY: y }] });
  touch('touchstart', 400); touch('touchmove', 250); touch('touchend', 250);
  assert.equal(run('AC.scroll.offset'), 300); assert.equal(ctx.turns, 0); assert.equal(ctx.activations, 0);
  touch('touchstart', 400); touch('touchend', 400); assert.equal(ctx.activations, 1);
  touch('touchstart', 400); touch('touchcancel', 400); assert.equal(ctx.activations, 1);
  ctx.picked = { board: 'project' }; touch('touchstart', 400); touch('touchmove', 250); assert.equal(ctx.turns, 1);
});
