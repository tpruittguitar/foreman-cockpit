'use strict';
// GUI-18 (cs-fa411c2b): the Explorer map asks the geocoder once per place, not once per job row, and not at all with a warm cache.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'pipeline.html'), 'utf8');
const cut = (from, to) => { const a = html.indexOf(from), b = html.indexOf(to, a); assert.ok(a >= 0 && b > a, 'found ' + from); return html.slice(a, b); };
const src = [cut('var GEO_={', 'function chipCity_'), cut('var US_STATE_NAMES=', 'function cleanLocation_'), cut('function stateFallback_', 'function projectUS_')].join('\n');

function page(store) {
  let calls = 0;
  const ctx = {
    LS: { get: (k, d) => (k in store ? JSON.parse(store[k]) : d), set: (k, v) => { store[k] = JSON.stringify(v); } },
    setTimeout: fn => { fn(); return 0; }, clearTimeout: () => {},
    fetch: url => { calls++; const name = decodeURIComponent(/name=([^&]+)/.exec(url)[1]), n = +name.replace(/\D/g, '');
      return new Promise(r => setTimeout(() => r({ ok: true, json: () => ({ results: [{ latitude: 35 + n / 100, longitude: -85 - n / 100, name, admin1: 'Tennessee' }] }) }), 1)); },
  };
  vm.runInNewContext(src, ctx);
  return { geocode: loc => ctx.geocodePlace_(loc), calls: () => calls };
}
// About 1,400 job rows sharing 50 places none of which is a built-in city.
const locs = Array.from({ length: 1400 }, (_, i) => ({ label: 'Testville' + (i % 50) + ', TN' }));

test('first load: at most one geocode call per unique place, markers correct', async () => {
  const p = page({});
  const found = await Promise.all(locs.map(p.geocode));
  assert.ok(p.calls() <= 50, p.calls() + ' geocode calls for 50 places');
  found.forEach((f, i) => { const n = i % 50; assert.equal(f.label, locs[i].label); assert.equal(f.lat, 35 + n / 100); assert.equal(f.lon, -85 - n / 100); assert.equal(f.approx, false); });
});
test('second load with a warm cache: zero geocode calls', async () => {
  const store = {}, first = page(store);
  await Promise.all(locs.map(first.geocode));
  const second = page(store);
  const found = await Promise.all(locs.map(second.geocode));
  assert.equal(second.calls(), 0);
  assert.ok(found.every(f => Number.isFinite(f.lat) && Number.isFinite(f.lon)));
});
