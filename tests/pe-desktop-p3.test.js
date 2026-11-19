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
    for (const other of ['Review queue', 'Decline candidates', 'My rulings', 'Map', 'Compare']) assert.equal(nav.matches(item(nav, other), st), false, other + ' ' + preset);
  }
});

test('with no search the tab rules are unchanged', () => {
  const nav = loadNav('');
  assert.equal(nav.matches(item(nav, 'Review queue'), { tab: 'pipeline', preset: 'NEEDS_TIM', map: false, search: '' }), true);
  assert.equal(nav.matches(item(nav, 'Jobs'), { tab: 'pipeline', preset: 'NEEDS_TIM', map: false, search: '' }), false);
  assert.equal(nav.matches(item(nav, 'Jobs'), { tab: 'pipeline', preset: '', map: false, search: '' }), true);
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
  assert.match(css, /header #refresh,#rail \.rail-foot button#rail-refresh\{display:none!important\}/);
  assert.match(css, /header \.brand,header \.writer-identity,header \.hstat,header #crumb\{flex:0 1 auto;min-width:0;overflow:hidden\}/);
  assert.match(css, /header #bell,header #settings,header \.menu-btn\{flex:none\}/);
  assert.match(html, /<button type="button" class="writer-countdown" data-writer-countdown data-refresh-now>/);
  assert.match(css, /header #search\{flex-shrink:50\}/);
  assert.match(css, /@media\(min-width:1400px\)\{header \.brand,header \.writer-identity,header \.hstat,header \[data-refresh-now\]\{flex:none\}\}/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'pipeline-mobile.js'), 'utf8'), /\$\('m-search'\)\.onclick = function \(\) \{ jobsFilter = 'all';/);
  assert.match(html, /querySelector\('header \[data-refresh-now\]'\);if\(!c\)return;function go\(\)\{load\(\);loadWriterStatus_\(true\)\}/);
});

function stripComments(t) { return t.replace(/\/\*[\s\S]*?\*\//g, ''); }
function splitSelectors(sel) {
  const out = []; let cur = '', depth = 0;
  for (const c of sel) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const extras = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  const rest = sel.replace(/#[\w-]+/g, ' ').replace(/\.[\w-]+/g, ' ').replace(/\[[^\]]+\]/g, ' ').replace(/:(:)?[\w-]+(\([^)]*\))?/g, ' ').replace(/[>+~]/g, ' ');
  const tags = (rest.match(/[A-Za-z][\w-]*/g) || []).length;
  return [ids, extras, tags];
}
function cmpSpec(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
function mediaAppliesAt(mq, width, pointerFine) {
  return mq.split(',').map(q => q.trim()).filter(Boolean).some(q => {
    if (/\(\s*pointer\s*:\s*coarse\s*\)/.test(q) && pointerFine) return false;
    if (/\(\s*pointer\s*:\s*fine\s*\)/.test(q) && !pointerFine) return false;
    const maxw = q.match(/max-width\s*:\s*(\d+)/); if (maxw && Number(maxw[1]) < width) return false;
    const minw = q.match(/min-width\s*:\s*(\d+)/); if (minw && Number(minw[1]) > width) return false;
    if (/\(\s*hover\s*:\s*none\s*\)/.test(q) && pointerFine) return false;
    if (/prefers-reduced-motion/.test(q)) return false;
    return true;
  });
}
function nodeMatchesCompound(node, compound) {
  if (!compound || compound === '*') return true;
  if (/:(hover|focus-visible|active)|:has\(:focus-visible\)/.test(compound)) return false;
  const tag = compound.match(/^[A-Za-z][\w-]*/);
  if (tag && node.tag !== tag[0].toLowerCase()) return false;
  const id = compound.match(/#([\w-]+)/);
  if (id && node.id !== id[1]) return false;
  const classes = [...compound.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
  const have = new Set((node.className || '').split(/\s+/).filter(Boolean));
  return classes.every(c => have.has(c));
}
function tokenize(sel) {
  const out = []; let cur = '', depth = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(') { depth++; cur += c; continue; }
    if (c === ')') { depth--; cur += c; continue; }
    if (depth === 0 && (c === '>' || c === '+' || c === '~')) {
      if (cur.trim()) out.push({ kind: 'c', s: cur.trim() });
      out.push({ kind: 'comb', s: c });
      cur = '';
      continue;
    }
    if (depth === 0 && /\s/.test(c)) {
      if (cur.trim()) { out.push({ kind: 'c', s: cur.trim() }); cur = ''; }
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push({ kind: 'c', s: cur.trim() });
  return out;
}
function selectorMatches(sel, path) {
  const tokens = tokenize(sel);
  let i = path.length - 1, t = tokens.length - 1;
  if (!tokens.length || tokens[t].kind !== 'c') return false;
  if (!nodeMatchesCompound(path[i], tokens[t].s)) return false;
  t--; i--;
  while (t >= 0) {
    if (i < 0) return false;
    if (tokens[t].kind === 'comb' && tokens[t].s === '>') {
      t--;
      if (t < 0 || tokens[t].kind !== 'c') return false;
      if (!nodeMatchesCompound(path[i], tokens[t].s)) return false;
      t--; i--;
      continue;
    }
    if (tokens[t].kind === 'comb') return false;
    if (nodeMatchesCompound(path[i], tokens[t].s)) { t--; i--; continue; }
    i--;
  }
  return true;
}
function walkCss(css, appliesFn, file, out) {
  const text = stripComments(css);
  function walk(block, applies) {
    let i = 0;
    while (i < block.length) {
      while (i < block.length && /\s/.test(block[i])) i++;
      if (i >= block.length) break;
      if (block[i] === '@') {
        const m = block.slice(i).match(/^@([a-zA-Z-]+)([\s\S]*?)(\{|;)/);
        if (!m) break;
        const openRel = m[0].endsWith('{');
        if (!openRel) { i += m[0].length; continue; }
        const open = i + m[0].length - 1;
        let depth = 1, j = open + 1;
        while (j < block.length && depth) { if (block[j] === '{') depth++; else if (block[j] === '}') depth--; j++; }
        const body = block.slice(open + 1, j - 1);
        if (m[1] === 'media') walk(body, applies && appliesFn(m[2]));
        i = j;
        continue;
      }
      const open = block.indexOf('{', i);
      if (open < 0) break;
      const selectors = block.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < block.length && depth) { if (block[j] === '{') depth++; else if (block[j] === '}') depth--; j++; }
      const body = block.slice(open + 1, j - 1);
      if (applies && selectors && !selectors.startsWith('@')) out.push({ selectors, body, file });
      i = j;
    }
  }
  walk(text, true);
}
function displayDecl(body) {
  const re = /(?:^|;)\s*display\s*:\s*([^;}]+)/g;
  let last = null, m;
  while ((m = re.exec(body))) {
    const raw = m[1].trim();
    last = { value: raw.replace(/!important/gi, '').trim(), important: /!important/i.test(raw) };
  }
  return last;
}
const railRefreshPath = [
  { tag: 'html' }, { tag: 'body' },
  { tag: 'nav', id: 'rail' },
  { tag: 'div', className: 'rail-in' },
  { tag: 'div', className: 'rail-foot' },
  { tag: 'button', id: 'rail-refresh' }
];
function winningDisplay(width, pointerFine) {
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
  const decls = [];
  for (const file of links) {
    const rules = [];
    walkCss(read(file), mq => mediaAppliesAt(mq, width, pointerFine), file, rules);
    for (const rule of rules) {
      const d = displayDecl(rule.body);
      if (!d) continue;
      for (const sel of splitSelectors(rule.selectors)) {
        if (selectorMatches(sel, railRefreshPath)) decls.push({ sel, file, ...d, spec: specificity(sel) });
      }
    }
  }
  let win = null;
  for (const d of decls) {
    if (!win) { win = d; continue; }
    if (d.important !== win.important) { if (d.important) win = d; continue; }
    const c = cmpSpec(d.spec, win.spec);
    if (c > 0 || c === 0) win = d;
  }
  return { win, decls };
}

test('desktop #rail-refresh hide beats later #rail .rail-foot button display:grid', () => {
  assert.ok(cmpSpec(specificity('#rail .rail-foot button#rail-refresh'), specificity('#rail .rail-foot button')) > 0);
  const { win, decls } = winningDisplay(1440, true);
  assert.ok(win, 'expected a display rule for #rail-refresh at 1440');
  assert.equal(win.value, 'none', 'winning display at 1440 should be none, got ' + JSON.stringify(win) + ' from ' + JSON.stringify(decls));
});

test('phone CSS is unchanged: #rail-refresh is not forced to display:none at 390', () => {
  const { win } = winningDisplay(390, false);
  if (win) assert.notEqual(win.value, 'none', 'phone #rail-refresh winning display is ' + JSON.stringify(win));
});
