/* Map HUD geometry for the job location map (golden F01 / F02 map panel; rev4 BUILD 1-2). Pure functions, no DOM.
   Every number shown on the map HUD is computed here or by the app (L-2): graticule positions from the map projection, lat / lon
   readouts from the inverse projection, range and bearing from HOME by great circle.
   BUILD 1: lat labels sit in the left column (x 8), lon labels on one row above the HUD band starting at x >= 48; a label is
   dropped when its box comes within 8 px of another label, a bracket arm or an overlay control.
   BUILD 2: four corner brackets frame the open map canvas (inside the head, above the HUD band); overlays keep clear of them. */
(function(root){
  'use strict';
  // CONUS projection used by pipeline-map.js (equirectangular in a 960 x 510 frame).
  var P = { x0: 40, lon0: -125, lonSpan: 59, w: 880, y0: 35, lat0: 50, latSpan: 26, h: 405 };
  var CONUS = { lonMin: -125, lonMax: -66, latMin: 24, latMax: 50 };
  // Alaska / Hawaii insets in the same frame: graticule lines are not drawn through them.
  var INSETS = [{ x0: 40, y0: 380, x1: 360, y1: 510 }];
  var GAP = 8, CHAR_W = 0.6, FS = 11;   // IBM Plex Mono advance = 0.6 em

  function project(lat, lon){ return { x: P.x0 + (lon - P.lon0) / P.lonSpan * P.w, y: P.y0 + (P.lat0 - lat) / P.latSpan * P.h }; }
  function unproject(x, y){ return { lat: P.lat0 - (y - P.y0) / P.h * P.latSpan, lon: (x - P.x0) / P.w * P.lonSpan + P.lon0 }; }
  function inConus(ll){ return ll && ll.lat >= CONUS.latMin && ll.lat <= CONUS.latMax && ll.lon >= CONUS.lonMin && ll.lon <= CONUS.lonMax; }

  /* view: {W, H, cx, cy, zoom} -> screen transform (same as the app's mapScreenPoint_) */
  function scaleOf(v){ return Math.min(v.W / 960, v.H / 510) * v.zoom; }
  function toScreen(v, q){ var s = scaleOf(v); return { x: v.W / 2 + (q.x - v.cx) * s, y: v.H / 2 + (q.y - v.cy) * s }; }
  function fromScreen(v, x, y){ var s = scaleOf(v); return { x: v.cx + (x - v.W / 2) / s, y: v.cy + (y - v.H / 2) / s }; }

  function pad3(n){ n = String(n); while (n.length < 3) n = '0' + n; return n; }
  function latText(lat, dp){ return (dp ? Math.abs(lat).toFixed(dp) : String(Math.abs(Math.round(lat)))) + '°' + (lat < 0 ? 'S' : 'N'); }
  function lonText(lon, dp){ var a = Math.abs(lon), t = dp ? a.toFixed(dp) : String(Math.round(a)); var i = t.split('.'); return pad3(i[0]) + (i[1] ? '.' + i[1] : '') + '°' + (lon < 0 ? 'W' : 'E'); }
  function textW(t, fs){ return String(t).length * (fs || FS) * CHAR_W; }

  function hit(a, b, gap){ gap = gap || 0; return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap; }

  /* frame: {W, H, top, bottom} in canvas px (top = first free row under overlays at the top edge is not needed: brackets sit at
     inset 10 from the canvas top; bottom = height of the HUD band). Returns 4 brackets with their arm rects for clearance checks. */
  function brackets(W, H, band, inset, arm, stroke){
    inset = inset == null ? 10 : inset; arm = arm || 34; stroke = stroke || 2; band = band || 0;
    var t = inset, b = H - band - inset, l = inset, r = W - inset;
    return [['tl', l, t, 1, 1], ['tr', r, t, -1, 1], ['bl', l, b, 1, -1], ['br', r, b, -1, -1]].map(function(c){
      var x = c[1], y = c[2], sx = c[3], sy = c[4];
      return { id: c[0], x: x, y: y, d: 'M' + x + ',' + (y + arm * sy) + 'V' + y + 'H' + (x + arm * sx),
        arms: [ { x: Math.min(x, x + arm * sx) - stroke / 2, y: y - stroke / 2, w: arm + stroke, h: stroke },
                { x: x - stroke / 2, y: Math.min(y, y + arm * sy) - stroke / 2, w: stroke, h: arm + stroke } ] };
    });
  }

  function pickStep(pxPerDeg, minPx){ var S = [1, 2, 5, 10, 20]; for (var i = 0; i < S.length; i++) if (S[i] * pxPerDeg >= minPx) return S[i]; return 20; }

  /* Graticule for the current view. o: {W, H, cx, cy, zoom, band, avoid:[rects]}.
     Returns {lines:[{x1,y1,x2,y2,major}] in projected units, lat:[{x,y,w,h,text,lat}], lon:[...], step:{lat,lon}} (labels in screen px). */
  function graticule(o){
    var v = { W: o.W, H: o.H, cx: o.cx, cy: o.cy, zoom: o.zoom }, s = scaleOf(v), band = o.band || 0;
    var a = unproject(fromScreen(v, 0, 0).x, fromScreen(v, 0, 0).y), b = unproject(fromScreen(v, o.W, o.H).x, fromScreen(v, o.W, o.H).y);
    var lonLo = Math.max(CONUS.lonMin, Math.floor(a.lon)), lonHi = Math.min(CONUS.lonMax, Math.ceil(b.lon));
    var latLo = Math.max(CONUS.latMin, Math.floor(b.lat)), latHi = Math.min(CONUS.latMax, Math.ceil(a.lat));
    var pxLon = P.w / P.lonSpan * s, pxLat = P.h / P.latSpan * s;
    var minor = pxLon >= 14 ? 1 : pickStep(pxLon, 14), stLon = pickStep(pxLon, 120), stLat = pickStep(pxLat, 32);
    var lines = [], k, g, top = project(CONUS.latMax, 0).y, bot = project(CONUS.latMin, 0).y, left = project(0, CONUS.lonMin).x, right = project(0, CONUS.lonMax).x;
    for (k = Math.ceil(lonLo / minor) * minor; k <= lonHi; k += minor) { g = project(0, k).x; lines.push({ x1: g, y1: top, x2: g, y2: k < -110 ? INSETS[0].y0 : bot, major: k % 5 === 0 }); }
    for (k = Math.ceil(latLo / minor) * minor; k <= latHi; k += minor) { g = project(k, 0).y; lines.push({ x1: g > INSETS[0].y0 ? INSETS[0].x1 : left, y1: g, x2: right, y2: g, major: k % 5 === 0 }); }
    var avoid = (o.avoid || []).slice(), lonY = o.H - band - 16, lonRow = { x: 0, y: lonY - FS, w: o.W, h: FS + 3 };   // baseline 16 px above the band
    var lon = [], lat = [];
    for (k = Math.ceil(lonLo / stLon) * stLon; k <= lonHi; k += stLon) {
      var sx = toScreen(v, project(0, k)).x + 4, t = lonText(k), r = { x: sx, y: lonY - FS, w: textW(t), h: FS + 3, text: t, lon: k, baseline: lonY };
      if (sx < 48 || sx + r.w > o.W - 8) continue;
      var pr = fromScreen(v, sx, lonY);   // not over the Alaska / Hawaii insets
      if (INSETS.some(function(z){ return pr.x >= z.x0 && pr.x <= z.x1 && pr.y >= z.y0 - 10 && pr.y <= z.y1; })) continue;
      if (avoid.some(function(z){ return hit(r, z, GAP); }) || lon.some(function(z){ return hit(r, z, GAP); })) continue;
      lon.push(r);
    }
    for (k = Math.ceil(latLo / stLat) * stLat; k <= latHi; k += stLat) {
      var sy = toScreen(v, project(k, 0)).y - 5, tt = latText(k), q = { x: 8, y: sy - FS, w: textW(tt), h: FS + 3, text: tt, lat: k, baseline: sy };
      if (q.y < 0 || q.y + q.h > o.H - band) continue;
      if (hit(q, lonRow, GAP) || lon.some(function(z){ return hit(q, z, GAP); })) continue;   // BUILD 1: >= 8 px from the lon row
      if (avoid.some(function(z){ return hit(q, z, GAP); }) || lat.some(function(z){ return hit(q, z, GAP); })) continue;
      lat.push(q);
    }
    return { lines: lines, lat: lat, lon: lon, step: { lat: stLat, lon: stLon, minor: minor } };
  }

  // Great-circle range (statute miles) and initial bearing (degrees true) from a to b.
  function rangeBearing(a, b){
    var R = 3958.8, k = Math.PI / 180, dLat = (b.lat - a.lat) * k, dLon = (b.lon - a.lon) * k;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.pow(Math.sin(dLon / 2), 2);
    var y = Math.sin(dLon) * Math.cos(b.lat * k), x = Math.cos(a.lat * k) * Math.sin(b.lat * k) - Math.sin(a.lat * k) * Math.cos(b.lat * k) * Math.cos(dLon);
    return { mi: 2 * R * Math.asin(Math.sqrt(h)), brg: (Math.atan2(y, x) / k + 360) % 360 };
  }

  var api = { project: project, unproject: unproject, inConus: inConus, toScreen: toScreen, fromScreen: fromScreen, scaleOf: scaleOf,
    latText: latText, lonText: lonText, textW: textW, hit: hit, brackets: brackets, graticule: graticule, rangeBearing: rangeBearing, GAP: GAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PipelineMapHud = api;
})(typeof window !== 'undefined' ? window : globalThis);
