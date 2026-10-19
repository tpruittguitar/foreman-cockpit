// Map HUD geometry (rev4 BUILD 1 lat / lon label spacing, BUILD 2 corner brackets), readouts and projection.
const test = require('node:test'), assert = require('node:assert/strict');
const H = require('../pipeline-map-hud.js'), M = require('../pipeline-map.js');

const views = [
  { W: 1500, H: 520, cx: 480, cy: 255, zoom: 1, band: 44 },
  { W: 1500, H: 520, cx: 640, cy: 250, zoom: 6, band: 44 },     // selected job, 600%
  { W: 800, H: 1024, cx: 620, cy: 250, zoom: 4, band: 84 },     // golden-sized canvas
  { W: 980, H: 380, cx: 300, cy: 330, zoom: 10, band: 44 }      // short canvas, max zoom
];

test('projection matches pipeline-map.js for CONUS and inverts exactly', () => {
  for (const [lat, lon] of [[35.1595, -84.8766], [30.2672, -97.7431], [47.6, -122.3], [25.8, -80.2]]) {
    const a = H.project(lat, lon), b = M.project(lat, lon, 'TN');
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
    const back = H.unproject(a.x, a.y);
    assert.ok(Math.abs(back.lat - lat) < 1e-9 && Math.abs(back.lon - lon) < 1e-9);
  }
  const v = views[1], q = H.project(36, -86), s = H.toScreen(v, q), r = H.fromScreen(v, s.x, s.y);
  assert.ok(Math.abs(r.x - q.x) < 1e-9 && Math.abs(r.y - q.y) < 1e-9);
});

test('labels read as the golden does: 35°N, 087°W, readout 36.1627°N 086.7816°W', () => {
  assert.equal(H.latText(35), '35°N');
  assert.equal(H.lonText(-87), '087°W');
  assert.equal(H.latText(36.16271, 4) + ' ' + H.lonText(-86.78159, 4), '36.1627°N 086.7816°W');
});

test('BUILD 1: every lat / lon label pair is >= 8 px apart; lon labels start at x >= 48; none enters the HUD band', () => {
  for (const v of views) {
    const g = H.graticule(v), all = g.lat.concat(g.lon);
    assert.ok(g.lat.length + g.lon.length > 0, 'some labels at zoom ' + v.zoom);
    g.lon.forEach(r => { assert.ok(r.x >= 48, r.text + ' x ' + r.x); assert.ok(r.y + r.h <= v.H - v.band, r.text + ' above the band'); });
    g.lat.forEach(r => assert.ok(r.y + r.h <= v.H - v.band, r.text + ' above the band'));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++)
      assert.equal(H.hit(all[i], all[j], H.GAP - 0.001), false, all[i].text + ' vs ' + all[j].text + ' at zoom ' + v.zoom);
  }
});

test('BUILD 1: the golden F02 case (33°N on the lon row) drops the lat label instead of touching 089°W', () => {
  // Put 33°N just above the lon baseline: the lat label must be skipped, the lon labels kept.
  const v = { W: 800, H: 1024, cx: 0, cy: 0, zoom: 4, band: 84 }, s = H.scaleOf(v), q = H.project(33, -88.6);
  v.cx = q.x - (8 + 40 - v.W / 2) / s; v.cy = q.y - (v.H - v.band - 16 + 5 - v.H / 2) / s;   // 33°N lands exactly on the lon row
  const g = H.graticule(v);
  assert.ok(!g.lat.some(r => r.lat === 33), '33°N skipped');
  assert.ok(g.lon.length > 0, 'lon labels kept');
});

test('BUILD 2: brackets frame the open canvas (inset 10, arm 34, stroke 2) and their arms are clear of overlays given as avoid', () => {
  const b = H.brackets(1500, 520, 44);
  assert.deepEqual(b.map(x => [x.id, x.x, x.y]), [['tl', 10, 10], ['tr', 1490, 10], ['bl', 10, 466], ['br', 1490, 466]]);
  assert.equal(b[0].d, 'M10,44V10H44');
  assert.equal(b[3].d, 'M1490,432V466H1456');
  const arms = b.flatMap(x => x.arms);
  // labels never cover an arm when the arms are passed as avoid rects
  for (const v of views) {
    const bb = H.brackets(v.W, v.H, v.band), g = H.graticule(Object.assign({ avoid: bb.flatMap(x => x.arms) }, v));
    g.lat.concat(g.lon).forEach(r => bb.flatMap(x => x.arms).forEach(a => assert.equal(H.hit(r, a, H.GAP - 0.001), false, r.text + ' clear of a bracket')));
  }
  assert.equal(arms.length, 8);
});

test('graticule lines stay inside CONUS and skip the Alaska / Hawaii insets; major every 5°', () => {
  const g = H.graticule(views[0]);
  assert.ok(g.lines.length > 20);
  g.lines.forEach(l => { assert.ok(l.x1 >= 40 - 1e-9 && l.x2 <= 920 + 1e-9); assert.ok(l.y1 >= 35 - 1e-9 && l.y2 <= 440 + 1e-9); });
  const v87 = g.lines.find(l => l.x1 === l.x2 && Math.abs(H.unproject(l.x1, 0).lon + 85) < 1e-9);
  assert.equal(v87.major, true);
  g.lines.filter(l => l.y1 === l.y2 && l.y1 > 380).forEach(l => assert.ok(l.x1 >= 360, 'south lat lines start right of the insets'));
});

test('range and bearing from HOME: Cleveland, TN to Nashville, TN', () => {
  const rb = H.rangeBearing({ lat: 35.1595, lon: -84.8766 }, { lat: 36.1627, lon: -86.7816 });
  assert.equal(Math.round(rb.mi), 127);    // golden F02: RNG 127 MI
  assert.equal(Math.round(rb.brg), 304);   // golden F02: BRG 304°
});
