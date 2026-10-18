/* REV-017 state-write fix: merge rule for PIPELINE_EXPLORER_STATE.json (Writer side).
 * Why: a stale browser tab (phone, old session) posted its whole {seen, rulings, incidents} blob and overwrote the shared
 * file, silently losing rulings, seen marks and incident acknowledgements (review 2026-10-17 §2).
 * Rule (acceptance: tests/state-merge-independent.test.js, REV-016, written without reading this code):
 *  - rulings: the stored copy is kept exactly; the master + Writer receipts are the authority for decisions.
 *  - seen: union by job id, keep the larger timestamp; nothing is ever removed.
 *  - incidents (kind 'event'): union by id, never removed. Only ACTIVE may move, and only to a known status;
 *    an acknowledged incident never changes from incoming data (Tim D-4: per-device recovery does not clear it).
 *  - no readable stored state: refuse (throw); never treat it as empty.
 * Pure ES5, no I/O. Deployed as a .gs file (apps-script/deploy.sh pushes *.gs); stateMerge.js re-exports it for Node. */
var STATE_MERGE_KNOWN_STATUS_ = { ACTIVE: 1, ACKNOWLEDGED: 1, ACKNOWLEDGED_UNRESOLVED: 1, RECOVERED: 1 };
function stateMergeIsObject_(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function mergeState_(cur, inc) {
  if (!stateMergeIsObject_(cur)) throw new Error('STATE_UNREADABLE: stored state is missing or not an object; refusing to merge');
  inc = stateMergeIsObject_(inc) ? inc : {};
  var out = { seen: {}, rulings: stateMergeIsObject_(cur.rulings) ? cur.rulings : {}, incidents: { v: 1, incidents: {} } };
  if (cur.incidents && cur.incidents.v != null) out.incidents.v = cur.incidents.v;
  var cs = stateMergeIsObject_(cur.seen) ? cur.seen : {}, is = stateMergeIsObject_(inc.seen) ? inc.seen : {};
  Object.keys(cs).forEach(function (k) { out.seen[k] = cs[k]; });
  Object.keys(is).forEach(function (k) {
    var v = Number(is[k]); if (!isFinite(v)) return;
    if (!(k in out.seen) || v > Number(out.seen[k])) out.seen[k] = v;
  });
  var ci = (cur.incidents && stateMergeIsObject_(cur.incidents.incidents)) ? cur.incidents.incidents : {};
  var ii = (inc.incidents && stateMergeIsObject_(inc.incidents.incidents)) ? inc.incidents.incidents : {};
  Object.keys(ci).forEach(function (k) { out.incidents.incidents[k] = ci[k]; });
  Object.keys(ii).forEach(function (k) {
    var r = ii[k], l = out.incidents.incidents[k];
    if (!stateMergeIsObject_(r) || r.kind !== 'event') return;
    if (!l) { if (typeof r.status === 'string' && STATE_MERGE_KNOWN_STATUS_[r.status]) out.incidents.incidents[k] = r; return; }
    var known = typeof r.status === 'string' && STATE_MERGE_KNOWN_STATUS_.hasOwnProperty(r.status), pick = l;
    if (l.status === 'ACTIVE' && known && r.status !== 'ACTIVE') pick = r;
    else if (known && r.status === l.status && (Number(r.attempts) || 0) > (Number(l.attempts) || 0)) pick = r;
    if (pick !== l) {
      var ids = [].concat(l.eventIds || [], r.eventIds || []).filter(function (x, n, a) { return a.indexOf(x) === n; });
      var merged = {}; Object.keys(pick).forEach(function (f) { merged[f] = pick[f]; });
      merged.id = l.id || k; merged.eventIds = ids; merged.attempts = Math.max(Number(l.attempts) || 0, Number(r.attempts) || 0);
      out.incidents.incidents[k] = merged;
    }
  });
  Object.keys(cur).forEach(function (f) { if (!(f in out) && f !== 'updatedAt') out[f] = cur[f]; });
  out.updatedAt = (typeof inc.updatedAt === 'string' && inc.updatedAt > String(cur.updatedAt || '')) ? inc.updatedAt : (cur.updatedAt || inc.updatedAt || '');
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { mergeState_: mergeState_ };
