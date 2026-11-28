const test = require('node:test'), assert = require('node:assert/strict');
const U = require('../pipeline-ai-usage.js');
const line = o => JSON.stringify(Object.assign({ status: 'OK', windowHours: 168 }, o));
const NOW = Date.parse('2026-10-13T20:00:00Z');

const RESET = '2026-10-18T16:00:00Z';
const sample = (hour, usedPct, resetsAt = RESET) => ({
  at: `2026-10-13T${hour}:00Z`, provider: 'CLAUDE', meter: 'weekly', usedPct, resetsAt
});

test('weekly projection never substitutes short, long, or since-reset rates', () => {
  const latest = sample('20:00', 64);
  for (const previous of [[], [sample('18:00', 62)], [sample('14:00', 50)],
    [sample('17:00', 50, '2026-10-13T18:00:00Z')]]) {
    const [p] = U.project([...previous, latest], NOW);
    assert.equal(p.verdict, 'UNKNOWN');
    assert.equal(p.rate, null);
    assert.equal(p.runOutAt, null);
  }
});

test('weekly projection uses the exact 3h boundary or interpolates it', () => {
  const latest = sample('20:00', 64);
  const exact = [sample('14:00', 20), sample('17:00', 58), latest];
  const irregular = [sample('14:00', 20), sample('16:00', 56), sample('18:00', 60), latest];
  for (const readings of [exact, irregular]) {
    const [p] = U.project(readings, NOW);
    assert.equal(p.rate, 2);
    assert.equal(p.runOutAt, Date.parse('2026-10-14T14:00:00Z'));
    assert.equal(p.verdict, 'BEFORE_RESET');
    assert.equal(p.basis, '3-hour moving average');
  }
});

test('100% is OUT; failed reading and passed reset are flagged, never projected', () => {
  const r = U.parse([
    line({ at: '2026-10-13T19:41:00Z', provider: 'GROK', meter: 'weekly', usedPct: 100, resetsAt: '2026-10-19T08:30:00Z' }),
    line({ at: '2026-10-13T19:41:00Z', provider: 'CHATGPT', meter: 'weekly', usedPct: 0, status: 'SIGN_IN_NEEDED', resetsAt: '' }),
    line({ at: '2026-10-11T19:41:00Z', provider: 'CLAUDE', meter: 'weekly', usedPct: 100, resetsAt: '2026-10-11T21:00:00Z' }),
    'not json', '',
  ].join('\n'));
  const by = Object.fromEntries(U.project(r, NOW).map(p => [p.provider + p.meter, p.verdict]));
  assert.deepEqual(by, { CLAUDEweekly: 'RESET_PASSED', CHATGPTweekly: 'NO_READING', GROKweekly: 'OUT' });
  const h = U.html(U.project(r, NOW));
  assert.match(h, /OUT/); assert.match(h, /projection unavailable/); assert.match(h, /100%/);
});

test('mixed legacy history renders exactly three weekly bars and preserves weekly projections', () => {
  const weekly = ['CLAUDE', 'GROK', 'CHATGPT'].map((provider, i) => ({
    at: '2026-10-13T19:40:00Z', provider, meter: 'weekly', label: 'weekly',
    usedPct: i * 47, resetsAt: '2026-10-18T16:00:00Z', status: 'OK', windowHours: 168
  }));
  const legacy = [
    { provider: 'CLAUDE', meter: 'session', label: 'current session', windowHours: 5 },
    { provider: 'GROK', meter: 'bot', label: 'weekly Grok Bot', windowHours: 168 },
    { provider: 'CHATGPT', meter: '5-hour', label: '5-hour (Codex/Work/agents)', windowHours: 5 }
  ].map(r => Object.assign({}, weekly[0], r, { at: '2026-10-13T19:50:00Z', usedPct: null, status: 'UNREADABLE' }));
  const readings = U.parse(weekly.concat(legacy).map(line).join('\n'));
  assert.equal(readings.length, 6, 'history remains available without deleting legacy rows');
  const p = U.project(readings, NOW);
  assert.deepEqual(p, U.project(weekly, NOW), 'weekly percentages, reset times, projections and verdicts are unchanged');
  assert.equal(p.length, 3);
  assert.ok(p.every(r => r.meter === 'weekly'));
  const h = U.html(p);
  assert.equal((h.match(/class="aiu-track"/g) || []).length, 3);
  assert.doesNotMatch(h, /current session|Grok Bot|5-hour|projection unavailable/);
  assert.deepEqual(U.project(legacy, NOW), []);
});

