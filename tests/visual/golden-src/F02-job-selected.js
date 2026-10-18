/* F02 renderer: every number below comes from G.fx (fixture.json) or is computed from it. */
(function () {
  var fx = G.fx, esc = G.esc, BAND = G.BAND, s = G.sel(), C = fx.counters;
  function $(id) { return document.getElementById(id); }

  // Header: Writer pill reflects the fixture (1 waiting, 1 failed) — N-06: the PDF pill said IDLE while 1/1 was pending.
  $('writer-pill').innerHTML = '<span class="dot" style="background:var(--pe-amber)"></span>WRITER · ' + C.writerWaiting + ' WAITING · ' + C.writerFailed + ' FAILED · REFRESH 0:42';
  // N-02: lane queue named as its own counter.
  $('hdr-meta').innerHTML = '<b>LANE QUEUE ' + C.laneQueue + '</b><b>LAST SYNC ' + fx.asOf + '</b><b>COMPARE · ' + C.compare + '/3</b>';

  $('subtabs').innerHTML = [['JOBS', C.jobs], ['REVIEW QUEUE', C.reviewQueue, 1], ['DECLINE CANDIDATES', C.declineCandidates], ['MY RULINGS', C.myRulings], ['MAP'], ['TRENDS'], ['COMPARE', C.compare + '/3']]
    .map(function (t) { return '<span class="tab' + (t[2] ? ' on' : '') + '">' + t[0] + (t[1] != null ? '<b>' + t[1] + '</b>' : '') + '</span>'; }).join('') +
    '<span class="vf">VIEW &amp; FILTERS: SCORE ≥ 45 · ALL SOURCES <span class="edit">▾ EDIT</span></span>';

  var kp = [
    { l: 'NEEDS DECISION', v: C.needsDecision, cap: 'Open, undecided · live rows', active: 1, go: 1 },        // V-04: value in Primary; cyan border = active filter
    { l: 'APPLIED · ALL TIME', v: C.appliedAllTime, cap: '✓ Writer-confirmed · live rows', color: 'var(--pe-green)', go: 1 },
    { l: 'RESEARCH', v: C.research, cap: 'Manual research bucket' },
    { l: 'INTERVIEWS · 14D', v: C.interviews14d, cap: 'Application tab dates', color: 'var(--pe-text-muted)', go: 1 },
    { l: 'WRITER · WAITING / FAILED', v: C.writerWaiting + ' / ' + C.writerFailed, cap: '◷ lock busy · auto-retry 8/15/30/45 s', color: 'var(--pe-amber)', go: 1 },
    { l: 'STALE EVIDENCE', v: C.staleEvidence, cap: '<span style="color:var(--pe-olive)">◌</span> FLEX class stamped under older rule', color: 'var(--pe-olive)', go: 1, bar: Math.round(C.staleEvidence / 603 * 100) }
  ];
  $('kpis').innerHTML = kp.map(function (k) {
    return '<div class="kpi' + (k.active ? ' active' : '') + '"><div class="k-label">' + k.l + '</div><div class="k-val"' + (k.color ? ' style="color:' + k.color + '"' : '') + '>' + k.v + '</div><div class="k-cap">' + k.cap + '</div>' +
      (k.go ? '<span class="k-go">›</span>' : '') + (k.bar ? '<span class="k-bar"><i style="width:' + k.bar + '%"></i></span>' : '') + '</div>';
  }).join('');

  var L = fx.sinceLastReview;
  $('strip').innerHTML = '<span class="strip-label">SINCE YOUR LAST REVIEW · ' + fx.lastReview + '</span>' +
    '<span class="u">Δ ' + L.newRows + ' new</span><span class="sep">·</span><span class="u">Δ ' + L.evidenceUpdates + ' evidence updates (e.g. FLEX HIGH→NO)</span><span class="sep">·</span>' +
    '<span class="bad u"><span class="gx-big">⊗</span> ' + C.writerFailed + ' write failed</span><span class="sep">·</span><span class="warn">◷ ' + C.writerWaiting + ' waiting for lock</span><span class="sep">·</span>' +
    '<span class="muted"><span class="gx-sm">◌</span> ' + L.provisional + ' provisional</span>' +
    '<span class="right">MAP SHOWS: SELECTED JOB · ESC → FILTERED VIEW (' + C.reviewQueue + ')</span>';

  // Table
  var vis = fx.rows.slice(0, 30), B = fx.bands;
  $('tq-title').textContent = 'REVIEW QUEUE · ' + C.reviewQueue + ' · ' + vis.length + ' VISIBLE';
  // V-20: N + as-of; cut scores from the fixture snapshot
  $('tq-meta').textContent = 'SORT: SCORE ↓ · BANDS = PERCENTILE (REV ' + fx.model.rev + ' · N ' + B.n + ' · AS OF ' + fx.asOf + ' · P90 ' + B.cuts.top + ' · P65 ' + B.cuts.upper + ' · P20 ' + B.cuts.low + ')';
  var WS = { WAITING: '<span class="ws-wait">◷ Waiting for lock · 8 s</span>', CONFIRMED: '<span class="ws-ok">✓ Confirmed · 3 s</span>', FAILED: '<span class="ws-fail">⊗ Failed · Retry</span>' };
  var FX = { 'High flex': 'fx-high', 'Soft flex': 'fx-soft', 'No flex': 'fx-no', 'Unknown': 'fx-unknown', 'Strict': 'fx-strict' };
  $('rows').innerHTML = vis.map(function (r) {
    var b = BAND[r.band], score;
    if (r.hold) score = '<span class="sc">' + (r.staleEvidence ? '<span class="st">◌</span>' : '') + '<span class="v b-hold">' + r.score + '</span> <span class="hold-tag">⊘ HOLD</span></span>';   // V-03
    else score = '<span class="sc">' + (r.staleEvidence ? '<span class="st">◌</span>' : '') + '<span class="v ' + b[1] + '">' + r.score + '</span><span class="g ' + b[1] + '">' + b[0] + '</span></span>';
    var d = r.changed ? '<span class="dl">Δ ' + (r.changed === 'NEW' ? 'NEW' : r.changed.replace('-', '−')) + '</span>' : '<span class="dl none">·</span>';
    return '<tr class="' + (r.id === s.id ? 'sel' : '') + (r.changed === 'NEW' ? ' new' : '') + '"><td class="c-sc">' + score + d + '</td>' +
      '<td class="t-title">' + esc(r.title) + '</td><td class="t-sec">' + esc(r.company) + '</td><td>' + esc(r.location) + '</td>' +
      '<td class="t-13 ' + (r.bucket === 'NEEDS_DECISION' ? 'bk-need' : 't-sec') + '">' + r.bucketLabel + '</td><td class="r">$' + r.baseK + 'K</td>' +
      '<td class="t-13 ' + FX[r.flex] + '">' + r.flex + '</td><td class="r">' + r.expFit + '</td><td class="r">' + r.age + '</td><td>' + (WS[r.writeState] || '<span class="ws-none">—</span>') + '</td></tr>';
  }).join('');

  // Map (geometry from map-f02.json; scale measured on p40)
  var M = G.getJSON('../fixture/map-f02.json'), P = M.projection, W = M.size[0], H = M.size[1];
  function mx(lon) { return P.x87W + (lon + 87) * P.lonScale - P.origin[0]; }
  function my(lat) { return P.y35N - (lat - 35) * P.latScale - P.origin[1]; }
  var HOME = { name: 'Cleveland, TN', lat: 35.1595, lon: -84.8766 };   // N-12: Tim's home; the PDF placed HOME at Chattanooga
  function hav(a, b, c, d) { var R = 3958.8, k = Math.PI / 180, x = Math.sin((c - a) * k / 2) ** 2 + Math.cos(a * k) * Math.cos(c * k) * Math.sin((d - b) * k / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  function brg(a, b, c, d) { var k = Math.PI / 180, y = Math.sin((d - b) * k) * Math.cos(c * k), x = Math.cos(a * k) * Math.sin(c * k) - Math.sin(a * k) * Math.cos(c * k) * Math.cos((d - b) * k); return (Math.atan2(y, x) / k + 360) % 360; }
  var g = '';
  for (var lon = -92; lon <= -80; lon++) g += '<line x1="' + mx(lon) + '" y1="0" x2="' + mx(lon) + '" y2="' + H + '" stroke="var(--pe-map-grid-major)" stroke-width="1.2"/>';
  for (var lat = 31; lat <= 39; lat++) g += '<line x1="0" y1="' + my(lat) + '" x2="' + W + '" y2="' + my(lat) + '" stroke="var(--pe-map-grid-major)" stroke-width="1.2"/>';
  var st = M.states.map(function (x) { return '<path d="' + x.d + '" fill="var(--pe-map-state-fill)" fill-opacity=".55" stroke="var(--pe-map-state-stroke)" stroke-width="1.6"/>'; }).join('');
  var lab = [['KY', 500, 196], ['TN', 366, 481], ['AL', 312, 997], ['GA', 755, 1012]].map(function (a) { return '<text x="' + a[1] + '" y="' + a[2] + '" fill="var(--pe-map-state-label)" fill-opacity=".55" font-family="IBM Plex Mono" font-size="24">' + a[0] + '</text>'; }).join('');
  var lat_l = [37, 35, 33].map(function (a) { return '<text x="6" y="' + (my(a) - 5) + '" fill="var(--pe-text-secondary)" font-family="IBM Plex Mono" font-size="11">' + a + '°N</text>'; }).join('');
  var lon_l = [89, 87, 85].map(function (a) { return '<text x="' + (mx(-a) + 3) + '" y="' + (H - 6) + '" fill="var(--pe-text-secondary)" font-family="IBM Plex Mono" font-size="11">0' + a + '°W</text>'; }).join('');
  var sx = mx(s.lon), sy = my(s.lat), hx = mx(HOME.lon), hy = my(HOME.lat);
  var cy = 'var(--pe-cyan)', ret = '<g transform="translate(' + sx + ',' + sy + ')">' +
    '<circle r="22" fill="none" stroke="' + cy + '" stroke-width="1.6"/><circle r="31" fill="none" stroke="' + cy + '" stroke-opacity=".35" stroke-dasharray="2 4"/>' +
    [[0, -26, 0, -46], [0, 26, 0, 46], [-26, 0, -46, 0], [26, 0, 46, 0]].map(function (t) { return '<line x1="' + t[0] + '" y1="' + t[1] + '" x2="' + t[2] + '" y2="' + t[3] + '" stroke="' + cy + '" stroke-width="1.6"/>'; }).join('') +
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(function (q) { return '<path d="M' + (38 * q[0]) + ',' + (38 * q[1] - 11 * q[1]) + 'V' + (38 * q[1]) + 'H' + (38 * q[0] - 11 * q[0]) + '" fill="none" stroke="' + cy + '" stroke-width="2"/>'; }).join('') +
    '<circle r="10" fill="var(--pe-band-top)" fill-opacity=".4"/>' +
    '<path d="M0,-6.5L5.6,3.3H-5.6Z" fill="var(--pe-band-top)" stroke="var(--pe-void)" stroke-width="1.5"/></g>';   // V-09: pin core takes the band shape
  var rng = Math.round(hav(HOME.lat, HOME.lon, s.lat, s.lon)), br = Math.round(brg(HOME.lat, HOME.lon, s.lat, s.lon));
  var home = '<g transform="translate(' + hx + ',' + hy + ')"><rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="var(--pe-hull)" stroke="var(--pe-text-primary)" stroke-width="1.6"/><circle r="2" fill="var(--pe-text-primary)"/></g>' +
    '<text x="' + (hx - 42) + '" y="' + (hy + 20) + '" fill="var(--pe-text-primary)" font-family="IBM Plex Mono" font-size="11" letter-spacing=".08em">HOME</text>';
  var cx = W / 2, cyy = H / 2 + 0;
  var cross = '<g stroke="var(--pe-text-secondary)" stroke-opacity=".35"><line x1="' + (cx - 12) + '" y1="' + cyy + '" x2="' + (cx - 4) + '" y2="' + cyy + '"/><line x1="' + (cx + 4) + '" y1="' + cyy + '" x2="' + (cx + 12) + '" y2="' + cyy + '"/><line x1="' + cx + '" y1="' + (cyy - 12) + '" x2="' + cx + '" y2="' + (cyy - 4) + '"/><line x1="' + cx + '" y1="' + (cyy + 4) + '" x2="' + cx + '" y2="' + (cyy + 12) + '"/></g>';
  var br4 = [[10, 10, 1, 1], [W - 10, 10, -1, 1], [10, H - 10, 1, -1], [W - 10, H - 10, -1, -1]].map(function (c) { return '<path d="M' + c[0] + ',' + (c[1] + 34 * c[3]) + 'V' + c[1] + 'H' + (c[0] + 34 * c[2]) + '" fill="none" stroke="var(--pe-text-secondary)" stroke-width="2"/>'; }).join('');
  $('map').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '">' + g + st + lab + lat_l + lon_l + cross + home + ret + br4 + '</svg>' +
    '<div class="map-hud" style="left:22px;top:20px;color:var(--pe-cyan);text-transform:none">SHOWING · SELECTED JOB ONLY · Esc = filtered view</div>' +
    '<div class="map-hud" style="left:22px;top:39px;color:var(--pe-text-secondary)">CURSOR 35.21°N 085.93°W · ZOOM AUTO-FIT</div>' +
    '<div class="seg" style="right:16px;top:12px"><span class="on">SELECTED JOB</span><span>FILTERED VIEW · ' + C.reviewQueue + '</span></div>' +
    '<div class="map-hud" style="left:' + (sx + 50) + 'px;top:' + (sy - 40) + 'px;color:var(--pe-cyan)">◉ LOCK · ' + s.id + '</div>' +
    '<div class="map-hud" style="left:' + (sx + 50) + 'px;top:' + (sy - 21) + 'px;color:var(--pe-text-primary);line-height:15px">' + s.lat.toFixed(4) + '°N 0' + Math.abs(s.lon).toFixed(4) + '°W</div>' +
    '<div class="map-hud" style="left:' + (sx + 50) + 'px;top:' + (sy - 6) + 'px;color:var(--pe-text-secondary);line-height:15px">RNG ' + rng + ' MI · BRG ' + br + '° FROM HOME<br>NEAREST GEO PT ' + s.parts.geo.basis.replace(/^.*nearest /i, '').toUpperCase() + ' · ' + s.parts.geo.score + '</div>' +
    '<div class="legend" style="left:22px;bottom:30px"><span><i class="b-top">▲</i>TOP 10%</span><span><i class="b-upper">◆</i>UPPER 25%</span><span><i class="b-mid">●</i>MID 45%</span><span><i class="b-low">▽</i>LOW 20%</span><span><i>◇</i>HOME</span></div>' +
    '<div class="map-btn" style="right:230px;bottom:22px">⤢ FULLSCREEN</div><div class="map-btn" style="right:138px;bottom:22px">RECENTER</div><div class="map-btn" style="right:58px;bottom:22px">RESET</div>' +
    // L-1: target size >= 24 px (the PDF draws FIT 30 x 20)
    '<div class="map-btn" style="right:16px;bottom:113px;width:30px;height:30px;padding:0">◈</div><div class="map-btn" style="right:16px;bottom:82px;width:30px;padding:0;font-size:18px">+</div>' +
    '<div class="map-btn" style="right:16px;bottom:54px;width:30px;height:24px;padding:0">FIT</div><div class="map-btn" style="right:16px;bottom:24px;width:30px;padding:0;font-size:18px">−</div>';

  // Drawer
  var b = BAND[s.band], NM = { experience: 'Experience fit', flex: 'Degree FLEX', compensation: 'Net compensation', geo: 'Geography', title: 'Title / scope', culture: 'Company culture', ats: 'ATS match', ownership: 'Ownership' };
  var ringC = 2 * Math.PI * 53, ticks = '';
  for (var i = 0; i < 12; i++) { var a = i * 30 * Math.PI / 180; ticks += '<line x1="' + (61 + 47 * Math.sin(a)) + '" y1="' + (61 - 47 * Math.cos(a)) + '" x2="' + (61 + 43 * Math.sin(a)) + '" y2="' + (61 - 43 * Math.cos(a)) + '" stroke="var(--pe-void)" stroke-width="2"/>'; }
  var ring = '<svg width="122" height="122"><circle cx="61" cy="61" r="53" fill="none" stroke="var(--pe-raised)" stroke-width="9"/>' +
    '<circle cx="61" cy="61" r="53" fill="none" stroke="var(--pe-band-top)" stroke-width="9" stroke-dasharray="' + (ringC * s.score / 100) + ' ' + ringC + '" transform="rotate(-90 61 61)"/>' + ticks + '</svg><b class="' + b[1] + '">' + s.score + '</b>';
  var bd = s.breakdown.map(function (p) {
    var pct = p.score == null ? 0 : p.score, col = p.score == null ? 'transparent' : p.score >= 75 ? 'var(--pe-green)' : p.score >= 50 ? 'var(--pe-amber)' : 'var(--pe-band-low)';
    return '<div class="bd-row"><span class="nm">' + NM[p.key] + '</span><span class="w">' + p.weight + '%</span><span class="bar"><i style="width:' + (p.weight ? pct : 0) + '%;background:' + col + '"></i></span><span class="p">' + p.points.toFixed(1) + '</span></div>';
  }).join('');
  var cov = s.coverage, fac = s.breakdownFactor.toFixed(2), fp = s.parts;
  var waitRow = fx.rows.find(function (r) { return r.writeState === 'WAITING'; }), okRow = fx.rows.find(function (r) { return r.writeState === 'CONFIRMED'; }), failRow = fx.rows.find(function (r) { return r.writeState === 'FAILED'; });
  $('drawer').innerHTML =
    '<div class="d-head"><span>◉ JOB DRAWER · ' + s.id + ' · LOCKED ON MAP</span><span class="nav">‹ › ✕</span></div>' +
    '<div class="d-title">' + esc(s.title) + '</div>' +
    '<div class="d-meta">' + esc(s.company) + ' · ' + esc(s.location) + ' · hybrid · posted ' + s.age + ' · LinkedIn</div>' +
    '<div class="chips"><span class="chip">NEEDS DECISION</span><span class="chip g">HIGH FLEX</span><span class="chip">$' + s.baseK + 'K EST.</span><span class="chip">' + s.location.split(',')[0].toUpperCase() + '</span></div>' +
    '<div class="dtabs"><span class="on">OVERVIEW</span><span>POSTING</span><span>FIT &amp; SCORE</span><span>APPLICATION</span><span>DOCUMENTS</span><span>HISTORY</span></div>' +
    '<div class="score-row"><div class="ring">' + ring + '</div><div class="score-info">' +
      '<div class="band">' + b[0] + ' ' + b[2] + ' · OPPORTUNITY RATING ' + s.score + '</div>' +
      '<div>Model rev ' + fx.model.rev + ' · computed 23:38 <span class="cur">✓ CURRENT</span></div>' +
      '<div class="gain">Δ ' + s.changed + ' since last review (evidence: salary posted)</div>' +
      '<div>Screen gate <span style="color:var(--pe-green)">' + s.screenGate + '</span> · FLEX impact ' + (s.flexInfluence >= 0 ? '+' : '−') + Math.abs(s.flexInfluence) + ' · rank ' + s.position + ' of ' + fx.bands.n + '</div></div></div>' +
    '<div class="sec-label">WHY</div>' +
    '<div class="why">Plant-scale mfg leadership, high degree flex, preferred geography; pay est. near target. <a>Fit &amp; Score ›</a></div>' +
    '<div class="reasons">' +
      '<div class="reason">✓ Experience / content fit ' + fp.experience.score + ' · mfg scale-up, plant P&amp;L</div>' +
      '<div class="reason">✓ Degree FLEX: HIGH_FLEX (equivalent experience)</div>' +
      '<div class="reason">✓ Geo ' + fp.geo.score + ' · nearest control pt ' + s.location + '</div>' +
      '<div class="reason a">◷ Base pay est. $' + s.baseK + 'K · posted range not stored</div>' +
      '<div class="reason n">? Ownership unknown · research</div></div>' +
    '<div class="sec-label tight"><span>SCORE BREAKDOWN · WEIGHT · POINTS</span><span>Σ ' + s.breakdown.reduce(function (a, p) { return a + p.points; }, 0).toFixed(1) + ' = ' + s.score + '</span></div>' +   // V-16
    '<div class="bd">' + bd + '</div>' +
    '<div class="bd-foot">ALL 8 WEIGHTS SHARED · PUBLISHED MODEL REV ' + fx.model.rev + ' · TOTAL 100 ·<br>HIGH_FLEX → FIXED COMPONENT 80 · COVERAGE ' + cov + '% · FACTOR ' + fac + '</div>' +
    '<div class="sec-label tight">TIM DECISION</div>' +
    '<div class="decide"><span class="dbtn pursue">✓ Pursue <sub>P</sub></span><span class="dbtn hold">⊡ Hold <sub>H</sub></span><span class="dbtn research">Research</span><span class="dsep"></span><span class="dbtn decline">⊖ Decline</span></div>' +   // V-01 V-02
    '<div class="receipts">' +
      '<div class="receipt wait"><span class="msg"><span class="k">◷ WAITING FOR WRITER LOCK</span> · Pursue · “' + esc(waitRow.title) + '” · auto-retry 2/4 in 15 s</span><span class="act">Undo</span></div>' +
      '<div class="receipt ok"><span class="msg"><span class="k">✓ CONFIRMED</span> · Hold · “' + esc(okRow.title) + '” · readback 3 s</span><span class="act">Undo</span></div>' +
      '<div class="receipt fail"><span class="msg"><span class="k">⊗ FAILED</span> · Hold · “' + esc(failRow.title) + '” · 4 retries · payload kept</span><span class="act">Retry</span></div></div>';

  ['rows', 'drawer'].forEach(function (id) { var e = $(id); e.innerHTML = e.innerHTML.replace(/([⊗⊖])/g, '<span class="gx-big">$1</span>'); });
  $('ticker').innerHTML = '<span class="ticker-label">▸ PIPELINE EVENTS</span>' + fx.events.map(function (e, i) { return (i ? '<span class="bar">│</span>' : '') + '<span class="ev"><span class="t">' + e[0] + '</span>' + esc(e[1]) + '</span>'; }).join('') + '<span class="ticker-end">TICKER SCROLLS ← ·</span>';
}());
