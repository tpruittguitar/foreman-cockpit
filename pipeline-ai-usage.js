/* AI usage panel: weekly and short-window limits for Claude, Grok and ChatGPT, with a projected run-out time.
   Readings come from forge-coordination usage/AI_USAGE_READINGS.jsonl (one JSON object per line), written by the
   Claude usage-reader scheduled task that reads each provider's own usage page in Tim's Chrome.
   Projection: burn rate from the newest reading and an older reading in the same reset window (at least 2 hours apart);
   with only one reading in the window, the average rate since the window started. Exact numbers are always printed;
   bar colour is backed by a text status (UI doctrine v1.1 Accessibility Floor). Pure functions are Node-testable. */
(function (root) {
  'use strict';
  var URL = 'https://raw.githubusercontent.com/tpruittguitar/forge-coordination/main/usage/AI_USAGE_READINGS.jsonl';
  var API_URL = 'https://api.github.com/repos/tpruittguitar/forge-coordination/contents/usage/AI_USAGE_READINGS.jsonl?ref=main';
  var H = 3600000, MIN_GAP = 2 * H;
  var ORDER = ['CLAUDE', 'CHATGPT', 'GROK'];
  var NAMES = { CLAUDE: 'Claude', CHATGPT: 'ChatGPT', GROK: 'Grok' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function parse(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (l) {
      l = l.trim(); if (!l || l[0] !== '{') return;
      try { var r = JSON.parse(l); if (r && r.provider && r.meter && Date.parse(r.at)) out.push(r); } catch (e) {}
    });
    return out;
  }

  /** One projection per provider+meter from the readings, newest state first. */
  function project(readings, nowMs) {
    nowMs = nowMs || Date.now();
    var groups = {};
    readings.forEach(function (r) { var k = r.provider + '|' + r.meter; (groups[k] = groups[k] || []).push(r); });
    return Object.keys(groups).map(function (k) {
      var g = groups[k].slice().sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
      var last = g[g.length - 1], at = Date.parse(last.at), reset = Date.parse(last.resetsAt) || 0;
      var p = { provider: last.provider, meter: last.meter, label: last.label || last.meter, usedPct: +last.usedPct, at: at, resetsAt: reset, status: last.status || 'OK', ageH: (nowMs - at) / H, rate: null, runOutAt: null, verdict: 'UNKNOWN', basis: '' };
      if (p.status !== 'OK' || !isFinite(p.usedPct)) { p.verdict = 'NO_READING'; return p; }
      if (reset && reset <= nowMs) { p.verdict = 'RESET_PASSED'; return p; }
      if (p.usedPct >= 100) { p.verdict = 'OUT'; p.runOutAt = at; return p; }
      var same = g.filter(function (r) { return r.status === 'OK' && Date.parse(r.resetsAt) === reset && at - Date.parse(r.at) >= MIN_GAP; });
      if (same.length) {
        var prev = same[same.length - 1], dt = (at - Date.parse(prev.at)) / H;
        p.rate = (p.usedPct - +prev.usedPct) / dt; p.basis = 'last ' + Math.round(dt) + ' h';
      } else if (reset && last.windowHours) {
        var start = reset - last.windowHours * H, el = (at - start) / H;
        if (el > 0.5) { p.rate = p.usedPct / el; p.basis = 'average since window start'; }
      }
      if (p.rate == null) { p.verdict = 'UNKNOWN'; return p; }
      if (p.rate <= 0) { p.verdict = 'LASTS'; return p; }
      p.runOutAt = at + ((100 - p.usedPct) / p.rate) * H;
      p.verdict = reset && p.runOutAt < reset ? 'BEFORE_RESET' : 'LASTS';
      return p;
    }).sort(function (a, b) { return ORDER.indexOf(a.provider) - ORDER.indexOf(b.provider) || (a.meter === 'weekly' ? -1 : b.meter === 'weekly' ? 1 : 0); });
  }

  function when(ms) {
    if (!ms) return '?';
    var d = new Date(ms);
    return d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  var VERDICT = {
    OUT: ['bad', 'OUT'], BEFORE_RESET: ['bad', 'RUNS OUT BEFORE RESET'], LASTS: ['ok', 'LASTS TO RESET'],
    UNKNOWN: ['warn', 'NEED 2 READINGS'], NO_READING: ['warn', 'NO READING'], RESET_PASSED: ['warn', 'RESET PASSED · NEW READING DUE']
  };
  function rowHtml(p) {
    var v = VERDICT[p.verdict] || VERDICT.UNKNOWN, pct = Math.max(0, Math.min(100, p.usedPct || 0));
    var detail = p.verdict === 'OUT' ? 'out until reset ' + when(p.resetsAt)
      : p.verdict === 'BEFORE_RESET' ? 'projected out ' + when(p.runOutAt) + ' · resets ' + when(p.resetsAt)
      : p.verdict === 'LASTS' ? 'resets ' + when(p.resetsAt) + (p.runOutAt ? ' · projected out ' + when(p.runOutAt) : '')
      : 'resets ' + when(p.resetsAt);
    var title = NAMES[p.provider] + ' ' + p.label + ': ' + pct + '% used, ' + v[1].toLowerCase() + ', ' + detail;
    return '<div class="aiu-row ' + v[0] + '" title="' + esc(title) + '">' +
      '<div class="aiu-top"><b>' + esc(NAMES[p.provider] || p.provider) + '</b> <span class="dim">' + esc(p.label) + '</span><span class="aiu-pct">' + esc(String(Math.round(pct))) + '%</span></div>' +
      '<div class="aiu-track" role="img" aria-label="' + esc(title) + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<div class="aiu-foot"><span class="pill ' + v[0] + '">' + esc(v[1]) + '</span> <span class="dim">' + esc(detail) + (p.rate != null && p.rate > 0 ? ' · ' + p.rate.toFixed(2) + '%/h (' + esc(p.basis) + ')' : '') + ' · read ' + esc(p.ageH < 1 ? Math.round(p.ageH * 60) + ' min ago' : Math.round(p.ageH) + ' h ago') + '</span></div></div>';
  }
  function html(projections) {
    if (!projections || !projections.length) return '<div class="dim">No usage readings yet.</div>';
    return '<div class="aiu">' + projections.map(rowHtml).join('') + '</div>';
  }
  function load(fetchFn) {
    // raw.githubusercontent.com caches for 5 minutes and ignores query strings, so a fresh push stays invisible.
    // The GitHub contents API serves the current file (60 s cache; 60 unauthenticated calls/hour per IP, the panel
    // uses at most 30). Raw is the fallback when the API refuses (rate limit) or is unreachable.
    var f = fetchFn || fetch;
    return f(API_URL, { cache: 'no-store', headers: { Accept: 'application/vnd.github.raw' } })
      .then(function (r) { if (!r.ok) throw new Error('usage readings API HTTP ' + r.status); return r.text(); })
      .catch(function () { return f(URL, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('usage readings HTTP ' + r.status); return r.text(); }); })
      .then(parse);
  }
  var api = { parse: parse, project: project, html: html, load: load, URL: URL, API_URL: API_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PipelineAiUsage = api;
})(typeof window !== 'undefined' ? window : globalThis);
