/* Decision rule shared by the job list and the job drawer.
   Once Tim decides, the role leaves every default view at once and shows as pending while the write runs, so it cannot be
   decided twice. It comes back only when
     a) something material changed after the decision (title, location, pay, posting reopened/reposted, score moved 10+), or
     b) the decision did not save (the Writer refused it, or the result stayed unknown).
   A retry resends the same request (same requestId), so it can never record a second decision.
   Pure functions. pipeline.html supplies the row accessors. */
(function (root) {
  'use strict';
  var SCORE_MOVE = 10;
  var DECIDING = { APPLIED: 1, DECLINE: 1, REJECTED_BY_EMPLOYER: 1, CLOSED_DEAD: 1, DUPLICATE: 1, INVALID_DISCOVERY: 1 };
  var DECIDED_BUCKETS = { APPLIED: 1, DECLINED_BY_TIM: 1, REJECTED_BY_EMPLOYER: 1, REJECTED: 1, CLOSED_DEAD: 1, DUPLICATE: 1, INVALID_DISCOVERY: 1 };
  var LABEL = { APPLIED: 'Applied', DECLINE: 'Declined', REJECTED_BY_EMPLOYER: 'Rejected by employer', CLOSED_DEAD: 'Closed', DUPLICATE: 'Duplicate', INVALID_DISCOVERY: 'Invalid' };

  function day(ts) { return String(ts || '').slice(0, 10); }

  /** The save state of Tim's ruling, from the request's own status (never a timer). */
  function saveState(ru) {
    if (!ru) return '';
    var s = ru.writeStatus || (ru.receipt ? 'READBACK_PENDING' : 'LOCAL_DRAFT');
    if (ru.outbox && ru.outbox.auto && s !== 'VERIFIED' && s !== 'READBACK_PENDING') return 'PENDING';
    if (s === 'WRITE_FAILED' || s === 'RESULT_UNKNOWN' || (ru.error && s !== 'VERIFIED' && s !== 'READBACK_PENDING')) return 'NOT_SAVED';
    if (s === 'VERIFIED' || s === 'READBACK_PENDING' || s === 'READBACK_UNCONFIRMED') return 'SAVED';
    if (s === 'LOCAL_DRAFT') return 'NOT_SAVED';
    return 'PENDING';
  }
  /** What Tim decided on this role: his ruling on this device or synced, else the master's own record. */
  function decision(r, ru) {
    if (ru && DECIDING[ru.kind]) return { kind: ru.kind, at: ru.ts, code: ru.code || '', state: saveState(ru), ru: ru };
    var b = String(r && r.BUCKET || '').toUpperCase();
    if (DECIDED_BUCKETS[b]) return { kind: b === 'DECLINED_BY_TIM' ? 'DECLINE' : b === 'REJECTED' ? 'REJECTED_BY_EMPLOYER' : b, at: (r.payload && (r.payload.APP_DATE || r.payload.STATE_UPDATED_AT)) || '', state: 'SAVED', master: true };
    return null;
  }
  /** The decision-time values a later change is measured against (stored with the ruling). */
  function snapshot(r, score) {
    var p = r.payload || {};
    return { TITLE: r.TITLE || '', LOCATION: r.LOCATION || '', PAY: r.compMid == null ? null : Math.round(r.compMid), SCORE: score == null ? null : Math.round(score),
      LIVENESS: p.LIVENESS || '', REPOSTED: p.REPOSTED_AT || p.REOPENED_AT || '', WORK_ARRANGEMENT: p.WORK_ARRANGEMENT || '', CONTACT: p.RECRUITER || p.RECRUITER_EMAIL || '', APP_STATUS: p.APP_STATUS || p.INTERVIEW_STATUS || '' };
  }
  /** Material changes since the decision: [{field, before, after}]. */
  function changes(r, ru, score) {
    var before = ru && ru.decisionSnap; if (!before) return [];
    var now = snapshot(r, score), out = [];
    function moved(k, label, fmt) { if (before[k] != null && before[k] !== '' && now[k] !== before[k]) out.push({ field: label, before: fmt ? fmt(before[k]) : before[k], after: fmt ? fmt(now[k]) : now[k] }); }
    moved('TITLE', 'Title'); moved('LOCATION', 'Location'); moved('WORK_ARRANGEMENT', 'Remote / onsite');
    if (before.PAY != null && now.PAY != null && Math.abs(now.PAY - before.PAY) >= 1000) out.push({ field: 'Pay', before: '$' + Math.round(before.PAY / 1000) + 'k', after: '$' + Math.round(now.PAY / 1000) + 'k' });
    if (before.SCORE != null && now.SCORE != null && Math.abs(now.SCORE - before.SCORE) >= SCORE_MOVE) out.push({ field: 'Score', before: before.SCORE, after: now.SCORE });
    if (now.REPOSTED && now.REPOSTED !== before.REPOSTED) out.push({ field: 'Posting', before: before.REPOSTED || 'original', after: 'reposted ' + day(now.REPOSTED) });
    if (/^CLOSED/i.test(before.LIVENESS) && now.LIVENESS && !/^CLOSED/i.test(now.LIVENESS)) out.push({ field: 'Posting', before: before.LIVENESS, after: now.LIVENESS });
    moved('CONTACT', 'Recruiter contact'); moved('APP_STATUS', 'Application status');
    return out;
  }
  /** Decision rule for one row: hidden from default views, or back with a reason. */
  function rule(r, ru, score) {
    var d = decision(r, ru); if (!d) return { decided: false, hidden: false };
    if (d.state === 'NOT_SAVED') return { decided: true, hidden: false, back: 'NOT_SAVED', d: d };
    var ch = d.master && !ru ? [] : changes(r, ru, score);
    if (ch.length) return { decided: true, hidden: false, back: 'CHANGED', changes: ch, d: d };
    return { decided: true, hidden: true, d: d };
  }
  /** Same-identity guard for a second decision: "Already decided: <decision>, <date>". */
  function alreadyDecided(r, ru) { var d = decision(r, ru); if (!d || d.state === 'NOT_SAVED') return null; return { kind: d.kind, label: LABEL[d.kind] || d.kind, date: day(d.at) }; }
  var api = { DECIDING: DECIDING, saveState: saveState, decision: decision, snapshot: snapshot, changes: changes, rule: rule, alreadyDecided: alreadyDecided };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PipelineActNow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
