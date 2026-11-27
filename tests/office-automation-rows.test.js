// brief_office7 item 3: the Automations wall board shows one row per automation with a simplified result (OK / FAIL / SKIPPED),
// last ran (ET) and a live countdown to the next run, from control/AUTOMATIONS_STATUS.json. Run: node --test tests/office-automation-rows.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
const L = require('../office/office-logic.js');
let D;
test.before(async () => {
  globalThis.window = { OfficeLogic: L };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-draw-'));
  for (const f of ['draw.js', 'avatars.js']) fs.copyFileSync(path.join(__dirname, '../office', f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  D = await import(pathToFileURL(path.join(dir, 'draw.js')).href);
});
function fakeCtx() {
  const texts = [], rects = [];
  return { font: '', fillStyle: '', textAlign: 'left', texts, rects,
    measureText(t) { const px = Number((/(\d+(?:\.\d+)?)px/.exec(this.font) || [0, 10])[1]); return { width: String(t).length * px * 0.55 }; },
    fillText(t, x, y) { texts.push({ t, x, y, right: x + this.measureText(t).width }); }, fillRect(x, y, w, h) { rects.push({ x, y, w, h, color: this.fillStyle }); }, strokeRect() {}, beginPath() {}, arc() {}, fill() {} };
}
const NOW = Date.parse('2026-11-18T05:30:00Z'), MIN = 60000, iso = ms => new Date(ms).toISOString();
const STATUS = { generated_at: iso(NOW - 2 * MIN), automations: [
  { ai: 'ChatGPT', name: 'usage reader', result: 'success', last_run_at: iso(Date.parse('2026-11-18T05:05:00Z')), next_run_at: iso(NOW + 12 * MIN + 3000), est_per_run: '0 calls, 48 s', est_week: '0 calls, 2.2 h' },
  { ai: 'Claude', name: 'intake', result: 'failure', last_run_at: iso(NOW - 3 * 60 * MIN), next_run_at: iso(NOW + 90 * MIN) },
  { ai: 'Grok', name: 'helper', result: 'skipped', last_run_at: iso(NOW - 10 * MIN), next_run_at: iso(NOW + 26 * 60 * MIN) },
  { ai: 'Gauge', name: 'audit', result: 'failure', last_run_at: 'never', next_run_at: '', running: true, started_at: iso(NOW - MIN) }] };

test('rows: simplified result, last ran in ET, countdown to the next run', () => {
  const rows = L.automationBoardRows(L.parseAutomations(STATUS, NOW), NOW);
  assert.deepEqual(rows.map(r => r.label), ['ChatGPT · usage reader', 'Claude · intake', 'Grok · helper', 'Gauge · audit']);
  assert.deepEqual(rows.map(r => r.result), ['OK', 'FAIL', 'SKIPPED', 'never run']);
  assert.equal(rows[0].last, '12:05 AM ET');
  assert.equal(rows[3].last, 'never');
  assert.deepEqual(rows.map(r => r.next), ['in 12m 03s', 'in 1h 30m', 'in 1d 2h', 'running now']);
});
test('countdown is live (seconds tick) and a missed run reads overdue', () => {
  const r = L.parseAutomations(STATUS, NOW).rows[0];
  assert.equal(L.nextRunText(r, NOW + 1000), 'in 12m 02s');
  assert.equal(L.nextRunText(r, NOW + 13 * MIN), 'overdue');
  const stale = L.parseAutomations({ automations: [{ ai: 'Grok', name: 'x', result: 'ok', last_run_at: iso(NOW - 30 * 60 * MIN), next_run_at: iso(NOW - 18 * 60 * MIN) }] }, NOW);
  assert.equal(L.automationBoardRows(stale, NOW)[0].result, 'FAIL', 'STALE (missed runs) is never OK');
});
test('the wall board draws one row per automation with headers, and the board redraws every second', () => {
  const c = fakeCtx();
  D.drawAutomations(c, 1024, 625, { auto: L.parseAutomations(STATUS, NOW), err: '', now: NOW, demo: false });
  const t = c.texts.map(x => x.t);
  for (const h of ['Automation', 'Result', 'Last ran', 'Last run by', 'Next run', 'est. / run']) assert.ok(t.includes(h), h);
  for (const v of ['ChatGPT · usage reader', 'OK', 'FAIL', 'SKIPPED', 'never run', '12:05 AM ET', 'in 12m 03s', 'running now']) assert.ok(t.includes(v), v);
  assert.ok(!t.includes('runs / hour'), 'the timeline moved to the click panel');
  const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
  assert.match(office, /else if \(clock - autosAt >= 1\) drawAutos\(\);/);
});

test('wall shows only per-run estimates, within the right edge', () => {
  const rows = L.automationBoardRows(L.parseAutomations(STATUS, NOW), NOW);
  assert.equal(rows[0].estRun, '0 calls, 48 s');
  assert.equal(rows[1].estRun, '—');
  const c = fakeCtx();
  D.drawAutomations(c, 1024, 625, { auto: L.parseAutomations(STATUS, NOW), err: '', now: NOW, demo: false });
  const t = c.texts.map(x => x.t);
  assert.ok(t.includes('est. / run') && !t.includes('est. / week'));
  assert.ok(t.includes('0 calls, 48 s') && !t.includes('0 calls, 2.2 h'));
  assert.ok(c.texts.find(x => x.t === '0 calls, 48 s').right <= 1008);
  assert.equal(t.filter(x => x === 'FAIL').length, 1, 'only the recorded failure shows FAIL');
  const badge = c.texts.find(x => x.t === 'never run');
  assert.ok(c.rects.some(r => r.color === '#8b9099' && r.x < badge.x && badge.x < r.x + r.w && r.y < badge.y && badge.y < r.y + r.h));
  assert.ok(t.filter(x => x === '—').length >= 2, 'missing estimates render as —');
});
test('all 15 source rows paint, including FORGE_CLAUDE_SHARED_HELPER, with no +N more', () => {
  const autos = { generated_at: iso(NOW - 2 * MIN), automations: Array.from({ length: 15 }, (_, i) => ({
    ai: i === 14 ? 'Claude' : 'Bot' + (i + 1),
    name: i === 14 ? 'FORGE_CLAUDE_SHARED_HELPER' : 'job' + (i + 1),
    result: 'success', last_run_at: iso(NOW - MIN), next_run_at: iso(NOW + 10 * MIN)
  })) };
  const parsed = L.parseAutomations(autos, NOW);
  const rows = L.automationBoardRows(parsed, NOW);
  assert.equal(rows.length, 15);
  const c = fakeCtx();
  D.drawAutomations(c, 1024, 626, { auto: parsed, err: '', now: NOW, demo: false });
  const t = c.texts.map(x => x.t);
  for (const r of rows) assert.ok(t.includes(r.label), 'painted ' + r.label);
  assert.ok(t.some(x => String(x).includes('FORGE_CLAUDE_SHARED_HELPER')));
  assert.ok(!t.some(x => /\+\d+ more/.test(String(x))), 'no +N more: ' + JSON.stringify(t.filter(x => /more/.test(String(x)))));
  const ys = c.texts.filter(x => rows.some(r => r.label === x.t)).map(x => x.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] > ys[i - 1], 'row labels do not overlap: ' + JSON.stringify(ys));
});

test('Last run by comes from evidence, or a dash when missing; Any is not a runner name', () => {
  const rows = L.automationBoardRows(L.parseAutomations(STATUS, NOW), NOW);
  assert.equal(rows[0].lastBy, 'ChatGPT');
  assert.equal(rows[1].lastBy, 'Claude');
  assert.equal(rows[3].lastBy, '—', 'no last_run_at -> dash, not Gauge');
  const anyRan = L.parseAutomations({ automations: [
    { ai: 'Any', name: 'health', result: 'SKIP', last_run_at: iso(NOW - 10 * MIN), last_run_by: '' }
  ] }, NOW);
  assert.equal(L.automationBoardRows(anyRan, NOW)[0].lastBy, '—');
  const named = L.parseAutomations({ automations: [
    { ai: 'Any', name: 'posting', result: 'STALE', last_run_at: iso(NOW - 10 * MIN), last_run_by: 'ChatGPT' }
  ] }, NOW);
  assert.equal(L.automationBoardRows(named, NOW)[0].lastBy, 'ChatGPT');
  const c = fakeCtx();
  D.drawAutomations(c, 1024, 625, { auto: L.parseAutomations(STATUS, NOW), err: '', now: NOW, demo: false });
  const t = c.texts.map(x => x.t);
  assert.ok(t.includes('Last run by'));
  assert.ok(t.includes('ChatGPT'));
  assert.ok(t.includes('—'));
});

test('paused rows paint as PAUSED grey, not FAIL, even when the feed marks them STALE', () => {
  const parsed = L.parseAutomations({ automations: [
    { ai: 'Any', name: 'FORGE_AI_USAGE_READER', result: 'STALE', last_run_at: '', stale: true, runs_per_week: 0, paused: true, est_week: '0' }
  ] }, NOW);
  assert.equal(parsed.rows[0].result, 'PAUSED');
  assert.equal(parsed.rows[0].paused, true);
  const row = L.automationBoardRows(parsed, NOW)[0];
  assert.equal(row.result, 'PAUSED');
  assert.equal(row.paused, true);
  assert.equal(row.lastBy, '—');
  const c = fakeCtx();
  D.drawAutomations(c, 1024, 625, { auto: parsed, err: '', now: NOW, demo: false });
  const t = c.texts.map(x => x.t);
  assert.ok(t.includes('PAUSED'));
  assert.ok(!t.includes('FAIL'));
});
