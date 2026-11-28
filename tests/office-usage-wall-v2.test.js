'use strict';
// cs-fd8af329: v2 AI USAGE wall. Claude Duet credit as a second bar on the Claude row, DeepSeek as a fourth Other Limits column,
// wrapped labels (no ellipsis), last good amounts with their age. Sample rows are the card's proposed feed shapes, not live numbers.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
const L = require('../office/office-logic.js');
const HOUR = 3600000;
const NOW = Date.parse('2026-11-25T03:00:00-05:00');
const claude = { at: '2026-11-24T22:00:00-05:00', provider: 'CLAUDE', meter: 'weekly', label: 'Weekly', status: 'OK', usedPct: 100, resetsAt: '2026-11-29T16:00:00Z' };
const duet = { at: '2026-11-24T22:07:00-05:00', provider: 'CLAUDE_DUET', meter: 'weekly_promo_credit', label: 'Duet credit', status: 'OK', used_usd: 19.8, left_usd: 480.2,
  weekly_cap_usd: 500.0, resetsAt: '2026-11-29T16:00:00Z', total_cap_usd: 3000.0, total_until: '2026-12-31', unused_expires_weekly: true, source: 'claude.ai settings/usage' };
const deepseek = { at: '2026-11-24T21:14:26-05:00', provider: 'DEEPSEEK', meter: 'api_balance', label: 'DeepSeek', status: 'OK', currency: 'USD', total_balance: 12.34,
  granted_balance: 10.0, topped_up_balance: 2.34, source: 'deepseek balance api' };
const parse = (...rows) => L.parseReadings(rows.map(r => JSON.stringify(r)).join('\n'));
const later = (r, h, extra) => Object.assign({}, r, { at: new Date(Date.parse(r.at) + h * HOUR).toISOString() }, extra);

test('Duet credit row: label, promo terms, fill by used ($19.80 of $500 = 3.96%)', () => {
  const d = L.usageRows(parse(claude, duet), NOW, null)[0].duet;
  assert.equal(d.missing, false);
  assert.equal(d.label, 'Duet credit · $19.80 of $500 used');
  assert.equal(Math.round(d.pct_used * 100) / 100, 3.96);
  assert.deepEqual(d.terms, ['$500 each week · $3,000 total cap to Dec 31, 2026', 'Unused credit expires weekly · renews Sun 11 AM ET']);
  assert.match(d.measured, /^Measured 10:07 PM ET$/);
  assert.equal(d.failed, undefined);
});

test('Duet used comes from cap - left when used_usd is missing', () => {
  const d = L.usageRows(parse(claude, Object.assign({}, duet, { used_usd: undefined })), NOW, null)[0].duet;
  assert.equal(d.label, 'Duet credit · $19.80 of $500 used');
  assert.ok(Math.abs(d.pct_used - 3.96) < 1e-9);
  const terms = L.usageRows(parse(claude, Object.assign({}, duet, { total_cap_usd: undefined, total_until: undefined, unused_expires_weekly: undefined })), NOW, null)[0].duet.terms;
  assert.deepEqual(terms, ['$500 each week', 'Renews Sun 11 AM ET'], 'only the terms the row carries');
});

test('no CLAUDE_DUET row: the weekly plan still shows, Duet says no reading yet, no hard-coded amount', () => {
  const row = L.usageRows(parse(claude), NOW, null)[0];
  assert.equal(row.pct_used, 100);
  assert.deepEqual(row.duet, { missing: true, pct_used: null, label: 'Duet credit · no reading yet', terms: [], stale: false });
  assert.doesNotMatch(JSON.stringify(row), /19\.8/);
});

test('Duet last good + failed run + age; all failed is no reading yet with no failed note', () => {
  const failed = later(duet, 4, { status: 'CHROME_UNAVAILABLE', reason: 'Chrome not connected', used_usd: undefined, left_usd: undefined, weekly_cap_usd: undefined });
  const d = L.usageRows(parse(claude, duet, failed), NOW, null)[0].duet;
  assert.equal(d.label, 'Duet credit · $19.80 of $500 used', 'keeps the last good amounts');
  assert.match(d.measured, /^Measured 10:07 PM ET · \d+h ago$/);
  assert.equal(d.failed.text, 'Latest run failed 2:07 AM ET · CHROME_UNAVAILABLE · Chrome not connected');
  const allBad = L.usageRows(parse(claude, failed), NOW, null)[0].duet;
  assert.equal(allBad.missing, true); assert.equal(allBad.label, 'Duet credit · no reading yet'); assert.equal(allBad.failed, undefined);
});

