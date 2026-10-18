/* Grok Bot · Oct 15 look pages. Fork of rev3 F02-job-selected.js (c69a9f0) with the R3 corrections applied.
   Every number comes from the scenario fixture (fx-*.json, scoreRow model rev 24) or is computed from it (L-2).
   window.PAGE = { fx, mode: 'selected' | 'empty', variant: null | 'agency' | 'closed' | 'applied', tab, hdr: {...} } */
var G = (function () {
  function getJSON(url) { var x = new XMLHttpRequest(); x.open('GET', url, false); x.send(null); return JSON.parse(x.responseText); }
  var P = window.PAGE || {};
  if (location.hash.length > 1) { try { Object.assign(P, JSON.parse(decodeURIComponent(location.hash.slice(1)))); } catch (e) {} }
  var fx = getJSON(P.fx || 'fx-base.json');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var BAND = { TOP: ['▲', 'b-top', 'TOP 10%'], UPPER: ['◆', 'b-upper', 'UPPER 25%'], MID: ['●', 'b-mid', 'MID 45%'], LOW: ['▽', 'b-low', 'LOW 20%'], HOLD: ['⊘', 'b-hold', 'HOLD'], NONE: ['', 'b-hold', 'NOT RANKED'] };
  return { fx: fx, esc: esc, BAND: BAND, getJSON: getJSON, P: P };
}());
(function () {
  var fx = G.fx, esc = G.esc, BAND = G.BAND, PG = G.P, C = fx.counters, X = fx.oct15, B = fx.bands, H0 = PG.hdr || {};
  var s = PG.mode === 'empty' ? null : fx.rows.find(function (r) { return r.id === fx.selectedId; });
  function $(id) { return document.getElementById(id); }
  var bc = { TOP: 'var(--pe-band-top)', UPPER: 'var(--pe-band-upper)', MID: 'var(--pe-band-mid)', LOW: 'var(--pe-band-low)', HOLD: 'var(--pe-red)', NONE: 'var(--pe-text-secondary)' };

  /* ---------- Header (Q1 · M-05 · M-06): one Writer pill + p40 mono status text. Glyph + word for every non-normal state. ---------- */
  var wW = H0.writerWaiting != null ? H0.writerWaiting : C.writerWaiting, wF = H0.writerFailed != null ? H0.writerFailed : C.writerFailed;
  var wState = H0.writerState || X.writer.state, unreach = wState === 'NOT ANSWERING';
  var dot = unreach || wF ? 'var(--pe-red)' : (wW || wState !== 'IDLE') ? 'var(--pe-amber)' : 'var(--pe-green)';
  var pill = '<span class="dot" style="background:' + dot + '"></span>WRITER ' + wState;
  if (wW) pill += ' · <span class="gw" style="color:var(--pe-amber)">◷</span>' + wW + ' WAITING';
  if (wF) pill += ' · <span class="gw" style="color:var(--pe-red)">⊗</span>' + wF + ' FAILED';
  pill += unreach ? ' · LAST ANSWER ' + (H0.writerLast || '') : ' · REFRESH 0:' + X.writer.refreshS;
  $('writer-pill').innerHTML = pill;
  if (unreach || wF) $('writer-pill').style.borderColor = 'var(--pe-outline)';
  var lq = H0.laneQueue != null ? H0.laneQueue : C.laneQueue, lqo = H0.laneQueueOldestMin != null ? H0.laneQueueOldestMin : C.laneQueueOldestMin;
  var seen = H0.seen || X.seenSync, lanes = H0.lanes || X.lanes, segs = [];   // [severity 2 red / 1 amber / 0 normal, html]
  if (seen.state !== 'OK') segs.push([2, '<span class="seg-t att"><span class="gw" style="color:var(--pe-red)">⊗</span><u>SEEN MARKS NOT SAVING</u> · SINCE ' + seen.since + '</span>']);   // healthy = silent
  segs.push(lqo >= 30 ? [1, '<span class="seg-t att"><span class="gw" style="color:var(--pe-amber)">▸</span>LANE QUEUE ' + lq + ' · OLDEST ' + lqo + ' MIN</span>'] : [0, '<span class="seg-t">LANE QUEUE ' + lq + (lq ? ' · OLDEST ' + lqo + ' MIN' : '') + '</span>']);
  segs.push(lanes.quiet || lanes.unfinished ? [1, '<span class="seg-t att"><span class="gw" style="color:var(--pe-amber)">▸</span><u>' + (lanes.quiet ? lanes.quiet + ' LANE QUIET' : '') + (lanes.quiet && lanes.unfinished ? ' · ' : '') + (lanes.unfinished ? lanes.unfinished + ' RUN UNFINISHED' : '') + '</u></span>'] : [0, '<span class="seg-t">LANES ' + lanes.n + ' OK</span>']);
  segs.push([0, '<span class="seg-t">LAST SYNC ' + (H0.lastSync || fx.asOf) + '</span>']);
  // order: red, amber, then normal in fixed order; anything that does not fit folds into "+N MORE ▾" (opens Needs you)
  segs = segs.map(function (x, i) { return [x[0], x[1], i]; }).sort(function (a, b) { return (b[0] - a[0]) || (a[2] - b[2]); });
  var hm = $('hdr-meta'), shown = segs.length;
  hm.innerHTML = segs.map(function (x) { return x[1]; }).join('');
  while (hm.scrollWidth > hm.clientWidth && shown > 1) { shown--; hm.innerHTML = segs.slice(0, shown).map(function (x) { return x[1]; }).join('') + '<span class="seg-t att"><u>+' + (segs.length - shown) + ' MORE ▾</u></span>'; }
  if (H0.bell != null) $('bell-n').textContent = H0.bell;
  if (PG.crumb) document.querySelector('.crumb').innerHTML = PG.crumb;
  if (PG.search) { var sp = document.querySelector('.s-ph'); sp.textContent = PG.search; sp.style.color = 'var(--pe-text-primary)'; }
  if (PG.rail) [].slice.call(document.querySelectorAll('.rail-item')).forEach(function (a) { a.classList.toggle('on', a.textContent.indexOf(PG.rail) >= 0); });
  if (PG.shellOnly) return;

  var tab = PG.tab || 'REVIEW QUEUE';
  $('subtabs').innerHTML = [['JOBS', C.jobs], ['REVIEW QUEUE', C.reviewQueue], ['DECLINE CANDIDATES', C.declineCandidates], ['MY RULINGS', C.myRulings], ['MAP'], ['TRENDS'], ['COMPARE', C.compare + '/3']].concat(PG.extraTab ? [PG.extraTab] : [])
    .map(function (t) { return '<span class="tab' + (t[0] === tab ? ' on' : '') + '">' + t[0] + (t[1] != null ? '<b>' + t[1] + '</b>' : '') + '</span>'; }).join('') +
    '<span class="vf">VIEW &amp; FILTERS: ' + (PG.filter || 'SCORE ≥ 45 · ALL SOURCES') + ' <span class="edit">▾ EDIT</span></span>';

  /* KPI tiles: no tile is active while the table shows the whole review queue (meaning: an active tile = a filter that is on) */
  var kp = [
    { l: 'NEEDS DECISION', v: C.needsDecision, cap: 'Open, undecided · live rows', go: 1 },
    { l: 'APPLIED · ALL TIME', v: C.appliedAllTime, cap: '✓ Writer-confirmed · live rows', color: 'var(--pe-green)', go: 1 },
    { l: 'RESEARCH', v: C.research, cap: 'Manual research bucket' },
    { l: 'INTERVIEWS · 14D', v: C.interviews14d, cap: 'Application tab dates', color: 'var(--pe-text-muted)', go: 1 },
    { l: 'WRITER · WAITING / FAILED', v: C.writerWaiting + ' / ' + C.writerFailed, cap: '◷ lock busy · auto-retry 8/15/30/45 s', color: 'var(--pe-amber)', go: 1 },
    { l: 'STALE EVIDENCE', v: C.staleEvidence, cap: '<span style="color:var(--pe-olive)">◌</span> FLEX class stamped under older rule', color: 'var(--pe-olive)', go: 1, bar: Math.round(C.staleEvidence / C.jobs * 100) }   // T-6: denominator computed (all jobs), p40 typed 603
  ];
  $('kpis').innerHTML = kp.map(function (k) {
    return '<div class="kpi' + (PG.kpiActive === k.l ? ' active' : '') + '"><div class="k-label">' + k.l + '</div><div class="k-val"' + (k.color ? ' style="color:' + k.color + '"' : '') + '>' + k.v + '</div><div class="k-cap">' + k.cap + '</div>' +
      (k.go ? '<span class="k-go">›</span>' : '') + (k.bar ? '<span class="k-bar"><i style="width:' + k.bar + '%"></i></span>' : '') + '</div>';
  }).join('');

  var L = fx.sinceLastReview;
  $('strip').innerHTML = '<span class="strip-label">SINCE YOUR LAST REVIEW · ' + fx.lastReview + '</span>' +
    '<span class="u">Δ ' + L.newRows + ' new</span><span class="sep">·</span><span class="u">Δ ' + L.evidenceUpdates + ' evidence updates (e.g. FLEX HIGH→NO)</span><span class="sep">·</span>' +
    '<span class="bad u">⊗ ' + C.writerFailed + ' write failed</span><span class="sep">·</span><span class="warn">◷ ' + C.writerWaiting + ' waiting for lock</span><span class="sep">·</span>' +
    '<span class="muted">◌ ' + L.provisional + ' provisional</span>' +
    '<span class="right">' + (PG.stripRight || (s ? 'MAP SHOWS: SELECTED JOB · ESC → FILTERED VIEW (' + C.reviewQueue + ')' : 'MAP SHOWS: FILTERED VIEW (' + C.reviewQueue + ') · SELECT A JOB TO LOCK ON')) + '</span>';

  /* ---------- Table: p40 grid, 11 columns + 6 px bar ---------- */
  var tableRows = PG.rows ? PG.rows(fx) : fx.rows.filter(function (r) { return r.liveness === 'OPEN' && r.bucket !== 'APPLIED'; });
  var vis = tableRows.slice(0, PG.visible || 30);
  $('tq-title').textContent = PG.tableTitle || ('REVIEW QUEUE · ' + C.reviewQueue + ' · ' + vis.length + ' VISIBLE');
  $('tq-meta').textContent = PG.tableMeta || ('SORT: SCORE ↓ · 11 COLUMNS · BANDS = PERCENTILE (REV ' + fx.model.rev + ' · N ' + B.n + ' · P90 ' + B.cuts.top + ' · P65 ' + B.cuts.upper + ' · P20 ' + B.cuts.low + ' · ' + fx.asOf + ')');
  var R = X.receipts;
  var WS = { WAITING: '<span class="ws-wait">◷ Waiting for lock · ' + R.wait.waitS + ' s</span>', CONFIRMED: '<span class="ws-ok">✓ Confirmed · ' + R.ok.readbackS + ' s</span>', FAILED: '<span class="ws-fail">⊗ Failed · Retry</span>' };
  var FXC = { 'High flex': 'fx-high', 'Soft flex': 'fx-soft', 'No flex': 'fx-no', 'Unknown': 'fx-unknown', 'Strict': 'fx-strict' };
  var BKC = { NEEDS_DECISION: 'bk-need', SCOUT_INTAKE: 'bk-olive', DISCOVERY_LEAD: 'bk-olive', APPLIED: 'ws-ok' };
  document.querySelector('#grid colgroup').innerHTML = [6, 72, 44, 192, 120, 120, 118, 80, 92, 64, 38, 0]   /* T-10: BUCKET 104->110, AGE 36->30 content (+8 px cell padding) */.map(function (w) { return w ? '<col style="width:' + w + 'px">' : '<col>'; }).join('');
  document.querySelector('#grid thead').innerHTML = '<tr><th></th><th class="r">SCORE</th><th>Δ</th><th>TITLE</th><th>COMPANY</th><th>LOCATION</th><th>BUCKET</th><th class="r">BASE EST</th><th>DEGREE FLEX</th><th class="r">EXP FIT</th><th class="r">AGE</th><th>WRITE STATE</th></tr>';
  function scoreCell(r) {
    var b = BAND[r.band], st = r.staleEvidence ? '<span class="st">◌</span>' : '';
    if (r.hold) return st + '<span class="v b-hold">' + r.score + '</span><span class="hold-tag">⊘ HOLD</span>';
    if (r.band === 'NONE') return st + '<span class="v b-hold">' + r.score + '</span><span class="g b-hold">—</span>';
    return st + '<span class="v ' + b[1] + '">' + r.score + '</span><span class="g ' + b[1] + '">' + b[0] + '</span>';
  }
  function wsCell(r) {
    if (r.liveness && r.liveness !== 'OPEN') return '<span class="ws-none">∅ Posting closed</span>';
    if (r.bucket === 'APPLIED') return '<span class="ws-ok">✓ Applied · @ email</span>';
    return WS[r.writeState] || '<span class="ws-none">—</span>';
  }
  $('rows').innerHTML = vis.map(function (r, i) {
    var d = r.changed ? '<td class="c-d">Δ ' + (r.changed === 'NEW' ? 'NEW' : r.changed.replace('-', '−')) + '</td>' : '<td class="c-d none">·</td>';
    var co = PG.companyCell ? PG.companyCell(r) : esc(r.company);
    return '<tr class="' + (s && r.id === s.id ? 'sel' : '') + (r.changed === 'NEW' ? ' new' : '') + '"><td class="bar"><i></i></td><td class="c-score">' + scoreCell(r) + '</td>' + d +
      '<td class="t-title">' + esc(r.title) + '</td><td class="t-sec">' + co + '</td><td class="t-loc">' + esc(r.location) + '</td>' +
      '<td class="t-13 ' + (BKC[r.bucket] || 't-sec') + '">' + r.bucketLabel + '</td><td class="t-base">$' + r.baseK + 'K</td>' +
      '<td class="t-13 ' + FXC[r.flex] + '">' + r.flex + '</td><td class="t-num">' + r.expFit + '</td><td class="t-num">' + r.age + '</td><td class="ws">' + wsCell(r) + '</td></tr>';
  }).join('');
  // new-row fade spans the whole row (p40: 0 at 55 % of the row)
  [].slice.call(document.querySelectorAll('#rows tr.new td')).forEach(function (td) { td.style.backgroundPosition = (-td.offsetLeft) + 'px 0'; });

  /* ---------- Map ---------- */
  var HOME = { name: 'Cleveland, TN', lat: 35.1595, lon: -84.8766 };
  function core(band, c) {
    if (band === 'TOP') return '<path d="M0,-6.5L5.6,3.3H-5.6Z" fill="' + c + '" stroke="var(--pe-void)" stroke-width="1.5"/>';
    if (band === 'UPPER') return '<path d="M0,-6.5L6.5,0L0,6.5L-6.5,0Z" fill="' + c + '" stroke="var(--pe-void)" stroke-width="1.5"/>';
    if (band === 'MID') return '<circle r="5" fill="' + c + '" stroke="var(--pe-void)" stroke-width="1.5"/>';
    if (band === 'LOW') return '<path d="M0,5.8L5.6,-3.6H-5.6Z" fill="var(--pe-void)" stroke="' + c + '" stroke-width="1.6"/>';
    if (band === 'NONE') return '<circle r="5" fill="var(--pe-void)" stroke="' + c + '" stroke-width="1.6"/>';
    return '<circle r="5.2" fill="var(--pe-void)" stroke="' + c + '" stroke-width="1.6"/><line x1="-3.6" y1="3.6" x2="3.6" y2="-3.6" stroke="' + c + '" stroke-width="1.6"/>';
  }
  function hav(a, b, c, d) { var R = 3958.8, k = Math.PI / 180, x = Math.sin((c - a) * k / 2) ** 2 + Math.cos(a * k) * Math.cos(c * k) * Math.sin((d - b) * k / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  function brg(a, b, c, d) { var k = Math.PI / 180, y = Math.sin((d - b) * k) * Math.cos(c * k), x = Math.cos(a * k) * Math.sin(c * k) - Math.sin(a * k) * Math.cos(c * k) * Math.cos((d - b) * k); return (Math.atan2(y, x) / k + 360) % 360; }
  var br4 = function (W, H) { return [[10, 10, 1, 1], [W - 10, 10, -1, 1], [10, H - 10, 1, -1], [W - 10, H - 10, -1, -1]].map(function (c) { return '<path d="M' + c[0] + ',' + (c[1] + 34 * c[3]) + 'V' + c[1] + 'H' + (c[0] + 34 * c[2]) + '" fill="none" stroke="var(--pe-text-secondary)" stroke-width="2"/>'; }).join(''); };
  function cross(cx, cy) { return '<g stroke="var(--pe-text-secondary)" stroke-opacity=".35"><line x1="' + (cx - 12) + '" y1="' + cy + '" x2="' + (cx - 4) + '" y2="' + cy + '"/><line x1="' + (cx + 4) + '" y1="' + cy + '" x2="' + (cx + 12) + '" y2="' + cy + '"/><line x1="' + cx + '" y1="' + (cy - 12) + '" x2="' + cx + '" y2="' + (cy - 4) + '"/><line x1="' + cx + '" y1="' + (cy + 4) + '" x2="' + cx + '" y2="' + (cy + 12) + '"/></g>'; }
  var cnt = {}; tableRows.forEach(function (r) { cnt[r.band] = (cnt[r.band] || 0) + 1; });
  var zoom = '<div class="map-btn" style="right:16px;bottom:206px;width:30px;height:30px;padding:0">◈</div><div class="map-btn" style="right:16px;bottom:172px;width:30px;padding:0;font-size:18px">+</div>' +
    '<div class="map-btn" style="right:16px;bottom:142px;width:30px;height:24px;padding:0">FIT</div><div class="map-btn" style="right:16px;bottom:108px;width:30px;padding:0;font-size:18px">−</div>';
  var hudband = '<div class="map-hudband" style="bottom:0;height:84px;border-top:1px solid var(--pe-seam)"></div>' +
    '<div class="map-btn" style="right:16px;bottom:14px">RESET</div><div class="map-btn" style="right:96px;bottom:14px">RECENTER</div><div class="map-btn" style="right:188px;bottom:14px">⤢ FULLSCREEN</div>';
  function legend(withCounts) {
    var k = function (b) { return withCounts ? ' ' + (cnt[b] || 0) : ''; };
    return '<div class="legend" style="left:22px;bottom:52px;align-items:center;height:20px"><span><i class="b-top">▲</i>TOP' + (withCounts ? k('TOP') : ' 10%') + '</span><span><i class="b-upper">◆</i>UPPER' + (withCounts ? k('UPPER') : ' 25%') + '</span><span><i class="b-mid">●</i>MID' + (withCounts ? k('MID') : ' 45%') + '</span><span><i class="b-low">▽</i>LOW' + (withCounts ? k('LOW') : ' 20%') + '</span><span><i style="color:var(--pe-red)">⊘</i>HOLD' + k('HOLD') + '</span><span><i>◇</i>HOME</span></div>';
  }
  var M, P, W, H, mx, my, g = '', st, lab, latL, lonL;
  if (s && s.lat != null) {   // selected job: rev3 map-f02 geometry (p40 frame)
    M = G.getJSON('../fixture/map-f02.json'); P = M.projection; W = M.size[0]; H = M.size[1];
    mx = function (lon) { return P.x87W + (lon + 87) * P.lonScale - P.origin[0]; }; my = function (lat) { return P.y35N - (lat - 35) * P.latScale - P.origin[1]; };
    for (var lon = -92; lon <= -80; lon++) g += '<line x1="' + mx(lon) + '" y1="0" x2="' + mx(lon) + '" y2="' + H + '" stroke="var(--pe-map-grid-major)" stroke-width="1.2"/>';
    for (var lat = 31; lat <= 39; lat++) g += '<line x1="0" y1="' + my(lat) + '" x2="' + W + '" y2="' + my(lat) + '" stroke="var(--pe-map-grid-major)" stroke-width="1.2"/>';
    st = M.states.map(function (x) { return '<path d="' + x.d + '" fill="var(--pe-map-state-fill)" fill-opacity=".55" stroke="var(--pe-map-state-stroke)" stroke-width="1.6"/>'; }).join('');
    // T-5 (Claude rec, Tim ruling 19:23 ET): #6B6B66 at full opacity = 3.67:1 (p40 .55 opacity was 2.55:1). Positions moved clear of the legend, brackets and zoom stack.
    lab = [['KY', 500, 196], ['TN', 366, 481], ['AL', 312, 900], ['GA', 690, 900]].map(function (a) { return '<text x="' + a[1] + '" y="' + a[2] + '" fill="var(--pe-map-state-label)" font-family="IBM Plex Mono" font-size="24">' + a[0] + '</text>'; }).join('');
    latL = [37, 35, 33].map(function (a) { return '<text x="8" y="' + (my(a) - 5) + '" fill="var(--pe-text-secondary)" font-family="IBM Plex Mono" font-size="11">' + a + '°N</text>'; }).join('');
    lonL = [89, 87, 85].map(function (a) { return '<text x="' + (mx(-a) + 4) + '" y="' + (H - 94) + '" fill="var(--pe-text-secondary)" font-family="IBM Plex Mono" font-size="11">0' + a + '°W</text>'; }).join('');
    var sx = mx(s.lon), sy = my(s.lat), hx = mx(HOME.lon), hy = my(HOME.lat), c = bc[s.band];
    var ret = '<g transform="translate(' + sx + ',' + sy + ')"><circle r="22" fill="none" stroke="var(--pe-cyan)" stroke-width="1.6"/><circle r="31" fill="none" stroke="var(--pe-cyan)" stroke-opacity=".35" stroke-dasharray="2 4"/>' +
      [[0, -26, 0, -46], [0, 26, 0, 46], [-26, 0, -46, 0], [26, 0, 46, 0]].map(function (t) { return '<line x1="' + t[0] + '" y1="' + t[1] + '" x2="' + t[2] + '" y2="' + t[3] + '" stroke="var(--pe-cyan)" stroke-width="1.6"/>'; }).join('') +
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(function (q) { return '<path d="M' + (38 * q[0]) + ',' + (27 * q[1]) + 'V' + (38 * q[1]) + 'H' + (27 * q[0]) + '" fill="none" stroke="var(--pe-cyan)" stroke-width="2"/>'; }).join('') +
      '<circle r="10" fill="' + c + '" fill-opacity=".4"/>' + core(s.band, c) + '</g>';
    var home = '<g transform="translate(' + hx + ',' + hy + ')"><rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="var(--pe-hull)" stroke="var(--pe-text-primary)" stroke-width="1.6"/><circle r="2" fill="var(--pe-text-primary)"/></g>' +
      '<text x="' + (hx - 42) + '" y="' + (hy + 20) + '" fill="var(--pe-text-primary)" font-family="IBM Plex Mono" font-size="11" letter-spacing=".08em">HOME</text>';
    var lp = sx > W - 300 ? 'text-align:right;right:' + (W - sx + 50) + 'px;' : 'left:' + (sx + 50) + 'px;';   // readout flips left near the right edge
    var rng = Math.round(hav(HOME.lat, HOME.lon, s.lat, s.lon)), brn = Math.round(brg(HOME.lat, HOME.lon, s.lat, s.lon));
    $('map').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '">' + g + st + lab + latL + lonL + cross(W / 2, H / 2) + home + ret + br4(W, H) + '</svg>' +
      '<div class="map-hud" style="left:22px;top:20px;color:var(--pe-cyan);text-transform:none">SHOWING · SELECTED JOB ONLY · Esc = filtered view</div>' +
      '<div class="map-hud" style="left:22px;top:39px;color:var(--pe-text-secondary)">CURSOR — · ZOOM AUTO-FIT</div>' +
      '<div class="seg" style="right:16px;top:12px"><span class="on">SELECTED JOB</span><span>FILTERED VIEW · ' + C.reviewQueue + '</span></div>' +
      '<div class="map-hud" style="' + lp + 'top:' + (sy - 40) + 'px;color:var(--pe-cyan)">◉ LOCK · ' + s.id + '</div>' +
      '<div class="map-hud" style="' + lp + 'top:' + (sy - 21) + 'px;color:var(--pe-text-primary);line-height:15px">' + s.lat.toFixed(4) + '°N 0' + Math.abs(s.lon).toFixed(4) + '°W</div>' +
      '<div class="map-hud" style="' + lp + 'top:' + (sy - 6) + 'px;color:var(--pe-text-secondary);line-height:15px">RNG ' + rng + ' MI · BRG ' + ('00' + brn).slice(-3) + '° FROM HOME<br>NEAREST GEO PT ' + s.parts.geo.basis.replace(/^.*nearest /i, '').toUpperCase() + ' · ' + s.parts.geo.score + '</div>' +
      hudband + legend(false) + zoom;
  } else {   // filtered view (F01): auto-fit to the filtered set + HOME
    M = G.getJSON('../fixture/map-f01.json'); P = M.projection; W = M.size[0]; H = M.size[1];
    mx = function (lon) { return P.cx + (lon - P.lonc) * P.lonScale; }; my = function (lat) { return P.cy - (lat - P.latc) * P.latScale; };
    for (var lo = -100; lo <= -70; lo++) g += '<line x1="' + mx(lo) + '" y1="0" x2="' + mx(lo) + '" y2="' + H + '" stroke="' + (lo % 5 ? 'var(--pe-map-grid-minor)' : 'var(--pe-map-grid-major)') + '" stroke-width="' + (lo % 5 ? 1 : 1.2) + '"/>';
    for (var la = 24; la <= 48; la++) g += '<line x1="0" y1="' + my(la) + '" x2="' + W + '" y2="' + my(la) + '" stroke="' + (la % 5 ? 'var(--pe-map-grid-minor)' : 'var(--pe-map-grid-major)') + '" stroke-width="' + (la % 5 ? 1 : 1.2) + '"/>';
    st = M.states.map(function (x) { return '<path d="' + x.d + '" fill="var(--pe-map-state-fill)" fill-opacity=".55" stroke="var(--pe-map-state-stroke)" stroke-width="1.2"/>'; }).join('');
    var LAB = [['TN', -86.6, 35.75], ['KY', -85.3, 37.55], ['AL', -86.85, 32.6], ['GA', -83.5, 32.4], ['MS', -89.75, 32.7], ['NC', -79.6, 35.45], ['SC', -80.95, 33.65], ['VA', -78.8, 37.5], ['OH', -82.8, 40.3], ['IN', -86.3, 39.9], ['IL', -89.3, 40.0], ['FL', -81.7, 28.9], ['MI', -84.7, 43.4], ['AR', -92.4, 34.8], ['MO', -92.5, 38.4], ['TX', -97.2, 31.5], ['LA', -92.0, 31.0], ['WV', -80.6, 38.6], ['PA', -77.6, 40.9]];
    lab = LAB.map(function (a) { var x = mx(a[1]), y = my(a[2]); if (y < 120 || y > H - 110 || x < 40 || x > W - 80) return ''; return '<text x="' + x + '" y="' + y + '" text-anchor="middle" fill="var(--pe-map-state-label)" font-family="IBM Plex Mono" font-size="24">' + a[0] + '</text>'; }).join('');
    latL = [30, 35, 40].map(function (a) { return '<text x="8" y="' + (my(a) - 5) + '" fill="var(--pe-text-secondary)" font-family="IBM Plex Mono" font-size="11">' + a + '°N</text>'; }).join('');
    lonL = [95, 90, 85, 80, 75].map(function (a) { var x = mx(-a); if (x < 30 || x > W - 70) return ''; return '<text x="' + (x + 4) + '" y="' + (H - 94) + '" fill="var(--pe-text-secondary)" font-family="IBM Plex Mono" font-size="11">0' + a + '°W</text>'; }).join('');
    var mapped = tableRows.filter(function (r) { return r.lat != null; }), groups = {};
    mapped.forEach(function (r) { (groups[r.location] = groups[r.location] || []).push(r); });
    var pins = '', tags = '';
    Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a[0].score - b[0].score; }).forEach(function (grp) {
      var t = grp[0], x = mx(t.lon), y = my(t.lat), c = bc[t.band];
      pins += '<g transform="translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')"><circle r="10" fill="' + c + '" fill-opacity=".4"/>' + core(t.band, c) + '</g>';
      if (grp.length > 1) tags += '<text x="' + (x + 12).toFixed(1) + '" y="' + (y - 7).toFixed(1) + '" fill="var(--pe-text-secondary)" font-family="IBM Plex Mono" font-size="11" paint-order="stroke" stroke="var(--pe-hull)" stroke-width="3">×' + grp.length + '</text>';   // R-8
    });
    var hx2 = mx(HOME.lon), hy2 = my(HOME.lat);
    var home2 = '<g transform="translate(' + hx2 + ',' + hy2 + ')"><rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="var(--pe-hull)" stroke="var(--pe-text-primary)" stroke-width="1.6"/><circle r="2" fill="var(--pe-text-primary)"/></g>' +
      '<text x="' + (hx2 + 12) + '" y="' + (hy2 + 22) + '" fill="var(--pe-text-primary)" font-family="IBM Plex Mono" font-size="11" letter-spacing=".08em" paint-order="stroke" stroke="var(--pe-hull)" stroke-width="3">HOME</text>';
    document.querySelector('.map-panel .ph-title').innerHTML = '<span class="pg">◎</span> JOB LOCATION MAP · FILTERED VIEW';
    document.querySelector('.map-panel .ph-meta').textContent = mapped.length + ' PINS · ' + Object.keys(groups).length + ' PLACES · ' + (tableRows.length - mapped.length) + ' REMOTE (NO PIN)';
    $('map').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '">' + g + st + lab + latL + lonL + cross(W / 2, P.cy) + home2 + pins + tags + br4(W, H) + '</svg>' +
      '<div class="map-hud" style="left:22px;top:20px;color:var(--pe-text-primary)">SHOWING · FILTERED VIEW · ' + tableRows.length + ' JOBS</div>' +
      '<div class="map-hud" style="left:22px;top:39px;color:var(--pe-text-secondary)">CURSOR — · ZOOM AUTO-FIT (FILTERED SET)</div>' +
      '<div class="seg" style="right:16px;top:12px"><span class="off">SELECTED JOB · NONE</span><span class="on">FILTERED VIEW · ' + tableRows.length + '</span></div>' +
      hudband + legend(true) + zoom;
  }
  if (s && s.lat == null) { $('map').innerHTML += ''; }

  /* ---------- Drawer ---------- */
  if (!s) { emptyDrawer(); finish(); return; }
  var b = BAND[s.band], NM = { experience: 'Experience fit', flex: 'Degree FLEX', compensation: 'Net compensation', geo: 'Geography', title: 'Title / scope', culture: 'Company culture', ats: 'ATS match', ownership: 'Ownership' };
  var ringCol = s.band === 'NONE' ? 'var(--pe-text-secondary)' : bc[s.band];
  var Rr = 54, sw = 8, cc = Rr + sw, Cc = 2 * Math.PI * Rr, ticks = '';
  for (var a = 0; a < 360; a += 30) ticks += '<line x1="' + cc + '" y1="' + (sw / 2 - 3) + '" x2="' + cc + '" y2="' + (sw / 2 + 4) + '" stroke="var(--pe-gridline)" stroke-width="2" transform="rotate(' + a + ' ' + cc + ' ' + cc + ')"/>';
  var ring = '<svg width="124" height="124" viewBox="0 0 124 124"><circle cx="' + cc + '" cy="' + cc + '" r="' + Rr + '" fill="none" stroke="var(--pe-raised)" stroke-width="' + sw + '"/>' +
    '<circle cx="' + cc + '" cy="' + cc + '" r="' + Rr + '" fill="none" stroke="' + ringCol + '" stroke-width="' + sw + '" stroke-dasharray="' + (Cc * s.score / 100).toFixed(1) + ' ' + Cc.toFixed(1) + '" transform="rotate(-90 ' + cc + ' ' + cc + ')"/>' + ticks + '</svg><b style="color:' + ringCol + '">' + s.score + '</b>';
  var bd = s.breakdown.map(function (p) {
    if (!p.known) return '<div class="bd-row unk"><span class="nm">' + NM[p.key] + '</span><span class="w">' + p.weight + '%</span><span class="bar"></span><span class="p">UNKNOWN</span></div>';   // V-16
    var col = p.weight === 0 ? 'var(--pe-gridline)' : p.score >= 75 ? 'var(--pe-green)' : p.score >= 50 ? 'var(--pe-amber)' : 'var(--pe-band-low)';
    return '<div class="bd-row"><span class="nm">' + NM[p.key] + '</span><span class="w">' + p.weight + '%</span><span class="bar"><i style="width:' + (p.weight ? p.score : 0) + '%;background:' + col + '"></i></span><span class="p">' + p.points.toFixed(1) + '</span></div>';
  }).join('');
  var sum = s.breakdown.reduce(function (q, p) { return q + p.points; }, 0), knownW = s.breakdown.reduce(function (q, p) { return q + (p.known ? p.weight : 0); }, 0);
  var D = X.selected, fp = s.parts, V = PG.variant;
  function gate(v) { return v === 'PASS' ? '<span style="color:var(--pe-green)">✓ PASS</span>' : v === 'FAIL' ? '<span style="color:var(--pe-amber)">▸</span> <span style="color:var(--pe-text-primary)">FAIL</span>' : '<span>? ' + v + '</span>'; }
  var chips = V === 'agency' ? '<span class="chip need">NEEDS DECISION</span><span class="chip local">VIA AGENCY</span><span class="chip local">CLIENT UNKNOWN</span><span class="chip amb">SOFT FLEX</span><span class="chip prov">$' + s.baseK + 'K EST.</span>' :
    V === 'closed' ? '<span class="chip local">∅ POSTING CLOSED</span><span class="chip need">FILED: NEEDS DECISION</span><span class="chip ok">HIGH FLEX</span>' :
    V === 'applied' ? '<span class="chip ok">✓ APPLIED · ' + X.applied.at.replace(/ \d{4}$/, '').toUpperCase() + '</span><span class="chip local">@ EMAIL EVIDENCE</span><span class="chip amb">SOFT FLEX</span><span class="chip prov">$' + s.baseK + 'K EST.</span>' :
    '<span class="chip need">NEEDS DECISION</span><span class="chip ok">HIGH FLEX</span><span class="chip prov">$' + s.baseK + 'K EST.</span><span class="chip prov">' + s.location.split(',')[0].toUpperCase() + '</span>';
  var banner = '';
  if (V === 'agency') banner = '<div class="banner"><div class="bt">AGENCY POSTING · CLIENT NOT NAMED</div>The employer is not named. Company culture is unknown for this row (' + fp.culture.basis.toLowerCase() + '), so it drops out of the score and coverage is ' + s.coverage + '%. An agency row is an ordinary job; this never delays it.</div>';
  if (V === 'closed') banner = '<div class="banner"><div class="bt"><span>∅ POSTING CLOSED · EMPLOYER ATS</span><a>Evidence ↗</a></div>' + X.closed.provider + ' reported this posting closed on ' + X.closed.at + ' (LIVENESS=' + X.closed.method + ', checked ' + X.closed.checkedAt + '). It is hidden from Start and every open view; the master still files it as Needs decision until a lane files it CLOSED_DEAD.</div>';
  if (V === 'applied') banner = '<div class="banner g"><div class="bt"><span>✓ APPLIED · ' + X.applied.at.toUpperCase() + '</span><a>Open in Gmail ↗</a></div><span style="color:var(--pe-text-primary)">@ Email evidence</span> · Gmail confirmation<br><q>' + esc(X.applied.subject) + '</q><br>' + esc(X.applied.from) + ' · ' + X.applied.received + '<br>Your earlier decision ⊖ ' + X.applied.supersededDecision + ' · ' + X.applied.supersededAt + ' was superseded: an email confirmation records APPLIED even over a decline (REV-014).</div>';
  var bandLine = s.band === 'NONE' ? '<div class="band" style="color:var(--pe-text-secondary)">NOT RANKED · ' + (V === 'closed' ? '∅ CLOSED POSTING' : '✓ APPLIED') + '</div>' :
    '<div class="band ' + b[1] + '" style="color:' + bc[s.band] + '">' + b[0] + ' ' + b[2] + ' · OPPORTUNITY RATING ' + s.score + '</div>';
  var info = s.band === 'NONE' ? '<div>Score ' + s.score + ' · outside the band population (' + (V === 'closed' ? 'open jobs only' : 'applied jobs are not ranked') + ')</div><div>Model rev ' + fx.model.rev + ' · computed ' + D.computedAt + ' <span class="cur">✓ CURRENT</span></div>' :
    '<div>Model rev ' + fx.model.rev + ' · computed ' + D.computedAt + ' <span class="cur">✓ CURRENT</span></div>' +
    (s.changed && s.changed !== 'NEW' ? '<div class="gain">Δ ' + s.changed + ' since last review (evidence: ' + D.changeEvidence + ')</div>' : s.changed === 'NEW' ? '<div style="color:var(--pe-text-primary)">Δ NEW since last review · ' + fx.lastReview + '</div>' : '') +
    '<div>Screen gate ' + gate(s.screenGate) + ' · FLEX impact ' + (s.flexInfluence >= 0 ? '+' : '−') + Math.abs(s.flexInfluence) + ' · #' + s.rankNo + ' of ' + B.n + '</div>';
  var reasons = V === 'agency' ? [['', '✓ Experience / content fit ' + fp.experience.score + ' · aerospace mfg leadership'], ['a', '≈ Degree FLEX: SOFT_FLEX (preferred wording)'], ['', '✓ Geo ' + fp.geo.score + ' · nearest control pt ' + fp.geo.basis.replace(/^.*nearest /i, '')], ['n', '? Company culture unknown · client not named']] :
    V === 'closed' ? [['', '✓ Experience / content fit ' + fp.experience.score + ' · plant P&amp;L'], ['', '✓ Degree FLEX: HIGH_FLEX'], ['n', '∅ Liveness: ' + X.closed.method + ' · ' + X.closed.provider + ' · ' + X.closed.at]] :
    V === 'applied' ? [['', '✓ Experience / content fit ' + fp.experience.score + ' · aerostructures production'], ['a', '≈ Degree FLEX: SOFT_FLEX (preferred wording)'], ['', '✓ Applied 2026-10-16 · evidence: Gmail message']] :
    [['', '✓ Experience / content fit ' + fp.experience.score + ' · mfg scale-up, plant P&amp;L'], ['', '✓ Degree FLEX: HIGH_FLEX (equivalent experience)'], ['', '✓ Geo ' + fp.geo.score + ' · nearest control pt ' + s.location], ['a', '≈ Base pay est. $' + s.baseK + 'K · posted range not stored'], ['n', '? Ownership unknown · research']];
  var why = V === 'agency' ? 'Plant-scale mfg leadership in preferred geography; the client is unknown, so culture drops out and coverage falls to ' + s.coverage + '%.' :
    V === 'closed' ? 'Strong fit, but the employer closed the posting. Kept for the record; no decision is needed to hide it.' :
    V === 'applied' ? 'Applied on ' + X.applied.at + '. Follow-up lives on the Application tab.' : 'Plant-scale mfg leadership, high degree flex, preferred geography; pay est. near target.';
  var waitRow = fx.rows.find(function (r) { return r.writeState === 'WAITING'; }), okRow = fx.rows.find(function (r) { return r.writeState === 'CONFIRMED'; }), failRow = fx.rows.find(function (r) { return r.writeState === 'FAILED'; });
  var decide = V === 'closed' ? '<div class="decide"><span class="dbtn off" style="width:150px">✓ Pursue · closed</span><span class="dbtn hold">' + PEIcons.svg('hold') + ' Hold <sub>H</sub></span><span class="dbtn research">Research</span><span class="dsep"></span><span class="dbtn decline">⊖ Decline</span></div>' :
    V === 'applied' ? '<div class="protect"><span class="k">✓ APPLIED IS PROTECTED</span>The Writer refuses Decline and identity changes on APPLIED rows. Follow-up actions live on the Application tab.</div><div class="decide"><span class="dbtn" style="flex:1;border-color:var(--pe-outline)">Open Application tab ›</span><span class="dbtn off" style="width:190px">⊖ Decline · unavailable</span></div>' :
    '<div class="decide"><span class="dbtn pursue">✓ Pursue <sub>P</sub></span><span class="dbtn hold">' + PEIcons.svg('hold') + ' Hold <sub>H</sub></span><span class="dbtn research">Research</span><span class="dsep"></span><span class="dbtn decline">⊖ Decline</span></div>';
  $('drawer').innerHTML =
    '<div class="d-head"><span>◉ JOB DRAWER · ' + s.id + (s.lat != null ? ' · LOCKED ON MAP' : '') + '</span><span class="nav">‹ › ✕</span></div>' +
    '<div class="d-title">' + esc(s.title) + '</div>' +
    '<div class="d-meta">' + (V === 'agency' ? esc(s.company) + ' (agency) · ' : esc(s.company) + ' · ') + esc(s.location) + ' · ' + D.workMode + ' · posted ' + s.age + ' · ' + D.source + '</div>' +
    '<div class="chips">' + chips + '</div>' + banner +
    '<div class="dtabs"><span class="on">OVERVIEW</span><span>POSTING</span><span>FIT &amp; SCORE</span><span>APPLICATION</span><span>DOCUMENTS</span><span>HISTORY</span></div>' +
    '<div class="score-row"><div class="ring">' + ring + '</div><div class="score-info">' + bandLine + info + '</div></div>' +
    '<div class="sec-label">WHY</div><div class="why">' + why + ' <a>Fit &amp; Score ›</a></div>' +
    '<div class="reasons">' + reasons.map(function (r) { return '<div class="reason ' + r[0] + '">' + r[1] + '</div>'; }).join('') + '</div>' +
    '<div class="sec-label tight"><span>SCORE BREAKDOWN · WEIGHT · POINTS</span><span style="color:var(--pe-text-primary)">Σ ' + knownW + '% KNOWN = ' + sum.toFixed(1) + ' → ' + s.score + '</span></div>' +
    '<div class="bd">' + bd + '</div>' +
    '<div class="bd-foot">Σ ' + sum.toFixed(1) + ' · COVERAGE ' + s.coverage + '% × FACTOR ' + (0.7 + 0.3 * s.coverage / 100).toFixed(3) + ' = ' + s.score + ' · REV ' + fx.model.rev + ' · ALL 8 WEIGHTS SHARED</div>' +
    '<div class="sec-label tight">TIM DECISION</div>' + decide +
    (V ? '' : '<div class="receipts">' +
      '<div class="receipt wait"><span class="msg"><span class="k">◷ WAITING FOR WRITER LOCK</span> · ' + R.wait.action + ' · “' + esc(waitRow.title) + '” · auto-retry ' + R.wait.attempt + '/' + R.wait.of + ' in ' + R.wait.nextS + ' s</span><span class="act">Undo</span></div>' +
      '<div class="receipt ok"><span class="msg"><span class="k">✓ CONFIRMED</span> · ' + R.ok.action + ' · “' + esc(okRow.title) + '” · readback ' + R.ok.readbackS + ' s</span><span class="act">Undo</span></div>' +
      '<div class="receipt fail"><span class="msg"><span class="k">⊗ FAILED</span> · ' + R.fail.action + ' · “' + esc(failRow.title) + '” · ' + R.fail.retries + ' retries · payload kept</span><span class="act">Retry</span></div></div>');
  finish();

  function emptyDrawer() {
    var maxB = Math.max(cnt.TOP || 0, cnt.UPPER || 0, cnt.MID || 0, cnt.LOW || 0, cnt.HOLD || 0), n = B.n, order = ['TOP', 'UPPER', 'MID', 'LOW'];
    var raw = order.map(function (k) { return (cnt[k] || 0) / n * 100; }), fl = raw.map(Math.floor), rem = 100 - fl.reduce(function (q, v) { return q + v; }, 0);
    raw.map(function (v, i) { return [v - fl[i], i]; }).sort(function (q, w) { return w[0] - q[0]; }).slice(0, rem).forEach(function (p) { fl[p[1]]++; });
    var bandRows = order.map(function (k, i) { var c = cnt[k] || 0; return '<div class="e-row"><span class="gl ' + BAND[k][1] + '">' + BAND[k][0] + '</span><span class="nm mono ' + BAND[k][1] + '">' + k + '</span><span class="bar"><i style="width:' + (c / maxB * 100) + '%;background:' + bc[k] + '"></i></span><span class="n">' + c + '</span><span class="pc">' + fl[i] + '%</span></div>'; }).join('') +
      '<div class="e-row"><span class="gl" style="color:var(--pe-red)">⊘</span><span class="nm mono" style="color:var(--pe-red)">HOLD</span><span class="bar"><i style="width:' + ((cnt.HOLD || 0) / maxB * 100) + '%;background:var(--pe-red)"></i></span><span class="n">' + (cnt.HOLD || 0) + '</span><span class="pc">—</span></div>';
    var bk = {}; tableRows.forEach(function (r) { bk[r.bucketLabel] = (bk[r.bucketLabel] || 0) + 1; });
    var maxK = Math.max.apply(null, Object.keys(bk).map(function (k) { return bk[k]; }));
    var bkRows = Object.keys(bk).sort(function (q, w) { return bk[w] - bk[q]; }).map(function (k) { return '<div class="e-row"><span class="gl"></span><span class="nm"' + (k === 'Needs decision' ? ' style="color:var(--pe-text-primary)"' : '') + '>' + k + '</span><span class="bar"><i style="width:' + (bk[k] / maxK * 100) + '%;background:var(--pe-text-secondary)"></i></span><span class="n">' + bk[k] + '</span><span class="pc"></span></div>'; }).join('');
    var nextUp = tableRows.filter(function (r) { return !r.hold; }).slice(0, 3).map(function (r) {
      var bb = BAND[r.band];
      return '<div class="nx" style="border-left-color:' + bc[r.band] + '"><div class="l1"><b class="' + bb[1] + '">' + r.score + '</b> <span class="' + bb[1] + '" style="font-family:var(--pe-font-label);font-size:11px">' + bb[0] + '</span> · ' + esc(r.title) + '</div>' +
        '<div class="l2">' + esc(r.company) + ' · ' + esc(r.location) + ' · #' + r.rankNo + ' of ' + n + '</div><span class="go">Open ›</span></div>';
    }).join('');
    var waitRow = fx.rows.find(function (r) { return r.writeState === 'WAITING'; }), okRow = fx.rows.find(function (r) { return r.writeState === 'CONFIRMED'; }), failRow = fx.rows.find(function (r) { return r.writeState === 'FAILED'; });
    $('drawer').className = 'panel drawer empty';
    $('drawer').innerHTML =
      '<div class="d-head"><span>○ JOB DRAWER · NO JOB SELECTED</span><span class="nav"></span></div>' +
      '<div class="e-title">No job selected</div>' +
      '<div class="e-meta">Pick a row or a map pin, or press ↓ then Enter. The decision buttons appear when a job is open. Until then the map shows the filtered view.</div>' +
      '<div class="dtabs"><span class="on">FILTERED VIEW</span><span>&nbsp;</span></div>' +
      '<div class="sec-label"><span>BANDS · REVIEW QUEUE · ' + tableRows.length + ' JOBS</span><span>SHARE OF N ' + n + '</span></div>' +
      '<div class="bd">' + bandRows + '</div>' +
      '<div class="e-foot">N ' + n + ' ELIGIBLE OPEN · P90 ' + B.cuts.top + ' · P65 ' + B.cuts.upper + ' · P20 ' + B.cuts.low + ' · REV ' + fx.model.rev + ' · AS OF ' + fx.asOf + '<br>⊘ HOLD ROWS ARE OUTSIDE THE BANDS</div>' +
      '<div class="sec-label"><span>BUCKETS</span><span>Σ ' + tableRows.length + '</span></div>' +
      '<div class="bd">' + bkRows + '</div>' +
      '<div class="sec-label"><span>NEXT UP · SORT: SCORE ↓</span><span>NOT SELECTED</span></div>' +
      '<div class="next">' + nextUp + '</div>' +
      '<div class="keys"><kbd>↓</kbd><kbd>↑</kbd> MOVE <kbd>ENTER</kbd> OPEN <kbd>ESC</kbd> CLOSE <kbd>/</kbd> SEARCH</div>' +
      '<div class="sec-label"><span>MY DECISIONS · WRITER</span><span>' + C.writerWaiting + ' WAITING · ' + C.writerFailed + ' FAILED</span></div>' +
      '<div class="receipts">' +
        '<div class="receipt wait"><span class="msg"><span class="k">◷ WAITING FOR WRITER LOCK</span> · ' + R.wait.action + ' · “' + esc(waitRow.title) + '” · auto-retry ' + R.wait.attempt + '/' + R.wait.of + ' in ' + R.wait.nextS + ' s</span><span class="act">Undo</span></div>' +
        '<div class="receipt ok"><span class="msg"><span class="k">✓ CONFIRMED</span> · ' + R.ok.action + ' · “' + esc(okRow.title) + '” · readback ' + R.ok.readbackS + ' s</span><span class="act">Undo</span></div>' +
        '<div class="receipt fail"><span class="msg"><span class="k">⊗ FAILED</span> · ' + R.fail.action + ' · “' + esc(failRow.title) + '” · ' + R.fail.retries + ' retries · payload kept</span><span class="act">Retry</span></div></div>';
  }
  function finish() {
    $('ticker').innerHTML = '<span class="ticker-label">▸ PIPELINE EVENTS</span>' + fx.events.map(function (e, i) { return (i ? '<span class="bar">│</span>' : '') + '<span class="ev"><span class="t">' + e[0] + '</span>' + esc(e[1]) + '</span>'; }).join('') + '<span class="ticker-end"><span class="tk">PAUSE TICKER</span> · <span class="tk">HIDE</span></span>';
    PEIcons.apply(document.getElementById('app'));
    if (PG.after) PG.after(fx);
    if (/measure/.test(location.search)) { ['measure.js', 'measure2.js'].forEach(function (f) { var x = new XMLHttpRequest(); x.open('GET', f, false); x.send(null); (0, eval)(x.responseText); }); }
  }
}());
