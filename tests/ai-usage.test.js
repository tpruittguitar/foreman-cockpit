const test = require('node:test'), assert = require('node:assert/strict');
const U = require('../pipeline-ai-usage.js');
const line = o => JSON.stringify(Object.assign({ status: 'OK', windowHours: 168 }, o));
const NOW = Date.parse('2026-10-13T20:00:00Z');

test('single reading uses the average since the window started', () => {
  const r = U.parse(line({ at: '2026-10-13T19:40:00Z', provider: 'CLAUDE', meter: 'weekly', label: 'weekly', usedPct: 64, resetsAt: '2026-10-18T16:00:00Z' }));
  const [p] = U.project(r, NOW);
  assert.equal(p.verdict, 'BEFORE_RESET');
  assert.ok(Math.abs(p.rate - 64 / 51.67) < 0.01);
  assert.ok(p.runOutAt > Date.parse('2026-10-15T00:00:00Z') && p.runOutAt < Date.parse('2026-10-15T01:30:00Z'), 'about 29 h after the reading');
});

test('two readings 2+ hours apart give a measured rate; a later quieter rate can last to reset', () => {
  const r = U.parse([
    line({ at: '2026-10-13T19:40:00Z', provider: 'CLAUDE', meter: 'weekly', usedPct: 64, resetsAt: '2026-10-18T16:00:00Z' }),
    line({ at: '2026-10-14T01:40:00Z', provider: 'CLAUDE', meter: 'weekly', usedPct: 65.5, resetsAt: '2026-10-18T16:00:00Z' }),
  ].join('\n'));
  const [p] = U.project(r, Date.parse('2026-10-14T02:00:00Z'));
  assert.equal(p.rate, 0.25); assert.equal(p.verdict, 'LASTS'); assert.match(p.basis, /last 6 h/);
});

test('100% is OUT; failed reading and passed reset are flagged, never projected', () => {
  const r = U.parse([
    line({ at: '2026-10-13T19:41:00Z', provider: 'GROK', meter: 'weekly', usedPct: 100, resetsAt: '2026-10-19T08:30:00Z' }),
    line({ at: '2026-10-13T19:41:00Z', provider: 'CHATGPT', meter: 'weekly', usedPct: 0, status: 'SIGN_IN_NEEDED', resetsAt: '' }),
    line({ at: '2026-10-11T19:41:00Z', provider: 'CHATGPT', meter: '5-hour', usedPct: 100, windowHours: 5, resetsAt: '2026-10-11T21:00:00Z' }),
    'not json', '',
  ].join('\n'));
  const by = Object.fromEntries(U.project(r, NOW).map(p => [p.provider + p.meter, p.verdict]));
  assert.deepEqual(by, { GROKweekly: 'OUT', CHATGPTweekly: 'NO_READING', 'CHATGPT5-hour': 'RESET_PASSED' });
  const h = U.html(U.project(r, NOW));
  assert.match(h, /OUT/); assert.match(h, /NO READING/); assert.match(h, /100%/);
});

test('rendering keeps the exact number and a text status beside every bar', () => {
  const p = U.project(U.parse(line({ at: '2026-10-13T19:40:00Z', provider: 'CHATGPT', meter: 'weekly', label: 'weekly', usedPct: 47, resetsAt: '2026-10-20T04:40:00Z' })), NOW);
  const h = U.html(p);
  assert.match(h, />47%</); assert.match(h, /LASTS TO RESET|RUNS OUT BEFORE RESET/); assert.match(h, /aria-label=/);
  assert.match(U.html([]), /No usage readings yet/);
});

test('load reads the GitHub contents API first and falls back to raw on refusal', async () => {
  const U = require('../pipeline-ai-usage.js');
  const line = '{"at":"2026-10-14T04:04:05Z","provider":"CLAUDE","meter":"weekly","label":"weekly (all models)","usedPct":75,"resetsAt":"2026-10-18T16:00:00Z","windowHours":168,"status":"OK","source":"x"}\n';
  const calls = [];
  const ok = (url, o) => { calls.push([url, o && o.headers && o.headers.Accept]); return Promise.resolve({ ok: true, text: () => Promise.resolve(line) }); };
  const r1 = await U.load(ok);
  assert.equal(calls[0][0], U.API_URL); assert.equal(calls[0][1], 'application/vnd.github.raw'); assert.equal(r1.length, 1);
  const calls2 = [];
  const limited = (url) => { calls2.push(url); return Promise.resolve(url === U.API_URL ? { ok: false, status: 403 } : { ok: true, text: () => Promise.resolve(line) }); };
  const r2 = await U.load(limited);
  assert.deepEqual(calls2, [U.API_URL, U.URL]); assert.equal(r2.length, 1);
});