test('Duet and DeepSeek staleness: same nextCheck + grace rule as CLAUDE', () => {
  const rs = parse(claude, duet, deepseek), t = Date.parse(duet.at), cut = L.nextCheck(t) + L.USAGE_GRACE_MIN * 60000;
  assert.equal(L.usageRows(rs, cut, null)[0].duet.stale, false);
  assert.equal(L.usageRows(rs, cut + 1, null)[0].duet.stale, true);
  const dsCut = L.nextCheck(Date.parse(deepseek.at)) + L.USAGE_GRACE_MIN * 60000;
  assert.equal(L.usageLimitRows(rs, dsCut)[3].stale, false);
  assert.equal(L.usageLimitRows(rs, dsCut + 1)[3].stale, true);
  assert.equal(L.readingStale({ provider: 'CLAUDE_DUET', at: duet.at }, cut + 1), L.readingStale({ provider: 'CLAUDE', at: duet.at }, cut + 1));
});

test('strict parsing: wrong meter, wrong case, bad OK amounts are dropped; failed attempts keep only status and reason', () => {
  assert.deepEqual(parse(Object.assign({}, duet, { meter: 'weekly' })), []);
  assert.deepEqual(parse(Object.assign({}, duet, { provider: 'claude_duet' })), []);
  assert.deepEqual(parse(Object.assign({}, duet, { used_usd: '19.8', left_usd: undefined })), []);
  assert.deepEqual(parse(Object.assign({}, duet, { weekly_cap_usd: 0 })), []);
  assert.deepEqual(parse(Object.assign({}, deepseek, { total_balance: -1 })), []);
  assert.deepEqual(parse(Object.assign({}, deepseek, { source: '' })), []);
  const [f] = parse(Object.assign({}, deepseek, { status: 'HTTP_ERROR', http: 401, total_balance: undefined }));
  assert.deepEqual(f, { at: deepseek.at, provider: 'DEEPSEEK', meter: 'api_balance', status: 'HTTP_ERROR', reason: 'HTTP 401' });
  assert.equal(L.readingMeasured(f), false);
});

test('Duet rows do not change the AI usage rows or their status fallback', () => {
  const fallback = { as_of: claude.at, services: [{ name: 'Claude', pct_used: 11 }] };
  assert.deepEqual(L.usageRows(parse(duet, deepseek), NOW, fallback), L.usageRows([], NOW, fallback));
  const strip = rows => rows.map(r => Object.assign({}, r, { duet: undefined }));
  assert.deepEqual(strip(L.usageRows(parse(claude, duet, deepseek), NOW, null)), strip(L.usageRows(parse(claude), NOW, null)));
});

test('a failed CLAUDE run keeps its reason through parseReadings', () => {
  const bad = later(claude, 4, { status: 'CHROME_UNAVAILABLE', usedPct: undefined, reason: 'Chrome not connected' });
  const row = L.usageRows(parse(claude, bad), NOW, null)[0];
  assert.equal(row.pct_used, 100);
  assert.match(row.failed.text, /· CHROME_UNAVAILABLE · Chrome not connected$/);
});

test('DeepSeek: fourth Other Limits column, lines, missing, last good with a failed run', () => {
  assert.deepEqual(L.LIMIT_PROVIDERS.map(p => p.name), ['GitHub', 'Desktop Cmdr', 'CloudFlare', 'DeepSeek']);
  const fresh = Date.parse(deepseek.at) + HOUR;
  const ds = L.usageLimitRows(parse(deepseek), fresh)[3];
  assert.equal(ds.total_balance, 12.34);
  assert.deepEqual(L.limitLines(ds), [{ t: '$12.34 left' }, { t: 'granted $10.00 · topped up $2.34' }, { t: 'Measured 9:14 PM ET', warn: false }]);
  assert.deepEqual(L.limitLines(L.usageLimitRows(parse(), fresh)[3]), [{ t: 'no reading yet' }]);
  const failed = later(deepseek, 0.5, { status: 'HTTP_ERROR', error: 'timeout', total_balance: undefined });
  const lg = L.usageLimitRows(parse(deepseek, failed), fresh)[3];
  assert.equal(lg.total_balance, 12.34);
  assert.match(lg.measured, /^Measured 9:14 PM ET · 1h ago$/);
  assert.equal(L.limitLines(lg).pop().t, '? Latest run failed 9:44 PM ET · HTTP_ERROR · timeout');
  assert.deepEqual(L.limitLines(L.usageLimitRows(parse(failed), fresh)[3]), [{ t: 'no reading yet' }], 'all failed: no failed note');
});

