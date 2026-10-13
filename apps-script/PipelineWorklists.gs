/* Lane worklists: small plain-text files listing the next master rows each automation lane should work.
   Built by the Writer (which already reads the master) so lane automations never parse the 3 MB master themselves.
   Pure builder below (Node-testable); Apps Script glue (refreshWorklists_) at the bottom.
   Authority: forge-coordination CONTROL, GROK EFFICIENCY AMENDMENT (2026-10-13). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PipelineWorklists = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var Evidence = typeof module === 'object' && module.exports ? require('./PipelineEvidence.gs') : PipelineEvidence;
  function ats() { return typeof module === 'object' && module.exports ? require('./PipelineAts.gs') : PipelineAts; }
  var ROW_RE = /^(\d+) \| /;
  var KV_RE = /^([A-Z][A-Z0-9_]*)=([\s\S]*)$/;
  var EMBEDDED_KEY_RE = /\s+(?=[A-Z][A-Z0-9_]{2,}=)/;
  var FIXED = ['INV', 'PRIMARY_ID', 'COMPANY', 'TITLE', 'BUCKET', 'DISPOSITION', 'TAGS', 'REQ', 'LOCATION'];
  var ACTIVE = ['SCOUT_INTAKE', 'DISCOVERY_LEAD', 'TIM_DECISION_REQUIRED', 'BLOCKED', 'MANUAL_RESEARCH', 'READY_TO_PURSUE'];
  var STRATEGIC_MARK_KEYS = ['ANALYSIS_BY', 'ANALYSIS_ASOF', 'ANALYSIS_ACTOR', 'STRATEGIC_ASOF'];
  var DEGREE_FROM_ALERT_RE = /\b(alert|email|snippet)\b|^(unknown|not available|n\/a)/i;
  var LIMIT = 40, ATTEMPT_COOLDOWN_DAYS = 3, LIVENESS_RECHECK_DAYS = 7, DAY = 86400000;
  var LANES = {
    FORGE_ENRICH_STRATEGIC: 'Active-bucket rows with no fit score the Explorer can read (SCOPE_FIT_RAW, GROK_SCOPE_FIT_RAW and the other FIT_KEYS) and no ANALYSIS_BY/ANALYSIS_ASOF/STRATEGIC_ASOF. Newest first. Rows with STRATEGIC_ATTEMPT_ASOF in the last 3 days go last.',
    FORGE_ENRICH_FEASIBILITY: 'Active-bucket rows with no salary the Explorer can read (posted, estimate, midpoint or low/high) or no posting-based degree evidence (DEGREE_REQ absent and DEGREE_TEXT absent or taken from an alert). Strategically analyzed rows first, then newest. Rows with FEASIBILITY_ATTEMPT_ASOF in the last 3 days go last.',
    FORGE_POSTING_VALIDATION: 'SCOUT_INTAKE rows whose LIVENESS is missing or UNVERIFIED, or UNCONFIRMED with LIVENESS_ASOF older than 7 days. Rows with a Workday, Greenhouse, Lever, Ashby, Oracle HCM (CX site), SmartRecruiters or BambooHR URL are left to the Writer ATS checker unless its ATS_CHECK_RESULT is not LIVE/CLOSED (blocked, error, title mismatch, not on public board). Newest first. Rows with LIVENESS_ATTEMPT_ASOF in the last 3 days go last.'
  };

  function parsePayload(text) {
    var out = {}, last = null;
    String(text || '').split('; ').forEach(function (seg) {
      seg.split(EMBEDDED_KEY_RE).forEach(function (part, i) {
        var m = part.match(KV_RE);
        if (m) { last = m[1]; out[last] = out[last] ? out[last] + '; ' + m[2] : m[2]; }
        else if (last) out[last] += (i ? ' ' : '; ') + part;
      });
    });
    return out;
  }
  function parseRows(text) {
    var rows = [], byId = {};
    String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').forEach(function (ln) {
      if (!ROW_RE.test(ln)) return;
      var c = ln.split(' | ');
      if (c.length < FIXED.length + 1) return;
      var r = {};
      FIXED.forEach(function (k, i) { r[k] = String(c[i] || '').trim(); });
      r.INV_NUM = parseInt(r.INV, 10) || 0;
      r.p = parsePayload(c.slice(FIXED.length).join(' | '));
      var cur = byId[r.PRIMARY_ID];
      if (!cur) { byId[r.PRIMARY_ID] = r; rows.push(r); return; }
      var curDup = cur.BUCKET === 'DUPLICATE', newDup = r.BUCKET === 'DUPLICATE';
      if ((curDup && !newDup) || (curDup === newDup && r.INV_NUM > cur.INV_NUM)) { rows[rows.indexOf(cur)] = r; byId[r.PRIMARY_ID] = r; }
    });
    return rows;
  }
  function val(r, k) { var v = r.p[k]; return v === undefined ? '' : String(v).trim(); }
  function known(r, k) { var v = val(r, k); return !!v && !/^(UNKNOWN|UNVERIFIED|TBD|N\/A|NONE|-)\b/i.test(v); }
  function date(s) { var m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : 0; }
  function recency(r) { return date(val(r, 'DISCOVERED_AT_ET')) || date(val(r, 'DATE_ADDED')) || date(val(r, 'STATE_UPDATED_AT')); }
  function recent(r, k, days, now) { var d = date(val(r, k)); return !!d && now - d < days * DAY; }
  function workable(r) { return ACTIVE.indexOf(r.BUCKET) >= 0 && !/^YES/i.test(val(r, 'ANTI_RESURRECTION')) && !val(r, 'DO_NOT_REWORK'); }
  function analyzed(r) { return Evidence.fit(r.p).value != null || STRATEGIC_MARK_KEYS.some(function (k) { return known(r, k); }); }
  function degreeKnown(r) { if (known(r, 'DEGREE_REQ')) return true; var t = val(r, 'DEGREE_TEXT'); return !!t && !DEGREE_FROM_ALERT_RE.test(t); }
  function needs(r) {
    var n = [];
    if (Evidence.salary(r.p).mid == null) n.push('SALARY');
    if (!degreeKnown(r)) n.push('DEGREE');
    return n;
  }
  function byRecency(a, b) { return recency(b) - recency(a) || b.INV_NUM - a.INV_NUM; }
  function ordered(list, attemptKey, now, first) {
    return list.slice().sort(function (a, b) {
      var ca = recent(a, attemptKey, ATTEMPT_COOLDOWN_DAYS, now) ? 1 : 0, cb = recent(b, attemptKey, ATTEMPT_COOLDOWN_DAYS, now) ? 1 : 0;
      if (ca !== cb) return ca - cb;
      if (first) { var fa = first(a) ? 0 : 1, fb = first(b) ? 0 : 1; if (fa !== fb) return fa - fb; }
      return byRecency(a, b);
    });
  }
  function build(text, opts) {
    opts = opts || {};
    var now = opts.now ? Date.parse(opts.now) : Date.now(), rows = parseRows(text), active = rows.filter(workable);
    var strategic = ordered(active.filter(function (r) { return !analyzed(r); }), 'STRATEGIC_ATTEMPT_ASOF', now);
    var feasibility = ordered(active.filter(function (r) { return needs(r).length; }), 'FEASIBILITY_ATTEMPT_ASOF', now, analyzed);
    var postval = ordered(active.filter(function (r) {
      if (r.BUCKET !== 'SCOUT_INTAKE') return false;
      if (ats().ownedByChecker(r.p)) return false;
      var l = val(r, 'LIVENESS');
      if (!l || /^UNVERIFIED/i.test(l)) return true;
      return /^UNCONFIRMED/i.test(l) && !recent(r, 'LIVENESS_ASOF', LIVENESS_RECHECK_DAYS, now);
    }), 'LIVENESS_ATTEMPT_ASOF', now);
    return { rows: rows.length, lanes: { FORGE_ENRICH_STRATEGIC: strategic, FORGE_ENRICH_FEASIBILITY: feasibility, FORGE_POSTING_VALIDATION: postval } };
  }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim(); return s.length > n ? s.slice(0, n - 1) + '~' : s; }
  function line(r, i, lane) {
    var url = val(r, 'SOURCE_URL') || val(r, 'SOURCE') || val(r, 'LIVENESS_EVIDENCE_URL');
    var bits = [(i + 1) + '. ' + r.PRIMARY_ID, clip(r.COMPANY, 50), clip(r.TITLE, 70), clip(r.LOCATION, 40), 'REQ=' + clip(r.REQ, 40), r.BUCKET, 'URL=' + clip(url.split(/\s/)[0], 220)];
    if (lane === 'FORGE_ENRICH_FEASIBILITY') bits.push('NEED=' + needs(r).join(','));
    if (lane === 'FORGE_POSTING_VALIDATION') bits.push('LIVENESS=' + (clip(val(r, 'LIVENESS'), 30) || 'MISSING'));
    return bits.join(' | ');
  }
  function render(lane, built, meta) {
    meta = meta || {};
    var list = built.lanes[lane] || [], shown = list.slice(0, meta.limit || LIMIT);
    return ['WORKLIST ' + lane,
      'GENERATED_AT_UTC=' + (meta.generatedAt || new Date().toISOString()),
      'MASTER_ID=' + (meta.masterId || '') + ' MASTER_MODIFIED=' + (meta.masterModified || '') + ' MASTER_ROWS=' + built.rows,
      'ELIGIBLE_TOTAL=' + list.length + ' SHOWN=' + shown.length,
      'RULE=' + LANES[lane],
      'USE=Work rows top-down. Skip a row only for a named reason in your receipt. The master stays the authority: confirm each row with row_readback or the Writer RESULT before claiming VERIFIED.',
      'COLUMNS=N. PRIMARY_ID | COMPANY | TITLE | LOCATION | REQ | BUCKET | URL' + (lane === 'FORGE_ENRICH_FEASIBILITY' ? ' | NEED' : lane === 'FORGE_POSTING_VALIDATION' ? ' | LIVENESS' : ''),
      ''].concat(shown.map(function (r, i) { return line(r, i, lane); })).concat(['', 'END WORKLIST']).join('\n') + '\n';
  }
  return { build: build, render: render, parseRows: parseRows, parsePayload: parsePayload, LANES: Object.keys(LANES), LIMIT: LIMIT };
});

/* ================= Apps Script glue ================= */
var WORKLIST_FILES_ = {
  FORGE_ENRICH_STRATEGIC: '1nGzvaRZufMkXD0dIAqcrMeAWZEUzoPu8',
  FORGE_ENRICH_FEASIBILITY: '1B0IxEim2QUxvZ8swiZKwbSMB-1dkY9O1',
  FORGE_POSTING_VALIDATION: '1KyBWb2RTVMoDEkdYGCHuXMAAqCShdQl0'
};
var WORKLIST_INTERVAL_MS_ = 30 * 60 * 1000;