test('rendering keeps the exact number and a text status beside every bar', () => {
  const p = U.project(U.parse(line({ at: '2026-10-13T19:40:00Z', provider: 'CHATGPT', meter: 'weekly', label: 'weekly', usedPct: 47, resetsAt: '2026-10-20T04:40:00Z' })), NOW);
  const h = U.html(p);
  assert.match(h, />47%</); assert.match(h, /NEED 3H HISTORY/); assert.match(h, /aria-label=/);
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

test('optional pool lines render under the bar only when fields are present', () => {
  const credit = { est_left_usd: 38.90, grant_usd: 41, expires: '2026-11-30', verified_left_usd: null };
  const chatgpt = U.parse(line({
    at: '2026-10-13T19:40:00Z', provider: 'CHATGPT', meter: 'weekly', label: 'weekly',
    usedPct: 47, resetsAt: '2026-10-20T04:40:00Z', openaiCredit: credit,
    resets_available: 0, resets_expire: null, extra_usd: null
  }));
  const hChat = U.html(U.project(chatgpt, NOW));
  assert.match(hChat, /API credit: ~\$38\.90 of \$41 left · expires Nov 30/);
  assert.match(hChat, /Resets: 0 · Extra: none/);
  const verified = Object.assign({}, credit, { verified_left_usd: 40.12 });
  const hVer = U.html(U.project(U.parse(line({
    at: '2026-10-13T19:40:00Z', provider: 'CHATGPT', meter: 'weekly', label: 'weekly',
    usedPct: 47, resetsAt: '2026-10-20T04:40:00Z', openaiCredit: verified
  })), NOW));
  assert.match(hVer, /API credit: \$40\.12 of \$41 left · expires Nov 30/);
  assert.doesNotMatch(hVer, /~/);
  const claude = U.parse(line({
    at: '2026-10-13T19:40:00Z', provider: 'CLAUDE', meter: 'weekly', label: 'weekly',
    usedPct: 47, resetsAt: '2026-10-20T04:40:00Z', openaiCredit: credit,
    resets_available: 1, resets_expire: '2026-12-10', extra_usd: null
  }));
  const hClaude = U.html(U.project(claude, NOW));
  assert.match(hClaude, /Resets: 1 \(expires Dec 10\) · Extra: none/);
  assert.doesNotMatch(hClaude, /API credit:/);
  const grok = U.parse(line({
    at: '2026-10-13T19:40:00Z', provider: 'GROK', meter: 'weekly', label: 'weekly',
    usedPct: 47, resetsAt: '2026-10-20T04:40:00Z',
    resets_available: null, resets_expire: null, extra_usd: 4.70
  }));
  assert.match(U.html(U.project(grok, NOW)), /Resets: none · Extra: \$4\.70/);
  const bare = U.parse(line({
    at: '2026-10-13T19:40:00Z', provider: 'CHATGPT', meter: 'weekly', label: 'weekly',
    usedPct: 47, resetsAt: '2026-10-20T04:40:00Z'
  }));
  const hBare = U.html(U.project(bare, NOW));
  assert.doesNotMatch(hBare, /API credit:/);
  assert.doesNotMatch(hBare, /Resets:/);
});

test('Claude 5-hr window is a text line under the bar, never a second bar', () => {
  const reset = '2026-10-14T04:49:00.000Z'; // 12:49 AM ET (EDT, UTC-4)
  const now = Date.parse('2026-10-13T20:00:00Z');
  const weekly = U.parse(line({
    at: '2026-10-13T19:40:00Z', provider: 'CLAUDE', meter: 'weekly', label: 'weekly',
    usedPct: 47, resetsAt: '2026-10-18T16:00:00Z'
  }));
  const session = U.parse([
    line({ at: '2026-10-13T19:40:00Z', provider: 'CLAUDE', meter: 'weekly', label: 'weekly', usedPct: 47, resetsAt: '2026-10-18T16:00:00Z' }),
    JSON.stringify({ at: '2026-10-13T19:45:00Z', provider: 'CLAUDE', meter: 'session', label: 'current session', usedPct: 4, resetsAt: reset, windowHours: 5, status: 'OK' })
  ].join('\n'));
  assert.equal(U.fiveHourLine({ fiveHour: { usedPct: 4, resetsAt: reset } }, now), '5-hr window: 4% used · resets 12:49 AM ET');
  assert.equal(U.fiveHourLine({ fiveHour: { usedPct: 100, resetsAt: reset } }, now), '5-hr window: FULL, stopped · resets 12:49 AM ET');
  assert.equal(U.fiveHourLine({ fiveHour: { usedPct: 142, resetsAt: reset } }, now), '5-hr window: FULL, stopped · resets 12:49 AM ET');
  assert.equal(U.fiveHourLine({ fiveHour: { usedPct: 4, resetsAt: reset } }, Date.parse('2026-10-14T06:00:00Z')), '');
  assert.equal(U.fiveHourLine({}, now), '');
  const p = U.project(session, now);
  assert.equal(p.length, 1);
  assert.equal(p[0].meter, 'weekly');
  assert.equal(p[0].usedPct, 47);
  assert.equal(p[0].fiveHour.usedPct, 4);
  const h = U.html(p, now);
  assert.match(h, /5-hr window: 4% used · resets 12:49 AM ET/);
  assert.equal((h.match(/class="aiu-track"/g) || []).length, 1);
  assert.doesNotMatch(h, /aiu-track[^>]*>[^<]*5-hr/);
  const hWeekly = U.html(U.project(weekly, now), now);
  assert.doesNotMatch(hWeekly, /5-hr window:/);
  const fields = U.parse(line({
    at: '2026-10-13T19:40:00Z', provider: 'CLAUDE', meter: 'weekly', label: 'weekly',
    usedPct: 47, resetsAt: '2026-10-18T16:00:00Z', fiveHourUsedPct: 100, fiveHourResetsAt: reset
  }));
  const hFull = U.html(U.project(fields, now), now);
  assert.match(hFull, /5-hr window: FULL, stopped · resets 12:49 AM ET/);
  assert.equal((hFull.match(/class="aiu-track"/g) || []).length, 1);
});

test('weekly projection is unavailable when there are no good readings', () => {
  const reading = { at: '2026-10-13T19:40:00Z', provider: 'GROK', meter: 'weekly' };
  for (const sample of [{ usedPct: null, status: 'CHROME_UNAVAILABLE' }, {}, { usedPct: 0, status: 'CHROME_UNAVAILABLE' }]) {
    const rows = U.project(U.parse([line({ ...reading, at: '2026-10-13T18:40:00Z', status: 'UNREADABLE' }), line({ ...reading, ...sample })].join('\n')), NOW);
    assert.equal(rows[0].usedPct, null);
    assert.equal(rows[0].verdict, 'NO_READING');
    assert.match(U.html(rows, NOW), /projection unavailable/);
    assert.equal(U.brief(rows[0]), 'projection unavailable');
    assert.doesNotMatch(U.html(rows, NOW), /0% used|aiu-track/);
  }
  const zero = U.project(U.parse(line({ ...reading, usedPct: 0, status: 'OK' })), NOW);
  assert.equal(zero[0].usedPct, 0);
  assert.match(U.html(zero, NOW), /0% used/);
});

test('weekly projection keeps the most recent good reading after a failed attempt', () => {
  const good = [sample('15:00', 58), sample('18:00', 64)];
  const expected = U.project(good, NOW);
  assert.equal(expected[0].verdict, 'BEFORE_RESET');
  for (const failed of [
    { ...sample('20:00', 99), status: 'UNREADABLE' },
    { ...sample('20:00', 99), error: 'read failed' },
    sample('20:00', undefined)
  ]) {
    const rows = U.project([failed, good[1], good[0]], NOW);
    assert.deepEqual(rows, expected);
    assert.match(U.html(rows, NOW), /RUNS OUT BEFORE RESET/);
    assert.match(U.brief(rows[0]), /^runs out ~/);
  }
});
