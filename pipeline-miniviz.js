/* Small inline graphics that sit beside a number (never instead of it): sparkline, share bar, progress bar.
   Dependency-free SVG/HTML strings. Each graphic carries its own text title so the meaning is available without
   colour (UI doctrine v1.1 Accessibility Floor); the exact number stays in the tile. */
(function(root){
  'use strict';
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function finite(v){ v = Number(v); return Number.isFinite(v) ? v : 0; }

  /** Sparkline of a numeric series. opts: {w,h,title,color,area,lastDot}. Empty or all-zero series draws a flat baseline. */
  function spark(values, opts){
    opts = opts || {};
    var w = opts.w || 64, h = opts.h || 18, pad = 2, v = (values || []).map(finite), n = v.length;
    var title = opts.title || '';
    if (!n) return '<svg class="mini-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(title || 'no data') + '"><title>' + esc(title || 'no data') + '</title></svg>';
    var max = Math.max.apply(null, [0].concat(v)), step = n > 1 ? (w - pad * 2) / (n - 1) : 0;
    var pts = v.map(function(x, i){ return [pad + i * step, h - pad - (max ? (x / max) * (h - pad * 2) : 0)]; });
    var line = pts.map(function(p){ return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '), color = opts.color || 'currentColor';
    var b = '';
    if (opts.area) b += '<path d="M' + pts[0][0].toFixed(1) + ' ' + (h - pad) + pts.map(function(p){ return 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('') + 'L' + pts[n - 1][0].toFixed(1) + ' ' + (h - pad) + 'Z" fill="' + color + '" fill-opacity=".14"/>';
    b += '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>';
    if (opts.lastDot !== false) b += '<circle cx="' + pts[n - 1][0].toFixed(1) + '" cy="' + pts[n - 1][1].toFixed(1) + '" r="2" fill="' + color + '"/>';
    return '<svg class="mini-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(title) + '"><title>' + esc(title) + '</title>' + b + '</svg>';
  }

  /** Thin horizontal bar: part of whole. Shows the exact fraction in its title. */
  function share(part, whole, opts){
    opts = opts || {};
    var p = Math.max(0, finite(part)), t = Math.max(0, finite(whole)), f = t ? Math.min(1, p / t) : 0, pct = Math.round(f * 100);
    var title = opts.title || (p + ' of ' + t + ' (' + pct + '%)');
    return '<span class="mini-share" role="img" aria-label="' + esc(title) + '" title="' + esc(title) + '"><i style="width:' + (f * 100).toFixed(1) + '%"></i></span>';
  }

  /** Progress bar for a ratio with its percentage as text beside it. */
  function progress(done, total, opts){
    opts = opts || {};
    var d = Math.max(0, finite(done)), t = Math.max(0, finite(total)), f = t ? Math.min(1, d / t) : 0, pct = Math.round(f * 100);
    var title = opts.title || (d + ' of ' + t + ' (' + pct + '%)');
    return '<span class="mini-progress" role="img" aria-label="' + esc(title) + '" title="' + esc(title) + '"><i style="width:' + (f * 100).toFixed(1) + '%"></i></span>';
  }

  /** Pure: counts per day for the last `days` days (oldest first) from dates (Date or ISO); ignores unknown dates. */
  function dailyCounts(dates, days, nowMs){
    days = days || 14; nowMs = nowMs || Date.now();
    var day = 864e5, end = Math.floor(nowMs / day) * day + day, start = end - days * day, out = [];
    for (var i = 0; i < days; i++) out.push(0);
    (dates || []).forEach(function(d){ var t = d instanceof Date ? d.getTime() : Date.parse(d); if (!Number.isFinite(t) || t < start || t >= end) return; out[Math.floor((t - start) / day)]++; });
    return out;
  }

  var api = { spark: spark, share: share, progress: progress, dailyCounts: dailyCounts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PipelineMiniViz = api;
})(typeof window !== 'undefined' ? window : globalThis);
