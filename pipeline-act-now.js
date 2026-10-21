/* Act Now + decision rule (Simplify plan PR 1; Tim 2026-10-20 19:39-19:43 ET).
   Act Now: up to 10 roles to act on first: scored, Director-level and up, US, not Memphis, not decided. Shield AI is pinned
   first, then score (high to low), then newest. An estimated salary counts as pay.
   Decision rule: once Tim decides (Applied, Decline, or any deciding ruling), the role leaves every default view at once and
   shows as pending while the write runs, so it cannot be decided twice. It comes back only when
     a) something material changed after the decision (title, location, pay, posting reopened/reposted, score moved 10+), or
     b) the decision did not save (the Writer refused it, or the result stayed unknown); then "Decision not saved, tap to retry"
        resends the same request (same requestId), so a retry can never record a second decision.
   "Later" is not a decision: it hides the role here for 3 days on this device.
   Pure functions (Node-testable) plus html(); pipeline.html supplies the row accessors and wires the buttons. */
(function (root) {
  'use strict';
  var LIMIT = 10, SNOOZE_DAYS = 3, SCORE_MOVE = 10;
  var DECIDING = { APPLIED: 1, DECLINE: 1, REJECTED_BY_EMPLOYER: 1, CLOSED_DEAD: 1, DUPLICATE: 1, INVALID_DISCOVERY: 1 };
  var DECIDED_BUCKETS = { APPLIED: 1, DECLINED_BY_TIM: 1, REJECTED_BY_EMPLOYER: 1, REJECTED: 1, CLOSED_DEAD: 1, DUPLICATE: 1, INVALID_DISCOVERY: 1 };
  var DECLINE_REASONS = [
    { k: 'pay', label: 'Pay', code: 'PAY_BELOW_FLOOR' }, { k: 'location', label: 'Location', code: 'LOCATION' },
    { k: 'level', label: 'Level', code: 'LEVEL_MISMATCH' }, { k: 'fit', label: 'Fit', code: 'FIT' }, { k: 'other', label: 'Other', code: 'TIM_EXPLICIT_DECLINE' }];
  var LEVEL_RE = /\b(director|head of|vice president|vp|svp|evp|chief|general manager|plant manager|site (leader|lead|director)|senior director)\b/i;
  var NON_US_RE = /\b(canada|mexico|uk|united kingdom|germany|india|china|japan|korea|ireland|netherlands|poland|brazil|singapore|australia|france|italy|spain|israel|ontario|quebec|british columbia)\b/i;
  var LABEL = { APPLIED: 'Applied', DECLINE: 'Declined', REJECTED_BY_EMPLOYER: 'Rejected by employer', CLOSED_DEAD: 'Closed', DUPLICATE: 'Duplicate', INVALID_DISCOVERY: 'Invalid' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function day(ts) { return String(ts || '').slice(0, 10); }

  /** The save state of Tim's ruling, from the request's own status (never a timer). */
  function saveState(ru) {
    if (!ru) return '';
    var s = ru.writeStatus || (ru.receipt ? 'READBACK_PENDING' : 'LOCAL_DRAFT');
    if (ru.outbox && ru.outbox.auto && s !== 'VERIFIED' && s !== 'READBACK_PENDING') return 'PENDING';   // REV-131: the outbox is still resending it
    if (s === 'WRITE_FAILED' || s === 'RESULT_UNKNOWN' || (ru.error && s !== 'VERIFIED' && s !== 'READBACK_PENDING')) return 'NOT_SAVED';
    if (s === 'VERIFIED' || s === 'READBACK_PENDING' || s === 'READBACK_UNCONFIRMED') return 'SAVED';
    if (s === 'LOCAL_DRAFT') return 'NOT_SAVED';
    return 'PENDING';   // SUBMITTING and any in-flight state
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
  /** Decision rule for one row: hidden from default views, or back with a reason chip. */
  function rule(r, ru, score) {
    var d = decision(r, ru); if (!d) return { decided: false, hidden: false };
    if (d.state === 'NOT_SAVED') return { decided: true, hidden: false, back: 'NOT_SAVED', d: d };
    var ch = d.master && !ru ? [] : changes(r, ru, score);
    if (ch.length) return { decided: true, hidden: false, back: 'CHANGED', changes: ch, d: d };
    return { decided: true, hidden: true, d: d };
  }
  function snoozed(snoozes, id, now) { var t = snoozes && snoozes[id]; return !!t && now - t < SNOOZE_DAYS * 864e5; }
  function eligible(r, ctx) {
    var loc = String(r.LOCATION || '');
    if (/memphis/i.test(loc) || NON_US_RE.test(loc)) return false;
    if (!LEVEL_RE.test(String(r.TITLE || ''))) return false;
    return !!ctx.fitMeasured(r) && ctx.score(r) != null;
  }
  function shield(r) { return /shield\s*ai/i.test(String(r.COMPANY || '')); }
  /** Act Now list + the counts under it. rows = distinct live roles. */
  function pick(rows, ctx) {
    var now = ctx.now || Date.now(), out = [], decided = 0, unscored = 0, rest = 0;
    rows.forEach(function (r) {
      var ru = ctx.ruling(r), sc = ctx.score(r), ru2 = rule(r, ru, sc);
      if (ru2.decided) decided++;
      if (ru2.hidden) return;
      if (!ru2.decided && !ctx.fitMeasured(r)) unscored++;
      if (ru2.back) { out.push({ r: r, score: sc, rule: ru2 }); return; }
      if (snoozed(ctx.snoozes, r.id, now) || !eligible(r, ctx)) { rest++; return; }
      out.push({ r: r, score: sc, rule: ru2 });
    });
    out.sort(function (a, b) {
      var ba = a.rule.back ? 0 : 1, bb = b.rule.back ? 0 : 1; if (ba !== bb) return ba - bb;   // unsaved / changed first: they need Tim
      var sa = shield(a.r) ? 0 : 1, sb = shield(b.r) ? 0 : 1; if (sa !== sb) return sa - sb;
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return (b.r.dateAdded ? b.r.dateAdded.getTime() : 0) - (a.r.dateAdded ? a.r.dateAdded.getTime() : 0);
    });
    var shown = out.slice(0, LIMIT);
    return { items: shown, counts: { decided: decided, unscored: unscored, everythingElse: Math.max(0, rows.length - decided - shown.length) } };
  }
  /** Same-identity guard for a second decision: "Already decided: <decision>, <date>". */
  function alreadyDecided(r, ru) { var d = decision(r, ru); if (!d || d.state === 'NOT_SAVED') return null; return { kind: d.kind, label: LABEL[d.kind] || d.kind, date: day(d.at) }; }
  function payText(r, ctx) {
    if (r.compMid == null) return 'Pay unknown';
    var est = /ESTIMATE/i.test(String((r.payload || {}).SALARY_BASIS || '')) || /EST/.test(String(r.compSource || ''));
    return '$' + Math.round(r.compMid / 1000) + 'k' + (est ? ' est.' : ' posted');
  }
  function card(it, ctx) {
    var r = it.r, ru = it.rule, url = ctx.posting(r), why = ctx.why ? ctx.why(r) : '';
    var chip = ru.back === 'NOT_SAVED' ? '<button class="an-chip bad" data-an-retry="' + esc(r.id) + '" type="button">Decision not saved · tap to retry</button>'
      : ru.back === 'CHANGED' ? '<span class="an-chip warn" title="' + esc(ru.changes.map(function (c) { return c.field + ': ' + c.before + ' → ' + c.after; }).join('; ')) + '">Changed since your decision: ' + esc(ru.changes.map(function (c) { return c.field + ' ' + c.before + ' → ' + c.after; }).join(' · ')) + '</span>' : '';
    var pending = ru.d && ru.d.state === 'PENDING';
    return '<article class="an-card' + (shield(r) ? ' an-pin' : '') + '" data-an-id="' + esc(r.id) + '">' +
      '<div class="an-top"><b class="an-title">' + esc(r.TITLE) + '</b><span class="an-score" title="Score">' + (it.score == null ? '—' : Math.round(it.score)) + '</span></div>' +
      '<div class="an-sub">' + esc(r.COMPANY) + ' · ' + esc(r.LOCATION || 'Location not stated') + ' · <span class="an-pay">' + esc(payText(r, ctx)) + '</span></div>' +
      (why ? '<div class="an-why">' + esc(why) + '</div>' : '') + chip +
      (ru.decided && ru.back === 'CHANGED' ? '<div class="an-was">Your decision: ' + esc(LABEL[ru.d.kind] || ru.d.kind) + (ru.d.at ? ', ' + esc(day(ru.d.at)) : '') + '</div>' : '') +
      '<div class="an-act">' + (url ? '<a class="an-btn" href="' + esc(url) + '" target="_blank" rel="noopener">Open posting</a>' : '<span class="an-btn off" aria-disabled="true">No posting link</span>') +
      (pending ? '<span class="an-btn off">Saving…</span>' : ru.back === 'NOT_SAVED' ? '' : '<button class="an-btn go" data-an-applied="' + esc(r.id) + '" type="button">Applied</button><button class="an-btn" data-an-decline="' + esc(r.id) + '" type="button">Decline</button><button class="an-btn" data-an-later="' + esc(r.id) + '" type="button">Later</button>') + '</div>' +
      '<div class="an-reasons" data-an-reasons="' + esc(r.id) + '" hidden>' + DECLINE_REASONS.map(function (x) { return '<button class="an-btn" data-an-reason="' + x.k + '" data-an-for="' + esc(r.id) + '" type="button">' + x.label + '</button>'; }).join('') + '</div>' +
      '</article>';
  }
  function html(model, ctx) {
    var c = model.counts, collapsed = !!ctx.collapsed;
    return '<section class="act-now' + (collapsed ? ' an-collapsed' : '') + '" id="act-now" aria-label="Act now">' +
      '<div class="an-head"><h3>Act now <small>(' + model.items.length + ')</small></h3><button class="an-link" data-an-toggle type="button" aria-expanded="' + (!collapsed) + '">' + (collapsed ? 'Show' : 'Hide') + '</button></div>' +
      (collapsed ? '' : (model.items.length ? '<div class="an-cards">' + model.items.map(function (it) { return card(it, ctx); }).join('') + '</div>' : '<div class="an-empty">Nothing scored to act on right now. The scoring lanes are still working the backlog.</div>') +
        '<div class="an-more"><button class="an-link" data-an-more="OPEN" type="button">Everything else (' + c.everythingElse + ')</button><button class="an-link" data-an-more="NEEDS_ANALYSIS" type="button">Unscored (' + c.unscored + ')</button><button class="an-link" data-an-more="DECIDED" type="button">Decided (' + c.decided + ')</button></div>') +
      '</section>';
  }
  /* v1.5 tokens only; 11 px floor (--pe-fs-min); secondary text uses --pe-text-secondary (muted is large-text only). */
  var CSS = '.act-now{margin:0 0 var(--pe-gap);padding:var(--pe-gap);border:var(--pe-border);border-radius:var(--pe-radius);background:var(--pe-plate);color:var(--pe-text-primary)}' +
    '.act-now .an-head{display:flex;align-items:center;justify-content:space-between;gap:var(--pe-gap)}.act-now h3{margin:0;font-size:var(--pe-fs-body);letter-spacing:var(--pe-pill-tracking);text-transform:uppercase}' +
    '.act-now h3 small{color:var(--pe-text-secondary);font-weight:400}' +
    '.an-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:var(--pe-gap);margin-top:var(--pe-gap)}' +
    '.an-card{border:var(--pe-border);border-radius:var(--pe-radius);padding:var(--pe-gap);background:var(--pe-hull);display:flex;flex-direction:column;gap:6px;min-width:0}' +
    '.an-card.an-pin{border-left:var(--pe-bar-card) solid var(--pe-cyan)}.an-top{display:flex;gap:var(--pe-gap);justify-content:space-between;align-items:baseline}' +
    '.an-title{font-size:var(--pe-fs-body);overflow-wrap:anywhere}.an-score{font-variant-numeric:tabular-nums;font-weight:700;min-width:2.2em;text-align:right;font-size:var(--pe-fs-body)}' +
    '.an-sub,.an-why,.an-was{font-size:var(--pe-fs-small);color:var(--pe-text-secondary);overflow-wrap:anywhere}' +
    '.an-act,.an-reasons{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}' +
    '.an-btn{min-height:var(--pe-target-min);min-width:var(--pe-target-min);padding:0 14px;border-radius:var(--pe-radius);border:var(--pe-border);background:var(--pe-raised);color:var(--pe-text-primary);font:inherit;font-size:var(--pe-fs-small);display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer;text-transform:uppercase;letter-spacing:var(--pe-pill-tracking)}' +
    '.an-btn.go{border-color:var(--pe-green)}.an-btn.off{cursor:default;color:var(--pe-text-secondary)}' +
    '.an-chip{align-self:flex-start;font-size:var(--pe-fs-small);padding:4px 10px;border-radius:var(--pe-radius);border:1px solid var(--pe-amber);background:var(--pe-tint-amber);color:var(--pe-text-primary)}' +
    '.an-chip.bad{border-color:var(--pe-red);background:var(--pe-tint-red);min-height:var(--pe-target-min);cursor:pointer;font:inherit;font-size:var(--pe-fs-small)}' +
    '.an-more{display:flex;flex-wrap:wrap;gap:var(--pe-gap);margin-top:var(--pe-gap)}' +
    '.an-link{background:none;border:0;color:var(--pe-cyan);font:inherit;font-size:var(--pe-fs-small);min-height:var(--pe-target-min);cursor:pointer;padding:0 4px}' +
    '.an-empty{color:var(--pe-text-secondary);font-size:var(--pe-fs-small);margin-top:var(--pe-gap)}' +
    '@media (max-width:700px){.an-cards{grid-template-columns:1fr}.act-now{padding:var(--pe-gap) 10px}}';
  var api = { LIMIT: LIMIT, SNOOZE_DAYS: SNOOZE_DAYS, DECLINE_REASONS: DECLINE_REASONS, DECIDING: DECIDING, saveState: saveState, decision: decision, snapshot: snapshot, changes: changes, rule: rule, pick: pick, alreadyDecided: alreadyDecided, html: html, CSS: CSS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PipelineActNow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