test('Other Limits lines: Desktop Cmdr real leftPct and missing reset, CloudFlare full text, empty stays a dash', () => {
  const at = '2026-11-23T01:58:42-05:00', t = Date.parse(at);
  const rows = L.usageLimitRows(parse(
    { at, provider: 'DESKTOP_COMMANDER', meter: 'remote_calls_monthly', leftPct: 18, status: 'OK', source: 'who_am_i' },
    { at, provider: 'CLOUDFLARE', status: 'OK', source: 'cloudflare api', workersRequests: { used: 0, remaining: 100000, limit: 100000, resetsAt: '2026-11-24T00:00:00Z' }, pagesBuilds: { na: true } }), t + 10 * 60000);
  assert.deepEqual(L.limitLines(rows[1]), [{ t: '18% of monthly cap left' }, { t: 'read Nov 23, 1:58 AM ET', warn: false },
    { t: 'Monthly reset —' }]);
  assert.deepEqual(L.limitLines(rows[2]), [{ t: 'Workers 0 / 100,000 requests' }, { t: 'Pages n/a' }]);
  assert.deepEqual(L.limitLines(rows[0]), [{ t: '—' }]);
  assert.equal(L.limitLines(L.usageLimitRows(rows.length && parse({ at, provider: 'DESKTOP_COMMANDER', meter: 'remote_calls_monthly', leftPct: 18, status: 'OK', source: 'x' }), t + 27 * HOUR)[1])[1].t,
    '? STALE · read Nov 23, 1:58 AM ET');
});

test('Desktop Commander reset accepts either feed spelling and preserves date-only values', () => {
  const dc = { at: '2026-11-24T21:00:00-05:00', provider: 'DESKTOP_COMMANDER', meter: 'remote_calls_monthly', leftPct: 18, status: 'OK', source: 'who_am_i' };
  const line = reset => L.limitLines(L.usageLimitRows(parse({ ...dc, ...reset }), NOW)[1]).at(-1).t;
  assert.equal(line({ resetsAt: '2026-12-01' }), 'Monthly reset Dec 1, 2026');
  assert.equal(line({ resetsAt: 'bad', resets_at: '2026-12-01T02:00:00Z' }), 'Monthly reset Nov 30, 2026');
  assert.equal(line({ resetsAt: '2026-02-30', next_read_after: '2026-11-25T08:00:00-05:00' }), 'Monthly reset —');
});

test('flat usage includes the feed-backed limits even with no plan readings', () => {
  const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
  const render = office.slice(office.indexOf('function usageListHTML()'), office.indexOf('function openUsage()'));
  const readings = parse({ ...deepseek, total_balance: 0 }, {
    at: deepseek.at, provider: 'DESKTOP_COMMANDER', meter: 'remote_calls_monthly',
    leftPct: 18, resets_at: '2026-12-01', status: 'OK', source: 'who_am_i'
  });
  const html = require('node:vm').runInNewContext(render + 'usageListHTML()', { L, S: { readings }, esc: String });
  assert.match(html, /Other Limits/);
  assert.match(html, /DeepSeek<\/b><div class="meta">\$0\.00 left/);
  assert.match(html, /Monthly reset Dec 1, 2026/);
});

test('wrapWords keeps every character, never adds an ellipsis, splits a word wider than the line', () => {
  const m = t => t.length * 10;
  assert.deepEqual(L.wrapWords('Workers 0 / 100,000 requests', 150, m), ['Workers', '0 / 100,000', 'requests'], 'never after the slash (cs-9e5be547 #6)');
  assert.deepEqual(L.wrapWords('abcdefghij', 40, m), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(L.wrapWords('short', 400, m), ['short']);
  const long = 'Latest run failed 2:07 AM ET · CHROME_UNAVAILABLE · Chrome not connected';
  const out = L.wrapWords(long, 120, m);
  assert.ok(out.every(l => m(l) <= 120)); assert.equal(out.join('').replace(/ /g, ''), long.replace(/ /g, '')); assert.ok(!out.join('').includes('…'));
});

/* Canvas layout with a fake ctx (width = chars x px x 0.55); real fonts and pixels need a browser. */
let D;
test.before(async () => {
  globalThis.window = { OfficeLogic: L };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-draw-v2-'));
  for (const f of ['draw.js', 'avatars.js']) fs.copyFileSync(path.join(__dirname, '../office', f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  D = await import(pathToFileURL(path.join(dir, 'draw.js')).href);
});
function fakeCtx() {
  const texts = [], rects = [];
  const ctx = { font: '', fillStyle: '', textAlign: 'left', texts, rects,
    measureText(t) { const px = Number((/(\d+(?:\.\d+)?)px/.exec(this.font) || [0, 10])[1]); return { width: String(t).length * px * 0.55 }; },
    fillText(t, x, y) { const w = this.measureText(t).width; texts.push({ t, x: this.textAlign === 'right' ? x - w : x, w, y, font: this.font, color: this.fillStyle }); },
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, color: this.fillStyle }); }, strokeRect() {}, beginPath() {}, roundRect() {}, fill() {} };
  return ctx;
}

