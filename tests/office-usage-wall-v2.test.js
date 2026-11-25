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

test('Other Limits lines: Desktop Cmdr real leftPct plus SAMPLE cap/reset, CloudFlare full text, empty stays a dash', () => {
  const at = '2026-11-23T01:58:42-05:00', t = Date.parse(at);
  const rows = L.usageLimitRows(parse(
    { at, provider: 'DESKTOP_COMMANDER', meter: 'remote_calls_monthly', leftPct: 18, status: 'OK', source: 'who_am_i' },
    { at, provider: 'CLOUDFLARE', status: 'OK', source: 'cloudflare api', workersRequests: { used: 0, remaining: 100000, limit: 100000, resetsAt: '2026-11-24T00:00:00Z' }, pagesBuilds: { na: true } }), t + 10 * 60000);
  assert.deepEqual(L.limitLines(rows[1]), [{ t: '18% of monthly cap left' }, { t: 'read Nov 23, 1:58 AM ET', warn: false },
    { t: 'cap 30 calls/month', sample: true }, { t: 'resets in 6 days', sample: true }]);
  assert.deepEqual(L.limitLines(rows[2]), [{ t: 'Workers 0 / 100,000 requests' }, { t: 'Pages n/a' }]);
  assert.deepEqual(L.limitLines(rows[0]), [{ t: '—' }]);
  assert.equal(L.limitLines(L.usageLimitRows(rows.length && parse({ at, provider: 'DESKTOP_COMMANDER', meter: 'remote_calls_monthly', leftPct: 18, status: 'OK', source: 'x' }), t + 27 * HOUR)[1])[1].t,
    '? STALE · read Nov 23, 1:58 AM ET');
});

test('wrapWords keeps every character, never adds an ellipsis, splits a word wider than the line', () => {
  const m = t => t.length * 10;
  assert.deepEqual(L.wrapWords('Workers 0 / 100,000 requests', 150, m), ['Workers 0 /', '100,000', 'requests']);
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

test('wall draw: no Duet reading shows no reading yet and no dollar amount', () => {
  const c = fakeCtx();
  D.drawUsage(c, 1024, 605, { rows: L.usageRows(parse(claude), NOW, null), now: NOW });
  const all = c.texts.map(x => x.t).join(' | ');
  assert.match(all, /no reading yet/); assert.doesNotMatch(all, /\$/);
});

test('limits draw: four columns, every line inside its column, SAMPLE only on Desktop Cmdr cap and reset', () => {
  const at = '2026-11-24T21:00:00-05:00';
  const rows = L.usageLimitRows(parse(
    { at, provider: 'GITHUB', meter: 'core_api', remaining: 3624, limit: 5000, resetsAt: '2026-11-25T03:40:00Z', status: 'OK', source: 'gh' },
    { at, provider: 'DESKTOP_COMMANDER', meter: 'remote_calls_monthly', leftPct: 18, status: 'OK', source: 'who_am_i' },
    { at, provider: 'CLOUDFLARE', status: 'OK', source: 'cf', workersRequests: { used: 0, remaining: 100000, limit: 100000 }, pagesBuilds: { na: true } }, deepseek), Date.parse(at) + HOUR);
  const c = fakeCtx();
  D.drawUsageLimits(c, 1024, 158, rows);
  assert.deepEqual(['GitHub', 'Desktop Cmdr', 'CloudFlare', 'DeepSeek'].map(h => c.texts.some(x => x.t === h)), [true, true, true, true]);
  assert.ok(!c.texts.some(x => String(x.t).includes('…')));
  assert.equal(c.texts.filter(x => x.t === 'SAMPLE').length, 2);
  assert.ok(c.texts.some(x => x.t.endsWith('requests') && !x.t.startsWith('Workers')), 'CloudFlare wraps onto a second line, full text');
  assert.ok(c.texts.every(x => x.x + x.w <= 1024 - 20 && x.y <= 158), 'inside the panel');
});
