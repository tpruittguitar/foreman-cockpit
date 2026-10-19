/* D-3 (REV-053): score change since Tim's last review of a job. Pure, no I/O, no DOM.
   A review record is what Tim saw when he last opened (or marked seen) a job:
     { s: overall 0..100, t: ms epoch, p: [part scores in ORDER, -1 = unknown], b: company boost points, r: model revision, bl: 1 = baseline }
   bl marks a record made once from the existing seen marks when this feature first loads, so a change in score after that
   shows up without Tim having to open every job again; the drawer says "since baseline" for those.
   Records live in PIPELINE_EXPLORER_STATE.json under "reviewed": union by job id; a real review always beats a baseline,
   otherwise the larger t wins; never removed (apps-script/StateMerge.gs mirrors merge()). Every number shown is computed here from the two score objects. */
(function(root){
  'use strict';
  var ORDER = ['experience', 'flex', 'compensation', 'geo', 'title', 'culture', 'ats', 'ownership'];
  var NAME = { experience: 'Experience fit', flex: 'Degree FLEX', compensation: 'Net compensation', geo: 'Geography', title: 'Title / scope',
    culture: 'Company culture', ats: 'ATS match', ownership: 'Ownership' };

  function num(v){ v = Number(v); return isFinite(v) ? v : null; }
  function valid(rec){
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
    var s = num(rec.s), t = num(rec.t);
    return s != null && s >= 0 && s <= 100 && t != null && t > 0;
  }
  /* Keep only the known fields, in range; null when the record is not usable. Used on both sides of the sync. */
  function clean(rec){
    if (!valid(rec)) return null;
    var o = { s: Math.round(num(rec.s)), t: Math.round(num(rec.t)) };
    if (Array.isArray(rec.p) && rec.p.length === ORDER.length) o.p = rec.p.map(function(v){ v = num(v); return v == null || v < 0 ? -1 : Math.max(0, Math.min(100, Math.round(v))); });
    if (num(rec.b) != null) o.b = Math.max(0, Math.min(30, Math.round(num(rec.b))));
    if (num(rec.r) != null && num(rec.r) >= 0) o.r = Math.round(num(rec.r));
    if (rec.bl) o.bl = 1;
    return o;
  }
  /* What Tim sees now, as a record. sc = PipelineScoring.scoreRow result; rev = published model revision or null. */
  function snapshot(sc, rev, t, baseline){
    if (!sc || typeof sc.overall !== 'number') return null;
    var parts = sc.parts || {};
    return clean({ s: sc.overall, t: t, p: ORDER.map(function(k){ var p = parts[k]; return p && p.known && num(p.score) != null ? p.score : -1; }),
      b: sc.companyBoost && num(sc.companyBoost.points) != null ? sc.companyBoost.points : 0, r: rev == null ? undefined : rev, bl: baseline ? 1 : 0 });
  }
  /* Does `a` replace `b`? A real review always beats a baseline; otherwise the larger t wins (a tie keeps the stored one). */
  function wins(a, b){ if (!b) return true; if (!a.bl && b.bl) return true; if (a.bl && !b.bl) return false; return a.t > b.t; }
  /* Union by job id under wins(). Returns {store, changed}. */
  function merge(stored, incoming){
    var out = {}, changed = false;
    Object.keys(stored || {}).forEach(function(k){ var c = clean(stored[k]); if (c) out[k] = c; });
    Object.keys(incoming || {}).forEach(function(k){ var c = clean(incoming[k]); if (!c) return; if (wins(c, out[k])) { out[k] = c; changed = true; } });
    return { store: out, changed: changed };
  }
  /* Change from the record to now. Causes: parts whose score moved, largest weighted move first (weight x points moved);
     the model revision and the company boost when they changed. d is the overall score change (integer). */
  function delta(rec, sc, rev){
    rec = clean(rec);
    if (!rec || !sc || typeof sc.overall !== 'number') return null;
    var parts = sc.parts || {}, causes = [];
    if (rec.p) ORDER.forEach(function(k, i){
      var p = parts[k], now = p && p.known && num(p.score) != null ? Math.round(p.score) : -1, was = rec.p[i];
      if (now === was) return;
      causes.push({ key: k, name: NAME[k], from: was < 0 ? null : was, to: now < 0 ? null : now, weight: num(p && p.weight) || 0,
        size: (num(p && p.weight) || 0) * Math.abs((now < 0 ? 0 : now) - (was < 0 ? 0 : was)) });
    });
    causes.sort(function(a, b){ return b.size - a.size || ORDER.indexOf(a.key) - ORDER.indexOf(b.key); });
    var boostNow = sc.companyBoost && num(sc.companyBoost.points) != null ? Math.round(sc.companyBoost.points) : 0;
    return { d: Math.round(sc.overall) - rec.s, from: rec.s, to: Math.round(sc.overall), at: rec.t, baseline: !!rec.bl, causes: causes,
      model: rec.r != null && rev != null && rec.r !== rev ? { from: rec.r, to: rev } : null,
      boost: rec.b != null && rec.b !== boostNow ? { from: rec.b, to: boostNow } : null };
  }
  function partText(c){ return c.name + ' ' + (c.from == null ? 'unknown' : c.from) + ' → ' + (c.to == null ? 'unknown' : c.to); }
  /* One short reason, from the computed causes; '' when nothing explains the change. */
  function causeText(x, max){
    if (!x) return '';
    var bits = x.causes.slice(0, max || 2).map(partText);
    if (x.boost) bits.push('company boost +' + x.boost.from + ' → +' + x.boost.to);
    if (x.model) bits.push('scoring model rev ' + x.model.from + ' → ' + x.model.to);
    return bits.join(' · ');
  }
  function signed(d){ return d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '0'; }
  /* Counts for the "since your last review" strip. items: [{id, isNew, delta}] for the live jobs. */
  function summary(items){
    var o = { n: 0, fresh: [], changed: [], up: 0, down: 0, example: '' }, best = null;
    (items || []).forEach(function(x){
      o.n++;
      if (x.isNew) { o.fresh.push(x.id); return; }
      var d = x.delta; if (!d || !d.d) return;
      o.changed.push(x.id); if (d.d > 0) o.up++; else o.down++;
      if (!best || Math.abs(d.d) > Math.abs(best.d)) best = d;
    });
    o.example = best ? causeText(best, 1) : '';
    return o;
  }
  /* The latest non-baseline review before `before` (this session's start), or null. */
  function lastReviewAt(store, before){
    var m = 0; Object.keys(store || {}).forEach(function(k){ var r = store[k]; if (r && !r.bl && r.t < before && r.t > m) m = r.t; });
    return m || null;
  }
  var api = { ORDER: ORDER, NAME: NAME, wins: wins, valid: valid, clean: clean, snapshot: snapshot, merge: merge, delta: delta, causeText: causeText,
    signed: signed, summary: summary, lastReviewAt: lastReviewAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PipelineReview = api;
})(typeof window !== 'undefined' ? window : globalThis);
