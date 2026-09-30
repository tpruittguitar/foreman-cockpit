/* Scout quality cohort arithmetic (pure). Browser global PipelineQuality + CommonJS. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipelineQuality = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FINAL = ['READY_TO_PURSUE', 'APPLIED', 'REJECTED_BY_EMPLOYER', 'DECLINED_BY_TIM', 'DUPLICATE', 'CLOSED_DEAD', 'INVALID_DISCOVERY'];
  var UNRESOLVED = ['SCOUT_INTAKE', 'DISCOVERY_LEAD', 'TIM_DECISION_REQUIRED', 'BLOCKED', 'MANUAL_RESEARCH'];
  function pDate(s) { if (!s) return null; var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); if (!m) return null; return Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0); }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var h = Math.floor(s.length / 2); return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
  function rate(n, d) { return d ? n / d : null; }
  /**
   * rows: parsed master rows (need BUCKET, payload.SCOUT_RUN_ID, payload.DISCOVERED_AT_ET, payload.STATE_UPDATED_AT, payload.DATE_ADDED)
   * runs: SCOUT_RUN_METRICS records ({SCOUT_RUN_ID, RECEIVED_AT, GROSS_FOUND, NEVER_CONSIDER_EXCLUDED:[], WRITER_EXCLUDED:[], RESULTS:[]})
   * opts: {now, maturityHours (default 72), quietHours (default 24)}
   */
  function cohorts(rows, runs, opts) {
    opts = opts || {}; var now = opts.now || Date.now(); var matH = opts.maturityHours || 72, quietH = opts.quietHours || 24;
    var byRun = {};
    (runs || []).forEach(function (r) { var id = r.SCOUT_RUN_ID || 'UNSPECIFIED'; var c = byRun[id] || (byRun[id] = blank(id)); c.runs.push(r); var K = r.COUNTERS || {};
      c.GROSS_FOUND += +(K.GROSS_FOUND !== undefined ? K.GROSS_FOUND : r.GROSS_FOUND) || 0;
      var ex = K.NEVER_CONSIDER_EXCLUDED !== undefined ? +K.NEVER_CONSIDER_EXCLUDED : (typeof r.NEVER_CONSIDER_EXCLUDED === 'number' ? r.NEVER_CONSIDER_EXCLUDED : (r.NEVER_CONSIDER_EXCLUDED || []).length + (r.WRITER_EXCLUDED || []).length);
      c.NEVER_CONSIDER_EXCLUDED += ex || 0;
      ['SCOUT_INTAKE_WRITTEN', 'DISCOVERY_LEAD_WRITTEN', 'EXISTING_MATCH', 'WRITE_FAILED', 'NEVER_CONSIDER_REVIEW_NEEDED', 'DISCOVERY_UNACCOUNTED'].forEach(function (k) { c[k] += +K[k] || 0; }); if (K.RUN_ACCOUNTING && K.RUN_ACCOUNTING !== 'RECONCILED') c.accountingIssues++; if (r.WRITE_VERIFIED === false || r.COMPLETION_STATUS === 'FAILED') c.writeFailures++; c.lastStatus = r.COMPLETION_STATUS || c.lastStatus;
      Object.keys(K).forEach(function (k) { var m = k.match(/^(.+)_COUNT$/); if (m) c.byRule[m[1]] = (c.byRule[m[1]] || 0) + (+K[k] || 0); });
      (r.EXCLUSIONS || []).forEach(function (x) { if (!K.NEVER_CONSIDER_EXCLUDED && x && x.NEVER_CONSIDER_RULE_ID) c.byRule[x.NEVER_CONSIDER_RULE_ID] = (c.byRule[x.NEVER_CONSIDER_RULE_ID] || 0) + 1; });
      if (!c.receivedAt || (r.RECEIVED_AT && r.RECEIVED_AT < c.receivedAt)) c.receivedAt = r.RECEIVED_AT || c.receivedAt; });
    rows.forEach(function (r) { var id = r.payload && r.payload.SCOUT_RUN_ID; if (!id) return; var c = byRun[id] || (byRun[id] = blank(id)); c.ENTERED_MASTER++; c.buckets[r.BUCKET] = (c.buckets[r.BUCKET] || 0) + 1;
      var d0 = pDate(r.payload.DISCOVERED_AT_ET) || pDate(r.payload.DATE_ADDED); if (d0 && (!c.firstSeen || d0 < c.firstSeen)) c.firstSeen = d0;
      if (FINAL.indexOf(r.BUCKET) >= 0) { var d1 = pDate(r.payload.STATE_UPDATED_AT); if (d0 && d1 && d1 >= d0) c.ttf.push((d1 - d0) / 36e5); } });
    var out = Object.keys(byRun).map(function (id) { var c = byRun[id]; var b = c.buckets;
      c.SCOUT_INTAKE = b.SCOUT_INTAKE || 0; c.DISCOVERY_LEAD = b.DISCOVERY_LEAD || 0; c.DUPLICATE = b.DUPLICATE || 0; c.DEAD_OR_STALE = b.CLOSED_DEAD || 0; c.INVALID_DISCOVERY = b.INVALID_DISCOVERY || 0;
      c.READY = b.READY_TO_PURSUE || 0; c.APPLIED = b.APPLIED || 0; c.DECLINED = b.DECLINED_BY_TIM || 0; c.REJECTED_BY_EMPLOYER = b.REJECTED_BY_EMPLOYER || 0;
      c.STILL_UNRESOLVED = UNRESOLVED.reduce(function (n, k) { return n + (b[k] || 0); }, 0);
      c.VALID_DISTINCT = c.ENTERED_MASTER - c.DUPLICATE - c.INVALID_DISCOVERY;  // declines for pay/geo/FLEX/domain preference are valid discoveries
      c.ADMISSION_RATE = rate(c.ENTERED_MASTER, c.GROSS_FOUND); c.VALIDITY_RATE = rate(c.VALID_DISTINCT, c.ENTERED_MASTER); c.ACTIONABLE_YIELD = rate(c.READY + c.APPLIED, c.ENTERED_MASTER);
      c.DUPLICATE_RATE = rate(c.DUPLICATE, c.ENTERED_MASTER); c.INVALID_RATE = rate(c.INVALID_DISCOVERY, c.ENTERED_MASTER); c.UNRESOLVED_RATE = rate(c.STILL_UNRESOLVED, c.ENTERED_MASTER);
      c.MEDIAN_TIME_TO_FINAL_DISPOSITION_H = median(c.ttf);
      var start = c.firstSeen || pDate(c.receivedAt) || null; c.ageHours = start ? (now - start) / 36e5 : null;
      c.maturity = c.ageHours === null ? 'UNKNOWN' : (c.ageHours < quietH ? 'IMMATURE' : (c.STILL_UNRESOLVED > 0 && c.ageHours < matH ? 'IN_PROGRESS' : 'FINALIZED'));
      c.scored = c.maturity === 'FINALIZED'; return c; });
    out.sort(function (a, b) { return (b.firstSeen || 0) - (a.firstSeen || 0); });
    return out;
  }
  function blank(id) { return { SCOUT_RUN_ID: id, runs: [], GROSS_FOUND: 0, NEVER_CONSIDER_EXCLUDED: 0, ENTERED_MASTER: 0, SCOUT_INTAKE_WRITTEN: 0, DISCOVERY_LEAD_WRITTEN: 0, EXISTING_MATCH: 0, WRITE_FAILED: 0, NEVER_CONSIDER_REVIEW_NEEDED: 0, DISCOVERY_UNACCOUNTED: 0, accountingIssues: 0, writeFailures: 0, lastStatus: '', byRule: {}, buckets: {}, ttf: [], firstSeen: null, receivedAt: null }; }
  /** Aggregate cohorts within a window (days back from now). Only the sums; rates recomputed from sums. */
  function window(cs, days, now) { now = now || Date.now(); var cut = now - days * 864e5; var sel = cs.filter(function (c) { return c.firstSeen && c.firstSeen >= cut; }); var agg = blank('window_' + days + 'd'); var ttf = [];
    sel.forEach(function (c) { ['GROSS_FOUND', 'NEVER_CONSIDER_EXCLUDED', 'ENTERED_MASTER', 'SCOUT_INTAKE_WRITTEN', 'DISCOVERY_LEAD_WRITTEN', 'EXISTING_MATCH', 'WRITE_FAILED', 'NEVER_CONSIDER_REVIEW_NEEDED', 'DISCOVERY_UNACCOUNTED', 'accountingIssues', 'SCOUT_INTAKE', 'DISCOVERY_LEAD', 'VALID_DISTINCT', 'DUPLICATE', 'DEAD_OR_STALE', 'INVALID_DISCOVERY', 'READY', 'APPLIED', 'DECLINED', 'STILL_UNRESOLVED'].forEach(function (k) { agg[k] = (agg[k] || 0) + (c[k] || 0); }); Object.keys(c.byRule || {}).forEach(function (k) { agg.byRule[k] = (agg.byRule[k] || 0) + c.byRule[k]; }); ttf = ttf.concat(c.ttf); });
    agg.cohorts = sel.length; agg.finalized = sel.filter(function (c) { return c.scored; }).length;
    agg.ADMISSION_RATE = rate(agg.ENTERED_MASTER, agg.GROSS_FOUND); agg.VALIDITY_RATE = rate(agg.VALID_DISTINCT, agg.ENTERED_MASTER); agg.ACTIONABLE_YIELD = rate((agg.READY || 0) + (agg.APPLIED || 0), agg.ENTERED_MASTER);
    agg.DUPLICATE_RATE = rate(agg.DUPLICATE, agg.ENTERED_MASTER); agg.INVALID_RATE = rate(agg.INVALID_DISCOVERY, agg.ENTERED_MASTER); agg.UNRESOLVED_RATE = rate(agg.STILL_UNRESOLVED, agg.ENTERED_MASTER); agg.MEDIAN_TIME_TO_FINAL_DISPOSITION_H = median(ttf);
    return agg; }
  return { cohorts: cohorts, window: window, median: median, FINAL: FINAL, UNRESOLVED: UNRESOLVED };
}));
