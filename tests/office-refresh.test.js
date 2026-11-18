// ⟳ Refresh (QA failed #381): one click re-fetches every office data source, cache-busted, and every board redraws with
// its fetched-at time. Mocked fetch only; nothing here reaches production. Run: node --test tests/office-refresh.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const L = require('../office/office-logic.js');
const NOW = Date.parse('2026-11-17T03:15:00Z');
const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
const SOURCES = {
  status: 'https://raw.githubusercontent.com/tpruittguitar/forge-coordination/main/control/OFFICE_STATUS.json',
  readings: 'https://raw.githubusercontent.com/tpruittguitar/forge-coordination/main/usage/AI_USAGE_READINGS.jsonl',
  automations: 'https://raw.githubusercontent.com/tpruittguitar/forge-coordination/main/control/AUTOMATIONS_STATUS.json',
  pipelineHealth: '/api/pipeline-health',
  writerActivity: '/api/writer-activity',
  screens: 'https://raw.githubusercontent.com/tpruittguitar/office-screens/main/index.json'
};
const res = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => body });

test('a Refresh click fetches every office source with cache busting and applies each one', async () => {
  const calls = [], applied = [], sources = {};
  for (const [k, url] of Object.entries(SOURCES)) sources[k] = { url, apply: (t, now) => applied.push([k, t, now]), fail: () => assert.fail(k + ' should not fail') };
  const got = await L.refreshSources(sources, async (u, o) => { calls.push([u, o]); return res(200, '{"ok":1}'); }, NOW);
  assert.deepEqual(calls.map(c => c[0]).sort(), Object.values(SOURCES).map(u => u + '?t=' + NOW).sort());
  for (const [, o] of calls) assert.equal(o.cache, 'no-store');
  assert.deepEqual(applied.map(a => a[0]).sort(), Object.keys(SOURCES).sort());
  for (const k of Object.keys(SOURCES)) assert.deepEqual(got[k], { ok: true, at: NOW }, k + ' gets a fetched-at time');
});
test('one failing source keeps its own error state and never blocks the others', async () => {
  const applied = [], failed = [], sources = {};
  for (const [k, url] of Object.entries(SOURCES)) sources[k] = { url: url + '?ref=main', apply: () => applied.push(k), fail: (e, st) => failed.push([k, e, st]) };
  const got = await L.refreshSources(sources, async u => (u.startsWith('/api/pipeline-health') ? res(500, '') : u.includes('index.json') ? res(200, 'not json') : res(200, '{}')), NOW);
  assert.deepEqual(failed.sort(), [['pipelineHealth', 'HTTP 500', 500]]);
  assert.deepEqual(applied.sort(), Object.keys(SOURCES).filter(k => k !== 'pipelineHealth').sort(), 'every other source still applied');
  assert.equal(got.pipelineHealth.ok, false); assert.equal(got.status.ok, true);
  const bad = await L.refreshSources({ screens: { url: 'x', apply: t => JSON.parse(t), fail: (e) => failed.push(e) } }, async () => res(200, 'nope'), NOW);
  assert.deepEqual(bad.screens, { ok: false, error: 'not valid JSON' });
});
test('office.js wires Refresh to every source and stamps every board with its fetched-at time', () => {
  const block = office.slice(office.indexOf('const REFRESH = {'), office.indexOf('async function refreshNow'));
  for (const k of Object.keys(SOURCES)) assert.match(block, new RegExp('\\n  ' + k + ': \\{ url: '), k + ' is in the Refresh table');
  for (const u of ['RAW_FILE(STATUS_PATH)', 'READINGS_URL', 'RAW_FILE(AUTO_PATH)', "'/api/pipeline-health'", "'/api/writer-activity'", "SCREENS_BASE + 'index.json'"]) assert.ok(block.includes('url: ' + u), u);
  assert.match(office, /\$\('refresh-btn'\)\.onclick = [^\n]*classList\.add\('busy'\)[^\n]*refreshNow\(\)/);
  assert.match(office, /L\.refreshSources\(REFRESH, fetchFn, Date\.now\(\)\)/);
  assert.match(office, /drawAutomations\([^\n]*fetchedAt: S\.fetched\.automations(, boardM: autos\.w)? \}\)/, 'drawAutomations shows fetched-at in its header');
  for (const board of ['drawBoard', 'drawUsage', 'drawWriterHealth', 'drawConstraintWall']) assert.match(office, new RegExp(board + '\\([^\\n]*\\); drawFetched\\('), board + ' shows fetched-at');
  assert.match(office, /drawTrainingSchedule\([^\n]*fetchedAt: S\.fetched\.training, boardM: schedule\.w \}\)/, 'schedule board shows fetched-at');
  assert.match(office, /'Refresh · ' \+ L\.dataAge\(/, 'button says "updated just now" and then ages');
});
