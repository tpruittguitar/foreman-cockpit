/* Pipeline Explorer master loader. Reads the canonical master, the terminal archive and the evidence companion as three
   separate Writer reads (the single GET master&hydrate=1 response grew past what Google will serve) and merges them in the
   browser with the Writer's own hydration functions, copied verbatim from apps-script/Code.gs.
   tests/master-loader.test.js fails if any copied function or constant drifts from Code.gs.
   Fail closed on freshness: if the canonical master cannot be fetched and validated, nothing is presented as current. A
   cached copy may be shown only with freshness STALE; archive/evidence failures are reported separately and never mark the
   canonical master stale. The loader only reads: it accepts only the read actions in READ_ACTIONS.
   Each read retries on its own (default 3 s, then 8 s) when the failure is transient: a network error, an HTML or other
   non-JSON response, or a Writer ok:false whose error isTransientDocError_ (the Writer's own rule) calls transient. A
   response that parses but is structurally invalid, or any other ok:false, is never retried.
   Works as a browser global (window.PipelineLoader) and as a CommonJS module (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipelineLoader = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* ---------- verbatim from apps-script/Code.gs (do not edit here; change Code.gs and copy) ---------- */
  var FIXED_N = 9;
  var BUCKETS = ['SCOUT_INTAKE', 'DISCOVERY_LEAD', 'READY_TO_PURSUE', 'TIM_DECISION_REQUIRED', 'BLOCKED', 'MANUAL_RESEARCH', 'APPLIED', 'REJECTED_BY_EMPLOYER', 'DECLINED_BY_TIM', 'DUPLICATE', 'CLOSED_DEAD', 'INVALID_DISCOVERY'];
  var ARCHIVE_BUCKETS = ['CLOSED_DEAD', 'DUPLICATE', 'DECLINED_BY_TIM', 'REJECTED_BY_EMPLOYER'];
  function parsePayload(rest) {
    var segs = rest.split('; '), payload = {}, order = [], lead = [], last = null;
    for (var i = 0; i < segs.length; i++) {
      var m = segs[i].match(/^([A-Z][A-Z0-9_]*)=([\s\S]*)$/);
      if (m) { last = m[1]; if (order.indexOf(last) < 0) order.push(last); payload[last] = (payload[last] !== undefined ? payload[last] + '; ' : '') + m[2]; }
      else if (last) payload[last] += '; ' + segs[i];
      else lead.push(segs[i]);
    }
    return { lead: lead.join('; ').replace(/;\s*$/, ''), payload: payload, order: order };
  }
  function buildPayload(lead, payload, order) {
    var parts = lead ? [lead] : [];
    for (var i = 0; i < order.length; i++) parts.push(order[i] + '=' + payload[order[i]]);
    return parts.join('; ');
  }
  function rowParts_(line) {
    var c = String(line).split(' | '); if (c.length < FIXED_N + 1 || !/^\d+$/.test(c[0])) return null;
    var pp = parsePayload(c.slice(FIXED_N).join(' | ')); return { fixed: c.slice(0, FIXED_N), lead: pp.lead, P: pp.payload, O: pp.order };
  }
  function evidenceRefOf_(line) { var r = rowParts_(line); var m = r && String(r.P.EVIDENCE_REF || '').match(/^EVC1:(\d+)$/); return m ? +m[1] : 0; }
  function parseCompanion_(text) {
    var recs = [];
    String(text || '').split('\n').forEach(function (l, i) {
      if (!l.trim()) return; var o;
      try { o = JSON.parse(l); } catch (e) { throw new Error('evidence companion line ' + (i + 1) + ' unreadable (fail closed): ' + e.message); }
      if (o && o.pid) recs.push(o);
    });
    return recs;
  }
  function resolveEvidence_(recs, pid, ref) {
    var by = {}; recs.forEach(function (r) { if (r.pid === pid && !by[r.v]) by[r.v] = r; });
    var chain = [], v = ref, guard = 0;
    while (v && by[v] && guard++ < 10000) { chain.unshift(by[v]); v = by[v].base || 0; }
    if (v) return null;
    var out = {}; chain.forEach(function (r) { Object.keys(r.f || {}).forEach(function (k) { out[k] = r.f[k]; }); });
    return out;
  }
  function parseArchive_(text) {
    var rows = [], restored = {};
    String(text || '').split('\n').forEach(function (l) {
      if (/^\d+ \| /.test(l)) rows.push(l);
      else { var m = l.match(/^RESTORED\|([^|]+)\|(\d+)\|/); if (m) restored[m[1] + '#' + m[2]] = true; }
    });
    return rows.filter(function (l) { var c = l.split(' | '); return !restored[c[1].trim() + '#' + c[0]]; });
  }
  function rowKey_(line) { var c = String(line).split(' | '); return c[1].trim() + '#' + c[0]; }
  function hydrateLines_(masterLines, archiveRows, recs) {
    var inMaster = {}, out = [];
    masterLines.forEach(function (l) {
      var r = rowParts_(l);
      if (!r) { out.push(l); return; }
      inMaster[rowKey_(l)] = true;
      var ref = evidenceRefOf_(l); if (!ref) { out.push(l); return; }
      var f = resolveEvidence_(recs, r.fixed[1].trim(), ref), O = r.O.slice();
      if (!f) { r.P.EVIDENCE_UNRESOLVED = 'YES'; O.push('EVIDENCE_UNRESOLVED'); }
      else Object.keys(f).forEach(function (k) { if (r.P[k] === undefined) { r.P[k] = f[k]; O.push(k); } });
      out.push(r.fixed.join(' | ') + ' | ' + buildPayload(r.lead, r.P, O));
    });
    var extra = archiveRows.filter(function (l) { return !inMaster[rowKey_(l)]; });
    if (extra.length) {
      var endAt = -1; for (var i = out.length - 1; i >= 0; i--) if (/^END V2_CURRENT_POPULATION_MASTER/.test(out[i])) { endAt = i; break; }
      if (endAt < 0) endAt = out.length;
      var block = [];
      ARCHIVE_BUCKETS.forEach(function (b) {
        var g = extra.filter(function (l) { return l.split(' | ')[4] === b; }); if (!g.length) return;
        block.push('=== ' + b + ' (' + g.length + ') ===');
        g.forEach(function (l) { block.push(l + '; ARCHIVE_STATE=ARCHIVED_TERMINAL'); });
      });
      extra.filter(function (l) { return ARCHIVE_BUCKETS.indexOf(l.split(' | ')[4]) < 0; }).forEach(function (l) { block.push(l + '; ARCHIVE_STATE=ARCHIVED_TERMINAL'); });
      Array.prototype.splice.apply(out, [endAt, 0].concat(block));
    }
    var counts = recomputeCountsLine(out), end = recomputeEndLine(out);
    return out.map(function (l) { return /^COUNTS:/.test(l) ? counts : (end && /^END V2_CURRENT_POPULATION_MASTER/.test(l) ? end : l); });
  }
  function recomputeCountsLine(lines) {
    var counts = {}, total = 0, unaccounted = 0, existing = null;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i];
      if (/^COUNTS:/.test(t)) existing = t;
      else if (/^\d+ \| /.test(t)) { var c = t.split(' | '); var b = (c[4] || '').trim(); if (c.length >= FIXED_N + 1 && b) { counts[b] = (counts[b] || 0) + 1; total++; } else unaccounted++; }
    }
    var order = [];
    if (existing) existing.replace(/^COUNTS:\s*/, '').split(/\s+/).forEach(function (tok) { var m = tok.match(/^([A-Z_]+)=/); if (m && m[1] !== 'TOTAL' && m[1] !== 'UNACCOUNTED' && order.indexOf(m[1]) < 0) order.push(m[1]); });
    BUCKETS.forEach(function (b) { if (order.indexOf(b) < 0 && counts[b]) order.push(b); }); // new buckets appear once they have rows; a master without them keeps its COUNTS line byte-identical
    Object.keys(counts).forEach(function (b) { if (order.indexOf(b) < 0) order.push(b); });
    return 'COUNTS: TOTAL=' + total + ' ' + order.map(function (b) { return b + '=' + (counts[b] || 0); }).join(' ') + ' UNACCOUNTED=' + unaccounted;
  }
  function recomputeEndLine(lines) {
    var has = false, n = 0;
    for (var i = 0; i < lines.length; i++) { var t = lines[i]; if (/^END V2_CURRENT_POPULATION_MASTER/.test(t)) has = true; else if (/^\d+ \| /.test(t) && t.split(' | ').length >= FIXED_N + 1 && (t.split(' | ')[4] || '').trim()) n++; }
    return has ? 'END V2_CURRENT_POPULATION_MASTER (' + n + ' rows)' : null;
  }
  function liveArchiveState_(st) { return !!(st && st.mode === 'LIVE' && st.archiveId && st.status !== 'ABANDONED'); }
  function isTransientDocError_(e) {
    var m = String(e && e.message || e);
    if (/lock timeout/i.test(m)) return false;
    return /document is inaccessible|please try again later|service error|service unavailable|server error|internal error|backend error|temporarily unavailable/i.test(m);
  }
  /* ---------- end verbatim ---------- */

  var READ_ACTIONS = ['master', 'archive', 'migration_status', 'document_text', 'evidence'];
  var RETRY_DELAYS_MS = [3000, 8000];

  /** Pure: why a Writer master response is not a usable canonical master, or '' when it is. */
  function masterResponseError(j) {
    if (!j || typeof j !== 'object') return 'no JSON response';
    if (j.ok !== true) return String(j.error || j.hint || 'Writer rejected the read');
    if (typeof j.text !== 'string' || !j.text) return 'response has no master text';
    if (!/^COUNTS:/m.test(j.text)) return 'master text has no COUNTS line';
    if (!/^\d+ \| /m.test(j.text)) return 'master text has no rows';
    return '';
  }
  /** Evidence not loaded: one empty head record per pointer, so hydrateLines_ merges nothing and flags nothing. */
  function placeholderRecs(lines) {
    var recs = [];
    lines.forEach(function (l) { var r = rowParts_(l), v = r && evidenceRefOf_(l); if (v) recs.push({ pid: r.fixed[1].trim(), v: v, base: 0, f: {} }); });
    return recs;
  }
  /** Pure: the view text. Both components loaded = exactly the Writer's hydrated view; neither = the canonical master text. */
  function composeView(masterText, archiveRows, recs) {
    if (archiveRows === null && recs === null) return masterText;
    var lines = masterText.split(/\r?\n/);
    return hydrateLines_(lines, archiveRows === null ? [] : archiveRows, recs === null ? placeholderRecs(lines) : recs).join('\n');
  }
  function errText(e) { var m = String(e && e.message || e || 'unknown error'); return /Unexpected token '?<|is not valid JSON|<!DOCTYPE/i.test(m) ? 'Writer returned an HTML error page instead of JSON' : m; }

  /**
   * Loads the view. opts.get(action, extra) -> Promise<json> (a read-only Writer GET); opts.cache {read(), write(entry)};
   * opts.onUpdate(view) is called when the master settles and again as archive/evidence arrive. Resolves with the final view.
   * view.freshness: LIVE (fresh canonical master) | STALE (master failed, cached copy shown) | NONE (master failed, no cache).
   */
  function load(opts) {
    var cache = opts.cache || { read: function () { return null; }, write: function () {} }, onUpdate = opts.onUpdate || function () {};
    var delays = opts.retryDelaysMs || RETRY_DELAYS_MS, onRetry = opts.onRetry || function () {};
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    /** One read with its own bounded retries; resolves with the response or rejects with the last error (attempts noted). */
    function get(action, extra) {
      if (READ_ACTIONS.indexOf(action) < 0) return Promise.reject(new Error('loader refused non-read action ' + action));
      var attempt = 0;
      function retry(reason) { onRetry({ action: action, attempt: attempt, of: delays.length, reason: reason }); return sleep(delays[attempt - 1]).then(once); }
      function once() {
        attempt++;
        return Promise.resolve().then(function () { return opts.get(action, extra || ''); }).then(function (j) {
          if (j && j.ok === false && isTransientDocError_(j.error) && attempt <= delays.length) return retry('transient Writer error: ' + j.error);
          if (j && typeof j === 'object' && attempt > 1) j.readAttempts = attempt;
          if (j && j.ok === false && isTransientDocError_(j.error)) j.error = j.error + ' (after ' + attempt + ' attempts)';
          return j;
        }, function (e) {
          if (attempt <= delays.length) return retry(errText(e));
          throw new Error(errText(e) + (attempt > 1 ? ' (after ' + attempt + ' attempts)' : ''));
        });
      }
      return once();
    }
    var startedAt = new Date().toISOString();
    var masterP = get('master').then(function (j) { var e = masterResponseError(j); return e ? { ok: false, error: e } : { ok: true, j: j }; }, function (e) { return { ok: false, error: 'master read failed: ' + errText(e) }; });
    var migP = get('migration_status').then(function (j) { return j && j.ok ? { ok: true, state: j.state || null } : { ok: false, error: String(j && j.error || 'migration status unavailable') }; }, function (e) { return { ok: false, error: 'migration status read failed: ' + errText(e) }; });
    var archiveRawP = get('archive').then(function (j) { return j; }, function (e) { return { ok: false, error: 'archive read failed: ' + errText(e) }; });
    var archiveP = Promise.all([migP, archiveRawP]).then(function (x) {
      var mig = x[0], j = x[1];
      if (!mig.ok) return { state: 'FAILED', error: mig.error };
      if (!liveArchiveState_(mig.state)) return { state: 'NOT_APPLICABLE' };
      if (!j || j.ok !== true || typeof j.text !== 'string') return { state: 'FAILED', error: String(j && j.error || 'archive response unreadable') };
      if (j.archiveId !== mig.state.archiveId) return { state: 'FAILED', error: 'archive id mismatch (' + j.archiveId + ' vs ' + mig.state.archiveId + ')' };
      return { state: 'OK', rows: parseArchive_(j.text) };
    }).catch(function (e) { return { state: 'FAILED', error: errText(e) }; });
    var evidenceP = migP.then(function (mig) {
      if (!mig.ok) return { state: 'FAILED', error: mig.error };
      if (!liveArchiveState_(mig.state)) return { state: 'NOT_APPLICABLE' };
      if (!mig.state.companionId) return { state: 'FAILED', error: 'migration state names no evidence companion' };
      return get('document_text', '&fileId=' + encodeURIComponent(mig.state.companionId)).then(function (j) {
        if (!j || j.ok !== true || typeof j.text !== 'string' || j.fileId !== mig.state.companionId) return { state: 'FAILED', error: String(j && j.error || 'evidence companion response unreadable') };
        return { state: 'OK', recs: parseCompanion_(j.text) };
      }, function (e) { return { state: 'FAILED', error: 'evidence companion read failed: ' + errText(e) }; });
    }).catch(function (e) { return { state: 'FAILED', error: errText(e) }; });

    return masterP.then(function (m) {
      if (!m.ok) {
        var c = null; try { c = cache.read(); } catch (e) { c = null; }
        var usable = c && typeof c.text === 'string' && c.text;
        var failed = { freshness: usable ? 'STALE' : 'NONE', error: m.error, startedAt: startedAt, failedAt: new Date().toISOString(), text: usable ? c.text : '', meta: usable ? (c.meta || {}) : {}, fromCache: !!usable,
          archive: { state: 'NOT_LOADED' }, evidence: { state: 'NOT_LOADED' } };
        onUpdate(failed);
        return failed;
      }
      var j = m.j, base = { id: j.id, fetchedAt: j.fetchedAt, modifiedTime: j.modifiedTime || '', canonicalBytes: j.text.length, masterAttempts: j.readAttempts || 1 };
      var view = { freshness: 'LIVE', error: '', startedAt: startedAt, text: j.text, fromCache: false, meta: base, archive: { state: 'PENDING' }, evidence: { state: 'PENDING' } };
      function publish() {
        var a = view.archive.state === 'OK' ? view.archive.rows : null, r = view.evidence.state === 'OK' ? view.evidence.recs : null;
        view.text = composeView(j.text, a, r);
        view.meta = Object.assign({}, base, { bytes: view.text.length, archive: view.archive.state, evidence: view.evidence.state });
        if (view.archive.state !== 'PENDING' && view.evidence.state !== 'PENDING') { try { cache.write({ text: view.text, meta: view.meta }); } catch (e) {} }
        onUpdate(Object.assign({}, view));
      }
      publish();
      var settle = function (key) { return function (res) { view[key] = res; publish(); }; };
      return Promise.all([archiveP.then(settle('archive')), evidenceP.then(settle('evidence'))]).then(function () { return Object.assign({}, view); });
    });
  }
  /** On-demand narrative for one row when the companion could not be loaded in bulk. */
  function rowEvidence(getFn, pid) {
    return Promise.resolve().then(function () { return getFn('evidence', '&primaryId=' + encodeURIComponent(pid)); });
  }
  return { load: load, composeView: composeView, masterResponseError: masterResponseError, rowEvidence: rowEvidence, READ_ACTIONS: READ_ACTIONS, RETRY_DELAYS_MS: RETRY_DELAYS_MS, isTransientDocError_: isTransientDocError_,
    hydrateLines_: hydrateLines_, parseArchive_: parseArchive_, parseCompanion_: parseCompanion_, resolveEvidence_: resolveEvidence_, liveArchiveState_: liveArchiveState_ };
}));
