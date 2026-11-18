/* AI usage panel: weekly limits for Claude, Grok and ChatGPT, with a projected run-out time.
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

  /** One weekly projection per provider; historical short-window meters are ignored. */
  function project(readings, nowMs) {
    nowMs = nowMs || Date.now();
    var groups = {};
    readings.forEach(function (r) {
      if (r.meter !== 'weekly' || ORDER.indexOf(r.provider) === -1) return;
      var k = r.provider + '|' + r.meter; (groups[k] = groups[k] || []).push(r);
    });
    var projections = Object.keys(groups).map(function (k) {
      var g = groups[k].slice().sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
      var last = g[g.length - 1], at = Date.parse(last.at), reset = Date.parse(last.resetsAt) || 0;
      var p = { provider: last.provider, meter: last.meter, label: last.label || last.meter, usedPct: +last.usedPct, at: at, resetsAt: reset, status: last.status || 'OK', ageH: (nowMs - at) / H, rate: null, runOutAt: null, verdict: 'UNKNOWN', basis: '' };
      if (last.provider === 'CHATGPT' && last.openaiCredit) p.openaiCredit = last.openaiCredit;
      if (last.resets_available !== undefined) p.resets_available = last.resets_available;
      if (last.resets_expire !== undefined) p.resets_expire = last.resets_expire;
      if (last.extra_usd !== undefined) p.extra_usd = last.extra_usd;
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
    }).sort(function (a, b) { return ORDER.indexOf(a.provider) - ORDER.indexOf(b.provider); });
    var five = null;
    readings.forEach(function (r) {
      if (r.provider !== 'CLAUDE') return;
      var f = null;
      var raw, fAt;
      if (r.meter === 'session' || r.meter === '5-hour' || +r.windowHours === 5) { raw = r.usedPct; fAt = r.resetsAt; }
      else if (r.fiveHourUsedPct != null) { raw = r.fiveHourUsedPct; fAt = r.fiveHourResetsAt; }
      else if (r.fiveHour && r.fiveHour.usedPct != null) { raw = r.fiveHour.usedPct; fAt = r.fiveHour.resetsAt; }
      if (raw != null && isFinite(+raw) && r.status !== 'UNREADABLE') f = { usedPct: +raw, resetsAt: fAt, at: r.at };
      if (f && (!five || Date.parse(f.at) >= Date.parse(five.at))) five = f;
    });
    if (five) projections.forEach(function (p) { if (p.provider === 'CLAUDE') p.fiveHour = five; });
    return projections;
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
  function monthDay(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + ' ' + String(+m[3]);
  }
  function creditHtml(p) {
    var c = p && p.openaiCredit;
    if (!c) return '';
    var grant = +c.grant_usd;
    var verified = c.verified_left_usd != null && c.verified_left_usd !== '';
    var left = verified ? +c.verified_left_usd : +c.est_left_usd;
    if (!isFinite(grant) || !isFinite(left)) return '';
    var approx = verified ? '' : '~';
    var grantStr = (grant % 1) ? grant.toFixed(2) : String(Math.round(grant));
    var exp = monthDay(c.expires);
    return '<div class="dim">API credit: ' + approx + '$' + left.toFixed(2) + ' of $' + grantStr + ' left' + (exp ? ' · expires ' + exp : '') + '</div>';
  }
  function etClock(ms) {
    return new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  }
  function fiveHourLine(p, nowMs) {
    var f = p && p.fiveHour, pct = f && +f.usedPct, reset = f && Date.parse(f.resetsAt);
    if (!f || !isFinite(pct) || !isFinite(reset)) return '';
    if (reset <= (nowMs != null ? nowMs : Date.now())) return '';
    var t = etClock(reset);
    if (pct >= 100) return '5-hr window: FULL, stopped · resets ' + t + ' ET';
    return '5-hr window: ' + Math.round(pct) + '% used · resets ' + t + ' ET';
  }
  function fiveHourHtml(p, nowMs) {
    var t = fiveHourLine(p, nowMs);
    return t ? '<div class="dim">' + esc(t) + '</div>' : '';
  }
  function resetsHtml(p) {
    if (!p || (p.resets_available === undefined && p.resets_expire === undefined && p.extra_usd === undefined)) return '';
    var resets = (p.resets_available == null || p.resets_available === '') ? 'Resets: none' : ('Resets: ' + String(+p.resets_available));
    var exp = monthDay(p.resets_expire);
    if (exp && p.resets_available != null && p.resets_available !== '' && +p.resets_available > 0) resets += ' (expires ' + exp + ')';
    var extra = 'Extra: none';
    if (p.extra_usd != null && p.extra_usd !== '' && isFinite(+p.extra_usd) && +p.extra_usd !== 0) {
      extra = 'Extra: $' + (+p.extra_usd).toFixed(2);
    }
    return '<div class="dim">' + esc(resets + ' · ' + extra) + '</div>';
  }
  function rowHtml(p, nowMs) {
    var v = VERDICT[p.verdict] || VERDICT.UNKNOWN, pct = Math.max(0, Math.min(100, p.usedPct || 0));
    var detail = p.verdict === 'OUT' ? 'out until reset ' + when(p.resetsAt)
      : p.verdict === 'BEFORE_RESET' ? 'projected out ' + when(p.runOutAt) + ' · resets ' + when(p.resetsAt)
      : p.verdict === 'LASTS' ? 'resets ' + when(p.resetsAt) + (p.runOutAt ? ' · projected out ' + when(p.runOutAt) : '')
      : 'resets ' + when(p.resetsAt);
    var title = NAMES[p.provider] + ' ' + p.label + ': ' + pct + '% used, ' + v[1].toLowerCase() + ', ' + detail;
    return '<div class="aiu-row ' + v[0] + '" title="' + esc(title) + '">' +
      '<div class="aiu-top"><b>' + esc(NAMES[p.provider] || p.provider) + '</b> <span class="dim">' + esc(p.label) + '</span><span class="aiu-pct">' + esc(String(Math.round(pct))) + '%</span></div>' +
      '<div class="aiu-track" role="img" aria-label="' + esc(title) + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      fiveHourHtml(p, nowMs) + creditHtml(p) + resetsHtml(p) +
      '<div class="aiu-foot"><span class="pill ' + v[0] + '">' + esc(v[1]) + '</span> <span class="dim">' + esc(detail) + (p.rate != null && p.rate > 0 ? ' · ' + p.rate.toFixed(2) + '%/h (' + esc(p.basis) + ')' : '') + ' · read ' + esc(p.ageH < 1 ? Math.round(p.ageH * 60) + ' min ago' : Math.round(p.ageH) + ' h ago') + '</span></div></div>';
  }
  /* Card 7077752 (Tim, Nov 18): the one short prediction both views print, so the 3D AI USAGE screen and this panel agree. */
  function brief(p) {
    if (!p) return '';
    if (p.verdict === 'OUT') return 'out until reset';
    if (p.verdict === 'BEFORE_RESET') return 'runs out ~' + when(p.runOutAt);
    if (p.verdict === 'LASTS') return 'lasts to reset';
    return '';
  }
  function html(projections, nowMs) {
    if (!projections || !projections.length) return '<div class="dim">No usage readings yet.</div>';
    return '<div class="aiu">' + projections.map(function (p) { return rowHtml(p, nowMs); }).join('') + '</div>';
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
  var api = { parse: parse, project: project, brief: brief, html: html, fiveHourLine: fiveHourLine, load: load, URL: URL, API_URL: API_URL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PipelineAiUsage = api;
})(typeof window !== 'undefined' ? window : globalThis);
