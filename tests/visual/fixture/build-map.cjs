/* Map geometry for golden frames: state outlines from us-atlas 3 states-10m (ISC; licenses/us-atlas-LICENSE.txt),
   projected with the plate-carrée scale measured on Grok Bot's v1.5 PDF p40 (graticule 134.2 px per degree of longitude,
   165.4 px per degree of latitude; 87°W at x 1519.2, 35°N at y 955 in the 2560 x 1440 frame).
   Run once: NODE_PATH=<dir with us-atlas@3.0.1 and topojson-client@3.1.0> node tests/visual/fixture/build-map.cjs
   Output: tests/visual/fixture/map-f02.json (paths in map-panel coordinates; panel origin 1220,352). */
'use strict';
const fs = require('fs'), path = require('path');
const topo = require('topojson-client'), us = require('us-atlas/states-10m.json');
const OX = 1220, OY = 352, W = 799, H = 1022;
const px = lon => 1519.2 + (lon + 87) * 134.2 - OX, py = lat => 955 - (lat - 35) * 165.4 - OY;
const fc = topo.feature(us, us.objects.states);
const states = [];
for (const f of fc.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let d = '', hit = false;
  for (const poly of polys) for (const ring of poly) {
    let prev = null;
    ring.forEach(([lon, lat], i) => {
      const x = px(lon), y = py(lat);
      if (x > -200 && x < W + 200 && y > -200 && y < H + 200) hit = true;
      const p = x.toFixed(1) + ',' + y.toFixed(1);
      if (p === prev) return; prev = p;
      d += (i ? 'L' : 'M') + p;
    });
    d += 'Z';
  }
  if (hit) states.push({ name: f.properties.name, d });
}
const ABBR = { Tennessee: 'TN', Kentucky: 'KY', Alabama: 'AL', Georgia: 'GA', Mississippi: 'MS', 'North Carolina': 'NC', Virginia: 'VA', 'South Carolina': 'SC', Indiana: 'IN', Illinois: 'IL', Missouri: 'MO', Arkansas: 'AR', Ohio: 'OH', 'West Virginia': 'WV', Florida: 'FL' };
const out = { projection: { lonScale: 134.2, latScale: 165.4, x87W: 1519.2, y35N: 955, origin: [OX, OY] }, size: [W, H],
  states: states.map(s => ({ name: s.name, abbr: ABBR[s.name] || '', d: s.d })) };
fs.writeFileSync(path.join(__dirname, 'map-f02.json'), JSON.stringify(out) + '\n');
console.log('map: ' + out.states.length + ' states');
