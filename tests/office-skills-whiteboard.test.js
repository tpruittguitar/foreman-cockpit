// Training whiteboard cycles real skills (office/skills.json) and falls back to the old lines only if it can't load.
// Run: node --test tests/office-skills-whiteboard.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const L = require('../office/office-logic.js');
const skills = JSON.parse(fs.readFileSync(path.join(__dirname, '../office/skills.json'), 'utf8'));

// draw.js is a browser ES module: load it in a sandbox with imports/exports stripped and a recording canvas context.
function loadDraw() {
  let src = fs.readFileSync(path.join(__dirname, '../office/draw.js'), 'utf8').replace(/^import .*$/mg, '').replace(/^export (async )?(function|const|let)/mg, '$1$2');
  const names = [...src.matchAll(/^(?:async )?function (\w+)/mg)].map(m => m[1]);
  const sb = { window: { OfficeLogic: L }, Math, Date, String, Object, Array, Number, JSON, Set, Map };
  vm.runInNewContext(src + '\n' + names.map(n => `this.${n}=${n};`).join(''), sb);
  return sb;
}
const D = loadDraw();
function rec() { const t = []; const ctx = new Proxy({ font: '', fillStyle: '', measureText: s => ({ width: String(s).length * 5 }), fillText: s => t.push(s), fillRect() {}, strokeRect() {} }, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } }); return { ctx, t }; }

test('skills.json: every skill has a title and 3 short bullets, no secrets/paths', () => {
  assert.ok(skills.length >= 6);
  for (const s of skills) {
    assert.ok(s.slug && s.title); assert.equal(s.bullets.length, 3);
    for (const b of s.bullets) { assert.ok(b.length > 0 && b.length <= 32, b); assert.doesNotMatch(b, /\/home|token|key=|secret/i); }
  }
});
test('skillSlide advances one skill every 10 s, wraps, and shows a counter', () => {
  const t0 = 1_700_000_000_000, a = L.skillSlide(skills, t0), b = L.skillSlide(skills, t0 + L.SKILL_CYCLE_MS);
  assert.equal(L.SKILL_CYCLE_MS, 10000);
  assert.equal(L.skillSlide(skills, t0 + 9000).index, a.index); // same skill within the window... (if t0 is on a boundary edge the next line guards it)
  assert.equal(b.index, (a.index + 1) % skills.length);
  assert.equal(L.skillSlide(skills, t0 + skills.length * L.SKILL_CYCLE_MS).index, a.index);
  assert.match(a.title, /^Skill: /); assert.match(a.counter, new RegExp('^\\d+/' + skills.length + '$')); assert.equal(a.bullets.length, 3);
});
test('every skill is shown over a full cycle', () => {
  const seen = new Set(); for (let i = 0; i < skills.length; i++) seen.add(L.skillSlide(skills, i * 10000).title);
  assert.equal(seen.size, skills.length);
});
test('fallback: no/invalid skills => null slide and old lines drawn', () => {
  assert.equal(L.parseSkills(null), null); assert.equal(L.parseSkills({}), null); assert.equal(L.parseSkills([]), null); assert.equal(L.parseSkills([{ title: '' }]), null);
  assert.equal(L.skillSlide(null, 1), null); assert.equal(L.skillSlide([], 1), null);
  const r = rec(); D.drawWhiteboard(r.ctx, 512, 256, { meeting: null, skill: L.skillSlide(L.parseSkills(null), 5) });
  assert.deepEqual(r.t, ['New skills', '✓ read the task twice', '✓ small PRs, green checks', '✓ ask Tim early']);
});
test('skill slide draws title, bullets and counter; a meeting still wins', () => {
  const sl = L.skillSlide(skills, 0), r = rec(); D.drawWhiteboard(r.ctx, 512, 256, { meeting: null, skill: sl });
  assert.deepEqual(r.t, [sl.title, ...sl.bullets.map(b => '✓ ' + b), sl.counter]);
  const m = rec(); D.drawWhiteboard(m.ctx, 512, 256, { meeting: { title: 'Standup', seated: ['QA'] }, skill: sl });
  assert.equal(m.t[0], 'Standup'); assert.ok(!m.t.includes(sl.counter));
});

test('office.js loads skills.json next to itself, not relative to the page (/office -> /skills.json was a 404)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
  assert.match(src, /fetch\(new URL\('skills\.json', import\.meta\.url\)/);
  assert.doesNotMatch(src, /fetch\('skills\.json'/);
});
