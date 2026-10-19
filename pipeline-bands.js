/* Percentile bands for the opportunity rating (v1.5 spec §3.1, Grok Bot V-19 / V-20). Display only: the score itself
   comes from pipeline-scoring.js and is never changed here (L-2: every number shown is computed by the app).
   Population = eligible open jobs with a score, minus STRICT HOLD. Applied and terminal jobs are outside the population
   (band NONE). Cut-points: cut(q) = sorted[min(n-1, ceil(q*n))]; a score equal to a cut goes to the higher band.
   Rank = 1 + eligible scores strictly higher (ties share the better rank). Below minN the bands are off.
   Quantiles and minN are tokens (tokens.css --pe-band-rank-* / --pe-band-min-n); the caller passes them in. */
(function(root){
  'use strict';
  var GLYPH = { TOP: '▲', UPPER: '◆', MID: '●', LOW: '▽', HOLD: '⊘', NONE: '—' };
  var LABEL = { TOP: 'TOP 10%', UPPER: 'UPPER 25%', MID: 'MID 45%', LOW: 'LOW 20%', HOLD: 'HOLD', NONE: 'NOT RANKED' };
  var DEFAULTS = { top: 0.90, upper: 0.65, low: 0.20, minN: 40 };

  function num(v, d){ v = parseFloat(v); return isFinite(v) ? v : d; }
  function opts_(o){ o = o || {}; return { top: num(o.top, DEFAULTS.top), upper: num(o.upper, DEFAULTS.upper), low: num(o.low, DEFAULTS.low), minN: num(o.minN, DEFAULTS.minN) }; }

  /* items: [{id, score (number|null), hold (bool), eligible (bool)}]. Returns {n, on, cuts|null, byId:{id:{band, rankNo|null}}}. */
  function compute(items, options){
    var o = opts_(options), pop = [], byId = {};
    (items || []).forEach(function(it){ if (it && it.eligible && !it.hold && typeof it.score === 'number' && isFinite(it.score)) pop.push(it.score); });
    pop.sort(function(a, b){ return a - b; });
    var n = pop.length, on = n > 0 && n >= o.minN, cuts = null;
    function cut(q){ return pop[Math.min(n - 1, Math.ceil(q * n))]; }
    if (on) cuts = { top: cut(o.top), upper: cut(o.upper), low: cut(o.low) };
    (items || []).forEach(function(it){
      if (!it || it.id == null) return;
      var b = 'NONE', rank = null;
      if (it.eligible && it.hold) b = 'HOLD';
      else if (on && it.eligible && typeof it.score === 'number' && isFinite(it.score)) {
        b = it.score >= cuts.top ? 'TOP' : it.score >= cuts.upper ? 'UPPER' : it.score >= cuts.low ? 'MID' : 'LOW';
        var higher = 0; for (var i = n - 1; i >= 0 && pop[i] > it.score; i--) higher++;
        rank = 1 + higher;
      }
      byId[it.id] = { band: b, rankNo: rank };
    });
    return { n: n, on: on, minN: o.minN, cuts: cuts, byId: byId };
  }

  /* The app's row -> item mapping (LOOK-11d): eligible = not terminal and not APPLIED; hold = scoring band STRICT HOLD.
     scoreFor(r) -> {overall, band}; isTerminal(r) -> bool. Returns items plus a key over every input that decides a band (LOOK-10). */
  function itemsFromRows(rows, scoreFor, isTerminal){
    var items = (rows || []).map(function(r){
      var sc = (scoreFor && scoreFor(r)) || {};
      return { id: r.id, score: typeof sc.overall === 'number' && isFinite(sc.overall) ? sc.overall : null, hold: sc.band === 'STRICT HOLD',
        eligible: !(isTerminal && isTerminal(r)) && String(r.BUCKET || '').toUpperCase() !== 'APPLIED' };
    });
    return { items: items, key: items.map(function(it){ return it.id + '|' + it.score + '|' + (it.hold ? 1 : 0) + '|' + (it.eligible ? 1 : 0); }).join(';') };
  }

  /* Header line for the queue panel (V-20 wording). rev / asOf are optional strings. */
  function summary(res, rev, asOf){
    if (!res) return '';
    var tail = ' · REV ' + (rev ? rev : '—') + ' · AS OF ' + (asOf ? asOf : '—');   // LOOK-6: never omitted, never invented
    if (!res.on) return 'BANDS OFF · N ' + res.n + ' ELIGIBLE OPEN < ' + res.minN + tail;
    return 'BANDS = PERCENTILE · N ' + res.n + ' ELIGIBLE OPEN · P90 ' + res.cuts.top + ' · P65 ' + res.cuts.upper + ' · P20 ' + res.cuts.low + tail;
  }

  /* F-6 (golden emptyDrawer): whole-percent shares of N for TOP / UPPER / MID / LOW by largest remainder, so they add up to
     the rounded share of the counted rows (100 when the counts cover the whole population). counts: {TOP, UPPER, MID, LOW}. */
  var SHARE_ORDER = ['TOP', 'UPPER', 'MID', 'LOW'];
  function shares(counts, n){
    var out = {}; if (!n) { SHARE_ORDER.forEach(function(k){ out[k] = null; }); return out; }
    var raw = SHARE_ORDER.map(function(k){ return ((counts && counts[k]) || 0) / n * 100; }), fl = raw.map(function(v){ return Math.floor(v + 1e-9); });
    var target = Math.round(raw.reduce(function(a, v){ return a + v; }, 0) + 1e-9), rest = target - fl.reduce(function(a, v){ return a + v; }, 0);
    raw.map(function(v, i){ return [v - fl[i], i]; }).filter(function(x){ return raw[x[1]] > 0; }).sort(function(a, b){ return b[0] - a[0] || a[1] - b[1]; })
      .forEach(function(x){ if (rest > 0) { fl[x[1]]++; rest--; } });
    SHARE_ORDER.forEach(function(k, i){ out[k] = fl[i]; });
    return out;
  }

  var api = { compute: compute, summary: summary, itemsFromRows: itemsFromRows, shares: shares, GLYPH: GLYPH, LABEL: LABEL, DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PipelineBands = api;
})(typeof window !== 'undefined' ? window : globalThis);
