/* Percentile bands for the opportunity rating (v1.5 spec §3.1, Grok Bot V-19 / V-20). Display only: the score itself
   comes from pipeline-scoring.js and is never changed here (L-2: every number shown is computed by the app).
   Population = eligible open jobs with a score, minus STRICT HOLD. Applied and terminal jobs are outside the population
   (band NONE). Cut-points: cut(q) = sorted[min(n-1, ceil(q*n))]; a score equal to a cut goes to the higher band.
   Rank = 1 + eligible scores strictly higher (ties share the better rank). Below minN the bands are off.
   Quantiles and minN are tokens (tokens.css --pe-band-rank-* / --pe-band-min-n); the caller passes them in. */
(function(root){
  'use strict';
  var GLYPH = { TOP: '▲', UPPER: '◆', MID: '●', LOW: '▽', HOLD: '‖', NONE: '—' };
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

  /* Header line for the queue panel (V-20 wording). rev / asOf are optional strings. */
  function summary(res, rev, asOf){
    if (!res) return '';
    if (!res.on) return 'BANDS OFF · N ' + res.n + ' ELIGIBLE OPEN < ' + res.minN;
    return 'BANDS = PERCENTILE · N ' + res.n + ' ELIGIBLE OPEN · P90 ' + res.cuts.top + ' · P65 ' + res.cuts.upper + ' · P20 ' + res.cuts.low +
      (rev ? ' · REV ' + rev : '') + (asOf ? ' · AS OF ' + asOf : '');
  }

  var api = { compute: compute, summary: summary, GLYPH: GLYPH, LABEL: LABEL, DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PipelineBands = api;
})(typeof window !== 'undefined' ? window : globalThis);