test('wall draw: two Claude bars end at 564s, big % and prediction clear of them, no ellipsis, Duet terms under the Duet bar', () => {
  for (const W of [640, 1024]) {
    const s = W / 1024, H = W * 605 / 1024, c = fakeCtx();
    const rows = L.usageRows(parse(claude, duet, Object.assign({}, claude, { provider: 'CHATGPT', usedPct: 1 }), Object.assign({}, claude, { provider: 'GROK', usedPct: 38 })), NOW, null);
    D.drawUsage(c, W, H, { rows, now: NOW, pred: { CLAUDE: { text: 'runs out ~Sat 4 PM', bad: true } } });
    assert.ok(!c.texts.some(x => String(x.t).includes('…')), 'no ellipsis');
    const bars = c.rects.filter(r => Math.abs(r.h - 18 * s) < 1e-6 && r.color === '#2b2e33');
    assert.equal(bars.length, 4, 'Claude 2 tracks, ChatGPT 1, Grok 1');
    assert.ok(bars.every(r => r.x + r.w <= 564 * s + 1e-6), 'every bar ends by 564s');
    assert.equal(bars[0].w, 250 * s); assert.equal(bars[1].x, (40 + 250 + 24) * s);
    const big = c.texts.filter(x => /^(\d+%|—)$/.test(x.t));
    assert.ok(big.length === 3 && big.every(x => x.x > 564 * s && x.x + x.w <= W - 40 * s + 1e-6), 'big % right edge W-40s, clear of the bars');
    const pred = c.texts.filter(x => /runs out|Sat 4 PM/.test(x.t));
    assert.ok(pred.length && pred.every(x => x.x >= 584 * s - 1e-6 && x.x + x.w <= big[0].x), 'prediction between the bars and the %');
    const left = c.texts.filter(x => x.x < 564 * s && x.y > 88 * s);
    assert.ok(left.every(x => x.x + x.w <= 564 * s + 1e-6), 'row text wraps inside the bar width');
    const term = c.texts.find(x => x.t.startsWith('$500 each week'));
    assert.ok(term && term.x === (40 + 250 + 24) * s, 'promo terms under the Duet bar');
    assert.ok(c.texts.some(x => x.t.includes('Duet credit') && x.t.includes('$19.80')));
    assert.ok(c.texts.every(x => x.y <= H), 'every line inside the wall');
  }
});

test('wall draw: Grok measurement, reset time and trailing note fit below Claude Duet and ChatGPT', () => {
  const rows = L.usageRows(parse(
    { ...claude, resets_available: 0 },
    { ...duet, used_usd: 500, left_usd: 0 },
    { ...claude, provider: 'CHATGPT', usedPct: 31, resets_available: 0,
      openaiCredit: { grant_usd: 41, verified_left_usd: 38, expires: '2026-11-30' } },
    { ...claude, provider: 'GROK', usedPct: 87, resets_available: 0 }
  ), NOW, null);
  rows[0].fiveHour = { usedPct: 0, resetsAt: new Date(NOW + HOUR).toISOString() };
  // Match the low- and full-resolution usage textures in office.js.
  for (const [W, H] of [[640, 422], [1024, 675]]) {
    const c = fakeCtx();
    D.drawUsage(c, W, H, { rows, now: NOW });
    const grok = c.texts.slice(c.texts.findIndex(x => x.t === 'Grok'));
    const details = grok.filter(x => x.x === 40 * W / 1024 && x.t !== 'Grok');
    assert.match(details.map(x => x.t).join(' '), /Measured .* ET.* · resets .* ET Resets: 0 · Extra: none/);
    // Allow for descenders below the alphabetic baseline, not just the baseline itself.
    const bottom = Math.max(...grok.map(x => x.y + parseFloat(x.font.split(' ')[1]) / 4));
    assert.ok(bottom <= H, `Grok text ends at ${bottom}px on the ${W}×${H} canvas`);
  }
});

