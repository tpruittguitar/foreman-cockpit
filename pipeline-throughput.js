/* Writer throughput: hourly arrived vs finished, backlog, and longest queue wait, from the Writer's read-only
   queue_stats action (WRITER_QUEUE_LOG.jsonl). Presentation only: reads, never writes. Dependency-free SVG.
   Every value is also available as text (hover title on each hour and the hourly table), and series differ by
   shape as well as colour (outlined vs filled bars, triangle markers), per the UI doctrine's Accessibility Floor. */
(function(root){
  'use strict';
  var WAIT_ACT_MIN = 45;                 // longest-wait line at which someone should look at the queue
  var C = { text:'#f5f5f5', dim:'#b8b8b8', muted:'#828282', grid:'#2a2a2a', finished:'#39ff88', arrived:'#b8b8b8', alert:'#ff9f1c', fail:'#ff3b30' };
  var W = 520, H = 210, X0 = 40, X1 = 512, YT = 26, YB = 168;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function num(v){ return Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }); }
  function hourLabel(t){ var h = new Date(t).getHours(); return (h % 12 || 12) + (h < 12 ? 'a' : 'p'); }
  function hourLong(t){ var d = new Date(t), h = d.getHours(); return (h % 12 || 12) + ':00 ' + (h < 12 ? 'AM' : 'PM'); }
  function mins(ms){ return Math.round((Number(ms) || 0) / 60000); }
  function niceMax(v, floor){ v = Math.max(floor || 1, v); var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

  /** Pure: chart model from a queue_stats response and (optionally) a writer_status response. */
  function model(stats, status){
    if (!stats || !stats.ok || !Array.isArray(stats.buckets)) return { ok: false, error: stats && stats.error || 'no queue statistics' };
    var hours = stats.buckets.map(function(b){
      var t = Date.parse(b.start);
      return { t: t, label: hourLabel(t), long: hourLong(t), arrived: +b.arrived || 0, finished: +b.finished || 0, failed: +b.failed || 0, held: +b.held || 0,
        backlog: +b.backlogAtEnd || 0, waitMax: mins(b.waitMsMax), waitAvg: mins(b.waitMsAvg), runAvgS: Math.round((+b.runMsAvg || 0) / 1000) };
    });
    var q = status && status.queue, pending = q && Number.isFinite(+q.pending) ? +q.pending : null;
    var oldestMin = q && q.oldestPendingAt ? Math.max(0, Math.round((Date.now() - Date.parse(q.oldestPendingAt)) / 60000)) : null;
    var tot = hours.reduce(function(s, h){ s.arrived += h.arrived; s.finished += h.finished; s.failed += h.failed; s.peak = Math.max(s.peak, h.finished); s.waitMax = Math.max(s.waitMax, h.waitMax); return s; }, { arrived: 0, finished: 0, failed: 0, peak: 0, waitMax: 0 });
    return { ok: true, hours: hours, totals: tot, pending: pending, oldestPendingMin: oldestMin, actMin: WAIT_ACT_MIN, now: stats.now, skipped: +stats.skippedLines || 0 };
  }

  function svg(title, body){ return '<svg class="chart-svg throughput-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '"><title>' + esc(title) + '</title>' + body + '</svg>'; }
  function yAxis(max, unit){
    var b = '';
    [0, .5, 1].forEach(function(f){ var y = YB - f * (YB - YT); b += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + y + '" y2="' + y + '" stroke="' + C.grid + '"/><text x="' + (X0 - 6) + '" y="' + (y + 4) + '" text-anchor="end" fill="' + C.muted + '" font-size="12">' + num(max * f) + (unit && f === 1 ? unit : '') + '</text>'; });
    return b;
  }
  function xLabels(hours, sw){
    return hours.map(function(h, i){ return (i % 3 === 0 || i === hours.length - 1) ? '<text x="' + (X0 + i * sw + sw / 2).toFixed(1) + '" y="' + (YB + 16) + '" text-anchor="middle" fill="' + C.muted + '" font-size="12">' + esc(h.label) + '</text>' : ''; }).join('');
  }
  function tri(x, y, s, fill){ return '<path d="M' + x.toFixed(1) + ' ' + (y - s).toFixed(1) + 'L' + (x + s).toFixed(1) + ' ' + (y + s * .8).toFixed(1) + 'L' + (x - s).toFixed(1) + ' ' + (y + s * .8).toFixed(1) + 'Z" fill="' + fill + '"/>'; }

  function flowChart(m){
    var hs = m.hours, sw = (X1 - X0) / Math.max(1, hs.length), max = niceMax(Math.max.apply(null, [1].concat(hs.map(function(h){ return Math.max(h.arrived, h.finished); }))), 4), k = (YB - YT) / max, b = yAxis(max);
    hs.forEach(function(h, i){
      var x = X0 + i * sw, bw = Math.max(2, sw / 2 - 2), ha = h.arrived * k, hf = h.finished * k;
      b += '<g><rect x="' + x.toFixed(1) + '" y="' + YT + '" width="' + sw.toFixed(1) + '" height="' + (YB - YT) + '" fill="transparent"/><title>' + esc(h.long + ': ' + h.arrived + ' arrived, ' + h.finished + ' finished' + (h.failed ? ', ' + h.failed + ' failed' : '') + (h.backlog ? ', ' + h.backlog + ' still waiting at end of hour' : '')) + '</title>';
      if (h.arrived) b += '<rect x="' + (x + 1.5).toFixed(1) + '" y="' + (YB - ha).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + ha.toFixed(1) + '" fill="none" stroke="' + C.arrived + '" stroke-width="1.5"/>';
      if (h.finished) b += '<rect x="' + (x + sw / 2).toFixed(1) + '" y="' + (YB - hf).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hf.toFixed(1) + '" fill="' + C.finished + '"/>';
      if (h.failed) b += tri(x + sw / 2 + bw / 2, YB - hf - 8, 4.5, C.fail);
      b += '</g>';
    });
    b += xLabels(hs, sw);
    b += '<g font-size="12" fill="' + C.dim + '"><rect x="300" y="6" width="11" height="11" fill="none" stroke="' + C.arrived + '" stroke-width="1.5"/><text x="316" y="16">Arrived</text><rect x="375" y="6" width="11" height="11" fill="' + C.finished + '"/><text x="391" y="16">Finished</text>' + tri(458, 12, 5, C.fail) + '<text x="467" y="16">Failed</text></g>';
    return svg('Writer requests arrived vs finished per hour', b);
  }

  function lineChart(title, hs, key, max, unit, opts){
    opts = opts || {};
    var sw = (X1 - X0) / Math.max(1, hs.length), k = (YB - YT) / max, b = yAxis(max, unit), pts = hs.map(function(h, i){ return [X0 + i * sw + sw / 2, YB - Math.min(max, h[key]) * k]; });
    if (opts.threshold != null) { var ty = YB - opts.threshold * k; b += '<line x1="' + X0 + '" x2="' + X1 + '" y1="' + ty.toFixed(1) + '" y2="' + ty.toFixed(1) + '" stroke="' + C.alert + '" stroke-dasharray="5 4"/><text x="' + (X1 - 2) + '" y="' + (ty - 5).toFixed(1) + '" text-anchor="end" fill="' + C.alert + '" font-size="12">' + esc(opts.thresholdLabel) + '</text>'; }
    if (opts.area) b += '<path d="M' + pts[0][0].toFixed(1) + ' ' + YB + pts.map(function(p){ return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('') + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + YB + 'Z" fill="' + C.dim + '" fill-opacity=".12"/>';
    b += '<polyline points="' + pts.map(function(p){ return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '" fill="none" stroke="' + C.text + '" stroke-width="1.6"/>';
    hs.forEach(function(h, i){
      var p = pts[i], over = opts.threshold != null && h[key] >= opts.threshold;
      b += '<g><rect x="' + (X0 + i * sw).toFixed(1) + '" y="' + YT + '" width="' + sw.toFixed(1) + '" height="' + (YB - YT) + '" fill="transparent"/><title>' + esc(h.long + ': ' + opts.tip(h)) + '</title>' + (over ? tri(p[0], p[1], 5, C.alert) : (h[key] ? '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6" fill="' + C.text + '"/>' : '')) + '</g>';
    });
    if (opts.nowValue != null) { var nx = X1 - 4, ny = YB - Math.min(max, opts.nowValue) * k; b += '<circle cx="' + nx + '" cy="' + ny.toFixed(1) + '" r="4" fill="none" stroke="' + C.finished + '" stroke-width="2"/><circle cx="' + (X1 - 4) + '" cy="12" r="4" fill="none" stroke="' + C.finished + '" stroke-width="2"/><text x="' + (X1 - 14) + '" y="16" text-anchor="end" fill="' + C.finished + '" font-size="12">' + esc(opts.nowLabel) + '</text>'; }
    return svg(title, b + xLabels(hs, sw));
  }

  function backlogChart(m){
    var max = niceMax(Math.max.apply(null, [4, m.pending || 0].concat(m.hours.map(function(h){ return h.backlog; }))), 4);
    return lineChart('Requests still waiting at the end of each hour', m.hours, 'backlog', max, '', { area: true, tip: function(h){ return h.backlog + ' still waiting'; }, nowValue: m.pending, nowLabel: m.pending == null ? '' : 'now ' + m.pending });
  }
  function waitChart(m){
    var max = niceMax(Math.max.apply(null, [m.actMin + 15, m.oldestPendingMin || 0].concat(m.hours.map(function(h){ return h.waitMax; }))), 10);
    return lineChart('Longest queue wait per hour, minutes', m.hours, 'waitMax', max, 'm', { threshold: m.actMin, thresholdLabel: m.actMin + ' min = act', tip: function(h){ return 'longest wait ' + h.waitMax + ' min, average ' + h.waitAvg + ' min, average run ' + h.runAvgS + ' s'; }, nowValue: m.oldestPendingMin, nowLabel: m.oldestPendingMin == null ? '' : 'oldest now ' + m.oldestPendingMin + 'm' });
  }

  function kpi(label, value, sub, cls, graphic){ return '<article class="dash-card ops-kpi ' + (cls || '') + '"><h4>' + esc(label) + '</h4><b>' + esc(value) + '</b>' + (graphic || '') + '<span class="tip">' + esc(sub || '') + '</span></article>'; }
  // 24-hour sparkline beside a KPI value (needs pipeline-miniviz.js; absent in Node tests, so the value alone shows).
  function trend(m, key, title){ var V = root.PipelineMiniViz; if (!V) return ''; return '<span class="kpi-viz">' + V.spark(m.hours.map(function(h){ return h[key]; }), { w: 120, h: 22, area: true, title: title }) + '</span>'; }
  function card(title, body, caption){ return '<article class="chart-card ops-chart throughput-card"><h3>' + esc(title) + '</h3>' + body + '<p class="tip">' + esc(caption || '') + '</p></article>'; }

  /** HTML for the throughput section. state: {stats, status, loading, error, unsupported}. */
  function html(state){
    state = state || {};
    var head = '<div class="chart-intro ops-flow-intro throughput-intro"><h2>File-queue activity · last 24 h</h2><p>File-queue requests only; direct GitHub API writes appear in Writer work above. Requests are counted when they finish; "now" points come from the live queue.</p></div>';
    if (state.unsupported) return head + '<p class="ops-warning">The deployed Writer predates queue_stats (needs build 64c6043 or later).</p>';
    if (state.error && !state.stats) return head + '<p class="ops-warning">Throughput unavailable: ' + esc(state.error) + '</p>';
    if (!state.stats) return head + '<p class="tip">' + (state.loading ? 'Reading Writer queue statistics…' : 'Not loaded yet.') + '</p>';
    var m = model(state.stats, state.status);
    if (!m.ok) return head + '<p class="ops-warning">Throughput unavailable: ' + esc(m.error) + '</p>';
    var t = m.totals, overWait = t.waitMax >= m.actMin || (m.oldestPendingMin != null && m.oldestPendingMin >= m.actMin);
    var h = head + '<div class="dash-grid ops-kpis throughput-kpis">'
      + kpi('Waiting now', m.pending == null ? 'UNKNOWN' : m.pending, m.oldestPendingMin == null ? 'live queue' : 'oldest ' + m.oldestPendingMin + ' min', m.oldestPendingMin != null && m.oldestPendingMin >= m.actMin ? 'warn' : '', trend(m, 'backlog', 'Still waiting at end of each hour, last 24 h'))
      + kpi('Finished · 24 h', t.finished, t.arrived + ' arrived', '', trend(m, 'finished', 'Finished per hour, last 24 h'))
      + kpi('Peak per hour', t.peak, 'demonstrated drain rate', '', trend(m, 'arrived', 'Arrived per hour, last 24 h'))
      + kpi('Longest wait · 24 h', t.waitMax + ' min', overWait ? 'at or over ' + m.actMin + ' min: act' : 'under ' + m.actMin + ' min', overWait ? 'warn' : '', trend(m, 'waitMax', 'Longest wait per hour (minutes), last 24 h'))
      + kpi('Failed · 24 h', t.failed, t.failed ? 'see WRITER_QUEUE/failed' : 'none', t.failed ? 'warn' : '', trend(m, 'failed', 'Failures per hour, last 24 h'))
      + '</div><div class="chart-grid ops-flow-grid throughput-grid">'
      + card('Arrived vs finished per hour', flowChart(m), 'Outlined bar = arrived, solid bar = finished, triangle = a failure that hour. Where arrived exceeds finished, a backlog builds.')
      + card('Still waiting at end of hour', backlogChart(m), 'Requests that had arrived but not finished when the hour ended. Ring = live queue now.')
      + card('Longest wait per hour', waitChart(m), 'Triangles mark hours at or over ' + m.actMin + ' min. Ring = age of the oldest request waiting now.')
      + '</div>';
    h += '<details class="throughput-table"><summary>Hourly numbers</summary><div class="ops-table"><table><thead><tr><th>Hour</th><th>Arrived</th><th>Finished</th><th>Failed</th><th>Waiting at end</th><th>Longest wait (min)</th><th>Avg wait (min)</th><th>Avg run (s)</th></tr></thead><tbody>'
      + m.hours.slice().reverse().map(function(r){ return '<tr><td>' + esc(r.long) + '</td><td>' + r.arrived + '</td><td>' + r.finished + '</td><td>' + r.failed + '</td><td>' + r.backlog + '</td><td>' + r.waitMax + '</td><td>' + r.waitAvg + '</td><td>' + r.runAvgS + '</td></tr>'; }).join('')
      + '</tbody></table></div>' + (m.skipped ? '<p class="tip">' + m.skipped + ' unreadable log line(s) skipped.</p>' : '') + '</details>';
    return h;
  }

  var api = { model: model, html: html, WAIT_ACT_MIN: WAIT_ACT_MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PipelineThroughput = api;
})(typeof window !== 'undefined' ? window : globalThis);