/** Rebuilds the lane worklist files at most every 30 minutes (force=true ignores the interval). Never writes the master. */
function refreshWorklists_(force) {
  var props = PropertiesService.getScriptProperties(), last = +(props.getProperty('WORKLISTS_BUILT_AT') || 0);
  if (!force && Date.now() - last < WORKLIST_INTERVAL_MS_) return { ok: true, skipped: true, builtAt: last ? new Date(last).toISOString() : '' };
  var masterFile = DriveApp.getFileById(MASTER_ID), text = readMasterText_(MASTER_ID);
  var built = PipelineWorklists.build(text), at = new Date().toISOString(), out = { ok: true, builtAt: at, rows: built.rows, lanes: {} };
  Object.keys(WORKLIST_FILES_).forEach(function (lane) {
    var body = PipelineWorklists.render(lane, built, { generatedAt: at, masterId: MASTER_ID, masterModified: masterFile.getLastUpdated().toISOString() });
    DriveApp.getFileById(WORKLIST_FILES_[lane]).setContent(body);
    out.lanes[lane] = { fileId: WORKLIST_FILES_[lane], eligible: built.lanes[lane].length, bytes: body.length };
  });
  props.setProperty('WORKLISTS_BUILT_AT', String(Date.now()));
  return out;
}