test('wall draw: no Duet reading shows no reading yet and no dollar amount', () => {
  const c = fakeCtx();
  D.drawUsage(c, 1024, 605, { rows: L.usageRows(parse(claude), NOW, null), now: NOW });
  const all = c.texts.map(x => x.t).join(' | ');
  assert.match(all, /no reading yet/); assert.doesNotMatch(all, /\$/);
});

test('limits draw: four columns with DeepSeek credit and Desktop Commander reset, no sample values', () => {
  const at = '2026-11-24T21:00:00-05:00';
  const rows = L.usageLimitRows(parse(
    { at, provider: 'GITHUB', meter: 'core_api', remaining: 3624, limit: 5000, resetsAt: '2026-11-25T03:40:00Z', status: 'OK', source: 'gh' },
    { at, provider: 'DESKTOP_COMMANDER', meter: 'remote_calls_monthly', leftPct: 18, resetsAt: '2026-12-01', status: 'OK', source: 'who_am_i' },
    { at, provider: 'CLOUDFLARE', status: 'OK', source: 'cf', workersRequests: { used: 0, remaining: 100000, limit: 100000 }, pagesBuilds: { na: true } }, deepseek), Date.parse(at) + HOUR);
  const c = fakeCtx();
  D.drawUsageLimits(c, 1024, 158, rows);
  assert.deepEqual(['GitHub', 'Desktop Cmdr', 'CloudFlare', 'DeepSeek'].map(h => c.texts.some(x => x.t === h)), [true, true, true, true]);
  assert.ok(!c.texts.some(x => String(x.t).includes('…')));
  assert.ok(c.texts.some(x => x.t === '$12.34 left'));
  assert.ok(c.texts.some(x => x.t === 'Monthly reset'));
  assert.ok(c.texts.some(x => x.t === 'Dec 1, 2026'));
  assert.ok(!c.texts.some(x => /SAMPLE|30 calls/.test(x.t)));
  assert.ok(c.texts.some(x => x.t.endsWith('requests') && !x.t.startsWith('Workers')), 'CloudFlare wraps onto a second line, full text');
  assert.ok(c.texts.every(x => x.x + x.w <= 1024 - 20 && x.y <= 158), 'inside the panel');
});

// cs-9e5be547 #6 and #7
test('wrapWords breaks at spaces and middots and keeps dates, clock times and quantities whole', () => {
  const m = t => t.length * 10, lines = (t, w) => L.wrapWords(t, w, m);
  const has = (out, p) => out.some(l => l.includes(p));
  assert.ok(has(lines('$500 each week · $3,000 total cap to Dec 31, 2026', 250), 'Dec 31, 2026'));
  assert.ok(has(lines('Unused credit expires weekly · renews Sun 11 AM ET', 200), 'Sun 11 AM ET'));
  assert.ok(has(lines('Measured Nov 23, 1:58 AM ET · 18% left', 200), 'Nov 23, 1:58 AM ET'));
  assert.ok(has(lines('Measured Nov 23, 1:58 AM ET · 18% left', 160), '1:58 AM ET'), 'too wide for the whole date: the clock time still holds');
  assert.ok(has(lines('fetched 11:32:44 AM ET', 150), '11:32:44 AM ET'));
  assert.deepEqual(lines('Workers 0 / 100,000 requests', 220), ['Workers', '0 / 100,000 requests']);
  for (const w of [150, 200, 220, 300]) assert.ok(!lines('Workers 0 / 100,000 requests', w).some(l => /\/$/.test(l)), 'never after the slash at ' + w);
  assert.deepEqual(lines('a · b', 30), ['a ·', 'b'], 'a middot is a break point');
  assert.ok(!lines('Dec 31, 2026 · Sun 11 AM ET', 130).join('').includes('…'));
});
test('usage wall: the fetched stamp sits in the header with Latest reading, not under the last row %', () => {
  const W = 1024, H = 605, c = fakeCtx(), AT = Date.parse('2026-11-25T11:32:44-05:00');
  const rows = L.usageRows(parse(claude, duet, Object.assign({}, claude, { provider: 'CHATGPT', usedPct: 1 }), Object.assign({}, claude, { provider: 'GROK', usedPct: 38 })), NOW, null);
  D.drawUsage(c, W, H, { rows, now: NOW, fetchedAt: AT });
  const head = c.texts.find(x => x.t.startsWith('Latest reading '));
  assert.match(head.t, /^Latest reading \d{1,2}:\d\d [AP]M ET · .+ · fetched 11:32:44 AM ET · /);
  assert.ok(head.y <= 60 && head.x >= 40 + c.texts.find(x => x.t === 'AI USAGE').w, 'header row, clear of the title');
  assert.equal(c.texts.filter(x => /fetched /.test(x.t)).length, 1, 'one board-level stamp');
  const big = c.texts.filter(x => /^(\d+%|—)$/.test(x.t)), used = c.texts.filter(x => x.t === 'used');
  for (const b of big.concat(used)) assert.ok(b.y > head.y + 20, 'nothing fetched near a % or "used"');
  assert.ok(c.texts.some(x => /^Measured \d/.test(x.t) && x.y > 88), 'provider Measured lines stay in their rows');
  assert.equal(L.usageHeader(rows, NOW), L.usageHeader(rows, NOW, null), 'no fetch time: header as before');
});

