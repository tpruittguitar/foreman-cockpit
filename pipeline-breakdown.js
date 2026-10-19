/* Score breakdown for the drawer (golden F02 C-07 / V-16). Display only (L-2): every number comes from the score object
   pipeline-scoring.js scoreRow returns. Points = weight x part score / known weight x coverage factor, with
   factor = 0.7 + 0.3 x coverage / 100 (the same confidence penalty scoreRow applies). Points are the exact contributions rounded to 0.1 by largest remainder, so they add
   up to the exact weighted sum at 0.1; the ring is that sum rounded (header "Σ <known>% KNOWN = <sum> → <ring>"). Only parts
   with a positive contribution receive a rounding tenth. */
(function(root){
  'use strict';
  var ORDER = ['experience', 'flex', 'compensation', 'geo', 'title', 'culture', 'ats', 'ownership'];
  var NAME = { experience: 'Experience fit', flex: 'Degree FLEX', compensation: 'Net compensation', geo: 'Geography', title: 'Title / scope',
    culture: 'Company culture', ats: 'ATS match', ownership: 'Ownership' };

  /* sc: {overall, confidence, parts:{key:{score, known, weight}}}. Returns null when there is no overall score. */
  function breakdown(sc){
    if (!sc || typeof sc.overall !== 'number' || !sc.parts) return null;
    var parts = sc.parts, total = 0;
    ORDER.forEach(function(k){ total += (parts[k] && +parts[k].weight) || 0; });
    var known = ORDER.filter(function(k){ return parts[k] && parts[k].known && +parts[k].weight > 0; });
    var avail = known.reduce(function(a, k){ return a + (+parts[k].weight); }, 0);
    var coverage = typeof sc.confidence === 'number' ? sc.confidence : (total ? Math.round(avail / total * 100) : 0);
    var factor = 0.7 + 0.3 * coverage / 100;
    var exact = ORDER.map(function(k){ return known.indexOf(k) >= 0 && avail ? parts[k].weight * parts[k].score / avail * factor : 0; });
    var tenths = exact.map(function(v){ return Math.floor(v * 10 + 1e-9); }), target = Math.round(exact.reduce(function(a, b){ return a + b; }, 0) * 10 + 1e-9);
    var rest = target - tenths.reduce(function(a, b){ return a + b; }, 0);
    var rem = exact.map(function(v, i){ return [v * 10 - tenths[i], i]; }).filter(function(x){ return known.indexOf(ORDER[x[1]]) >= 0 && exact[x[1]] > 0; });
    rem.slice().sort(function(a, b){ return b[0] - a[0]; }).forEach(function(x){ if (rest > 0) { tenths[x[1]]++; rest--; } });
    rem.slice().sort(function(a, b){ return a[0] - b[0]; }).forEach(function(x){ if (rest < 0 && tenths[x[1]] > 0) { tenths[x[1]]--; rest++; } });
    var rows = ORDER.map(function(k, i){
      var p = parts[k] || {}, w = +p.weight || 0;
      return { key: k, name: NAME[k], weight: total ? Math.round(w / total * 100) : 0, known: !!p.known, score: p.known ? p.score : null, points: tenths[i] / 10 };
    });
    var knownPct = rows.reduce(function(a, r){ return a + (r.known ? r.weight : 0); }, 0);
    var parts10 = Math.round(rows.reduce(function(a, r){ return a + r.points; }, 0) * 10) / 10;
    // REV-046 company boost: its own line after the weighted parts, so the total still reads to the ring.
    var cb = sc.companyBoost || {}, boost = +cb.points || 0;
    if (boost) rows.push({ key: 'boost', name: 'Company boost · ' + cb.tier, weight: null, known: true, score: null, points: boost, boost: true });
    var sum = Math.round((parts10 + boost) * 10) / 10;
    return { rows: rows, knownPct: knownPct, partsSum: parts10, boost: boost, sum: sum, coverage: coverage, factor: factor, overall: sc.overall,
      allShared: rows.every(function(r){ return r.weight >= 0; }) };
  }

  var api = { breakdown: breakdown, ORDER: ORDER, NAME: NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PipelineBreakdown = api;
})(typeof window !== 'undefined' ? window : globalThis);