test('Grok fallback keeps its percent and age on the wall and in flat/modal usage', () => {
  const office = fs.readFileSync(path.join(__dirname, '../office/office.js'), 'utf8');
  const apply = office.slice(office.indexOf('function applyReadings('), office.indexOf('function slowLoads('));
  const render = office.slice(office.indexOf('function usageListHTML()'), office.indexOf('function openUsage()'));
  const load = state => require('node:vm').runInNewContext(apply + render + '({ applyReadings, usageListHTML })', {
    L, S: state, Date: class extends Date { static now() { return NOW; } }, esc: String
  });
  const grok = { ...claude, provider: 'GROK', usedPct: 38, at: new Date(NOW - 20 * 60000).toISOString() };
  const failed = { ...later(grok, 0.25), status: 'HTTP_ERROR', usedPct: 99, reason: 'timeout' };
  const missing = { ...failed, status: 'OK', usedPct: undefined };
  const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n');

  for (const { initial, latest, error, failedNote } of [
    { latest: [grok, failed], failedNote: true },
    { latest: [grok, missing], failedNote: true },
    { initial: [grok], latest: [failed], failedNote: true },
    { initial: [grok], latest: [claude] },
    { initial: [grok], latest: [] },
    { initial: [grok], error: 'HTTP 404' },
    { initial: [grok], error: 'Failed to fetch' }
  ]) {
    const state = { readings: [] };
    const { applyReadings, usageListHTML } = load(state);
    if (initial) applyReadings(jsonl(initial), NOW);
    if (latest) applyReadings(jsonl(latest), NOW);
    if (error) state.readingsErr = error;
    const rows = L.usageRows(state.readings, NOW, null, state);
    const row = rows.find(r => r.name === 'Grok');
    assert.equal(row.pct_used, 38);
    assert.equal(row.at, Date.parse(grok.at));
    assert.equal(row.stale, true, 'even within the normal freshness window');
    assert.equal(!!row.failed, !!failedNote);
    const c = fakeCtx();
    D.drawUsage(c, 1024, 605, { rows, now: NOW, pred: { GROK: { text: 'no reading' } } });
    assert.ok(c.texts.some(x => x.t === '38%'));
    assert.match(c.texts.map(x => x.t).join(' '), /STALE.*20m ago/);
    assert.ok(!c.texts.some(x => x.t === 'no reading'));
    const html = usageListHTML();
    assert.match(html, /<b>Grok<\/b>.*38% used.*\? stale/);
    assert.match(html, /Measured .* ET · 20m ago/);
    assert.doesNotMatch(html, /reading failed/);
  }

  const state = {};
  const { applyReadings, usageListHTML } = load(state);
  applyReadings(jsonl([failed]), NOW);
  assert.match(usageListHTML(), /<b>Grok<\/b>.*reading failed/);
  const c = fakeCtx();
  D.drawUsage(c, 1024, 605, { rows: L.usageRows(state.readings, NOW, null, state), now: NOW });
  assert.ok(c.texts.some(x => x.t === '—'), 'no valid history, no percent');

  state.readingsErr = 'HTTP 404';
  applyReadings(jsonl([grok]), NOW);
  assert.match(usageListHTML(), /<b>Grok<\/b>.*38% used/);
  assert.doesNotMatch(usageListHTML(), /\? stale|20m ago/);
});
